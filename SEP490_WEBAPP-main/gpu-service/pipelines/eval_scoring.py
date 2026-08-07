"""Pure eval scoring helpers — tach tu app.py (giu nguyen hanh vi).

Cac ham tinh diem/latency/confidence + timing streamer, thuan (nhan tham so).
"""
import re
import json
import time
import torch
from constants.prompts import (  # gom hang so
    DEFAULT_SOCRATIC_SYSTEM,
    SOCRATIC_JUDGE_SYSTEM_BATCH,
    JUDGE_REFERENCE_POLICY,
)
from constants.config import (
    BATCH_SIZE,
    DEFAULT_JUDGE_MODEL,
    _CRITERIA_KEYS,
    _SHORT_TO_FULL,
    EVAL_STAGES,
    EVAL_STAGE_RANGES,
)


def _compute_confidence(criteria: dict) -> dict:
    """
    Tính confidence proxy từ 1 lần judge duy nhất.
    Dựa trên độ đồng đều điểm trong từng nhóm:
    std thấp → judge nhất quán → confidence cao.
    """
    import statistics

    groups = {
        "A": ["A1", "A2", "A3"],
        "B": ["B1", "B2"],
        "C": ["C1", "C2", "C3"],
        "D": ["D1", "D2"],
    }

    group_confidences = {}
    for g, keys in groups.items():
        scores = [criteria.get(k, 0.0) for k in keys if k in criteria]
        if len(scores) < 2:
            group_confidences[g] = 1.0
            continue
        std = statistics.stdev(scores)
        conf = max(0.0, 1.0 - (std / 2.5))
        group_confidences[g] = round(conf, 3)

    overall_confidence = round(
        sum(group_confidences.values()) / len(group_confidences), 3
    )

    return {
        "overall": overall_confidence,
        "by_group": group_confidences,
        "is_low": overall_confidence < 0.6,
    }







def _zero_scores(reason: str) -> dict:
    return {
        **{k: {"score": None, "reason": reason} for k in _CRITERIA_KEYS},
        "_judge_status": "failed",
        "_judge_error": reason,
    }

def _build_conv_text(idx: int, system_prompt: str, turns: list,
                     reference_answer: str = "", gold_key_points: list | None = None) -> str:
    lines = [f"=== HỘI THOẠI {idx} ===",
             f"[SYSTEM PROMPT]\n{system_prompt}",
             "[HỘI THOẠI]"]
    for t in turns:
        lines.append(f"Học sinh: {t['user']}\nGia sư: {t['model_response']}")
    if reference_answer:
        lines.append(
            "[REFERENCE FOR JUDGE ONLY - NEVER SHOWN TO THE MODEL]\n"
            + reference_answer
        )
    if gold_key_points:
        lines.append(
            "[GOLD KEY POINTS FOR JUDGE ONLY]\n"
            + json.dumps(gold_key_points, ensure_ascii=False)
        )
    return "\n\n".join(lines)


def _compute_group_scores_research(criteria: dict) -> dict:
    a1 = criteria.get("A1", 0.0)
    a2 = criteria.get("A2", 0.0)
    a3 = criteria.get("A3", 0.0)
    b1 = criteria.get("B1", 0.0)
    b2 = criteria.get("B2", 0.0)
    c1 = criteria.get("C1", 0.0)
    c2 = criteria.get("C2", 0.0)
    c3 = criteria.get("C3", 0.0)
    d1 = criteria.get("D1", 0.0)
    d2 = criteria.get("D2", 0.0)

    # RP4 v4 research-primary outcomes. Keep knowledge and Socratic behaviour
    # separate so style or machine-dependent latency cannot compensate for a
    # factual or pedagogical failure.
    knowledge = b1
    socratic_raw = (a1 + a2 + a3) / 3.0
    # A1 is a non-compensatory guardrail. Directly revealing the answer cannot
    # be offset by strong style/adaptation scores in the Socratic outcome.
    socratic = min(socratic_raw, 1.0) if a1 <= 1.0 else socratic_raw

    return {
        "knowledge": round(knowledge, 3),
        "socratic": round(socratic, 3),
        "socratic_uncapped": round(socratic_raw, 3),
        "socratic_cap_applied": (a1 <= 1.0),
        "answer_withholding_violation": (a1 <= 1.0),
        "secondary": {
            "grade_level": round(b2, 3),
            "robustness": round(c1, 3),
            "coherence": round(c2, 3),
            "tone": round(c3, 3),
            "hallucination": round(d1, 3),
        },
        "operational": {"latency_score_exploratory": round(d2, 3)},
        # No weighted A/B/C/D or Overall is produced for new research runs.
        # Those historical coefficients had no externally validated basis.
        "exploratory_overall": None,
        "group_a": None,
        "group_b": None,
        "group_c": None,
        "group_d": None,
        "overall": None,
        "a1_hard_constraint_triggered": (a1 <= 1.0),
    }

# ── Replay conversation với model ─────────────────────────────────────
class _FirstTokenTimingStreamer:
    """Record the first generated-token time without changing decoded output."""

    def __init__(self):
        self.first_token_at = None
        self._prompt_seen = False

    def put(self, value):
        # Decoder-only generate() first sends the complete prompt, then one token.
        try:
            token_count = int(value.numel())
        except Exception:
            token_count = 1
        if not self._prompt_seen and token_count > 1:
            self._prompt_seen = True
            return
        if self.first_token_at is None:
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
            self.first_token_at = time.perf_counter()

    def end(self):
        return None

def _score_latency(avg_ms: float) -> float:
    if avg_ms <= 2000:  return 5.0
    if avg_ms <= 4000:  return 4.0
    if avg_ms <= 7000:  return 3.0
    if avg_ms <= 12000: return 2.0
    return 1.0

def _compute_group_scores(criteria: dict) -> dict:
    a1 = criteria.get("A1", 0.0)
    a2 = criteria.get("A2", 0.0)
    a3 = criteria.get("A3", 0.0)
    b1 = criteria.get("B1", 0.0)
    b2 = criteria.get("B2", 0.0)
    c1 = criteria.get("C1", 0.0)
    c2 = criteria.get("C2", 0.0)
    c3 = criteria.get("C3", 0.0)
    d1 = criteria.get("D1", 0.0)
    d2 = criteria.get("D2", 0.0)

    # Compatibility helper for older call sites. New runs expose only K, S and
    # the individual criteria; unvalidated weighted composites are retired.
    knowledge_k = b1
    socratic_s = (a1 + a2 + a3) / 3.0

    return {
        "knowledge_k": round(knowledge_k, 3),
        "socratic_s": round(socratic_s, 3),
        "knowledge": round(knowledge_k, 3),
        "socratic": round(socratic_s, 3),
        "exploratory_overall": None,
        "group_a": None,
        "group_b": None,
        "group_c": None,
        "group_d": None,
        "overall": None,
        "legacy_overall": None,
        "legacy_only": True,
        "a1_hard_constraint_triggered": (a1 <= 1.0),
    }

# ── Replay conversation với model ─────────────────────────────────────
# Keep raw model output for audit, but evaluate the exact text exposed to the
# student. DeepSeek-R1-style templates can start a hidden thinking block in
# the prompt itself, which leaves a closing </think> tag in decoded output.
def visible_model_response(raw_response: str) -> str:
    text = str(raw_response or "").strip()
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[1]
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"^\s*\[(?:SCAF|HINT|LOGIC_BREAKDOWN|IDENTIFY_INCORRECT_ANSWER|DIRECT_ANSWER|CONCEPT_CLARIFY)\]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text.strip()
