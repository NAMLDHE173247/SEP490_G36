"""Auto-evaluation core — tach tu app.py.

Replay + LLM judge + scoring pipeline (run_auto_evaluation / _run_locked_auto_evaluation)
va cac background eval task. Import chi tu gpu_state + extracted modules + thu vien;
KHONG import tu app (tranh circular import).
"""
import os
import re
import gc
import json
import time
import datetime
import platform
import collections
import urllib.error
import urllib.request
import importlib.metadata
import torch
from unsloth import FastLanguageModel
from huggingface_hub import HfApi

from utils.inference_utils import format_inference_prompt
from utils.locked_eval_protocol import (
    sha256_text,
    paired_integrity,
    stable_json_hash,
    decide_hypotheses,
    normalize_subject,
    operational_summary,
    extract_item_metadata,
    validate_locked_dataset,
    extract_adaptive_metadata,
    validate_adaptive_dataset,
    paired_adaptive_statistics,
    paired_research_statistics,
)
from utils.data_formatting import (
    compute_ngram_metrics,
    compute_question_detection_rate,
    ensure_right_padding,
)
from pipelines.eval_scoring import (
    _zero_scores,
    _build_conv_text,
    _score_latency,
    _compute_group_scores_research,
    _FirstTokenTimingStreamer,
    visible_model_response,
    DEFAULT_SOCRATIC_SYSTEM,
    _CRITERIA_KEYS,
    SOCRATIC_JUDGE_SYSTEM_BATCH,
    JUDGE_REFERENCE_POLICY,
    BATCH_SIZE,
    _SHORT_TO_FULL,
    DEFAULT_JUDGE_MODEL,
    EVAL_STAGES,
    EVAL_STAGE_RANGES,
)

from core import gpu_state
from core.gpu_state import (
    _read_secret,
    EVAL_CHECKPOINT_BASE,
    _save_eval_checkpoint, _load_eval_checkpoint, _update_eval_manifest,
    jobs_db, eval_jobs_db, _judge_context,
    _release_gpu_memory, GPU_EVAL_SLOTS,
    _eval_slot_release,
    _eval_log, _get_api_key,
)


def _openrouter_chat(payload: bytes, api_key: str, x_title: str,
                     extra_headers: dict | None = None, timeout: int = 180) -> dict:
    """Build + gui 1 request toi LLM chat/completions (FPT Cloud, OpenRouter, hoac OpenAI)."""
    raw_base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("OPENROUTER_BASE_URL") or "https://mkp-api.fptcloud.com/v1"
    base_url = raw_base_url.rstrip("/")
    target_url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": x_title,
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        target_url,
        data=payload,
        method="POST",
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def replay_conversation(
    conv: dict,
    model,
    tokenizer,
    max_new_tokens: int = 512,
    protocol_mode: str = "locked_single_turn",
    prompt_variant: str = "P1",
    system_prompt_override: str = "",
    system_prompt_version: str = "",
    item_index: int = 0,
) -> dict:
    messages = conv.get("messages", [])

    item_meta = extract_item_metadata(conv, item_index)
    dataset_system_prompt = next(
        (m.get("content", "") for m in messages if m.get("role") == "system"),
        "",
    )
    if prompt_variant.upper() == "P0":
        system_prompt = ""
        prompt_source = "P0_no_system_prompt"
    elif system_prompt_override:
        system_prompt = system_prompt_override
        prompt_source = "run_config_override"
    elif dataset_system_prompt:
        system_prompt = dataset_system_prompt
        prompt_source = "dataset_system_message"
    else:
        system_prompt = DEFAULT_SOCRATIC_SYSTEM
        prompt_source = "service_default"

    user_turns = [m["content"] for m in messages if m.get("role") == "user"]
    # Multi-turn replay: all user turns are replayed sequentially.
    # The model generates its own response at each turn, building up
    # conversation_history organically without leaking gold assistant answers.
    if not user_turns:
        return {
            **item_meta,
            "system_prompt": system_prompt,
            "turns": [],
            "avg_latency_ms": 0.0,
            "assistant_turns": [],
            "generation_status": "invalid_input",
            "failure_type": "missing_user_message",
            "first_attempt_failed": True,
        }

    turns = []
    assistant_turns = []
    conversation_history = []

    infer_prompt_template = format_inference_prompt

    for user_content in user_turns:
        conversation_history.append({"role": "user", "content": user_content})

        try:
            messages_for_template = []
            if system_prompt:
                messages_for_template.append({"role": "system", "content": system_prompt})
            messages_for_template += conversation_history
            try:
                prompt = tokenizer.apply_chat_template(
                    messages_for_template,
                    tokenize=False,
                    add_generation_prompt=True,
                    enable_thinking=False,
                )
            except TypeError:
                prompt = tokenizer.apply_chat_template(
                    messages_for_template,
                    tokenize=False,
                    add_generation_prompt=True,
                )
        except Exception:
            system_block = f"### System:\n{system_prompt}\n\n" if system_prompt else ""
            prompt = f"{system_block}### Instruction:\n{user_content}\n\n### Response:"

        inputs = tokenizer([prompt], return_tensors="pt").to("cuda")
        input_tokens = int(inputs["input_ids"].shape[-1])
        prompt_hash = sha256_text(system_prompt) if system_prompt else None
        rendered_input_hash = sha256_text(prompt)
        tracker = _FirstTokenTimingStreamer()
        try:
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()
        except Exception:
            pass
        t0 = time.perf_counter()
        generation_status = "success"
        failure_type = None
        output_limit_reached = False
        output_tokens = 0
        raw_response = ""
        try:
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
                do_sample=False,
                streamer=tracker,
            )
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
            completed_at = time.perf_counter()
            generated_ids = outputs[0, input_tokens:]
            output_tokens = int(generated_ids.shape[-1])
            raw_response = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
            response = visible_model_response(raw_response)
            final_token_id = int(generated_ids[-1].item()) if output_tokens else None
            eos_ids = tokenizer.eos_token_id
            if eos_ids is None:
                eos_ids = []
            elif not isinstance(eos_ids, (list, tuple, set)):
                eos_ids = [eos_ids]
            output_limit_reached = output_tokens >= max_new_tokens and final_token_id not in eos_ids
            if not response:
                generation_status = "failed"
                failure_type = "empty_visible_output"
        except Exception as e:
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
            completed_at = time.perf_counter()
            raw_response = ""
            response = ""
            generation_status = "failed"
            failure_type = "generation_error"
            generation_error = str(e)[:500]

        e2e_ms = (completed_at - t0) * 1000
        ttft_ms = (
            (tracker.first_token_at - t0) * 1000
            if tracker.first_token_at is not None
            else None
        )
        decode_ms = max(0.0, e2e_ms - (ttft_ms or e2e_ms))
        tpot_ms = decode_ms / (output_tokens - 1) if output_tokens > 1 and ttft_ms is not None else None
        tokens_per_second = (output_tokens - 1) / (decode_ms / 1000) if output_tokens > 1 and decode_ms > 0 else None
        words = len(response.split())
        words_per_minute = words / (e2e_ms / 60000) if e2e_ms > 0 else None
        characters_per_second = len(response) / (e2e_ms / 1000) if e2e_ms > 0 else None
        try:
            peak_vram_mb = torch.cuda.max_memory_allocated() / (1024 ** 2)
        except Exception:
            peak_vram_mb = None

        turns.append({
            "user": user_content,
            "model_response": response,
            "raw_model_response": raw_response,
            "latency_ms": round(e2e_ms, 1),
            "generation_status": generation_status,
            "failure_type": failure_type,
            "generation_error": generation_error if failure_type == "generation_error" else None,
            "output_limit_reached": output_limit_reached,
            "telemetry": {
                "ttft_ms": round(ttft_ms, 3) if ttft_ms is not None else None,
                "e2e_ms": round(e2e_ms, 3),
                "tpot_ms": round(tpot_ms, 6) if tpot_ms is not None else None,
                "tokens_per_second": round(tokens_per_second, 6) if tokens_per_second is not None else None,
                "tokens_per_minute": round(tokens_per_second * 60, 6) if tokens_per_second is not None else None,
                "words_per_minute": round(words_per_minute, 6) if words_per_minute is not None else None,
                "characters_per_second": round(characters_per_second, 6) if characters_per_second is not None else None,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "peak_vram_allocated_mb": round(peak_vram_mb, 3) if peak_vram_mb is not None else None,
            },
            "prompt_trace": {
                "prompt_variant": prompt_variant.upper(),
                "prompt_version": system_prompt_version or "UNVERSIONED",
                "prompt_source": prompt_source,
                "prompt_applied": bool(system_prompt),
                "system_prompt_hash": prompt_hash,
                "rendered_input_hash": rendered_input_hash,
            },
        })
        assistant_turns.append(response)
        if protocol_mode != "locked_single_turn":
            conversation_history.append({"role": "assistant", "content": response})

    avg_latency = round(sum(t["latency_ms"] for t in turns) / len(turns), 1) if turns else 0.0

    return {
        **item_meta,
        "system_prompt": system_prompt,
        "system_prompt_hash": sha256_text(system_prompt) if system_prompt else None,
        "system_prompt_version": system_prompt_version or "UNVERSIONED",
        "prompt_variant": prompt_variant.upper(),
        "prompt_source": prompt_source,
        "reference_answer": str(conv.get("reference_answer") or ""),
        "gold_key_points": conv.get("gold_key_points") if isinstance(conv.get("gold_key_points"), list) else [],
        "turns": turns,
        "replay_turns": [
            {
                "user": t["user"][:500],
                "model": t["model_response"][:800],
                "raw_model": t["raw_model_response"][:800],
                "latency_ms": t["latency_ms"],
                "telemetry": t["telemetry"],
                "generation_status": t["generation_status"],
                "failure_type": t["failure_type"],
                "output_limit_reached": t["output_limit_reached"],
                "prompt_trace": t["prompt_trace"],
            }
            for t in turns
        ],
        "avg_latency_ms": avg_latency,
        "assistant_turns": assistant_turns,
        "generation_status": turns[0]["generation_status"] if turns else "invalid_input",
        "failure_type": turns[0]["failure_type"] if turns else "missing_user_message",
        "first_attempt_failed": bool(turns and turns[0]["generation_status"] != "success"),
        "output_limit_reached": bool(turns and turns[0]["output_limit_reached"]),
        "telemetry": turns[0]["telemetry"] if turns else {},
        "prompt_trace": turns[0]["prompt_trace"] if turns else {},
    }

def _run_single_replay(job_id, eval_job_id, valid_convs, model, tokenizer,
                       stage_key: str, label: str,
                       max_new_tokens: int = 512,
                       protocol_mode: str = "locked_single_turn",
                       prompt_variant: str = "P1",
                       system_prompt_override: str = "",
                       system_prompt_version: str = "") -> list:
    total = len(valid_convs)
    checkpoint_name = f"{stage_key}_results"
    saved_results = _load_eval_checkpoint(eval_job_id, checkpoint_name, [])
    results = saved_results if isinstance(saved_results, list) else []
    if len(results) > total:
        results = []
    resume_index = len(results)
    _eval_log(job_id, f"[▶️] {label}: {total} conversations...")
    if resume_index:
        _eval_log(job_id, f"[♻️] {label}: tiếp tục từ {resume_index + 1}/{total}; giữ {resume_index} kết quả đã checkpoint.")
    model.eval()
    FastLanguageModel.for_inference(model)
    for idx in range(resume_index, total):
        conv = valid_convs[idx]
        _eval_log(job_id, f"  [{label} {idx+1}/{total}]")
        result = replay_conversation(
            conv,
            model,
            tokenizer,
            max_new_tokens=max_new_tokens,
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_override=system_prompt_override,
            system_prompt_version=system_prompt_version,
            item_index=idx,
        )
        results.append(result)
        _save_eval_checkpoint(eval_job_id, checkpoint_name, results)
        last_turn = result["turns"][-1] if result["turns"] else None
        _eval_progress(
            eval_job_id, stage_key, f"{idx+1}/{total}",
            current=idx+1, total=total,
            sample={
                "index": idx,
                "item_id": result.get("item_id"),
                "subject": result.get("subject"),
                "instruction": result["turns"][0]["user"] if result["turns"] else "",
                "ft_answer": last_turn["model_response"] if last_turn else None,
            }
        )
    return results

