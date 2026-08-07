"""Cổng chất lượng dữ liệu + chat template cho AutoTrain.

Ba việc trước khi trainer chạy:

  * `resolve_chat_template_name` / `apply_chat_template` — không còn ép ChatML
    cho mọi model (Llama/Gemma bị lệch train vs serve).
  * `filter_training_rows` — loại mẫu không có tín hiệu học + dedup.
  * `build_length_report` — cảnh báo khi max_length cắt nhiều hội thoại.
"""
from __future__ import annotations

import json
import hashlib
import random
from collections import Counter

MIN_ASSISTANT_CHARS = 8
MAX_LENGTH_SAMPLE = 500
TRUNCATION_WARN_RATIO = 0.20


def resolve_chat_template_name(model_name: str) -> str | None:
    """Suy tên template Unsloth theo family model.

    Trả về None nghĩa là nên giữ chat_template sẵn trên tokenizer (Unsloth
    Instruct thường đã đúng). Chỉ map khi tokenizer thiếu template.
    """
    name = (model_name or "").lower()
    if "llama-3" in name or "llama3" in name or "meta-llama-3" in name:
        return "llama-3"
    if "gemma" in name:
        return "gemma"
    if "phi-4" in name or "phi4" in name:
        return "phi-4"
    if "phi-3" in name or "phi3" in name:
        return "phi-3"
    if "vistral" in name or "mistral" in name:
        return "mistral"
    if "qwen" in name:
        return "qwen-2.5"
    if "chatml" in name:
        return "chatml"
    return None


def apply_chat_template(tokenizer, model_name: str):
    """Áp chat template đúng family; ưu tiên native nếu đã có.

    Trả về `(tokenizer, info)` với info dùng cho log / effective_config.
    """
    native = getattr(tokenizer, "chat_template", None)
    has_native = bool(native and str(native).strip())
    suggested = resolve_chat_template_name(model_name)

    info = {
        "had_native_template": has_native,
        "suggested": suggested,
        "applied": None,
        "mode": "native",
    }

    if has_native:
        info["applied"] = "native"
        info["mode"] = "native"
        return tokenizer, info

    # Tokenizer thiếu template → thử Unsloth theo family, fallback chatml.
    template_name = suggested or "chatml"
    try:
        from unsloth import get_chat_template

        tokenizer = get_chat_template(
            tokenizer,
            chat_template=template_name,
            mapping={
                "role": "role",
                "content": "content",
                "user": "user",
                "assistant": "assistant",
                "system": "system",
            },
        )
        info["applied"] = template_name
        info["mode"] = "unsloth"
    except Exception as exc:
        info["applied"] = None
        info["mode"] = "failed"
        info["error"] = str(exc)

    return tokenizer, info


def _normalize_messages(raw) -> list[dict] | None:
    messages = raw
    if isinstance(messages, str):
        text = messages.strip()
        if not text:
            return None
        try:
            messages = json.loads(text)
        except Exception:
            # Chuỗi thuần: coi như 1 lượt user, không đủ để train SFT hội thoại.
            return [{"role": "user", "content": text}]

    if not isinstance(messages, list):
        return None

    normalized = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or item.get("from") or "").strip().lower()
        content = item.get("content", item.get("value", ""))
        if role in ("human", "student"):
            role = "user"
        elif role in ("gpt", "bot", "tutor", "model"):
            role = "assistant"
        if role not in ("system", "user", "assistant"):
            continue
        if not isinstance(content, str):
            content = str(content) if content is not None else ""
        content = content.strip()
        if not content and role != "system":
            continue
        normalized.append({"role": role, "content": content})
    return normalized


def _pick_column(example: dict, col_map: str | None) -> str | None:
    if col_map and col_map in example:
        return col_map
    for key in ("messages", "conversations", "instruction", "text"):
        if key in example:
            return key
    skip = {"conversation_id", "conversationId", "id", "session_id", "sessionId"}
    for key in example:
        if key not in skip:
            return key
    return None


def _row_quality(messages: list[dict] | None) -> str | None:
    """Trả về mã lỗi nếu mẫu xấu, None nếu giữ được."""
    if not messages:
        return "empty_or_unparseable"
    users = [m for m in messages if m["role"] == "user" and m["content"]]
    assistants = [m for m in messages if m["role"] == "assistant" and m["content"]]
    if not users:
        return "missing_user"
    if not assistants:
        return "missing_assistant"
    longest = max(len(m["content"]) for m in assistants)
    if longest < MIN_ASSISTANT_CHARS:
        return "assistant_too_short"
    return None


