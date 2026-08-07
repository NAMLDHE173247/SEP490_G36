"""Cổng chất lượng dữ liệu + chat template cho AutoTrain.

Ba việc trước khi trainer chạy:

  * `resolve_chat_template_name` / `apply_chat_template` — không còn ép ChatML
    cho mọi model (Llama/Gemma bị lệch train vs serve).
  * `filter_training_rows` — loại mẫu không có tín hiệu học + dedup.
  * `build_length_report` — cảnh báo khi max_length cắt nhiều hội thoại.
"""
from __future__ import annotations

import json
import random
import hashlib
from collections import Counter

MIN_ASSISTANT_CHARS = 8
MAX_LENGTH_SAMPLE = 500
TRUNCATION_WARN_RATIO = 0.20


def _is_gemma4(model_name: str) -> bool:
    name = (model_name or "").lower()
    return "gemma-4" in name or "gemma4" in name


def _is_large_gemma4(model_name: str) -> bool:
    """26B / 31B (và MoE A4B) theo khuyến nghị Unsloth notebook Kaggle."""
    name = (model_name or "").lower()
    if not _is_gemma4(name):
        return False
    return any(token in name for token in ("31b", "26b", "a4b"))


def resolve_chat_template_name(model_name: str, enable_thinking: bool = False) -> str | None:
    """Suy tên template Unsloth theo family model.

    Gemma 4 (tham khảo notebook Unsloth 31B):
      - bản lớn 26B/31B → luôn `gemma-4-thinking` (cấu trúc đúng model)
      - bản nhỏ + `enable_thinking=True` → `gemma-4-thinking`
      - bản nhỏ + tắt think → `gemma-4`
    Không dùng ChatML hay template `gemma` cũ (Gemma 2).

    Trả về None nghĩa là nên giữ chat_template sẵn trên tokenizer khi không
    bắt buộc phải ép Unsloth.
    """
    name = (model_name or "").lower()
    if "llama-3" in name or "llama3" in name or "meta-llama-3" in name:
        return "llama-3"
    if _is_gemma4(name):
        if enable_thinking or _is_large_gemma4(name):
            return "gemma-4-thinking"
        return "gemma-4"
    if "gemma-3" in name or "gemma3" in name:
        return "gemma3"
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


def _looks_like_jinja_template(text: str) -> bool:
    """Chuỗi dán tay từ tokenizer_config.json thường chứa {{ hoặc {%."""
    return "{{" in (text or "") or "{%" in (text or "")


def apply_chat_template(
    tokenizer,
    model_name: str,
    enable_thinking: bool = False,
    chat_template_override: str | None = None,
    chat_template_jinja: str | None = None,
):
    """Áp chat template đúng family.

    - Gemma 4: luôn gắn template Unsloth (`gemma-4` / `gemma-4-thinking`) như
      notebook https://www.kaggle.com/code/danielhanchen/gemma4-31b-unsloth —
      không tin native/ChatML — trừ khi user override tường minh.
    - Họ khác: giữ native nếu đã có; thiếu thì gắn Unsloth theo family.
    - `chat_template_override`:
        * rỗng / auto → hành vi mặc định
        * native → giữ tokenizer.chat_template (không ép Unsloth)
        * tên Unsloth (gemma-4, llama-3, qwen-2.5, ...) → ép template đó
    - `chat_template_jinja`: dán nguyên chuỗi Jinja (từ HF / người tạo model).

    Trả về `(tokenizer, info)` với info dùng cho log / effective_config.
    """
    native = getattr(tokenizer, "chat_template", None)
    has_native = bool(native and str(native).strip())
    suggested = resolve_chat_template_name(model_name, enable_thinking=enable_thinking)
    force_unsloth = _is_gemma4(model_name)
    override_raw = (chat_template_override or "").strip()
    jinja = (chat_template_jinja or "").strip()
    # Cho phép dán Jinja nhầm vào field chat_template.
    if not jinja and _looks_like_jinja_template(override_raw):
        jinja = override_raw
        override_raw = ""
    override = override_raw.lower()
    if override in ("", "auto", "default", "none", "paste", "custom"):
        override = ""

    info = {
        "had_native_template": has_native,
        "suggested": suggested,
        "applied": None,
        "mode": "native",
        "force_unsloth": force_unsloth,
        "enable_thinking": bool(enable_thinking),
        "override": "jinja" if jinja else (override or None),
    }

    if jinja:
        if not _looks_like_jinja_template(jinja):
            info["applied"] = None
            info["mode"] = "failed"
            info["error"] = (
                "chat_template_jinja không giống Jinja (cần có {{ hoặc {%}). "
                "Hãy copy trường chat_template trong tokenizer_config.json."
            )
            return tokenizer, info
        try:
            tokenizer.chat_template = jinja
            info["applied"] = "jinja"
            info["mode"] = "jinja_override"
            info["jinja_chars"] = len(jinja)
        except Exception as exc:
            info["applied"] = None
            info["mode"] = "failed"
            info["error"] = str(exc)
        return tokenizer, info

    if override == "native":
        info["applied"] = "native" if has_native else None
        info["mode"] = "native_override"
        if not has_native:
            info["error"] = "chat_template=native nhưng tokenizer không có template"
        return tokenizer, info

    if not override and has_native and not force_unsloth:
        info["applied"] = "native"
        info["mode"] = "native"
        return tokenizer, info

    # Override tường minh, tokenizer thiếu template, hoặc Gemma 4 bắt buộc Unsloth.
    template_name = override or suggested or "chatml"
    try:
        try:
            from unsloth.chat_templates import get_chat_template
        except ImportError:
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
        info["mode"] = "unsloth_override" if override else "unsloth"
    except Exception as exc:
        # Gemma 4 mà Unsloth fail: giữ native nếu có, tránh silent ChatML.
        if has_native:
            info["applied"] = "native"
            info["mode"] = "native_fallback"
            info["error"] = str(exc)
        else:
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


def estimate_thinking_coverage(dataset, col_map: str | None = None, sample_cap: int = 200) -> dict:
    """Ước lượng tỉ lệ mẫu có dấu hiệu reasoning/think trong assistant.

    Unsloth khuyến nghị giữ ≥75% mẫu có reasoning nếu muốn giữ khả năng think.
    """
    total = len(dataset)
    if total == 0:
        return {"sampled": 0, "with_thinking": 0, "ratio": 0.0, "warn_low": False}

    indices = list(range(total))
    if total > sample_cap:
        rng = random.Random(3407)
        indices = rng.sample(indices, sample_cap)

    markers = (
        "<think>", "</think>", "<|think|>", "<|channel>thought",
        "<channel>thought", "◁think▷",
    )
    with_thinking = 0
    sampled = 0
    for index in indices:
        example = dataset[index]
        column = _pick_column(example, col_map)
        if column is None:
            continue
        messages = _normalize_messages(example.get(column))
        if not messages:
            continue
        sampled += 1
        assistant_blob = "\n".join(
            m["content"] for m in messages if m.get("role") == "assistant"
        )
        lower = assistant_blob.lower()
        if any(marker.lower() in lower for marker in markers):
            with_thinking += 1

    ratio = (with_thinking / sampled) if sampled else 0.0
    return {
        "sampled": sampled,
        "with_thinking": with_thinking,
        "ratio": round(ratio, 4),
        "warn_low": sampled > 0 and ratio < 0.75,
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
