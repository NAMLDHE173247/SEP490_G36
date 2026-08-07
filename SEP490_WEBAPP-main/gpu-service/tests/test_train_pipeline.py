"""Kiểm tra phần nâng cấp pipeline train.

Trọng tâm là chứng minh collator sau tối ưu cho ra **đúng cùng nhãn** với đường
binary-search cũ (chỉ khác tốc độ), cộng vài test cho việc chuẩn hoá config và
suy lịch eval/save.

Chạy trực tiếp: `python tests/test_train_pipeline.py`
"""
import sys
import torch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.data_formatting import AssistantOnlyDataCollator, preflight_assistant_mask
from pipelines.train_config import build_train_config, resolve_schedule, filter_supported_kwargs


class CharTokenizer:
    """Tokenizer char-level + special token, đủ dùng cho logic mask.

    Điểm quan trọng: `decode` bằng đúng phép nối các mảnh token, nên đường
    offset nhanh của collator sẽ verify thành công và được kích hoạt.
    """

    SPECIALS = ("<|im_start|>", "<|im_end|>")

    def __init__(self, corpus):
        pieces = ["<pad>", *self.SPECIALS]
        for char in sorted(set(corpus)):
            if char not in pieces:
                pieces.append(char)
        self.vocab = pieces
        self.ids = {piece: index for index, piece in enumerate(pieces)}
        self.pad_token_id = 0
        self.pad_token = "<pad>"
        self.padding_side = "right"

    def encode(self, text):
        tokens = []
        cursor = 0
        while cursor < len(text):
            for special in self.SPECIALS:
                if text.startswith(special, cursor):
                    tokens.append(self.ids[special])
                    cursor += len(special)
                    break
            else:
                tokens.append(self.ids[text[cursor]])
                cursor += 1
        return tokens

    def __call__(self, text, truncation=False, max_length=None, **kwargs):
        tokens = self.encode(text)
        if truncation and max_length:
            tokens = tokens[:max_length]
        return {"input_ids": tokens, "attention_mask": [1] * len(tokens)}

    def decode(self, ids, **kwargs):
        return "".join(self.vocab[int(i)] for i in ids)

    def batch_decode(self, sequences, **kwargs):
        return [self.decode(sequence) for sequence in sequences]

    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=False):
        rendered = ""
        for message in messages:
            rendered += f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>\n"
        if add_generation_prompt:
            rendered += "<|im_start|>assistant\n"
        return rendered

    def pad(self, features, return_tensors="pt", **kwargs):
        longest = max(len(f["input_ids"]) for f in features)
        input_ids, attention = [], []
        for feature in features:
            ids = list(feature["input_ids"])
            mask = list(feature.get("attention_mask", [1] * len(ids)))
            padding = longest - len(ids)
            input_ids.append(ids + [self.pad_token_id] * padding)
            attention.append(mask + [0] * padding)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention, dtype=torch.long),
        }


CONVERSATION = [
    {"role": "system", "content": "Ban la gia su Socratic."},
    {"role": "user", "content": "2 cong 2 bang may?"},
    {"role": "assistant", "content": "Ban thu dem tren ngon tay xem sao?"},
    {"role": "user", "content": "Chac la 4."},
    {"role": "assistant", "content": "Dung roi. Vay 4 cong 3 thi sao?"},
]


def _build(texts):
    tokenizer = CharTokenizer("".join(texts) + "MAGICAL_CONTENT_12345assistant")
    collator = AssistantOnlyDataCollator(tokenizer)
    collator.padder = tokenizer.pad
    return tokenizer, collator


def _labels_for(tokenizer, collator, texts):
    features = [tokenizer(text) for text in texts]
    return collator(features)["labels"]


def test_fast_offsets_match_binary_search():
    """Đường offset mới và đường decode cũ phải cho nhãn giống hệt nhau."""
    tokenizer = CharTokenizer("x")
    text = tokenizer.apply_chat_template(CONVERSATION)
    second = tokenizer.apply_chat_template(CONVERSATION[:3])
    texts = [text, second]

    tokenizer, collator = _build(texts)
    fast_labels = _labels_for(tokenizer, collator, texts)
    assert collator.rows_slow_path == 0, "Đường offset nhanh đáng lẽ phải được dùng"
    assert collator.rows_masked == 2

    # Ép quay về đúng thuật toán cũ: binary search + decode lại prefix.
    slow_tokenizer, slow_collator = _build(texts)
    slow_collator._char_offsets = lambda sequence, decoded_text: None
    slow_labels = _labels_for(slow_tokenizer, slow_collator, texts)
    assert slow_collator.rows_slow_path == 2

    assert torch.equal(fast_labels, slow_labels), "Tối ưu collator đã làm đổi nhãn"


