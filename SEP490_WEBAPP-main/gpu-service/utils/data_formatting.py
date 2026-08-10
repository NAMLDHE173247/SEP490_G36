"""Data formatting & n-gram metrics — tach tu app.py (giu nguyen hanh vi).

formatting_prompts_func / AssistantOnlyDataCollator / compute_ngram_metrics /
compute_question_detection_rate + DEFAULT_SOCRATIC_PROMPT.
"""
import re
import torch
from bisect import bisect_left
from transformers import DataCollatorWithPadding
from constants.prompts import DEFAULT_SOCRATIC_PROMPT


def ensure_right_padding(tokenizer):
    """Đảm bảo tokenizer có pad_token (fallback eos_token) và padding_side='right'.

    Gom pattern lặp lại ở training + eval (load model). Giữ nguyên hành vi cũ.
    """
    if getattr(tokenizer, "pad_token", None) is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    return tokenizer


# ======================================================================
# 2. FORMAT PROMPT (Hỗ trợ trích xuất System Prompt từ dữ liệu)
# ======================================================================


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


def formatting_prompts_func(
    examples,
    tokenizer,
    col_map="messages",
    default_system=None,
    enable_thinking=False,
):
    texts = []

    # The AutoTrain prompt is the canonical condition for every training row.
    # Dataset exports may retain old row-level prompts from a previous version.
    canonical_system = str(default_system or "").strip()
    fallback_system = DEFAULT_SOCRATIC_PROMPT
    want_thinking = bool(enable_thinking)
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

        # Chat template của model. `enable_thinking` bật khi train reasoning
        # (Gemma 4 / Qwen3); mặc định tắt cho tutor Socratic.
        try:
            try:
                formatted_text = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=False,
                    enable_thinking=want_thinking,
                )
            except TypeError:
                formatted_text = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=False,
                )
            texts.append(formatted_text)
        except Exception:
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
    FALLBACK_HEADERS = (
        r"<｜Assistant｜>",
        r"<\|assistant\|>",
        r"<\|im_start\|>assistant",
        r"<start_of_turn>model",
        # Gemma 4 (Unsloth / HF): <|turn>model … khác Gemma 2/3
        r"<\|turn>model",
        r"<\|turn\|>model",
        r"<\|start_header_id\|>assistant",
        r"### Response:",
        r"### Assistant:",
        r"### assistant:",
        r"Assistant:\n",
        r"assistant\n",
    )

    def __init__(self, tokenizer, enable_thinking=False):
        self.tokenizer = tokenizer
        self.enable_thinking = bool(enable_thinking)
        self.text_tokenizer = getattr(tokenizer, "tokenizer", tokenizer)
        self.padder = DataCollatorWithPadding(tokenizer=self.text_tokenizer, padding=True)

        # Thống kê để preflight/log biết mask có thật sự bám được hay không.
        self.rows_masked = 0
        self.rows_unmatched = 0
        self.rows_slow_path = 0

        # Detect the transition into the assistant turn from a complete
        # system -> user -> assistant conversation.  Formatting an
        # assistant-only dummy puts BOS/system material into ``header_str``;
        # that header then never matches a real training row that already has
        # a user turn.  The suffix after the user sentinel is the stable
        # assistant-turn marker for Qwen, Llama, ChatML, Mistral, etc.
        try:
            system_sentinel = "__CHAT_TEMPLATE_SYSTEM_SENTINEL__"
            user_sentinel = "__CHAT_TEMPLATE_USER_SENTINEL__"
            assistant_sentinel = "MAGICAL_CONTENT_12345"
            dummy = [
                {"role": "system", "content": system_sentinel},
                {"role": "user", "content": user_sentinel},
                {"role": "assistant", "content": assistant_sentinel},
            ]
            try:
                formatted = tokenizer.apply_chat_template(
                    dummy,
                    tokenize=False,
                    add_generation_prompt=False,
                    enable_thinking=self.enable_thinking,
                )
            except TypeError:
                formatted = tokenizer.apply_chat_template(
                    dummy, tokenize=False, add_generation_prompt=False,
                )
            start_idx = formatted.find(assistant_sentinel)
            user_idx = formatted.rfind(user_sentinel, 0, start_idx)
            if start_idx < 0:
                raise ValueError("assistant sentinel was not rendered")

            header_start = user_idx + len(user_sentinel) if user_idx >= 0 else 0
            detected_header = formatted[header_start:start_idx]
            self.header_str = detected_header or formatted[:start_idx]
            self.end_str = formatted[start_idx + len(assistant_sentinel):].strip()
        except Exception:
            self.header_str = "assistant\n"
            self.end_str = "\n"
            
    def _char_offsets(self, sequence, decoded_text):
        """`cum[i]` = độ dài chuỗi khi decode `sequence[:i]`, tính trong một lượt.

        Thay cho binary-search decode lại prefix ở từng bước — cách cũ tốn
        O(số_span × log n × n) công decode trên CPU cho **mỗi batch**, đủ để bỏ
        đói GPU khi hội thoại nhiều lượt. Trả về None nếu ghép các token lẻ
        không khớp `decoded_text` (vài tokenizer chuẩn hoá khoảng trắng khi
        decode cả chuỗi), để caller lùi về đường cũ và giữ nguyên kết quả mask.
        """
        try:
            pieces = self.text_tokenizer.batch_decode([[token] for token in sequence])
        except Exception:
            return None
        if len(pieces) != len(sequence) or "".join(pieces) != decoded_text:
            return None

        cumulative = [0] * (len(sequence) + 1)
        total = 0
        for index, piece in enumerate(pieces):
            total += len(piece)
            cumulative[index + 1] = total
        return cumulative

    def _locate_token(self, sequence, cumulative, target_char, lo):
        """Token đầu tiên (chỉ số >= lo) mà phần decode tới đó phủ `target_char`."""
        if cumulative is not None:
            return bisect_left(cumulative, target_char, lo, len(sequence))

        low, high = lo, len(sequence)
        found = high
        while low < high:
            mid = (low + high) // 2
            prefix = self.text_tokenizer.decode(sequence[:mid])
            if isinstance(prefix, list):
                prefix = "".join(prefix)
            if len(prefix) >= target_char:
                found = mid
                high = mid
            else:
                low = mid + 1
        return found

    def _find_matches(self, decoded_text):
        matches = list(re.finditer(re.escape(str(self.header_str)), decoded_text))
        if matches:
            return matches
        for fallback in self.FALLBACK_HEADERS:
            matches = list(re.finditer(fallback, decoded_text))
            if matches:
                return matches
        return []

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

            matches = self._find_matches(decoded_text)
            if not matches:
                # Không bám được header: hàng này sẽ train trên toàn bộ text.
                # Đếm lại để preflight phát hiện thay vì hỏng âm thầm.
                self.rows_unmatched += 1
                continue

            cumulative = self._char_offsets(sequence, decoded_text)
            if cumulative is None:
                self.rows_slow_path += 1

            row_labels = torch.full_like(input_ids[row], -100)
            valid_length = int(attention_mask[row].sum().item())
            cursor = 0
            assistant_tokens = 0

            for match in matches:
                char_start = match.end()  # Content starts right after the header
                char_end = len(decoded_text)

                # Find the end of the response using string matching
                if self.end_str:
                    found_end = decoded_text.find(str(self.end_str), char_start)
                    if found_end != -1:
                        char_end = found_end

                content_start_tok = self._locate_token(sequence, cumulative, char_start, cursor)
                if content_start_tok == len(sequence):
                    continue

                content_end_tok = self._locate_token(sequence, cumulative, char_end, content_start_tok)
                # Ensure we don't go beyond the attention mask
                content_end_tok = min(content_end_tok, valid_length)

                row_labels[content_start_tok:content_end_tok] = input_ids[row, content_start_tok:content_end_tok]
                assistant_tokens += max(0, content_end_tok - content_start_tok)
                cursor = content_end_tok

            row_labels[attention_mask[row] == 0] = -100
            if assistant_tokens > 0:
                labels[row] = row_labels
                self.rows_masked += 1
            else:
                self.rows_unmatched += 1

        batch["labels"] = labels
        return batch