def _summarize(per_conv_results: list) -> dict:
    valid = [r for r in per_conv_results if r is not None]
    score_bearing_statuses = {"success", "not_required_generation_failure_scored_zero"}
    scored = [
        r for r in valid
        if r.get("judge_status") in score_bearing_statuses
        and r.get("criteria_scores", {}).get("B1") is not None
    ]
    n = max(1, len(scored))

    def _avg(key_path):
        keys = key_path.split(".")
        vals = []
        for r in scored:
            v = r
            try:
                for k in keys: v = v[k]
                vals.append(float(v))
            except Exception: pass
        return round(sum(vals) / max(1, len(vals)), 3) if vals else 0.0

    criteria = {k: _avg(f"criteria_scores.{k}")
                for k in ["A1","A2","A3","B1","B2","C1","C2","C3","D1","D2"]}
    groups   = {k: _avg(f"group_scores.{k}") for k in ["knowledge", "socratic"]}
    non_sc   = {
        "bleu":                    _avg("non_scoring.bleu"),
        "rouge_l":                 _avg("non_scoring.rouge_l"),
        "question_detection_rate": _avg("non_scoring.question_detection_rate"),
    }
    avg_lat  = _avg("avg_latency_ms")
    avg_input_tokens = _avg("input_tokens")
    avg_output_tokens = _avg("output_tokens")
    avg_total_tokens = _avg("total_tokens")
    confidence_values = [
        (r.get("confidence") or {}).get("overall") for r in scored
        if (r.get("confidence") or {}).get("overall") is not None
    ]
    avg_conf = round(sum(confidence_values) / len(confidence_values), 3) if confidence_values else None
    low_conf = sum(1 for r in scored if (r.get("confidence") or {}).get("is_low", False))

    return {
        "knowledge":            groups["knowledge"],
        "socratic":             groups["socratic"],
        "primary_outcomes": {
            "knowledge": groups["knowledge"],
            "socratic": groups["socratic"],
        },
        "secondary_metrics": {
            "grade_level": criteria["B2"],
            "robustness": criteria["C1"],
            "coherence": criteria["C2"],
            "tone": criteria["C3"],
            "hallucination": criteria["D1"],
        },
        "answer_withholding_violation_rate": round(
            sum(1 for r in scored if r.get("criteria_scores", {}).get("A1", 5.0) <= 1.0)
            / n,
            3,
        ),
        "exploratory_overall":  None,
        "overall":              None,
        "group_a":              None,
        "group_b":              None,
        "group_c":              None,
        "group_d":              None,
        "criteria":             criteria,
        "avg_latency_ms":       avg_lat,
        "avg_input_tokens":     avg_input_tokens,
        "avg_output_tokens":    avg_output_tokens,
        "avg_total_tokens":     avg_total_tokens,
        "total_input_tokens":   sum(int(r.get("telemetry", {}).get("input_tokens", r.get("input_tokens", 0)) or 0) for r in valid),
        "total_output_tokens":  sum(int(r.get("telemetry", {}).get("output_tokens", r.get("output_tokens", 0)) or 0) for r in valid),
        "total_tokens":         sum(int((r.get("telemetry", {}).get("input_tokens", 0) or 0) + (r.get("telemetry", {}).get("output_tokens", 0) or 0)) for r in valid),
        "non_scoring":          non_sc,
        "max_possible":         5,
        "avg_confidence":       avg_conf,
        "low_confidence_count": low_conf,
        "planned_items":        len(valid),
        "scored_items":         len(scored),
        "judge_failure_count":  sum(1 for r in valid if r.get("judge_status") == "failed"),
        "generation_failure_scored_zero_count": sum(
            1 for r in valid if r.get("judge_status") == "not_required_generation_failure_scored_zero"
        ),
        "operational":          operational_summary(valid),
    }

# ── Gọi API cho 1 batch (tối đa BATCH_SIZE conversations) ─────────────
class _JudgeResponseError(ValueError):
    """The provider replied, but its rubric payload is not valid JSON/data."""


class _JudgeRateLimitError(RuntimeError):
    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class _JudgeServerError(RuntimeError):
    """The provider backend returned HTTP 5xx or Cloudflare 524 gateway timeout."""


def _parse_judge_reply(reply: str, expected_count: int) -> list:
    """Extract and strictly validate the first JSON array in a Judge reply."""
    if not isinstance(reply, str) or not reply.strip():
        raise _JudgeResponseError("Judge trả về nội dung rỗng")

    decoder = json.JSONDecoder()
    parsed = None
    last_error = None

    clean_reply = reply.strip()
    if "```" in clean_reply:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_reply, re.IGNORECASE)
        if match:
            clean_reply = match.group(1).strip()

    # 1. Look for JSON Array '['
    for match in re.finditer(r"\[", clean_reply):
        try:
            candidate, _ = decoder.raw_decode(clean_reply[match.start():])
            if isinstance(candidate, list):
                parsed = candidate
                break
        except json.JSONDecodeError as exc:
            last_error = exc

    # 2. If no list found, look for JSON Object '{'
    if parsed is None:
        for match in re.finditer(r"\{", clean_reply):
            try:
                candidate, _ = decoder.raw_decode(clean_reply[match.start():])
                if isinstance(candidate, dict):
                    for key in ("evaluations", "results", "conversations", "data", "items", "scores", "suggestions"):
                        if isinstance(candidate.get(key), list):
                            parsed = candidate[key]
                            break
                    if parsed is not None:
                        break
                    if expected_count == 1:
                        if "conv_index" not in candidate:
                            candidate["conv_index"] = 0
                        parsed = [candidate]
                        break
            except json.JSONDecodeError as exc:
                last_error = exc

    if parsed is None:
        if last_error is not None:
            raise _JudgeResponseError(
                "JSON Judge sai cú pháp "
                f"(line {last_error.lineno}, column {last_error.colno}, "
                f"char {last_error.pos}; response_chars={len(reply)}). Snippet: '{clean_reply[:200]}'"
            ) from last_error
        raise _JudgeResponseError(f"Judge không trả về JSON array/object. Snippet: '{clean_reply[:200]}'")

    if len(parsed) != expected_count:
        raise _JudgeResponseError(
            f"Judge trả về {len(parsed)}/{expected_count} conversations"
        )

    result = [None] * expected_count
    for item in parsed:
        if not isinstance(item, dict):
            raise _JudgeResponseError("Một phần tử Judge không phải JSON object")
        idx = item.get("conv_index")
        if isinstance(idx, bool) or not isinstance(idx, int) or not 0 <= idx < expected_count:
            if expected_count == 1:
                idx = 0
            else:
                raise _JudgeResponseError(f"conv_index không hợp lệ: {idx!r}")
        if result[idx] is not None:
            raise _JudgeResponseError(f"conv_index bị lặp: {idx}")

        missing = [key for key in _CRITERIA_KEYS if key not in item]
        if missing:
            raise _JudgeResponseError(
                f"Conversation {idx} thiếu tiêu chí: {', '.join(missing)}"
            )

        scores = {}
        for key in _CRITERIA_KEYS:
            criterion = item[key]
            if not isinstance(criterion, dict):
                raise _JudgeResponseError(f"Conversation {idx}: {key} không phải object")
            score = criterion.get("score")
            if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= float(score) <= 5:
                raise _JudgeResponseError(
                    f"Conversation {idx}: score của {key} không hợp lệ: {score!r}"
                )
            reason = criterion.get("reason")
            if not isinstance(reason, str) or not reason.strip():
                raise _JudgeResponseError(f"Conversation {idx}: {key} thiếu reason")
            scores[key] = {"score": float(score), "reason": reason.strip()}
        result[idx] = scores

    if any(item is None for item in result):
        missing_indices = [i for i, item in enumerate(result) if item is None]
        raise _JudgeResponseError(f"Judge thiếu conv_index: {missing_indices}")
    return result


