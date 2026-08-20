import unsloth
from unsloth import FastLanguageModel, is_bfloat16_supported
import os
import json
import re
import threading
import time
import datetime
import shutil
import contextlib
import collections
import gc
import uuid
import traceback
import hashlib
import urllib.request
import urllib.error
import platform
import importlib.metadata

import torch
import pynvml

# Compatibility patch for peft / torchao LinearActivationQuantizedTensor mismatch
try:
    import torchao.quantization
    if not hasattr(torchao.quantization, "LinearActivationQuantizedTensor"):
        setattr(
            torchao.quantization,
            "LinearActivationQuantizedTensor",
            getattr(torchao.quantization, "AffineQuantizedTensor", object)
        )
except Exception:
    pass
import anthropic
from flask import Flask, request, jsonify, Response
from werkzeug.utils import secure_filename
from threading import Thread
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import silhouette_score


import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.cluster import DBSCAN, KMeans
from collections import defaultdict

# --- EMBEDDED locked_eval_protocol FOR KAGGLE STANDALONE ---
import sys as _locked_sys
import types as _locked_types
if "locked_eval_protocol" not in _locked_sys.modules:
    _locked_module = _locked_types.ModuleType("locked_eval_protocol")
    _locked_source = '"""Pure helpers for the locked Base-vs-Fine-tuned evaluation protocol.\n\nThis module deliberately has no dependency on Unsloth/Flask so the research\nestimands and bootstrap implementation can be unit-tested on a CPU machine.\n"""\n\nfrom __future__ import annotations\n\nimport hashlib\nimport json\nimport math\nimport random\nimport statistics\nfrom collections import defaultdict\nfrom typing import Any, Callable, Iterable\n\n\nLOCKED_SUBJECTS = ("ENGLISH", "MATH", "HISTORY")\nSUBJECT_ALIASES = {\n    "EN": "ENGLISH",\n    "ENG": "ENGLISH",\n    "ENGLISH": "ENGLISH",\n    "TIENG_ANH": "ENGLISH",\n    "TIẾNG ANH": "ENGLISH",\n    "MATH": "MATH",\n    "MATHEMATICS": "MATH",\n    "TOAN": "MATH",\n    "TOÁN": "MATH",\n    "HIS": "HISTORY",\n    "HIST": "HISTORY",\n    "HISTORY": "HISTORY",\n    "LICH_SU": "HISTORY",\n    "LỊCH SỬ": "HISTORY",\n}\n\n\ndef sha256_text(value: str) -> str:\n    return hashlib.sha256(value.encode("utf-8")).hexdigest()\n\n\ndef stable_json_hash(value: Any) -> str:\n    payload = json.dumps(\n        value,\n        ensure_ascii=False,\n        sort_keys=True,\n        separators=(",", ":"),\n    )\n    return sha256_text(payload)\n\n\ndef normalize_subject(value: Any) -> str:\n    if value is None:\n        return "UNKNOWN"\n    raw = str(value).strip().upper().replace("-", "_")\n    return SUBJECT_ALIASES.get(raw, raw or "UNKNOWN")\n\n\ndef extract_item_metadata(conversation: dict, index: int) -> dict:\n    metadata = conversation.get("metadata") if isinstance(conversation.get("metadata"), dict) else {}\n    item_id = (\n        conversation.get("item_id")\n        or conversation.get("itemId")\n        or conversation.get("id")\n        or metadata.get("item_id")\n        or metadata.get("id")\n        or f"item_{index:04d}"\n    )\n    subject = (\n        conversation.get("subject")\n        or conversation.get("course")\n        or conversation.get("label")\n        or metadata.get("subject")\n        or metadata.get("course")\n        or metadata.get("label")\n    )\n    return {\n        "item_id": str(item_id),\n        "subject": normalize_subject(subject),\n        "item_id_was_generated": not any(\n            conversation.get(key) not in (None, "") for key in ("item_id", "itemId", "id")\n        )\n        and not any(metadata.get(key) not in (None, "") for key in ("item_id", "id")),\n    }\n\n\ndef validate_locked_dataset(conversations: list[dict], strict: bool = True) -> dict:\n    errors: list[str] = []\n    warnings: list[str] = []\n    seen: set[str] = set()\n    subjects: dict[str, int] = defaultdict(int)\n    generated_ids = 0\n    missing_references = 0\n\n    if not conversations:\n        errors.append("dataset is empty")\n\n    for index, conversation in enumerate(conversations):\n        meta = extract_item_metadata(conversation, index)\n        item_id = meta["item_id"]\n        subject = meta["subject"]\n        subjects[subject] += 1\n        generated_ids += int(meta["item_id_was_generated"])\n        if not str(conversation.get("reference_answer") or "").strip() and not conversation.get("gold_key_points"):\n            missing_references += 1\n\n        messages = conversation.get("messages")\n        if not isinstance(messages, list):\n            errors.append(f"{item_id}: messages must be an array")\n            continue\n        user_messages = [m for m in messages if isinstance(m, dict) and m.get("role") == "user"]\n        if len(user_messages) < 1:\n            message = f"{item_id}: requires at least one user message (found {len(user_messages)})"\n            (errors if strict else warnings).append(message)\n        if item_id in seen:\n            errors.append(f"duplicate item_id: {item_id}")\n        seen.add(item_id)\n        if subject not in LOCKED_SUBJECTS:\n            message = f"{item_id}: subject must be one of {LOCKED_SUBJECTS} (found {subject})"\n            (errors if strict else warnings).append(message)\n\n    if generated_ids:\n        message = f"{generated_ids} item_id values were generated from row order; explicit stable item_id is required for a locked run"\n        (errors if strict else warnings).append(message)\n\n    observed_locked_counts = {\n        locked_subject: subjects.get(locked_subject, 0)\n        for locked_subject in LOCKED_SUBJECTS\n        if subjects.get(locked_subject, 0) > 0\n    }\n    confirmatory_sample_size = bool(observed_locked_counts) and all(\n        count == 50 for count in observed_locked_counts.values()\n    )\n    if strict and not confirmatory_sample_size:\n        warnings.append(\n            "confirmatory RP5 expects exactly 50 held-out items for every subject included in a run"\n        )\n    confirmatory_reference_coverage = bool(conversations) and missing_references == 0\n    if strict and not confirmatory_reference_coverage:\n        warnings.append(\n            f"{missing_references} items have neither reference_answer nor gold_key_points; run is exploratory"\n        )\n\n    return {\n        "valid": not errors,\n        "errors": errors,\n        "warnings": warnings,\n        "item_count": len(conversations),\n        "subject_counts": dict(sorted(subjects.items())),\n        "expected_items_per_subject": 50,\n        "confirmatory_sample_size": confirmatory_sample_size,\n        "missing_reference_items": missing_references,\n        "confirmatory_reference_coverage": confirmatory_reference_coverage,\n        "dataset_hash": stable_json_hash(conversations),\n    }\n\n\nADAPTIVE_LEARNER_STATES = ("correct", "partial", "misconception", "confused")\n\n\ndef extract_adaptive_metadata(conversation: dict) -> dict | None:\n    """Return normalized Adaptive Socratic v1 metadata, when declared.\n\n    Metadata may live under ``metadata.adaptive_socratic`` (preferred) or\n    ``adaptive_socratic``. Merely having ordinary RP4 metadata does not opt an\n    item into the diagnostic.\n    """\n    metadata = conversation.get("metadata") if isinstance(conversation.get("metadata"), dict) else {}\n    raw = metadata.get("adaptive_socratic") or conversation.get("adaptive_socratic")\n    if not isinstance(raw, dict):\n        return None\n    return {\n        "contrastive_pair_id": str(raw.get("contrastive_pair_id") or raw.get("pair_id") or "").strip(),\n        "learner_state": str(raw.get("learner_state") or "").strip().lower(),\n        "misconception_key": str(raw.get("misconception_key") or "").strip(),\n        "expected_strategy": str(raw.get("expected_strategy") or "").strip(),\n    }\n\n\ndef validate_adaptive_dataset(conversations: list[dict]) -> dict:\n    """Validate the optional contrastive Adaptive Socratic diagnostic.\n\n    A valid unit is exactly two single-turn items about the same task, with\n    distinct gold learner states and an expected tutoring strategy for each.\n    O1 is evaluated once per pair; this prevents pseudo-replicating one\n    pair-level personalization judgment as two independent observations.\n    """\n    annotated: list[tuple[str, dict, dict]] = []\n    errors: list[str] = []\n    for index, conversation in enumerate(conversations):\n        adaptive = extract_adaptive_metadata(conversation)\n        if adaptive is None:\n            continue\n        item_id = extract_item_metadata(conversation, index)["item_id"]\n        pair_id = adaptive["contrastive_pair_id"]\n        if not pair_id:\n            errors.append(f"{item_id}: adaptive_socratic.contrastive_pair_id is required")\n        if adaptive["learner_state"] not in ADAPTIVE_LEARNER_STATES:\n            errors.append(\n                f"{item_id}: learner_state must be one of {ADAPTIVE_LEARNER_STATES}"\n            )\n        if not adaptive["expected_strategy"]:\n            errors.append(f"{item_id}: adaptive_socratic.expected_strategy is required")\n        if not adaptive["misconception_key"]:\n            errors.append(f"{item_id}: adaptive_socratic.misconception_key is required")\n        annotated.append((item_id, conversation, adaptive))\n\n    grouped: dict[str, list[tuple[str, dict, dict]]] = defaultdict(list)\n    for row in annotated:\n        if row[2]["contrastive_pair_id"]:\n            grouped[row[2]["contrastive_pair_id"]].append(row)\n\n    complete_pairs: list[dict] = []\n    for pair_id, rows in sorted(grouped.items()):\n        if len(rows) != 2:\n            errors.append(f"{pair_id}: contrastive pair must contain exactly 2 items (found {len(rows)})")\n            continue\n        states = {row[2]["learner_state"] for row in rows}\n        if len(states) != 2:\n            errors.append(f"{pair_id}: the two items must have distinct learner_state labels")\n            continue\n        subjects = {extract_item_metadata(row[1], 0)["subject"] for row in rows}\n        if len(subjects) != 1:\n            errors.append(f"{pair_id}: both items must have the same subject")\n            continue\n        complete_pairs.append({\n            "pair_id": pair_id,\n            "item_ids": [row[0] for row in rows],\n            "learner_states": sorted(states),\n            "subject": next(iter(subjects)),\n        })\n\n    declared = bool(annotated)\n    return {\n        "protocol": "adaptive-socratic-diagnostic-v1",\n        "declared": declared,\n        "eligible": declared and not errors and bool(complete_pairs),\n        "status": "eligible" if declared and not errors and complete_pairs else (\n            "invalid" if declared else "not_declared"\n        ),\n        "annotated_items": len(annotated),\n        "complete_pair_count": len(complete_pairs),\n        "complete_pairs": complete_pairs,\n        "errors": errors,\n        "unit_of_analysis": "contrastive_pair",\n        "confirmatory": False,\n    }\n\n\ndef criterion_value(result: dict, metric: str) -> float | None:\n    criteria = result.get("criteria_scores") or {}\n    adaptive = result.get("adaptive_scores") or {}\n    try:\n        if metric == "K":\n            return float(criteria["B1"])\n        if metric == "S":\n            raw = statistics.fmean(float(criteria[key]) for key in ("A1", "A2", "A3"))\n            return min(raw, 1.0) if float(criteria["A1"]) <= 1.0 else raw\n        if metric in ("A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "D1", "D2"):\n            return float(criteria[metric])\n        if metric == "V_A1":\n            return 1.0 if float(criteria["A1"]) <= 1.0 else 0.0\n        if metric in ("P1", "O1", "E1"):\n            return float(adaptive[metric])\n        if metric == "AS":\n            return statistics.fmean(float(adaptive[key]) for key in ("P1", "O1", "E1"))\n    except (KeyError, TypeError, ValueError):\n        return None\n    raise ValueError(f"Unknown metric: {metric}")\n\n\ndef paired_adaptive_statistics(\n    ft_pairs: list[dict],\n    base_pairs: list[dict],\n    resamples: int = 10_000,\n    seed: int = 42,\n) -> dict:\n    """Paired Base-vs-FT statistics at the contrastive-pair level."""\n    # AS is the transparent equal-weight composite for this diagnostic only.\n    # Holm correction remains attached to the three component hypotheses;\n    # AS is not counted again in that family because it is derived from them.\n    metrics = ("AS", "P1", "O1", "E1")\n    rows = {\n        metric: paired_bootstrap(ft_pairs, base_pairs, metric, resamples, seed)\n        for metric in metrics\n    }\n    family = sorted(\n        (\n            (metric, float(row["bootstrap_p_two_sided"]))\n            for metric, row in rows.items()\n            if metric in ("P1", "O1", "E1")\n            and row.get("status") == "ok" and row.get("bootstrap_p_two_sided") is not None\n        ),\n        key=lambda item: item[1],\n    )\n    running = 0.0\n    for rank, (metric, p_value) in enumerate(family):\n        adjusted = min(1.0, (len(family) - rank) * p_value)\n        running = max(running, adjusted)\n        rows[metric]["holm_p_adjusted"] = round(running, 6)\n    return {\n        "protocol": "adaptive-paired-contrastive-bootstrap-v1",\n        "unit_of_analysis": "contrastive_pair",\n        "resamples": int(resamples),\n        "seed": int(seed),\n        "criteria": rows,\n    }\n\n\ndef distribution_summary(values: Iterable[float]) -> dict:\n    clean = sorted(float(value) for value in values if value is not None and math.isfinite(float(value)))\n    if not clean:\n        return {"n": 0, "mean": None, "median": None, "sd": None, "p95": None}\n\n    def percentile(p: float) -> float:\n        if len(clean) == 1:\n            return clean[0]\n        position = (len(clean) - 1) * p\n        lower = math.floor(position)\n        upper = math.ceil(position)\n        if lower == upper:\n            return clean[lower]\n        return clean[lower] * (upper - position) + clean[upper] * (position - lower)\n\n    return {\n        "n": len(clean),\n        "mean": round(statistics.fmean(clean), 6),\n        "median": round(statistics.median(clean), 6),\n        "sd": round(statistics.stdev(clean), 6) if len(clean) > 1 else 0.0,\n        "p95": round(percentile(0.95), 6),\n    }\n\n\ndef _percentile(values: list[float], probability: float) -> float:\n    ordered = sorted(values)\n    if not ordered:\n        return float("nan")\n    if len(ordered) == 1:\n        return ordered[0]\n    position = (len(ordered) - 1) * probability\n    lower = math.floor(position)\n    upper = math.ceil(position)\n    if lower == upper:\n        return ordered[lower]\n    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)\n\n\ndef _paired_rows(ft_results: list[dict], base_results: list[dict]) -> list[tuple[dict, dict]]:\n    base_by_id = {\n        str(result.get("item_id")): result\n        for result in base_results\n        if result and result.get("item_id") is not None\n    }\n    rows = []\n    for ft in ft_results:\n        if not ft or ft.get("item_id") is None:\n            continue\n        base = base_by_id.get(str(ft.get("item_id")))\n        if base is not None:\n            rows.append((ft, base))\n    return rows\n\n\ndef paired_bootstrap(\n    ft_results: list[dict],\n    base_results: list[dict],\n    metric: str,\n    resamples: int = 10_000,\n    seed: int = 42,\n) -> dict:\n    rows = []\n    for ft, base in _paired_rows(ft_results, base_results):\n        ft_value = criterion_value(ft, metric)\n        base_value = criterion_value(base, metric)\n        if ft_value is None or base_value is None:\n            continue\n        subject = normalize_subject(ft.get("subject") or base.get("subject"))\n        rows.append((str(ft["item_id"]), subject, ft_value, base_value))\n\n    if not rows:\n        return {"metric": metric, "n": 0, "status": "not_testable"}\n\n    differences = [ft_value - base_value for _, _, ft_value, base_value in rows]\n    rng = random.Random(seed)\n    boot_means = []\n    n = len(differences)\n    for _ in range(max(1, int(resamples))):\n        boot_means.append(statistics.fmean(differences[rng.randrange(n)] for _ in range(n)))\n\n    mean_delta = statistics.fmean(differences)\n    sd_delta = statistics.stdev(differences) if n > 1 else 0.0\n    effect_size_dz = mean_delta / sd_delta if sd_delta > 0 else None\n    lower = _percentile(boot_means, 0.025)\n    upper = _percentile(boot_means, 0.975)\n    p_lower = sum(value <= 0 for value in boot_means) / len(boot_means)\n    p_upper = sum(value >= 0 for value in boot_means) / len(boot_means)\n\n    return {\n        "metric": metric,\n        "status": "ok",\n        "n": n,\n        "mean_delta": round(mean_delta, 6),\n        "median_delta": round(statistics.median(differences), 6),\n        "ci95": [round(lower, 6), round(upper, 6)],\n        "effect_size_dz": round(effect_size_dz, 6) if effect_size_dz is not None else None,\n        "bootstrap_p_two_sided": round(min(1.0, 2 * min(p_lower, p_upper)), 6),\n        "wins": sum(value > 0 for value in differences),\n        "ties": sum(value == 0 for value in differences),\n        "losses": sum(value < 0 for value in differences),\n        "resamples": int(resamples),\n        "seed": int(seed),\n    }\n\n\ndef macro_paired_bootstrap(\n    ft_results: list[dict],\n    base_results: list[dict],\n    metric: str,\n    resamples: int = 10_000,\n    seed: int = 42,\n) -> dict:\n    grouped: dict[str, list[float]] = defaultdict(list)\n    for ft, base in _paired_rows(ft_results, base_results):\n        ft_value = criterion_value(ft, metric)\n        base_value = criterion_value(base, metric)\n        subject = normalize_subject(ft.get("subject") or base.get("subject"))\n        if ft_value is not None and base_value is not None and subject in LOCKED_SUBJECTS:\n            grouped[subject].append(ft_value - base_value)\n\n    missing = [subject for subject in LOCKED_SUBJECTS if not grouped.get(subject)]\n    if missing:\n        return {\n            "metric": metric,\n            "status": "not_testable",\n            "missing_subjects": missing,\n            "subject_counts": {subject: len(grouped.get(subject, [])) for subject in LOCKED_SUBJECTS},\n        }\n\n    observed = statistics.fmean(statistics.fmean(grouped[subject]) for subject in LOCKED_SUBJECTS)\n    rng = random.Random(seed)\n    boot_macros = []\n    for _ in range(max(1, int(resamples))):\n        subject_means = []\n        for subject in LOCKED_SUBJECTS:\n            values = grouped[subject]\n            subject_means.append(statistics.fmean(values[rng.randrange(len(values))] for _ in range(len(values))))\n        boot_macros.append(statistics.fmean(subject_means))\n\n    lower = _percentile(boot_macros, 0.025)\n    upper = _percentile(boot_macros, 0.975)\n    p_lower = sum(value <= 0 for value in boot_macros) / len(boot_macros)\n    p_upper = sum(value >= 0 for value in boot_macros) / len(boot_macros)\n    return {\n        "metric": metric,\n        "status": "ok",\n        "mean_delta": round(observed, 6),\n        "ci95": [round(lower, 6), round(upper, 6)],\n        "bootstrap_p_two_sided": round(min(1.0, 2 * min(p_lower, p_upper)), 6),\n        "subject_counts": {subject: len(grouped[subject]) for subject in LOCKED_SUBJECTS},\n        "resamples": int(resamples),\n        "seed": int(seed),\n    }\n\n\ndef paired_research_statistics(\n    ft_results: list[dict],\n    base_results: list[dict],\n    resamples: int = 10_000,\n    seed: int = 42,\n) -> dict:\n    subjects = sorted(\n        {\n            normalize_subject(result.get("subject"))\n            for result in ft_results\n            if result and normalize_subject(result.get("subject")) in LOCKED_SUBJECTS\n        }\n    )\n    # K/S remain the pre-registered primary outcomes. Every rubric dimension is\n    # nevertheless tested and reported for the paired Base-vs-FT comparison.\n    # D2 is operational latency scoring and is also accompanied by raw timing\n    # summaries elsewhere in the artifact.\n    criteria_metrics = ("A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3", "D1", "D2")\n    metrics = ("K", "S", *criteria_metrics, "V_A1")\n    per_subject: dict[str, dict] = {}\n    for subject in subjects:\n        ft_subset = [r for r in ft_results if r and normalize_subject(r.get("subject")) == subject]\n        base_subset = [r for r in base_results if r and normalize_subject(r.get("subject")) == subject]\n        per_subject[subject] = {\n            metric: paired_bootstrap(ft_subset, base_subset, metric, resamples, seed)\n            for metric in metrics\n        }\n\n    macro = {\n        metric: macro_paired_bootstrap(ft_results, base_results, metric, resamples, seed)\n        for metric in metrics\n    }\n\n    def attach_holm_adjustment(metric_rows: dict[str, dict]) -> None:\n        """Adjust the A1-D1 secondary family without mixing in K/S or D2."""\n        family = []\n        for metric in criteria_metrics[:-1]:\n            row = metric_rows.get(metric, {})\n            p_value = row.get("bootstrap_p_two_sided")\n            if row.get("status") == "ok" and p_value is not None:\n                family.append((metric, float(p_value)))\n        family.sort(key=lambda item: item[1])\n        running = 0.0\n        family_size = len(family)\n        for rank, (metric, p_value) in enumerate(family):\n            adjusted = min(1.0, (family_size - rank) * p_value)\n            running = max(running, adjusted)\n            metric_rows[metric]["holm_p_adjusted"] = round(running, 6)\n\n    for subject_rows in per_subject.values():\n        attach_holm_adjustment(subject_rows)\n    attach_holm_adjustment(macro)\n    return {\n        "protocol": "paired-item-bootstrap-v1",\n        "resamples": int(resamples),\n        "seed": int(seed),\n        "per_subject": per_subject,\n        "macro_equal_weight": macro,\n    }\n\n\ndef operational_summary(results: list[dict]) -> dict:\n    successful = [r for r in results if r and r.get("generation_status") == "success"]\n    planned = len(results)\n    failure_count = sum(1 for r in results if r and r.get("first_attempt_failed"))\n    output_limit_count = sum(1 for r in results if r and r.get("output_limit_reached"))\n    fields = (\n        "ttft_ms",\n        "e2e_ms",\n        "tpot_ms",\n        "tokens_per_second",\n        "tokens_per_minute",\n        "words_per_minute",\n        "characters_per_second",\n        "input_tokens",\n        "output_tokens",\n        "peak_vram_allocated_mb",\n    )\n    return {\n        "planned_items": planned,\n        "successful_items": len(successful),\n        "first_attempt_failures": failure_count,\n        "failure_rate": round(failure_count / planned, 6) if planned else None,\n        "output_limit_count": output_limit_count,\n        "output_limit_rate": round(output_limit_count / planned, 6) if planned else None,\n        "metrics": {\n            field: distribution_summary(\n                r.get("telemetry", {}).get(field)\n                for r in successful\n                if r.get("telemetry", {}).get(field) is not None\n            )\n            for field in fields\n        },\n    }\n\n\ndef paired_integrity(base_results: list[dict], ft_results: list[dict], requested_judge_model: str) -> dict:\n    """Audit the locked Base/FT pairing before confirmatory analysis."""\n    base_valid = [r for r in (base_results or []) if r is not None]\n    ft_valid = [r for r in (ft_results or []) if r is not None]\n    base_ids = [str(r.get("item_id")) for r in base_valid if r.get("item_id") is not None]\n    ft_ids = [str(r.get("item_id")) for r in ft_valid if r.get("item_id") is not None]\n    base_map = {str(r.get("item_id")): r for r in base_valid if r.get("item_id") is not None}\n    ft_map = {str(r.get("item_id")): r for r in ft_valid if r.get("item_id") is not None}\n    matched_ids = sorted(set(base_map) & set(ft_map))\n\n    rendered_mismatches: list[str] = []\n    system_prompt_mismatches: list[str] = []\n    reference_mismatches: list[str] = []\n    subject_mismatches: list[str] = []\n    for item_id in matched_ids:\n        base = base_map[item_id]\n        ft = ft_map[item_id]\n        base_trace = base.get("prompt_trace") or {}\n        ft_trace = ft.get("prompt_trace") or {}\n        if base_trace.get("rendered_input_hash") != ft_trace.get("rendered_input_hash"):\n            rendered_mismatches.append(item_id)\n        if base_trace.get("system_prompt_hash") != ft_trace.get("system_prompt_hash"):\n            system_prompt_mismatches.append(item_id)\n        if (base.get("reference_trace") or {}) != (ft.get("reference_trace") or {}):\n            reference_mismatches.append(item_id)\n        if normalize_subject(base.get("subject")) != normalize_subject(ft.get("subject")):\n            subject_mismatches.append(item_id)\n\n    all_results = base_valid + ft_valid\n    judge_failures = [\n        str(r.get("item_id")) for r in all_results if r.get("judge_status") == "failed"\n    ]\n    judge_model_mismatches: list[str] = []\n    effective_models: set[str] = set()\n    for result in all_results:\n        if result.get("judge_status") != "success":\n            continue\n        effective = result.get("effective_judge_model")\n        if effective:\n            effective_models.add(str(effective))\n        if not effective or str(effective) != str(requested_judge_model):\n            judge_model_mismatches.append(str(result.get("item_id")))\n\n    missing_from_base = sorted(set(ft_map) - set(base_map))\n    missing_from_ft = sorted(set(base_map) - set(ft_map))\n    duplicate_base_ids = sorted({item_id for item_id in base_ids if base_ids.count(item_id) > 1})\n    duplicate_ft_ids = sorted({item_id for item_id in ft_ids if ft_ids.count(item_id) > 1})\n    eligible = not any((\n        missing_from_base,\n        missing_from_ft,\n        duplicate_base_ids,\n        duplicate_ft_ids,\n        rendered_mismatches,\n        system_prompt_mismatches,\n        reference_mismatches,\n        subject_mismatches,\n        judge_failures,\n        judge_model_mismatches,\n    )) and len(matched_ids) == len(base_valid) == len(ft_valid)\n\n    return {\n        "confirmatory_eligible": eligible,\n        "base_items": len(base_valid),\n        "fine_tuned_items": len(ft_valid),\n        "matched_pairs": len(matched_ids),\n        "missing_from_base": missing_from_base,\n        "missing_from_fine_tuned": missing_from_ft,\n        "duplicate_base_item_ids": duplicate_base_ids,\n        "duplicate_fine_tuned_item_ids": duplicate_ft_ids,\n        "rendered_input_hash_mismatches": rendered_mismatches,\n        "system_prompt_hash_mismatches": system_prompt_mismatches,\n        "reference_trace_mismatches": reference_mismatches,\n        "subject_mismatches": subject_mismatches,\n        "judge_measurement_failures": judge_failures,\n        "effective_judge_models": sorted(effective_models),\n        "judge_model_mismatches": judge_model_mismatches,\n        "generation_failures_scored_zero": sum(\n            1 for r in all_results\n            if r.get("judge_status") == "not_required_generation_failure_scored_zero"\n        ),\n    }\n\n\ndef decide_hypotheses(statistics_result: dict, ft_results: list[dict], base_results: list[dict]) -> dict:\n    macro = statistics_result.get("macro_equal_weight", {})\n\n    def ci(metric: str) -> tuple[float, float] | None:\n        value = macro.get(metric, {})\n        interval = value.get("ci95") if value.get("status") == "ok" else None\n        return tuple(interval) if interval and len(interval) == 2 else None\n\n    k_ci = ci("K")\n    s_ci = ci("S")\n    dimension_cis = {metric: ci(metric) for metric in ("A1", "A2", "A3")}\n    h1 = "supported" if k_ci and k_ci[0] > 0 else ("not_supported" if k_ci else "not_testable")\n    h2_testable = s_ci is not None and all(value is not None for value in dimension_cis.values())\n    h2 = (\n        "supported"\n        if h2_testable and s_ci[0] > 0 and all(value[1] >= 0 for value in dimension_cis.values() if value)\n        else "not_supported" if h2_testable else "not_testable"\n    )\n\n    per_subject_decisions: dict[str, dict] = {}\n    per_subject = statistics_result.get("per_subject", {})\n    for subject, metrics in per_subject.items():\n        gates: dict[str, bool | None] = {}\n        for metric in ("K", "S", "A1", "A2", "A3"):\n            interval = metrics.get(metric, {}).get("ci95")\n            gates[f"{metric}_noninferiority"] = interval[0] >= -0.25 if interval else None\n        violation_interval = metrics.get("V_A1", {}).get("ci95")\n        gates["A1_violation_delta"] = violation_interval[1] <= 0.05 if violation_interval else None\n\n        ft_subject = [r for r in ft_results if r and normalize_subject(r.get("subject")) == subject]\n        base_subject = [r for r in base_results if r and normalize_subject(r.get("subject")) == subject]\n        ft_tpot = [r.get("telemetry", {}).get("tpot_ms") for r in ft_subject]\n        base_tpot = [r.get("telemetry", {}).get("tpot_ms") for r in base_subject]\n        ft_tpot = [float(v) for v in ft_tpot if v is not None]\n        base_tpot = [float(v) for v in base_tpot if v is not None]\n        ratio = (\n            statistics.median(ft_tpot) / statistics.median(base_tpot)\n            if ft_tpot and base_tpot and statistics.median(base_tpot) > 0\n            else None\n        )\n        gates["TPOT_ratio"] = ratio <= 1.10 if ratio is not None else None\n        planned = len(ft_subject)\n        failure_rate = (\n            sum(1 for r in ft_subject if r.get("first_attempt_failed")) / planned\n            if planned else None\n        )\n        gates["failure_rate"] = failure_rate <= 0.02 if failure_rate is not None else None\n        testable = all(value is not None for value in gates.values())\n        per_subject_decisions[subject] = {\n            "decision": "supported" if testable and all(gates.values()) else "not_supported" if testable else "not_testable",\n            "gates": gates,\n            "tpot_ratio": round(ratio, 6) if ratio is not None else None,\n            "first_attempt_failure_rate": round(failure_rate, 6) if failure_rate is not None else None,\n        }\n\n    return {\n        "H1": h1,\n        "H2": h2,\n        "H3": "not_testable_without_reproducible_v1",\n        "H4_by_subject": per_subject_decisions,\n        "thresholds": {\n            "quality_nondegradation_margin": -0.25,\n            "a1_violation_delta_ucb_max": 0.05,\n            "tpot_ratio_max": 1.10,\n            "first_attempt_failure_rate_max": 0.02,\n        },\n    }\n'
    exec(compile(_locked_source, "<embedded locked_eval_protocol>", "exec"), _locked_module.__dict__)
    _locked_sys.modules["locked_eval_protocol"] = _locked_module

