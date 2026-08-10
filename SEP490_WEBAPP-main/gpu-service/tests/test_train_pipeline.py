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
from pipelines.train_config import (
    build_train_config,
    resolve_schedule,
    filter_supported_kwargs,
    apply_size_aware_defaults,
)
from pipelines.train_data_quality import (
    resolve_chat_template_name,
    apply_chat_template,
    filter_training_rows,
    build_length_report,
)
from pipelines.peft_compat import patch_torchao_lora_constructor


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


class QwenNativeTokenizer(CharTokenizer):
    """Small native Qwen-style tokenizer fixture for assistant masking."""

    BOS = "<｜begin▁of▁sentence｜>"
    USER = "<｜User｜>"
    ASSISTANT = "<｜Assistant｜>"
    EOS = "<｜end▁of▁sentence｜>"

    def apply_chat_template(self, messages, tokenize=False, add_generation_prompt=False):
        rendered = self.BOS
        for message in messages:
            role = message["role"]
            content = message.get("content") or ""
            if role == "system":
                rendered += content
            elif role == "user":
                rendered += self.USER + content
            elif role == "assistant":
                rendered += self.ASSISTANT + content + self.EOS
        if add_generation_prompt:
            rendered += self.ASSISTANT
        return rendered


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


def test_qwen_native_template_masks_assistant_after_user_turn():
    messages = [
        {"role": "system", "content": "Bạn là gia sư."},
        {"role": "user", "content": "2 + 2 bằng bao nhiêu?"},
        {"role": "assistant", "content": "Bằng 4."},
    ]
    rendered = QwenNativeTokenizer.BOS + "Bạn là gia sư." + QwenNativeTokenizer.USER
    rendered += "2 + 2 bằng bao nhiêu?" + QwenNativeTokenizer.ASSISTANT
    rendered += "Bằng 4." + QwenNativeTokenizer.EOS
    tokenizer = QwenNativeTokenizer(rendered + "MAGICAL_CONTENT_12345")
    collator = AssistantOnlyDataCollator(tokenizer)
    collator.padder = tokenizer.pad

    report = preflight_assistant_mask(tokenizer, collator, [rendered], 4096)

    assert collator.header_str == QwenNativeTokenizer.ASSISTANT
    assert report["ok"] is True
    assert report["matched"] == 1


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


def test_torchao_lora_constructor_compat_patch_is_idempotent():
    class LegacyTorchaoLoraLinear:
        def __init__(self, *args, get_apply_tensor_subclass, **kwargs):
            self.callback = get_apply_tensor_subclass

    class FakeTorchaoModule:
        TorchaoLoraLinear = LegacyTorchaoLoraLinear

    fake = FakeTorchaoModule()
    first = patch_torchao_lora_constructor(fake)
    second = patch_torchao_lora_constructor(fake)
    instance = fake.TorchaoLoraLinear(config=object())

    assert first["patched"] is True
    assert second["reason"] == "already patched"
    assert instance.callback is None


def test_chat_template_maps_by_family():
    assert resolve_chat_template_name("unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit") == "llama-3"
    assert resolve_chat_template_name("google/gemma-3-4b-it") == "gemma3"
    assert resolve_chat_template_name("unsloth/gemma-4-E4B-it") == "gemma-4"
    assert resolve_chat_template_name("unsloth/gemma-4-E2B-it") == "gemma-4"
    assert resolve_chat_template_name("unsloth/gemma-4-E4B-it", enable_thinking=True) == "gemma-4-thinking"
    assert resolve_chat_template_name("unsloth/gemma-4-31B-it") == "gemma-4-thinking"
    assert resolve_chat_template_name("unsloth/gemma-4-26B-A4B-it") == "gemma-4-thinking"
    assert resolve_chat_template_name("unsloth/Qwen2.5-7B-Instruct-bnb-4bit") == "qwen-2.5"
    assert resolve_chat_template_name("Viet-Mistral/Vistral-7B-Chat") == "mistral"
    assert resolve_chat_template_name("unknown-base") is None


def test_enable_thinking_defaults_off():
    config, _ = build_train_config({})
    assert config["enable_thinking"] is False
    on, _ = build_train_config({"enable_thinking": True})
    assert on["enable_thinking"] is True


def test_apply_chat_template_keeps_native():
    class Tok:
        chat_template = "{{ messages }}"

    tok, info = apply_chat_template(Tok(), "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit")
    assert info["mode"] == "native"
    assert info["applied"] == "native"
    assert tok.chat_template == "{{ messages }}"


def test_chat_template_override_native_skips_force():
    class Tok:
        chat_template = "keep-me"

    tok, info = apply_chat_template(
        Tok(), "unsloth/gemma-4-E4B-it", chat_template_override="native",
    )
    assert info["mode"] == "native_override"
    assert info["applied"] == "native"
    assert tok.chat_template == "keep-me"


