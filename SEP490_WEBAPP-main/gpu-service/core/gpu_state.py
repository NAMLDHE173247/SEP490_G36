"""Shared GPU-service state & foundation — tach tu app.py (giu nguyen hanh vi).

Secrets, paths, checkpoint helpers, job/state registries, GPU utils, eval slots,
logging/config helpers. Cac module khac import tu day.
"""
import os
import gc
import json
import time
import datetime
import threading
import collections
import torch
import pynvml
from werkzeug.utils import secure_filename
from constants.config import (  # gom hang so
    UPLOAD_FOLDER, LOCAL_CHECKPOINT_BASE, EVAL_CHECKPOINT_BASE,
    MAX_CONCURRENT_JOBS, GPU_EVAL_SLOTS,
)


def _read_secret(name: str, default: str = "") -> str:
    """
    Đọc secret theo thứ tự ưu tiên:
      1. File /run/secrets/<name>  — Docker Swarm Secret
      2. Biến môi trường <name>    — docker-compose / local dev
      3. default
    """
    secret_path = f"/run/secrets/{name}"
    try:
        if os.path.isfile(secret_path):
            with open(secret_path, "r", encoding="utf-8") as f:
                value = f.read().strip()
            if value:
                return value
    except Exception:
        pass
    return os.environ.get(name, default)



os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(LOCAL_CHECKPOINT_BASE, exist_ok=True)
os.makedirs(EVAL_CHECKPOINT_BASE, exist_ok=True)

_eval_checkpoint_lock = threading.RLock()


def _eval_checkpoint_dir(eval_job_id: str) -> str:
    path = os.path.join(EVAL_CHECKPOINT_BASE, secure_filename(eval_job_id))
    os.makedirs(path, exist_ok=True)
    return path


def _eval_checkpoint_path(eval_job_id: str, name: str) -> str:
    return os.path.join(_eval_checkpoint_dir(eval_job_id), f"{secure_filename(name)}.json")


def _save_eval_checkpoint(eval_job_id: str, name: str, value) -> None:
    """Atomically persist resumable eval state on the checkpoint volume."""
    path = _eval_checkpoint_path(eval_job_id, name)
    temp_path = f"{path}.tmp"
    with _eval_checkpoint_lock:
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)