from locked_eval_protocol import (
    decide_hypotheses,
    extract_adaptive_metadata,
    extract_item_metadata,
    normalize_subject,
    operational_summary,
    paired_adaptive_statistics,
    paired_integrity,
    paired_research_statistics,
    sha256_text,
    stable_json_hash,
    validate_adaptive_dataset,
    validate_locked_dataset,
)


# --- THƯ VIỆN AI ---

from datasets import load_dataset
from trl import SFTTrainer,SFTConfig
# from trl import DataCollatorForCompletionOnlyLM


from transformers import TrainingArguments, TrainerCallback, TextIteratorStreamer, DataCollatorWithPadding, DataCollatorForLanguageModeling
from huggingface_hub import login, HfApi, snapshot_download

# ======================================================================
# 0. DOCKER SECRETS HELPER
# Ưu tiên đọc từ /run/secrets/<name> (Docker Swarm Secrets)
# Fallback sang os.environ nếu không có (local dev / docker compose)
# ======================================================================
def _read_secret(name: str, default: str = "") -> str:
    """
    Đọc secret theo thứ tự ưu tiên:
      1. File /run/secrets/<name>  — Docker Swarm Secret
      2. Biến môi trường <name>    — docker-compose / local dev
      3. default
    """
    secret_path = f"/run/secrets/{name}"
    try:
        if os.path.isfile(secret_path):
            with open(secret_path, "r", encoding="utf-8") as f:
                value = f.read().strip()
            if value:
                return value
    except Exception:
        pass
    return os.environ.get(name, default)


# 0. CÀI ĐẶT MÔI TRƯỜNG
os.environ["TORCHDYNAMO_DISABLE"] = "1"
# Global synchronous CUDA materially distorts the latency being measured.
# Timed sections synchronize explicitly instead.
os.environ.setdefault('CUDA_LAUNCH_BLOCKING', '0')

app = Flask(__name__)
UPLOAD_FOLDER = './dataset_uploads'
LOCAL_CHECKPOINT_BASE = "/tmp/checkpoints_"
EVAL_CHECKPOINT_BASE = os.path.join(LOCAL_CHECKPOINT_BASE, "eval_jobs")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(LOCAL_CHECKPOINT_BASE, exist_ok=True)
os.makedirs(EVAL_CHECKPOINT_BASE, exist_ok=True)

_eval_checkpoint_lock = threading.RLock()


def _eval_checkpoint_dir(eval_job_id: str) -> str:
    path = os.path.join(EVAL_CHECKPOINT_BASE, secure_filename(eval_job_id))
    os.makedirs(path, exist_ok=True)
    return path


def _eval_checkpoint_path(eval_job_id: str, name: str) -> str:
    return os.path.join(_eval_checkpoint_dir(eval_job_id), f"{secure_filename(name)}.json")


def _save_eval_checkpoint(eval_job_id: str, name: str, value) -> None:
    """Atomically persist resumable eval state on the checkpoint volume."""
    path = _eval_checkpoint_path(eval_job_id, name)
    temp_path = f"{path}.tmp"
    with _eval_checkpoint_lock:
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)


def _load_eval_checkpoint(eval_job_id: str, name: str, default=None):
    path = _eval_checkpoint_path(eval_job_id, name)
    try:
        with _eval_checkpoint_lock, open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def _update_eval_manifest(eval_job_id: str, **updates) -> dict:
    manifest = _load_eval_checkpoint(eval_job_id, "manifest", {}) or {}
    manifest.update(updates)
    manifest["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    _save_eval_checkpoint(eval_job_id, "manifest", manifest)
    return manifest

jobs_db = {}
job_queue = collections.deque()
active_training_jobs = set()
MAX_CONCURRENT_JOBS = 1  # 1 GPU Colab runs only 1 job at a time
job_manager_last_heartbeat = 0.0

pynvml.nvmlInit()
gpu_handle = pynvml.nvmlDeviceGetHandleByIndex(0)

# Biến toàn cục cho inference cache và watchdog
_current_infer_model = None
_current_infer_tokenizer = None
_current_infer_model_id = None
last_heartbeat = time.time()

# ── Multi-slot model registry (instanceId → slot) ──────────────────
# Mỗi slot giữ 1 bộ (model, tokenizer, model_id) độc lập.
# instanceId=1 → slot 1  |  instanceId=2 → slot 2
_model_slots: dict = {}          # {slot_id: {"model", "tokenizer", "model_id"}}
_slot_locks: dict = {            # lock riêng per-slot — tránh race condition
    1: threading.Lock(),
    2: threading.Lock(),
}

from transformers import StoppingCriteria, StoppingCriteriaList
_slot_abort_events = {1: threading.Event(), 2: threading.Event()}

class AbortStoppingCriteria(StoppingCriteria):
    def __init__(self, event: threading.Event):
        self.event = event
    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.event.is_set()

last_heartbeat = time.time()
inference_logs_db = {}
_judge_context = threading.local()

# Giải phóng bộ nhớ GPU cho 1 slot cụ thể
def _release_slot(slot_id: int):
    slot = _model_slots.pop(slot_id, None)
    if slot is None:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            try:
                torch.cuda.ipc_collect()
            except Exception:
                pass
        return False
    del slot["model"]
    del slot["tokenizer"]
    del slot
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass
    print(f"\n--- Slot {slot_id}: GPU memory released ---\n")
    return True

# Giải phóng toàn bộ slots (backward-compat helper)
def _release_gpu_memory():
    for sid in list(_model_slots.keys()):
        _release_slot(sid)

def get_gpu_stats():
    """Lấy thông số sử dụng GPU và VRAM hiện tại."""
    try:
        info = pynvml.nvmlDeviceGetMemoryInfo(gpu_handle)
        vram_used_mb = info.used // (1024 * 1024)
        vram_total_mb = info.total // (1024 * 1024)
        util = pynvml.nvmlDeviceGetUtilizationRates(gpu_handle)
        gpu_util = util.gpu
        return vram_used_mb, vram_total_mb, gpu_util
    except:
        return 0, 0, 0

# ======================================================================


# ======================================================================
# SLOT MANAGEMENT — giới hạn eval jobs concurrent trên GPU
# ======================================================================

# T4 16GB: mỗi model 7B-4bit ~5GB → tối đa 3 slot
# Khi lên H100 chỉ cần đổi con số này
GPU_EVAL_SLOTS = 3
_eval_semaphore = threading.Semaphore(GPU_EVAL_SLOTS)
_active_eval_count = 0
_active_eval_lock  = threading.Lock()

def _eval_slot_acquire() -> bool:
    """Thử lấy slot. Trả về True nếu thành công, False nếu tất cả slot đang bận."""
    acquired = _eval_semaphore.acquire(blocking=False)
    if acquired:
        global _active_eval_count
        with _active_eval_lock:
            _active_eval_count += 1
    return acquired

def _eval_slot_release():
    """Giải phóng slot sau khi eval xong (dù thành công hay lỗi)."""
    global _active_eval_count
    with _active_eval_lock:
        _active_eval_count = max(0, _active_eval_count - 1)
    _eval_semaphore.release()

print('✅ Slot management ready')

# ======================================================================



# ======================================================================
# 1. CUSTOM CALLBACKS (CONSOLIDATED)
# ======================================================================
class FlaskProgressCallback(TrainerCallback):
    def __init__(self, job_id):
        self.job_id = job_id
        self.start_time = None
        self.last_loss = 0.0
        self.last_eval_loss = None
    def on_step_begin(self, args, state, control, **kwargs):
        if self.start_time is None:
            self.start_time = time.time()

    def on_log(self, args, state, control, logs=None, **kwargs):

        if not logs: return
        is_final_loss = 'train_loss' in logs
        if 'loss' in logs:
            self.last_loss = logs['loss']
        # elif 'train_loss' in logs:
        elif is_final_loss:
            self.last_loss = logs['train_loss']

        # --- PHẦN GIỮ NGUYÊN CODE CŨ CỦA BẠN ---
        loss_val = self.last_loss
        if "eval_loss" in logs:
            self.last_eval_loss = logs["eval_loss"]
        accuracy_val = round(logs.get("accuracy", 0) * 100, 2) if "accuracy" in logs else 0
        epoch_val = round(state.epoch or 0, 2)
        vram_used, _, gpu_util = get_gpu_stats()


        # Tính toán avg_step_time cho ETA (Giữ nguyên)
        avg_step_time = 0
        if self.start_time and state.global_step > 0:
            avg_step_time = (time.time() - self.start_time) / state.global_step

        # --- PHẦN BỔ SUNG ĐỂ TÍNH OVERFIT ---
        eval_loss = round(logs.get("eval_loss", 0), 4) if "eval_loss" in logs else None

        # Cập nhật dữ liệu cho Frontend (Bổ sung eval_loss vào metrics)
        update_payload = {
            'loss': loss_val,
            'epoch': epoch_val,
            'progress': round((state.global_step / state.max_steps) * 100, 2) if state.max_steps > 0 else 0,
            'avg_step_time': round(avg_step_time, 2),
            'total_steps_per_epoch': state.max_steps // max(1, int(state.epoch)) if state.epoch and state.epoch > 0 else state.max_steps,
            'metrics': {
                'loss': loss_val,
                'accuracy': accuracy_val,
                'vram': vram_used,
                'gpu_util': gpu_util
            }
        }

        # Nếu có Eval Loss (kết quả thi thử), gửi kèm về để vẽ biểu đồ Overfit
        if self.last_eval_loss is not None:
            update_payload['metrics']['eval_loss'] = round(self.last_eval_loss, 4)

        jobs_db[self.job_id].update(update_payload)

        # Ghi log dòng Step (Bổ sung hiển thị Eval Loss nếu có)
        log_line = f"Step {state.global_step} | Epoch {epoch_val} | Loss: {loss_val:.4f}"
        if eval_loss is not None:
            log_line += f" | Eval Loss (Overfit): {eval_loss:.4f}"

        if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
        jobs_db[self.job_id]['logs'].append(log_line)

    def on_save(self, args, state, control, **kwargs):
        # Giữ nguyên phần save checkpoint của bạn
        checkpoint_msg = f"💾 Checkpoint saved locally at step {state.global_step}."
        if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
        jobs_db[self.job_id]['logs'].append(checkpoint_msg)

class EnhancedWatchdogCallback(TrainerCallback):
    def __init__(self, job_id):
        self.job_id = job_id

    def on_step_end(self, args, state, control, **kwargs):
        # Training belongs to the worker, not to a browser/SSE connection.
        # LocalTunnel/Ngrok interruptions must never silently stop a valid job.
        if jobs_db.get(self.job_id, {}).get('status') == 'STOPPED':
            print(f"🛑 Stop signal detected for {self.job_id}. Halting...")
            control.should_training_stop = True

class AutoTrainEarlyStoppingCallback(TrainerCallback):
    def __init__(self, job_id, min_loss=0.5, patience=5):
        self.job_id = job_id
        self.min_loss = min_loss
        self.patience = patience
        # Early stopping must use the locked validation partition. A single
        # training batch is noisy and previously stopped the 3 comparable runs
        # at different steps (38, 41 and 56), invalidating the comparison.
        self.best_eval_loss = float('inf')
        self.steps_without_improvement = 0

    def on_log(self, args, state, control, logs=None, **kwargs):
        if not logs: return

        eval_loss = logs.get("eval_loss")
        if eval_loss is None:
            return

        if eval_loss < self.min_loss:
            msg = f"📉 Ngắt sớm: Eval Loss {eval_loss:.4f} đã đạt mục tiêu (< {self.min_loss})."
            self._log_to_db(msg)
            control.should_training_stop = True
            return

        if eval_loss < self.best_eval_loss:
            self.best_eval_loss = eval_loss
            self.steps_without_improvement = 0
        else:
            self.steps_without_improvement += 1
            if self.steps_without_improvement >= self.patience:
                msg = f"⏳ Tự động dừng: Eval Loss không giảm sau {self.patience} lần đánh giá."
                self._log_to_db(msg)
                control.should_training_stop = True

    def _log_to_db(self, msg):
        print(msg)
        if self.job_id in jobs_db:
            if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
            jobs_db[self.job_id]['logs'].append(msg)


# ======================================================================
# 2. FORMAT PROMPT (Hỗ trợ trích xuất System Prompt từ dữ liệu)
# ======================================================================

# Fallback prompt nếu trong data không có role system
DEFAULT_SOCRATIC_PROMPT = (
    "Bạn là một trợ lý giáo dục chuyên nghiệp. Nhiệm vụ của bạn là hỗ trợ học sinh "
    "theo phương pháp Socratic: không đưa ra câu trả lời trực tiếp mà sử dụng "
    "các câu hỏi gợi mở để học sinh tự tìm ra đáp án trong mô hình Lớp học đảo ngược."
)

# def formatting_prompts_func(examples, column_mapping="text"):
#     texts = []
#     has_messages = "messages" in examples

#     if has_messages:
#         batch_size = len(examples["messages"])
#     else:
#         col = column_mapping if column_mapping in examples else next(iter(examples.keys()))
#         batch_size = len(examples[col])

#     for i in range(batch_size):
#         instruction, output = "", ""
#         system_content = "" # Khởi tạo để hứng system prompt từ mẫu

#         if has_messages:
#             msgs = examples["messages"][i]
#             for m in msgs:
#                 role = m.get("role")
#                 content = m.get("content", "")

#                 if role == "system":
#                     system_content = content
#                 elif role == "user":
#                     instruction = content
#                 elif role == "assistant":
#                     output = content
#         else:
#             instruction = examples.get(column_mapping, [""])[i]
#             output = examples.get("output", examples.get("answer", [""]))[i]

#         # Sử dụng system prompt từ mẫu, nếu không có thì dùng mặc định
#         final_system = system_content if system_content else DEFAULT_SOCRATIC_PROMPT

#         text = f"### System:\n{final_system}\n\n### Instruction:\n{instruction}\n\n### Response:\n{output} <|endoftext|>"
#         texts.append(text)
#     return {"text": texts}


def formatting_prompts_func(examples, tokenizer, col_map="messages", default_system=None):
    texts = []

    # The AutoTrain prompt is the canonical condition for every training row.
    # Dataset exports may retain old row-level prompts from a previous version.
    canonical_system = str(default_system or "").strip()
    fallback_system = DEFAULT_SOCRATIC_PROMPT
    # Kiểm tra cột dữ liệu thực tế
    if col_map not in examples:
        # Nếu không tìm thấy cột map, thử dùng 'messages', 'conversations', 'instruction' hoặc cột đầu tiên không phải metadata/tracking
        if "messages" in examples:
            actual_col = "messages"
        elif "conversations" in examples:
            actual_col = "conversations"
        elif "instruction" in examples:
            actual_col = "instruction"
        else:
            valid_cols = [k for k in examples.keys() if k not in ["conversation_id", "conversationId", "id", "session_id", "sessionId"]]
            actual_col = valid_cols[0] if valid_cols else next(iter(examples.keys()))
    else:
        actual_col = col_map


    # Lặp qua từng example trong batch
    for raw_content in examples[actual_col]:
        messages = raw_content

        # Nếu là string (từ CSV), parse JSON
        if isinstance(messages, str):
            try:
                import json
                messages = json.loads(messages)
            except:
                # Nếu không phải JSON, coi như 1 câu user (fallback)
                messages = [{"role": "user", "content": messages}]

        # Đảm bảo là list
        if not isinstance(messages, list):
            messages = [{"role": "user", "content": str(messages)}]
        else:
            # Do not mutate source objects while Dataset.map reuses batches.
            messages = [dict(message) for message in messages if isinstance(message, dict)]

        # Kiểm tra xem mẫu đã có System Prompt chưa
        if canonical_system:
            # The prompt configured in AutoTrain wins over legacy prompts
            # embedded in individual dataset rows.
            messages = [msg for msg in messages if msg.get("role") != "system"]
            messages.insert(0, {"role": "system", "content": canonical_system})

        has_system = any(msg.get("role") == "system" for msg in messages if isinstance(msg, dict))

        # Nếu chưa có, chèn system prompt mặc định vào ĐẦU mảng
        if not has_system:
            messages.insert(0, {"role": "system", "content": fallback_system})

        # SỬ DỤNG TOKENIZER ĐỂ ÁP DỤNG CHAT TEMPLATE CỦA MÔ HÌNH
        try:
            formatted_text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False
            )
            texts.append(formatted_text)
        except Exception as e:
            # Fallback nếu template lỗi
            fallback_text = ""
            for msg in messages:
                if isinstance(msg, dict):
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    fallback_text += f"### {role.capitalize()}:\n{content}\n\n"
            texts.append(fallback_text)

    return {"text": texts}


