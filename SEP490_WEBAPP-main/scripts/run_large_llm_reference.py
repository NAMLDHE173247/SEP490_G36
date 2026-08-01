#!/usr/bin/env python3
"""Run a locked dataset against a larger OpenRouter model and score it.

The output is deliberately labelled as a contextual reference. It is not a
matched Base control and must not be used to attribute effects to fine-tuning.
"""

from __future__ import annotations

import argparse
import ast
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GPU_DIR = ROOT / "gpu-service"
sys.path.insert(0, str(GPU_DIR))

from locked_eval_protocol import (  # noqa: E402
    distribution_summary,
    extract_item_metadata,
    sha256_text,
    stable_json_hash,
    validate_locked_dataset,
)


CRITERIA_KEYS = {
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


def extract_constant(name: str) -> str:
    tree = ast.parse((GPU_DIR / "app.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
                return ast.literal_eval(node.value)
    raise RuntimeError(f"Could not extract {name} from gpu-service/app.py")


def load_dataset(path: Path) -> list[dict]:
    if path.suffix.lower() == ".jsonl":
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("conversations"), list):
        return payload["conversations"]
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    return payload if isinstance(payload, list) else [payload]


def openrouter_call(api_key: str, payload: dict, retries: int = 3) -> tuple[dict, int, bool]:
    last_error = None
    first_attempt_failed = False
    for attempt in range(retries):
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/sep490/locked-evaluation",
                "X-Title": "SEP490 Locked Evaluation",
                "X-OpenRouter-Metadata": "enabled",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return json.loads(response.read().decode("utf-8")), attempt, first_attempt_failed
        except Exception as exc:  # network/provider failures are part of the evidence
            last_error = exc
            if attempt == 0:
                first_attempt_failed = True
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(str(last_error))


def get_model_metadata(model_id: str) -> dict:
    with urllib.request.urlopen("https://openrouter.ai/api/v1/models", timeout=60) as response:
        models = json.loads(response.read().decode("utf-8")).get("data", [])
    for model in models:
        if model.get("id") == model_id or model.get("canonical_slug") == model_id:
            return model
    raise ValueError(f"Model ID not found in OpenRouter catalog: {model_id}")


def system_prompt_for(item: dict, variant: str, override: str, default_prompt: str) -> tuple[str, str]:
    if variant == "P0":
        return "", "P0_no_system_prompt"
    if override:
        return override, "run_config_override"
    for message in item.get("messages", []):
        if message.get("role") == "system" and message.get("content"):
            return str(message["content"]), "dataset_system_message"
    return default_prompt, "service_default"


def generation_messages(item: dict, system_prompt: str) -> list[dict]:
    user = next(message["content"] for message in item["messages"] if message.get("role") == "user")
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user})
    return messages


def build_judge_text(local_index: int, result: dict) -> str:
    user = result["replay_turns"][0]["user"]
    model = result["replay_turns"][0]["model"]
    text = (
        f"=== HỘI THOẠI {local_index} ===\n"
        f"[SYSTEM PROMPT]\n{result.get('system_prompt', '')}\n\n"
        f"[HỘI THOẠI]\nHọc sinh: {user}\nGia sư: {model}"
    )
    if result.get("reference_answer"):
        text += "\n\n[REFERENCE FOR JUDGE ONLY - NEVER SHOWN TO THE MODEL]\n" + result["reference_answer"]
    if result.get("gold_key_points"):
        text += "\n\n[GOLD KEY POINTS FOR JUDGE ONLY]\n" + json.dumps(result["gold_key_points"], ensure_ascii=False)
    return text