def _load_eval_checkpoint(eval_job_id: str, name: str, default=None):
    path = _eval_checkpoint_path(eval_job_id, name)
    try:
        with _eval_checkpoint_lock, open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def _update_eval_manifest(eval_job_id: str, **updates) -> dict:
    manifest = _load_eval_checkpoint(eval_job_id, "manifest", {}) or {}
    manifest.update(updates)
    manifest["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    _save_eval_checkpoint(eval_job_id, "manifest", manifest)
    return manifest

jobs_db = {}
eval_jobs_db = {}
job_queue = collections.deque()
active_training_jobs = set()
_active_train_threads = {}



pynvml.nvmlInit()
gpu_handle = pynvml.nvmlDeviceGetHandleByIndex(0)

# ======================================================================
# GIỚI HẠN VRAM (chạy chung GPU với service khác, vd LLMAware)
# GPU_MEMORY_FRACTION = tỉ lệ 0..1 trên TỔNG VRAM mỗi GPU. Ví dụ 0.2 = 20%.
#   GPU 100GB + fraction 0.2 → tiến trình chỉ được cấp phát tối đa ~20GB.
#   Vượt ngưỡng sẽ OOM (đúng ý đồ giới hạn). Để trống/0 = không giới hạn.
# Lưu ý: fraction tính trên TỔNG VRAM của card, không phải phần còn trống.
# ======================================================================
def _apply_gpu_memory_cap():
    try:
        fraction = float(os.environ.get("GPU_MEMORY_FRACTION", "0") or 0)
    except ValueError:
        print("[GPU] GPU_MEMORY_FRACTION không hợp lệ — bỏ qua giới hạn VRAM.")
        return
    if not (0 < fraction < 1):
        return
    if not torch.cuda.is_available():
        return
    for dev in range(torch.cuda.device_count()):
        try:
            torch.cuda.set_per_process_memory_fraction(fraction, dev)
            total_gb = torch.cuda.get_device_properties(dev).total_memory / (1024 ** 3)
            print(f"[GPU] cuda:{dev} VRAM cap = {fraction * 100:.0f}% (~{total_gb * fraction:.1f}GB / {total_gb:.1f}GB)")
        except Exception as exc:
            print(f"[GPU] set_per_process_memory_fraction lỗi trên cuda:{dev}: {exc}")

_apply_gpu_memory_cap()

# Biến toàn cục cho inference cache và watchdog
_current_infer_model = None
_current_infer_tokenizer = None
_current_infer_model_id = None
last_heartbeat = time.time()

# ── Multi-slot model registry (instanceId → slot) ──────────────────
# Mỗi slot giữ 1 bộ (model, tokenizer, model_id) độc lập.
# instanceId=1 → slot 1  |  instanceId=2 → slot 2
_model_slots: dict = {}          # {slot_id: {"model", "tokenizer", "model_id"}}
_slot_locks: dict = {            # lock riêng per-slot — tránh race condition
    1: threading.Lock(),
    2: threading.Lock(),
}

from transformers import StoppingCriteria, StoppingCriteriaList
_slot_abort_events = {1: threading.Event(), 2: threading.Event()}

class AbortStoppingCriteria(StoppingCriteria):
    def __init__(self, event: threading.Event):
        self.event = event
    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.event.is_set()

last_heartbeat = time.time()
inference_logs_db = {}
_judge_context = threading.local()

# Giải phóng bộ nhớ GPU cho 1 slot cụ thể
def _release_slot(slot_id: int):
    slot = _model_slots.pop(slot_id, None)
    if slot is None:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            try:
                torch.cuda.ipc_collect()
            except Exception:
                pass
        return False
    del slot["model"]
    del slot["tokenizer"]
    del slot
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass
    print(f"\n--- Slot {slot_id}: GPU memory released ---\n")
    return True

# Giải phóng toàn bộ slots (backward-compat helper)
def _release_gpu_memory():
    for sid in list(_model_slots.keys()):
        _release_slot(sid)

def get_gpu_stats():
    """Lấy thông số sử dụng GPU và VRAM hiện tại."""
    try:
        info = pynvml.nvmlDeviceGetMemoryInfo(gpu_handle)
        vram_used_mb = info.used // (1024 * 1024)
        vram_total_mb = info.total // (1024 * 1024)
        util = pynvml.nvmlDeviceGetUtilizationRates(gpu_handle)
        gpu_util = util.gpu
        return vram_used_mb, vram_total_mb, gpu_util
    except:
        return 0, 0, 0

# ======================================================================


# ======================================================================
# SLOT MANAGEMENT — giới hạn eval jobs concurrent trên GPU
# ======================================================================

# T4 16GB: mỗi model 7B-4bit ~5GB → tối đa 3 slot
# Khi lên H100 chỉ cần đổi con số này
_eval_semaphore = threading.Semaphore(GPU_EVAL_SLOTS)
_active_eval_count = 0
_active_eval_lock  = threading.Lock()

def _eval_slot_acquire() -> bool:
    """Thử lấy slot. Trả về True nếu thành công, False nếu tất cả slot đang bận."""
    acquired = _eval_semaphore.acquire(blocking=False)
    if acquired:
        global _active_eval_count
        with _active_eval_lock:
            _active_eval_count += 1
    return acquired

def _eval_slot_release():
    """Giải phóng slot sau khi eval xong (dù thành công hay lỗi)."""
    global _active_eval_count
    with _active_eval_lock:
        _active_eval_count = max(0, _active_eval_count - 1)
    _eval_semaphore.release()

print('✅ Slot management ready')


def _eval_log(job_id: str, msg: str):
    """Ghi log vào jobs_db[job_id]['logs'] và in ra console."""
    print(msg)
    if job_id in jobs_db:
        jobs_db[job_id].setdefault('logs', []).append(msg)

def _get_backend_url():
    url = _read_secret("BACKEND_URL")
    if url: return url.rstrip("/")
    return "http://localhost:3000"

BACKEND_URL = _get_backend_url()
print(f"[Config] BACKEND_URL = {BACKEND_URL}")

def _get_api_key():
    return getattr(_judge_context, "api_key", "") or _read_secret("OPENROUTER_API_KEY") or _read_secret("OPENAI_API_KEY") or _read_secret("DEEPSEEK_API_KEY")