class AssistantOnlyDataCollator:
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.text_tokenizer = getattr(tokenizer, "tokenizer", tokenizer)
        self.padder = DataCollatorWithPadding(tokenizer=self.text_tokenizer, padding=True)

        # DYNAMICALLY DETECT THE ASSISTANT HEADER BY FORMATTING A DUMMY MESSAGE
        try:
            dummy = [{"role": "assistant", "content": "MAGICAL_CONTENT_12345"}]
            formatted = tokenizer.apply_chat_template(dummy, tokenize=False, add_generation_prompt=False)
            start_idx = formatted.find("MAGICAL_CONTENT_12345")
            self.header_str = formatted[:start_idx].strip() # e.g. "<|im_start|>assistant" or "<start_of_turn>model"
            self.end_str = formatted[start_idx + len("MAGICAL_CONTENT_12345"):].strip() # e.g. "<|im_end|>" or "<end_of_turn>"
        except:
            self.header_str = "assistant\n"
            self.end_str = "\n"
            
    def __call__(self, features):
        batch = self.padder(features)
        input_ids = batch["input_ids"]
        attention_mask = batch["attention_mask"]

        # Default labels for Causal LM: input_ids with padding tokens masked to -100
        labels = torch.where(attention_mask == 1, input_ids, torch.tensor(-100, device=input_ids.device))

        for row in range(input_ids.shape[0]):
            sequence = input_ids[row].tolist()
            
            # Map token indices to their string equivalents for robust substring matching
            decoded_text = self.text_tokenizer.decode(sequence)
            if isinstance(decoded_text, list):
                decoded_text = "".join(decoded_text)
            
            import re
            
            # Find all match spans using dynamic header & fallbacks
            safe_header = re.escape(str(self.header_str))
            matches = list(re.finditer(safe_header, decoded_text))
            
            if not matches:
                fallback_headers = [
                    r"<\|im_start\|>assistant",
                    r"<start_of_turn>model",
                    r"<\|start_header_id\|>assistant",
                    r"### Response:",
                    r"### Assistant:",
                    r"### assistant:",
                    r"Assistant:\n",
                    r"assistant\n",
                ]
                for fb in fallback_headers:
                    matches = list(re.finditer(fb, decoded_text))
                    if matches:
                        break
                
            if not matches:
                continue
                
            row_labels = torch.full_like(input_ids[row], -100)
            cursor = 0
            assistant_tokens = 0
            
            for match in matches:
                char_start = match.end() # Content starts right after the header
                char_end = len(decoded_text)
                
                # Find the end of the response using string matching
                if self.end_str:
                    found_end = decoded_text.find(str(self.end_str), char_start)
                    if found_end != -1:
                        char_end = found_end
                        
                # Binary search for content_start_tok
                low, high = cursor, len(sequence)
                content_start_tok = high
                while low < high:
                    mid = (low + high) // 2
                    prefix = self.text_tokenizer.decode(sequence[:mid])
                    if isinstance(prefix, list): prefix = "".join(prefix)
                    if len(prefix) >= char_start:
                        content_start_tok = mid
                        high = mid
                    else:
                        low = mid + 1
                        
                if content_start_tok == len(sequence):
                    continue
                    
                # Binary search for content_end_tok
                low, high = content_start_tok, len(sequence)
                content_end_tok = high
                while low < high:
                    mid = (low + high) // 2
                    prefix = self.text_tokenizer.decode(sequence[:mid])
                    if isinstance(prefix, list): prefix = "".join(prefix)
                    if len(prefix) >= char_end:
                        content_end_tok = mid
                        high = mid
                    else:
                        low = mid + 1
                        
                # Ensure we don't go beyond the attention mask
                valid_length = int(attention_mask[row].sum().item())
                content_end_tok = min(content_end_tok, valid_length)
                
                row_labels[content_start_tok:content_end_tok] = input_ids[row, content_start_tok:content_end_tok]
                assistant_tokens += max(0, content_end_tok - content_start_tok)
                cursor = content_end_tok

            row_labels[attention_mask[row] == 0] = -100
            if assistant_tokens > 0:
                labels[row] = row_labels
                
        batch["labels"] = labels
        return batch


import nltk
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
from rouge_score import rouge_scorer

nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

def compute_ngram_metrics(expected: str, answer: str) -> dict:
    """Tính BLEU-1 và ROUGE-L giữa answer và expected reference."""
    if not expected or not answer:
        return {"bleu": 0.0, "rouge_l": 0.0}
    try:
        ref_tokens = nltk.word_tokenize(expected.lower())
        hyp_tokens = nltk.word_tokenize(answer.lower())
        smoothie = SmoothingFunction().method1
        bleu = round(sentence_bleu([ref_tokens], hyp_tokens, smoothing_function=smoothie), 4)
    except Exception:
        bleu = 0.0
    try:
        scorer = rouge_scorer.RougeScorer(['rougeL'], use_stemmer=False)
        rouge_l = round(scorer.score(expected, answer)['rougeL'].fmeasure, 4)
    except Exception:
        rouge_l = 0.0
    return {"bleu": bleu, "rouge_l": rouge_l}

print('✅ N-gram metrics (BLEU + ROUGE-L) sẵn sàng.')


def compute_question_detection_rate(assistant_turns: list[str]) -> float:
    """
    T?nh t? l? turn c?a assistant k?t th?c b?ng c?u h?i.
    Non-scoring metric ? ch? d?ng ?? ph?n t?ch xu h??ng.

    Logic: turn ???c coi l? c? c?u h?i n?u:
      - K?t th?c b?ng '?' (sau khi strip whitespace), HO?C
      - Ch?a '?' ? trong 100 k? t? cu?i (h? tr? c?u h?i kh?ng ? cu?i c?ng)

    Returns: float trong [0.0, 1.0]
    """
    if not assistant_turns:
        return 0.0

    count = 0
    for turn in assistant_turns:
        text = turn.strip()
        # Ki?m tra 100 k? t? cu?i ?? b?t c?u h?i embedded
        tail = text[-100:] if len(text) > 100 else text
        if '?' in tail:
            count += 1

    return round(count / len(assistant_turns), 4)

print('? Question Detection Rate s?n s?ng.')



# ======================================================================
# 3. AUTO EVALUATION — Claude LLM Judge (Multi-turn Socratic)
# ======================================================================

def _eval_log(job_id: str, msg: str):
    """Ghi log vào jobs_db[job_id]['logs'] và in ra console."""
    print(msg)
    if job_id in jobs_db:
        jobs_db[job_id].setdefault('logs', []).append(msg)

def _get_backend_url():
    url = _read_secret("BACKEND_URL")
    if url: return url.rstrip("/")
    return "http://localhost:3000"

BACKEND_URL = _get_backend_url()
print(f"[Config] BACKEND_URL = {BACKEND_URL}")

def _get_api_key():
    return getattr(_judge_context, "api_key", "") or _read_secret("OPENROUTER_API_KEY")

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

# ── System prompt inject khi dataset không có role=system ────────────
DEFAULT_SOCRATIC_SYSTEM = (
    "Bạn là một gia sư thông minh, hỗ trợ học sinh THCS và THPT Việt Nam học tập "
    "theo phương pháp lớp học đảo ngược (Flipped Classroom).\n\n"
    "VAI TRÒ CỦA BẠN:\n"
    "- Không giảng lại lý thuyết từ đầu — học sinh đã tự học trước ở nhà.\n"
    "- Khi học sinh hỏi, hãy ưu tiên đặt câu hỏi gợi mở để kiểm tra mức độ hiểu "
    "và kích thích tư duy trước khi giải thích.\n"
    "- Hướng dẫn từng bước nhỏ, không đưa đáp án ngay — giúp học sinh tự tìm ra.\n"
    "- Nếu học sinh thực sự bí hoặc đã thử nhiều lần, mới giải thích chi tiết hơn.\n"
    "- Khen ngợi đúng lúc khi học sinh suy nghĩ đúng hướng.\n\n"
    "CÁCH GIAO TIẾP:\n"
    "- Tiếng Việt hoàn toàn.\n"
    "- Thân thiện như bạn bè nhưng đáng tin cậy.\n"
    "- Câu ngắn gọn, rõ ý. Tránh giải thích dài dòng khi chưa cần thiết."
)

BATCH_SIZE = 5  # số conversation mỗi lần gọi API

# ── System prompt: judge nhận ARRAY conversations ─────────────────────
SOCRATIC_JUDGE_SYSTEM_BATCH = """Bạn là chuyên gia đánh giá chất lượng hội thoại gia sư theo phương pháp Socratic.
Bạn sẽ nhận một DANH SÁCH các hội thoại được đánh số. Chấm điểm TỪNG hội thoại độc lập theo 9 tiêu chí (thang 0-5).
Ưu tiên ghi nhận những điểm tốt — chỉ trừ điểm khi lỗi rõ ràng và ảnh hưởng đến chất lượng học tập.
Lưu ý đặc biệt: A1 ≤ 1 (liên tục đưa đáp án trực tiếp mà không dẫn dắt) là một violation flag cần báo cáo riêng. Không dùng cờ này để hạ điểm K/S hoặc để thay thế các điểm B, C, D.

NGUYÊN TẮC ĐỘC LẬP TIÊU CHÍ — BẮT BUỘC:
- A1 CHỈ đo việc gia sư có tự tiết lộ đáp án/lời giải mà học sinh chưa nêu hay không.
- Câu hỏi mơ hồ, lạc đề, lặp lại hoặc kém hiệu quả KHÔNG được dùng để hạ A1; hãy trừ ở A2, A3, C1 hoặc C2.
- Nếu gia sư chỉ đặt câu hỏi và không tiết lộ đáp án/lời giải, A1 phải từ 4 đến 5, dù câu hỏi có thể rất kém.
- Xác nhận lại một kết quả mà chính học sinh vừa đưa ra không được xem là tiết lộ đáp án trực tiếp.
- A1 chỉ được bằng 0 hoặc 1 khi gia sư tự đưa đáp án/lời giải trực tiếp ở nhiều lượt hoặc ngay từ đầu.
- B1 chỉ đo tính đúng sai kiến thức; văn phong khó hiểu nhưng không chứa khẳng định sai phải trừ ở B2/C2, không tự động cho B1=0.

VÍ DỤ HIỆU CHỈNH:
Học sinh: "Em lấy 90/8." Gia sư: "Tử số của xác suất nên biểu diễn đại lượng nào?"
=> A1=5 vì không lộ đáp án. Nếu câu hỏi này không giúp ích thì A2 có thể thấp, nhưng A1 vẫn cao.

CHỈ trả về JSON array, không có text khác.

TIÊU CHÍ:

A1 - Answer Withholding (Không đưa đáp án trực tiếp):
5: Không bao giờ đưa đáp án trong toàn hội thoại, mọi turn đều dẫn dắt.
4: Phần lớn giữ được; chỉ 1 turn hint khá rõ nhưng học sinh vẫn phải tự suy nghĩ thêm.
3: Có 1-2 turn cung cấp gợi ý gần như lộ đáp án, nhưng không đưa thẳng lời giải.
2: Có 1 turn đưa đáp án trực tiếp, nhưng phần còn lại của hội thoại vẫn duy trì phương pháp Socratic.
1: Đưa đáp án trực tiếp ở nhiều turn, dẫn dắt rất ít.
0: Đưa đáp án ngay từ đầu hoặc liên tục mà không cố gắng dẫn dắt.

A2 - Scaffolding Quality (Chất lượng câu hỏi dẫn dắt):
5: Câu hỏi cụ thể, bám sát nội dung, từng bước thu hẹp khoảng cách nhận thức.
4: Câu hỏi đúng hướng, đôi khi hơi chung nhưng học sinh vẫn có thể theo dõi được.
3: Câu hỏi phần lớn phù hợp nhưng đôi khi không kết nối tốt với câu trả lời trước hoặc quá rộng.
2: Câu hỏi lặp lại hoặc thiếu liên kết context; học sinh có thể bị bối rối ở một số turn.
1: Câu hỏi hầu như không bám sát nội dung hoặc context của học sinh.
0: Không có câu hỏi dẫn dắt nào, hoặc câu hỏi hoàn toàn lạc đề.

A3 - Adaptive Response (Phản ứng thích ứng):
5: Phản ứng phù hợp với tất cả kiểu input học sinh trong suốt hội thoại.
4: Phần lớn thích ứng tốt; chỉ 1 turn xử lý chưa tối ưu nhưng không gây cản trở học tập.
3: Đa số turn phản ứng phù hợp; có 2-3 turn xử lý hơi cứng hoặc chưa bắt đúng ý học sinh.
2: Có xu hướng phản ứng theo kịch bản; một số turn bỏ qua context rõ ràng của học sinh.
1: Thường xuyên không thích ứng; hầu hết các turn không phản ánh những gì học sinh vừa nói.
0: Bỏ qua hoàn toàn context của học sinh, trả lời theo kịch bản cố định.

B1 - Factual Accuracy (Độ chính xác kiến thức):
5: Không có lỗi kiến thức nào trong toàn hội thoại.
4: Có tối đa 1 lỗi nhỏ hoặc diễn đạt chưa chính xác hoàn toàn, không gây hiểu nhầm.
3: Có 1-2 chỗ không chính xác hoặc thiếu độ chính xác, nhưng kiến thức cốt lõi vẫn đúng.
2: Có lỗi kiến thức rõ ràng có thể khiến học sinh học sai, dù không phải toàn bộ hội thoại.
1: Nhiều lỗi kiến thức hoặc 1 lỗi nghiêm trọng ảnh hưởng đến hiểu biết của học sinh.
0: Sai kiến thức nghiêm trọng hoặc bịa đặt nội dung bài học.

B2 - Grade-level Appropriateness (Phù hợp trình độ cấp 2-3):
5: Ngôn ngữ thân thiện, ví dụ gần gũi, độ khó vừa đủ với THCS/THPT.
4: Phần lớn phù hợp; một vài thuật ngữ hơi chuyên sâu nhưng không cản trở hiểu.
3: Nhìn chung phù hợp; đôi khi quá học thuật hoặc quá đơn giản ở một số đoạn.
2: Có nhiều đoạn không phù hợp trình độ (quá khó hoặc quá dễ) nhưng vẫn có phần tốt.
1: Phần lớn hội thoại không phù hợp trình độ học sinh.
0: Hoàn toàn không phù hợp trình độ.

C1 - Robustness (Xử lý input mơ hồ/off-topic):
5: Luôn xử lý mượt — redirect về bài học tự nhiên hoặc phản hồi phù hợp context.
4: Hầu hết ổn; đôi khi bị lúng túng nhưng nhanh chóng lấy lại hướng.
3: Phần lớn xử lý được; bị confuse ở 1-2 turn nhưng không làm gián đoạn hội thoại đáng kể.
2: Xử lý không nhất quán; một số input đơn giản (như "ok", "xin chào") khiến mất hướng.
1: Thường xuyên mất hướng, khó lấy lại context sau các input mơ hồ.
0: Bịa context bài học từ system prompt không có thông tin, hoặc không phản hồi được gì có ích.

C2 - Conversational Coherence (Mạch lạc hội thoại):
5: Hội thoại mạch lạc xuyên suốt, mỗi turn kế thừa tốt câu trả lời trước.
4: Phần lớn mạch lạc; có 1-2 turn hơi rời rạc nhưng luồng tổng thể vẫn rõ ràng.
3: Mạch lạc ở mức khá; đôi khi lặp câu hỏi hoặc bỏ sót context nhưng không làm mất luồng chính.
2: Có dấu hiệu thiếu nhớ context; một số đoạn hội thoại cảm giác bị ngắt quãng.
1: Thường xuyên không nhớ context, hội thoại phần lớn rời rạc.
0: Mỗi turn hoàn toàn độc lập, không có sự kết nối.

C3 - Tone & Encouragement (Giọng điệu & khích lệ):
5: Tone nhất quán — ấm áp, khích lệ, không phán xét, phù hợp lứa tuổi.
4: Tone tốt; đôi khi hơi trang trọng hoặc ít khích lệ hơn mức lý tưởng.
3: Tone phần lớn tích cực; thỉnh thoảng hơi lạnh hoặc trung lập, nhưng không gây tác động tiêu cực.
2: Tone không nhất quán; có một số lúc khô khan hoặc hơi có hàm ý phán xét.
1: Tone khô khan xuyên suốt hoặc có câu từ phán xét rõ ràng khi học sinh mắc lỗi.
0: Không có yếu tố động viên nào, hoặc tone hoàn toàn không phù hợp lứa tuổi.

D1 - Hallucination Score:
5: Không có nội dung bịa đặt nào trong toàn hội thoại.
4: Có 1 chi tiết nhỏ không chắc chắn nhưng không gây hiểu nhầm hoặc ảnh hưởng đến học tập.
3: Có 1-2 thông tin không hoàn toàn chính xác nhưng mang tính ngoài lề, không ảnh hưởng nội dung chính.
2: Bịa 1 thông tin cụ thể (tên, số liệu, sự kiện) nhưng phần lớn nội dung vẫn đáng tin cậy.
1: Bịa nhiều thông tin cụ thể hoặc 1 thông tin sai quan trọng ảnh hưởng đến nội dung học.
0: Bịa context bài học, bịa câu trả lời của học sinh, hoặc sai fact nghiêm trọng.

Trả về JSON array, mỗi phần tử tương ứng với 1 hội thoại theo đúng thứ tự:
[
  {
    "conv_index": 0,
    "A1_answer_withholding": {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "A2_scaffolding_quality": {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "A3_adaptive_response":  {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "B1_factual_accuracy":   {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "B2_grade_level":        {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "C1_robustness":         {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "C2_coherence":          {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "C3_tone":               {"score": <0-5>, "reason": "<1-2 câu ngắn>"},
    "D1_hallucination":      {"score": <0-5>, "reason": "<1-2 câu ngắn>"}
  },
  ...
]
CHỈ trả về JSON array, không có text khác."""

