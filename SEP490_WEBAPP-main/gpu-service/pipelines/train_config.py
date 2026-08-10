"""Chuẩn hoá & kiểm tra config AutoTrain trước khi đưa vào trainer.

Tách khỏi `app.py` để route `/api/train/start` chỉ còn nhận request, còn mọi
luật về giá trị hợp lệ nằm một chỗ. Ba việc chính:

  * `build_train_config` — ép kiểu, kẹp biên, trả về cảnh báo cho người dùng
    thay vì để job chết OOM giữa chừng vì một con số vô lý.
  * `resolve_schedule`   — suy ra eval_steps/save_steps theo kích thước dataset
    (hằng số 10 cũ chỉ hợp với dataset vài chục mẫu).
  * `filter_supported_kwargs` — bỏ qua knob mà phiên bản TRL đang cài không
    hiểu, để nâng cấp không làm gãy môi trường cũ.
"""
import math
import inspect
import dataclasses

from constants.training_defaults import (
    INT_PARAMS,
    BOOL_PARAMS,
    FLOAT_PARAMS,
    VALID_OPTIMS,
    MIN_EVAL_STEPS,
    MAX_EVAL_STEPS,
    VALID_SCHEDULERS,
    LORA_TARGET_PRESETS,
    TARGET_EVAL_POINTS,
    DEFAULT_LORA_TARGETS,
)

DEFAULT_MODEL_NAME = "unsloth/Qwen2.5-7B-Instruct-bnb-4bit"

# Từ r này trở lên, rsLoRA được bật mặc định (scaling ổn định hơn ở rank cao).
RSLORA_AUTO_RANK = 32


def _as_int(name, raw, warnings):
    default, low, high = INT_PARAMS[name]
    if raw is None or raw == "":
        return default
    try:
        value = int(float(raw))
    except (TypeError, ValueError):
        warnings.append(f"{name}={raw!r} không phải số nguyên — dùng mặc định {default}.")
        return default
    if value < low or value > high:
        clamped = min(max(value, low), high)
        warnings.append(f"{name}={value} ngoài khoảng [{low}, {high}] — đã kẹp về {clamped}.")
        return clamped
    return value


def _as_float(name, raw, warnings):
    default, low, high = FLOAT_PARAMS[name]
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        warnings.append(f"{name}={raw!r} không phải số — dùng mặc định {default}.")
        return default
    if value < low or value > high:
        clamped = min(max(value, low), high)
        warnings.append(f"{name}={value} ngoài khoảng [{low}, {high}] — đã kẹp về {clamped}.")
        return clamped
    return value


def _as_bool(name, raw):
    if raw is None or raw == "":
        return BOOL_PARAMS.get(name, False)
    if isinstance(raw, bool):
        return raw
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _as_choice(name, raw, allowed, default, warnings):
    if not raw:
        return default
    value = str(raw).strip()
    if value not in allowed:
        warnings.append(f"{name}={value!r} không được hỗ trợ — dùng {default!r}.")
        return default
    return value


def _resolve_lora_targets(raw, warnings):
    """Nhận tên preset ('all-linear'), chuỗi phân tách bằng dấu phẩy, hoặc list."""
    if not raw:
        return list(LORA_TARGET_PRESETS[DEFAULT_LORA_TARGETS]), DEFAULT_LORA_TARGETS

    if isinstance(raw, (list, tuple)):
        modules = [str(m).strip() for m in raw if str(m).strip()]
        if modules:
            return modules, "custom"
    elif isinstance(raw, str):
        key = raw.strip().lower()
        if key in LORA_TARGET_PRESETS:
            return list(LORA_TARGET_PRESETS[key]), key
        modules = [m.strip() for m in raw.split(",") if m.strip()]
        if modules:
            return modules, "custom"

    warnings.append(
        f"lora_target_modules={raw!r} không đọc được — dùng preset {DEFAULT_LORA_TARGETS!r}."
    )
    return list(LORA_TARGET_PRESETS[DEFAULT_LORA_TARGETS]), DEFAULT_LORA_TARGETS


