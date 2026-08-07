"""Training pipeline — tach tu app.py (callbacks + background_train_task).

Import chi tu gpu_state + data_formatting + thu vien; KHONG import tu app (tranh circular).
"""
import os
import json
import time
import shutil
import torch
import traceback
import numpy as np
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from transformers import TrainerCallback, DataCollatorForLanguageModeling
from unsloth import FastLanguageModel, is_bfloat16_supported
from huggingface_hub import login, HfApi, snapshot_download

from core.gpu_state import (
    jobs_db, active_training_jobs,
    get_gpu_stats, _release_gpu_memory,
    LOCAL_CHECKPOINT_BASE,
)
from utils.data_formatting import (
    formatting_prompts_func,
    AssistantOnlyDataCollator,
    ensure_right_padding,
)


class FlaskProgressCallback(TrainerCallback):
    def __init__(self, job_id):
        self.job_id = job_id
        self.start_time = None
        self.last_loss = 0.0
        self.last_eval_loss = None
    def on_step_begin(self, args, state, control, **kwargs):
        if self.start_time is None:
            self.start_time = time.time()

    def on_log(self, args, state, control, logs=None, **kwargs):

        if not logs: return
        is_final_loss = 'train_loss' in logs
        if 'loss' in logs:
            self.last_loss = logs['loss']
        # elif 'train_loss' in logs:
        elif is_final_loss:
            self.last_loss = logs['train_loss']

        # --- PHẦN GIỮ NGUYÊN CODE CŨ CỦA BẠN ---
        loss_val = self.last_loss
        if "eval_loss" in logs:
            self.last_eval_loss = logs["eval_loss"]
        accuracy_val = round(logs.get("accuracy", 0) * 100, 2) if "accuracy" in logs else 0
        epoch_val = round(state.epoch or 0, 2)
        vram_used, _, gpu_util = get_gpu_stats()


        # Tính toán avg_step_time cho ETA (Giữ nguyên)
        avg_step_time = 0
        if self.start_time and state.global_step > 0:
            avg_step_time = (time.time() - self.start_time) / state.global_step

        # --- PHẦN BỔ SUNG ĐỂ TÍNH OVERFIT ---
        eval_loss = round(logs.get("eval_loss", 0), 4) if "eval_loss" in logs else None

        # Cập nhật dữ liệu cho Frontend (Bổ sung eval_loss vào metrics)
        update_payload = {
            'loss': loss_val,
            'epoch': epoch_val,
            'progress': round((state.global_step / state.max_steps) * 100, 2) if state.max_steps > 0 else 0,
            'avg_step_time': round(avg_step_time, 2),
            'total_steps_per_epoch': state.max_steps // max(1, int(state.epoch)) if state.epoch and state.epoch > 0 else state.max_steps,
            'metrics': {
                'loss': loss_val,
                'accuracy': accuracy_val,
                'vram': vram_used,
                'gpu_util': gpu_util
            }
        }

        # Nếu có Eval Loss (kết quả thi thử), gửi kèm về để vẽ biểu đồ Overfit
        if self.last_eval_loss is not None:
            update_payload['metrics']['eval_loss'] = round(self.last_eval_loss, 4)

        jobs_db[self.job_id].update(update_payload)

        # Ghi log dòng Step (Bổ sung hiển thị Eval Loss nếu có)
        log_line = f"Step {state.global_step} | Epoch {epoch_val} | Loss: {loss_val:.4f}"
        if eval_loss is not None:
            log_line += f" | Eval Loss (Overfit): {eval_loss:.4f}"

        if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
        jobs_db[self.job_id]['logs'].append(log_line)

    def on_save(self, args, state, control, **kwargs):
        # Giữ nguyên phần save checkpoint của bạn
        checkpoint_msg = f"💾 Checkpoint saved locally at step {state.global_step}."
        if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
        jobs_db[self.job_id]['logs'].append(checkpoint_msg)

class EnhancedWatchdogCallback(TrainerCallback):
    def __init__(self, job_id):
        self.job_id = job_id

    def on_step_end(self, args, state, control, **kwargs):
        # Training belongs to the worker, not to a browser/SSE connection.
        # LocalTunnel/Ngrok interruptions must never silently stop a valid job.
        if jobs_db.get(self.job_id, {}).get('status') == 'STOPPED':
            print(f"🛑 Stop signal detected for {self.job_id}. Halting...")
            control.should_training_stop = True