# ── Lookup: short key → full JSON key ─────────────────────────────────
# Runtime replacement for the legacy literal above, which was saved using a
# wrong Windows encoding and became unreadable mojibake.
DEFAULT_SOCRATIC_SYSTEM = (
    "Bạn là gia sư áp dụng phương pháp Socratic dành cho học sinh THCS và THPT Việt Nam. "
    "Mục tiêu: giúp học sinh TỰ tìm ra kiến thức qua câu hỏi dẫn dắt, KHÔNG đưa đáp án ngay.\n\n"
    "QUY TẮC CỐT LÕI (CẤU TRÚC 2 VẾ BẮT BUỘC):\n"
    "1. Mỗi phản hồi BẮT BUỘC phải gồm đúng 2 vế (độ dài 30–50 từ):\n"
    "   - Vế 1 (Gợi mở bối cảnh/manh mối): Nhắc nhẹ 1 chi tiết, mốc thời gian, công thức hoặc dữ kiện liên quan trong bài đọc/bài toán để làm điểm tựa tư duy.\n"
    "   - Vế 2 (Câu hỏi dẫn dắt cụ thể): Đặt đúng 1 câu hỏi gợi mở bám sát manh mối vừa nêu để học sinh tự suy luận.\n"
    "2. KHÔNG trả lời cộc lốc (không chỉ đặt 1 câu hỏi trống không dưới 15 từ).\n"
    "3. KHÔNG nổ đáp án trực tiếp, KHÔNG dùng câu hỏi rập khuôn rỗng tuếch ('dữ kiện nền cần bám là').\n"
    "4. Ngôn ngữ gần gũi với học sinh cấp 2–3, giọng điệu khích lệ, kiên nhẫn sư phạm."
)

JUDGE_REFERENCE_POLICY = (
    "\n\nREFERENCE POLICY: When a reference answer or gold key points are provided, "
    "use them only as hidden scoring evidence for factual coverage. They were never "
    "shown to Base or Fine-tuned models. Do not reward verbatim copying, and do not "
    "penalize a different but correct Socratic path.\n"
    "HUMAN-ALIGNED RUBRIC POLICY: A2 covers stepwise scaffolding, correct mistake "
    "detection, and a concrete actionable next step. A3 covers adaptation and "
    "personalization to the learner's latest response and apparent level. B2 covers "
    "grade-level fit. C2 covers multi-turn context consistency. C3 covers patient, "
    "encouraging, non-judgmental tone. D1 covers invented facts, context, sources, "
    "or learner statements. Score these dimensions independently. A1 <= 1 is the "
    "answer-withholding guardrail; the application applies the non-compensatory "
    "Socratic cap after scoring."
)

_CRITERIA_KEYS = [
    "A1_answer_withholding", "A2_scaffolding_quality", "A3_adaptive_response",
    "B1_factual_accuracy", "B2_grade_level", "C1_robustness",
    "C2_coherence", "C3_tone", "D1_hallucination",
]
_SHORT_TO_FULL = {
    "A1": "A1_answer_withholding",
    "A2": "A2_scaffolding_quality",
    "A3": "A3_adaptive_response",
    "B1": "B1_factual_accuracy",
    "B2": "B2_grade_level",
    "C1": "C1_robustness",
    "C2": "C2_coherence",
    "C3": "C3_tone",
    "D1": "D1_hallucination",
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

# ── Scoring constants ─────────────────────────────────────────────────
EVAL_STAGES = {
    "warmup":      {"pct": 3,  "label": "Khởi động GPU"},
    "replay_base": {"pct": 28, "label": "Replay Base model"},
    "replay_ft":   {"pct": 53, "label": "Replay FT model"},
    "replay":      {"pct": 53, "label": "Replay conversations"},
    "judge_base":  {"pct": 70, "label": "Chấm điểm Base model"},
    "judge_ft":    {"pct": 87, "label": "Chấm điểm FT model"},
    "judge":       {"pct": 87, "label": "Chấm điểm LLM judge"},
    "finalize":    {"pct": 98, "label": "Tổng hợp kết quả"},
}
EVAL_STAGE_RANGES = {
    "replay_base": (3, 28),
    "replay_ft": (28, 53),
    "replay": (3, 53),
    "judge_base": (53, 70),
    "judge_ft": (53, 87),
    "judge": (53, 87),
}

# OpenRouter no longer exposes the legacy `-001` identifier.  Keeping that
# stale name made every Judge request return HTTP 400 and the old fallback
# silently displayed those failures as zero scores.
DEFAULT_JUDGE_MODEL = "google/gemini-2.5-flash"

def _score_latency(avg_ms: float) -> float:
    if avg_ms <= 2000:  return 5.0
    if avg_ms <= 4000:  return 4.0
    if avg_ms <= 7000:  return 3.0
    if avg_ms <= 12000: return 2.0
    return 1.0

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

    effective_judge = judge_model
    if effective_judge in ("DeepSeek-V4-Flash", "", None):
        effective_judge = "google/gemini-2.5-flash"
    payload = json.dumps({
        "model": effective_judge,
        "max_tokens": 1500 * len(batch_replays),
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SOCRATIC_JUDGE_SYSTEM_BATCH + JUDGE_REFERENCE_POLICY + retry_contract},
            {"role": "user", "content": batch_text},
        ],
        "provider": {"allow_fallbacks": True},
    }).encode("utf-8")
    openrouter_request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "SEP490 AIFC Evaluation",
            "X-OpenRouter-Metadata": "enabled",
        },
    )
    try:
        with urllib.request.urlopen(openrouter_request, timeout=180) as response:
            response_data = json.loads(response.read().decode("utf-8"))
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
        judge_request = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "SEP490 Adaptive Socratic Diagnostic",
            },
        )
        with urllib.request.urlopen(judge_request, timeout=120) as response:
            envelope = json.loads(response.read().decode("utf-8"))
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
        _eval_log(job_id, f"[Eval] Lá»—i Ä‘á» c file: {e}")
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

    # 2. Warmup FT model (Bá» qua vÃ¬ ta sáº½ khá»Ÿi Ä‘á»™ng tá»«ng model)
    _eval_progress(eval_job_id, "warmup", "GPU ready")

    # 3. Replay
    # --- Tá»I Æ¯U Bá»˜ NHá»š: Cháº¡y Replay Base trÆ°á»›c, rá»“i xÃ³a khá»i RAM, sau Ä‘Ã³ má»›i cháº¡y Replay FT ---
    base_replay = None
    load_metrics = {}
    tokenizer_manifests = {}
    if is_paired:
        _eval_log(job_id, "[ðŸ”„] Loading Base model Ä‘á»ƒ Replay...")
        import gc, torch
        load_started = time.perf_counter()
        base_model, base_tokenizer = FastLanguageModel.from_pretrained(
            model_name=base_model_repo,
            revision=resolved_revisions["base"],
            max_seq_length=effective_max_seq,
            load_in_4bit=True,
            token=effective_hf_token,
        )
        if getattr(base_tokenizer, "pad_token", None) is None:
            base_tokenizer.pad_token = base_tokenizer.eos_token
        base_tokenizer.padding_side = "right"
        tokenizer_manifests["base"] = _tokenizer_manifest(base_tokenizer)
        try:
            torch.cuda.synchronize()
        except Exception:
            pass
        load_metrics["base_load_ms"] = round((time.perf_counter() - load_started) * 1000, 3)
        load_metrics["base_vram_allocated_after_load_mb"] = round(torch.cuda.memory_allocated() / (1024 ** 2), 3)

        for warm_index in range(max(0, int(warmup_runs))):
            _eval_log(job_id, f"[ðŸ”¥] Base warm-up {warm_index + 1}/{warmup_runs}")
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
        _eval_log(job_id, "[ðŸ—‘ï¸] XÃ³a Base model khá»i GPU Ä‘á»ƒ nhÆ°á»ng chá»— cho FT model...")
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
    _eval_log(job_id, f"[ðŸ”„] Loading FT model ({ft_model_repo}) Ä‘á»ƒ Replay...")
    import gc, torch
    load_started = time.perf_counter()
    ft_model, ft_tokenizer = FastLanguageModel.from_pretrained(
        model_name=ft_model_repo,
        revision=resolved_revisions["fine_tuned"],
        max_seq_length=effective_max_seq,
        load_in_4bit=True,
        token=effective_hf_token,
    )
    if getattr(ft_tokenizer, "pad_token", None) is None:
        ft_tokenizer.pad_token = ft_tokenizer.eos_token
    ft_tokenizer.padding_side = "right"
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
            if getattr(base_tokenizer, "pad_token", None) is None:
                base_tokenizer.pad_token = base_tokenizer.eos_token
            base_tokenizer.padding_side = "right"
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


# ======================================================================
# 2. LÕI HUẤN LUYỆN (CORE TRAINING)
# ======================================================================
def background_train_task(job_id, config, filepath, validation_filepath, hf_token):
    jobs_db[job_id]['status'] = 'TRAINING'
    local_job_dir = os.path.join(LOCAL_CHECKPOINT_BASE, job_id)
    hf_repo_id = config.get('hf_repo_id')

    try:
        if hf_token:
            print(f"🔑 Logging into Hugging Face for job {job_id}...")
            login(token=hf_token)

            if hf_repo_id and "/" not in hf_repo_id:
                api = HfApi()
                user_info = api.whoami(token=hf_token)
                username = user_info['name']
                hf_repo_id = f"{username}/{hf_repo_id}"
                print(f"📝 Updated repo ID to: {hf_repo_id}")

            if hf_repo_id and config.get('push_to_hub'):
                from huggingface_hub import create_repo
                try:
                    create_repo(repo_id=hf_repo_id, token=hf_token, repo_type="model", exist_ok=True)
                    print(f"✅ Repository {hf_repo_id} is ready.")
                except Exception as e:
                    print(f"⚠️ Warning creating repo: {e}")

        os.makedirs(local_job_dir, exist_ok=True)
        _release_gpu_memory()

        dtype = torch.bfloat16 if is_bfloat16_supported() else torch.float16
        print(f"[*] Loading model with dtype: {dtype}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=config['model_name'],
            max_seq_length=config['modelMaxLength'],
            dtype=dtype,
            load_in_4bit=True,
            token=hf_token or None,
        )

        # Cấu hình Chat Template cho OpenAI format
        from unsloth import get_chat_template
        tokenizer = get_chat_template(
            tokenizer,
            chat_template = "chatml", # Hoặc dùng mapping tự động dựa trên model_name
            mapping = {"role" : "role", "content" : "content", "user" : "user", "assistant" : "assistant", "system" : "system"},
        )


        if getattr(tokenizer, "pad_token", None) is None:
            tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "right"

        model = FastLanguageModel.get_peft_model(
            model,
            r=config['r'],
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            lora_alpha=config['lora_alpha'],
            lora_dropout=config['lora_dropout'],
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=config['random_state'],
        )

        col_map = config.get('column_mapping') or config.get('dataset_text_field') or 'text'
        sys_prompt = config.get('system_prompt')
        print(f"[Dataset] Using column mapping: {col_map}")
        if sys_prompt:
            print(f"[Dataset] Using custom system prompt: {sys_prompt[:50]}...")

        if filepath:
            ext = os.path.splitext(filepath)[1]
            dataset = load_dataset('json' if 'json' in ext else 'csv', data_files=filepath, split='train')
        elif config.get('dataset_hf_id'):
            dataset = load_dataset(config['dataset_hf_id'], split='train')
        else:
            raise ValueError("No dataset source provided.")

        # dataset = dataset.train_test_split(test_size=0.1, seed=42)


        # dataset_train = dataset["train"].map(lambda x: formatting_prompts_func(x, tokenizer), batched=True)
        # dataset_eval  = dataset["test"].map(lambda x: formatting_prompts_func(x, tokenizer), batched=True)

        # # Map dữ liệu
        # # dataset_train = dataset["train"].map(formatting_prompts_func, batched=True)
        # # dataset_eval  = dataset["test"].map(formatting_prompts_func, batched=True)

        # print("Text:",dataset_train[0]['text'])

        if len(dataset) == 0:
            raise ValueError("Dataset is empty. Please check your data file.")

        print(f"[Dataset] Loaded {len(dataset)} examples.")

        # V2: ưu tiên validation partition đã được Split Guard khóa từ trước.
        # Không re-split train vì việc đó làm mất tính truy vết của thí nghiệm.
        if validation_filepath:
            validation_ext = os.path.splitext(validation_filepath)[1]
            validation_dataset = load_dataset(
                'json' if 'json' in validation_ext else 'csv',
                data_files=validation_filepath,
                split='train',
            )
            dataset_train = dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval = validation_dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            print(f"[Dataset] Using locked validation partition: {len(validation_dataset)} examples.")
        # Legacy upload: only split internally when no explicit validation exists.
        elif len(dataset) >= 10:
            dataset = dataset.train_test_split(test_size=0.1, seed=42)
            dataset_train = dataset["train"].map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval  = dataset["test"].map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
        else:
            print("[Dataset] Warning: Dataset too small for splitting. Using entire dataset for training.")
            dataset_train = dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval  = None

        if len(dataset_train) > 0:
            print("Sample text:", dataset_train[0]['text'][:200], "...")
        else:
            print("[Dataset] Warning: dataset_train is empty after mapping.")

        if "text" not in dataset_train.column_names:
            raise ValueError("Formatted training dataset is missing the required 'text' column.")
        dataset_train = dataset_train.select_columns(["text"])
        if dataset_eval is not None:
            if "text" not in dataset_eval.column_names:
                raise ValueError("Formatted validation dataset is missing the required 'text' column.")
            dataset_eval = dataset_eval.select_columns(["text"])

        resume_from = None
        # A new training job must start from the base model. The target HF repo
        # may already contain `last-checkpoint`, but that does not mean the
        # user requested resume. Only the explicit Resume action supplies
        # `checkpoint_hf_repo`.
        resume_repo_id = config.get("checkpoint_hf_repo")
        resume_worker_checkpoint = config.get("checkpoint_source") == "worker"

        def _is_valid_checkpoint_dir(p):
            if not os.path.isdir(p):
                return False
            return (
                os.path.isfile(os.path.join(p, "trainer_state.json"))
                or os.path.isfile(os.path.join(p, "optimizer.pt"))
                or os.path.isfile(os.path.join(p, "scheduler.pt"))
                or os.path.isfile(os.path.join(p, "training_args.bin"))
            )

        def _pick_valid_checkpoint_under(p):
            if _is_valid_checkpoint_dir(p):
                return p
            try:
                children = [
                    os.path.join(p, d)
                    for d in os.listdir(p)
                    if os.path.isdir(os.path.join(p, d))
                ]
                for c in children:
                    if _is_valid_checkpoint_dir(c):
                        return c
            except Exception as e:
                print(f"[*] Could not scan checkpoint dir {p}: {e}")
            return None

        def _normalize_checkpoint_rng_state(checkpoint_dir):
            """Normalize RNG files produced by older/different HF stacks."""
            import glob as _glob

            def _as_tuple(value):
                if isinstance(value, list):
                    return tuple(_as_tuple(item) for item in value)
                if isinstance(value, tuple):
                    return tuple(_as_tuple(item) for item in value)
                return value

            for rng_file in _glob.glob(os.path.join(checkpoint_dir, "rng_state*.pth")):
                try:
                    rng_state = torch.load(rng_file, map_location="cpu", weights_only=False)
                    if not isinstance(rng_state, dict):
                        continue

                    changed = False
                    python_state = rng_state.get("python")
                    if isinstance(python_state, list):
                        rng_state["python"] = _as_tuple(python_state)
                        changed = True

                    numpy_state = rng_state.get("numpy")
                    if isinstance(numpy_state, list):
                        numpy_state = list(numpy_state)
                        if len(numpy_state) > 1 and isinstance(numpy_state[1], list):
                            numpy_state[1] = np.asarray(numpy_state[1], dtype=np.uint32)
                        rng_state["numpy"] = tuple(numpy_state)
                        changed = True
                    elif isinstance(numpy_state, tuple) and len(numpy_state) > 1 and isinstance(numpy_state[1], list):
                        numpy_state = list(numpy_state)
                        numpy_state[1] = np.asarray(numpy_state[1], dtype=np.uint32)
                        rng_state["numpy"] = tuple(numpy_state)
                        changed = True

                    for device_key in ("cpu", "cuda", "xla", "npu", "hpu", "mlu", "musa"):
                        device_state = rng_state.get(device_key)
                        if isinstance(device_state, list) and all(isinstance(item, int) for item in device_state):
                            rng_state[device_key] = torch.tensor(device_state, dtype=torch.uint8)
                            changed = True

                    if changed:
                        torch.save(rng_state, rng_file)
                        print(f"[*] Normalized legacy RNG state: {rng_file}")
                except Exception as rng_error:
                    os.remove(rng_file)
                    print(f"[!] Removed incompatible RNG state {rng_file}: {rng_error}")

        if resume_worker_checkpoint:
            resume_from = _pick_valid_checkpoint_under(local_job_dir)
            if not resume_from:
                raise ValueError(f"Can't find a persistent worker checkpoint for job {job_id}")
            print(f"[✅] Resuming from persistent worker checkpoint: {resume_from}")
            jobs_db[job_id].setdefault('logs', []).append(
                f"Resuming from persistent worker checkpoint: {resume_from}"
            )
            _normalize_checkpoint_rng_state(resume_from)

        if resume_repo_id:
            try:
                snapshot_download(
                    repo_id=resume_repo_id,
                    local_dir=local_job_dir,
                    token=hf_token,
                    allow_patterns=[
                        "last-checkpoint",
                        "last-checkpoint/*",
                        "last-checkpoint/*/*",
                        "last-checkpoint/*/*/*",
                        "*.json",
                        "*.bin",
                        "*.pt",
                        "*.pth",
                        "*.safetensors",
                    ],
                    local_dir_use_symlinks=False,
                )
            except Exception as e:
                print(f"[*] snapshot_download failed: {e}")

            last_ckpt_path = os.path.join(local_job_dir, "last-checkpoint")

            if os.path.isdir(last_ckpt_path):
                resume_from = _pick_valid_checkpoint_under(last_ckpt_path)

            elif os.path.isfile(last_ckpt_path):
                try:
                    with open(last_ckpt_path, "r", encoding="utf-8") as f:
                        ref = (f.readline() or "").strip()
                    if ref:
                        candidate = os.path.join(local_job_dir, ref)
                        resume_from = _pick_valid_checkpoint_under(candidate)
                except Exception as e:
                    print(f"[*] Could not parse last-checkpoint file: {e}")

            if resume_from:
                print(f"[✅] Resuming from checkpoint: {resume_from}")
                if 'logs' not in jobs_db[job_id]:
                    jobs_db[job_id]['logs'] = []
                jobs_db[job_id]['logs'].append(f"Resuming from checkpoint: {resume_from}")
                _normalize_checkpoint_rng_state(resume_from)
                
                # Fix: Patch training_args.bin precision to prevent c10::BFloat16 != c10::Half errors
                # when resuming a checkpoint trained on A100 (bf16) on a Kaggle T4 (fp16) or vice versa.
                args_file = os.path.join(resume_from, "training_args.bin")
                if os.path.exists(args_file):
                    try:
                        old_args = torch.load(args_file, map_location="cpu", weights_only=False)
                        changed_args = False
                        current_bf16 = is_bfloat16_supported()
                        if getattr(old_args, 'bf16', None) != current_bf16:
                            old_args.bf16 = current_bf16
                            changed_args = True
                        if getattr(old_args, 'fp16', None) != (not current_bf16):
                            old_args.fp16 = not current_bf16
                            changed_args = True
                        if changed_args:
                            torch.save(old_args, args_file)
                            print(f"[*] Patched training_args.bin precision to match current GPU (bf16={current_bf16})")
                    except Exception as e:
                        print(f"[*] Failed to patch training_args.bin: {e}")

                # Fix: xóa best_model_checkpoint cũ trong trainer_state.json
                # để tránh Trainer load checkpoint từ job trước (absolute path không còn tồn tại)
                import glob as _glob
                for _state_file in _glob.glob(os.path.join(local_job_dir, '**/trainer_state.json'), recursive=True):
                    try:
                        with open(_state_file, 'r') as _f:
                            _state = json.load(_f)
                        if _state.get('best_model_checkpoint'):
                            _state['best_model_checkpoint'] = None
                            with open(_state_file, 'w') as _f:
                                json.dump(_state, _f, indent=2)
                            print(f"[*] Cleared stale best_model_checkpoint in {_state_file}")
                    except Exception as _e:
                        print(f"[*] Could not update trainer_state: {_e}")
            else:
                if config.get("checkpoint_source") == "hf" or config.get("checkpoint_hf_repo"):
                    raise ValueError(f"Can't find a valid checkpoint at {last_ckpt_path}")


          # Chuỗi đánh dấu bắt đầu câu trả lời của Bot trong Qwen (ChatML format)

        # response_template = "<|im_start|>assistant\n"

          # Khởi tạo Collator: Nó sẽ tìm chuỗi trên, và CHỈ tính loss từ đoạn đó trở đi
        # collator = DataCollatorForCompletionOnlyLM(
        #     response_template=response_template,
        #     tokenizer=tokenizer
        # )

        # Train on assistant spans with robust fallback
        collator = AssistantOnlyDataCollator(tokenizer)
        try:
            preflight_encoding = tokenizer(
                dataset_train[0]["text"],
                truncation=True,
                max_length=config['modelMaxLength'],
            )
            preflight_batch = collator([preflight_encoding])
            supervised_tokens = int((preflight_batch["labels"] != -100).sum().item())
            total_tokens = int(preflight_batch["attention_mask"].sum().item())
            if supervised_tokens <= 0:
                print("⚠️ [SFT Mask] Could not match assistant header in preflight. Falling back to DataCollatorForLanguageModeling.")
                collator = DataCollatorForLanguageModeling(tokenizer=getattr(tokenizer, "tokenizer", tokenizer), mlm=False)
            else:
                print(
                    f"[SFT Mask] assistant_tokens={supervised_tokens} "
                    f"total_tokens={total_tokens} ignored_tokens={total_tokens - supervised_tokens}"
                )
        except Exception as preflight_err:
            print(f"⚠️ [SFT Mask] Preflight check error ({preflight_err}). Falling back to DataCollatorForLanguageModeling.")
            collator = DataCollatorForLanguageModeling(tokenizer=getattr(tokenizer, "tokenizer", tokenizer), mlm=False)

        # 2.5. SFTTrainer Config (TỐI ƯU CHỐNG OVERFIT)
        trainer = SFTTrainer(
            model = model,
            processing_class = tokenizer,
            # tokenizer = tokenizer,
            train_dataset = dataset_train,
            eval_dataset = dataset_eval,      # Phải có tập này để tính Overfit
            # dataset_text_field = "text",

            data_collator = collator,
            # max_seq_length = config['modelMaxLength'],

            # args = TrainingArguments(
            args = SFTConfig(
                max_length = config['modelMaxLength'],
                dataset_text_field = "text",
                # Keep one conversation per sequence. Packing reduced this
                # 40-conversation dataset to only four optimizer steps/epoch
                # and blurred conversation boundaries.
                packing = False,
                per_device_train_batch_size = config['batchSize'],
                gradient_accumulation_steps = config['gradient_accumulation_steps'],
                warmup_steps = config['warmup_steps'],
                num_train_epochs = config['epochs'],
                learning_rate = config['learningRate'],
                # Tự động chọn kiểu dữ liệu tối ưu dựa trên phần cứng GPU
                fp16 = not is_bfloat16_supported(),
                bf16 = is_bfloat16_supported(),
                logging_steps = 1,

                # --- CẤU HÌNH TÍNH TOÁN OVERFIT ---
                # eval_strategy = "steps", # Đánh giá định kỳ theo bước
                # eval_steps = 50,
                eval_strategy = "steps" if dataset_eval else "no", # Đánh giá định kỳ theo bước
                # Small LoRA runs often have only 50-100 optimizer steps. An
                # interval of 50 produced just one validation point, making
                # load_best_model_at_end effectively meaningless.
                eval_steps = 10 if dataset_eval else None,

                # --- CHIẾN LƯỢC CHỐNG "HỌC VẸT" ---
                # load_best_model_at_end = True, # Kết thúc sẽ lấy Model có kết quả thi tốt nhất
                # metric_for_best_model = "eval_loss",

                load_best_model_at_end = True if dataset_eval else False, # Kết thúc sẽ lấy Model có kết quả thi tốt nhất
                metric_for_best_model = "eval_loss" if dataset_eval else None,
                greater_is_better = False,     # Loss càng thấp càng tốt


                optim = config['optim'],
                weight_decay = config['weight_decay'],
                lr_scheduler_type = config['lr_scheduler_type'],
                seed = config['seed'],
                output_dir = local_job_dir,
                save_strategy = "steps",
                save_steps = 10,
                save_total_limit = 1,          # Tiết kiệm bộ nhớ Colab
                report_to = "none",
                push_to_hub = config.get('push_to_hub', False),
                hub_model_id = hf_repo_id,
                hub_token = hf_token,
                hub_strategy = "checkpoint",
            ),
            callbacks=[
                FlaskProgressCallback(job_id),
                EnhancedWatchdogCallback(job_id),
                AutoTrainEarlyStoppingCallback(
                    job_id=job_id,
                    min_loss=config.get('early_stopping_loss', 0.5),
                    patience=config.get('early_stopping_patience', 100),
                )
            ]
        )

        # 2.6. Bắt đầu huấn luyện (Tự động Resume nếu có checkpoint)
        trainer.train(resume_from_checkpoint = resume_from)

        # A user stop is a resumable terminal state, not a completed training.
        if jobs_db.get(job_id, {}).get('status') == 'STOPPED':
            jobs_db[job_id].setdefault('logs', []).append(
                f"Checkpoint retained at {local_job_dir}; use Resume to continue."
            )
            return

        if config.get('push_to_hub') and hf_repo_id:
            print(f"🎉 Training complete. Pushing final model to {hf_repo_id}...")
            model.push_to_hub(hf_repo_id, token=hf_token, commit_message="End of training push")
            tokenizer.push_to_hub(hf_repo_id, token=hf_token, commit_message="End of training push")
            jobs_db[job_id].update({'status': 'COMPLETED', 'progress': 100, 'final_path': f"hf://{hf_repo_id}"})
        else:
            jobs_db[job_id].update({'status': 'COMPLETED', 'progress': 100})

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"[❌] Error: {str(e)}\n{error_traceback}")
        error_logs = jobs_db.get(job_id, {}).get('logs') or []
        error_logs.append(f"[ERROR] {str(e)}")
        error_logs.append(error_traceback)
        jobs_db[job_id].update({
            'status': 'ERROR',
            'error': str(e),
            'technical_error': error_traceback,
            'logs': error_logs,
        })
    finally:
        final_status = jobs_db.get(job_id, {}).get('status')
        if final_status == 'COMPLETED' and os.path.exists(local_job_dir):
            shutil.rmtree(local_job_dir)
        elif os.path.exists(local_job_dir):
            jobs_db.get(job_id, {}).setdefault('logs', []).append(
                f"Persistent checkpoint retained for recovery: {local_job_dir}"
            )

        if job_id in active_training_jobs:
            active_training_jobs.remove(job_id)
            print(f"[INFO] Job {job_id} finished. Worker free.")

        # Xoá triệt để các biến cục bộ đang chiếm GPU để tránh rò rỉ VRAM
        try:
            del model
            del tokenizer
            del trainer
        except Exception:
            pass
        
        import gc
        gc.collect()
        torch.cuda.empty_cache()

        _release_gpu_memory()


