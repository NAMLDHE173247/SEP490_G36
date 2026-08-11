"""Training pipeline — tach tu app.py (callbacks + background_train_task).

Import chi tu gpu_state + data_formatting + thu vien; KHONG import tu app (tranh circular).
"""
import os
import json
import time
import shutil
import math
import re
import hashlib
import torch
import traceback
import numpy as np
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from huggingface_hub import login, HfApi, snapshot_download
from unsloth import FastLanguageModel, is_bfloat16_supported
from transformers import TrainerCallback, DataCollatorForLanguageModeling

from core.gpu_state import (
    jobs_db, active_training_jobs,
    get_gpu_stats, _release_gpu_memory,
    LOCAL_CHECKPOINT_BASE,
)
from utils.data_formatting import (
    formatting_prompts_func,
    AssistantOnlyDataCollator,
    ensure_right_padding,
    preflight_assistant_mask,
)
from constants.training_defaults import MAX_JOB_LOG_LINES, PREFLIGHT_SAMPLES
from pipelines.train_config import (
    resolve_schedule,
    filter_supported_kwargs,
    apply_size_aware_defaults,
)
from pipelines.train_data_quality import (
    apply_chat_template,
    filter_training_rows,
    format_filter_report,
    build_length_report,
    format_length_report,
    estimate_thinking_coverage,
    get_active_chat_template,
)
from pipelines.peft_compat import patch_torchao_lora_constructor

TRAINING_PIPELINE_BUILD = "chat-template-train-loss-20260810-v3"


def _append_log(job_id, line):
    """Ghi một dòng log của job và cắt bớt phần cũ.

    Run dài với logging_steps=1 sinh hàng nghìn dòng; `jobs_db` nằm trong RAM và
    không bao giờ được dọn nên cần chặn trần.
    """
    entry = jobs_db.get(job_id)
    if entry is None:
        return
    logs = entry.setdefault('logs', [])
    logs.append(line)
    overflow = len(logs) - MAX_JOB_LOG_LINES
    if overflow > 0:
        del logs[:overflow]


def _log_preview(value, limit=2400):
    """Keep templates and rendered samples readable as one log entry."""
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    if len(text) > limit:
        return f"{text[:limit]}…[truncated]"
    return text


def _render_chat_template_probe(tokenizer, enable_thinking=False):
    """Render a neutral conversation so logs expose the model's real markers."""
    messages = [
        {"role": "user", "content": "Câu hỏi mẫu"},
        {
            "role": "assistant",
            "content": "<think>Model suy luận mẫu...</think>\nCâu trả lời mẫu",
        },
    ]
    try:
        try:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
                enable_thinking=bool(enable_thinking),
            )
        except TypeError:
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
    except Exception as exc:
        return f"[probe-error] {exc}"


class LegacyFlaskProgressCallback(TrainerCallback):
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
        # FIX: Chỉ cập nhật last_loss từ loss thực tế của batch (key 'loss').
        # KHÔNG dùng 'train_loss' vì đó là trung bình toàn cục từ epoch 1→cuối,
        # sẽ làm biểu đồ vọt lên ở bước cuối cùng.
        if 'loss' in logs:
            self.last_loss = logs['loss']

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

        # Lưu train_loss trung bình toàn cục để tham khảo, nhưng không ghi đè loss_val
        if 'train_loss' in logs:
            update_payload['metrics']['train_loss_avg'] = round(logs['train_loss'], 6)

        # Nếu có Eval Loss (kết quả thi thử), gửi kèm về để vẽ biểu đồ Overfit
        if self.last_eval_loss is not None:
            update_payload['metrics']['eval_loss'] = round(self.last_eval_loss, 4)

        if self.job_id in jobs_db:
            jobs_db[self.job_id].update(update_payload)

        # Ghi log dòng Step (Bổ sung hiển thị Eval Loss nếu có)
        log_line = f"Step {state.global_step} | Epoch {epoch_val} | Loss: {loss_val:.4f}"
        if 'train_loss' in logs:
            log_line += f" | Avg Train Loss: {logs['train_loss']:.4f}"
        if eval_loss is not None:
            log_line += f" | Eval Loss (Overfit): {eval_loss:.4f}"

        _append_log(self.job_id, log_line)

    def on_save(self, args, state, control, **kwargs):
        # Giữ nguyên phần save checkpoint của bạn
        _append_log(self.job_id, f"💾 Checkpoint saved locally at step {state.global_step}.")