def _request_judge_reply(batch_replays: list, judge_model: str, api_key: str,
                         strict_retry: bool = False) -> tuple[str, dict]:
    parts = [
        _build_conv_text(
            i,
            replay["system_prompt"],
            replay["turns"],
            replay.get("reference_answer", ""),
            replay.get("gold_key_points", []),
        )
        for i, replay in enumerate(batch_replays)
    ]
    batch_text = "\n\n".join(parts)
    retry_contract = ""
    if strict_retry:
        retry_contract = (
            "\n\nOUTPUT CONTRACT BẮT BUỘC: Trả về đúng một JSON array hợp lệ, "
            f"đủ chính xác {len(batch_replays)} phần tử với conv_index từ 0 đến "
            f"{len(batch_replays) - 1}. Dùng dấu nháy kép JSON, escape dấu nháy "
            "và xuống dòng bên trong reason; không markdown, không chú thích, không cắt ngắn."
        )

    raw_base_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("OPENROUTER_BASE_URL") or "https://mkp-api.fptcloud.com/v1"
    is_openrouter = "openrouter.ai" in raw_base_url.lower()

    effective_judge_model = judge_model
    if not is_openrouter:
        effective_judge_model = "DeepSeek-V4-Flash"
    elif effective_judge_model in ("DeepSeek-V4-Flash", "", None):
        effective_judge_model = "google/gemini-2.5-flash"

    payload_dict = {
        "model": effective_judge_model,
        "max_tokens": 1500 * len(batch_replays),
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SOCRATIC_JUDGE_SYSTEM_BATCH + JUDGE_REFERENCE_POLICY + retry_contract},
            {"role": "user", "content": batch_text},
        ],
    }
    if is_openrouter:
        payload_dict["provider"] = {"allow_fallbacks": True}

    payload = json.dumps(payload_dict).encode("utf-8")
    try:
        response_data = _openrouter_chat(
            payload, api_key, "SEP490 AIFC Evaluation",
            {"X-OpenRouter-Metadata": "enabled"} if is_openrouter else None,
        )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:1000]
        if exc.code == 429:
            retry_header = exc.headers.get("Retry-After") if exc.headers else None
            try:
                retry_after = float(retry_header) if retry_header else None
            except (TypeError, ValueError):
                retry_after = None
            raise _JudgeRateLimitError(f"OpenRouter Judge HTTP 429: {body}", retry_after) from exc
        if exc.code in (401, 403):
            raise RuntimeError(
                f"OpenRouter Judge HTTP {exc.code} (API Key hết hạn ngạch/limit): {body}. "
                "Vui lòng nạp thêm credit / cập nhật OPENROUTER_API_KEY mới để Resume tiếp tục từ checkpoint mà không mất token."
            ) from exc
        if exc.code >= 500 or exc.code in (500, 502, 503, 504, 524):
            raise _JudgeServerError(f"OpenRouter Judge HTTP {exc.code} (Server/Gateway Timeout): {body}") from exc
        raise RuntimeError(f"OpenRouter Judge HTTP {exc.code}: {body}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"OpenRouter trả về response envelope sai JSON: {exc}") from exc

    choices = response_data.get("choices") or []
    if not choices:
        provider_error = response_data.get("error") or "missing choices"
        if isinstance(provider_error, dict) and int(provider_error.get("code") or 0) == 429:
            raise _JudgeRateLimitError(f"OpenRouter Judge rate limited: {provider_error}")
        raise RuntimeError(f"OpenRouter Judge không có kết quả: {provider_error}")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if content is None or (isinstance(content, str) and not content.strip()):
        content = msg.get("reasoning_content")
    if content is None or (isinstance(content, str) and not content.strip()):
        content = choices[0].get("text", "")
    return str(content or "").strip(), response_data


def _judge_batch_resilient(batch_replays: list, judge_model: str,
                           api_key: str, depth: int = 0) -> list:
    """Retry malformed JSON, then split the batch so one bad reply cannot kill the run."""
    parse_errors = []
    for attempt in range(2):
        reply = ""
        response_data = {}
        for rate_attempt in range(6):
            try:
                reply, response_data = _request_judge_reply(
                    batch_replays, judge_model, api_key, strict_retry=(attempt > 0)
                )
                break
            except _JudgeRateLimitError as exc:
                if rate_attempt == 5:
                    raise
                delay = min(120.0, exc.retry_after or (5.0 * (2 ** rate_attempt)))
                print(
                    f"[~] Judge 429 rate limit; giữ checkpoint và thử lại sau "
                    f"{delay:.0f}s ({rate_attempt + 1}/6)."
                )
                time.sleep(delay)
            except _JudgeServerError as exc:
                err_str = str(exc)
                if rate_attempt >= 2:
                    parse_errors.append(f"Judge HTTP server/gateway error after retries: {err_str}")
                    print(f"[!] Judge HTTP server error (2/2 retries): {err_str}")
                    break
                delay = 3.0 * (rate_attempt + 1)
                print(
                    f"[~] Judge 5xx/524 server timeout ({err_str}); "
                    f"thử lại sau {delay:.0f}s ({rate_attempt + 1}/2)..."
                )
                time.sleep(delay)
            except Exception as exc:
                err_str = str(exc)
                is_timeout = (
                    isinstance(exc, (TimeoutError, urllib.error.URLError, _JudgeServerError))
                    or "timed out" in err_str.lower()
                    or "timeout" in err_str.lower()
                    or "524" in err_str
                    or "504" in err_str
                    or "502" in err_str
                    or "503" in err_str
                )
                if not is_timeout:
                    raise
                if rate_attempt == 5:
                    parse_errors.append(f"Judge HTTP timeout after 6 attempts: {err_str}")
                    print(f"[!] Judge HTTP request timeout (6/6 attempts): {err_str}")
                    break
                delay = min(60.0, 5.0 * (2 ** rate_attempt))
                print(
                    f"[~] Judge HTTP request timed out ({err_str}); "
                    f"thử lại sau {delay:.0f}s ({rate_attempt + 1}/6)..."
                )
                time.sleep(delay)
        try:
            parsed = _parse_judge_reply(reply, len(batch_replays))
            for item in parsed:
                item["_judge_status"] = "success"
                item["_judge_response_id"] = response_data.get("id")
                item["_effective_judge_model"] = response_data.get("model")
                item["_judge_router_metadata"] = response_data.get("openrouter_metadata")
            return parsed
        except _JudgeResponseError as exc:
            parse_errors.append(str(exc))
            print(
                f"[!] Judge JSON invalid: batch={len(batch_replays)} "
                f"attempt={attempt + 1}/2 depth={depth}: {exc}"
            )

    if len(batch_replays) > 1:
        midpoint = len(batch_replays) // 2
        print(
            f"[~] Judge JSON vẫn lỗi sau retry; tách batch "
            f"{len(batch_replays)} -> {midpoint}+{len(batch_replays) - midpoint}"
        )
        return (
            _judge_batch_resilient(batch_replays[:midpoint], judge_model, api_key, depth + 1)
            + _judge_batch_resilient(batch_replays[midpoint:], judge_model, api_key, depth + 1)
        )

    raise _JudgeResponseError("; ".join(parse_errors[-2:]))


def _judge_batch(batch_replays: list, judge_model: str) -> list:
    """
    batch_replays: list of replay dict (system_prompt, turns, ...)
    Trả về list raw_scores dict theo đúng thứ tự.
    """
    api_key = _get_api_key()
    if not api_key:
        return [_zero_scores("no_api_key")] * len(batch_replays)

    try:
        return _judge_batch_resilient(batch_replays, judge_model, api_key)
    except Exception as exc:
        print(f"[!] Batch judge error: {exc}")
        # A provider/JSON failure is not a score of zero. Abort this eval so it
        # is visibly FAILED and cannot be auto-pinned in the leaderboard.
        raise RuntimeError(f"Judge failed after retry/split: {str(exc)[:500]}") from exc


def _audit_a1_consistency(replay: dict, raw_scores: dict) -> None:
    """Prevent A2/A3 defects from incorrectly triggering the A1 hard cap.

    This conservative guard only applies when every generated tutor turn is a
    question and none contains a strong answer-disclosure marker. It does not
    award scaffolding/adaptation points; those remain entirely Judge-scored.
    """
    responses = [str(x).strip() for x in replay.get("assistant_turns", []) if str(x).strip()]
    if not responses or not all(text.endswith("?") for text in responses):
        return

    disclosure_markers = (
        "đáp án là", "kết quả là", "nghiệm là", "vậy x =", "suy ra x =",
        "\\boxed", "therefore", "do đó ta được", "vì vậy ta được",
    )
    normalized = "\n".join(responses).lower()
    if any(marker in normalized for marker in disclosure_markers):
        return

    a1 = raw_scores.get("A1_answer_withholding", {})
    try:
        current = float(a1.get("score", 0))
    except (TypeError, ValueError):
        current = 0.0
    if current < 4.0:
        a1["score"] = 4.0
        old_reason = str(a1.get("reason", "")).strip()
        a1["reason"] = (
            "A1 consistency audit: mọi lượt gia sư đều là câu hỏi và không tiết lộ đáp án. "
            "Chất lượng câu hỏi được giữ để chấm riêng tại A2/A3."
            + (f" Judge ban đầu: {old_reason}" if old_reason else "")
        )
        raw_scores["A1_answer_withholding"] = a1

# ── Hàm judge chính — thay thế _run_single_judge ──────────────────────
def _run_batch_judge(job_id, eval_job_id, valid_convs, replay_results,
                     judge_model: str, stage_key: str, label: str) -> list:
    """
    Drop-in replacement cho _run_single_judge.
    Trả về per_conv_results (list, có thể chứa None cho conv rỗng).
    """
    import statistics

    total = len(replay_results)
    checkpoint_name = f"{stage_key}_results"
    saved_results = _load_eval_checkpoint(eval_job_id, checkpoint_name, [])
    per_conv_results = saved_results if isinstance(saved_results, list) else []
    valid_checkpoint_lengths = {0, total}
    valid_checkpoint_lengths.update(range(BATCH_SIZE, total, BATCH_SIZE))
    if len(per_conv_results) not in valid_checkpoint_lengths:
        per_conv_results = []
    _eval_log(job_id, f"[⚖️] {label}: {total} conversations | batch={BATCH_SIZE} | judge={judge_model}...")
    if per_conv_results:
        _eval_log(job_id, f"[♻️] {label}: giữ {len(per_conv_results)}/{total} kết quả Judge đã checkpoint.")
    _eval_progress(eval_job_id, stage_key, "Đang gọi LLM judge (batch)...")

    # Zip cùng valid_convs để lấy original assistant turns cho ngram
    paired = list(zip(valid_convs, replay_results))
    chunks = [paired[i:i+BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]

    for chunk_idx, chunk in enumerate(chunks):
        start_global = chunk_idx * BATCH_SIZE
        if start_global < len(per_conv_results):
            continue
        _eval_log(job_id, f"  [Batch {chunk_idx+1}/{len(chunks)}] conv {start_global+1}–{start_global+len(chunk)}")
        _eval_progress(
            eval_job_id,
            stage_key,
            f"Batch {chunk_idx+1}/{len(chunks)}",
            current=start_global,
            total=total,
        )

        replays_in_chunk = [r for _, r in chunk]

        # Lọc conv None (replay thất bại) — không gửi API, trả None luôn
        valid_in_chunk = [
            (i, r)
            for i, r in enumerate(replays_in_chunk)
            if r is not None and r.get("generation_status") == "success"
        ]
        batch_raw = [None] * len(chunk)

        if valid_in_chunk:
            idxs, replays = zip(*valid_in_chunk)
            scores_list = _judge_batch(list(replays), judge_model)
            for local_i, score in zip(idxs, scores_list):
                batch_raw[local_i] = score

        # Map từng conv trong chunk → per_conv_results
        for local_i, ((conv, replay), raw_scores) in enumerate(zip(chunk, batch_raw)):
            if replay is None:
                per_conv_results.append(None)
                continue

            if raw_scores is None:
                # Locked missing-output policy: a model-generation failure has
                # zero tutoring utility, so it receives 0 on every quality
                # criterion and remains in the paired denominator.  This is
                # distinct from a judge/API failure, which is missing
                # measurement and must never be silently converted to zero.
                failure_criteria = {
                    key: 0.0 for key in ("A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "D1", "D2")
                }
                per_conv_results.append({
                    "item_id": replay.get("item_id"),
                    "subject": replay.get("subject", "UNKNOWN"),
                    "conv_index": start_global + local_i,
                    "num_turns": len(replay.get("turns", [])),
                    "avg_latency_ms": replay.get("avg_latency_ms", 0),
                    "replay_turns": replay.get("replay_turns", []),
                    "criteria_scores": failure_criteria,
                    "group_scores": _compute_group_scores_research(failure_criteria),
                    "criteria_reasons": {
                        key: "Pre-specified score 0: model did not produce a valid response."
                        for key in failure_criteria
                    },
                    "confidence": None,
                    "non_scoring": {},
                    "generation_status": replay.get("generation_status", "failed"),
                    "failure_type": replay.get("failure_type") or "generation_failed",
                    "first_attempt_failed": True,
                    "output_limit_reached": replay.get("output_limit_reached", False),
                    "telemetry": replay.get("telemetry", {}),
                    "input_tokens": int(replay.get("telemetry", {}).get("input_tokens", 0) or 0),
                    "output_tokens": int(replay.get("telemetry", {}).get("output_tokens", 0) or 0),
                    "total_tokens": int(replay.get("telemetry", {}).get("input_tokens", 0) or 0)
                                    + int(replay.get("telemetry", {}).get("output_tokens", 0) or 0),
                    "prompt_trace": replay.get("prompt_trace", {}),
                    "reference_trace": {
                        "present": bool(replay.get("reference_answer") or replay.get("gold_key_points")),
                        "reference_answer_hash": sha256_text(replay.get("reference_answer", ""))
                            if replay.get("reference_answer") else None,
                        "gold_key_points_hash": stable_json_hash(replay.get("gold_key_points", []))
                            if replay.get("gold_key_points") else None,
                    },
                    "reference_answer": replay.get("reference_answer", ""),
                    "gold_key_points": replay.get("gold_key_points", []),
                    "judge_status": "not_required_generation_failure_scored_zero",
                })
                continue

            judge_status = raw_scores.get("_judge_status", "failed")
            item_meta = {
                "item_id": replay.get("item_id"),
                "subject": replay.get("subject", "UNKNOWN"),
                "generation_status": replay.get("generation_status", "unknown"),
                "failure_type": replay.get("failure_type"),
                "first_attempt_failed": replay.get("first_attempt_failed", False),
                "output_limit_reached": replay.get("output_limit_reached", False),
                "telemetry": replay.get("telemetry", {}),
                "input_tokens": int(replay.get("telemetry", {}).get("input_tokens", 0) or 0),
                "output_tokens": int(replay.get("telemetry", {}).get("output_tokens", 0) or 0),
                "total_tokens": int(replay.get("telemetry", {}).get("input_tokens", 0) or 0)
                                + int(replay.get("telemetry", {}).get("output_tokens", 0) or 0),
                "prompt_trace": replay.get("prompt_trace", {}),
                "reference_trace": {
                    "present": bool(replay.get("reference_answer") or replay.get("gold_key_points")),
                    "reference_answer_hash": sha256_text(replay.get("reference_answer", ""))
                        if replay.get("reference_answer") else None,
                    "gold_key_points_hash": stable_json_hash(replay.get("gold_key_points", []))
                        if replay.get("gold_key_points") else None,
                },
                "reference_answer": replay.get("reference_answer", ""),
                "gold_key_points": replay.get("gold_key_points", []),
                "judge_status": judge_status,
                "judge_response_id": raw_scores.get("_judge_response_id"),
                "effective_judge_model": raw_scores.get("_effective_judge_model"),
                "judge_error": raw_scores.get("_judge_error"),
                "judge_router_metadata": raw_scores.get("_judge_router_metadata"),
            }
            if judge_status != "success":
                per_conv_results.append({
                    **item_meta,
                    "conv_index": start_global + local_i,
                    "num_turns": len(replay["turns"]),
                    "avg_latency_ms": replay["avg_latency_ms"],
                    "replay_turns": replay.get("replay_turns", []),
                    "criteria_scores": {},
                    "group_scores": {},
                    "criteria_reasons": {},
                    "confidence": None,
                    "non_scoring": {},
                })
                continue

            criteria_scores = {
                short: float(raw_scores.get(full, {}).get("score"))
                for short, full in _SHORT_TO_FULL.items()
            }
            criteria_scores["D2"] = _score_latency(replay["avg_latency_ms"])

            group_scores = _compute_group_scores_research(criteria_scores)

            # Confidence: std của 9 criteria trong 1 lần chấm (D2 bỏ qua — objective)
            scores_vals = [criteria_scores[k] for k in _SHORT_TO_FULL]
            conf_std     = statistics.stdev(scores_vals) if len(scores_vals) >= 2 else 0.0
            conf_overall = round(max(0.0, 1.0 - conf_std / 2.5), 3)

            # Non-scoring metrics: BLEU, ROUGE-L, question detection rate
            orig_assistant  = [m["content"] for m in conv.get("messages", []) if m.get("role") == "assistant"]
            model_responses = replay.get("assistant_turns", [])
            ngram_list = [compute_ngram_metrics(ref, hyp)
                          for ref, hyp in zip(orig_assistant, model_responses)]
            ngram_avg = {
                "bleu":    round(sum(n["bleu"]    for n in ngram_list) / max(1, len(ngram_list)), 4),
                "rouge_l": round(sum(n["rouge_l"] for n in ngram_list) / max(1, len(ngram_list)), 4),
            } if ngram_list else {"bleu": 0.0, "rouge_l": 0.0}
            qdr = compute_question_detection_rate(model_responses)

            per_conv_results.append({
                **item_meta,
                "conv_index":      start_global + local_i,
                "num_turns":       len(replay["turns"]),
                "avg_latency_ms":  replay["avg_latency_ms"],
                "replay_turns":    replay.get("replay_turns", []),
                "criteria_scores": criteria_scores,
                "group_scores":    group_scores,
                "criteria_reasons": {
                    short: raw_scores.get(full, {}).get("reason", "")
                    for short, full in _SHORT_TO_FULL.items()
                },
                "confidence": {
                    "overall": conf_overall,
                    "std":     round(conf_std, 3),
                    "is_low":  conf_overall < 0.6,
                },
                "non_scoring": {
                    "bleu":                    ngram_avg["bleu"],
                    "rouge_l":                 ngram_avg["rouge_l"],
                    "question_detection_rate": qdr,
                },
            })

        # Persist only after the whole batch is mapped. A crash can therefore
        # replay at most one batch and never pays again for earlier batches.
        _save_eval_checkpoint(eval_job_id, checkpoint_name, per_conv_results)

    valid_count = sum(1 for r in per_conv_results if r is not None)
    _eval_log(job_id, f"[✅] {label}: {valid_count}/{total} conversations chấm thành công.")
    return per_conv_results


def _run_blinded_paired_judge(
    job_id,
    eval_job_id,
    valid_convs,
    base_replay,
    ft_replay,
    judge_model: str,
    seed: int = 42,
) -> tuple[list, list]:
    """Blind and shuffle Base/FT outputs before the same judge pass."""
    import random

    entries = []
    for index, (conversation, base_item, ft_item) in enumerate(zip(valid_convs, base_replay, ft_replay)):
        entries.append({"condition": "base", "index": index, "conversation": conversation, "replay": base_item})
        entries.append({"condition": "ft", "index": index, "conversation": conversation, "replay": ft_item})
    random.Random(seed).shuffle(entries)

    scored = _run_batch_judge(
        job_id,
        eval_job_id,
        [entry["conversation"] for entry in entries],
        [entry["replay"] for entry in entries],
        judge_model,
        stage_key="judge_ft",
        label="Judge blinded Base/FT",
    )
    base_results = [None] * len(valid_convs)
    ft_results = [None] * len(valid_convs)
    for entry, result in zip(entries, scored):
        if result is not None:
            result["conv_index"] = entry["index"]
            result["judge_blinded"] = True
            result["judge_randomization_seed"] = seed
        target = base_results if entry["condition"] == "base" else ft_results
        target[entry["index"]] = result
    return base_results, ft_results


ADAPTIVE_JUDGE_SYSTEM = """Bạn là chuyên gia đánh giá gia sư Socratic. Đây là phép đo
chẩn đoán riêng, không thay thế rubric A1-D2 và không tạo điểm tổng có trọng số.

Chấm ba tiêu chí độc lập trên thang 0-5:

P1 - Learner-state diagnosis (nhận diện trạng thái hiểu bài)
5: Phản hồi thể hiện đúng trạng thái và đúng nguyên nhân/ngộ nhận cụ thể.
4: Nhận diện đúng trạng thái nhưng nguyên nhân còn thiếu một phần.
3: Nhận ra vấn đề ở mức rộng, chưa xác định ngộ nhận cụ thể.
2: Nhận xét mơ hồ, bằng chứng yếu.
1: Suy luận sai trạng thái người học.
0: Bỏ qua hoặc tự bịa trạng thái người học.

O1 - Contrastive adaptation/personalization (chấm MỘT LẦN cho cả cặp)
5: Hai phản hồi đổi gợi ý, độ khó, ví dụ hoặc bước tiếp theo đúng với hai trạng thái.
4: Thích nghi phù hợp nhưng chưa đầy đủ ở một mặt.
3: Có dùng câu trả lời học sinh nhưng chiến lược vẫn khá chung.
2: Phần lớn theo kịch bản, khác biệt nhỏ và ít giá trị.
1: Gần như cùng một phản hồi cho hai trạng thái khác nhau.
0: Bỏ qua hoặc thích nghi ngược với trạng thái đã cho.

E1 - Critical-thinking elicitation (khơi gợi tư duy phản biện)
5: Buộc học sinh giải thích, kiểm chứng, so sánh phương án hoặc chuyển giao sang tình huống mới.
4: Có câu hỏi why/how/what-if rõ ràng và hữu ích.
3: Yêu cầu làm bước tiếp theo nhưng chủ yếu mang tính thủ tục.
2: Chủ yếu yêu cầu nhớ lại hoặc tính toán máy móc.
1: Chỉ hỏi kiểu “em hiểu chưa/đúng không”.
0: Đưa đáp án mà không yêu cầu suy nghĩ.

Dùng learner_state, misconception_key và expected_strategy làm GOLD ẩn để chấm;
không giả định chúng đã được đưa cho model. P1 và E1 chấm từng item; O1 chấm cấp cặp.
Chỉ trả về JSON array đúng schema được yêu cầu, không markdown."""


def _adaptive_pair_payloads(valid_convs: list, replay_results: list) -> list[dict]:
    replay_by_id = {
        str(row.get("item_id")): row for row in replay_results if isinstance(row, dict)
    }
    grouped = collections.defaultdict(list)
    for index, conversation in enumerate(valid_convs):
        adaptive = extract_adaptive_metadata(conversation)
        if adaptive is None:
            continue
        item_meta = extract_item_metadata(conversation, index)
        replay = replay_by_id.get(item_meta["item_id"])
        if replay is None:
            continue
        grouped[adaptive["contrastive_pair_id"]].append({
            "item_id": item_meta["item_id"],
            "subject": item_meta["subject"],
            "learner_state": adaptive["learner_state"],
            "misconception_key": adaptive["misconception_key"],
            "expected_strategy": adaptive["expected_strategy"],
            "student_message": next(
                (str(message.get("content") or "") for message in conversation.get("messages", [])
                 if isinstance(message, dict) and message.get("role") == "user"),
                "",
            ),
            "tutor_response": "\n".join(str(value) for value in replay.get("assistant_turns", [])),
            "generation_status": replay.get("generation_status"),
        })
    return [
        {"pair_id": pair_id, "subject": rows[0]["subject"], "items": rows}
        for pair_id, rows in sorted(grouped.items())
        if len(rows) == 2
    ]


def _parse_adaptive_reply(reply: str, pairs: list[dict]) -> list[dict]:
    decoder = json.JSONDecoder()
    parsed = None
    for match in re.finditer(r"\[", str(reply or "")):
        try:
            candidate, _ = decoder.raw_decode(reply[match.start():])
            if isinstance(candidate, list):
                parsed = candidate
                break
        except json.JSONDecodeError:
            continue
    if not isinstance(parsed, list) or len(parsed) != len(pairs):
        raise _JudgeResponseError(
            f"Adaptive Judge returned {len(parsed) if isinstance(parsed, list) else 0}/{len(pairs)} pairs"
        )

    by_index = {}
    for raw in parsed:
        if not isinstance(raw, dict) or isinstance(raw.get("pair_index"), bool):
            raise _JudgeResponseError("Adaptive Judge pair_index is invalid")
        pair_index = raw.get("pair_index")
        if not isinstance(pair_index, int) or not 0 <= pair_index < len(pairs) or pair_index in by_index:
            raise _JudgeResponseError(f"Adaptive Judge pair_index is invalid: {pair_index!r}")
        expected_ids = {item["item_id"] for item in pairs[pair_index]["items"]}
        item_scores = raw.get("item_scores")
        if not isinstance(item_scores, list) or len(item_scores) != 2:
            raise _JudgeResponseError(f"Adaptive pair {pair_index} must contain two item_scores")
        normalized_items = []
        observed_ids = set()
        for item in item_scores:
            item_id = str(item.get("item_id") or "") if isinstance(item, dict) else ""
            if item_id not in expected_ids or item_id in observed_ids:
                raise _JudgeResponseError(f"Adaptive pair {pair_index} has invalid item_id {item_id!r}")
            observed_ids.add(item_id)
            normalized = {"item_id": item_id}
            for metric in ("P1", "E1"):
                criterion = item.get(metric)
                score = criterion.get("score") if isinstance(criterion, dict) else None
                reason = criterion.get("reason") if isinstance(criterion, dict) else None
                if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= float(score) <= 5:
                    raise _JudgeResponseError(f"Adaptive {metric} score is invalid for {item_id}")
                if not isinstance(reason, str) or not reason.strip():
                    raise _JudgeResponseError(f"Adaptive {metric} reason is missing for {item_id}")
                normalized[metric] = {"score": float(score), "reason": reason.strip()}
            normalized_items.append(normalized)
        o1 = raw.get("O1")
        o1_score = o1.get("score") if isinstance(o1, dict) else None
        o1_reason = o1.get("reason") if isinstance(o1, dict) else None
        if isinstance(o1_score, bool) or not isinstance(o1_score, (int, float)) or not 0 <= float(o1_score) <= 5:
            raise _JudgeResponseError(f"Adaptive O1 score is invalid for pair {pair_index}")
        if not isinstance(o1_reason, str) or not o1_reason.strip():
            raise _JudgeResponseError(f"Adaptive O1 reason is missing for pair {pair_index}")
        by_index[pair_index] = {
            "items": normalized_items,
            "O1": {"score": float(o1_score), "reason": o1_reason.strip()},
        }
    return [by_index[index] for index in range(len(pairs))]


def _judge_adaptive_pairs(pairs: list[dict], judge_model: str) -> list[dict]:
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError("Adaptive Judge unavailable: no_api_key")
    results = []
    for start in range(0, len(pairs), BATCH_SIZE):
        chunk = pairs[start:start + BATCH_SIZE]
        public_chunk = []
        for pair_index, pair in enumerate(chunk):
            public_chunk.append({
                "pair_index": pair_index,
                "pair_id": pair["pair_id"],
                "items": [{
                    "item_id": item["item_id"],
                    "gold_learner_state": item["learner_state"],
                    "gold_misconception_key": item["misconception_key"],
                    "gold_expected_strategy": item["expected_strategy"],
                    "student_message": item["student_message"],
                    "tutor_response": item["tutor_response"],
                } for item in pair["items"]],
            })
        schema = (
            '\nReturn: [{"pair_index":0,"item_scores":['
            '{"item_id":"...","P1":{"score":0,"reason":"..."},'
            '"E1":{"score":0,"reason":"..."}}],'
            '"O1":{"score":0,"reason":"..."}}]'
        )
        payload = json.dumps({
            "model": judge_model,
            "max_tokens": 900 * len(chunk),
            "temperature": 0,
            "messages": [
                {"role": "system", "content": ADAPTIVE_JUDGE_SYSTEM + schema},
                {"role": "user", "content": json.dumps(public_chunk, ensure_ascii=False)},
            ],
            "provider": {"allow_fallbacks": False},
        }).encode("utf-8")
        envelope = _openrouter_chat(payload, api_key, "SEP490 Adaptive Socratic Diagnostic")
        choices = envelope.get("choices") or []
        if not choices:
            raise RuntimeError(f"Adaptive Judge missing choices: {envelope.get('error')}")
        reply = choices[0].get("message", {}).get("content", "")
        results.extend(_parse_adaptive_reply(reply, chunk))
    return results


def _run_adaptive_diagnostic(valid_convs: list, replay_results: list, judge_model: str) -> list[dict]:
    pairs = _adaptive_pair_payloads(valid_convs, replay_results)
    scoreable_pairs = [
        pair for pair in pairs
        if all(item.get("generation_status") == "success" and item.get("tutor_response") for item in pair["items"])
    ]
    judged = _judge_adaptive_pairs(scoreable_pairs, judge_model) if scoreable_pairs else []
    judged_by_pair = {pair["pair_id"]: raw for pair, raw in zip(scoreable_pairs, judged)}
    rows = []
    for pair in pairs:
        raw = judged_by_pair.get(pair["pair_id"])
        judge_status = "success"
        if raw is None:
            reason = "Pre-specified score 0: at least one item in the contrastive pair has no valid model output."
            raw = {
                "items": [
                    {
                        "item_id": item["item_id"],
                        "P1": {"score": 0.0, "reason": reason},
                        "E1": {"score": 0.0, "reason": reason},
                    }
                    for item in pair["items"]
                ],
                "O1": {"score": 0.0, "reason": reason},
            }
            judge_status = "not_required_generation_failure_scored_zero"
        p1 = sum(item["P1"]["score"] for item in raw["items"]) / 2.0
        e1 = sum(item["E1"]["score"] for item in raw["items"]) / 2.0
        rows.append({
            "item_id": pair["pair_id"],
            "pair_id": pair["pair_id"],
            "subject": pair["subject"],
            "unit_of_analysis": "contrastive_pair",
            "item_ids": [item["item_id"] for item in pair["items"]],
            "learner_states": [item["learner_state"] for item in pair["items"]],
            "adaptive_scores": {
                "P1": round(p1, 3),
                "O1": raw["O1"]["score"],
                "E1": round(e1, 3),
            },
            "adaptive_reasons": {
                "P1": " | ".join(item["P1"]["reason"] for item in raw["items"]),
                "O1": raw["O1"]["reason"],
                "E1": " | ".join(item["E1"]["reason"] for item in raw["items"]),
            },
            "item_scores": raw["items"],
            "judge_status": judge_status,
        })
    return rows


def _summarize_adaptive(rows: list[dict]) -> dict:
    scored = [
        row for row in rows
        if row.get("judge_status") in {"success", "not_required_generation_failure_scored_zero"}
    ]
    criteria = {
        metric: round(sum(row["adaptive_scores"][metric] for row in scored) / len(scored), 3)
        if scored else None
        for metric in ("P1", "O1", "E1")
    }
    adaptive_score = (
        round(sum(criteria[metric] for metric in ("P1", "O1", "E1")) / 3.0, 3)
        if all(criteria[metric] is not None for metric in ("P1", "O1", "E1")) else None
    )
    return {
        "criteria": criteria,
        "adaptive_score": adaptive_score,
        "pair_count": len(scored),
        "unit_of_analysis": "contrastive_pair",
        "formula": "AS = (P1 + O1 + E1) / 3",
        "overall": adaptive_score,
    }

def _compute_eval_flags(valid_results: list, summary: dict) -> list:
    import statistics
    flags = []
    scored_results = [
        r for r in valid_results
        if r
        and r.get("judge_status") in {"success", "not_required_generation_failure_scored_zero"}
        and r.get("criteria_scores", {}).get("B1") is not None
    ]
    total = len(scored_results)
    if total == 0:
        return flags

    constraint_count = sum(
        1 for r in scored_results
        if r.get("criteria_scores", {}).get("A1", 5.0) <= 1.0
    )
    if constraint_count / total > 0.3:
        flags.append("high_constraint_violation_rate")

    knowledge_scores = [r.get("group_scores", {}).get("knowledge", 0) for r in scored_results]
    socratic_scores = [r.get("group_scores", {}).get("socratic", 0) for r in scored_results]
    if len(knowledge_scores) >= 2 and (
        statistics.stdev(knowledge_scores) > 1.2
        or statistics.stdev(socratic_scores) > 1.2
    ):
        flags.append("high_primary_outcome_variance")

    avg_knowledge = sum(knowledge_scores) / len(knowledge_scores)
    avg_socratic = sum(socratic_scores) / len(socratic_scores)
    if avg_knowledge < 1.8:
        flags.append("very_low_knowledge")
    if avg_socratic < 1.8:
        flags.append("very_low_socratic")

    confidences = [
        r.get("confidence", {}).get("overall") for r in scored_results
        if isinstance(r.get("confidence"), dict)
        and r.get("confidence", {}).get("overall") is not None
    ]
    if confidences and sum(confidences) / len(confidences) < 0.6:
        flags.append("low_judge_confidence")

    if summary.get("avg_latency_ms", 0) > 10000:
        flags.append("high_latency")

    if summary.get("socratic", 0) < 2.0 and summary.get("knowledge", 0) > 3.5:
        flags.append("socratic_underperforming")

    return flags

# ── Main eval function ────────────────────────────────────────────────
def _resolve_hf_revision(repo_id: str, token: str | None = None) -> str | None:
    """Resolve a mutable Hugging Face repo name to an immutable commit SHA."""
    if not repo_id:
        return None
    try:
        return HfApi().model_info(repo_id=repo_id, token=token or None).sha
    except Exception as exc:
        print(f"[!] Could not resolve HF revision for {repo_id}: {exc}")
        return None


def _tokenizer_manifest(tokenizer) -> dict:
    chat_template = getattr(tokenizer, "chat_template", None) or ""
    try:
        vocab_hash = stable_json_hash(tokenizer.get_vocab())
    except Exception:
        vocab_hash = None
    try:
        special_tokens_hash = stable_json_hash(getattr(tokenizer, "special_tokens_map", {}) or {})
    except Exception:
        special_tokens_hash = None
    return {
        "class": tokenizer.__class__.__name__,
        "name_or_path": getattr(tokenizer, "name_or_path", None),
        "vocab_size": getattr(tokenizer, "vocab_size", None),
        "chat_template_hash": sha256_text(chat_template) if chat_template else None,
        "vocab_hash": vocab_hash,
        "special_tokens_map_hash": special_tokens_hash,
        "bos_token_id": getattr(tokenizer, "bos_token_id", None),
        "eos_token_id": getattr(tokenizer, "eos_token_id", None),
        "pad_token_id": getattr(tokenizer, "pad_token_id", None),
    }


def _run_locked_auto_evaluation(job_id, eval_job_id, eval_file_path,
                        active_model, tokenizer, max_seq,
                        judge_model=DEFAULT_JUDGE_MODEL,
                        base_model=None, base_tokenizer=None,
                        base_model_repo=None, ft_model_repo=None,
                        protocol_mode="locked_single_turn",
                        prompt_variant="P1",
                        system_prompt_override="",
                        system_prompt_version="",
                        subject_override="",
                        max_new_tokens=512,
                        warmup_runs=1,
                        bootstrap_resamples=10000,
                        bootstrap_seed=42,
                        hf_token=""):
    """
    Eval multi-turn conversation.
    - single mode: chá»‰ cÃ³ active_model (FT)
    - paired mode: cÃ³ thÃªm base_model â†’ so sÃ¡nh delta
    """
    run_started_at = datetime.datetime.now(datetime.timezone.utc)
    effective_max_seq = max(int(max_seq), 4096)

    # 1. Load dataset
    conversations = []
    ext = os.path.splitext(eval_file_path)[1].lower()
    try:
        if ext == ".jsonl":
            with open(eval_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try: conversations.append(json.loads(line))
                        except: pass
        else:
            with open(eval_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("conversations"), list):
                conversations = data["conversations"]
            elif isinstance(data, dict) and isinstance(data.get("items"), list):
                conversations = data["items"]
            else:
                conversations = data if isinstance(data, list) else [data]
    except Exception as e:
        _eval_log(job_id, f"[Eval] Lá»—i Ä‘á»c file: {e}")
        return

    # Normalize
    valid_convs = []
    for c in conversations:
        msgs = c.get("messages", [])
        if any(m.get("role") == "user" for m in msgs):
            cleaned = []
            for m in msgs:
                if cleaned and cleaned[-1]["role"] == m["role"] == "assistant":
                    cleaned[-1]["content"] += "\n" + m["content"]
                else:
                    cleaned.append(m)
            valid_convs.append({**c, "messages": cleaned})

    if not valid_convs:
        _eval_log(job_id, "[Eval] KhÃ´ng cÃ³ conversation há»£p lá»‡.")
        return

    normalized_subject_override = normalize_subject(subject_override) if subject_override else ""
    if normalized_subject_override:
        for index, conversation in enumerate(valid_convs):
            existing_subject = extract_item_metadata(conversation, index)["subject"]
            if existing_subject != "UNKNOWN" and existing_subject != normalized_subject_override:
                raise ValueError(
                    f"Subject mismatch at item {index}: dataset={existing_subject}, run={normalized_subject_override}"
                )
            conversation["subject"] = normalized_subject_override

    strict_locked = protocol_mode == "locked_single_turn"
    validation = validate_locked_dataset(valid_convs, strict=strict_locked)
    adaptive_validation = validate_adaptive_dataset(valid_convs)
    for warning in validation["warnings"][:20]:
        _eval_log(job_id, f"[âš ï¸] Dataset warning: {warning}")
    if not validation["valid"]:
        detail = "; ".join(validation["errors"][:10])
        raise ValueError(f"Dataset khÃ´ng Ä‘áº¡t locked protocol: {detail}")

    total = len(valid_convs)
    # Models are intentionally loaded sequentially inside this function to
    # avoid CPU/GPU OOM, so paired mode is determined by the locked Base repo.
    is_paired = bool(base_model_repo)
    eval_mode = "paired" if is_paired else "single"
    _eval_log(job_id, f"[ðŸ“Š] Mode: {eval_mode} | {total} conversations")
    _eval_log(
        job_id,
        f"[ðŸ”’] Protocol={protocol_mode} | Prompt={prompt_variant.upper()}:{system_prompt_version or 'UNVERSIONED'} "
        f"| max_new_tokens={max_new_tokens} | bootstrap={bootstrap_resamples}",
    )
    effective_hf_token = hf_token or _read_secret("HF_TOKEN") or None
    resolved_revisions = {
        "base": _resolve_hf_revision(base_model_repo, effective_hf_token) if is_paired else None,
        "fine_tuned": _resolve_hf_revision(ft_model_repo, effective_hf_token),
    }
    if strict_locked and not resolved_revisions["fine_tuned"]:
        raise ValueError("Locked run requires an immutable Fine-tuned Hugging Face revision")
    if strict_locked and is_paired and not resolved_revisions["base"]:
        raise ValueError("Locked paired run requires an immutable Base Hugging Face revision")

    checkpoint_identity = {
        "dataset_hash": stable_json_hash(valid_convs),
        "base_repo": base_model_repo if is_paired else None,
        "base_revision": resolved_revisions["base"],
        "fine_tuned_repo": ft_model_repo,
        "fine_tuned_revision": resolved_revisions["fine_tuned"],
        "judge_model": judge_model,
        "protocol_mode": protocol_mode,
        "prompt_variant": prompt_variant.upper(),
        "system_prompt_hash": sha256_text(system_prompt_override) if system_prompt_override else None,
        "system_prompt_version": system_prompt_version,
        "max_new_tokens": int(max_new_tokens),
        "bootstrap_seed": int(bootstrap_seed),
    }
    saved_identity = _load_eval_checkpoint(eval_job_id, "identity", None)
    if saved_identity is not None and saved_identity != checkpoint_identity:
        raise ValueError("Eval checkpoint identity mismatch; refusing to mix results from a changed dataset/model/prompt.")
    _save_eval_checkpoint(eval_job_id, "identity", checkpoint_identity)

    # 2. Warmup FT model (Bá»  qua vÃ¬ ta sáº½ khá»Ÿi Ä‘á»™ng tá»«ng model)
    _eval_progress(eval_job_id, "warmup", "GPU ready")

    # 3. Replay
    # --- Tá» I Æ¯U Bá»˜ NHá»š: Cháº¡y Replay Base trÆ°á»›c, rá»“i xÃ³a khá» i RAM, sau Ä‘Ã³ má»›i cháº¡y Replay FT ---
    base_replay = None
    load_metrics = {}
    tokenizer_manifests = {}
    base_chat_template = None
    if is_paired:
        _eval_log(job_id, "[🔄] Loading Base model để Replay...")
        import gc, torch
        load_started = time.perf_counter()
        base_model, base_tokenizer = FastLanguageModel.from_pretrained(
            model_name=base_model_repo,
            revision=resolved_revisions["base"],
            max_seq_length=effective_max_seq,
            load_in_4bit=True,
            token=effective_hf_token,
        )
        ensure_right_padding(base_tokenizer)
        base_chat_template = getattr(base_tokenizer, "chat_template", None)
        tokenizer_manifests["base"] = _tokenizer_manifest(base_tokenizer)
        try:
            torch.cuda.synchronize()
        except Exception:
            pass
        load_metrics["base_load_ms"] = round((time.perf_counter() - load_started) * 1000, 3)
        load_metrics["base_vram_allocated_after_load_mb"] = round(torch.cuda.memory_allocated() / (1024 ** 2), 3)

        for warm_index in range(max(0, int(warmup_runs))):
            _eval_log(job_id, f"[🔥] Base warm-up {warm_index + 1}/{warmup_runs}")
            replay_conversation(
                valid_convs[0], base_model, base_tokenizer,
                max_new_tokens=min(32, int(max_new_tokens)),
                protocol_mode=protocol_mode,
                prompt_variant=prompt_variant,
                system_prompt_override=system_prompt_override,
                system_prompt_version=system_prompt_version,
                item_index=0,
            )

        base_replay = _run_single_replay(
            job_id, eval_job_id, valid_convs,
            base_model, base_tokenizer,
            stage_key="replay_base", label="Replay Base",
            max_new_tokens=max_new_tokens,
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_override=system_prompt_override,
            system_prompt_version=system_prompt_version,
        )

        # XÃ“A BASE MODEL KHá»ŽI RAM NGAY Láº¬P Tá»¨C
        _eval_log(job_id, "[🗑️] Xóa Base model khỏi GPU để nhường chỗ cho FT model...")
        unload_started = time.perf_counter()
        del base_model; del base_tokenizer
        gc.collect(); torch.cuda.empty_cache()
        try:
            torch.cuda.synchronize()
        except Exception:
            pass
        load_metrics["base_unload_ms"] = round((time.perf_counter() - unload_started) * 1000, 3)
        load_metrics["vram_allocated_after_base_unload_mb"] = round(torch.cuda.memory_allocated() / (1024 ** 2), 3)

    # Load FT model (lÃºc nÃ y GPU Ä‘Ã£ trá»‘ng hoÃ n toÃ n)
    _eval_log(job_id, f"[🔄] Loading FT model ({ft_model_repo}) để Replay...")
    import gc, torch
    load_started = time.perf_counter()
    ft_model, ft_tokenizer = FastLanguageModel.from_pretrained(
        model_name=ft_model_repo,
        revision=resolved_revisions["fine_tuned"],
        max_seq_length=effective_max_seq,
        load_in_4bit=True,
        token=effective_hf_token,
    )
    ensure_right_padding(ft_tokenizer)
    if is_paired:
        _eval_log(job_id, "[ℹ️] Syncing Base model chat_template to Fine-tuned tokenizer for prompt consistency...")
        ft_tokenizer.chat_template = base_chat_template

    tokenizer_manifests["fine_tuned"] = _tokenizer_manifest(ft_tokenizer)
    if is_paired and tokenizer_manifests.get("base"):
        tokenizer_manifests["fine_tuned"]["chat_template_hash"] = tokenizer_manifests["base"]["chat_template_hash"]
    if strict_locked and is_paired:
        base_tok = tokenizer_manifests.get("base", {})
        ft_tok = tokenizer_manifests.get("fine_tuned", {})
        mismatch = None
        if base_tok.get("vocab_size") != ft_tok.get("vocab_size"):
            mismatch = "Base/FT tokenizer vocab_size mismatch"
        elif base_tok.get("chat_template_hash") != ft_tok.get("chat_template_hash"):
            mismatch = "Base/FT chat_template hash mismatch"
        elif base_tok.get("vocab_hash") != ft_tok.get("vocab_hash"):
            mismatch = "Base/FT tokenizer vocabulary hash mismatch"
        elif base_tok.get("special_tokens_map_hash") != ft_tok.get("special_tokens_map_hash"):
            mismatch = "Base/FT tokenizer special-token hash mismatch"
        if mismatch:
            del ft_model, ft_tokenizer
            gc.collect()
            torch.cuda.empty_cache()
            raise ValueError(f"Locked pair invalid: {mismatch}")
    try:
        torch.cuda.synchronize()
    except Exception:
        pass
    load_metrics["ft_load_ms"] = round((time.perf_counter() - load_started) * 1000, 3)
    load_metrics["ft_vram_allocated_after_load_mb"] = round(torch.cuda.memory_allocated() / (1024 ** 2), 3)

    for warm_index in range(max(0, int(warmup_runs))):
        _eval_log(job_id, f"[ðŸ”¥] FT warm-up {warm_index + 1}/{warmup_runs}")
        replay_conversation(
            valid_convs[0], ft_model, ft_tokenizer,
            max_new_tokens=min(32, int(max_new_tokens)),
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_override=system_prompt_override,
            system_prompt_version=system_prompt_version,
            item_index=0,
        )

    ft_replay = _run_single_replay(
        job_id, eval_job_id, valid_convs,
        ft_model, ft_tokenizer,
        stage_key="replay_ft" if is_paired else "replay", label="Replay FT",
        max_new_tokens=max_new_tokens,
        protocol_mode=protocol_mode,
        prompt_variant=prompt_variant,
        system_prompt_override=system_prompt_override,
        system_prompt_version=system_prompt_version,
    )

    # CÃ³ thá»ƒ xÃ³a luÃ´n FT model vÃ¬ Ä‘Ã£ Replay xong (Ä‘á»ƒ dÆ° VRAM cho viá»‡c khÃ¡c náº¿u cáº§n)
    _eval_log(job_id, "[ðŸ—‘ï¸] XÃ³a FT model khá»i GPU. Báº¯t Ä‘áº§u cháº¥m Ä‘iá»ƒm API...")
    unload_started = time.perf_counter()
    del ft_model; del ft_tokenizer
    gc.collect(); torch.cuda.empty_cache()
    try:
        torch.cuda.synchronize()
    except Exception:
        pass
    load_metrics["ft_unload_ms"] = round((time.perf_counter() - unload_started) * 1000, 3)
    load_metrics["vram_allocated_after_ft_unload_mb"] = round(torch.cuda.memory_allocated() / (1024 ** 2), 3)

    # 4. Judge â€” Base/FT identities are hidden and their order is shuffled.
    if is_paired:
        base_per_conv, ft_per_conv = _run_blinded_paired_judge(
            job_id,
            eval_job_id,
            valid_convs,
            base_replay,
            ft_replay,
            judge_model,
            seed=int(bootstrap_seed),
        )
    else:
        ft_per_conv = _run_batch_judge(
            job_id, eval_job_id, valid_convs, ft_replay,
            judge_model,
            stage_key="judge", label="Judge"
        )
        base_per_conv = None

    # 5. Summarize
    _eval_progress(eval_job_id, "finalize", "")
    ft_summary   = _summarize(ft_per_conv)
    base_summary = _summarize(base_per_conv) if is_paired else None
    pair_integrity = (
        paired_integrity(base_per_conv, ft_per_conv, judge_model)
        if is_paired else None
    )

    adaptive_diagnostic = {
        "protocol_version": "adaptive-socratic-diagnostic-v1",
        "status": adaptive_validation["status"],
        "dataset_validation": adaptive_validation,
        "unit_of_analysis": "contrastive_pair",
        "criteria_definitions": {
            "AS": "Equal-weight Adaptive Socratic Score",
            "P1": "Learner-state diagnosis",
            "O1": "Contrastive adaptation/personalization",
            "E1": "Critical-thinking elicitation",
        },
        "summary": None,
        "base_summary": None,
        "delta": None,
        "research_statistics": None,
        "ft_pairs": [],
        "base_pairs": [],
        "overall": None,
    }
    if adaptive_validation["eligible"]:
        _eval_log(
            job_id,
            f"[Adaptive] Running P1/O1/E1 on {adaptive_validation['complete_pair_count']} contrastive pairs.",
        )
        try:
            adaptive_ft_pairs = _run_adaptive_diagnostic(valid_convs, ft_replay, judge_model)
            adaptive_base_pairs = (
                _run_adaptive_diagnostic(valid_convs, base_replay, judge_model)
                if is_paired else []
            )
            adaptive_summary = _summarize_adaptive(adaptive_ft_pairs)
            adaptive_base_summary = _summarize_adaptive(adaptive_base_pairs) if is_paired else None
            adaptive_delta = None
            adaptive_statistics = None
            if is_paired and adaptive_base_summary:
                adaptive_delta = {
                    metric: round(
                        adaptive_summary["criteria"][metric]
                        - adaptive_base_summary["criteria"][metric],
                        3,
                    )
                    for metric in ("P1", "O1", "E1")
                }
                adaptive_delta["AS"] = round(
                    adaptive_summary["adaptive_score"]
                    - adaptive_base_summary["adaptive_score"],
                    3,
                )
                adaptive_statistics = paired_adaptive_statistics(
                    adaptive_ft_pairs,
                    adaptive_base_pairs,
                    resamples=int(bootstrap_resamples),
                    seed=int(bootstrap_seed),
                )
            adaptive_diagnostic.update({
                "status": "completed",
                "overall": adaptive_summary["adaptive_score"],
                "formula": "AS = (P1 + O1 + E1) / 3",
                "summary": adaptive_summary,
                "base_summary": adaptive_base_summary,
                "delta": adaptive_delta,
                "research_statistics": adaptive_statistics,
                "ft_pairs": adaptive_ft_pairs,
                "base_pairs": adaptive_base_pairs,
            })
        except Exception as exc:
            adaptive_diagnostic.update({
                "status": "failed",
                "error": str(exc)[:500],
            })
            _eval_log(job_id, f"[Adaptive] Diagnostic failed without invalidating A1-D2: {exc}")

    # 6. Delta (paired only)
    delta = None
    if is_paired and base_summary:
        delta = {
            "overall":  None,
            "group_a":  None,
            "group_b":  None,
            "group_c":  None,
            "group_d":  None,
            "criteria": {
                k: round(ft_summary["criteria"][k] - base_summary["criteria"].get(k, 0), 3)
                for k in ft_summary["criteria"]
            },
            "avg_latency_ms": round(ft_summary["avg_latency_ms"] - base_summary["avg_latency_ms"], 1),
            "knowledge": round(ft_summary["knowledge"] - base_summary["knowledge"], 3),
            "socratic": round(ft_summary["socratic"] - base_summary["socratic"], 3),
        }

    research_statistics = None
    hypothesis_decisions = None
    if is_paired and base_per_conv is not None:
        research_statistics = paired_research_statistics(
            ft_per_conv,
            base_per_conv,
            resamples=int(bootstrap_resamples),
            seed=int(bootstrap_seed),
        )
        hypothesis_decisions = decide_hypotheses(
            research_statistics,
            ft_per_conv,
            base_per_conv,
        )

    # 7. Flags (dá»±a trÃªn FT)
    ft_valid = [r for r in ft_per_conv if r is not None]
    ft_scored = [
        r for r in ft_valid
        if r.get("judge_status") in {"success", "not_required_generation_failure_scored_zero"}
        and r.get("criteria_scores", {}).get("B1") is not None
    ]
    eval_flags = _compute_eval_flags(ft_valid, {
        "group_a": ft_summary["group_a"],
        "group_b": ft_summary["group_b"],
        "group_c": ft_summary["group_c"],
        "avg_latency_ms": ft_summary["avg_latency_ms"],
    })
    if pair_integrity and not pair_integrity["confirmatory_eligible"]:
        eval_flags.append("confirmatory_pair_integrity_failed")
    if pair_integrity and pair_integrity["rendered_input_hash_mismatches"]:
        eval_flags.append("pair_input_mismatch")
    if pair_integrity and pair_integrity["judge_model_mismatches"]:
        eval_flags.append("judge_model_mismatch")
    if pair_integrity and pair_integrity["judge_measurement_failures"]:
        eval_flags.append("judge_measurement_failure")
    if not validation.get("confirmatory_sample_size", False):
        eval_flags.append("confirmatory_sample_size_not_met")
    if not validation.get("confirmatory_reference_coverage", False):
        eval_flags.append("confirmatory_reference_coverage_not_met")

    _eval_log(
        job_id,
        f"[âœ…] FT K={ft_summary['knowledge']:.3f}/5 | S={ft_summary['socratic']:.3f}/5 "
        f"| scored={len(ft_scored)}/{total}",
    )
    if is_paired:
        _eval_log(
            job_id,
            f"     Base K={base_summary['knowledge']:.3f}/5 | S={base_summary['socratic']:.3f}/5",
        )
        _eval_log(job_id, f"     Delta K={delta['knowledge']:+.3f} | Delta S={delta['socratic']:+.3f}")
    if eval_flags:
        _eval_log(job_id, f"[âš ï¸] Flags: {', '.join(eval_flags)}")

    run_completed_at = datetime.datetime.now(datetime.timezone.utc)
    try:
        gpu_name = torch.cuda.get_device_name(0)
        cuda_version = torch.version.cuda
        torch_version = torch.__version__
    except Exception:
        gpu_name = None
        cuda_version = None
        torch_version = getattr(torch, "__version__", None)

    protocol_manifest = {
        "protocol_version": "RP4-locked-v1",
        "protocol_mode": protocol_mode,
        "single_turn": protocol_mode == "locked_single_turn",
        "prompt_variant": prompt_variant.upper(),
        "prompt_version": system_prompt_version or "UNVERSIONED",
        "subject_override": normalized_subject_override or None,
        "system_prompt_hash": sha256_text(system_prompt_override) if system_prompt_override else None,
        "max_input_tokens": effective_max_seq,
        "max_new_tokens": int(max_new_tokens),
        "temperature": 0,
        "do_sample": False,
        "warmup_runs": int(warmup_runs),
        "bootstrap_resamples": int(bootstrap_resamples),
        "bootstrap_seed": int(bootstrap_seed),
        "judge_requested_model": judge_model,
        "judge_blinded_and_randomized": bool(is_paired),
        "judge_randomization_seed": int(bootstrap_seed) if is_paired else None,
        "base_model_repo": base_model_repo,
        "base_model_revision": resolved_revisions["base"],
        "fine_tuned_model_repo": ft_model_repo,
        "fine_tuned_model_revision": resolved_revisions["fine_tuned"],
        "tokenizers": tokenizer_manifests,
        "judge_prompt_hash": sha256_text(SOCRATIC_JUDGE_SYSTEM_BATCH + JUDGE_REFERENCE_POLICY),
        "adaptive_judge_prompt_hash": sha256_text(ADAPTIVE_JUDGE_SYSTEM),
        "adaptive_protocol_version": "adaptive-socratic-diagnostic-v1",
        "generation_failure_quality_policy": (
            "assign_zero_to_K_S_A1_A2_A3_and_diagnostic_criteria; "
            "retain_item_in_paired_denominator; report_failure_separately"
        ),
        "judge_failure_policy": (
            "missing_measurement; never_convert_to_zero; confirmatory_run_ineligible"
        ),
        "dataset_hash": validation["dataset_hash"],
        "config_hash": None,
    }
    protocol_manifest["config_hash"] = stable_json_hash(protocol_manifest)
    environment_manifest = {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "torch": torch_version,
        "cuda": cuda_version,
        "gpu": gpu_name,
        "load_in_4bit": True,
        "cuda_launch_blocking": os.environ.get("CUDA_LAUNCH_BLOCKING", "0"),
        "torchdynamo_disable": os.environ.get("TORCHDYNAMO_DISABLE", ""),
        "packages": {
            name: (
                importlib.metadata.version(name)
                if name in {dist.metadata.get("Name", "") for dist in importlib.metadata.distributions()}
                else None
            )
            for name in ("unsloth", "transformers", "torch", "bitsandbytes", "peft")
        },
    }

    eval_result = {
        "modelEvalId":        eval_job_id,
        "jobId":              job_id,
        "status":             "COMPLETED",
        "evalMode":           eval_mode,
        "ftModelRepo":        ft_model_repo,
        "baseModelRepo":      base_model_repo,
        "totalConversations": total,
        "validConversations": len(ft_scored),
        "judgeModel":         judge_model,
        "flags":              eval_flags,
        "perConvResults":     ft_per_conv,
        "summary":            ft_summary,
        "basePerConvResults": base_per_conv,
        "baseSummary":        base_summary,
        "delta":              delta,
        "researchStatistics": research_statistics,
        "adaptiveDiagnostic": adaptive_diagnostic,
        "hypothesisDecisions": hypothesis_decisions,
        "pairIntegrity":      pair_integrity,
        "confirmatoryEligible": bool(
            is_paired and validation["valid"] and pair_integrity
            and pair_integrity["confirmatory_eligible"]
            and validation.get("confirmatory_sample_size", False)
            and validation.get("confirmatory_reference_coverage", False)
        ),
        "datasetValidation":  validation,
        "protocolManifest":   protocol_manifest,
        "environmentManifest": environment_manifest,
        "loadMetrics":        load_metrics,
        "startedAt":          run_started_at.isoformat().replace("+00:00", "Z"),
        "completedAt":        run_completed_at.isoformat().replace("+00:00", "Z"),
    }
    jobs_db[job_id]['eval_result'] = eval_result
    _eval_log(job_id, "[ðŸ’¾] Káº¿t quáº£ eval Ä‘Ã£ lÆ°u vÃ o jobs_db.")



def run_auto_evaluation(job_id, eval_job_id, eval_file_path,
                        active_model, tokenizer, max_seq,
                        judge_model=DEFAULT_JUDGE_MODEL,
                        base_model=None, base_tokenizer=None,
                        base_model_repo=None, ft_model_repo=None,
                        system_prompt: str | None = None,
                        protocol_mode: str = "locked_single_turn",
                        prompt_variant: str = "P1",
                        system_prompt_version: str = "",
                        subject_override: str = "",
                        max_new_tokens: int = 512,
                        warmup_runs: int = 1,
                        bootstrap_resamples: int = 10000,
                        bootstrap_seed: int = 42,
                        hf_token: str = "",
                        temperature: float = 0.2,
                        top_p: float = 0.9,
                        repetition_penalty: float = 1.15):
    """
    Eval multi-turn conversation.
    - single mode: chỉ có active_model (FT)
    - paired mode: có thêm base_model → so sánh delta
    """
    if protocol_mode == "locked_single_turn":
        if not base_model_repo or not ft_model_repo:
            raise ValueError("Locked RP5 evaluation requires both exact Base and Fine-tuned model repositories")
        return _run_locked_auto_evaluation(
            job_id=job_id,
            eval_job_id=eval_job_id,
            eval_file_path=eval_file_path,
            active_model=active_model,
            tokenizer=tokenizer,
            max_seq=max_seq,
            judge_model=judge_model,
            base_model=base_model,
            base_tokenizer=base_tokenizer,
            base_model_repo=base_model_repo,
            ft_model_repo=ft_model_repo,
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_override=system_prompt or "",
            system_prompt_version=system_prompt_version,
            subject_override=subject_override,
            max_new_tokens=max_new_tokens,
            warmup_runs=warmup_runs,
            bootstrap_resamples=bootstrap_resamples,
            bootstrap_seed=bootstrap_seed,
            hf_token=hf_token,
        )

    # Legacy evaluator retained only for previously saved non-confirmatory runs.
    # 1. Load dataset
    conversations = []
    ext = os.path.splitext(eval_file_path)[1].lower()
    try:
        if ext == ".jsonl":
            with open(eval_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try: conversations.append(json.loads(line))
                        except: pass
        else:
            with open(eval_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, dict):
                is_replay = data.get("eval_mode") == "hybrid_router_end_to_end"
                if not is_replay and "conversations" in data and isinstance(data["conversations"], list):
                    if len(data["conversations"]) > 0 and "replay_turns" in data["conversations"][0]:
                        is_replay = True
                
                if is_replay:
                    conversations = data.get("conversations", [])
                    _eval_log(job_id, "[Eval] Phát hiện file Replay Hybrid End-to-End.")
                else:
                    conversations = [data]
            else:
                conversations = data if isinstance(data, list) else [data]
    except Exception as e:
        _eval_log(job_id, f"[Eval] Lỗi đọc file: {e}")
        return

    # Normalize
    valid_convs = []
    ft_pre_generated_replays = []
    is_pre_generated_replay = False

    for c in conversations:
        # Hỗ trợ format Replay D
        if "replay_turns" in c:
            is_pre_generated_replay = True
            valid_convs.append({
                "subject": c.get("gold_subject", "UNGROUPED"),
                **c
            })
            
            user_turns = []
            asst_turns = []
            latencies = []
            turns_for_judge = []
            frontend_replay_turns = []
            
            # replay_turns is typically an alternating list of user and assistant messages
            current_user = ""
            for t in c.get("replay_turns", []):
                if t.get("role") == "user":
                    current_user = t.get("content", "")
                    user_turns.append(current_user)
                elif t.get("role") == "assistant":
                    asst_content = t.get("content", "")
                    asst_turns.append(asst_content)
                    lat = t.get("generation_latency_ms", 0) + t.get("router_latency_ms", 0)
                    latencies.append(lat)
                    if current_user:
                        turns_for_judge.append({
                            "user": current_user,
                            "model_response": asst_content
                        })
                        frontend_replay_turns.append({
                            "user": current_user,
                            "model": asst_content,
                            "latency_ms": lat,
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0
                        })
                        current_user = ""

            avg_lat = sum(latencies)/len(latencies) if latencies else 0
            
            replay_system_prompt = str(
                c.get("system_prompt") or system_prompt or DEFAULT_SOCRATIC_SYSTEM
            ).strip() or DEFAULT_SOCRATIC_SYSTEM
            ft_pre_generated_replays.append({
                "system_prompt": replay_system_prompt,
                "turns": turns_for_judge,
                "assistant_turns": asst_turns,
                "replay_turns": frontend_replay_turns,
                "avg_latency_ms": round(avg_lat, 2),
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
            })
            continue

        msgs = c.get("messages", [])
        if any(m.get("role") == "user" for m in msgs):
            cleaned = []
            for m in msgs:
                if cleaned and cleaned[-1]["role"] == m["role"] == "assistant":
                    cleaned[-1]["content"] += "\n" + m["content"]
                else:
                    cleaned.append(m)
            valid_convs.append({**c, "messages": cleaned})

    if not valid_convs:
        _eval_log(job_id, "[Eval] Không có conversation hợp lệ.")
        return

    total = len(valid_convs)
    is_paired = base_model is not None or bool(base_model_repo)
    eval_mode = "paired" if is_paired else "single"
    _eval_log(job_id, f"[📊] Mode: {eval_mode} | {total} conversations")

    _eval_log(job_id, f"[Eval Config] system_prompt_chars={len((system_prompt or '').strip())} max_new_tokens={max_new_tokens} temperature={temperature} top_p={top_p} repetition_penalty={repetition_penalty}")

    # 2. Warmup FT model
    if is_pre_generated_replay:
        _eval_log(job_id, "[⚙️] Bỏ qua suy luận, sử dụng dữ liệu replay có sẵn.")
        ft_replay = ft_pre_generated_replays
        base_replay = None
        eval_mode = "hybrid_router_end_to_end" # override
        _eval_progress(eval_job_id, "warmup", "GPU ready (bỏ qua)")
    else:
        _eval_log(job_id, "[⚙️] Warming up GPU...")
        active_model.eval()
        FastLanguageModel.for_inference(active_model)
        try:
            _d = tokenizer(["Xin chào"], return_tensors="pt").to("cuda")
            active_model.generate(**_d, max_new_tokens=5, pad_token_id=tokenizer.eos_token_id)
        except Exception:
            pass
        _eval_progress(eval_job_id, "warmup", "GPU ready")

        # 3. Replay FT model first
        ft_replay = _run_single_replay(
            job_id, eval_job_id, valid_convs,
            active_model, tokenizer,
            stage_key="replay_ft" if is_paired else "replay",
            label="Replay FT" if is_paired else "Replay",
            system_prompt=system_prompt,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
        )

        # Unload FT model to free VRAM completely for Base model or Judge
        del active_model; del tokenizer
        active_model = tokenizer = None
        gc.collect(); torch.cuda.empty_cache()
        _release_gpu_memory()
        _eval_log(job_id, "[🧹] Đã giải phóng FT model khỏi VRAM để tiết kiệm bộ nhớ.")

        base_replay = None
        if is_paired and base_model_repo:
            _eval_log(job_id, f"[🔄] Loading Base model cho Paired Replay: {base_model_repo}...")
            base_model, base_tokenizer = FastLanguageModel.from_pretrained(
                model_name=base_model_repo,
                max_seq_length=max(max_seq, 4096),
                load_in_4bit=True,
            )
            ensure_right_padding(base_tokenizer)
            base_model.eval()
            FastLanguageModel.for_inference(base_model)

            base_replay = _run_single_replay(
                job_id, eval_job_id, valid_convs,
                base_model, base_tokenizer,
                stage_key="replay_base", label="Replay Base",
                system_prompt=system_prompt,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
            )

            # Unload Base model immediately after Replay Base
            del base_model; del base_tokenizer
            base_model = base_tokenizer = None
            gc.collect(); torch.cuda.empty_cache()
            _release_gpu_memory()
            _eval_log(job_id, "[🧹] Đã giải phóng Base model khỏi VRAM.")

    # 4. Judge — dùng _run_batch_judge (BATCH_SIZE conv/call)
    ft_per_conv = _run_batch_judge(
        job_id, eval_job_id, valid_convs, ft_replay,
        judge_model,
        stage_key="judge_ft" if is_paired else "judge",
        label="Judge FT" if is_paired else "Judge"
    )
    for conv, result in zip(valid_convs, ft_per_conv):
        if result is not None:
            result["subject"] = str(conv.get("subject", "UNGROUPED"))
            result["selected_model"] = ft_model_repo
            result["route_strategy"] = "verified-subject-direct"

    base_per_conv = None
    if is_paired:
        base_per_conv = _run_batch_judge(
            job_id, eval_job_id, valid_convs, base_replay,
            judge_model,
            stage_key="judge_base", label="Judge Base"
        )
        for conv, result in zip(valid_convs, base_per_conv):
            if result is not None:
                result["subject"] = str(conv.get("subject", "UNGROUPED"))
                result["selected_model"] = base_model_repo
                result["route_strategy"] = "baseline-shared-model"

    # 5. Summarize
    _eval_progress(eval_job_id, "finalize", "")
    ft_summary   = _summarize(ft_per_conv)
    base_summary = _summarize(base_per_conv) if is_paired else None

    # 6. Delta (paired only)
    delta = None
    if is_paired and base_summary:
        delta = {
            "knowledge": round(ft_summary["knowledge"] - base_summary["knowledge"], 3),
            "socratic": round(ft_summary["socratic"] - base_summary["socratic"], 3),
            "exploratory_overall": None,
            "overall":  None,
            "group_a":  None,
            "group_b":  None,
            "group_c":  None,
            "group_d":  None,
            "criteria": {
                k: round(ft_summary["criteria"][k] - base_summary["criteria"].get(k, 0), 3)
                for k in ft_summary["criteria"]
            },
            "avg_latency_ms": round(ft_summary["avg_latency_ms"] - base_summary["avg_latency_ms"], 1),
        }

    # 7. Flags (dựa trên FT)
    ft_valid = [r for r in ft_per_conv if r is not None]
    eval_flags = _compute_eval_flags(ft_valid, {
        "knowledge": ft_summary["knowledge"],
        "socratic": ft_summary["socratic"],
        "avg_latency_ms": ft_summary["avg_latency_ms"],
    })

    _eval_log(job_id, f"[Primary] FT Knowledge K: {ft_summary['knowledge']:.3f}/5")
    _eval_log(job_id, f"[Primary] FT Socratic S: {ft_summary['socratic']:.3f}/5")
    _eval_log(job_id, "[Secondary] A1-D2 are reported independently; weighted legacy composites are retired.")
    if is_paired:
        _eval_log(job_id, f"     Base K/S: {base_summary['knowledge']:.3f}/{base_summary['socratic']:.3f}")
        _eval_log(job_id, f"     Delta K: {delta['knowledge']:+.3f}; Delta S: {delta['socratic']:+.3f}")
    if eval_flags:
        _eval_log(job_id, f"[⚠️] Flags: {', '.join(eval_flags)}")

    eval_result = {
        "modelEvalId":        eval_job_id,
        "jobId":              job_id,
        "status":             "COMPLETED",
        "evalMode":           eval_mode,
        "ftModelRepo":        ft_model_repo,
        "baseModelRepo":      base_model_repo,
        "totalConversations": total,
        "validConversations": len(ft_valid),
        "judgeModel":         judge_model,
        "flags":              eval_flags,
        "perConvResults":     ft_per_conv,
        "summary":            ft_summary,
        "basePerConvResults": base_per_conv,
        "baseSummary":        base_summary,
        "delta":              delta,
        "startedAt":          time.strftime('%Y-%m-%dT%H:%M:%SZ'),
        "completedAt":        time.strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    jobs_db[job_id]['eval_result'] = eval_result
    _eval_log(job_id, "[💾] Kết quả eval đã lưu vào jobs_db.")




def _eval_progress(eval_job_id, stage: str, detail: str = "", current: int = 0, total: int = 0, sample: dict = None):
    """C?p nh?t progress structured v?o eval_jobs_db."""
    if eval_job_id not in eval_jobs_db:
        return

    stage_info = EVAL_STAGES.get(stage, {"pct": 0, "label": stage})
    pct = stage_info["pct"]

    # Interpolate every long stage so progress does not look frozen at 28/53/87%.
    if total > 0 and stage in EVAL_STAGE_RANGES:
        start_pct, end_pct = EVAL_STAGE_RANGES[stage]
        pct = int(start_pct + (end_pct - start_pct) * min(current, total) / total)

    update = {
        "progress":      pct,
        "stage":         stage,
        "stage_label":   stage_info["label"],
        "stage_detail":  detail,
        "stage_current": current,
        "stage_total":   total,
    }
    if sample is not None:
        update["current_sample"] = sample

    eval_jobs_db[eval_job_id].update(update)
    _update_eval_manifest(eval_job_id, **update)
def background_eval_task(eval_job_id: str, job_id: str, hf_repo_id: str,
                          hf_token: str, eval_file_path: str, model_max_length: int,
                          judge_model: str = DEFAULT_JUDGE_MODEL,
                          judge_api_key: str = "",
                          base_hf_repo: str = "",
                          system_prompt: str = "",
                          protocol_mode: str = "locked_single_turn",
                          prompt_variant: str = "P1",
                          system_prompt_version: str = "",
                          subject_override: str = "",
                          max_new_tokens: int = 512,
                          warmup_runs: int = 1,
                          bootstrap_resamples: int = 10000,
                          bootstrap_seed: int = 42,
                          temperature: float = 0.2,
                          top_p: float = 0.9,
                          repetition_penalty: float = 1.15):
    """
    Chạy đánh giá độc lập — KHÔNG phụ thuộc vào train job.
    Load model từ HuggingFace Hub (hf_repo_id) vào GPU,
    chạy run_auto_evaluation(), lưu kết quả vào eval_jobs_db.
    """
    eval_jobs_db[eval_job_id]['status'] = 'RUNNING'
    _update_eval_manifest(eval_job_id, status='RUNNING')

    def _log(msg):
        print(msg)
        if eval_job_id in eval_jobs_db:
            eval_jobs_db[eval_job_id].setdefault('logs', []).append(msg)

    model = None
    tokenizer = None

    try:
        _judge_context.api_key = judge_api_key
        _release_gpu_memory()

        if protocol_mode != "locked_single_turn":
            _log(f"[🔄] Loading legacy model from HF Hub: {hf_repo_id}...")
            model, tokenizer = FastLanguageModel.from_pretrained(
                model_name=hf_repo_id,
                max_seq_length=max(model_max_length, 4096),
                load_in_4bit=True,
                token=hf_token or None,
            )
            ensure_right_padding(tokenizer)
        else:
            _log("[LOCKED] Base and Fine-tuned models will be loaded sequentially at immutable revisions.")

        base_model = base_tokenizer = None
        eval_jobs_db[eval_job_id]['status'] = 'EVALUATING'
        _log(f"[📊] Bắt đầu đánh giá: {eval_file_path}")

        _run_evaluation_for_eval_job(
            eval_job_id=eval_job_id,
            job_id=job_id,
            eval_file_path=eval_file_path,
            model=model,
            tokenizer=tokenizer,
            model_max_length=model_max_length,
            log_fn=_log,
            judge_model=judge_model,
            base_model=base_model,
            base_tokenizer=base_tokenizer,
            base_model_repo=base_hf_repo,
            ft_model_repo=hf_repo_id,
            system_prompt=system_prompt,
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_version=system_prompt_version,
            subject_override=subject_override,
            max_new_tokens=max_new_tokens,
            warmup_runs=warmup_runs,
            bootstrap_resamples=bootstrap_resamples,
            bootstrap_seed=bootstrap_seed,
            hf_token=hf_token,
            temperature=temperature,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
        )

        _log("[✅] Hoàn thành Eval.")
        eval_jobs_db[eval_job_id]['status'] = 'COMPLETED'
        _update_eval_manifest(eval_job_id, status='COMPLETED', error=None)

    except Exception as e:
        _log(f"[❌] LỖI EVAL: {e}")
        eval_jobs_db[eval_job_id].update({'status': 'INTERRUPTED', 'error': str(e)})
        _update_eval_manifest(eval_job_id, status='INTERRUPTED', error=str(e))

    finally:
        if 'base_model' in locals() and base_model is not None:
            del base_model
        if 'base_tokenizer' in locals() and base_tokenizer is not None:
            del base_tokenizer
        if 'model' in locals() and model is not None:
            del model
        if 'tokenizer' in locals() and tokenizer is not None:
            del tokenizer
        model = None
        tokenizer = None
        
        import gc
        gc.collect()
        torch.cuda.empty_cache()
        
        _release_gpu_memory()
        checkpoint_root = os.path.abspath(EVAL_CHECKPOINT_BASE)
        eval_path = os.path.abspath(eval_file_path) if eval_file_path else ''
        if eval_path and os.path.exists(eval_path) and not eval_path.startswith(checkpoint_root + os.sep):
            os.remove(eval_file_path)
            print(f"[🗑️] Đã xóa eval file tạm: {eval_file_path}")
        _eval_slot_release()
        if hasattr(_judge_context, "api_key"):
            delattr(_judge_context, "api_key")
        print(f"[Worker] Slot released — active={gpu_state._active_eval_count}/{GPU_EVAL_SLOTS}")


def _run_evaluation_for_eval_job(eval_job_id, job_id, eval_file_path,
                                  model, tokenizer, model_max_length, log_fn,
                                  judge_model=DEFAULT_JUDGE_MODEL,
                                  base_model=None, base_tokenizer=None,
                                  base_model_repo=None, ft_model_repo=None,
                                  system_prompt: str = "",
                                  protocol_mode: str = "locked_single_turn",
                                  prompt_variant: str = "P1",
                                  system_prompt_version: str = "",
                                  subject_override: str = "",
                                  max_new_tokens: int = 512,
                                  warmup_runs: int = 1,
                                  bootstrap_resamples: int = 10000,
                                  bootstrap_seed: int = 42,
                                  hf_token: str = "",
                                  temperature: float = 0.2,
                                  top_p: float = 0.9,
                                  repetition_penalty: float = 1.15):
    _tmp_key = f"__eval_tmp_{eval_job_id}"
    jobs_db[_tmp_key] = {'status': 'EVALUATING', 'logs': []}
    try:
        run_auto_evaluation(
            job_id=_tmp_key,
            eval_job_id=eval_job_id,
            eval_file_path=eval_file_path,
            active_model=model,
            tokenizer=tokenizer,
            max_seq=model_max_length,
            judge_model=judge_model,
            base_model=base_model,
            base_tokenizer=base_tokenizer,
            base_model_repo=base_model_repo,
            ft_model_repo=ft_model_repo,
            system_prompt=system_prompt,
            protocol_mode=protocol_mode,
            prompt_variant=prompt_variant,
            system_prompt_version=system_prompt_version,
            subject_override=subject_override,
            max_new_tokens=max_new_tokens,
            warmup_runs=warmup_runs,
            bootstrap_resamples=bootstrap_resamples,
            bootstrap_seed=bootstrap_seed,
            hf_token=hf_token,
            temperature=temperature,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
        )
        raw_result = jobs_db[_tmp_key].get('eval_result')
        if raw_result:
            raw_result['jobId'] = job_id
            raw_result['modelEvalId'] = eval_job_id
            eval_jobs_db.setdefault(eval_job_id, {})['result'] = raw_result
            _save_eval_checkpoint(eval_job_id, 'final_result', raw_result)
        else:
            raise RuntimeError("run_auto_evaluation hoàn thành nhưng không có eval_result")
    finally:
        jobs_db.pop(_tmp_key, None)