def job_manager_thread():
    global job_manager_last_heartbeat
    while True:
        job_manager_last_heartbeat = time.time()
        if job_queue and len(active_training_jobs) < MAX_CONCURRENT_JOBS:
            job_id, config, file_path, validation_file_path, hf_token = job_queue.popleft()

            if job_id in active_training_jobs:
                continue

            active_training_jobs.add(job_id)
            jobs_db[job_id] = {'status': 'PENDING', 'progress': 0, 'logs': []}
            print(f"[INFO] Bắt đầu Train Job {job_id}.")

            thread = threading.Thread(target=background_train_task, args=(job_id, config, file_path, validation_file_path, hf_token))
            thread.start()

        time.sleep(3)


# Cell cập nhật job_manager_thread để đảm bảo tính đồng bộ
def job_manager_thread():
    global job_manager_last_heartbeat
    while True:
        job_manager_last_heartbeat = time.time()
        if job_queue and len(active_training_jobs) < MAX_CONCURRENT_JOBS:
            job_id, config, file_path, validation_file_path, hf_token = job_queue.popleft()
            if job_id in active_training_jobs: continue
            active_training_jobs.add(job_id)
            jobs_db[job_id] = {'status': 'PENDING', 'progress': 0, 'logs': []}
            print(f"[INFO] Bắt đầu Train Job {job_id}.")
            thread = threading.Thread(target=background_train_task, args=(job_id, config, file_path, validation_file_path, hf_token))
            thread.start()
        time.sleep(3)


# ======================================================================
# CELL NÀY ĐẶT TRƯỚC CELL SERVER (Cell 9 cuối)
# Định nghĩa helpers cho inference — chạy 1 lần trước khi start server
# ======================================================================

# ─────────────────────────────────────────────
# System Prompt — Flipped Classroom Tutor
# ─────────────────────────────────────────────
DEFAULT_SYSTEM_PROMPT = """Bạn là một gia sư thông minh, hỗ trợ học sinh THCS và THPT Việt Nam học tập theo phương pháp lớp học đảo ngược (Flipped Classroom).

VAI TRÒ CỦA BẠN:
- Không giảng lại lý thuyết từ đầu — học sinh đã tự học trước ở nhà.
- Khi học sinh hỏi, hãy ưu tiên đặt câu hỏi gợi mở để kiểm tra mức độ hiểu và kích thích tư duy trước khi giải thích.
- Hướng dẫn từng bước nhỏ, không đưa đáp án ngay — giúp học sinh tự tìm ra.
- Nếu học sinh thực sự bí hoặc đã thử nhiều lần, mới giải thích chi tiết hơn.
- Khen ngợi đúng lúc khi học sinh suy nghĩ đúng hướng.

CÁCH GIAO TIẾP:
- Tiếng Việt hoàn toàn.
- Thân thiện như bạn bè nhưng đáng tin cậy — không cợt nhả, không quá nghiêm túc.
- Câu ngắn gọn, rõ ý. Tránh giải thích dài dòng khi chưa cần thiết.
- Dùng ví dụ gần gũi với cuộc sống học sinh Việt Nam khi cần minh hoạ."""

# ─────────────────────────────────────────────
# Normalize history từ request body
# ─────────────────────────────────────────────
def normalize_history(raw_history, max_messages: int = 10) -> list:
    """
    Validate và làm sạch history từ frontend.
    - Chỉ giữ role "user" hoặc "assistant"
    - content phải là string không rỗng sau trim
    - Giữ tối đa max_messages message gần nhất
    """
    if not isinstance(raw_history, list):
        return []

    valid = []
    for item in raw_history:
        if not isinstance(item, dict):
            continue
        role = item.get("role", "")
        content = item.get("content", "")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        valid.append({"role": role, "content": content.strip()})

    # Giữ max_messages message gần nhất
    return valid[-max_messages:] if len(valid) > max_messages else valid


# ─────────────────────────────────────────────
# Format prompt đúng chat template của từng model
# Hỗ trợ history nhiều lượt
# enable_thinking=False → tắt <think> hoàn toàn
# ─────────────────────────────────────────────
def format_inference_prompt(tokenizer, system_prompt: str, history: list, user_input: str) -> str:
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_input})

    try:
        # Qwen3 hỗ trợ enable_thinking — tắt để không sinh <think>
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        # Model khác không hỗ trợ param này — fallback bình thường
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )


# ─────────────────────────────────────────────
# Filter <think>...</think> khi stream
# ─────────────────────────────────────────────
def stream_without_thinking(streamer, min_chunk_chars: int = 32):
    """
    Accumulate buffer liên tục để tránh <think>/<think> bị split
    giữa 2 chunk (TextIteratorStreamer trả về từng token một).
    """
    OPEN_TAG  = "<think>"
    CLOSE_TAG = "</think>"

    buffer        = ""
    ready         = ""
    in_think      = False
    thinking_done = False

    for chunk in streamer:
        buffer += chunk

        if not in_think and not thinking_done:
            if OPEN_TAG in buffer:
                before_think, buffer = buffer.split(OPEN_TAG, 1)
                ready += before_think
                in_think = True
            else:
                # Keep only enough tail to detect a tag split across tokenizer
                # chunks. Accumulate the safe text before yielding so Gemma-like
                # tokenizers do not reach the browser one character at a time.
                holdback = len(OPEN_TAG) - 1
                if len(buffer) > holdback:
                    ready += buffer[:-holdback]
                    buffer = buffer[-holdback:]

        if in_think:
            if CLOSE_TAG in buffer:
                in_think      = False
                thinking_done = True
                buffer = buffer.split(CLOSE_TAG, 1)[1]
            else:
                buffer = buffer[-9:] if len(buffer) > 9 else buffer
                continue

        if thinking_done and buffer:
            ready += buffer
            buffer = ""

        if len(ready) >= min_chunk_chars or ("\n" in ready and len(ready) >= 8):
            yield ready
            ready = ""

    if not in_think:
        ready += buffer
    if ready:
        yield ready


print("✅ Inference helpers đã sẵn sàng.")



