"""Pure helpers for the locked Base-vs-Fine-tuned evaluation protocol.

This module deliberately has no dependency on Unsloth/Flask so the research
estimands and bootstrap implementation can be unit-tested on a CPU machine.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import statistics
from collections import defaultdict
from typing import Any, Callable, Iterable


LOCKED_SUBJECTS = ("ENGLISH", "MATH", "HISTORY")
SUBJECT_ALIASES = {
    "EN": "ENGLISH",
    "ENG": "ENGLISH",
    "ENGLISH": "ENGLISH",
    "TIENG_ANH": "ENGLISH",
    "TIẾNG ANH": "ENGLISH",
    "MATH": "MATH",
    "MATHEMATICS": "MATH",
    "TOAN": "MATH",
    "TOÁN": "MATH",
    "HIS": "HISTORY",
    "HIST": "HISTORY",
    "HISTORY": "HISTORY",
    "LICH_SU": "HISTORY",
    "LỊCH SỬ": "HISTORY",
}


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_json_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256_text(payload)


def normalize_subject(value: Any) -> str:
    if value is None:
        return "UNKNOWN"
    raw = str(value).strip().upper().replace("-", "_")
    return SUBJECT_ALIASES.get(raw, raw or "UNKNOWN")


def extract_item_metadata(conversation: dict, index: int) -> dict:
    metadata = conversation.get("metadata") if isinstance(conversation.get("metadata"), dict) else {}
    item_id = (
        conversation.get("item_id")
        or conversation.get("itemId")
        or conversation.get("id")
        or metadata.get("item_id")
        or metadata.get("id")
        or f"item_{index:04d}"
    )
    subject = (
        conversation.get("subject")
        or conversation.get("course")
        or conversation.get("label")
        or metadata.get("subject")
        or metadata.get("course")
        or metadata.get("label")
    )
    return {
        "item_id": str(item_id),
        "subject": normalize_subject(subject),
        "item_id_was_generated": not any(
            conversation.get(key) not in (None, "") for key in ("item_id", "itemId", "id")
        )
        and not any(metadata.get(key) not in (None, "") for key in ("item_id", "id")),
    }


def validate_locked_dataset(conversations: list[dict], strict: bool = True) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[str] = set()
    subjects: dict[str, int] = defaultdict(int)
    generated_ids = 0
    missing_references = 0

    if not conversations:
        errors.append("dataset is empty")

    for index, conversation in enumerate(conversations):
        meta = extract_item_metadata(conversation, index)
        item_id = meta["item_id"]
        subject = meta["subject"]
        subjects[subject] += 1
        generated_ids += int(meta["item_id_was_generated"])
        if not str(conversation.get("reference_answer") or "").strip() and not conversation.get("gold_key_points"):
            missing_references += 1

        messages = conversation.get("messages")
        if not isinstance(messages, list):
            errors.append(f"{item_id}: messages must be an array")
            continue
        user_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "user"]
        if len(user_messages) != 1:
            message = f"{item_id}: locked single-turn requires exactly one user message (found {len(user_messages)})"
            (errors if strict else warnings).append(message)
        if item_id in seen:
            errors.append(f"duplicate item_id: {item_id}")
        seen.add(item_id)
        if subject not in LOCKED_SUBJECTS:
            message = f"{item_id}: subject must be one of {LOCKED_SUBJECTS} (found {subject})"
            (errors if strict else warnings).append(message)

    if generated_ids:
        message = f"{generated_ids} item_id values were generated from row order; explicit stable item_id is required for a locked run"
        (errors if strict else warnings).append(message)

    observed_locked_counts = {
        locked_subject: subjects.get(locked_subject, 0)
        for locked_subject in LOCKED_SUBJECTS
        if subjects.get(locked_subject, 0) > 0
    }
    confirmatory_sample_size = bool(observed_locked_counts) and all(
        count == 50 for count in observed_locked_counts.values()
    )
    if strict and not confirmatory_sample_size:
        warnings.append(
            "confirmatory RP5 expects exactly 50 held-out items for every subject included in a run"
        )
    confirmatory_reference_coverage = bool(conversations) and missing_references == 0
    if strict and not confirmatory_reference_coverage:
        warnings.append(
            f"{missing_references} items have neither reference_answer nor gold_key_points; run is exploratory"
        )

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "item_count": len(conversations),
        "subject_counts": dict(sorted(subjects.items())),
        "expected_items_per_subject": 50,
        "confirmatory_sample_size": confirmatory_sample_size,
        "missing_reference_items": missing_references,
        "confirmatory_reference_coverage": confirmatory_reference_coverage,
        "dataset_hash": stable_json_hash(conversations),
    }


ADAPTIVE_LEARNER_STATES = ("correct", "partial", "misconception", "confused")


def extract_adaptive_metadata(conversation: dict) -> dict | None:
    """Return normalized Adaptive Socratic v1 metadata, when declared.

    Metadata may live under ``metadata.adaptive_socratic`` (preferred) or
    ``adaptive_socratic``. Merely having ordinary RP4 metadata does not opt an
    item into the diagnostic.
    """
    metadata = conversation.get("metadata") if isinstance(conversation.get("metadata"), dict) else {}
    raw = metadata.get("adaptive_socratic") or conversation.get("adaptive_socratic")
    if not isinstance(raw, dict):
        return None
    return {
        "contrastive_pair_id": str(raw.get("contrastive_pair_id") or raw.get("pair_id") or "").strip(),
        "learner_state": str(raw.get("learner_state") or "").strip().lower(),
        "misconception_key": str(raw.get("misconception_key") or "").strip(),
        "expected_strategy": str(raw.get("expected_strategy") or "").strip(),
    }


def validate_adaptive_dataset(conversations: list[dict]) -> dict:
    """Validate the optional contrastive Adaptive Socratic diagnostic.

    A valid unit is exactly two single-turn items about the same task, with
    distinct gold learner states and an expected tutoring strategy for each.
    O1 is evaluated once per pair; this prevents pseudo-replicating one
    pair-level personalization judgment as two independent observations.
    """
    annotated: list[tuple[str, dict, dict]] = []
    errors: list[str] = []
    for index, conversation in enumerate(conversations):
        adaptive = extract_adaptive_metadata(conversation)
        if adaptive is None:
            continue
        item_id = extract_item_metadata(conversation, index)["item_id"]
        pair_id = adaptive["contrastive_pair_id"]
        if not pair_id:
            errors.append(f"{item_id}: adaptive_socratic.contrastive_pair_id is required")
        if adaptive["learner_state"] not in ADAPTIVE_LEARNER_STATES:
            errors.append(
                f"{item_id}: learner_state must be one of {ADAPTIVE_LEARNER_STATES}"
            )
        if not adaptive["expected_strategy"]:
            errors.append(f"{item_id}: adaptive_socratic.expected_strategy is required")
        if not adaptive["misconception_key"]:
            errors.append(f"{item_id}: adaptive_socratic.misconception_key is required")
        annotated.append((item_id, conversation, adaptive))

    grouped: dict[str, list[tuple[str, dict, dict]]] = defaultdict(list)
    for row in annotated:
        if row[2]["contrastive_pair_id"]:
            grouped[row[2]["contrastive_pair_id"]].append(row)

    complete_pairs: list[dict] = []
    for pair_id, rows in sorted(grouped.items()):
        if len(rows) != 2:
            errors.append(f"{pair_id}: contrastive pair must contain exactly 2 items (found {len(rows)})")
            continue
        states = {row[2]["learner_state"] for row in rows}
        if len(states) != 2:
            errors.append(f"{pair_id}: the two items must have distinct learner_state labels")
            continue
        subjects = {extract_item_metadata(row[1], 0)["subject"] for row in rows}
        if len(subjects) != 1:
            errors.append(f"{pair_id}: both items must have the same subject")
            continue
        complete_pairs.append({
            "pair_id": pair_id,
            "item_ids": [row[0] for row in rows],
            "learner_states": sorted(states),
            "subject": next(iter(subjects)),
        })

    declared = bool(annotated)
    return {
        "protocol": "adaptive-socratic-diagnostic-v1",
        "declared": declared,
        "eligible": declared and not errors and bool(complete_pairs),
        "status": "eligible" if declared and not errors and complete_pairs else (
            "invalid" if declared else "not_declared"
        ),
        "annotated_items": len(annotated),
        "complete_pair_count": len(complete_pairs),
        "complete_pairs": complete_pairs,
        "errors": errors,
        "unit_of_analysis": "contrastive_pair",
        "confirmatory": False,
    }


def criterion_value(result: dict, metric: str) -> float | None:
    criteria = result.get("criteria_scores") or {}
    adaptive = result.get("adaptive_scores") or {}
    try:
        if metric == "K":
            return float(criteria["B1"])
        if metric == "S":
            raw = statistics.fmean(float(criteria[key]) for key in ("A1", "A2", "A3"))
            return min(raw, 1.0) if float(criteria["A1"]) <= 1.0 else raw
        if metric in ("A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "D1", "D2"):
            return float(criteria[metric])
        if metric == "V_A1":
            return 1.0 if float(criteria["A1"]) <= 1.0 else 0.0
        if metric in ("P1", "O1", "E1"):
            return float(adaptive[metric])
        if metric == "AS":
            return statistics.fmean(float(adaptive[key]) for key in ("P1", "O1", "E1"))
    except (KeyError, TypeError, ValueError):
        return None
    raise ValueError(f"Unknown metric: {metric}")


def paired_adaptive_statistics(
    ft_pairs: list[dict],
    base_pairs: list[dict],
    resamples: int = 10_000,
    seed: int = 42,
) -> dict:
    """Paired Base-vs-FT statistics at the contrastive-pair level."""
    # AS is the transparent equal-weight composite for this diagnostic only.
    # Holm correction remains attached to the three component hypotheses;
    # AS is not counted again in that family because it is derived from them.
    metrics = ("AS", "P1", "O1", "E1")
    rows = {
        metric: paired_bootstrap(ft_pairs, base_pairs, metric, resamples, seed)
        for metric in metrics
    }
    family = sorted(
        (
            (metric, float(row["bootstrap_p_two_sided"]))
            for metric, row in rows.items()
            if metric in ("P1", "O1", "E1")
            and row.get("status") == "ok" and row.get("bootstrap_p_two_sided") is not None
        ),
        key=lambda item: item[1],
    )
    running = 0.0
    for rank, (metric, p_value) in enumerate(family):
        adjusted = min(1.0, (len(family) - rank) * p_value)
        running = max(running, adjusted)
        rows[metric]["holm_p_adjusted"] = round(running, 6)
    return {
        "protocol": "adaptive-paired-contrastive-bootstrap-v1",
        "unit_of_analysis": "contrastive_pair",
        "resamples": int(resamples),
        "seed": int(seed),
        "criteria": rows,
    }


def distribution_summary(values: Iterable[float]) -> dict:
    clean = sorted(float(value) for value in values if value is not None and math.isfinite(float(value)))
    if not clean:
        return {"n": 0, "mean": None, "median": None, "sd": None, "p95": None}

    def percentile(p: float) -> float:
        if len(clean) == 1:
            return clean[0]
        position = (len(clean) - 1) * p
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return clean[lower]
        return clean[lower] * (upper - position) + clean[upper] * (position - lower)

    return {
        "n": len(clean),
        "mean": round(statistics.fmean(clean), 6),
        "median": round(statistics.median(clean), 6),
        "sd": round(statistics.stdev(clean), 6) if len(clean) > 1 else 0.0,
        "p95": round(percentile(0.95), 6),
    }


def _percentile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return float("nan")
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def _paired_rows(ft_results: list[dict], base_results: list[dict]) -> list[tuple[dict, dict]]:
    base_by_id = {
        str(result.get("item_id")): result
        for result in base_results
        if result and result.get("item_id") is not None
    }
    rows = []
    for ft in ft_results:
        if not ft or ft.get("item_id") is None:
            continue
        base = base_by_id.get(str(ft.get("item_id")))
        if base is not None:
            rows.append((ft, base))
    return rows


def paired_bootstrap(
    ft_results: list[dict],
    base_results: list[dict],
    metric: str,
    resamples: int = 10_000,
    seed: int = 42,
) -> dict:
    rows = []
    for ft, base in _paired_rows(ft_results, base_results):
        ft_value = criterion_value(ft, metric)
        base_value = criterion_value(base, metric)
        if ft_value is None or base_value is None:
            continue
        subject = normalize_subject(ft.get("subject") or base.get("subject"))
        rows.append((str(ft["item_id"]), subject, ft_value, base_value))

    if not rows:
        return {"metric": metric, "n": 0, "status": "not_testable"}

    differences = [ft_value - base_value for _, _, ft_value, base_value in rows]
    rng = random.Random(seed)
    boot_means = []
    n = len(differences)
    for _ in range(max(1, int(resamples))):
        boot_means.append(statistics.fmean(differences[rng.randrange(n)] for _ in range(n)))

    mean_delta = statistics.fmean(differences)
    sd_delta = statistics.stdev(differences) if n > 1 else 0.0
    effect_size_dz = mean_delta / sd_delta if sd_delta > 0 else None
    lower = _percentile(boot_means, 0.025)
    upper = _percentile(boot_means, 0.975)
    p_lower = sum(value <= 0 for value in boot_means) / len(boot_means)
    p_upper = sum(value >= 0 for value in boot_means) / len(boot_means)

    return {
        "metric": metric,
        "status": "ok",
        "n": n,
        "mean_delta": round(mean_delta, 6),
        "median_delta": round(statistics.median(differences), 6),
        "ci95": [round(lower, 6), round(upper, 6)],
        "effect_size_dz": round(effect_size_dz, 6) if effect_size_dz is not None else None,
        "bootstrap_p_two_sided": round(min(1.0, 2 * min(p_lower, p_upper)), 6),
        "wins": sum(value > 0 for value in differences),
        "ties": sum(value == 0 for value in differences),
        "losses": sum(value < 0 for value in differences),
        "resamples": int(resamples),
        "seed": int(seed),
    }


def macro_paired_bootstrap(
    ft_results: list[dict],
    base_results: list[dict],
    metric: str,
    resamples: int = 10_000,
    seed: int = 42,
) -> dict:
    grouped: dict[str, list[float]] = defaultdict(list)
    for ft, base in _paired_rows(ft_results, base_results):
        ft_value = criterion_value(ft, metric)
        base_value = criterion_value(base, metric)
        subject = normalize_subject(ft.get("subject") or base.get("subject"))
        if ft_value is not None and base_value is not None and subject in LOCKED_SUBJECTS:
            grouped[subject].append(ft_value - base_value)

    missing = [subject for subject in LOCKED_SUBJECTS if not grouped.get(subject)]
    if missing:
        return {
            "metric": metric,
            "status": "not_testable",
            "missing_subjects": missing,
            "subject_counts": {subject: len(grouped.get(subject, [])) for subject in LOCKED_SUBJECTS},
        }

    observed = statistics.fmean(statistics.fmean(grouped[subject]) for subject in LOCKED_SUBJECTS)
    rng = random.Random(seed)
    boot_macros = []
    for _ in range(max(1, int(resamples))):
        subject_means = []
        for subject in LOCKED_SUBJECTS:
            values = grouped[subject]
            subject_means.append(statistics.fmean(values[rng.randrange(len(values))] for _ in range(len(values))))
        boot_macros.append(statistics.fmean(subject_means))

    lower = _percentile(boot_macros, 0.025)
    upper = _percentile(boot_macros, 0.975)
    p_lower = sum(value <= 0 for value in boot_macros) / len(boot_macros)
    p_upper = sum(value >= 0 for value in boot_macros) / len(boot_macros)
    return {
        "metric": metric,
        "status": "ok",
        "mean_delta": round(observed, 6),
        "ci95": [round(lower, 6), round(upper, 6)],
        "bootstrap_p_two_sided": round(min(1.0, 2 * min(p_lower, p_upper)), 6),
        "subject_counts": {subject: len(grouped[subject]) for subject in LOCKED_SUBJECTS},
        "resamples": int(resamples),
        "seed": int(seed),
    }


def paired_research_statistics(
    ft_results: list[dict],
    base_results: list[dict],
    resamples: int = 10_000,
    seed: int = 42,
) -> dict:
    subjects = sorted(
        {
            normalize_subject(result.get("subject"))
            for result in ft_results
            if result and normalize_subject(result.get("subject")) in LOCKED_SUBJECTS
        }
    )
    # K/S remain the pre-registered primary outcomes. Every rubric dimension is
    # nevertheless tested and reported for the paired Base-vs-FT comparison.
    # D2 is operational latency scoring and is also accompanied by raw timing
    # summaries elsewhere in the artifact.
    criteria_metrics = ("A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "D1", "D2")
    metrics = ("K", "S", *criteria_metrics, "V_A1")
    per_subject: dict[str, dict] = {}
    for subject in subjects:
        ft_subset = [r for r in ft_results if r and normalize_subject(r.get("subject")) == subject]
        base_subset = [r for r in base_results if r and normalize_subject(r.get("subject")) == subject]
        per_subject[subject] = {
            metric: paired_bootstrap(ft_subset, base_subset, metric, resamples, seed)
            for metric in metrics
        }

    macro = {
        metric: macro_paired_bootstrap(ft_results, base_results, metric, resamples, seed)
        for metric in metrics
    }

    def attach_holm_adjustment(metric_rows: dict[str, dict]) -> None:
        """Adjust the A1-D1 secondary family without mixing in K/S or D2."""
        family = []
        for metric in criteria_metrics[:-1]:
            row = metric_rows.get(metric, {})
            p_value = row.get("bootstrap_p_two_sided")
            if row.get("status") == "ok" and p_value is not None:
                family.append((metric, float(p_value)))
        family.sort(key=lambda item: item[1])
        running = 0.0
        family_size = len(family)
        for rank, (metric, p_value) in enumerate(family):
            adjusted = min(1.0, (family_size - rank) * p_value)
            running = max(running, adjusted)
            metric_rows[metric]["holm_p_adjusted"] = round(running, 6)

    for subject_rows in per_subject.values():
        attach_holm_adjustment(subject_rows)
    attach_holm_adjustment(macro)
    return {
        "protocol": "paired-item-bootstrap-v1",
        "resamples": int(resamples),
        "seed": int(seed),
        "per_subject": per_subject,
        "macro_equal_weight": macro,
    }


def operational_summary(results: list[dict]) -> dict:
    successful = [r for r in results if r and r.get("generation_status") == "success"]
    planned = len(results)
    failure_count = sum(1 for r in results if r and r.get("first_attempt_failed"))
    output_limit_count = sum(1 for r in results if r and r.get("output_limit_reached"))
    fields = (
        "ttft_ms",
        "e2e_ms",
        "tpot_ms",
        "tokens_per_second",
        "tokens_per_minute",
        "words_per_minute",
        "characters_per_second",
        "input_tokens",
        "output_tokens",
        "peak_vram_allocated_mb",
    )
    return {
        "planned_items": planned,
        "successful_items": len(successful),
        "first_attempt_failures": failure_count,
        "failure_rate": round(failure_count / planned, 6) if planned else None,
        "output_limit_count": output_limit_count,
        "output_limit_rate": round(output_limit_count / planned, 6) if planned else None,
        "metrics": {
            field: distribution_summary(
                r.get("telemetry", {}).get(field)
                for r in successful
                if r.get("telemetry", {}).get(field) is not None
            )
            for field in fields
        },
    }


def paired_integrity(base_results: list[dict], ft_results: list[dict], requested_judge_model: str) -> dict:
    """Audit the locked Base/FT pairing before confirmatory analysis."""
    base_valid = [r for r in (base_results or []) if r is not None]
    ft_valid = [r for r in (ft_results or []) if r is not None]
    base_ids = [str(r.get("item_id")) for r in base_valid if r.get("item_id") is not None]
    ft_ids = [str(r.get("item_id")) for r in ft_valid if r.get("item_id") is not None]
    base_map = {str(r.get("item_id")): r for r in base_valid if r.get("item_id") is not None}
    ft_map = {str(r.get("item_id")): r for r in ft_valid if r.get("item_id") is not None}
    matched_ids = sorted(set(base_map) & set(ft_map))

    rendered_mismatches: list[str] = []
    system_prompt_mismatches: list[str] = []
    reference_mismatches: list[str] = []
    subject_mismatches: list[str] = []
    for item_id in matched_ids:
        base = base_map[item_id]
        ft = ft_map[item_id]
        base_trace = base.get("prompt_trace") or {}
        ft_trace = ft.get("prompt_trace") or {}
        if base_trace.get("rendered_input_hash") != ft_trace.get("rendered_input_hash"):
            rendered_mismatches.append(item_id)
        if base_trace.get("system_prompt_hash") != ft_trace.get("system_prompt_hash"):
            system_prompt_mismatches.append(item_id)
        if (base.get("reference_trace") or {}) != (ft.get("reference_trace") or {}):
            reference_mismatches.append(item_id)
        if normalize_subject(base.get("subject")) != normalize_subject(ft.get("subject")):
            subject_mismatches.append(item_id)

    all_results = base_valid + ft_valid
    judge_failures = [
        str(r.get("item_id")) for r in all_results if r.get("judge_status") == "failed"
    ]
    judge_model_mismatches: list[str] = []
    effective_models: set[str] = set()
    for result in all_results:
        if result.get("judge_status") != "success":
            continue
        effective = result.get("effective_judge_model")
        if effective:
            effective_models.add(str(effective))
        if not effective or str(effective) != str(requested_judge_model):
            judge_model_mismatches.append(str(result.get("item_id")))

    missing_from_base = sorted(set(ft_map) - set(base_map))
    missing_from_ft = sorted(set(base_map) - set(ft_map))
    duplicate_base_ids = sorted({item_id for item_id in base_ids if base_ids.count(item_id) > 1})
    duplicate_ft_ids = sorted({item_id for item_id in ft_ids if ft_ids.count(item_id) > 1})
    eligible = not any((
        missing_from_base,
        missing_from_ft,
        duplicate_base_ids,
        duplicate_ft_ids,
        rendered_mismatches,
        system_prompt_mismatches,
        reference_mismatches,
        subject_mismatches,
        judge_failures,
        judge_model_mismatches,
    )) and len(matched_ids) == len(base_valid) == len(ft_valid)

    return {
        "confirmatory_eligible": eligible,
        "base_items": len(base_valid),
        "fine_tuned_items": len(ft_valid),
        "matched_pairs": len(matched_ids),
        "missing_from_base": missing_from_base,
        "missing_from_fine_tuned": missing_from_ft,
        "duplicate_base_item_ids": duplicate_base_ids,
        "duplicate_fine_tuned_item_ids": duplicate_ft_ids,
        "rendered_input_hash_mismatches": rendered_mismatches,
        "system_prompt_hash_mismatches": system_prompt_mismatches,
        "reference_trace_mismatches": reference_mismatches,
        "subject_mismatches": subject_mismatches,
        "judge_measurement_failures": judge_failures,
        "effective_judge_models": sorted(effective_models),
        "judge_model_mismatches": judge_model_mismatches,
        "generation_failures_scored_zero": sum(
            1 for r in all_results
            if r.get("judge_status") == "not_required_generation_failure_scored_zero"
        ),
    }


def decide_hypotheses(statistics_result: dict, ft_results: list[dict], base_results: list[dict]) -> dict:
    macro = statistics_result.get("macro_equal_weight", {})

    def ci(metric: str) -> tuple[float, float] | None:
        value = macro.get(metric, {})
        interval = value.get("ci95") if value.get("status") == "ok" else None
        return tuple(interval) if interval and len(interval) == 2 else None

    k_ci = ci("K")
    s_ci = ci("S")
    dimension_cis = {metric: ci(metric) for metric in ("A1", "A2", "A3")}
    h1 = "supported" if k_ci and k_ci[0] > 0 else ("not_supported" if k_ci else "not_testable")
    h2_testable = s_ci is not None and all(value is not None for value in dimension_cis.values())
    # H2 is a superiority endpoint for S with a strict no-harm guardrail for
    # each Socratic component.  The lower CI bound must be non-negative: an
    # upper-bound check would allow a CI such as [-1.2, 0.1] to pass even
    # though substantial component degradation remains compatible with the
    # data.  If a future protocol adopts a non-inferiority margin, that
    # margin must be explicit and applied to the lower bound instead.
    h2 = (
        "supported"
        if h2_testable and s_ci[0] > 0 and all(value[0] >= 0 for value in dimension_cis.values() if value)
        else "not_supported" if h2_testable else "not_testable"
    )

    per_subject_decisions: dict[str, dict] = {}
    per_subject = statistics_result.get("per_subject", {})
    for subject, metrics in per_subject.items():
        gates: dict[str, bool | None] = {}
        for metric in ("K", "S", "A1", "A2", "A3"):
            interval = metrics.get(metric, {}).get("ci95")
            gates[f"{metric}_noninferiority"] = interval[0] >= -0.25 if interval else None
        violation_interval = metrics.get("V_A1", {}).get("ci95")
        gates["A1_violation_delta"] = violation_interval[1] <= 0.05 if violation_interval else None

        ft_subject = [r for r in ft_results if r and normalize_subject(r.get("subject")) == subject]
        base_subject = [r for r in base_results if r and normalize_subject(r.get("subject")) == subject]
        ft_tpot = [r.get("telemetry", {}).get("tpot_ms") for r in ft_subject]
        base_tpot = [r.get("telemetry", {}).get("tpot_ms") for r in base_subject]
        ft_tpot = [float(v) for v in ft_tpot if v is not None]
        base_tpot = [float(v) for v in base_tpot if v is not None]
        ratio = (
            statistics.median(ft_tpot) / statistics.median(base_tpot)
            if ft_tpot and base_tpot and statistics.median(base_tpot) > 0
            else None
        )
        gates["TPOT_ratio"] = ratio <= 1.10 if ratio is not None else None
        planned = len(ft_subject)
        failure_rate = (
            sum(1 for r in ft_subject if r.get("first_attempt_failed")) / planned
            if planned else None
        )
        gates["failure_rate"] = failure_rate <= 0.02 if failure_rate is not None else None
        testable = all(value is not None for value in gates.values())
        per_subject_decisions[subject] = {
            "decision": "supported" if testable and all(gates.values()) else "not_supported" if testable else "not_testable",
            "gates": gates,
            "tpot_ratio": round(ratio, 6) if ratio is not None else None,
            "first_attempt_failure_rate": round(failure_rate, 6) if failure_rate is not None else None,
        }

    return {
        "H1": h1,
        "H2": h2,
        "H3": "not_testable_without_reproducible_v1",
        "H4_by_subject": per_subject_decisions,
        "thresholds": {
            "quality_nondegradation_margin": -0.25,
            "a1_violation_delta_ucb_max": 0.05,
            "tpot_ratio_max": 1.10,
            "first_attempt_failure_rate_max": 0.02,
        },
    }