def _content_hash(messages: list[dict]) -> str:
    # Bỏ system khi hash để trùng nội dung hội thoại vẫn bị loại dù prompt khác.
    payload = [
        {"role": m["role"], "content": " ".join(m["content"].lower().split())}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def filter_training_rows(dataset, col_map: str | None = None):
    """Lọc mẫu bẩn + dedup exact. Trả về `(filtered_dataset, report)`.

    `dataset` là HuggingFace Dataset. Nếu sau lọc còn 0 mẫu, caller nên fail job.
    """
    reasons = Counter()
    keep_indices = []
    seen_hashes = set()
    total = len(dataset)

    for index in range(total):
        example = dataset[index]
        column = _pick_column(example, col_map)
        if column is None:
            reasons["no_trainable_column"] += 1
            continue
        messages = _normalize_messages(example.get(column))
        # instruction/output kiểu Alpaca: dựng lại messages tối thiểu
        if messages and len(messages) == 1 and messages[0]["role"] == "user":
            output = example.get("output") or example.get("response") or example.get("answer")
            if isinstance(output, str) and output.strip():
                messages.append({"role": "assistant", "content": output.strip()})

        fault = _row_quality(messages)
        if fault:
            reasons[fault] += 1
            continue

        digest = _content_hash(messages)
        if digest in seen_hashes:
            reasons["duplicate"] += 1
            continue
        seen_hashes.add(digest)
        keep_indices.append(index)

    filtered = dataset.select(keep_indices) if keep_indices else dataset.select([])
    report = {
        "total": total,
        "kept": len(keep_indices),
        "dropped": total - len(keep_indices),
        "reasons": dict(reasons),
    }
    return filtered, report


def format_filter_report(label: str, report: dict) -> str:
    reasons = report.get("reasons") or {}
    reason_text = ", ".join(f"{k}={v}" for k, v in sorted(reasons.items())) or "none"
    return (
        f"[DataQuality:{label}] kept={report['kept']}/{report['total']} "
        f"dropped={report['dropped']} ({reason_text})"
    )


def build_length_report(tokenizer, texts, max_length: int, sample_cap: int = MAX_LENGTH_SAMPLE):
    """Ước lượng phân phối độ dài token và tỉ lệ bị cắt bởi max_length."""
    if not texts:
        return {
            "sampled": 0,
            "max_length": max_length,
            "truncated_ratio": 0.0,
            "p50": 0,
            "p95": 0,
            "max_observed": 0,
            "warn": False,
        }

    population = list(texts)
    if len(population) > sample_cap:
        rng = random.Random(3407)
        population = rng.sample(population, sample_cap)

    lengths = []
    truncated = 0
    for text in population:
        if not text:
            continue
        try:
            # Không truncation để biết độ dài thật trước khi cắt.
            encoded = tokenizer(text, truncation=False, add_special_tokens=True)
            ids = encoded["input_ids"]
            length = len(ids) if isinstance(ids, list) else int(getattr(ids, "shape", [0])[-1] or 0)
        except Exception:
            continue
        lengths.append(length)
        if length > max_length:
            truncated += 1

    if not lengths:
        return {
            "sampled": 0,
            "max_length": max_length,
            "truncated_ratio": 0.0,
            "p50": 0,
            "p95": 0,
            "max_observed": 0,
            "warn": False,
        }

    lengths.sort()
    n = len(lengths)

    def _pct(p):
        index = min(n - 1, max(0, int(round((p / 100.0) * (n - 1)))))
        return lengths[index]

    ratio = truncated / n
    return {
        "sampled": n,
        "max_length": max_length,
        "truncated_ratio": round(ratio, 4),
        "truncated_count": truncated,
        "p50": _pct(50),
        "p95": _pct(95),
        "max_observed": lengths[-1],
        "warn": ratio > TRUNCATION_WARN_RATIO,
    }


def format_length_report(report: dict) -> str:
    line = (
        f"[Length] sampled={report['sampled']} p50={report['p50']} p95={report['p95']} "
        f"max={report['max_observed']} limit={report['max_length']} "
        f"truncated={report['truncated_ratio'] * 100:.1f}%"
    )
    if report.get("warn"):
        line += (
            f" — ⚠️ hơn {TRUNCATION_WARN_RATIO * 100:.0f}% mẫu bị cắt; "
            "tăng modelMaxLength hoặc rút gọn hội thoại."
        )
    return line