class AutoTrainEarlyStoppingCallback(TrainerCallback):
    def __init__(self, job_id, min_loss=0.5, patience=5):
        self.job_id = job_id
        self.min_loss = min_loss
        self.patience = patience
        # Early stopping must use the locked validation partition. A single
        # training batch is noisy and previously stopped the 3 comparable runs
        # at different steps (38, 41 and 56), invalidating the comparison.
        self.best_eval_loss = float('inf')
        self.steps_without_improvement = 0

    def on_log(self, args, state, control, logs=None, **kwargs):
        if not logs: return

        eval_loss = logs.get("eval_loss")
        if eval_loss is None:
            return

        if eval_loss < self.min_loss:
            msg = f"📉 Ngắt sớm: Eval Loss {eval_loss:.4f} đã đạt mục tiêu (< {self.min_loss})."
            self._log_to_db(msg)
            control.should_training_stop = True
            return

        if eval_loss < self.best_eval_loss:
            self.best_eval_loss = eval_loss
            self.steps_without_improvement = 0
        else:
            self.steps_without_improvement += 1
            if self.steps_without_improvement >= self.patience:
                msg = f"⏳ Tự động dừng: Eval Loss không giảm sau {self.patience} lần đánh giá."
                self._log_to_db(msg)
                control.should_training_stop = True

    def _log_to_db(self, msg):
        print(msg)
        if self.job_id in jobs_db:
            if 'logs' not in jobs_db[self.job_id]: jobs_db[self.job_id]['logs'] = []
            jobs_db[self.job_id]['logs'].append(msg)