def test_only_assistant_spans_are_supervised():
    tokenizer = CharTokenizer("x")
    texts = [tokenizer.apply_chat_template(CONVERSATION)]
    tokenizer, collator = _build(texts)

    features = [tokenizer(texts[0])]
    batch = collator(features)
    labels = batch["labels"][0]

    supervised = "".join(
        tokenizer.vocab[int(token)] for token in labels if int(token) != -100
    )
    assert "ngon tay" in supervised, "Nội dung assistant phải được tính loss"
    assert "2 cong 2 bang may?" not in supervised, "Lượt của học sinh không được tính loss"
    assert "gia su Socratic" not in supervised, "System prompt không được tính loss"


def test_preflight_detects_unmatched_format():
    tokenizer = CharTokenizer("x")
    good = tokenizer.apply_chat_template(CONVERSATION)
    tokenizer, collator = _build([good])

    report = preflight_assistant_mask(tokenizer, collator, [good], 4096)
    assert report["ok"] is True
    assert report["matched"] == 1 and report["unmatched"] == 0
    assert 0 < report["supervised_ratio"] < 1

    plain = "Khong co header assistant o day."
    tokenizer2, collator2 = _build([plain])
    report2 = preflight_assistant_mask(tokenizer2, collator2, [plain], 4096)
    assert report2["ok"] is False, "Dataset sai định dạng phải bị preflight bắt"


def test_schedule_scales_with_dataset_size():
    small = resolve_schedule(40, 2, 4, 3, {})
    assert small["steps_per_epoch"] == 5 and small["total_steps"] == 15
    # Lịch cũ cố định 10 chỉ cho 1 điểm validation trên toàn run này.
    assert small["eval_steps"] == 2

    large = resolve_schedule(20000, 2, 4, 3, {})
    assert large["eval_steps"] > small["eval_steps"]

    # load_best_model_at_end yêu cầu save_steps là bội của eval_steps.
    for schedule in (small, large, resolve_schedule(500, 1, 8, 2, {"save_steps": 33})):
        assert schedule["save_steps"] % schedule["eval_steps"] == 0


def test_config_clamps_and_warns():
    config, warnings = build_train_config({
        "batchSize": 9999,
        "learningRate": "abc",
        "modelMaxLength": 1_000_000,
        "lr_scheduler_type": "made_up",
        "r": 64,
    })
    assert config["batchSize"] == 64
    assert config["learningRate"] == 2e-4
    assert config["modelMaxLength"] == 32768
    assert config["lr_scheduler_type"] == "cosine"
    assert config["use_rslora"] is True, "r cao nên tự bật rsLoRA"
    assert len(warnings) >= 4


def test_early_stopping_threshold_defaults_off():
    config, _ = build_train_config({})
    assert config["early_stopping_loss"] is None, "Ngưỡng loss tuyệt đối phải tắt mặc định"
    assert config["early_stopping_patience"] == 3

    explicit, _ = build_train_config({"early_stopping_loss": 0.4})
    assert explicit["early_stopping_loss"] == 0.4


def test_system_prompt_survives_config_build():
    config, _ = build_train_config({"system_prompt": "Prompt rieng", "system_prompt_version": "v9"})
    assert config["system_prompt"] == "Prompt rieng"
    assert config["system_prompt_version"] == "v9"


def test_filter_supported_kwargs_drops_unknown():
    class Fake:
        def __init__(self, alpha=1, beta=2):
            pass

    kept, dropped = filter_supported_kwargs(Fake, {"alpha": 1, "gamma": 3})
    assert kept == {"alpha": 1} and dropped == ["gamma"]


if __name__ == "__main__":
    failures = 0
    for name, func in sorted(globals().items()):
        if not name.startswith("test_") or not callable(func):
            continue
        try:
            func()
            print(f"PASS {name}")
        except AssertionError as error:
            failures += 1
            print(f"FAIL {name}: {error}")
        except Exception as error:  # noqa: BLE001 - báo lỗi rõ khi chạy tay
            failures += 1
            print(f"ERROR {name}: {type(error).__name__}: {error}")
    print(f"\n{'FAILED' if failures else 'ALL PASSED'} ({failures} lỗi)")
    sys.exit(1 if failures else 0)