def test_chat_template_passed_in_config():
    config, _ = build_train_config({"chat_template": "llama-3"})
    assert config["chat_template"] == "llama-3"
    empty, _ = build_train_config({})
    assert empty["chat_template"] is None


def test_chat_template_jinja_override():
    class Tok:
        chat_template = "old"

    jinja = "{% for message in messages %}{{ message.content }}{% endfor %}"
    tok, info = apply_chat_template(
        Tok(),
        "CongTyXYZ/SocraticTutor-V1-7B",
        chat_template_jinja=jinja,
    )
    assert info["mode"] == "jinja_override"
    assert info["applied"] == "jinja"
    assert tok.chat_template == jinja

    cfg, _ = build_train_config({"chat_template_jinja": jinja})
    assert cfg["chat_template_jinja"] == jinja


def test_gemma4_forces_unsloth_template_even_with_native():
    """Theo notebook Unsloth Gemma4-31B: luôn gọi get_chat_template('gemma-4*')."""
    class Tok:
        chat_template = "stale-or-wrong-native"

    # Không có Unsloth trong môi trường test → fallback native kèm error, nhưng
    # vẫn đánh dấu force_unsloth và suggested đúng family.
    tok, info = apply_chat_template(Tok(), "unsloth/gemma-4-31B-it")
    assert info["force_unsloth"] is True
    assert info["suggested"] == "gemma-4-thinking"
    assert info["mode"] in ("unsloth", "native_fallback", "failed")
    if info["mode"] == "native_fallback":
        assert tok.chat_template == "stale-or-wrong-native"


class _FakeHFDataset:
    """Subset tối thiểu giống HuggingFace Dataset cho filter_training_rows."""

    def __init__(self, rows):
        self._rows = list(rows)

    def __len__(self):
        return len(self._rows)

    def __getitem__(self, index):
        return self._rows[index]

    def select(self, indices):
        return _FakeHFDataset([self._rows[i] for i in indices])


def test_filter_training_rows_drops_bad_and_duplicates():
    rows = [
        {
            "messages": [
                {"role": "user", "content": "2+2?"},
                {"role": "assistant", "content": "Ban thu dem xem sao?"},
            ]
        },
        {
            "messages": [
                {"role": "user", "content": "2+2?"},
                {"role": "assistant", "content": "Ban thu dem xem sao?"},
            ]
        },  # duplicate
        {"messages": [{"role": "user", "content": "hello"}]},  # missing assistant
        {
            "messages": [
                {"role": "user", "content": "x"},
                {"role": "assistant", "content": "ok"},  # too short
            ]
        },
        {
            "messages": [
                {"role": "user", "content": "Giai thich photosyntesis?"},
                {"role": "assistant", "content": "Ban nghi cay lay nang luong tu dau?"},
            ]
        },
    ]
    filtered, report = filter_training_rows(_FakeHFDataset(rows), "messages")
    assert report["kept"] == 2
    assert report["reasons"]["duplicate"] == 1
    assert report["reasons"]["missing_assistant"] == 1
    assert report["reasons"]["assistant_too_short"] == 1
    assert len(filtered) == 2


def test_auto_tune_caps_small_datasets():
    base, _ = build_train_config({
        "epochs": 5,
        "r": 32,
        "lora_alpha": 64,
        "lora_dropout": 0.0,
        "early_stopping_patience": 5,
    })
    tuned, changes = apply_size_aware_defaults(base, 20)
    assert tuned["epochs"] == 3
    assert tuned["r"] == 8
    assert tuned["lora_dropout"] >= 0.05
    assert tuned["early_stopping_patience"] == 2
    assert tuned["lora_alpha"] >= tuned["r"]
    assert changes

    mid, mid_changes = apply_size_aware_defaults(base, 50)
    assert mid["r"] == 16
    assert mid["epochs"] == 4
    assert mid_changes

    large, large_changes = apply_size_aware_defaults(base, 200)
    assert large["r"] == 32 and large["epochs"] == 5
    assert large_changes == []

    disabled = dict(base)
    disabled["auto_tune"] = False
    same, no_changes = apply_size_aware_defaults(disabled, 10)
    assert same["r"] == 32 and no_changes == []


def test_length_report_warns_on_truncation():
    class CountingTok:
        def __call__(self, text, truncation=False, add_special_tokens=True):
            # Mỗi ký tự = 1 token để dễ kiểm.
            return {"input_ids": list(range(len(text)))}

    texts = ["a" * 100, "b" * 120, "c" * 40, "d" * 90, "e" * 110]
    report = build_length_report(CountingTok(), texts, max_length=80)
    assert report["sampled"] == 5
    assert report["truncated_ratio"] == 0.8
    assert report["warn"] is True
    assert report["p50"] > 0


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