def preflight_assistant_mask(tokenizer, collator, texts, max_length):
    """Thử mask trên nhiều mẫu để biết collator có bám được header assistant không.

    Bản cũ chỉ kiểm mẫu đầu tiên và dựa vào `supervised_tokens <= 0` — điều
    không bao giờ xảy ra, vì khi không match collator giữ nguyên nhãn full-text.
    Nghĩa là lỗi mask trôi qua im lặng và model học cả lượt của học sinh.
    Ở đây ta đọc trực tiếp bộ đếm match/unmatch của collator.
    """
    before_masked = collator.rows_masked
    before_unmatched = collator.rows_unmatched

    checked = 0
    supervised = 0
    total = 0

    for text in texts:
        if not text:
            continue
        try:
            encoding = tokenizer(text, truncation=True, max_length=max_length)
            batch = collator([encoding])
        except Exception as error:
            return {"ok": False, "error": str(error), "checked": checked}
        checked += 1
        supervised += int((batch["labels"] != -100).sum().item())
        total += int(batch["attention_mask"].sum().item())

    matched = collator.rows_masked - before_masked
    unmatched = collator.rows_unmatched - before_unmatched

    return {
        "ok": checked > 0 and matched > 0,
        "checked": checked,
        "matched": matched,
        "unmatched": unmatched,
        "supervised_tokens": supervised,
        "total_tokens": total,
        "coverage": round(matched / checked, 4) if checked else 0.0,
        "supervised_ratio": round(supervised / total, 4) if total else 0.0,
    }


