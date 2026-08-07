"""Data formatting & n-gram metrics — tach tu app.py (giu nguyen hanh vi).

formatting_prompts_func / AssistantOnlyDataCollator / compute_ngram_metrics /
compute_question_detection_rate + DEFAULT_SOCRATIC_PROMPT.
"""
import torch
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