def build_train_config(parsed):
    """Trả về `(config, warnings)` đã chuẩn hoá cho `background_train_task`."""
    warnings = []

    config = {
        "model_name": str(parsed.get("model_name") or DEFAULT_MODEL_NAME).strip(),
        "epochs": _as_int("epochs", parsed.get("epochs"), warnings),
        "batchSize": _as_int("batchSize", parsed.get("batchSize"), warnings),
        "blockSize": _as_int(
            "blockSize", parsed.get("blockSize") or parsed.get("modelMaxLength"), warnings
        ),
        "learningRate": _as_float("learningRate", parsed.get("learningRate"), warnings),
        "modelMaxLength": _as_int("modelMaxLength", parsed.get("modelMaxLength"), warnings),
        "r": _as_int("r", parsed.get("r"), warnings),
        "lora_alpha": _as_int("lora_alpha", parsed.get("lora_alpha"), warnings),
        "lora_dropout": _as_float("lora_dropout", parsed.get("lora_dropout"), warnings),
        "random_state": _as_int("random_state", parsed.get("random_state"), warnings),
        "gradient_accumulation_steps": _as_int(
            "gradient_accumulation_steps", parsed.get("gradient_accumulation_steps"), warnings
        ),
        "warmup_steps": _as_int("warmup_steps", parsed.get("warmup_steps"), warnings),
        "warmup_ratio": _as_float("warmup_ratio", parsed.get("warmup_ratio"), warnings),
        "weight_decay": _as_float("weight_decay", parsed.get("weight_decay"), warnings),
        "max_grad_norm": _as_float("max_grad_norm", parsed.get("max_grad_norm"), warnings),
        "neftune_noise_alpha": _as_float(
            "neftune_noise_alpha", parsed.get("neftune_noise_alpha"), warnings
        ),
        "seed": _as_int("seed", parsed.get("seed"), warnings),
        "optim": _as_choice("optim", parsed.get("optim"), VALID_OPTIMS, "adamw_8bit", warnings),
        "lr_scheduler_type": _as_choice(
            "lr_scheduler_type", parsed.get("lr_scheduler_type"),
            VALID_SCHEDULERS, "cosine", warnings,
        ),
        "logging_steps": _as_int("logging_steps", parsed.get("logging_steps"), warnings),
        "save_total_limit": _as_int("save_total_limit", parsed.get("save_total_limit"), warnings),
        "dataloader_num_workers": _as_int(
            "dataloader_num_workers", parsed.get("dataloader_num_workers"), warnings
        ),
        "group_by_length": _as_bool("group_by_length", parsed.get("group_by_length")),
        "gradient_checkpointing": _as_bool(
            "gradient_checkpointing", parsed.get("gradient_checkpointing")
        ),
        # Train với khối reasoning/think (Gemma 4 / Qwen3). Mặc định tắt —
        # gia sư Socratic thường không muốn học chuỗi suy nghĩ ẩn.
        "enable_thinking": _as_bool("enable_thinking", parsed.get("enable_thinking")),
        # Override chat template: auto|native|gemma-4|llama-3|qwen-2.5|...
        "chat_template": (
            str(parsed.get("chat_template")).strip()
            if parsed.get("chat_template") not in (None, "")
            else None
        ),
        # Dán nguyên Jinja từ tokenizer_config.json / người tạo model.
        "chat_template_jinja": (
            str(parsed.get("chat_template_jinja")).strip()
            if parsed.get("chat_template_jinja") not in (None, "")
            else None
        ),
        # Dataset nhỏ + LoRA rank cao dễ học vẹt. Mặc định bật; client gửi
        # auto_tune=false để giữ nguyên mọi knob người dùng chọn.
        "auto_tune": (
            True if parsed.get("auto_tune") is None
            else _as_bool("auto_tune", parsed.get("auto_tune"))
        ),
        # Lịch eval/save: để trống -> tự suy theo kích thước dataset.
        "eval_steps": parsed.get("eval_steps"),
        "save_steps": parsed.get("save_steps"),
        # Nguồn dữ liệu & prompt
        "dataset_hf_id": parsed.get("dataset_hf_id"),
        "column_mapping": parsed.get("column_mapping") or parsed.get("columnMapping"),
        # Prompt cấu hình ở AutoTrain phải theo dữ liệu train, nếu không model
        # sẽ được train với prompt khác lúc eval/serve.
        "system_prompt": parsed.get("system_prompt"),
        "system_prompt_version": parsed.get("system_prompt_version"),
        # Hugging Face Hub
        "push_to_hub": _as_bool("push_to_hub", parsed.get("push_to_hub")),
        "hf_repo_id": parsed.get("hf_repo_id"),
        # Resume metadata
        "checkpoint_source": parsed.get("checkpoint_source"),
        "checkpoint_hf_repo": parsed.get("checkpoint_hf_repo"),
        "checkpoint_file_id": parsed.get("checkpoint_file_id"),
    }

    targets, preset = _resolve_lora_targets(parsed.get("lora_target_modules"), warnings)
    config["lora_target_modules"] = targets
    config["lora_target_preset"] = preset

    if parsed.get("use_rslora") is None:
        config["use_rslora"] = config["r"] >= RSLORA_AUTO_RANK
    else:
        config["use_rslora"] = _as_bool("use_rslora", parsed.get("use_rslora"))

    # Early stopping: patience trên tập validation là tiêu chí chính. Ngưỡng
    # loss tuyệt đối chỉ bật khi người dùng chủ động yêu cầu — mặc định cũ 0.5
    # là con số vô nghĩa với đa số dataset.
    config["early_stopping_patience"] = _as_int(
        "early_stopping_patience", parsed.get("early_stopping_patience"), warnings
    )
    config["early_stopping_min_delta"] = _as_float(
        "early_stopping_min_delta", parsed.get("early_stopping_min_delta"), warnings
    )
    raw_target_loss = parsed.get("early_stopping_loss")
    try:
        target_loss = float(raw_target_loss) if raw_target_loss not in (None, "") else 0.0
    except (TypeError, ValueError):
        target_loss = 0.0
    config["early_stopping_loss"] = target_loss if target_loss > 0 else None

    if config["lora_alpha"] < config["r"]:
        warnings.append(
            f"lora_alpha={config['lora_alpha']} nhỏ hơn r={config['r']} — "
            "thường nên đặt alpha ≈ 2×r để adapter học đủ mạnh."
        )

    return config, warnings