def background_train_task(job_id, config, filepath, validation_filepath, hf_token):
    jobs_db[job_id]['status'] = 'TRAINING'
    local_job_dir = os.path.join(LOCAL_CHECKPOINT_BASE, job_id)
    hf_repo_id = config.get('hf_repo_id')

    try:
        if hf_token:
            print(f"🔑 Logging into Hugging Face for job {job_id}...")
            login(token=hf_token)

            if hf_repo_id and "/" not in hf_repo_id:
                api = HfApi()
                user_info = api.whoami(token=hf_token)
                username = user_info['name']
                hf_repo_id = f"{username}/{hf_repo_id}"
                print(f"📝 Updated repo ID to: {hf_repo_id}")

            if hf_repo_id and config.get('push_to_hub'):
                from huggingface_hub import create_repo
                try:
                    create_repo(repo_id=hf_repo_id, token=hf_token, repo_type="model", exist_ok=True)
                    print(f"✅ Repository {hf_repo_id} is ready.")
                except Exception as e:
                    print(f"⚠️ Warning creating repo: {e}")

        os.makedirs(local_job_dir, exist_ok=True)
        _release_gpu_memory()

        dtype = torch.bfloat16 if is_bfloat16_supported() else torch.float16
        print(f"[*] Loading model with dtype: {dtype}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=config['model_name'],
            max_seq_length=config['modelMaxLength'],
            dtype=dtype,
            load_in_4bit=True,
            token=hf_token or None,
        )

        # Cấu hình Chat Template cho OpenAI format
        from unsloth import get_chat_template
        tokenizer = get_chat_template(
            tokenizer,
            chat_template = "chatml", # Hoặc dùng mapping tự động dựa trên model_name
            mapping = {"role" : "role", "content" : "content", "user" : "user", "assistant" : "assistant", "system" : "system"},
        )


        ensure_right_padding(tokenizer)

        model = FastLanguageModel.get_peft_model(
            model,
            r=config['r'],
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            lora_alpha=config['lora_alpha'],
            lora_dropout=config['lora_dropout'],
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=config['random_state'],
        )

        col_map = config.get('column_mapping') or config.get('dataset_text_field') or 'text'
        sys_prompt = config.get('system_prompt')
        print(f"[Dataset] Using column mapping: {col_map}")
        if sys_prompt:
            print(f"[Dataset] Using custom system prompt: {sys_prompt[:50]}...")

        if filepath:
            ext = os.path.splitext(filepath)[1]
            dataset = load_dataset('json' if 'json' in ext else 'csv', data_files=filepath, split='train')
        elif config.get('dataset_hf_id'):
            dataset = load_dataset(config['dataset_hf_id'], split='train')
        else:
            raise ValueError("No dataset source provided.")

        # dataset = dataset.train_test_split(test_size=0.1, seed=42)


        # dataset_train = dataset["train"].map(lambda x: formatting_prompts_func(x, tokenizer), batched=True)
        # dataset_eval  = dataset["test"].map(lambda x: formatting_prompts_func(x, tokenizer), batched=True)

        # # Map dữ liệu
        # # dataset_train = dataset["train"].map(formatting_prompts_func, batched=True)
        # # dataset_eval  = dataset["test"].map(formatting_prompts_func, batched=True)

        # print("Text:",dataset_train[0]['text'])

        if len(dataset) == 0:
            raise ValueError("Dataset is empty. Please check your data file.")

        print(f"[Dataset] Loaded {len(dataset)} examples.")

        # V2: ưu tiên validation partition đã được Split Guard khóa từ trước.
        # Không re-split train vì việc đó làm mất tính truy vết của thí nghiệm.
        if validation_filepath:
            validation_ext = os.path.splitext(validation_filepath)[1]
            validation_dataset = load_dataset(
                'json' if 'json' in validation_ext else 'csv',
                data_files=validation_filepath,
                split='train',
            )
            dataset_train = dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval = validation_dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            print(f"[Dataset] Using locked validation partition: {len(validation_dataset)} examples.")
        # Legacy upload: only split internally when no explicit validation exists.
        elif len(dataset) >= 10:
            dataset = dataset.train_test_split(test_size=0.1, seed=42)
            dataset_train = dataset["train"].map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval  = dataset["test"].map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
        else:
            print("[Dataset] Warning: Dataset too small for splitting. Using entire dataset for training.")
            dataset_train = dataset.map(lambda x: formatting_prompts_func(x, tokenizer, col_map, sys_prompt), batched=True)
            dataset_eval  = None

        if len(dataset_train) > 0:
            print("Sample text:", dataset_train[0]['text'][:200], "...")
        else:
            print("[Dataset] Warning: dataset_train is empty after mapping.")

        if "text" not in dataset_train.column_names:
            raise ValueError("Formatted training dataset is missing the required 'text' column.")
        dataset_train = dataset_train.select_columns(["text"])
        if dataset_eval is not None:
            if "text" not in dataset_eval.column_names:
                raise ValueError("Formatted validation dataset is missing the required 'text' column.")
            dataset_eval = dataset_eval.select_columns(["text"])

        resume_from = None
        # A new training job must start from the base model. The target HF repo
        # may already contain `last-checkpoint`, but that does not mean the
        # user requested resume. Only the explicit Resume action supplies
        # `checkpoint_hf_repo`.
        resume_repo_id = config.get("checkpoint_hf_repo")
        resume_worker_checkpoint = config.get("checkpoint_source") == "worker"

        def _is_valid_checkpoint_dir(p):
            if not os.path.isdir(p):
                return False
            return (
                os.path.isfile(os.path.join(p, "trainer_state.json"))
                or os.path.isfile(os.path.join(p, "optimizer.pt"))
                or os.path.isfile(os.path.join(p, "scheduler.pt"))
                or os.path.isfile(os.path.join(p, "training_args.bin"))
            )

        def _pick_valid_checkpoint_under(p):
            if _is_valid_checkpoint_dir(p):
                return p
            try:
                children = [
                    os.path.join(p, d)
                    for d in os.listdir(p)
                    if os.path.isdir(os.path.join(p, d))
                ]
                for c in children:
                    if _is_valid_checkpoint_dir(c):
                        return c
            except Exception as e:
                print(f"[*] Could not scan checkpoint dir {p}: {e}")
            return None

        def _normalize_checkpoint_rng_state(checkpoint_dir):
            """Normalize RNG files produced by older/different HF stacks."""
            import glob as _glob

            def _as_tuple(value):
                if isinstance(value, list):
                    return tuple(_as_tuple(item) for item in value)
                if isinstance(value, tuple):
                    return tuple(_as_tuple(item) for item in value)
                return value

            for rng_file in _glob.glob(os.path.join(checkpoint_dir, "rng_state*.pth")):
                try:
                    rng_state = torch.load(rng_file, map_location="cpu", weights_only=False)
                    if not isinstance(rng_state, dict):
                        continue

                    changed = False
                    python_state = rng_state.get("python")
                    if isinstance(python_state, list):
                        rng_state["python"] = _as_tuple(python_state)
                        changed = True

                    numpy_state = rng_state.get("numpy")
                    if isinstance(numpy_state, list):
                        numpy_state = list(numpy_state)
                        if len(numpy_state) > 1 and isinstance(numpy_state[1], list):
                            numpy_state[1] = np.asarray(numpy_state[1], dtype=np.uint32)
                        rng_state["numpy"] = tuple(numpy_state)
                        changed = True
                    elif isinstance(numpy_state, tuple) and len(numpy_state) > 1 and isinstance(numpy_state[1], list):
                        numpy_state = list(numpy_state)
                        numpy_state[1] = np.asarray(numpy_state[1], dtype=np.uint32)
                        rng_state["numpy"] = tuple(numpy_state)
                        changed = True

                    for device_key in ("cpu", "cuda", "xla", "npu", "hpu", "mlu", "musa"):
                        device_state = rng_state.get(device_key)
                        if isinstance(device_state, list) and all(isinstance(item, int) for item in device_state):
                            rng_state[device_key] = torch.tensor(device_state, dtype=torch.uint8)
                            changed = True

                    if changed:
                        torch.save(rng_state, rng_file)
                        print(f"[*] Normalized legacy RNG state: {rng_file}")
                except Exception as rng_error:
                    os.remove(rng_file)
                    print(f"[!] Removed incompatible RNG state {rng_file}: {rng_error}")

        if resume_worker_checkpoint:
            resume_from = _pick_valid_checkpoint_under(local_job_dir)
            if not resume_from:
                raise ValueError(f"Can't find a persistent worker checkpoint for job {job_id}")
            print(f"[✅] Resuming from persistent worker checkpoint: {resume_from}")
            jobs_db[job_id].setdefault('logs', []).append(
                f"Resuming from persistent worker checkpoint: {resume_from}"
            )
            _normalize_checkpoint_rng_state(resume_from)

        if resume_repo_id:
            try:
                snapshot_download(
                    repo_id=resume_repo_id,
                    local_dir=local_job_dir,
                    token=hf_token,
                    allow_patterns=[
                        "last-checkpoint",
                        "last-checkpoint/*",
                        "last-checkpoint/*/*",
                        "last-checkpoint/*/*/*",
                        "*.json",
                        "*.bin",
                        "*.pt",
                        "*.pth",
                        "*.safetensors",
                    ],
                    local_dir_use_symlinks=False,
                )
            except Exception as e:
                print(f"[*] snapshot_download failed: {e}")

            last_ckpt_path = os.path.join(local_job_dir, "last-checkpoint")

            if os.path.isdir(last_ckpt_path):
                resume_from = _pick_valid_checkpoint_under(last_ckpt_path)

            elif os.path.isfile(last_ckpt_path):
                try:
                    with open(last_ckpt_path, "r", encoding="utf-8") as f:
                        ref = (f.readline() or "").strip()
                    if ref:
                        candidate = os.path.join(local_job_dir, ref)
                        resume_from = _pick_valid_checkpoint_under(candidate)
                except Exception as e:
                    print(f"[*] Could not parse last-checkpoint file: {e}")

            if resume_from:
                print(f"[✅] Resuming from checkpoint: {resume_from}")
                if 'logs' not in jobs_db[job_id]:
                    jobs_db[job_id]['logs'] = []
                jobs_db[job_id]['logs'].append(f"Resuming from checkpoint: {resume_from}")
                _normalize_checkpoint_rng_state(resume_from)
                
                # Fix: Patch training_args.bin precision to prevent c10::BFloat16 != c10::Half errors
                # when resuming a checkpoint trained on A100 (bf16) on a Kaggle T4 (fp16) or vice versa.
                args_file = os.path.join(resume_from, "training_args.bin")
                if os.path.exists(args_file):
                    try:
                        old_args = torch.load(args_file, map_location="cpu", weights_only=False)
                        changed_args = False
                        current_bf16 = is_bfloat16_supported()
                        if getattr(old_args, 'bf16', None) != current_bf16:
                            old_args.bf16 = current_bf16
                            changed_args = True
                        if getattr(old_args, 'fp16', None) != (not current_bf16):
                            old_args.fp16 = not current_bf16
                            changed_args = True
                        if changed_args:
                            torch.save(old_args, args_file)
                            print(f"[*] Patched training_args.bin precision to match current GPU (bf16={current_bf16})")
                    except Exception as e:
                        print(f"[*] Failed to patch training_args.bin: {e}")

                # Fix: xóa best_model_checkpoint cũ trong trainer_state.json
                # để tránh Trainer load checkpoint từ job trước (absolute path không còn tồn tại)
                import glob as _glob
                for _state_file in _glob.glob(os.path.join(local_job_dir, '**/trainer_state.json'), recursive=True):
                    try:
                        with open(_state_file, 'r') as _f:
                            _state = json.load(_f)
                        if _state.get('best_model_checkpoint'):
                            _state['best_model_checkpoint'] = None
                            with open(_state_file, 'w') as _f:
                                json.dump(_state, _f, indent=2)
                            print(f"[*] Cleared stale best_model_checkpoint in {_state_file}")
                    except Exception as _e:
                        print(f"[*] Could not update trainer_state: {_e}")
            else:
                if config.get("checkpoint_source") == "hf" or config.get("checkpoint_hf_repo"):
                    raise ValueError(f"Can't find a valid checkpoint at {last_ckpt_path}")


          # Chuỗi đánh dấu bắt đầu câu trả lời của Bot trong Qwen (ChatML format)

        # response_template = "<|im_start|>assistant\n"

          # Khởi tạo Collator: Nó sẽ tìm chuỗi trên, và CHỈ tính loss từ đoạn đó trở đi
        # collator = DataCollatorForCompletionOnlyLM(
        #     response_template=response_template,
        #     tokenizer=tokenizer
        # )

        # Train on assistant spans with robust fallback
        collator = AssistantOnlyDataCollator(tokenizer)
        try:
            preflight_encoding = tokenizer(
                dataset_train[0]["text"],
                truncation=True,
                max_length=config['modelMaxLength'],
            )
            preflight_batch = collator([preflight_encoding])
            supervised_tokens = int((preflight_batch["labels"] != -100).sum().item())
            total_tokens = int(preflight_batch["attention_mask"].sum().item())
            if supervised_tokens <= 0:
                print("⚠️ [SFT Mask] Could not match assistant header in preflight. Falling back to DataCollatorForLanguageModeling.")
                collator = DataCollatorForLanguageModeling(tokenizer=getattr(tokenizer, "tokenizer", tokenizer), mlm=False)
            else:
                print(
                    f"[SFT Mask] assistant_tokens={supervised_tokens} "
                    f"total_tokens={total_tokens} ignored_tokens={total_tokens - supervised_tokens}"
                )
        except Exception as preflight_err:
            print(f"⚠️ [SFT Mask] Preflight check error ({preflight_err}). Falling back to DataCollatorForLanguageModeling.")
            collator = DataCollatorForLanguageModeling(tokenizer=getattr(tokenizer, "tokenizer", tokenizer), mlm=False)

        # 2.5. SFTTrainer Config (TỐI ƯU CHỐNG OVERFIT)
        trainer = SFTTrainer(
            model = model,
            processing_class = tokenizer,
            # tokenizer = tokenizer,
            train_dataset = dataset_train,
            eval_dataset = dataset_eval,      # Phải có tập này để tính Overfit
            # dataset_text_field = "text",

            data_collator = collator,
            # max_seq_length = config['modelMaxLength'],

            # args = TrainingArguments(
            args = SFTConfig(
                max_length = config['modelMaxLength'],
                dataset_text_field = "text",
                # Keep one conversation per sequence. Packing reduced this
                # 40-conversation dataset to only four optimizer steps/epoch
                # and blurred conversation boundaries.
                packing = False,
                per_device_train_batch_size = config['batchSize'],
                gradient_accumulation_steps = config['gradient_accumulation_steps'],
                warmup_steps = config['warmup_steps'],
                num_train_epochs = config['epochs'],
                learning_rate = config['learningRate'],
                # Tự động chọn kiểu dữ liệu tối ưu dựa trên phần cứng GPU
                fp16 = not is_bfloat16_supported(),
                bf16 = is_bfloat16_supported(),
                logging_steps = 1,

                # --- CẤU HÌNH TÍNH TOÁN OVERFIT ---
                # eval_strategy = "steps", # Đánh giá định kỳ theo bước
                # eval_steps = 50,
                eval_strategy = "steps" if dataset_eval else "no", # Đánh giá định kỳ theo bước
                # Small LoRA runs often have only 50-100 optimizer steps. An
                # interval of 50 produced just one validation point, making
                # load_best_model_at_end effectively meaningless.
                eval_steps = 10 if dataset_eval else None,

                # --- CHIẾN LƯỢC CHỐNG "HỌC VẸT" ---
                # load_best_model_at_end = True, # Kết thúc sẽ lấy Model có kết quả thi tốt nhất
                # metric_for_best_model = "eval_loss",

                load_best_model_at_end = True if dataset_eval else False, # Kết thúc sẽ lấy Model có kết quả thi tốt nhất
                metric_for_best_model = "eval_loss" if dataset_eval else None,
                greater_is_better = False,     # Loss càng thấp càng tốt


                optim = config['optim'],
                weight_decay = config['weight_decay'],
                lr_scheduler_type = config['lr_scheduler_type'],
                seed = config['seed'],
                output_dir = local_job_dir,
                save_strategy = "steps",
                save_steps = 10,
                save_total_limit = 1,          # Tiết kiệm bộ nhớ Colab
                report_to = "none",
                push_to_hub = config.get('push_to_hub', False),
                hub_model_id = hf_repo_id,
                hub_token = hf_token,
                hub_strategy = "checkpoint",
            ),
            callbacks=[
                FlaskProgressCallback(job_id),
                EnhancedWatchdogCallback(job_id),
                AutoTrainEarlyStoppingCallback(
                    job_id=job_id,
                    min_loss=config.get('early_stopping_loss', 0.5),
                    patience=config.get('early_stopping_patience', 100),
                )
            ]
        )

        # 2.6. Bắt đầu huấn luyện (Tự động Resume nếu có checkpoint)
        trainer.train(resume_from_checkpoint = resume_from)

        # A user stop is a resumable terminal state, not a completed training.
        if jobs_db.get(job_id, {}).get('status') == 'STOPPED':
            jobs_db[job_id].setdefault('logs', []).append(
                f"Checkpoint retained at {local_job_dir}; use Resume to continue."
            )
            return

        if config.get('push_to_hub') and hf_repo_id:
            print(f"🎉 Training complete. Pushing final model to {hf_repo_id}...")
            model.push_to_hub(hf_repo_id, token=hf_token, commit_message="End of training push")
            tokenizer.push_to_hub(hf_repo_id, token=hf_token, commit_message="End of training push")
            jobs_db[job_id].update({'status': 'COMPLETED', 'progress': 100, 'final_path': f"hf://{hf_repo_id}"})
        else:
            jobs_db[job_id].update({'status': 'COMPLETED', 'progress': 100})

    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"[❌] Error: {str(e)}\n{error_traceback}")
        error_logs = jobs_db.get(job_id, {}).get('logs') or []
        error_logs.append(f"[ERROR] {str(e)}")
        error_logs.append(error_traceback)
        jobs_db[job_id].update({
            'status': 'ERROR',
            'error': str(e),
            'technical_error': error_traceback,
            'logs': error_logs,
        })
    finally:
        final_status = jobs_db.get(job_id, {}).get('status')
        if final_status == 'COMPLETED' and os.path.exists(local_job_dir):
            shutil.rmtree(local_job_dir)
        elif os.path.exists(local_job_dir):
            jobs_db.get(job_id, {}).setdefault('logs', []).append(
                f"Persistent checkpoint retained for recovery: {local_job_dir}"
            )

        if job_id in active_training_jobs:
            active_training_jobs.remove(job_id)
            print(f"[INFO] Job {job_id} finished. Worker free.")

        # Xoá triệt để các biến cục bộ đang chiếm GPU để tránh rò rỉ VRAM
        try:
            del model
            del tokenizer
            del trainer
        except Exception:
            pass
        
        import gc
        gc.collect()
        torch.cuda.empty_cache()

        _release_gpu_memory()