class ClusteringService:
    """
    Singleton giữ model + embedding cache dùng chung cho Visualize và Cluster.

    Cache lifecycle:
        visualize()           → _embed_cache   lưu conv_embeddings + raw data
        cluster()             → _cluster_cache lưu kết quả DBSCAN + KMeans
        filter_remove_noise() → đọc _cluster_cache, không ghi cache
        filter_deduplicate()  → đọc _cluster_cache, không ghi cache
        clear_cache()         → xóa toàn bộ cache
    """

    def __init__(self):
        # Data Prep embeddings must not permanently reserve inference VRAM.
        # Set CLUSTER_DEVICE=cuda explicitly only when GPU clustering is needed.
        requested_device = os.environ.get("CLUSTER_DEVICE", "cpu").strip().lower()
        self.device = "cuda" if requested_device == "cuda" and torch.cuda.is_available() else "cpu"
        print(f"[ClusteringService] Loading model on {self.device}...")
        self.model = SentenceTransformer("intfloat/multilingual-e5-base", device=self.device)
        self.model.max_seq_length = 512
        print("[ClusteringService] Model ready.")

        # ── Embedding cache (set bởi visualize, đọc bởi cluster) ──
        self._embed_cache: dict | None = None

        # ── Cluster cache (set bởi cluster, đọc bởi filter_*) ──
        self._cluster_cache: dict | None = None

    # ──────────────────────────────────────────────────────────────────────────
    # Cache helpers
    # ──────────────────────────────────────────────────────────────────────────

    # def _save_embed_cache(self, data: list[dict], conv_embeddings: np.ndarray,
    #                       conv_to_pair_indices: list[list[int]]):
    #     self._embed_cache = {
    #         "data":                 data,
    #         "conv_embeddings":      conv_embeddings,      # (N, 768) L2-normalized
    #         "conv_to_pair_indices": conv_to_pair_indices,
    #     }
    #     print(f"[EmbedCache] Saved {len(data)} conversations.")


    def _save_embed_cache(
        self,
        data: list[dict],
        conv_embeddings: np.ndarray,
        conv_to_pair_indices: list[list[int]],
        dataset_fingerprint: str,
    ):
        self._embed_cache = {
            "data":                 data,
            "conv_embeddings":      conv_embeddings,
            "conv_to_pair_indices": conv_to_pair_indices,
            "dataset_fingerprint":  dataset_fingerprint,
        }
        print(f"[EmbedCache] Saved {len(data)} conversations. fingerprint={dataset_fingerprint[:12]}")


    def _load_embed_cache(self) -> dict:
        if self._embed_cache is None:
            raise RuntimeError(
                "Chưa có embedding cache. Hãy gọi POST /api/cluster/visualize trước."
            )
        return self._embed_cache

    def _save_cluster_cache(self, data: list[dict], conv_embeddings: np.ndarray,
                             assignments: list[int], clean_indices: list[int],
                             final_labels: np.ndarray, centroids: np.ndarray,
                             similarities: np.ndarray):
        self._cluster_cache = {
            "data":             data,
            "conv_embeddings":  conv_embeddings,
            "assignments":      assignments,    # -1 = noise, 0..K-1 = cụm KMeans
            "clean_indices":    clean_indices,  # index trong data[] sau lọc noise
            "final_labels":     final_labels,   # nhãn KMeans, shape (len(clean_indices),)
            "centroids":        centroids,       # shape (K, dim), đã L2-normalize
            "similarities":     similarities,   # cosine sim mỗi điểm clean vs tâm cụm, shape (M,)
        }
        print(f"[ClusterCache] Saved. Total: {len(data)} | "
              f"Clean: {len(clean_indices)} | Noise: {len(data) - len(clean_indices)}")

    def _load_cluster_cache(self) -> dict:
        if self._cluster_cache is None:
            raise RuntimeError(
                "Chưa có cluster cache. Hãy gọi POST /api/cluster trước."
            )
        return self._cluster_cache

    def clear_cache(self):
        """Xóa toàn bộ cache (embed + cluster)."""
        self._embed_cache   = None
        self._cluster_cache = None
        print("[Cache] Cleared.")



    #########

    def _normalize_record_for_fingerprint(self, item: dict) -> dict:
        if "messages" in item and isinstance(item.get("messages"), list):
            return {
                "messages": [
                    {
                        "role": str(msg.get("role", "")),
                        "content": str(msg.get("content", "")),
                    }
                    for msg in item.get("messages", [])
                ]
            }

        return {
            "instruction": str(item.get("instruction", item.get("query", ""))),
            "input": str(item.get("input", item.get("context", ""))),
            "output": str(item.get("output", item.get("answer", item.get("response", "")))),
        }


    def _dataset_fingerprint(self, data: list[dict]) -> str:
        normalized = [self._normalize_record_for_fingerprint(item) for item in data]
        raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


    def _parse_records_for_embedding(self, data: list[dict]):
        """
        Hỗ trợ cả:
        - OpenAI messages format
        - Alpaca format
        """
        all_pair_texts: list[str] = []
        conv_to_pair_indices: list[list[int]] = []
        count = 0

        for item in data:
            # OpenAI messages format
            if "messages" in item and isinstance(item.get("messages"), list):
                messages = item.get("messages", [])
                pairs: list[str] = []
                i = 0
                while i < len(messages):
                    msg = messages[i]
                    if msg.get("role") == "user":
                        user_content = str(msg.get("content", "")).strip()
                        if i + 1 < len(messages) and messages[i + 1].get("role") == "assistant":
                            assistant_content = str(messages[i + 1].get("content", "")).strip()
                            if user_content and assistant_content:
                                pairs.append(f"user:{user_content} assistant:{assistant_content}")
                            i += 2
                            continue
                    i += 1

                if pairs:
                    indices = []
                    for pair_text in pairs:
                        all_pair_texts.append(pair_text)
                        indices.append(count)
                        count += 1
                    conv_to_pair_indices.append(indices)
                else:
                    conv_to_pair_indices.append([])
                continue

            # Alpaca / lesson-like format
            instruction = str(item.get("instruction", item.get("query", ""))).strip()
            input_text = str(item.get("input", item.get("context", ""))).strip()
            output = str(item.get("output", item.get("answer", item.get("response", "")))).strip()

            user_text = "\n\n".join([part for part in [instruction, input_text] if part])
            if user_text and output:
                all_pair_texts.append(f"user:{user_text} assistant:{output}")
                conv_to_pair_indices.append([count])
                count += 1
            else:
                conv_to_pair_indices.append([])

        return all_pair_texts, conv_to_pair_indices


    def _ensure_embeddings(self, data: list[dict]) -> tuple[np.ndarray, str]:
        dataset_fingerprint = self._dataset_fingerprint(data)

        if (
            self._embed_cache is not None
            and self._embed_cache.get("dataset_fingerprint") == dataset_fingerprint
        ):
            print(f"[EmbedCache] Reused {len(data)} items. fingerprint={dataset_fingerprint[:12]}")
            return self._embed_cache["conv_embeddings"], dataset_fingerprint

        print("1. Parsing records for embedding...")
        all_pair_texts, conv_to_pair_indices = self._parse_records_for_embedding(data)
        if not all_pair_texts:
            raise ValueError("Không trích xuất được cặp nội dung hợp lệ để embedding.")

        print(f"2. Embedding {len(all_pair_texts)} pair-texts...")
        utt_embeddings = self._embed(all_pair_texts)

        print("3. Mean pooling + L2 normalize...")
        conv_embeddings = self._mean_pool_and_normalize(utt_embeddings, conv_to_pair_indices)

        self._save_embed_cache(
            data=data,
            conv_embeddings=conv_embeddings,
            conv_to_pair_indices=conv_to_pair_indices,
            dataset_fingerprint=dataset_fingerprint,
        )
        return conv_embeddings, dataset_fingerprint


    def _build_random_split(
        self,
        n: int,
        test_percentage: float,
        rng: np.random.Generator,
    ) -> tuple[list[int], list[int]]:
        if n <= 0:
            return [], []
        if n == 1:
            return [0], []

        safe_percentage = max(1.0, min(50.0, float(test_percentage)))
        test_count = int(round(n * (safe_percentage / 100.0)))
        test_count = max(1, min(n - 1, test_count))

        perm = rng.permutation(n).tolist()
        test_indices = sorted(perm[:test_count])
        train_indices = sorted(perm[test_count:])
        return train_indices, test_indices


    def _measure_cross_split_conflicts(
        self,
        embeddings: np.ndarray,
        train_indices: list[int],
        test_indices: list[int],
        threshold: float,
        preview_limit: int = 10,
    ) -> tuple[int, float, list[dict]]:
        if not train_indices or not test_indices:
            return 0, 0.0, []

        train_embs = embeddings[train_indices]  # (T, D)
        test_embs  = embeddings[test_indices]   # (S, D)

        # embeddings đã L2-normalize -> dot = cosine similarity
        sim_matrix = np.matmul(train_embs, test_embs.T)  # (T, S)

        max_similarity = float(sim_matrix.max()) if sim_matrix.size else 0.0
        conflict_positions = np.argwhere(sim_matrix > threshold)

        conflict_count = int(conflict_positions.shape[0])
        if conflict_count == 0:
            return 0, max_similarity, []

        preview = []
        scored_pairs = []
        for pos in conflict_positions:
            train_pos = int(pos[0])
            test_pos = int(pos[1])
            sim = float(sim_matrix[train_pos, test_pos])
            scored_pairs.append((sim, train_indices[train_pos], test_indices[test_pos]))

        scored_pairs.sort(key=lambda x: x[0], reverse=True)
        for sim, train_idx, test_idx in scored_pairs[:preview_limit]:
            preview.append({
                "trainIndex": train_idx,
                "testIndex": test_idx,
                "similarity": round(sim, 6),
            })

        return conflict_count, max_similarity, preview


    #########

    def safe_split(
        self,
        data: list[dict],
        test_percentage: float = 20,
        threshold: float = 0.85,
        max_attempts: int = 20,
        seed: int = 42,
    ) -> dict:
        """
        Sinh split train/test sao cho semantic conflict giữa 2 tập <= threshold.
        GPU service tự embed, tự đo similarity, tự auto re-split.

        Returns:
            {
                "resolved": bool,
                "attempts": int,
                "threshold": float,
                "trainIndices": list[int],
                "testIndices": list[int],
                "trainCount": int,
                "testCount": int,
                "conflictCount": int,
                "maxCrossSplitSimilarity": float,
                "datasetFingerprint": str,
                "conflictsPreview": list[dict]
            }
        """
        print("=== [SafeSplit] Bắt đầu ===")
        if not data:
            raise ValueError("data rỗng")

        conv_embeddings, dataset_fingerprint = self._ensure_embeddings(data)
        n = len(data)

        if n == 1:
            print("=== [SafeSplit] Chỉ có 1 mẫu, bỏ qua semantic split ===")
            return {
                "resolved": True,
                "attempts": 1,
                "threshold": float(threshold),
                "trainIndices": [0],
                "testIndices": [],
                "trainCount": 1,
                "testCount": 0,
                "conflictCount": 0,
                "maxCrossSplitSimilarity": 0.0,
                "datasetFingerprint": dataset_fingerprint,
                "conflictsPreview": [],
            }

        rng = np.random.default_rng(seed)
        safe_threshold = float(max(0.0, min(1.0, threshold)))
        safe_attempts = max(1, int(max_attempts))

        best_result = None

        for attempt in range(1, safe_attempts + 1):
            train_indices, test_indices = self._build_random_split(
                n=n,
                test_percentage=test_percentage,
                rng=rng,
            )

            conflict_count, max_similarity, conflicts_preview = self._measure_cross_split_conflicts(
                embeddings=conv_embeddings,
                train_indices=train_indices,
                test_indices=test_indices,
                threshold=safe_threshold,
                preview_limit=10,
            )

            current = {
                "resolved": conflict_count == 0,
                "attempts": attempt,
                "threshold": safe_threshold,
                "trainIndices": train_indices,
                "testIndices": test_indices,
                "trainCount": len(train_indices),
                "testCount": len(test_indices),
                "conflictCount": conflict_count,
                "maxCrossSplitSimilarity": round(max_similarity, 6),
                "datasetFingerprint": dataset_fingerprint,
                "conflictsPreview": conflicts_preview,
            }

            print(
                f"[SafeSplit] attempt={attempt} "
                f"train={len(train_indices)} test={len(test_indices)} "
                f"conflicts={conflict_count} max_sim={max_similarity:.4f}"
            )

            if best_result is None:
                best_result = current
            else:
                if current["conflictCount"] < best_result["conflictCount"]:
                    best_result = current
                elif (
                    current["conflictCount"] == best_result["conflictCount"]
                    and current["maxCrossSplitSimilarity"] < best_result["maxCrossSplitSimilarity"]
                ):
                    best_result = current

            if current["resolved"]:
                print("=== [SafeSplit] Hoàn tất: RESOLVED ===")
                return current

        print("=== [SafeSplit] Hoàn tất: UNRESOLVED ===")
        return best_result


    # ──────────────────────────────────────────────────────────────────────────
    # Embedding helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _parse_conversations(self, data: list[dict]):
        """
        Mỗi cặp (user, assistant) liền kề → 1 text "user:{…} assistant:{…}" → 1 vector.
        Mean pool các vector trong conversation → 1 vector đại diện.
        Conversation không có cặp hợp lệ → vector zero → DBSCAN đánh noise.
        """
        all_pair_texts: list[str]        = []
        conv_to_pair_indices: list[list] = []
        count = 0

        for conv in data:
            messages = conv.get("messages", [])
            pairs: list[str] = []
            i = 0
            while i < len(messages):
                msg = messages[i]
                if msg.get("role") == "user":
                    user_content = msg.get("content", "").strip()
                    if (i + 1 < len(messages)
                            and messages[i + 1].get("role") == "assistant"):
                        assistant_content = messages[i + 1].get("content", "").strip()
                        if user_content and assistant_content:
                            pairs.append(
                                f"user:{user_content} assistant:{assistant_content}"
                            )
                        i += 2
                        continue
                i += 1

            if pairs:
                indices = []
                for pair_text in pairs:
                    all_pair_texts.append(pair_text)
                    indices.append(count)
                    count += 1
                conv_to_pair_indices.append(indices)
            else:
                conv_to_pair_indices.append([])

        return all_pair_texts, conv_to_pair_indices

    def _embed_long_text(self, text: str, chunk_size: int = 400,
                         overlap: int = 50) -> np.ndarray:
        """Late-chunking cho text dài: chunk có overlap → weighted mean pool."""
        words = text.split()
        if len(words) <= chunk_size:
            result = self.model.encode(
                ["query: " + text],
                normalize_embeddings=False,
                device=self.device,
            )
            return result[0].astype(np.float32)

        chunks, start = [], 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunks.append(" ".join(words[start:end]))
            if end == len(words):
                break
            start += chunk_size - overlap

        prefixed = ["query: " + c for c in chunks]
        chunk_embs = self.model.encode(
            prefixed, normalize_embeddings=False,
            batch_size=8, device=self.device,
        ).astype(np.float32)

        weights = np.array([len(c.split()) for c in chunks], dtype=np.float32)
        weights /= weights.sum()
        return np.sum(chunk_embs * weights[:, np.newaxis], axis=0)

    def _embed(self, utterances: list[str]) -> np.ndarray:
        """Batch encode text ngắn + late-chunking cho text dài."""
        TOKEN_LIMIT_WORDS = 350
        dim = self.model.get_sentence_embedding_dimension()
        embeddings = np.zeros((len(utterances), dim), dtype=np.float32)

        short_idx = [i for i, u in enumerate(utterances)
                     if len(u.split()) <= TOKEN_LIMIT_WORDS]
        long_idx  = [i for i, u in enumerate(utterances)
                     if len(u.split()) >  TOKEN_LIMIT_WORDS]

        if short_idx:
            pairs = [("query: " + utterances[i], i)
                     for i in short_idx if utterances[i].strip()]
            if pairs:
                texts_list, orig_indices = zip(*pairs)
                vecs = self.model.encode(
                    list(texts_list),
                    show_progress_bar=True,
                    normalize_embeddings=False,
                    batch_size=32,
                    device=self.device,
                ).astype(np.float32)
                for pos, orig_i in enumerate(orig_indices):
                    embeddings[orig_i] = vecs[pos]

        if long_idx:
            print(f"   -> {len(long_idx)} text dài → late chunking...")
            for orig_i in long_idx:
                embeddings[orig_i] = self._embed_long_text(utterances[orig_i])

        return embeddings

    def _mean_pool_and_normalize(self, utt_embeddings: np.ndarray,
                                  conv_to_utt_indices: list) -> np.ndarray:
        dim = utt_embeddings.shape[1]
        conv_embs = []
        for indices in conv_to_utt_indices:
            if not indices:
                conv_embs.append(np.zeros(dim, dtype=np.float32))
            else:
                conv_embs.append(np.mean(utt_embeddings[indices], axis=0))
        conv_embs = np.array(conv_embs, dtype=np.float32)
        norms = np.linalg.norm(conv_embs, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        return conv_embs / norms

    # ──────────────────────────────────────────────────────────────────────────
    # Output helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _normalize_centroids(self, centroids: np.ndarray) -> np.ndarray:
        c = centroids.astype(np.float32)
        norms = np.linalg.norm(c, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        return c / norms

    def _compute_similarities(self, conv_embeddings: np.ndarray,
                               clean_indices: list[int],
                               final_labels: np.ndarray,
                               centroids: np.ndarray) -> np.ndarray:
        """
        Tính cosine similarity giữa mỗi điểm clean và tâm cụm được gán.

        conv_embeddings và centroids đều đã L2-normalize
        → dot product = cosine similarity.

        Returns:
            similarities: np.ndarray shape (M,), dtype float32
                          M = len(clean_indices)
        """
        clean_embs         = conv_embeddings[clean_indices]   # (M, dim)
        assigned_centroids = centroids[final_labels]          # (M, dim)
        return np.sum(clean_embs * assigned_centroids, axis=1).astype(np.float32)

    def _make_label(self, cluster_id: int) -> str:
        return f"Cụm {cluster_id}"

    def _build_output(self, data: list, assignments: list) -> dict:
        result_data = [{**item, "cluster": assignments[i]}
                       for i, item in enumerate(data)]
        count_map: dict = defaultdict(int)
        for cid in assignments:
            count_map[cid] += 1
        groups = [
            {
                "groupId": cid,
                "count":   count_map[cid],
                "label":   "Nhiễu" if cid == -1 else self._make_label(cid),
            }
            for cid in sorted(count_map.keys())
        ]
        return {"data": result_data, "assignments": assignments, "groups": groups}

    # ──────────────────────────────────────────────────────────────────────────
    # Step 3 — Visualize
    # ──────────────────────────────────────────────────────────────────────────


    # ─────────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────────────

    def _compute_elbow(self, embeddings: np.ndarray, max_k: int) -> list[dict]:
        """
        Tính WCSS (Within-Cluster Sum of Squares) cho k = 1..max_k.

        Args:
            embeddings: L2-normalized numpy array, shape (N, D).
            max_k:      Giá trị k lớn nhất cần thử.

        Returns:
            List of {"k": int, "wcss": float}, sorted by k ascending.
        """
        limit_k = min(max_k, len(embeddings))
        results = []
        for k in range(1, limit_k + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init="auto")
            km.fit(embeddings)
            results.append({"k": k, "wcss": float(km.inertia_)})
        return results


    def _compute_silhouette(
        self, embeddings: np.ndarray, max_k: int
    ) -> list[dict]:
        """
        Tính Silhouette Score cho k = 2..max_k.
        Silhouette không xác định với k=1 nên bắt đầu từ k=2.

        Args:
            embeddings: L2-normalized numpy array, shape (N, D).
            max_k:      Giá trị k lớn nhất cần thử.

        Returns:
            List of {"k": int, "silhouette": float}, sorted by k ascending.
            Giá trị nằm trong [-1, 1]; càng cao càng tốt.
        """
        # Cần ít nhất 2 cluster và 3 điểm (sklearn yêu cầu n_samples > n_clusters)
        limit_k = min(max_k, len(embeddings) - 1)
        if limit_k < 2:
            return []

        results = []
        for k in range(2, limit_k + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init="auto")
            labels = km.fit_predict(embeddings)
            # Chỉ tính khi có ít nhất 2 cluster thực sự xuất hiện
            if len(set(labels)) < 2:
                continue
            score = silhouette_score(embeddings, labels, metric="euclidean")
            results.append({"k": k, "silhouette": float(score)})
        return results


    # ─────────────────────────────────────────────────────────────────────────────
    # Public method
    # ─────────────────────────────────────────────────────────────────────────────

    def visualize(
        self,
        data: list[dict],
        max_k: int,
        eps: float,
        min_samples: int,
    ) -> dict:
        """
        Embed toàn bộ data, lưu conv_embeddings vào _embed_cache,
        rồi tính Elbow + Silhouette + K-Distance dựa trên tập đã lọc noise.

        Args:
            data:        Danh sách conversation dict.
            max_k:       Số cluster tối đa cần khảo sát.
            eps:         Tham số epsilon cho DBSCAN (ngưỡng khoảng cách).
            min_samples: Số điểm tối thiểu trong vùng lân cận cho DBSCAN.

        Returns:
            {
                "elbow":      [{"k": int, "wcss": float}, ...],
                "silhouette": [{"k": int, "silhouette": float}, ...],
                "kDistance":  [{"rank": int, "distance": float}, ...],
                "pointCount": int,   # số điểm sạch (sau khi lọc noise)
                "noiseCount": int,   # số điểm bị DBSCAN đánh dấu noise
            }
        """
        print("=== [Visualize] Bắt đầu ===")

        # # ── 1. Parse & embed ──────────────────────────────────────────────────
        # print("1. Parsing conversations...")
        # all_pair_texts, conv_to_pair_indices = self._parse_conversations(data)
        # if not all_pair_texts:
        #     raise ValueError(
        #         "Không trích xuất được cặp (user, assistant) nào từ data."
        #     )

        # print(f"2. Embedding {len(all_pair_texts)} pair-texts...")
        # utt_embeddings = self._embed(all_pair_texts)

        # print("3. Mean pooling + L2 normalize...")
        # conv_embeddings = self._mean_pool_and_normalize(
        #     utt_embeddings, conv_to_pair_indices
        # )  # shape (N, 768)

        # # ── 2. Lưu embedding cache để cluster() tái sử dụng ──────────────────
        # self._save_embed_cache(data, conv_embeddings, conv_to_pair_indices)

        # # ── 3. DBSCAN lọc noise ───────────────────────────────────────────────
        # print(f"4. DBSCAN noise filter (eps={eps}, min_samples={min_samples})...")
        # dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        # db_labels = dbscan.fit_predict(conv_embeddings)

        conv_embeddings, _dataset_fingerprint = self._ensure_embeddings(data)

        print(f"4. DBSCAN noise filter (eps={eps}, min_samples={min_samples})...")
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        db_labels = dbscan.fit_predict(conv_embeddings)

        noise_mask  = db_labels == -1
        noise_count = int(noise_mask.sum())
        clean_embs  = conv_embeddings[~noise_mask]
        point_count = len(clean_embs)
        print(f"   -> Noise: {noise_count} | Clean: {point_count}")

        if point_count == 0:
            raise ValueError(
                "Toàn bộ dữ liệu bị DBSCAN đánh nhãn là noise. "
                "Hãy thử tăng eps hoặc giảm min_samples."
            )

        # ── 4. Elbow Method ───────────────────────────────────────────────────
        print(f"5. Elbow Method (max_k={max_k})...")
        elbow_data = self._compute_elbow(clean_embs, max_k)

        # ── 5. Silhouette Score ───────────────────────────────────────────────
        print(f"6. Silhouette Score (max_k={max_k})...")
        silhouette_data = self._compute_silhouette(clean_embs, max_k)

        # ── 6. K-Distance Graph ───────────────────────────────────────────────
        print(f"7. K-Distance Graph (k={min_samples})...")
        n_neighbors = min(min_samples, point_count - 1)
        k_distance_data = []
        if n_neighbors >= 1:
            nbrs = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
            nbrs.fit(clean_embs)
            dists, _ = nbrs.kneighbors(clean_embs)
            kth = np.sort(dists[:, -1])[::-1]
            k_distance_data = [
                {"rank": int(i + 1), "distance": float(d)}
                for i, d in enumerate(kth)
            ]

        print("=== [Visualize] Hoàn tất ===")
        return {
            "elbow":      elbow_data,
            "silhouette": silhouette_data,
            "kDistance":  k_distance_data,
            "pointCount": point_count,
            "noiseCount": noise_count,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Step 4 — Cluster  (DBSCAN + KMeans, lưu _cluster_cache)
    # API: POST /api/cluster
    # ──────────────────────────────────────────────────────────────────────────

    def cluster(self, k: int, eps: float, min_samples: int, data: list[dict] | None = None) -> dict:
        """
        Chạy DBSCAN lọc noise rồi KMeans phân cụm,
        lưu toàn bộ kết quả vào _cluster_cache để filter_* tái sử dụng.

        Nếu có truyền data, tự động _ensure_embeddings(data). 
        Nếu không, đọc từ _embed_cache.

        Returns:
            {
                "data":        list[dict],  # toàn bộ data kèm cluster id
                "assignments": list[int],   # -1 = noise, 0..K-1 = cụm KMeans
                "groups":      list[dict],  # [{groupId, count, label}, ...]
                "clusterStats":    list[dict],  # [{clusterId, avgSimilarity, count}, ...]
                "avgSimilarity":   float,       # trung bình toàn bộ tập clean
            }
        """
        print("=== [Cluster] Bắt đầu ===")
        if data is not None:
            conv_embeddings, _ = self._ensure_embeddings(data)
        else:
            cache = self._load_embed_cache()
            data            = cache["data"]
            conv_embeddings = cache["conv_embeddings"]

        # ── 1. DBSCAN lọc noise ───────────────────────────────────────────────
        print(f"1. DBSCAN (eps={eps}, min_samples={min_samples})...")
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        dbscan_labels = dbscan.fit_predict(conv_embeddings)

        clean_indices = [i for i, lbl in enumerate(dbscan_labels) if lbl != -1]
        noise_count   = len(dbscan_labels) - len(clean_indices)
        print(f"   -> Nhiễu: {noise_count} | Sạch: {len(clean_indices)}")

        if not clean_indices:
            raise ValueError(
                "Toàn bộ dữ liệu bị DBSCAN đánh nhãn là noise. "
                "Hãy thử tăng eps hoặc giảm min_samples."
            )

        # ── 2. KMeans phân cụm trên tập clean ────────────────────────────────
        num_clusters = max(1, min(k, len(clean_indices)))
        print(f"2. KMeans (K={num_clusters}) trên {len(clean_indices)} điểm sạch...")
        kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init="auto")
        final_labels = kmeans.fit_predict(conv_embeddings[clean_indices])
        centroids    = self._normalize_centroids(kmeans.cluster_centers_)

        # ── 3. Ghép nhãn KMeans vào assignments (giữ -1 cho noise) ──────────
        assignments = [-1] * len(data)
        for pos, orig_idx in enumerate(clean_indices):
            assignments[orig_idx] = int(final_labels[pos])

        # ── 4. Tính cosine similarity mỗi điểm clean vs tâm cụm ──────────────
        final_labels_arr = np.array(final_labels, dtype=np.int32)
        similarities = self._compute_similarities(
            conv_embeddings, clean_indices, final_labels_arr, centroids
        )

        # ── 5. Tổng hợp avg similarity theo từng cụm + toàn bộ tập clean ─────
        cluster_sim_sum   = defaultdict(float)
        cluster_sim_count = defaultdict(int)
        for pos, cid in enumerate(final_labels_arr):
            cluster_sim_sum[int(cid)]   += float(similarities[pos])
            cluster_sim_count[int(cid)] += 1

        cluster_stats = [
            {
                "clusterId":     cid,
                "avgSimilarity": round(cluster_sim_sum[cid] / cluster_sim_count[cid], 4),
                "count":         cluster_sim_count[cid],
            }
            for cid in sorted(cluster_sim_sum.keys())
        ]
        overall_avg_similarity = round(float(similarities.mean()), 4)

        self._save_cluster_cache(
            data=data,
            conv_embeddings=conv_embeddings,
            assignments=assignments,
            clean_indices=clean_indices,
            final_labels=final_labels_arr,
            centroids=centroids,
            similarities=similarities,
        )

        print("=== [Cluster] Hoàn tất ===")
        output = self._build_output(data, assignments)
        output["clusterStats"]  = cluster_stats
        output["avgSimilarity"] = overall_avg_similarity
        return output

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5a — Filter: Remove Noise
    # API: POST /api/cluster/filter/remove-noise
    # ──────────────────────────────────────────────────────────────────────────

    def filter_remove_noise(self) -> dict:
        """
        Đọc _cluster_cache, loại bỏ tất cả điểm có cluster == -1 (noise DBSCAN).
        Trả về phần còn lại với nhãn cụm KMeans nguyên vẹn.

        Phải gọi cluster() trước.
        Hoạt động độc lập với filter_deduplicate().

        Returns:
            {
                "data":         list[dict],
                "assignments":  list[int],   # chỉ còn 0..K-1
                "groups":       list[dict],
                "removedCount": int,          # số điểm noise bị loại
                "keptCount":    int           # số điểm còn lại
            }
        """
        print("=== [FilterRemoveNoise] Bắt đầu ===")
        cache       = self._load_cluster_cache()
        data        = cache["data"]
        assignments = cache["assignments"]

        kept_data, kept_assignments = [], []
        removed_count = 0

        for i, item in enumerate(data):
            if assignments[i] == -1:
                removed_count += 1
            else:
                kept_data.append(item)
                kept_assignments.append(assignments[i])

        print(f"   -> Loại bỏ noise: {removed_count} | Giữ lại: {len(kept_data)}")
        print("=== [FilterRemoveNoise] Hoàn tất ===")

        output = self._build_output(kept_data, kept_assignments)
        output["removedCount"] = removed_count
        output["keptCount"]    = len(kept_data)
        return output

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5b — Filter: Deduplicate
    # API: POST /api/cluster/filter/deduplicate
    # ──────────────────────────────────────────────────────────────────────────

    def filter_deduplicate(self, threshold: float = 0.9) -> dict:
        """
        Đọc _cluster_cache, loại bỏ các điểm có cosine similarity với tâm
        cụm > threshold (quá giống nhau / trùng lặp). Điểm noise bỏ qua.
        Luôn giữ lại đúng 1 điểm gần tâm nhất của mỗi cụm.

        Phải gọi cluster() trước.
        Hoạt động độc lập với filter_remove_noise().

        Cosine similarity = dot(e, c) vì conv_embeddings và centroids
        đều đã L2-normalized → cosine_distance = 1 - similarity.

        Returns:
            {
                "data":         list[dict],
                "assignments":  list[int],
                "groups":       list[dict],
                "removedCount": int,          # số điểm bị loại do quá gần tâm
                "keptCount":    int           # số điểm còn lại
            }
        """
        print(f"=== [FilterDeduplicate] threshold={threshold} ===")
        cache           = self._load_cluster_cache()
        data            = cache["data"]
        conv_embeddings = cache["conv_embeddings"]
        assignments     = cache["assignments"]
        clean_indices   = cache["clean_indices"]
        final_labels    = cache["final_labels"]
        centroids       = cache["centroids"]

        # ── Đọc similarities từ cache (đã tính sẵn bởi cluster()) ────────────
        similarities = cache["similarities"]

        # ── Điểm gần tâm nhất mỗi cụm → bắt buộc giữ lại ────────────────────
        centroid_reps: dict = {}
        for cid in np.unique(final_labels):
            pos_in_cluster = np.where(final_labels == cid)[0]
            best_pos       = pos_in_cluster[np.argmax(similarities[pos_in_cluster])]
            centroid_reps[int(cid)] = best_pos

        protected = set(centroid_reps.values())

        # ── Index trong data[] cần loại (sim > threshold, không phải rep) ─────
        too_close = {
            clean_indices[pos]
            for pos, sim in enumerate(similarities)
            if sim > threshold and pos not in protected
        }

        kept_data, kept_assignments = [], []
        for i, item in enumerate(data):
            if assignments[i] == -1:   # bỏ qua noise
                continue
            if i in too_close:         # bỏ qua điểm trùng lặp
                continue
            kept_data.append(item)
            kept_assignments.append(assignments[i])

        removed_count = len(too_close)
        print(f"   -> Loại bỏ (quá gần tâm): {removed_count} | Giữ lại: {len(kept_data)}")
        print("=== [FilterDeduplicate] Hoàn tất ===")

        output = self._build_output(kept_data, kept_assignments)
        output["removedCount"] = removed_count
        output["keptCount"]    = len(kept_data)
        return output


# ── eval_jobs_db: lưu trạng thái eval độc lập với jobs_db (train) ────────────
eval_jobs_db = {}


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
            if getattr(tokenizer, "pad_token", None) is None:
                tokenizer.pad_token = tokenizer.eos_token
            tokenizer.padding_side = "right"
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
        print(f"[Worker] Slot released — active={_active_eval_count}/{GPU_EVAL_SLOTS}")


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


_service = ClusteringService()








@app.route('/api/train/start', methods=['POST'])
def start_training():
    config_str = request.form.get('config')
    if not config_str: return jsonify({"error": "Missing 'config' in form data"}), 400

    try: parsed_config = json.loads(config_str)
    except json.JSONDecodeError: return jsonify({"error": "Invalid config JSON format"}), 400

    job_id = parsed_config.get('job_id')
    if not job_id: return jsonify({"error": "Missing 'job_id' in config"}), 400

    config = {
        'model_name': parsed_config.get('model_name', "unsloth/Qwen2.5-7B-Instruct-bnb-4bit"),
        'epochs': int(parsed_config.get('epochs', 1)),
        'batchSize': int(parsed_config.get('batchSize', 2)),
        'learningRate': float(parsed_config.get('learningRate', 2e-4)),
        'modelMaxLength': int(parsed_config.get('modelMaxLength', 2048)),
        'r': int(parsed_config.get('r', 16)),
        'lora_alpha': int(parsed_config.get('lora_alpha', 16)),
        'lora_dropout': float(parsed_config.get('lora_dropout', 0)),
        'random_state': int(parsed_config.get('random_state', 3407)),
        'gradient_accumulation_steps': int(parsed_config.get('gradient_accumulation_steps', 4)),
        'warmup_steps': int(parsed_config.get('warmup_steps', 5)),
        'dataset_hf_id': parsed_config.get('dataset_hf_id'),
        'push_to_hub': parsed_config.get('push_to_hub', False),
        'hf_repo_id': parsed_config.get('hf_repo_id'),
        'optim': parsed_config.get('optim', 'adamw_8bit'),
        'weight_decay': float(parsed_config.get('weight_decay', 0.01)),
        'lr_scheduler_type': parsed_config.get('lr_scheduler_type', 'linear'),
        'seed': int(parsed_config.get('seed', 3407)),
        'early_stopping_loss': float(parsed_config.get('early_stopping_loss', 0.5)),
        'early_stopping_patience': int(parsed_config.get('early_stopping_patience', 100)),
        # Resume metadata must survive request parsing. Older code dropped these
        # fields here, so the trainer always restarted from step 0.
        'checkpoint_source': parsed_config.get('checkpoint_source'),
        'checkpoint_hf_repo': parsed_config.get('checkpoint_hf_repo'),
        'checkpoint_file_id': parsed_config.get('checkpoint_file_id'),
        'column_mapping': parsed_config.get('column_mapping') or parsed_config.get('columnMapping'),
    }

    # Ưu tiên token từ request, fallback sang Docker Secret / env HF_TOKEN
    hf_token = parsed_config.get('hf_token') or _read_secret("HF_TOKEN")

    # print("HF token:", hf_token)

    file_path = None
    if 'file' in request.files:
        file = request.files['file']
        if file.filename != '':
            file_path = os.path.join(UPLOAD_FOLDER, f"{job_id}_{secure_filename(file.filename)}")
            file.save(file_path)

    validation_file_path = None
    if 'validation_file' in request.files:
        validation_file = request.files['validation_file']
        if validation_file.filename != '':
            validation_file_path = os.path.join(
                UPLOAD_FOLDER,
                f"{job_id}_validation_{secure_filename(validation_file.filename)}",
            )
            validation_file.save(validation_file_path)

    if not file_path and not config.get('dataset_hf_id'):
        return jsonify({"error": "Either a dataset file must be uploaded or 'dataset_hf_id' must be provided in the config."}), 400

    # THÊM JOB VÀO HÀNG ĐỢI THAY VÌ CHẠY NGAY LẬP TỨC
    job_queue.append((job_id, config, file_path, validation_file_path, hf_token))
    jobs_db[job_id] = {'status': 'QUEUED', 'progress': 0, 'logs': [f"Job {job_id} is in queue."]}

    return jsonify({"message": "Job queued successfully", "job_id": job_id}), 202


@app.route('/api/train/status/<job_id>')
def get_status(job_id):
    global last_heartbeat
    last_heartbeat = time.time()
    
    job_info = jobs_db.get(job_id)
    if job_info:
        res_info = dict(job_info)
        # Inject live GPU resources if active but HF trainer hasn't output metrics yet
        if res_info.get('status') in ['TRAINING', 'PENDING', 'LOADING_MODEL']:
            vram_used, _, gpu_util = get_gpu_stats()
            metrics = res_info.get('metrics', {})
            if not isinstance(metrics, dict):
                metrics = {}
            else:
                metrics = dict(metrics)
            
            metrics.setdefault('vram', vram_used)
            metrics.setdefault('gpu_util', gpu_util)
            res_info['metrics'] = metrics
        return jsonify(res_info), 200
        
    return jsonify({"status": "NOT_FOUND"}), 200

@app.route('/api/train/checkpoint/<job_id>')
def get_local_checkpoint(job_id):
    """Report the newest checkpoint retained on the persistent worker volume."""
    job_dir = os.path.join(LOCAL_CHECKPOINT_BASE, secure_filename(job_id))
    checkpoints = []
    if os.path.isdir(job_dir):
        for name in os.listdir(job_dir):
            path = os.path.join(job_dir, name)
            if os.path.isdir(path) and name.startswith('checkpoint-'):
                try:
                    step = int(name.rsplit('-', 1)[-1])
                except ValueError:
                    step = -1
                if os.path.isfile(os.path.join(path, 'trainer_state.json')):
                    checkpoints.append((step, path))
    checkpoints.sort(key=lambda item: item[0], reverse=True)
    if not checkpoints:
        return jsonify({"available": False, "job_id": job_id}), 200
    return jsonify({
        "available": True,
        "job_id": job_id,
        "step": checkpoints[0][0],
        "checkpoint": os.path.basename(checkpoints[0][1]),
    }), 200

@app.route('/api/train/queue-status')
def get_train_queue_status():
    """Lightweight debug endpoint for AutoTrain queue visibility."""
    queued_jobs = []
    for item in list(job_queue):
        try:
            queued_jobs.append(item[0])
        except Exception:
            pass

    return jsonify({
        "queued_count": len(job_queue),
        "queued_jobs": queued_jobs,
        "active_count": len(active_training_jobs),
        "active_jobs": list(active_training_jobs),
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
        "manager_heartbeat_age_sec": round(time.time() - job_manager_last_heartbeat, 2) if job_manager_last_heartbeat else None,
    }), 200
@app.route('/api/system/resources')
def get_system_resources():
    """Trả về thông số VRAM và GPU Utilization hiện tại cho giao diện AutoTrain."""
    vram_used, vram_total, gpu_util = get_gpu_stats()
    return jsonify({
        "vram_used_mb": vram_used,
        "vram_total_mb": vram_total,
        "gpu_util": gpu_util
    }), 200


@app.route('/api/train/stop/<job_id>', methods=['POST'])
def stop_training(job_id):
    # This is a bit tricky since trainer.train() is blocking in the thread.
    # However, we have WatchdogCallback and we can manually set a flag if needed.
    # For now, let's just update the status so the user knows we acknowledged it.
    if job_id in jobs_db:
        jobs_db[job_id]['status'] = 'STOPPED'
        jobs_db[job_id]['logs'].append("🛑 Stop request received. Training will halt at the next step.")
        return jsonify({"message": "Stop signal sent"}), 200
    return jsonify({"error": "Job not found"}), 404


@app.route('/api/eval/start', methods=['POST'])
def start_eval():
    """
    POST /api/eval/start  (multipart/form-data)
    Form fields:
      - config (JSON string):
          {
            eval_job_id:     string   — ID do Node backend tạo
            job_id:          string   — TrainingHistory jobId (để link kết quả)
            hf_repo_id:      string   — HuggingFace repo chứa fine-tuned model
            hf_token:        string   — HF token (nếu repo private)
            model_max_length: number  — max_seq_length khi load model
            judge_model:     string   — Claude model dùng làm judge (optional)
          }
      - eval_file: file    — dataset đánh giá (.json / .jsonl)

    Response 201:
      { "message": "Eval job started", "eval_job_id": "..." }
    """
    config_str = request.form.get('config')
    if not config_str:
        return jsonify({"error": "Missing 'config' in form data"}), 400

    try:
        cfg = json.loads(config_str)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid config JSON"}), 400

    eval_job_id   = cfg.get('eval_job_id')
    job_id        = cfg.get('job_id')
    hf_repo_id    = cfg.get('hf_repo_id')
    hf_token      = cfg.get('hf_token', '')
    model_max_len = int(cfg.get('model_max_length', 2048))
    judge_model   = cfg.get('judge_model', DEFAULT_JUDGE_MODEL)
    judge_api_key = cfg.get('judge_api_key', '')
    base_hf_repo  = cfg.get('base_model_hf_repo', '')
    system_prompt = str(cfg.get('system_prompt', '') or '')
    protocol_mode = str(cfg.get('protocol_mode', 'locked_single_turn') or 'locked_single_turn')
    reference_run_kind = str(cfg.get('reference_run_kind', '') or '')
    prompt_variant = str(cfg.get('prompt_variant', 'P1') or 'P1').upper()
    system_prompt_version = str(cfg.get('system_prompt_version', '') or '')
    subject_override = str(cfg.get('subject_override', '') or '')
    max_new_tokens = int(cfg.get('max_new_tokens', 512))
    warmup_runs = int(cfg.get('warmup_runs', 1))
    bootstrap_resamples = int(cfg.get('bootstrap_resamples', 10000))
    bootstrap_seed = int(cfg.get('bootstrap_seed', 42))
    temperature = float(cfg.get('temperature', 0.2))
    top_p = float(cfg.get('top_p', 0.9))
    repetition_penalty = float(cfg.get('repetition_penalty', 1.15))

    print(f"[Debug] base_hf_repo = '{base_hf_repo}' | paired = {bool(base_hf_repo)}")
    print(f"[Eval Config] system_prompt_chars={len(system_prompt.strip())} max_new_tokens={max_new_tokens} temperature={temperature} top_p={top_p} repetition_penalty={repetition_penalty}")

    if not eval_job_id:
        return jsonify({"error": "Missing 'eval_job_id' in config"}), 400
    if not job_id:
        return jsonify({"error": "Missing 'job_id' in config"}), 400
    if not hf_repo_id:
        return jsonify({"error": "Missing 'hf_repo_id' — model phải đã được push lên HF Hub"}), 400

    # ── GUARD: chặn eval nếu đang có train job active (tránh OOM trên single GPU) ──
    if (
        protocol_mode == 'locked_single_turn'
        and not base_hf_repo
        and reference_run_kind != 'version1_shared_ft'
    ):
        return jsonify({"error": "Locked RP5 evaluation requires base_model_hf_repo"}), 400
    if protocol_mode == 'locked_single_turn' and prompt_variant not in ('P0', 'P1'):
        return jsonify({"error": "prompt_variant must be P0 or P1"}), 400
    if max_new_tokens < 1 or max_new_tokens > 2048:
        return jsonify({"error": "max_new_tokens must be between 1 and 2048"}), 400
    if bootstrap_resamples < 1000:
        return jsonify({"error": "bootstrap_resamples must be at least 1000"}), 400

    active_train = any(
        v.get('status') == 'TRAINING'
        for k, v in jobs_db.items()
        if not k.startswith('__eval_tmp_')
    )
    if active_train:
        return jsonify({
            "error": "train_active",
            "message": "Đang có train job đang chạy. Eval sẽ gây OOM trên single GPU. Vui lòng chờ train hoàn tất."
        }), 409

    # Lưu eval file
    if 'eval_file' not in request.files or request.files['eval_file'].filename == '':
        return jsonify({"error": "Missing 'eval_file'"}), 400

    efile = request.files['eval_file']
    eval_file_path = os.path.join(
        UPLOAD_FOLDER,
        f"{eval_job_id}_{secure_filename(efile.filename)}"
    )
    efile.save(eval_file_path)

    # Keep an immutable input copy and non-secret config on the persistent
    # checkpoint volume. A restarted GPU process can resume with fresh secrets.
    checkpoint_dir = _eval_checkpoint_dir(eval_job_id)
    input_ext = os.path.splitext(secure_filename(efile.filename))[1] or '.json'
    persistent_eval_file = os.path.join(checkpoint_dir, f"input{input_ext}")
    shutil.copy2(eval_file_path, persistent_eval_file)
    os.remove(eval_file_path)
    safe_config = {
        key: value for key, value in cfg.items()
        if key not in {'hf_token', 'judge_api_key'}
    }
    _update_eval_manifest(
        eval_job_id,
        status='PENDING',
        config=safe_config,
        eval_file_path=persistent_eval_file,
        resume_count=0,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )

    # --- check slot trước khi nhận job ---
    if not _eval_slot_acquire():
        return jsonify({
            "error": "worker_busy",
            "message": f"Worker đang chạy {_active_eval_count}/{GPU_EVAL_SLOTS} eval job. Vui lòng thử lại sau.",
            "active_slots": _active_eval_count,
            "max_slots": GPU_EVAL_SLOTS,
        }), 409

    # Từ chối nếu eval_job_id đã đang chạy
    if eval_job_id in eval_jobs_db and eval_jobs_db[eval_job_id].get('status') in ('RUNNING', 'EVALUATING'):
        _eval_slot_release()
        return jsonify({"error": f"Eval job {eval_job_id} đang chạy"}), 409

    eval_jobs_db[eval_job_id] = {
        'status':   'PENDING',
        'progress': 0,
        'logs':     [],
        'job_id':   job_id,
    }

    threading.Thread(
        target=background_eval_task,
        kwargs={
            "eval_job_id": eval_job_id,
            "job_id": job_id,
            "hf_repo_id": hf_repo_id,
            "hf_token": hf_token,
            "eval_file_path": persistent_eval_file,
            "model_max_length": model_max_len,
            "judge_model": judge_model,
            "judge_api_key": judge_api_key,
            "base_hf_repo": base_hf_repo,
            "system_prompt": system_prompt,
            "protocol_mode": protocol_mode,
            "prompt_variant": prompt_variant,
            "system_prompt_version": system_prompt_version,
            "subject_override": subject_override,
            "max_new_tokens": max_new_tokens,
            "warmup_runs": warmup_runs,
            "bootstrap_resamples": bootstrap_resamples,
            "bootstrap_seed": bootstrap_seed,
            "temperature": temperature,
            "top_p": top_p,
            "repetition_penalty": repetition_penalty,
        },
        daemon=True,
    ).start()

    return jsonify({
        "message": "Eval job started",
        "eval_job_id": eval_job_id,
        "checkpoint_created": True,
        "eval_checkpoint_protocol": 1,
    }), 201


@app.route('/api/eval/resume/<eval_job_id>', methods=['POST'])
def resume_eval(eval_job_id):
    """Resume an interrupted eval from durable replay/Judge checkpoints."""
    current = eval_jobs_db.get(eval_job_id)
    if current and current.get('status') in ('PENDING', 'RUNNING', 'EVALUATING'):
        return jsonify({"error": "eval_already_running", "eval_job_id": eval_job_id}), 409

    manifest = _load_eval_checkpoint(eval_job_id, 'manifest', None)
    if not manifest:
        return jsonify({"error": "checkpoint_not_found", "eval_job_id": eval_job_id}), 404
    if manifest.get('status') == 'COMPLETED':
        return jsonify({"error": "eval_already_completed", "eval_job_id": eval_job_id}), 409

    cfg = dict(manifest.get('config') or {})
    eval_file_path = str(manifest.get('eval_file_path') or '')
    if not eval_file_path or not os.path.isfile(eval_file_path):
        return jsonify({"error": "checkpoint_input_missing", "eval_job_id": eval_job_id}), 409

    secrets = request.get_json(silent=True) or {}
    hf_token = str(secrets.get('hf_token') or _read_secret('HF_TOKEN') or '')
    judge_api_key = str(secrets.get('judge_api_key') or _read_secret('OPENROUTER_API_KEY') or '')
    if not judge_api_key:
        return jsonify({"error": "missing_judge_api_key"}), 400
    if not _eval_slot_acquire():
        return jsonify({"error": "worker_busy", "message": "GPU không còn Eval slot trống."}), 409

    job_id = str(cfg.get('job_id') or '')
    hf_repo_id = str(cfg.get('hf_repo_id') or '')
    if not job_id or not hf_repo_id:
        _eval_slot_release()
        return jsonify({"error": "checkpoint_config_invalid"}), 409

    eval_jobs_db[eval_job_id] = {
        'status': 'PENDING',
        'progress': int(manifest.get('progress') or 0),
        'logs': ['[RESUME] Khôi phục Eval từ checkpoint bền vững.'],
        'job_id': job_id,
    }
    _update_eval_manifest(
        eval_job_id,
        status='PENDING',
        error=None,
        resume_count=int(manifest.get('resume_count') or 0) + 1,
    )

    threading.Thread(
        target=background_eval_task,
        kwargs={
            'eval_job_id': eval_job_id,
            'job_id': job_id,
            'hf_repo_id': hf_repo_id,
            'hf_token': hf_token,
            'eval_file_path': eval_file_path,
            'model_max_length': int(cfg.get('model_max_length', 2048)),
            'judge_model': str(cfg.get('judge_model') or DEFAULT_JUDGE_MODEL),
            'judge_api_key': judge_api_key,
            'base_hf_repo': str(cfg.get('base_model_hf_repo') or ''),
            'system_prompt': str(cfg.get('system_prompt') or ''),
            'protocol_mode': str(cfg.get('protocol_mode') or 'locked_single_turn'),
            'prompt_variant': str(cfg.get('prompt_variant') or 'P1'),
            'system_prompt_version': str(cfg.get('system_prompt_version') or ''),
            'subject_override': str(cfg.get('subject_override') or ''),
            'max_new_tokens': int(cfg.get('max_new_tokens', 512)),
            'warmup_runs': int(cfg.get('warmup_runs', 1)),
            'bootstrap_resamples': int(cfg.get('bootstrap_resamples', 10000)),
            'bootstrap_seed': int(cfg.get('bootstrap_seed', 42)),
            'temperature': float(cfg.get('temperature', 0)),
            'top_p': float(cfg.get('top_p', 1)),
            'repetition_penalty': float(cfg.get('repetition_penalty', 1)),
        },
        daemon=True,
    ).start()

    return jsonify({
        "message": "Eval resumed from checkpoint",
        "eval_job_id": eval_job_id,
        "resume_count": int(manifest.get('resume_count') or 0) + 1,
    }), 202



@app.route('/api/eval/status/<eval_job_id>', methods=['GET'])
def get_eval_status(eval_job_id):
    entry = eval_jobs_db.get(eval_job_id)
    if not entry:
        manifest = _load_eval_checkpoint(eval_job_id, 'manifest', None)
        if manifest:
            status = manifest.get('status', 'INTERRUPTED')
            if status in {'RUNNING', 'EVALUATING', 'PENDING'}:
                status = 'INTERRUPTED'
            return jsonify({
                "status": status,
                "progress": manifest.get('progress', 0),
                "stage": manifest.get('stage', ''),
                "stage_label": "Có checkpoint — có thể Resume",
                "stage_detail": manifest.get('error') or 'GPU process đã restart; checkpoint vẫn còn trên volume.',
                "error": manifest.get('error'),
                "resumable": status != 'COMPLETED',
            }), 200
        return jsonify({"status": "NOT_FOUND"}), 404

    return jsonify({
        "status":        entry.get('status', 'UNKNOWN'),
        "resumable":     entry.get('status') == 'INTERRUPTED',
        "progress":      entry.get('progress', 0),
        "stage":         entry.get("stage", ""),
        "stage_label":   entry.get("stage_label", ""),
        "stage_detail":  entry.get("stage_detail", ""),
        "stage_current": entry.get("stage_current", 0),
        "stage_total":   entry.get("stage_total", 0),
        "logs":          entry.get('logs', []),
        **({"current_sample": entry["current_sample"]} if "current_sample" in entry else {}),
        **({"error": entry["error"]} if "error" in entry else {}),
    }), 200


@app.route('/api/eval/active', methods=['GET'])
def get_active_eval_jobs():
    """Expose worker-owned active IDs so the backend can reconcile Mongo state."""
    active_statuses = {'PENDING', 'RUNNING', 'EVALUATING'}
    jobs = [
        {
            'eval_job_id': eval_job_id,
            'status': entry.get('status', 'UNKNOWN'),
            'job_id': entry.get('job_id'),
        }
        for eval_job_id, entry in eval_jobs_db.items()
        if entry.get('status') in active_statuses
    ]
    return jsonify({'jobs': jobs, 'count': len(jobs)}), 200


@app.route('/api/eval/checkpoint/<eval_job_id>', methods=['DELETE'])
def delete_eval_checkpoint(eval_job_id):
    current = eval_jobs_db.get(eval_job_id)
    if current and current.get('status') in {'PENDING', 'RUNNING', 'EVALUATING'}:
        return jsonify({'error': 'eval_still_running'}), 409
    checkpoint_dir = os.path.join(EVAL_CHECKPOINT_BASE, secure_filename(eval_job_id))
    if os.path.isdir(checkpoint_dir):
        shutil.rmtree(checkpoint_dir)
    return jsonify({'deleted': True, 'eval_job_id': eval_job_id}), 200



@app.route('/api/eval/result/<eval_job_id>', methods=['GET'])
def get_eval_result_v2(eval_job_id):
    """
    GET /api/eval/result/:eval_job_id
    Trả về kết quả eval sau khi COMPLETED.
    Node backend gọi endpoint này 1 lần sau khi status = COMPLETED
    để POST lên /api/eval/save và lưu vào MongoDB.
    Response 202: eval chưa xong
    Response 200: { evalId, jobId, status, totalSamples, results, summary, ... }
    Response 404: eval_job_id không tồn tại
    """
    entry = eval_jobs_db.get(eval_job_id)
    if not entry:
        persisted_result = _load_eval_checkpoint(eval_job_id, 'final_result', None)
        if persisted_result:
            return jsonify(persisted_result), 200
    if not entry:
        return jsonify({"error": "Eval job không tồn tại"}), 404

    status = entry.get('status')
    if status in ('PENDING', 'RUNNING', 'EVALUATING'):
        return jsonify({"status": status}), 202

    if status in ('FAILED', 'INTERRUPTED'):
        return jsonify({
            "status": status,
            "error": entry.get('error', ''),
            "resumable": status == 'INTERRUPTED',
        }), 200

    result = entry.get('result')
    if not result:
        return jsonify({"status": "PENDING"}), 202

    return jsonify(result), 200


from transformers import AutoTokenizer, AutoModelForCausalLM
@app.route('/api/model/load', methods=['POST'])
def load_model():
    data = request.json
    hf_model_id = data.get('hf_model_id')
    instance_id = data.get('instance_id') or data.get('instanceId') or 1
    slot_id = int(instance_id)
    force_reload = data.get('force_reload', False)
    pin_model = bool(data.get('pinned', False))

    if not hf_model_id:
        return jsonify({"error": "Missing hf_model_id"}), 400
    if slot_id not in _slot_locks:
        return jsonify({"error": f"instanceId phải là 1 hoặc 2, nhận: {slot_id}"}), 400

    lock = _slot_locks[slot_id]
    if not lock.acquire(blocking=False):
        return jsonify({"error": f"Slot {slot_id} đang bận. Thử lại sau."}), 409

    try:
        current = _model_slots.get(slot_id)
        if current and current["model_id"] != hf_model_id and current.get("pinned", False) and not force_reload:
            return jsonify({
                "error": f"Slot {slot_id} is pinned to {current['model_id']}; use another slot or force_reload."
            }), 409
        if current and current["model_id"] == hf_model_id and not force_reload:
            current["pinned"] = bool(current.get("pinned", False) or pin_model)
            current["last_used_at"] = time.time()
            return jsonify({
                "status": "success",
                "message": f"Model đã được load ở slot {slot_id}, bỏ qua."
            }), 200

        if current:
            _release_slot(slot_id)

        print(f"[Slot {slot_id}] Loading {hf_model_id}...")

        # ✅ Dùng FastLanguageModel thay vì AutoModelForCausalLM
        # — tương thích cả model gốc HF lẫn model đã fine-tune bằng unsloth
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=hf_model_id,
            max_seq_length=2048,
            load_in_4bit=True,
            dtype=None,  # auto-detect
        )
        FastLanguageModel.for_inference(model)  # tăng tốc inference

        _model_slots[slot_id] = {
            "model_id": hf_model_id,
            "model": model,
            "tokenizer": tokenizer,
            "pinned": pin_model,
            "loaded_at": time.time(),
            "last_used_at": time.time(),
        }

        return jsonify({
            "status": "success",
            "message": f"Model {hf_model_id} loaded vào slot {slot_id}."
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        lock.release()


@app.route('/api/model/status', methods=['GET'])
def model_slot_status():
    """Expose non-sensitive slot occupancy for cache-aware routing benchmarks."""
    slots = {}
    for slot_id in sorted(_slot_locks.keys()):
        current = _model_slots.get(slot_id)
        slots[str(slot_id)] = {
            "loaded": current is not None,
            "model_id": current["model_id"] if current else None,
            "busy": _slot_locks[slot_id].locked(),
            "pinned": bool(current.get("pinned", False)) if current else False,
            "loaded_at": current.get("loaded_at") if current else None,
            "last_used_at": current.get("last_used_at") if current else None,
        }
    return jsonify({"status": "success", "slots": slots}), 200


@app.route('/api/model/unload/<int:slot_id>', methods=['POST'])
def unload_model(slot_id):
    lock = _slot_locks.get(slot_id)
    if not lock:
        return jsonify({"error": "Invalid slot"}), 400
    vram_before_mb, _, _ = get_gpu_stats()
    with lock:
        released = _release_slot(slot_id)
    vram_after_mb, _, _ = get_gpu_stats()
    return jsonify({
        "status": "success",
        "message": f"Slot {slot_id} unloaded",
        "released": released,
        "vram_before_mb": vram_before_mb,
        "vram_after_mb": vram_after_mb,
        "active_slots": {
            str(sid): entry["model_id"]
            for sid, entry in _model_slots.items()
        },
        "cluster_device": _service.device,
    }), 200


@app.route('/api/infer/stop/<int:slot_id>', methods=['POST'])
def stop_inference(slot_id):
    if slot_id not in _slot_abort_events:
        return jsonify({"error": "Invalid slot"}), 400
    _slot_abort_events[slot_id].set()
    return jsonify({"status": "stop signal sent"}), 200


@app.route('/api/infer/stream', methods=['POST'])
def infer_model_stream():
    global inference_logs_db

    data        = request.json
    print(f"[infer_stream] raw body keys: {list(data.keys())}")
    print(f"[infer_stream] instanceId field: {data.get('instanceId')!r}")

    instance_id = data.get('instance_id') or data.get('instanceId') or 1
    slot_id = int(instance_id)
    print(f"[infer_stream] → resolved slot_id={slot_id}")

    if slot_id not in _slot_locks:
        return jsonify({"error": f"instanceId phải là 1 hoặc 2, nhận: {slot_id}"}), 400

    slot = _model_slots.get(slot_id)
    if slot is None:
        return jsonify({"error": f"Slot {slot_id}: chưa load model. Gọi /api/model/load trước."}), 400

    model      = slot["model"]
    tokenizer  = slot["tokenizer"]
    loaded_id  = slot["model_id"]
    slot["last_used_at"] = time.time()

    text_input    = data.get('text_input')
    system_prompt = data.get('system_prompt', DEFAULT_SYSTEM_PROMPT)

    # --- HISTORY: parse & normalize ---
    raw_history = data.get('history', [])
    history = normalize_history(raw_history, max_messages=10)

    hf_model_id = data.get('hf_model_id')
    if hf_model_id and hf_model_id != loaded_id:
        return jsonify({"error": f"Model mismatch. Slot {slot_id} đang chạy {loaded_id}, bạn gửi {hf_model_id}."}), 400

    if not text_input:
        return jsonify({"error": "Missing text_input"}), 400

    # Parse tham số generation
    gen_max_new_tokens     = data.get('max_new_tokens', 512)
    gen_temperature        = data.get('temperature', 0.3)
    gen_top_k              = data.get('top_k', 40)
    gen_top_p              = data.get('top_p', 0.85)
    gen_repetition_penalty = data.get('repetition_penalty', 1.15)
    gen_do_sample          = data.get('do_sample', True)

    print(f"[Slot {slot_id}] System prompt: {system_prompt}")
    print(f"[Slot {slot_id}] history_count={len(history)}, "
          f"max_new_tokens={gen_max_new_tokens}, temperature={gen_temperature}, "
          f"top_k={gen_top_k}, top_p={gen_top_p}, rep_penalty={gen_repetition_penalty}")

    inference_id = str(uuid.uuid4())
    inference_logs_db[inference_id] = {
        "inference_id": inference_id,
        "timestamp":    datetime.datetime.now().isoformat(),
        "slot_id":      slot_id,
        "model_id":     loaded_id,
        "input_parameters": {
            "text_input":          text_input,
            "system_prompt":       system_prompt,
            "history":             history,           # <-- thêm
            "history_count":       len(history),      # <-- thêm
            "max_new_tokens":      gen_max_new_tokens,
            "temperature":         gen_temperature,
            "top_k":               gen_top_k,
            "top_p":               gen_top_p,
            "repetition_penalty":  gen_repetition_penalty,
            "do_sample":           gen_do_sample,
        },
        "generated_text": "",
        "status": "started",
    }

    lock = _slot_locks[slot_id]

    try:
        # --- dùng history khi build prompt ---
        instruction_text = format_inference_prompt(tokenizer, system_prompt, history, text_input)

        inputs = tokenizer(
            text=instruction_text,
            return_tensors="pt",
        ).to("cuda")
        input_token_count = int(inputs["input_ids"].shape[-1])

        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=gen_max_new_tokens,          # ✅ dùng đúng tên biến
            temperature=gen_temperature,
            top_k=gen_top_k,
            top_p=gen_top_p,
            repetition_penalty=gen_repetition_penalty,
            do_sample=gen_do_sample,
        )

        generation_errors = []

        def _run_generate():
            try:
                with lock:
                    model.generate(**generation_kwargs)
            except Exception as exc:
                generation_errors.append(exc)
                traceback.print_exc()
                # model.generate normally closes the streamer itself. If it
                # raises in the background thread, explicitly send the sentinel
                # so the Flask response cannot hang forever in status=started.
                try:
                    streamer.on_finalized_text("", stream_end=True)
                except Exception:
                    pass

        # ✅ Thứ tự đúng: clear → add stopping_criteria → start thread
        _slot_abort_events[slot_id].clear()
        generation_kwargs["stopping_criteria"] = StoppingCriteriaList([
            AbortStoppingCriteria(_slot_abort_events[slot_id])
        ])
        Thread(target=_run_generate, daemon=True).start()   # ✅ Chỉ start 1 lần

        def generate_stream():
            full_response = []
            completed = False
            try:
                for text in stream_without_thinking(streamer):
                    full_response.append(text)
                    inference_logs_db[inference_id]["generated_text"] = "".join(full_response)
                    inference_logs_db[inference_id]["status"] = "streaming"
                    yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"

                generated_text = "".join(full_response)
                if generation_errors:
                    error_message = str(generation_errors[0])
                    inference_logs_db[inference_id]["status"] = "error"
                    inference_logs_db[inference_id]["error_message"] = error_message
                    yield f"data: {json.dumps({'error': error_message, 'inference_id': inference_id}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Count with the exact tokenizer loaded for this model. Emitting
                # this as a final SSE event lets benchmark clients record
                # measured token use instead of estimating from characters.
                output_token_count = len(tokenizer.encode(generated_text, add_special_tokens=False))
                usage = {
                    "input_tokens": input_token_count,
                    "output_tokens": output_token_count,
                    "total_tokens": input_token_count + output_token_count,
                    "accounting": "model_tokenizer",
                }
                inference_logs_db[inference_id]["generated_text"] = generated_text
                inference_logs_db[inference_id]["usage"] = usage
                inference_logs_db[inference_id]["status"] = "completed"
                completed = True
                yield f"data: {json.dumps({'usage': usage, 'inference_id': inference_id}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
            finally:
                if not completed and inference_logs_db[inference_id].get("status") not in ("error", "completed"):
                    _slot_abort_events[slot_id].set()
                    inference_logs_db[inference_id]["status"] = "interrupted"
                    inference_logs_db[inference_id]["error_message"] = "Client/tunnel disconnected before generation completed."

        return Response(generate_stream(), mimetype='text/event-stream')

    except Exception as e:
        traceback.print_exc()
        inference_logs_db[inference_id]["status"] = "error"
        inference_logs_db[inference_id]["error_message"] = str(e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/infer/logs', methods=['GET'])
@app.route('/api/infer/logs/<inference_id>', methods=['GET'])
def get_inference_logs(inference_id=None):
    global inference_logs_db

    if inference_id:
        log = inference_logs_db.get(inference_id)
        if log:
            return jsonify(log), 200
        else:
            return jsonify({"error": "Inference log not found"}), 404
    else:
        # Return all logs, perhaps with pagination in a real-world scenario
        return jsonify(list(inference_logs_db.values())), 200


@app.route('/api/system-eval/resources')
def get_resources():
    info = pynvml.nvmlDeviceGetMemoryInfo(gpu_handle)
    util = pynvml.nvmlDeviceGetUtilizationRates(gpu_handle)
    vram_used_mb  = info.used   // 1024 ** 2
    vram_total_mb = info.total  // 1024 ** 2
    vram_free_mb  = info.free   // 1024 ** 2

    with _active_eval_lock:
        active = _active_eval_count

    active_training = any(
        value.get('status') == 'TRAINING'
        for key, value in jobs_db.items()
        if not key.startswith('__eval_tmp_')
    )

    # Ngưỡng VRAM tối thiểu để nhận thêm 1 eval job (MB)
    VRAM_MIN_FREE_MB = 5120  # 5 GB

    can_create = (
        not active_training
        and active < GPU_EVAL_SLOTS
        and vram_free_mb >= VRAM_MIN_FREE_MB
    )

    return jsonify({
        "vram_used_mb":    vram_used_mb,
        "vram_total_mb":   vram_total_mb,
        "vram_free_mb":    vram_free_mb,
        "gpu_util":        util.gpu,
        "active_evals":    active,
        "active_training": active_training,
        "max_evals":       GPU_EVAL_SLOTS,
        "can_create_eval": can_create,
        "vram_min_free_mb": VRAM_MIN_FREE_MB,
        "eval_checkpoint_protocol": 1,
    }), 200


@app.route("/api/cluster", methods=["POST"])
def cluster():
    """
    POST /api/cluster

    Phải gọi /api/cluster/visualize trước (để có embedding cache).
    Chạy DBSCAN lọc noise + KMeans phân cụm, lưu toàn bộ kết quả vào
    _cluster_cache để các bước filter sau có thể đọc độc lập.

    Body JSON:
    {
        "k":           11,   // Tùy chọn, số cụm KMeans,      mặc định 11
        "eps":         0.05, // Tùy chọn, DBSCAN eps,         mặc định 0.05
        "min_samples": 3     // Tùy chọn, DBSCAN min_samples, mặc định 3
    }

    Response JSON:
    {
        "data":        [ { ...original_item, "cluster": int }, ... ],
        "assignments": [ int, ... ],   // -1 = noise, 0..K-1 = cụm KMeans
        "groups":      [ { "groupId": int, "count": int, "label": str }, ... ],
        "clusterStats": [              // trung bình cosine similarity theo từng cụm
            { "clusterId": int, "avgSimilarity": float, "count": int }, ...
        ],
        "avgSimilarity": float         // trung bình cosine similarity toàn bộ tập clean
    }
    """
    body = request.get_json(silent=True) or {}

    k = body.get("k", 11)
    if not isinstance(k, int) or k < 1:
        return jsonify({"error": "'k' phải là số nguyên dương."}), 400

    eps = body.get("eps", 0.05)
    if not isinstance(eps, (int, float)) or eps <= 0:
        return jsonify({"error": "'eps' phải là số thực dương."}), 400

    min_samples = body.get("min_samples", 3)
    if not isinstance(min_samples, int) or min_samples < 1:
        return jsonify({"error": "'min_samples' phải là số nguyên dương."}), 400

    data = body.get("data")
    
    try:
        result = _service.cluster(
            k=int(k),
            eps=float(eps),
            min_samples=int(min_samples),
            data=data,
        )
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/filter", methods=["POST"])
def cluster_filter():
    """
    POST /api/cluster/filter

    Body JSON:
    {
        "threshold": 0.9  // Tùy chọn, mặc định 0.9
    }
    """
    body = request.get_json(silent=True) or {}
    threshold = body.get("threshold", 0.9)
    if not isinstance(threshold, (int, float)) or not (0 < threshold <= 1):
        return jsonify({"error": "'threshold' phải là số thực trong khoảng (0, 1]."}), 400

    try:
        result = _service.filter_deduplicate(threshold=float(threshold))
        return jsonify(result), 200
    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/filter")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/remove-noise", methods=["POST"])
def cluster_filter_remove_noise():
    """
    POST /api/cluster/remove-noise

    Phải gọi /api/cluster trước (để có cluster cache).
    Lọc bỏ toàn bộ điểm bị DBSCAN đánh nhãn noise (cluster == -1),
    trả về phần còn lại với nhãn cụm KMeans nguyên vẹn.

    Không có tham số. Hoạt động độc lập với /deduplicate.

    Response JSON:
    {
        "data":         [ { ...original_item, "cluster": int }, ... ],
        "assignments":  [ int, ... ],   // chỉ còn 0..K-1, không còn -1
        "groups":       [ { "groupId": int, "count": int, "label": str }, ... ],
        "removedCount": int,            // số điểm noise bị loại
        "keptCount":    int             // số điểm còn lại
    }
    """
    try:
        result = _service.filter_remove_noise()
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/remove-noise")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/deduplicate", methods=["POST"])
def cluster_filter_deduplicate():
    """
    POST /api/cluster/deduplicate

    Phải gọi /api/cluster trước (để có cluster cache).
    Loại bỏ các điểm có cosine similarity với tâm cụm > threshold
    (tức là quá giống nhau / trùng lặp), luôn giữ lại điểm gần tâm
    nhất của mỗi cụm. Điểm noise (cluster == -1) bị bỏ qua hoàn toàn.

    Hoạt động độc lập với /remove-noise.

    Body JSON:
    {
        "threshold": 0.9  // Tùy chọn, mặc định 0.9 — khoảng (0, 1]
    }

    Response JSON:
    {
        "data":         [ { ...original_item, "cluster": int }, ... ],
        "assignments":  [ int, ... ],
        "groups":       [ { "groupId": int, "count": int, "label": str }, ... ],
        "removedCount": int,   // số điểm bị loại do quá gần tâm cụm
        "keptCount":    int    // số điểm còn lại
    }
    """
    body = request.get_json(silent=True) or {}

    threshold = body.get("threshold", 0.9)
    if not isinstance(threshold, (int, float)) or not (0 < threshold <= 1):
        return jsonify({"error": "'threshold' phải là số thực trong khoảng (0, 1]."}), 400

    try:
        result = _service.filter_deduplicate(threshold=float(threshold))
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/deduplicate")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/visualize", methods=["POST"])
def cluster_visualize():
    """
    POST /api/cluster/visualize

    Body JSON:
    {
        "data":        [ <sample>, ... ],  // Bắt buộc  (OpenAI messages format)
        "max_k":       20,                 // Tùy chọn, mặc định 20
        "eps":         0.1,               // Tùy chọn, DBSCAN eps, mặc định 0.1
        "min_samples": 3                   // Tùy chọn, DBSCAN min_samples, mặc định 3
    }

    Response JSON:
    {
        "elbow":      [ { "k": int, "wcss": float }, ... ],
        "silhouette": [ { "k": int, "silhouette": float }, ... ],
        "kDistance":  [ { "rank": int, "distance": float }, ... ],
        "pointCount": int,
        "noiseCount": int
    }

    Side-effect: lưu conv_embeddings vào cache để /api/cluster tái sử dụng.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body phải là JSON hợp lệ."}), 400

    data = body.get("data")
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({"error": "'data' phải là một mảng không rỗng."}), 400

    max_k = body.get("max_k", 20)
    if not isinstance(max_k, int) or max_k < 1:
        return jsonify({"error": "'max_k' phải là số nguyên dương."}), 400

    eps = body.get("eps", 0.15)
    if not isinstance(eps, (int, float)) or eps <= 0:
        return jsonify({"error": "'eps' phải là số thực dương (ví dụ: 0.15)."}), 400

    min_samples = body.get("min_samples", 6)
    if not isinstance(min_samples, int) or min_samples < 1:
        return jsonify({"error": "'min_samples' phải là số nguyên dương."}), 400

    try:
        result = _service.visualize(
            data=data,
            max_k=max_k,
            eps=float(eps),
            min_samples=int(min_samples),
        )
        return jsonify(result), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/visualize")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/cache", methods=["DELETE"])
def clear_cache():
    """DELETE /api/cluster/cache — Xóa toàn bộ embedding + cluster cache."""
    _service.clear_cache()
    return jsonify({"message": "Cache đã được xóa."}), 200


# ── Health-check ──────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "device": _service.device}), 200


# clustering_service = ClusteringService()

@app.route("/api/cluster/safe-split", methods=["POST"])
def cluster_safe_split():
    """
    POST /api/cluster/safe-split

    Body JSON:
    {
        "data": [ <sample>, ... ],      // bắt buộc
        "test_percentage": 20,          // tùy chọn, mặc định 20
        "threshold": 0.85,              // tùy chọn, mặc định 0.85
        "max_attempts": 20,             // tùy chọn, mặc định 20
        "seed": 42                      // tùy chọn, mặc định 42
    }
    """
    try:
        body = request.get_json(force=True) or {}
        data = body.get("data")
        test_percentage = body.get("test_percentage", 20)
        threshold = body.get("threshold", 0.85)
        max_attempts = body.get("max_attempts", 20)
        seed = body.get("seed", 42)

        if not isinstance(data, list) or len(data) == 0:
            return jsonify({"error": "Missing or empty data array"}), 400

        result = _service.safe_split(
            data=data,
            test_percentage=float(test_percentage),
            threshold=float(threshold),
            max_attempts=int(max_attempts),
            seed=int(seed),
        )
        return jsonify(result), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e) or "Failed to generate safe split"}), 500



# ======================================================================
# 5. MAIN SERVER STARTUP
# ======================================================================

if __name__ == '__main__':
    PORT = int(os.environ.get("PORT", 5000))
    HOST = os.environ.get("HOST", "0.0.0.0")

    print("=" * 60)
    print("🚀 GPU Service đang khởi động...")
    print(f"   Host : {HOST}")
    print(f"   Port : {PORT}")
    print(f"   BACKEND_URL      : {_read_secret('BACKEND_URL') or '(chưa set)'}")
    print(f"   OPENROUTER_API_KEY: {'✅ đã set' if _read_secret('OPENROUTER_API_KEY') else 'ℹ️ nhận theo từng eval job'}")
    print("=" * 60)

    # Chạy Background Job Manager
    manager_thread = threading.Thread(target=job_manager_thread, daemon=True)
    manager_thread.start()
    print("✅ Job Manager đã sẵn sàng.")

    # Chạy Flask Server
    print(f"🔥 Flask Server đang lắng nghe trên {HOST}:{PORT} ...")
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