def score_batches(results: list[dict], api_key: str, judge_model: str, judge_prompt: str) -> None:
    for result in results:
        if result.get("generation_status") == "success":
            continue
        criteria = {short: 0.0 for short in CRITERIA_KEYS}
        result.update(
            {
                "criteria_scores": criteria,
                "criteria_reasons": {
                    short: "Pre-specified score 0: model did not produce a valid response."
                    for short in CRITERIA_KEYS
                },
                "group_scores": {"knowledge_k": 0.0, "socratic_s": 0.0},
                "judge_status": "not_required_generation_failure_scored_zero",
            }
        )
    eligible = [result for result in results if result.get("generation_status") == "success"]
    for start in range(0, len(eligible), 5):
        batch = eligible[start : start + 5]
        text = "\n\n".join(build_judge_text(index, result) for index, result in enumerate(batch))
        try:
            reply, retries, first_failed = openrouter_call(
                api_key,
                {
                    "model": judge_model,
                    "messages": [
                        {"role": "system", "content": judge_prompt},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0,
                    "max_tokens": 8192,
                    "provider": {"allow_fallbacks": False},
                },
            )
            content = reply["choices"][0]["message"]["content"]
            left, right = content.find("["), content.rfind("]") + 1
            parsed = json.loads(content[left:right])
            by_index = {int(row["conv_index"]): row for row in parsed}
            for index, result in enumerate(batch):
                row = by_index.get(index)
                if row is None:
                    result.update({"judge_status": "failed", "judge_error": "parse_miss"})
                    continue
                criteria = {}
                reasons = {}
                for short, full in CRITERIA_KEYS.items():
                    criteria[short] = float(row[full]["score"])
                    reasons[short] = str(row[full].get("reason", ""))
                result.update(
                    {
                        "criteria_scores": criteria,
                        "criteria_reasons": reasons,
                        "group_scores": {
                            "knowledge_k": criteria["B1"],
                            "socratic_s_raw": round((criteria["A1"] + criteria["A2"] + criteria["A3"]) / 3, 6),
                            "socratic_s": round(
                                min((criteria["A1"] + criteria["A2"] + criteria["A3"]) / 3, 1.0)
                                if criteria["A1"] <= 1
                                else (criteria["A1"] + criteria["A2"] + criteria["A3"]) / 3,
                                6,
                            ),
                            "a1_cap_applied": criteria["A1"] <= 1,
                        },
                        "judge_status": "success",
                        "judge_response_id": reply.get("id"),
                        "effective_judge_model": reply.get("model"),
                        "judge_retry_count": retries,
                        "judge_first_attempt_failed": first_failed,
                    }
                )
        except Exception as exc:
            for result in batch:
                result.update({"judge_status": "failed", "judge_error": str(exc)[:500]})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--model", required=True, help="Pinned OpenRouter model identifier")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--judge-model", default="google/gemini-2.5-flash")
    parser.add_argument("--prompt-variant", choices=("P0", "P1"), default="P1")
    parser.add_argument("--prompt-file", type=Path)
    parser.add_argument("--prompt-version", default="UNVERSIONED")
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--reasoning-effort", choices=("low", "medium", "high"))
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENROUTER_API_KEY is required")

    dataset = load_dataset(args.dataset)
    if args.limit:
        dataset = dataset[: args.limit]
    validation = validate_locked_dataset(dataset, strict=True)
    if not validation["valid"]:
        raise SystemExit("Locked dataset invalid:\n- " + "\n- ".join(validation["errors"]))

    default_prompt = extract_constant("DEFAULT_SOCRATIC_SYSTEM")
    judge_prompt = extract_constant("SOCRATIC_JUDGE_SYSTEM_BATCH") + extract_constant("JUDGE_REFERENCE_POLICY")
    model_metadata = get_model_metadata(args.model)
    supported_parameters = set(model_metadata.get("supported_parameters") or [])
    if not ({"max_tokens", "max_completion_tokens"} & supported_parameters):
        raise SystemExit(f"{args.model} does not expose a lockable output-token cap")
    override = args.prompt_file.read_text(encoding="utf-8").strip() if args.prompt_file else ""
    started = dt.datetime.now(dt.timezone.utc)
    results = []

    for index, item in enumerate(dataset):
        meta = extract_item_metadata(item, index)
        system_prompt, source = system_prompt_for(item, args.prompt_variant, override, default_prompt)
        messages = generation_messages(item, system_prompt)
        t0 = time.perf_counter()
        try:
            generation_payload = {
                "model": args.model,
                "messages": messages,
                "provider": {"allow_fallbacks": False},
            }
            if "temperature" in supported_parameters:
                generation_payload["temperature"] = 0
            if "max_tokens" in supported_parameters:
                generation_payload["max_tokens"] = args.max_new_tokens
            elif "max_completion_tokens" in supported_parameters:
                generation_payload["max_completion_tokens"] = args.max_new_tokens
            if "seed" in supported_parameters:
                generation_payload["seed"] = args.seed
            if args.reasoning_effort and "reasoning_effort" in supported_parameters:
                generation_payload["reasoning_effort"] = args.reasoning_effort

            reply, retry_count, first_attempt_failed = openrouter_call(
                api_key,
                generation_payload,
            )
            e2e_ms = (time.perf_counter() - t0) * 1000
            choice = reply["choices"][0]
            response_text = str(choice["message"]["content"] or "").strip()
            usage = reply.get("usage") or {}
            output_tokens = usage.get("completion_tokens")
            status = "success" if response_text else "failed"
            failure_type = None if response_text else "empty_output"
            finish_reason = choice.get("finish_reason")
            output_limit = finish_reason == "length"
            telemetry = {
                "ttft_ms": None,
                "e2e_ms": round(e2e_ms, 3),
                "tpot_ms": None,
                "tokens_per_second": (
                    round(float(output_tokens) / (e2e_ms / 1000), 6)
                    if output_tokens is not None and e2e_ms > 0 else None
                ),
                "tokens_per_minute": (
                    round(float(output_tokens) / (e2e_ms / 60000), 6)
                    if output_tokens is not None and e2e_ms > 0 else None
                ),
                "words_per_minute": round(len(response_text.split()) / (e2e_ms / 60000), 6),
                "characters_per_second": round(len(response_text) / (e2e_ms / 1000), 6),
                "input_tokens": usage.get("prompt_tokens"),
                "output_tokens": output_tokens,
                "provider_usage": usage,
            }
            result = {
                **meta,
                "conv_index": index,
                "num_turns": 1,
                "avg_latency_ms": round(e2e_ms, 3),
                "replay_turns": [{"user": messages[-1]["content"], "model": response_text, "latency_ms": round(e2e_ms, 3)}],
                "assistant_turns": [response_text],
                "system_prompt": system_prompt,
                "reference_answer": str(item.get("reference_answer") or ""),
                "gold_key_points": item.get("gold_key_points") if isinstance(item.get("gold_key_points"), list) else [],
                "generation_status": status,
                "failure_type": failure_type,
                "first_attempt_failed": first_attempt_failed,
                "generation_retry_count": retry_count,
                "output_limit_reached": output_limit,
                "telemetry": telemetry,
                "prompt_trace": {
                    "prompt_variant": args.prompt_variant,
                    "prompt_version": args.prompt_version,
                    "prompt_source": source,
                    "prompt_applied": bool(system_prompt),
                    "system_prompt_hash": sha256_text(system_prompt) if system_prompt else None,
                    "rendered_input_hash": stable_json_hash(messages),
                },
                "provider_response_id": reply.get("id"),
                "openrouter_metadata": reply.get("openrouter_metadata"),
                "requested_model": args.model,
                "effective_model": reply.get("model"),
                "model_identity_match": reply.get("model") == args.model,
                "finish_reason": finish_reason,
                "generation_parameters": {
                    key: value for key, value in generation_payload.items()
                    if key not in ("messages", "provider")
                },
            }
        except Exception as exc:
            e2e_ms = (time.perf_counter() - t0) * 1000
            result = {
                **meta,
                "conv_index": index,
                "num_turns": 1,
                "avg_latency_ms": round(e2e_ms, 3),
                "replay_turns": [],
                "generation_status": "failed",
                "failure_type": "provider_error",
                "first_attempt_failed": True,
                "output_limit_reached": False,
                "telemetry": {"e2e_ms": round(e2e_ms, 3)},
                "provider_error": str(exc)[:500],
                "system_prompt": system_prompt,
                "reference_answer": str(item.get("reference_answer") or ""),
                "gold_key_points": item.get("gold_key_points") if isinstance(item.get("gold_key_points"), list) else [],
                "prompt_trace": {
                    "prompt_variant": args.prompt_variant,
                    "prompt_version": args.prompt_version,
                    "prompt_source": source,
                    "prompt_applied": bool(system_prompt),
                    "system_prompt_hash": sha256_text(system_prompt) if system_prompt else None,
                    "rendered_input_hash": stable_json_hash(messages),
                },
                "requested_model": args.model,
                "effective_model": None,
                "model_identity_match": None,
            }
        results.append(result)
        print(f"[{index + 1}/{len(dataset)}] {meta['item_id']} -> {result['generation_status']}")

    score_batches(results, api_key, args.judge_model, judge_prompt)
    score_bearing_statuses = {"success", "not_required_generation_failure_scored_zero"}
    scored = [r for r in results if r.get("judge_status") in score_bearing_statuses]
    k_values = [r["criteria_scores"]["B1"] for r in scored]
    s_values = [r["group_scores"]["socratic_s"] for r in scored]
    generation_cost = sum(
        float(r.get("telemetry", {}).get("provider_usage", {}).get("cost") or 0)
        for r in results
    )
    completed = dt.datetime.now(dt.timezone.utc)
    output = {
        "comparisonRole": "contextual_large_llm_reference",
        "causalClaimAllowed": False,
        "requestedModel": args.model,
        "judgeModel": args.judge_model,
        "totalConversations": len(results),
        "validConversations": len(scored),
        "results": results,
        "summary": {
            "knowledge_k": distribution_summary(k_values),
            "socratic_s": distribution_summary(s_values),
            "failure_rate": sum(1 for r in results if r.get("first_attempt_failed")) / len(results),
            "output_limit_rate": sum(1 for r in results if r.get("output_limit_reached")) / len(results),
            "model_identity_mismatch_count": sum(1 for r in results if r.get("model_identity_match") is False),
            "judge_identity_mismatch_count": sum(
                1 for r in results
                if r.get("judge_status") == "success" and r.get("effective_judge_model") != args.judge_model
            ),
            "generation_cost_usd": round(generation_cost, 8),
            "generation_cost_per_100_items_usd": round(generation_cost * 100 / len(results), 8),
        },
        "runValidity": (
            "valid"
            if all(
                (
                    r.get("generation_status") != "success"
                    and r.get("judge_status") == "not_required_generation_failure_scored_zero"
                )
                or (
                    r.get("generation_status") == "success"
                    and r.get("model_identity_match") is True
                    and r.get("judge_status") == "success"
                    and r.get("effective_judge_model") == args.judge_model
                )
                for r in results
            )
            else "exploratory_or_invalid"
        ),
        "protocolManifest": {
            "protocol_version": "RP4-large-llm-reference-v1",
            "dataset_hash": validation["dataset_hash"],
            "prompt_variant": args.prompt_variant,
            "prompt_version": args.prompt_version,
            "system_prompt_hash": sha256_text(override) if override else None,
            "max_new_tokens": args.max_new_tokens,
            "seed_requested": args.seed if "seed" in supported_parameters else None,
            "temperature_requested": 0 if "temperature" in supported_parameters else None,
            "reasoning_effort": args.reasoning_effort if "reasoning_effort" in supported_parameters else None,
            "supported_parameters": sorted(supported_parameters),
            "model_catalog_snapshot": {
                "id": model_metadata.get("id"),
                "canonical_slug": model_metadata.get("canonical_slug"),
                "created": model_metadata.get("created"),
                "context_length": model_metadata.get("context_length"),
                "pricing": model_metadata.get("pricing"),
            },
            "judge_prompt_hash": sha256_text(judge_prompt),
            "generation_failure_quality_policy": (
                "assign_zero_to_K_S_A1_A2_A3_and_diagnostic_criteria; "
                "retain_item_in_denominator; report_failure_separately"
            ),
            "judge_failure_policy": "missing_measurement; never_convert_to_zero",
        },
        "datasetValidation": validation,
        "startedAt": started.isoformat(),
        "completedAt": completed.isoformat(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
