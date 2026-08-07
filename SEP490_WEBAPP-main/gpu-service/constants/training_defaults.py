"""Hyper-parameter mặc định, biên hợp lệ và preset LoRA cho AutoTrain.

Một nguồn sự thật duy nhất cho cả `/api/train/start` (validate) và
`pipelines/training.py` (áp dụng). Biên (min/max) giữ cho job không chết OOM vì
config sai; mặc định hướng tới chất lượng model thay vì chạy cho xong.
"""

# ── LoRA target-module presets ────────────────────────────────────────────
# "all-linear" (attention + MLP) cho chất lượng tốt nhất; "attention" nhẹ VRAM
# hơn và đủ dùng khi dataset rất nhỏ.
LORA_TARGET_PRESETS = {
    "attention": ["q_proj", "k_proj", "v_proj", "o_proj"],
    "mlp": ["gate_proj", "up_proj", "down_proj"],
    "all-linear": [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
}
DEFAULT_LORA_TARGETS = "all-linear"

VALID_OPTIMS = {
    "adamw_8bit", "paged_adamw_8bit", "adamw_torch",
    "adamw_torch_fused", "adafactor", "sgd",
}

VALID_SCHEDULERS = {
    "linear", "cosine", "cosine_with_restarts",
    "polynomial", "constant", "constant_with_warmup",
}

# key -> (default, min, max)
INT_PARAMS = {
    "epochs": (3, 1, 100),
    "batchSize": (2, 1, 64),
    "modelMaxLength": (2048, 128, 32768),
    "r": (16, 1, 256),
    "lora_alpha": (32, 1, 512),
    "gradient_accumulation_steps": (4, 1, 128),
    "warmup_steps": (5, 0, 10000),
    "random_state": (3407, 0, 2 ** 31 - 1),
    "seed": (3407, 0, 2 ** 31 - 1),
    "early_stopping_patience": (3, 1, 1000),
    # Giữ 0 (hành vi cũ) làm mặc định: worker phụ cần shared memory và phải
    # pickle được collator. Nâng lên 2-4 sau khi đã xác nhận trên GPU thật.
    "dataloader_num_workers": (0, 0, 16),
    "save_total_limit": (2, 1, 20),
    "logging_steps": (1, 1, 1000),
}

# key -> (default, min, max)
FLOAT_PARAMS = {
    "learningRate": (2e-4, 1e-7, 1e-2),
    "lora_dropout": (0.05, 0.0, 0.5),
    "weight_decay": (0.01, 0.0, 1.0),
    "warmup_ratio": (0.0, 0.0, 0.5),
    "max_grad_norm": (1.0, 0.0, 100.0),
    # NEFTune: nhiễu embedding lúc train, thường +chất lượng cho instruction
    # tuning. 0 = tắt; 5 là giá trị được khuyến nghị trong paper.
    "neftune_noise_alpha": (0.0, 0.0, 50.0),
    "early_stopping_min_delta": (0.0, 0.0, 10.0),
}

BOOL_PARAMS = {
    # rsLoRA ổn định scaling khi r lớn (>=32); bật mặc định khi r cao.
    "use_rslora": False,
    # Gom sample cùng độ dài -> ít padding -> nhanh hơn. Đổi thứ tự batch nên
    # tắt mặc định để giữ tính tái lập của các run so sánh.
    "group_by_length": False,
    "gradient_checkpointing": True,
    # Train thinking/reasoning traces (Gemma 4 template + enable_thinking).
    # Tắt mặc định cho tutor Socratic; bật khi dataset có chuỗi suy nghĩ.
    "enable_thinking": False,
}

# Số điểm validation mong muốn trên toàn bộ run khi tự động tính eval_steps.
TARGET_EVAL_POINTS = 8
MIN_EVAL_STEPS = 1
MAX_EVAL_STEPS = 500

# Giới hạn số dòng log giữ trong RAM cho mỗi job (tránh phình bộ nhớ ở run dài).
MAX_JOB_LOG_LINES = 2000

# Số mẫu dùng để preflight kiểm tra mask assistant trước khi train.
PREFLIGHT_SAMPLES = 8