_NGRAM_DEPS = None


def _load_ngram_deps():
    """Nạp nltk/rouge ở lần dùng đầu tiên.

    Chỉ pipeline eval cần BLEU/ROUGE, nhưng module này nằm trên đường import của
    training — nạp sẵn buộc job train kéo theo cả nltk và gọi `nltk.download`
    (chạm mạng) ngay lúc service khởi động.
    """
    global _NGRAM_DEPS
    if _NGRAM_DEPS is None:
        import nltk
        from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
        from rouge_score import rouge_scorer

        nltk.download('punkt', quiet=True)
        nltk.download('punkt_tab', quiet=True)
        _NGRAM_DEPS = (nltk, sentence_bleu, SmoothingFunction, rouge_scorer)
    return _NGRAM_DEPS


def compute_ngram_metrics(expected: str, answer: str) -> dict:
    """Tính BLEU-1 và ROUGE-L giữa answer và expected reference."""
    if not expected or not answer:
        return {"bleu": 0.0, "rouge_l": 0.0}

    nltk, sentence_bleu, SmoothingFunction, rouge_scorer = _load_ngram_deps()
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


def compute_question_detection_rate(assistant_turns: list[str]) -> float:
    """Tỉ lệ lượt assistant có chứa câu hỏi.

    Non-scoring metric — chỉ dùng để phân tích xu hướng Socratic, không tính
    vào điểm. Một lượt được coi là có câu hỏi nếu 100 ký tự cuối chứa '?'
    (bắt được cả câu hỏi không nằm ở cuối cùng).

    Returns: float trong [0.0, 1.0]
    """
    if not assistant_turns:
        return 0.0

    count = 0
    for turn in assistant_turns:
        text = turn.strip()
        # Kiểm tra 100 ký tự cuối để bắt cả câu hỏi nằm giữa lượt
        tail = text[-100:] if len(text) > 100 else text
        if '?' in tail:
            count += 1

    return round(count / len(assistant_turns), 4)
