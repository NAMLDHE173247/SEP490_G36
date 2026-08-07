"""Inference helpers — tach tu app.py (giu nguyen hanh vi).

DEFAULT_SYSTEM_PROMPT + normalize_history + format_inference_prompt +
stream_without_thinking. Cac ham thuan (khong dung global cua app).
"""

from constants.prompts import DEFAULT_SYSTEM_PROMPT

# ======================================================================
# CELL NÀY ĐẶT TRƯỚC CELL SERVER (Cell 9 cuối)
# Định nghĩa helpers cho inference — chạy 1 lần trước khi start server
# ======================================================================


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