def _finite_float(value, default=None):
    """Return a JSON-safe finite float, or ``default`` for missing values."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _short_text(value, limit=360):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)].rstrip() + "…"


class FlaskProgressCallback(TrainerCallback):
    """Publish complete training heartbeats and evaluation sample previews.

    ``TrainerState`` is the source of truth for step counters.  Publishing
    them on every optimizer step keeps the Auto Train monitor working even
    when ``logging_steps`` is greater than one.
    """

    MAX_EVAL_DETAILS = 25
    MAX_TRAIN_DETAILS = 100

    def __init__(self, job_id, tokenizer=None, eval_dataset=None):
        self.job_id = job_id
        self.tokenizer = tokenizer
        self.eval_dataset = eval_dataset
        self.start_time = None
        self.last_loss = 0.0
        self.last_eval_loss = None
        self.last_learning_rate = None
        self.last_grad_norm = None
        self.eval_seen = 0
        self.eval_batch_index = 0
        self.eval_step = None
        self.eval_round = 0
        self.pending_train_batch = None

    def _schedule(self):
        entry = jobs_db.get(self.job_id, {})
        effective = entry.get("effective_config") or {}
        schedule = effective.get("schedule") if isinstance(effective, dict) else {}
        return schedule if isinstance(schedule, dict) else {}

    def _snapshot(self, args, state):
        schedule = self._schedule()
        step = int(getattr(state, "global_step", 0) or 0)
        total_steps = int(
            getattr(state, "max_steps", 0)
            or schedule.get("total_steps", 0)
            or 0
        )
        total_epochs = _finite_float(
            getattr(args, "num_train_epochs", None),
            _finite_float(getattr(state, "num_train_epochs", None), schedule.get("epochs")),
        ) or 0.0
        steps_per_epoch = int(
            schedule.get("steps_per_epoch", 0)
            or getattr(state, "num_update_steps_per_epoch", 0)
            or 0
        )
        if steps_per_epoch <= 0 and total_steps > 0 and total_epochs > 0:
            steps_per_epoch = max(1, int(math.ceil(total_steps / total_epochs)))
        epoch = _finite_float(getattr(state, "epoch", None))
        if epoch is None and steps_per_epoch > 0:
            epoch = step / steps_per_epoch
        epoch = epoch or 0.0
        progress = step / total_steps * 100 if total_steps > 0 else 0.0
        return {
            "step": step,
            "total_steps": total_steps,
            "epoch": round(epoch, 4),
            "total_epochs": round(total_epochs, 4),
            "steps_per_epoch": steps_per_epoch,
            "progress": round(max(0.0, min(100.0, progress)), 2),
        }

    def _publish(self, args, state, logs=None, append_log=False):
        logs = logs or {}
        snapshot = self._snapshot(args, state)

        # FIX: Chỉ dùng key 'loss' (loss thực tế của batch/step hiện tại).
        # KHÔNG fallback sang 'train_loss' — đó là trung bình toàn cục
        # (epoch 1→cuối), sẽ kéo giá trị vọt lên ở bước cuối cùng.
        train_loss = _finite_float(logs.get("loss"))
        if train_loss is not None:
            self.last_loss = train_loss
        eval_loss = _finite_float(logs.get("eval_loss"))
        if eval_loss is not None:
            self.last_eval_loss = eval_loss
        learning_rate = _finite_float(logs.get("learning_rate"))
        if learning_rate is not None:
            self.last_learning_rate = learning_rate
        grad_norm = _finite_float(logs.get("grad_norm"))
        if grad_norm is not None:
            self.last_grad_norm = grad_norm

        vram_used, _, gpu_util = get_gpu_stats()
        avg_step_time = 0.0
        if self.start_time and snapshot["step"] > 0:
            avg_step_time = (time.time() - self.start_time) / snapshot["step"]

        metrics = {
            "loss": self.last_loss,
            "step": snapshot["step"],
            "current_step": snapshot["step"],
            "total_steps": snapshot["total_steps"],
            "epoch": snapshot["epoch"],
            "current_epoch": snapshot["epoch"],
            "total_epochs": snapshot["total_epochs"],
            "steps_per_epoch": snapshot["steps_per_epoch"],
            "vram": vram_used,
            "gpu_util": gpu_util,
            "accuracy": round((_finite_float(logs.get("accuracy"), 0.0) or 0.0) * 100, 2),
            "avg_step_time": round(avg_step_time, 2),
        }
        if self.last_eval_loss is not None:
            metrics["eval_loss"] = round(self.last_eval_loss, 6)
        if self.last_learning_rate is not None:
            metrics["learning_rate"] = self.last_learning_rate
        if self.last_grad_norm is not None:
            metrics["grad_norm"] = self.last_grad_norm
        for key in (
            "train_runtime", "train_samples_per_second", "train_steps_per_second",
            "eval_runtime", "eval_samples_per_second", "eval_steps_per_second",
        ):
            value = _finite_float(logs.get(key))
            if value is not None:
                metrics[key] = value

        payload = {
            "loss": self.last_loss,
            "epoch": snapshot["epoch"],
            "total_epochs": snapshot["total_epochs"],
            "step": snapshot["step"],
            "total_steps": snapshot["total_steps"],
            "progress": snapshot["progress"],
            "avg_step_time": round(avg_step_time, 2),
            "total_steps_per_epoch": snapshot["steps_per_epoch"],
            "metrics": metrics,
        }
        if eval_loss is not None:
            payload["eval_loss"] = round(eval_loss, 6)
        if self.job_id in jobs_db:
            jobs_db[self.job_id].update(payload)

        # Keep a compact, structured drill-down for every actual train-loss
        # point.  The browser can open this just like eval-loss details,
        # without pretending that a shuffled optimizer batch maps to one
        # specific dataset sentence.
        if train_loss is not None and self.job_id in jobs_db:
            train_detail = {
                **snapshot,
                "status": "training",
                "loss": round(self.last_loss, 6),
            }
            if self.pending_train_batch:
                train_detail.update(self.pending_train_batch)
            if self.last_learning_rate is not None:
                train_detail["learning_rate"] = self.last_learning_rate
            if self.last_grad_norm is not None:
                train_detail["grad_norm"] = self.last_grad_norm

            entry = jobs_db[self.job_id]
            details = list(entry.get("train_details") or [])
            if details and details[-1].get("step") == train_detail["step"]:
                details[-1] = train_detail
            else:
                details.append(train_detail)
            entry.update({
                "train_current": train_detail,
                "train_details": details[-self.MAX_TRAIN_DETAILS:],
            })
            self.pending_train_batch = None

        if append_log:
            line = (
                f"Step {snapshot['step']}/{snapshot['total_steps']} | "
                f"Epoch {snapshot['epoch']:.2f}/{snapshot['total_epochs']:.0f} | "
                f"Loss: {self.last_loss:.4f}"
            )
            if eval_loss is not None:
                line += f" | Eval Loss: {eval_loss:.4f}"
            _append_log(self.job_id, line)

    def _decode_eval_text(self, input_ids):
        if self.tokenizer is None:
            return ""
        try:
            if hasattr(input_ids, "detach"):
                input_ids = input_ids.detach().cpu().tolist()
            if isinstance(input_ids, list) and input_ids and isinstance(input_ids[0], list):
                input_ids = input_ids[0]
            return self.tokenizer.decode(
                input_ids,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=True,
            )
        except Exception:
            return ""

    def _capture_train_batch(self, args, state, inputs=None):
        """Capture a preview of the batch immediately before its train loss."""
        if self.tokenizer is None or not isinstance(inputs, dict):
            return
        input_ids = inputs.get("input_ids")
        if input_ids is None:
            return
        try:
            batch_size = int(input_ids.shape[0]) if hasattr(input_ids, "shape") and len(input_ids.shape) > 1 else 1
            row = input_ids[0] if batch_size > 1 else input_ids
            attention = inputs.get("attention_mask")
            if attention is not None and hasattr(attention, "shape") and len(attention.shape) > 1:
                valid_length = int(attention[0].sum().item())
                row = row[:valid_length]
            text = self.tokenizer.decode(
                row.detach().cpu().tolist() if hasattr(row, "detach") else row,
                skip_special_tokens=False,
                clean_up_tokenization_spaces=False,
            )
        except Exception:
            return

        self.pending_train_batch = {
            "batch_size": max(1, batch_size),
            "question": self._extract_question(text),
            "text_preview": _short_text(text, 900),
        }

    def _eval_row_text(self, index):
        """Read the already-formatted validation row without touching the loader."""
        if self.eval_dataset is None:
            return ""
        try:
            row = self.eval_dataset[index]
        except (IndexError, KeyError, TypeError):
            return ""
        if isinstance(row, dict):
            for key in ("text", "question", "prompt", "instruction", "messages"):
                value = row.get(key)
                if value is None:
                    continue
                if isinstance(value, (list, dict)):
                    try:
                        return json.dumps(value, ensure_ascii=False)
                    except (TypeError, ValueError):
                        continue
                return str(value)
        return str(row or "")

    @staticmethod
    def _extract_question(text):
        clean = str(text or "").strip()
        if not clean:
            return ""
        patterns = (
            r"<｜User｜>\s*(.*?)(?=<｜Assistant｜>|<｜end▁of▁sentence｜>|$)",
            r"<\|start_header_id\|>\s*(?:user|human|student)\s*<\|end_header_id\|>\s*(.*?)(?=<\|start_header_id\|>\s*(?:assistant|system)\s*<\|end_header_id\|>|$)",
            r"<\|im_start\|>\s*(?:user|human|student)\s*\n?\s*(.*?)(?=<\|im_start\|>\s*(?:assistant|system)|$)",
            r"\[INST\]\s*(.*?)(?=\[/INST\]|$)",
            r"(?:^|\n)user\s*[:\n]\s*(.*?)(?=\n(?:assistant|system)\s*[:\n]|$)",
            r"(?:^|\n)(?:human|student)\s*[:\n]\s*(.*?)(?=\n(?:assistant|tutor|teacher)\s*[:\n]|$)",
        )
        for pattern in patterns:
            match = re.search(pattern, clean, flags=re.IGNORECASE | re.DOTALL)
            if match:
                return _short_text(match.group(1))
        return _short_text(clean)

    def _make_eval_detail(
        self,
        args,
        state,
        sample_index,
        batch_index=0,
        batch_size=1,
        status="evaluating",
        eval_loss=None,
        text=None,
    ):
        snapshot = self._snapshot(args, state)
        total_samples = len(self.eval_dataset) if self.eval_dataset is not None else None
        sample_index = max(0, int(sample_index or 0))
        batch_size = max(1, int(batch_size or 1))
        if text is None:
            text = self._eval_row_text(sample_index)
        detail = {
            "round": self.eval_round,
            "sample_index": sample_index,
            "batch_index": max(0, int(batch_index or 0)),
            "batch_size": batch_size,
            "seen_samples": min(sample_index + batch_size, total_samples) if total_samples else sample_index + batch_size,
            "total_samples": total_samples,
            "step": snapshot["step"],
            "epoch": snapshot["epoch"],
            "status": status,
            "question": self._extract_question(text),
            "text_preview": _short_text(text),
        }
        if eval_loss is not None:
            detail["eval_loss"] = round(eval_loss, 6)
        return detail

    def _backfill_eval_details(self, args, state, eval_loss=None):
        """Populate details from the formatted eval dataset when callback inputs are absent."""
        entry = jobs_db.get(self.job_id)
        if entry is None or self.eval_dataset is None:
            return
        try:
            total_samples = len(self.eval_dataset)
        except TypeError:
            return
        if total_samples <= 0:
            return

        existing = {
            int(item.get("sample_index")): item
            for item in (entry.get("eval_details") or [])
            if isinstance(item, dict) and item.get("sample_index") is not None
        }
        count = min(total_samples, self.MAX_EVAL_DETAILS)
        details = []
        for index in range(count):
            previous = existing.get(index, {})
            detail = self._make_eval_detail(
                args,
                state,
                sample_index=index,
                batch_index=previous.get("batch_index", index),
                batch_size=previous.get("batch_size", 1),
                status="evaluated",
                eval_loss=eval_loss,
            )
            # Preserve a richer preview captured during prediction if present.
            for key in ("question", "text_preview", "round", "step", "epoch"):
                if previous.get(key):
                    detail[key] = previous[key]
            details.append(detail)

        current = dict(entry.get("eval_current") or {})
        if not current:
            current = details[-1]
        else:
            current_index = current.get("sample_index")
            if current_index is not None and int(current_index) < len(details):
                current = details[int(current_index)]
        if eval_loss is not None:
            current["eval_loss"] = round(eval_loss, 6)
        entry.update({
            "eval_status": "COMPLETED",
            "eval_current": current,
            "eval_details": details,
            "eval_progress": {
                "status": "COMPLETED",
                "sample_index": current.get("sample_index"),
                "seen_samples": total_samples,
                "total_samples": total_samples,
                "step": self._snapshot(args, state)["step"],
                "epoch": self._snapshot(args, state)["epoch"],
                "eval_loss": round(eval_loss, 6) if eval_loss is not None else None,
            },
        })
        _append_log(
            self.job_id,
            f"[Eval] captured {len(details)}/{total_samples} validation sample details "
            f"after eval (step={self._snapshot(args, state)['step']}).",
        )

    def _publish_eval_detail(self, args, state, inputs=None, eval_dataloader=None):
        input_ids = inputs.get("input_ids") if isinstance(inputs, dict) else None
        snapshot = self._snapshot(args, state)
        if self.eval_step != snapshot["step"]:
            self.eval_step = snapshot["step"]
            self.eval_seen = 0
            self.eval_batch_index = 0
            self.eval_round += 1
        try:
            batch_size = int(input_ids.shape[0]) if hasattr(input_ids, "shape") else len(input_ids)
        except (TypeError, ValueError, IndexError):
            batch_size = int(getattr(eval_dataloader, "batch_size", 1) or 1)
        batch_size = max(1, batch_size)
        text = self._decode_eval_text(input_ids) if input_ids is not None else self._eval_row_text(self.eval_seen)
        detail = self._make_eval_detail(
            args,
            state,
            sample_index=self.eval_seen,
            batch_index=self.eval_batch_index,
            batch_size=batch_size,
            text=text,
        )
        self.eval_seen += batch_size
        self.eval_batch_index += 1

        entry = jobs_db.get(self.job_id)
        if entry is None:
            return
        details = (entry.get("eval_details") or []) + [detail]
        details = details[-self.MAX_EVAL_DETAILS:]
        entry.update({
            "eval_status": "EVALUATING",
            "eval_current": detail,
            "eval_details": details,
            "eval_progress": {
                "status": "EVALUATING",
                "sample_index": detail["sample_index"],
                "seen_samples": detail["seen_samples"],
                "total_samples": detail["total_samples"],
                "step": detail["step"],
                "epoch": detail["epoch"],
            },
        })
        if detail["sample_index"] == 0:
            _append_log(
                self.job_id,
                f"[Eval] prediction batch received: sample #1/{detail['total_samples'] or '?'} "
                f"at step={detail['step']}",
            )

    def on_train_begin(self, args, state, control, **kwargs):
        self.start_time = time.time()
        self._publish(args, state)

    def on_step_begin(self, args, state, control, **kwargs):
        if self.start_time is None:
            self.start_time = time.time()

    def on_step_end(self, args, state, control, **kwargs):
        # Heartbeat independent of logging_steps.
        self._publish(args, state)

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs:
            self._publish(args, state, logs=logs, append_log=True)

    def on_prediction_step(self, args, state, control, inputs=None, **kwargs):
        prediction_inputs = inputs if inputs is not None else kwargs.get("inputs")
        self._publish_eval_detail(
            args,
            state,
            prediction_inputs,
            eval_dataloader=kwargs.get("eval_dataloader"),
        )

    def on_evaluate(self, args, state, control, metrics=None, **kwargs):
        metrics = metrics or {}
        self._publish(args, state, logs=metrics)
        entry = jobs_db.get(self.job_id)
        if entry is None:
            return
        eval_loss = _finite_float(metrics.get("eval_loss"), self.last_eval_loss)
        if eval_loss is not None:
            self.last_eval_loss = eval_loss
        # Some Transformers/TRL versions do not expose prediction inputs to
        # callbacks. Keep the modal useful by deriving sample details from the
        # already formatted validation dataset after the aggregate eval loss.
        self._backfill_eval_details(args, state, eval_loss)
        entry = jobs_db.get(self.job_id)
        if entry is None:
            return
        details = list(entry.get("eval_details") or [])
        if details:
            details[-1] = {
                **details[-1],
                "status": "evaluated",
                "eval_loss": round(eval_loss, 6) if eval_loss is not None else None,
            }
        current = dict(entry.get("eval_current") or (details[-1] if details else {}))
        if current:
            current["status"] = "evaluated"
            if eval_loss is not None:
                current["eval_loss"] = round(eval_loss, 6)
        snapshot = self._snapshot(args, state)
        entry.update({
            "eval_status": "COMPLETED",
            "eval_current": current or None,
            "eval_details": details[-self.MAX_EVAL_DETAILS:],
            "eval_progress": {
                "status": "COMPLETED",
                "sample_index": current.get("sample_index") if current else None,
                "seen_samples": self.eval_seen,
                "total_samples": len(self.eval_dataset) if self.eval_dataset is not None else None,
                "step": snapshot["step"],
                "epoch": snapshot["epoch"],
                "eval_loss": round(eval_loss, 6) if eval_loss is not None else None,
            },
        })

    def on_epoch_end(self, args, state, control, **kwargs):
        self._publish(args, state)

    def on_save(self, args, state, control, **kwargs):
        snapshot = self._snapshot(args, state)
        _append_log(
            self.job_id,
            f"Checkpoint saved locally at step {snapshot['step']}/{snapshot['total_steps']}."
        )


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
    """Dừng sớm dựa trên eval_loss của tập validation đã khoá.

    Tiêu chí chính là patience: số lần đánh giá liên tiếp mà eval_loss không
    cải thiện quá `min_delta`. Ngưỡng loss tuyệt đối (`target_loss`) chỉ chạy
    khi người dùng đặt rõ — mặc định cũ `eval_loss < 0.5` là con số tuỳ tiện:
    có dataset chạm ngưỡng sau vài step nên dừng non, có dataset không bao giờ
    chạm nên cơ chế thành vô dụng.
    """

    def __init__(self, job_id, patience=3, min_delta=0.0, target_loss=None):
        self.job_id = job_id
        # Early stopping must use the locked validation partition. A single
        # training batch is noisy and previously stopped the 3 comparable runs
        # at different steps (38, 41 and 56), invalidating the comparison.
        self.patience = max(1, int(patience))
        self.min_delta = max(0.0, float(min_delta or 0.0))
        self.target_loss = float(target_loss) if target_loss else None
        self.best_eval_loss = float('inf')
        self.evals_without_improvement = 0

    def on_log(self, args, state, control, logs=None, **kwargs):
        if not logs: return

        eval_loss = logs.get("eval_loss")
        if eval_loss is None:
            return

        if eval_loss < self.best_eval_loss - self.min_delta:
            self.best_eval_loss = eval_loss
            self.evals_without_improvement = 0
        else:
            self.evals_without_improvement += 1
            if self.evals_without_improvement >= self.patience:
                self._log_to_db(
                    f"⏳ Dừng sớm: eval_loss không cải thiện sau {self.patience} lần đánh giá "
                    f"(tốt nhất {self.best_eval_loss:.4f})."
                )
                control.should_training_stop = True
                return

        if self.target_loss is not None and eval_loss < self.target_loss:
            self._log_to_db(
                f"📉 Dừng sớm: eval_loss {eval_loss:.4f} đạt ngưỡng mục tiêu (< {self.target_loss})."
            )
            control.should_training_stop = True

    def _log_to_db(self, msg):
        print(msg)
        _append_log(self.job_id, msg)


def background_train_task(job_id, config, filepath, validation_filepath, hf_token):
    jobs_db[job_id]['status'] = 'TRAINING'
    build_line = f"[Build] training_pipeline={TRAINING_PIPELINE_BUILD}"
    print(build_line)
    _append_log(job_id, build_line)
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

        enable_thinking = bool(config.get('enable_thinking', False))
        chat_template_override = config.get('chat_template')
        chat_template_jinja = config.get('chat_template_jinja')

        # Chat template: giữ native nếu Instruct đã có; chỉ gắn Unsloth khi thiếu.
        # Gemma 4 + enable_thinking → gemma-4-thinking (notebook Unsloth 31B).
        # chat_template / chat_template_jinja cho model mới / template đặc biệt.
        tokenizer, chat_template_info = apply_chat_template(
            tokenizer,
            config['model_name'],
            enable_thinking=enable_thinking,
            chat_template_override=chat_template_override,
            chat_template_jinja=chat_template_jinja,
        )
        ensure_right_padding(tokenizer)
        raw_chat_template = getattr(tokenizer, "chat_template", None)
        active_chat_template = get_active_chat_template(tokenizer)
        template_hash = (
            hashlib.sha256(active_chat_template.encode("utf-8")).hexdigest()[:16]
            if active_chat_template else None
        )
        template_kind = "variants" if isinstance(raw_chat_template, dict) else (
            "jinja" if active_chat_template else "missing"
        )
        template_msg = (
            f"[ChatTemplate] mode={chat_template_info.get('mode')} "
            f"applied={chat_template_info.get('applied')} "
            f"suggested={chat_template_info.get('suggested')} "
            f"had_native={chat_template_info.get('had_native_template')} "
            f"override={chat_template_info.get('override')} "
            f"enable_thinking={enable_thinking}"
        )
        print(template_msg)
        _append_log(job_id, template_msg)
        template_meta_msg = (
            f"[ChatTemplate] active_kind={template_kind} "
            f"active_chars={len(active_chat_template)} "
            f"active_sha256={template_hash or 'none'}"
        )
        print(template_meta_msg)
        _append_log(job_id, template_meta_msg)
        if active_chat_template:
            _append_log(
                job_id,
                f"[ChatTemplate] active_jinja=\n{_log_preview(active_chat_template)}",
            )
            template_probe = _render_chat_template_probe(tokenizer, enable_thinking)
            _append_log(
                job_id,
                f"[ChatTemplate] rendered_probe=\n{_log_preview(template_probe, 2400)}",
            )
        else:
            _append_log(job_id, "⚠️ [ChatTemplate] tokenizer không có chat_template hoạt động.")
        if chat_template_info.get("error"):
            _append_log(job_id, f"⚠️ [ChatTemplate] {chat_template_info['error']}")

        col_map = config.get('column_mapping') or config.get('dataset_text_field') or 'text'
        sys_prompt = config.get('system_prompt')
        print(f"[Dataset] Using column mapping: {col_map}")
        if sys_prompt:
            print(f"[Dataset] Using custom system prompt: {str(sys_prompt)[:50]}...")
        else:
            _append_log(
                job_id,
                "⚠️ [Dataset] Không nhận được system_prompt — dùng prompt Socratic mặc định. "
                "Kiểm tra lại cấu hình AutoTrain nếu bạn có prompt riêng.",
            )

        if filepath:
            ext = os.path.splitext(filepath)[1]
            dataset = load_dataset('json' if 'json' in ext else 'csv', data_files=filepath, split='train')
        elif config.get('dataset_hf_id'):
            dataset = load_dataset(config['dataset_hf_id'], split='train')
        else:
            raise ValueError("No dataset source provided.")

        if len(dataset) == 0:
            raise ValueError("Dataset is empty. Please check your data file.")

        print(f"[Dataset] Loaded {len(dataset)} examples.")

        # Cổng chất lượng trước format — mẫu trống/assistant ngắn/trùng không được vào trainer.
        dataset, train_filter_report = filter_training_rows(dataset, col_map)
        _append_log(job_id, format_filter_report("train_raw", train_filter_report))
        print(format_filter_report("train_raw", train_filter_report))
        if len(dataset) == 0:
            raise ValueError(
                "Không còn mẫu hợp lệ sau cổng chất lượng dữ liệu "
                f"(dropped={train_filter_report['dropped']}, reasons={train_filter_report['reasons']})."
            )

        validation_dataset = None
        dataset_eval = None
        val_filter_report = None

        # V2: ưu tiên validation partition đã được Split Guard khóa từ trước.
        if validation_filepath:
            validation_ext = os.path.splitext(validation_filepath)[1]
            validation_dataset = load_dataset(
                'json' if 'json' in validation_ext else 'csv',
                data_files=validation_filepath,
                split='train',
            )
            validation_dataset, val_filter_report = filter_training_rows(validation_dataset, col_map)
            _append_log(job_id, format_filter_report("validation", val_filter_report))
            print(format_filter_report("validation", val_filter_report))
            print(f"[Dataset] Using locked validation partition: {len(validation_dataset)} examples.")
            raw_train = dataset
            raw_eval = validation_dataset if len(validation_dataset) > 0 else None
        elif len(dataset) >= 10:
            split = dataset.train_test_split(test_size=0.1, seed=42)
            raw_train = split["train"]
            raw_eval = split["test"]
        else:
            print("[Dataset] Warning: Dataset too small for splitting. Using entire dataset for training.")
            raw_train = dataset
            raw_eval = None

        # Auto-tune theo cỡ train SAU khi lọc, TRƯỚC khi gắn LoRA (r/dropout ảnh hưởng PEFT).
        config, auto_tune_changes = apply_size_aware_defaults(config, len(raw_train))
        for change in auto_tune_changes:
            line = f"[AutoTune] {change}"
            print(line)
            _append_log(job_id, line)
        if not auto_tune_changes and config.get("auto_tune", True):
            _append_log(job_id, f"[AutoTune] giữ nguyên hyperparam (n_train={len(raw_train)}).")

        lora_targets = config.get('lora_target_modules') or [
            "q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj",
        ]
        torchao_compat = patch_torchao_lora_constructor()
        if torchao_compat.get("patched"):
            compat_line = (
                "[Compat] PEFT TorchAO constructor patched: "
                "get_apply_tensor_subclass omitted by installed dispatcher; "
                "training can continue without adapter merge."
            )
            print(compat_line)
            _append_log(job_id, compat_line)
        model = FastLanguageModel.get_peft_model(
            model,
            r=config['r'],
            target_modules=lora_targets,
            lora_alpha=config['lora_alpha'],
            lora_dropout=config['lora_dropout'],
            bias="none",
            use_gradient_checkpointing="unsloth" if config.get('gradient_checkpointing', True) else False,
            random_state=config['random_state'],
            use_rslora=bool(config.get('use_rslora', False)),
        )

        if enable_thinking:
            think_cov = estimate_thinking_coverage(raw_train, col_map)
            think_line = (
                f"[Thinking] enable_thinking=True | "
                f"{think_cov['with_thinking']}/{think_cov['sampled']} mẫu có dấu hiệu reasoning "
                f"({think_cov['ratio'] * 100:.1f}%)"
            )
            print(think_line)
            _append_log(job_id, think_line)
            if think_cov.get("warn_low"):
                _append_log(
                    job_id,
                    "⚠️ [Thinking] Unsloth khuyến nghị ≥75% mẫu có reasoning nếu muốn giữ "
                    "khả năng think — tỉ lệ hiện tại thấp, model có thể mất dần thinking.",
                )
        else:
            _append_log(job_id, "[Thinking] enable_thinking=False — format không bật khối think.")

        dataset_train = raw_train.map(
            lambda x: formatting_prompts_func(
                x, tokenizer, col_map, sys_prompt, enable_thinking,
            ),
            batched=True,
        )
        if raw_eval is not None:
            dataset_eval = raw_eval.map(
                lambda x: formatting_prompts_func(
                    x, tokenizer, col_map, sys_prompt, enable_thinking,
                ),
                batched=True,
            )

        if len(dataset_train) > 0:
            rendered_train_sample = str(dataset_train[0].get('text') or "")
            print("Sample text:", rendered_train_sample[:200], "...")
            _append_log(
                job_id,
                f"[ChatTemplate] rendered_train_sample={_log_preview(rendered_train_sample, 1600)}",
            )
        else:
            print("[Dataset] Warning: dataset_train is empty after mapping.")

        if dataset_eval is not None and len(dataset_eval) > 0:
            rendered_eval_sample = str(dataset_eval[0].get('text') or "")
            _append_log(
                job_id,
                f"[ChatTemplate] rendered_eval_sample={_log_preview(rendered_eval_sample, 1600)}",
            )

        if "text" not in dataset_train.column_names:
            raise ValueError("Formatted training dataset is missing the required 'text' column.")
        dataset_train = dataset_train.select_columns(["text"])
        if dataset_eval is not None:
            if "text" not in dataset_eval.column_names:
                raise ValueError("Formatted validation dataset is missing the required 'text' column.")
            dataset_eval = dataset_eval.select_columns(["text"])
            if len(dataset_eval) == 0:
                print("[Dataset] Validation partition rỗng — tắt eval, early-stopping và load_best_model.")
                dataset_eval = None

        length_report = build_length_report(
            tokenizer,
            dataset_train["text"] if len(dataset_train) else [],
            config['modelMaxLength'],
        )
        length_line = format_length_report(length_report)
        print(length_line)
        _append_log(job_id, length_line)

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
            _append_log(job_id, f"Resuming from persistent worker checkpoint: {resume_from}")
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
                _append_log(job_id, f"Resuming from checkpoint: {resume_from}")
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

        # Train on assistant spans with robust fallback. Preflight chạy trên
        # nhiều mẫu: một mẫu duy nhất không đại diện cho cả dataset, và mẫu lệch
        # định dạng sẽ âm thầm được train trên toàn bộ hội thoại.
        collator = AssistantOnlyDataCollator(tokenizer, enable_thinking=enable_thinking)
        sample_count = min(PREFLIGHT_SAMPLES, len(dataset_train))
        preflight = preflight_assistant_mask(
            tokenizer,
            collator,
            dataset_train[:sample_count]["text"],
            config['modelMaxLength'],
        )

        if not preflight.get("ok"):
            reason = preflight.get("error") or "không khớp header assistant"
            message = (
                f"⚠️ [SFT Mask] Preflight thất bại trên {preflight.get('checked', 0)} mẫu ({reason}). "
                "Chuyển sang DataCollatorForLanguageModeling (train trên toàn bộ text)."
            )
            print(message)
            _append_log(job_id, message)
            collator = DataCollatorForLanguageModeling(tokenizer=getattr(tokenizer, "tokenizer", tokenizer), mlm=False)
        else:
            message = (
                f"[SFT Mask] {preflight['matched']}/{preflight['checked']} mẫu mask được assistant, "
                f"supervised {preflight['supervised_ratio'] * 100:.1f}% token."
            )
            print(message)
            _append_log(job_id, message)
            if preflight.get("unmatched"):
                warning = (
                    f"⚠️ [SFT Mask] {preflight['unmatched']}/{preflight['checked']} mẫu không khớp header — "
                    "những mẫu này sẽ học cả lượt của học sinh, nên kiểm tra lại định dạng dataset."
                )
                print(warning)
                _append_log(job_id, warning)
            collator.rows_masked = 0
            collator.rows_unmatched = 0
            collator.rows_slow_path = 0

        schedule = resolve_schedule(
            num_examples=len(dataset_train),
            batch_size=config['batchSize'],
            grad_accum=config['gradient_accumulation_steps'],
            epochs=config['epochs'],
            config=config,
        )
        summary = (
            f"[Config] {config['model_name']} | epochs={config['epochs']} "
            f"effective_batch={schedule['effective_batch']} steps/epoch={schedule['steps_per_epoch']} "
            f"total_steps={schedule['total_steps']} eval_steps={schedule['eval_steps']} "
            f"save_steps={schedule['save_steps']} | lr={config['learningRate']} "
            f"scheduler={config['lr_scheduler_type']} | LoRA r={config['r']} alpha={config['lora_alpha']} "
            f"dropout={config['lora_dropout']} rslora={bool(config.get('use_rslora'))} "
            f"targets={config.get('lora_target_preset', 'custom')} | "
            f"neftune={config.get('neftune_noise_alpha', 0)}"
        )
        print(summary)
        _append_log(job_id, summary)
        if job_id in jobs_db:
            jobs_db[job_id]['effective_config'] = {
                'model_name': config['model_name'],
                'epochs': config['epochs'],
                'batch_size': config['batchSize'],
                'gradient_accumulation_steps': config['gradient_accumulation_steps'],
                'effective_batch_size': schedule['effective_batch'],
                'block_size': config.get('blockSize', config['modelMaxLength']),
                'max_length': config['modelMaxLength'],
                'learning_rate': config['learningRate'],
                'lr_scheduler_type': config['lr_scheduler_type'],
                'optimizer': config['optim'],
                'seed': config['seed'],
                'warmup_steps': config['warmup_steps'],
                'warmup_ratio': config.get('warmup_ratio', 0),
                'weight_decay': config['weight_decay'],
                'max_grad_norm': config.get('max_grad_norm', 1.0),
                'logging_steps': config.get('logging_steps', 1),
                'dataloader_num_workers': config.get('dataloader_num_workers', 0),
                'gradient_checkpointing': config.get('gradient_checkpointing', True),
                'group_by_length': bool(config.get('group_by_length', False)),
                'eval_enabled': bool(dataset_eval),
                'dataset': {
                    'train_samples': len(dataset_train),
                    'eval_samples': len(dataset_eval) if dataset_eval is not None else 0,
                },
                'lora': {
                    'r': config['r'],
                    'alpha': config['lora_alpha'],
                    'dropout': config['lora_dropout'],
                    'rslora': bool(config.get('use_rslora')),
                    'targets': lora_targets,
                },
                'neftune_noise_alpha': config.get('neftune_noise_alpha', 0),
                'schedule': schedule,
                'mask_preflight': preflight,
                'system_prompt_version': config.get('system_prompt_version'),
                'chat_template': {
                    **chat_template_info,
                    'active_kind': template_kind,
                    'active_chars': len(active_chat_template),
                    'active_sha256': template_hash,
                },
                'enable_thinking': enable_thinking,
                'auto_tune': {
                    'enabled': bool(config.get('auto_tune', True)),
                    'changes': auto_tune_changes,
                    'n_train': len(dataset_train),
                },
                'data_report': {
                    'train_filter': train_filter_report,
                    'validation_filter': val_filter_report,
                    'length': length_report,
                    'mask_preflight': preflight,
                },
            }

        # 2.5. SFTTrainer Config (TỐI ƯU CHỐNG OVERFIT)
        has_eval = dataset_eval is not None
        sft_kwargs = {
            'max_length': config['modelMaxLength'],
            'dataset_text_field': "text",
            # Keep one conversation per sequence. Packing reduced this
            # 40-conversation dataset to only four optimizer steps/epoch
            # and blurred conversation boundaries.
            'packing': False,
            'per_device_train_batch_size': config['batchSize'],
            'gradient_accumulation_steps': config['gradient_accumulation_steps'],
            'num_train_epochs': config['epochs'],
            'learning_rate': config['learningRate'],
            # Tự động chọn kiểu dữ liệu tối ưu dựa trên phần cứng GPU
            'fp16': not is_bfloat16_supported(),
            'bf16': is_bfloat16_supported(),
            'logging_steps': config.get('logging_steps', 1),
            'max_grad_norm': config.get('max_grad_norm', 1.0),

            # --- CẤU HÌNH TÍNH TOÁN OVERFIT ---
            # Lịch eval/save suy theo số optimizer step thực tế: hằng số 10 cũ
            # chỉ cho một điểm validation ở run ngắn, và quá dày ở dataset lớn.
            'eval_strategy': "steps" if has_eval else "no",
            'eval_steps': schedule['eval_steps'] if has_eval else None,

            # --- CHIẾN LƯỢC CHỐNG "HỌC VẸT" ---
            'load_best_model_at_end': has_eval,
            'metric_for_best_model': "eval_loss" if has_eval else None,
            'greater_is_better': False,     # Loss càng thấp càng tốt

            'optim': config['optim'],
            'weight_decay': config['weight_decay'],
            'lr_scheduler_type': config['lr_scheduler_type'],
            'seed': config['seed'],
            'output_dir': local_job_dir,
            'save_strategy': "steps",
            'save_steps': schedule['save_steps'],
            # Cần chỗ cho cả checkpoint tốt nhất lẫn checkpoint cuối.
            'save_total_limit': config.get('save_total_limit', 2),
            'group_by_length': bool(config.get('group_by_length', False)),
            'dataloader_num_workers': config.get('dataloader_num_workers', 0),
            'dataloader_pin_memory': True,
            'report_to': "none",
            'push_to_hub': config.get('push_to_hub', False),
            'hub_model_id': hf_repo_id,
            'hub_token': hf_token,
            'hub_strategy': "checkpoint",
        }

        # warmup_ratio bám theo tổng số step nên ổn định hơn khi dataset đổi cỡ;
        # chỉ dùng warmup_steps khi người dùng không đặt ratio.
        if config.get('warmup_ratio', 0):
            sft_kwargs['warmup_ratio'] = config['warmup_ratio']
        else:
            sft_kwargs['warmup_steps'] = config['warmup_steps']

        if config.get('neftune_noise_alpha', 0):
            sft_kwargs['neftune_noise_alpha'] = config['neftune_noise_alpha']

        sft_kwargs, dropped_kwargs = filter_supported_kwargs(SFTConfig, sft_kwargs)
        if dropped_kwargs:
            _append_log(
                job_id,
                f"[Config] TRL đang cài không hỗ trợ: {', '.join(sorted(dropped_kwargs))} — bỏ qua.",
            )

        callbacks = [
            FlaskProgressCallback(job_id, tokenizer=tokenizer, eval_dataset=dataset_eval),
            EnhancedWatchdogCallback(job_id),
        ]
        if has_eval:
            callbacks.append(AutoTrainEarlyStoppingCallback(
                job_id=job_id,
                patience=config.get('early_stopping_patience', 3),
                min_delta=config.get('early_stopping_min_delta', 0.0),
                target_loss=config.get('early_stopping_loss'),
            ))

        class TrackingSFTTrainer(SFTTrainer):
            def training_step(self, model, inputs, *args, **kwargs):
                for callback in self.callback_handler.callbacks:
                    if hasattr(callback, "_capture_train_batch"):
                        callback._capture_train_batch(self.args, self.state, inputs)
                return super().training_step(model, inputs, *args, **kwargs)

            def prediction_step(self, model, inputs, prediction_loss_only, ignore_keys=None):
                loss, logits, labels = super().prediction_step(model, inputs, prediction_loss_only, ignore_keys=ignore_keys)
                try:
                    for callback in self.callback_handler.callbacks:
                        if hasattr(callback, "_publish_eval_detail"):
                            # _append_log(callback.job_id, f"[DEBUG] prediction_step CALLED for step {getattr(self.state, 'global_step', -1)}")
                            callback._publish_eval_detail(
                                self.args,
                                self.state,
                                inputs=inputs,
                                eval_dataloader=getattr(self, "eval_dataloader", None)
                            )
                except Exception as e:
                    for callback in self.callback_handler.callbacks:
                        if hasattr(callback, "job_id"):
                            _append_log(callback.job_id, f"?? [CRASH] _publish_eval_detail error: {e}")
                            import traceback
                            _append_log(callback.job_id, f"[CRASH] {traceback.format_exc()}")
                return loss, logits, labels

        trainer = TrackingSFTTrainer(
            model = model,
            processing_class = tokenizer,
            train_dataset = dataset_train,
            eval_dataset = dataset_eval,      # Phải có tập này để tính Overfit
            data_collator = collator,
            args = SFTConfig(**sft_kwargs),
            callbacks = callbacks,
        )

        # 2.6. Bắt đầu huấn luyện (Tự động Resume nếu có checkpoint)
        trainer.train(resume_from_checkpoint = resume_from)

        unmatched_rows = getattr(collator, 'rows_unmatched', 0)
        if unmatched_rows:
            _append_log(
                job_id,
                f"⚠️ [SFT Mask] {unmatched_rows} lượt hàng không mask được assistant trong lúc train "
                "— phần đó đã học cả lượt của học sinh.",
            )
        slow_rows = getattr(collator, 'rows_slow_path', 0)
        if slow_rows:
            _append_log(
                job_id,
                f"[SFT Mask] {slow_rows} lượt hàng phải dùng đường decode chậm (tokenizer chuẩn hoá khoảng trắng).",
            )

        # A user stop is a resumable terminal state, not a completed training.
        if jobs_db.get(job_id, {}).get('status') == 'STOPPED':
            _append_log(job_id, f"Checkpoint retained at {local_job_dir}; use Resume to continue.")
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