def apply_size_aware_defaults(config, n_train):
    """Hạ hyperparam nguy hiểm khi dataset nhỏ. Trả về `(config, changes)`.

    Chỉ chạy khi `auto_tune` còn bật. Không tăng tham số — chỉ kẹp trần/sàn
    an toàn để tránh học vẹt trên vài chục mẫu.
    """
    config = dict(config)
    changes = []

    if not config.get("auto_tune", True):
        return config, changes

    n = max(0, int(n_train or 0))

    def _cap(key, new_value, reason):
        old = config.get(key)
        if old is None:
            return
        try:
            old_num = float(old) if isinstance(new_value, float) else int(old)
        except (TypeError, ValueError):
            return
        if old_num > new_value:
            config[key] = type(new_value)(new_value) if not isinstance(new_value, float) else float(new_value)
            # Giữ kiểu int cho các field số nguyên.
            if isinstance(new_value, int):
                config[key] = int(new_value)
            changes.append(f"{key} {old}→{config[key]} ({reason})")

    def _floor(key, new_value, reason):
        old = config.get(key)
        if old is None:
            return
        try:
            old_num = float(old)
        except (TypeError, ValueError):
            return
        if old_num < new_value:
            config[key] = float(new_value)
            changes.append(f"{key} {old}→{config[key]} ({reason})")

    if n < 30:
        reason = f"chỉ có {n} mẫu"
        _cap("epochs", 3, reason)
        _cap("r", 8, reason)
        _floor("lora_dropout", 0.05, reason)
        _cap("early_stopping_patience", 2, reason)
    elif n < 100:
        reason = f"chỉ có {n} mẫu"
        _cap("epochs", 4, reason)
        _cap("r", 16, reason)

    # alpha < r sau khi hạ rank → kéo alpha lên tối thiểu = r.
    try:
        rank = int(config.get("r") or 0)
        alpha = int(config.get("lora_alpha") or 0)
    except (TypeError, ValueError):
        rank, alpha = 0, 0
    if rank and alpha and alpha < rank:
        config["lora_alpha"] = rank
        changes.append(f"lora_alpha {alpha}→{rank} (giữ alpha ≥ r sau AutoTune)")

    return config, changes


def resolve_schedule(num_examples, batch_size, grad_accum, epochs, config):
    """Suy ra eval_steps/save_steps hợp lý theo số optimizer step thực tế.

    `load_best_model_at_end` của HF yêu cầu save_steps là bội của eval_steps,
    nên hàm này luôn trả về cặp thoả ràng buộc đó.
    """
    per_step = max(1, int(batch_size) * int(grad_accum))
    steps_per_epoch = max(1, math.ceil(max(1, int(num_examples)) / per_step))
    total_steps = max(1, steps_per_epoch * max(1, int(epochs)))

    raw_eval = config.get("eval_steps")
    try:
        eval_steps = int(raw_eval) if raw_eval else 0
    except (TypeError, ValueError):
        eval_steps = 0
    if eval_steps <= 0:
        eval_steps = int(round(total_steps / TARGET_EVAL_POINTS)) or MIN_EVAL_STEPS
    eval_steps = max(MIN_EVAL_STEPS, min(eval_steps, MAX_EVAL_STEPS, total_steps))

    raw_save = config.get("save_steps")
    try:
        save_steps = int(raw_save) if raw_save else 0
    except (TypeError, ValueError):
        save_steps = 0
    if save_steps <= 0:
        save_steps = eval_steps
    save_steps = max(save_steps, eval_steps)
    if save_steps % eval_steps:
        save_steps = int(math.ceil(save_steps / eval_steps) * eval_steps)

    return {
        "steps_per_epoch": steps_per_epoch,
        "total_steps": total_steps,
        "eval_steps": eval_steps,
        "save_steps": save_steps,
        "effective_batch": per_step,
    }


def filter_supported_kwargs(target, kwargs):
    """Giữ lại các kwarg mà `target` thực sự nhận; trả về `(kept, dropped)`.

    TRL/transformers đổi tên tham số khá thường xuyên; lọc trước giúp knob mới
    không làm gãy image đang chạy phiên bản cũ. Nếu không suy được danh sách
    tham số (hoặc hàm nhận `**kwargs`) thì giữ nguyên tất cả.
    """
    names = set()
    try:
        names = {field.name for field in dataclasses.fields(target)}
    except TypeError:
        names = set()

    if not names:
        candidate = target.__init__ if inspect.isclass(target) else target
        try:
            signature = inspect.signature(candidate)
        except (TypeError, ValueError):
            return dict(kwargs), []
        if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in signature.parameters.values()):
            return dict(kwargs), []
        names = set(signature.parameters)

    kept, dropped = {}, []
    for key, value in kwargs.items():
        if key in names:
            kept[key] = value
        else:
            dropped.append(key)
    return kept, dropped
