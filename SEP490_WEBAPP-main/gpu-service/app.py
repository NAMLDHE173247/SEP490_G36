import os
import json
import time
import uuid
import hmac
import shutil
import pynvml
import datetime
import threading
import traceback
from unsloth import FastLanguageModel

# Compatibility patch for peft / torchao LinearActivationQuantizedTensor mismatch
try:
    import torchao.quantization
    if not hasattr(torchao.quantization, "LinearActivationQuantizedTensor"):
        setattr(
            torchao.quantization,
            "LinearActivationQuantizedTensor",
            getattr(torchao.quantization, "AffineQuantizedTensor", object)
        )
except Exception:
    pass
from threading import Thread
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, Response
from services.clustering_service import ClusteringService  # extracted module
from utils.inference_utils import (  # extracted module
    DEFAULT_SYSTEM_PROMPT,
    normalize_history,
    format_inference_prompt,
    stream_without_thinking,
)

from transformers import TextIteratorStreamer

# ======================================================================
# 0. DOCKER SECRETS HELPER
# Ưu tiên đọc từ /run/secrets/<name> (Docker Swarm Secrets)
# Fallback sang os.environ nếu không có (local dev / docker compose)
# ======================================================================


# 0. CÀI ĐẶT MÔI TRƯỜNG
os.environ["TORCHDYNAMO_DISABLE"] = "1"
# Global synchronous CUDA materially distorts the latency being measured.
# Timed sections synchronize explicitly instead.
os.environ.setdefault('CUDA_LAUNCH_BLOCKING', '0')

from core import gpu_state  # shared foundation (module handle for reassigned scalars)
from core.gpu_state import (  # extracted foundation
    _read_secret,
    UPLOAD_FOLDER, LOCAL_CHECKPOINT_BASE, EVAL_CHECKPOINT_BASE,
    _eval_checkpoint_dir, _load_eval_checkpoint, _update_eval_manifest,
    jobs_db, eval_jobs_db, job_queue, active_training_jobs, MAX_CONCURRENT_JOBS,
    gpu_handle,
    _model_slots, _slot_locks, _slot_abort_events, AbortStoppingCriteria,
    StoppingCriteriaList, inference_logs_db,
    _release_slot, get_gpu_stats,
    GPU_EVAL_SLOTS, _active_eval_lock,
    _eval_slot_acquire, _eval_slot_release,
)

app = Flask(__name__)

# ======================================================================
# SHARED-SECRET AUTH
# The GPU service exposes training/eval/inference endpoints that consume real
# money (GPU time, judge API keys). When GPU_SERVICE_TOKEN is configured, every
# request must present a matching X-GPU-Token header. Health checks and CORS
# preflight are exempt so probes keep working. When the token is unset the guard
# is a no-op (local dev), but it MUST be set in any exposed deployment.
# ======================================================================
GPU_SERVICE_TOKEN = _read_secret("GPU_SERVICE_TOKEN")
_AUTH_EXEMPT_PATHS = {"/health", "/api/health"}


@app.before_request
def _require_gpu_token():
    if not GPU_SERVICE_TOKEN:
        return None
    if request.method == "OPTIONS" or request.path in _AUTH_EXEMPT_PATHS:
        return None
    provided = request.headers.get("X-GPU-Token", "")
    if not hmac.compare_digest(provided, GPU_SERVICE_TOKEN):
        return jsonify({"error": "Unauthorized: invalid or missing GPU service token."}), 401
    return None


job_manager_last_heartbeat = 0.0
_job_manager_started = False
_job_manager_lock = threading.Lock()

# ======================================================================



# ======================================================================
# 1. CUSTOM CALLBACKS (CONSOLIDATED)
# ======================================================================
from pipelines.training import background_train_task  # extracted module



from pipelines.eval_core import background_eval_task  # extracted module
from pipelines.train_config import build_train_config  # validate/normalize config
from constants.config import DEFAULT_JUDGE_MODEL

_service = ClusteringService()  # clustering singleton dung boi cac route dataprep

# ======================================================================
# 2. LÕI HUẤN LUYỆN (CORE TRAINING)
# ======================================================================
_STALE_JOB_TIMEOUT = 7200  # 2 hours — if a job stays "active" but has terminal status, auto-cleanup
_TERMINAL_STATUSES = {'ERROR', 'COMPLETED', 'STOPPED', 'FAILED'}
_job_start_times = {}  # job_id -> timestamp when added to active_training_jobs

def job_manager_thread():
    global job_manager_last_heartbeat
    _log_cycle = 0
    while True:
        try:
            job_manager_last_heartbeat = time.time()
            _log_cycle += 1

            # ── Zombie cleanup: remove stale jobs from active_training_jobs ──
            stale_ids = []
            for active_id in list(active_training_jobs):
                job_info = jobs_db.get(active_id, {})
                status = job_info.get('status', '')
                started = _job_start_times.get(active_id, 0)
                age = time.time() - started if started else 0
                # If status is terminal but job still in active set → zombie
                if status in _TERMINAL_STATUSES:
                    stale_ids.append(active_id)
                # If job has been active > 2h with no progress → likely stuck
                elif age > _STALE_JOB_TIMEOUT and status not in ('TRAINING', 'LOADING_MODEL'):
                    stale_ids.append(active_id)
            for sid in stale_ids:
                active_training_jobs.discard(sid)
                _job_start_times.pop(sid, None)
                print(f"[JobManager] 🧹 Cleaned up stale/zombie job {sid} (status={jobs_db.get(sid, {}).get('status','?')})")

            # ── Periodic diagnostic log (every ~30s = 10 cycles × 3s sleep) ──
            if _log_cycle % 10 == 0:
                print(
                    f"[JobManager] ♻️ heartbeat | queue={len(job_queue)} "
                    f"active={len(active_training_jobs)}/{MAX_CONCURRENT_JOBS} "
                    f"active_ids={list(active_training_jobs)} "
                    f"queued_ids={[item[0] for item in list(job_queue)[:5]]}"
                )

            # ── Dispatch next job ──
            if job_queue and len(active_training_jobs) < MAX_CONCURRENT_JOBS:
                job_id, config, file_path, validation_file_path, hf_token = job_queue.popleft()
                if job_id in active_training_jobs:
                    print(f"[JobManager] ⚠️ Job {job_id} already active, skipping duplicate.")
                elif jobs_db.get(job_id, {}).get('status') == 'STOPPED':
                    print(f"[JobManager] ⏹️ Job {job_id} was stopped while in queue. Skipping.")
                else:
                    active_training_jobs.add(job_id)
                    _job_start_times[job_id] = time.time()
                    jobs_db[job_id] = {'status': 'PENDING', 'progress': 0, 'logs': []}
                    print(f"[JobManager] 🚀 Dispatching Train Job {job_id}.")
                    thread = threading.Thread(target=background_train_task, args=(job_id, config, file_path, validation_file_path, hf_token))
                    thread.start()

        except Exception as exc:
            # CRITICAL: job_manager_thread must NEVER die — otherwise all queued jobs freeze forever
            print(f"[JobManager] ❌ Exception in manager loop (will retry): {exc}")
            import traceback
            traceback.print_exc()

        time.sleep(3)


def _print_startup_banner():
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    print("=" * 60)
    print("🚀 GPU Service đang khởi động...")
    print(f"   Host : {host}")
    print(f"   Port : {port}")
    print(f"   BACKEND_URL      : {_read_secret('BACKEND_URL') or '(chưa set)'}")
    print(
        f"   OPENROUTER_API_KEY: {'✅ đã set' if _read_secret('OPENROUTER_API_KEY') else 'ℹ️ nhận theo từng eval job'}"
    )
    print("=" * 60)


def start_background_services():
    """Khởi job manager một lần — gọi từ gunicorn post_worker_init hoặc __main__."""
    global _job_manager_started
    with _job_manager_lock:
        if _job_manager_started:
            return
        _job_manager_started = True
        _print_startup_banner()
        manager_thread = threading.Thread(target=job_manager_thread, daemon=True)
        manager_thread.start()
        print("✅ Job Manager đã sẵn sàng.")







@app.route('/api/train/start', methods=['POST'])
def start_training():
    config_str = request.form.get('config')
    if not config_str: return jsonify({"error": "Missing 'config' in form data"}), 400

    try: parsed_config = json.loads(config_str)
    except json.JSONDecodeError: return jsonify({"error": "Invalid config JSON format"}), 400

    job_id = parsed_config.get('job_id')
    if not job_id: return jsonify({"error": "Missing 'job_id' in config"}), 400

    # Ép kiểu, kẹp biên và suy các mặc định chất lượng ở một chỗ duy nhất.
    # Resume metadata và system_prompt cũng đi qua đây: bản cũ đánh rơi
    # system_prompt nên dữ liệu train mang prompt mặc định trong khi eval và
    # inference lại dùng prompt do người dùng cấu hình.
    config, config_warnings = build_train_config(parsed_config)
    for warning in config_warnings:
        print(f"[Train Config] {warning}")

    # Ưu tiên token từ request, fallback sang Docker Secret / env HF_TOKEN
    hf_token = parsed_config.get('hf_token') or _read_secret("HF_TOKEN")
    if hf_token:
        hf_token = str(hf_token).strip().strip("'\"").encode('ascii', 'ignore').decode('ascii').strip()

    # print("HF token:", hf_token)

    file_path = None
    if 'file' in request.files:
        file = request.files['file']
        if file.filename != '':
            file_path = os.path.join(UPLOAD_FOLDER, f"{job_id}_{secure_filename(file.filename)}")
            file.save(file_path)

    validation_file_path = None
    if 'validation_file' in request.files:
        validation_file = request.files['validation_file']
        if validation_file.filename != '':
            validation_file_path = os.path.join(
                UPLOAD_FOLDER,
                f"{job_id}_validation_{secure_filename(validation_file.filename)}",
            )
            validation_file.save(validation_file_path)

    if not file_path and not config.get('dataset_hf_id'):
        return jsonify({"error": "Either a dataset file must be uploaded or 'dataset_hf_id' must be provided in the config."}), 400

    # THÊM JOB VÀO HÀNG ĐỢI THAY VÌ CHẠY NGAY LẬP TỨC
    job_queue.append((job_id, config, file_path, validation_file_path, hf_token))
    jobs_db[job_id] = {
        'status': 'QUEUED',
        'progress': 0,
        'logs': [f"Job {job_id} is in queue."] + [f"[Config] {w}" for w in config_warnings],
    }

    return jsonify({
        "message": "Job queued successfully",
        "job_id": job_id,
        "warnings": config_warnings,
    }), 202


@app.route('/api/train/status/<job_id>')
def get_status(job_id):
    global last_heartbeat
    last_heartbeat = time.time()
    
    job_info = jobs_db.get(job_id)
    if job_info:
        res_info = dict(job_info)
        # Inject live GPU resources if active but HF trainer hasn't output metrics yet
        if res_info.get('status') in ['TRAINING', 'PENDING', 'LOADING_MODEL']:
            vram_used, _, gpu_util = get_gpu_stats()
            metrics = res_info.get('metrics', {})
            if not isinstance(metrics, dict):
                metrics = {}
            else:
                metrics = dict(metrics)
            
            metrics.setdefault('vram', vram_used)
            metrics.setdefault('gpu_util', gpu_util)
            res_info['metrics'] = metrics
        return jsonify(res_info), 200
        
    return jsonify({"status": "NOT_FOUND"}), 200

@app.route('/api/train/checkpoint/<job_id>')
def get_local_checkpoint(job_id):
    """Report the newest checkpoint retained on the persistent worker volume."""
    job_dir = os.path.join(LOCAL_CHECKPOINT_BASE, secure_filename(job_id))
    checkpoints = []
    if os.path.isdir(job_dir):
        for name in os.listdir(job_dir):
            path = os.path.join(job_dir, name)
            if os.path.isdir(path) and name.startswith('checkpoint-'):
                try:
                    step = int(name.rsplit('-', 1)[-1])
                except ValueError:
                    step = -1
                if os.path.isfile(os.path.join(path, 'trainer_state.json')):
                    checkpoints.append((step, path))
    checkpoints.sort(key=lambda item: item[0], reverse=True)
    if not checkpoints:
        return jsonify({"available": False, "job_id": job_id}), 200
    return jsonify({
        "available": True,
        "job_id": job_id,
        "step": checkpoints[0][0],
        "checkpoint": os.path.basename(checkpoints[0][1]),
    }), 200

@app.route('/api/train/queue-status')
def get_train_queue_status():
    """Diagnostic endpoint for queue visibility — shows why jobs may be stuck."""
    queued_jobs = []
    for item in list(job_queue):
        try:
            queued_jobs.append(item[0])
        except Exception:
            pass

    active_details = []
    for aid in list(active_training_jobs):
        info = jobs_db.get(aid, {})
        started = _job_start_times.get(aid)
        active_details.append({
            "job_id": aid,
            "status": info.get('status', 'UNKNOWN'),
            "progress": info.get('progress', 0),
            "age_sec": round(time.time() - started, 1) if started else None,
        })

    heartbeat_age = round(time.time() - job_manager_last_heartbeat, 2) if job_manager_last_heartbeat else None

    return jsonify({
        "queued_count": len(job_queue),
        "queued_jobs": queued_jobs,
        "active_count": len(active_training_jobs),
        "active_jobs": list(active_training_jobs),
        "active_details": active_details,
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
        "manager_heartbeat_age_sec": heartbeat_age,
        "manager_alive": heartbeat_age is not None and heartbeat_age < 10,
        "blocked_reason": (
            "manager_thread_dead" if heartbeat_age is not None and heartbeat_age > 10
            else "max_concurrent_reached" if len(active_training_jobs) >= MAX_CONCURRENT_JOBS
            else None
        ),
    }), 200
    
@app.route('/api/system/resources')
def get_system_resources():
    """Trả về thông số VRAM và GPU Utilization hiện tại cho giao diện AutoTrain."""
    vram_used, vram_total, gpu_util = get_gpu_stats()
    return jsonify({
        "vram_used_mb": vram_used,
        "vram_total_mb": vram_total,
        "gpu_util": gpu_util
    }), 200


@app.route('/api/train/stop/<job_id>', methods=['POST'])
def stop_training(job_id):
    if job_id in jobs_db or any(item[0] == job_id for item in job_queue):
        if job_id not in jobs_db:
            jobs_db[job_id] = {'status': 'STOPPED', 'progress': 0, 'logs': []}
        else:
            jobs_db[job_id]['status'] = 'STOPPED'
        jobs_db[job_id]['logs'].append("🛑 Stop request received. Training halted or cancelled from queue.")
        # Clear from queue if present in-place
        retained = [item for item in job_queue if item[0] != job_id]
        job_queue.clear()
        job_queue.extend(retained)
        return jsonify({"message": "Stop signal sent"}), 200
    return jsonify({"error": "Job not found"}), 404


@app.route('/api/eval/start', methods=['POST'])
def start_eval():
    """
    POST /api/eval/start  (multipart/form-data)
    Form fields:
      - config (JSON string):
          {
            eval_job_id:     string   — ID do Node backend tạo
            job_id:          string   — TrainingHistory jobId (để link kết quả)
            hf_repo_id:      string   — HuggingFace repo chứa fine-tuned model
            hf_token:        string   — HF token (nếu repo private)
            model_max_length: number  — max_seq_length khi load model
            judge_model:     string   — Claude model dùng làm judge (optional)
          }
      - eval_file: file    — dataset đánh giá (.json / .jsonl)

    Response 201:
      { "message": "Eval job started", "eval_job_id": "..." }
    """
    config_str = request.form.get('config')
    if not config_str:
        return jsonify({"error": "Missing 'config' in form data"}), 400

    try:
        cfg = json.loads(config_str)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid config JSON"}), 400

    eval_job_id   = cfg.get('eval_job_id')
    job_id        = cfg.get('job_id')
    hf_repo_id    = cfg.get('hf_repo_id')
    hf_token      = cfg.get('hf_token', '')
    model_max_len = int(cfg.get('model_max_length', 2048))
    judge_model   = cfg.get('judge_model', DEFAULT_JUDGE_MODEL)
    judge_api_key = cfg.get('judge_api_key', '')
    base_hf_repo  = cfg.get('base_model_hf_repo', '')
    system_prompt = str(cfg.get('system_prompt', '') or '')
    protocol_mode = str(cfg.get('protocol_mode', 'locked_single_turn') or 'locked_single_turn')
    reference_run_kind = str(cfg.get('reference_run_kind', '') or '')
    prompt_variant = str(cfg.get('prompt_variant', 'P1') or 'P1').upper()
    system_prompt_version = str(cfg.get('system_prompt_version', '') or '')
    subject_override = str(cfg.get('subject_override', '') or '')
    max_new_tokens = int(cfg.get('max_new_tokens', 512))
    warmup_runs = int(cfg.get('warmup_runs', 1))
    bootstrap_resamples = int(cfg.get('bootstrap_resamples', 10000))
    bootstrap_seed = int(cfg.get('bootstrap_seed', 42))
    temperature = float(cfg.get('temperature', 0.2))
    top_p = float(cfg.get('top_p', 0.9))
    repetition_penalty = float(cfg.get('repetition_penalty', 1.15))

    print(f"[Debug] base_hf_repo = '{base_hf_repo}' | paired = {bool(base_hf_repo)}")
    print(f"[Eval Config] system_prompt_chars={len(system_prompt.strip())} max_new_tokens={max_new_tokens} temperature={temperature} top_p={top_p} repetition_penalty={repetition_penalty}")

    if not eval_job_id:
        return jsonify({"error": "Missing 'eval_job_id' in config"}), 400
    if not job_id:
        return jsonify({"error": "Missing 'job_id' in config"}), 400
    if not hf_repo_id:
        return jsonify({"error": "Missing 'hf_repo_id' — model phải đã được push lên HF Hub"}), 400

    # ── GUARD: chặn eval nếu đang có train job active (tránh OOM trên single GPU) ──
    if (
        protocol_mode == 'locked_single_turn'
        and not base_hf_repo
        and reference_run_kind != 'version1_shared_ft'
    ):
        return jsonify({"error": "Locked RP5 evaluation requires base_model_hf_repo"}), 400
    if protocol_mode == 'locked_single_turn' and prompt_variant not in ('P0', 'P1'):
        return jsonify({"error": "prompt_variant must be P0 or P1"}), 400
    if max_new_tokens < 1 or max_new_tokens > 2048:
        return jsonify({"error": "max_new_tokens must be between 1 and 2048"}), 400
    if bootstrap_resamples < 1000:
        return jsonify({"error": "bootstrap_resamples must be at least 1000"}), 400

    active_train = any(
        v.get('status') == 'TRAINING'
        for k, v in jobs_db.items()
        if not k.startswith('__eval_tmp_')
    )
    if active_train:
        return jsonify({
            "error": "train_active",
            "message": "Đang có train job đang chạy. Eval sẽ gây OOM trên single GPU. Vui lòng chờ train hoàn tất."
        }), 409

    # Lưu eval file
    if 'eval_file' not in request.files or request.files['eval_file'].filename == '':
        return jsonify({"error": "Missing 'eval_file'"}), 400

    efile = request.files['eval_file']
    eval_file_path = os.path.join(
        UPLOAD_FOLDER,
        f"{eval_job_id}_{secure_filename(efile.filename)}"
    )
    efile.save(eval_file_path)

    # Keep an immutable input copy and non-secret config on the persistent
    # checkpoint volume. A restarted GPU process can resume with fresh secrets.
    checkpoint_dir = _eval_checkpoint_dir(eval_job_id)
    input_ext = os.path.splitext(secure_filename(efile.filename))[1] or '.json'
    persistent_eval_file = os.path.join(checkpoint_dir, f"input{input_ext}")
    shutil.copy2(eval_file_path, persistent_eval_file)
    os.remove(eval_file_path)
    safe_config = {
        key: value for key, value in cfg.items()
        if key not in {'hf_token', 'judge_api_key'}
    }
    _update_eval_manifest(
        eval_job_id,
        status='PENDING',
        config=safe_config,
        eval_file_path=persistent_eval_file,
        resume_count=0,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )

    # --- check slot trước khi nhận job ---
    if not _eval_slot_acquire():
        return jsonify({
            "error": "worker_busy",
            "message": f"Worker đang chạy {gpu_state._active_eval_count}/{GPU_EVAL_SLOTS} eval job. Vui lòng thử lại sau.",
            "active_slots": gpu_state._active_eval_count,
            "max_slots": GPU_EVAL_SLOTS,
        }), 409

    # Từ chối nếu eval_job_id đã đang chạy
    if eval_job_id in eval_jobs_db and eval_jobs_db[eval_job_id].get('status') in ('RUNNING', 'EVALUATING'):
        _eval_slot_release()
        return jsonify({"error": f"Eval job {eval_job_id} đang chạy"}), 409

    eval_jobs_db[eval_job_id] = {
        'status':   'PENDING',
        'progress': 0,
        'logs':     [],
        'job_id':   job_id,
    }

    threading.Thread(
        target=background_eval_task,
        kwargs={
            "eval_job_id": eval_job_id,
            "job_id": job_id,
            "hf_repo_id": hf_repo_id,
            "hf_token": hf_token,
            "eval_file_path": persistent_eval_file,
            "model_max_length": model_max_len,
            "judge_model": judge_model,
            "judge_api_key": judge_api_key,
            "base_hf_repo": base_hf_repo,
            "system_prompt": system_prompt,
            "protocol_mode": protocol_mode,
            "prompt_variant": prompt_variant,
            "system_prompt_version": system_prompt_version,
            "subject_override": subject_override,
            "max_new_tokens": max_new_tokens,
            "warmup_runs": warmup_runs,
            "bootstrap_resamples": bootstrap_resamples,
            "bootstrap_seed": bootstrap_seed,
            "temperature": temperature,
            "top_p": top_p,
            "repetition_penalty": repetition_penalty,
        },
        daemon=True,
    ).start()

    return jsonify({
        "message": "Eval job started",
        "eval_job_id": eval_job_id,
        "checkpoint_created": True,
        "eval_checkpoint_protocol": 1,
    }), 201


@app.route('/api/eval/resume/<eval_job_id>', methods=['POST'])
def resume_eval(eval_job_id):
    """Resume an interrupted eval from durable replay/Judge checkpoints."""
    current = eval_jobs_db.get(eval_job_id)
    if current and current.get('status') in ('PENDING', 'RUNNING', 'EVALUATING'):
        return jsonify({"error": "eval_already_running", "eval_job_id": eval_job_id}), 409

    manifest = _load_eval_checkpoint(eval_job_id, 'manifest', None)
    if not manifest:
        return jsonify({"error": "checkpoint_not_found", "eval_job_id": eval_job_id}), 404
    if manifest.get('status') == 'COMPLETED':
        return jsonify({"error": "eval_already_completed", "eval_job_id": eval_job_id}), 409

    cfg = dict(manifest.get('config') or {})
    eval_file_path = str(manifest.get('eval_file_path') or '')
    if not eval_file_path or not os.path.isfile(eval_file_path):
        return jsonify({"error": "checkpoint_input_missing", "eval_job_id": eval_job_id}), 409

    secrets = request.get_json(silent=True) or {}
    hf_token = str(secrets.get('hf_token') or _read_secret('HF_TOKEN') or '')
    judge_api_key = str(secrets.get('judge_api_key') or _read_secret('OPENROUTER_API_KEY') or '')
    if not judge_api_key:
        return jsonify({"error": "missing_judge_api_key"}), 400
    if not _eval_slot_acquire():
        return jsonify({"error": "worker_busy", "message": "GPU không còn Eval slot trống."}), 409

    job_id = str(cfg.get('job_id') or '')
    hf_repo_id = str(cfg.get('hf_repo_id') or '')
    if not job_id or not hf_repo_id:
        _eval_slot_release()
        return jsonify({"error": "checkpoint_config_invalid"}), 409

    eval_jobs_db[eval_job_id] = {
        'status': 'PENDING',
        'progress': int(manifest.get('progress') or 0),
        'logs': ['[RESUME] Khôi phục Eval từ checkpoint bền vững.'],
        'job_id': job_id,
    }
    _update_eval_manifest(
        eval_job_id,
        status='PENDING',
        error=None,
        resume_count=int(manifest.get('resume_count') or 0) + 1,
    )

    threading.Thread(
        target=background_eval_task,
        kwargs={
            'eval_job_id': eval_job_id,
            'job_id': job_id,
            'hf_repo_id': hf_repo_id,
            'hf_token': hf_token,
            'eval_file_path': eval_file_path,
            'model_max_length': int(cfg.get('model_max_length', 2048)),
            'judge_model': str(cfg.get('judge_model') or DEFAULT_JUDGE_MODEL),
            'judge_api_key': judge_api_key,
            'base_hf_repo': str(cfg.get('base_model_hf_repo') or ''),
            'system_prompt': str(cfg.get('system_prompt') or ''),
            'protocol_mode': str(cfg.get('protocol_mode') or 'locked_single_turn'),
            'prompt_variant': str(cfg.get('prompt_variant') or 'P1'),
            'system_prompt_version': str(cfg.get('system_prompt_version') or ''),
            'subject_override': str(cfg.get('subject_override') or ''),
            'max_new_tokens': int(cfg.get('max_new_tokens', 512)),
            'warmup_runs': int(cfg.get('warmup_runs', 1)),
            'bootstrap_resamples': int(cfg.get('bootstrap_resamples', 10000)),
            'bootstrap_seed': int(cfg.get('bootstrap_seed', 42)),
            'temperature': float(cfg.get('temperature', 0)),
            'top_p': float(cfg.get('top_p', 1)),
            'repetition_penalty': float(cfg.get('repetition_penalty', 1)),
        },
        daemon=True,
    ).start()

    return jsonify({
        "message": "Eval resumed from checkpoint",
        "eval_job_id": eval_job_id,
        "resume_count": int(manifest.get('resume_count') or 0) + 1,
    }), 202



@app.route('/api/eval/status/<eval_job_id>', methods=['GET'])
def get_eval_status(eval_job_id):
    entry = eval_jobs_db.get(eval_job_id)
    if not entry:
        manifest = _load_eval_checkpoint(eval_job_id, 'manifest', None)
        if manifest:
            status = manifest.get('status', 'INTERRUPTED')
            if status in {'RUNNING', 'EVALUATING', 'PENDING'}:
                status = 'INTERRUPTED'
            return jsonify({
                "status": status,
                "progress": manifest.get('progress', 0),
                "stage": manifest.get('stage', ''),
                "stage_label": "Có checkpoint — có thể Resume",
                "stage_detail": manifest.get('error') or 'GPU process đã restart; checkpoint vẫn còn trên volume.',
                "error": manifest.get('error'),
                "resumable": status != 'COMPLETED',
            }), 200
        return jsonify({"status": "NOT_FOUND"}), 404

    return jsonify({
        "status":        entry.get('status', 'UNKNOWN'),
        "resumable":     entry.get('status') == 'INTERRUPTED',
        "progress":      entry.get('progress', 0),
        "stage":         entry.get("stage", ""),
        "stage_label":   entry.get("stage_label", ""),
        "stage_detail":  entry.get("stage_detail", ""),
        "stage_current": entry.get("stage_current", 0),
        "stage_total":   entry.get("stage_total", 0),
        "logs":          entry.get('logs', []),
        **({"current_sample": entry["current_sample"]} if "current_sample" in entry else {}),
        **({"error": entry["error"]} if "error" in entry else {}),
    }), 200


@app.route('/api/eval/active', methods=['GET'])
def get_active_eval_jobs():
    """Expose worker-owned active IDs so the backend can reconcile Mongo state."""
    active_statuses = {'PENDING', 'RUNNING', 'EVALUATING'}
    jobs = [
        {
            'eval_job_id': eval_job_id,
            'status': entry.get('status', 'UNKNOWN'),
            'job_id': entry.get('job_id'),
        }
        for eval_job_id, entry in eval_jobs_db.items()
        if entry.get('status') in active_statuses
    ]
    return jsonify({'jobs': jobs, 'count': len(jobs)}), 200


@app.route('/api/eval/checkpoint/<eval_job_id>', methods=['DELETE'])
def delete_eval_checkpoint(eval_job_id):
    current = eval_jobs_db.get(eval_job_id)
    if current and current.get('status') in {'PENDING', 'RUNNING', 'EVALUATING'}:
        return jsonify({'error': 'eval_still_running'}), 409
    checkpoint_dir = os.path.join(EVAL_CHECKPOINT_BASE, secure_filename(eval_job_id))
    if os.path.isdir(checkpoint_dir):
        shutil.rmtree(checkpoint_dir)
    return jsonify({'deleted': True, 'eval_job_id': eval_job_id}), 200



@app.route('/api/eval/result/<eval_job_id>', methods=['GET'])
def get_eval_result_v2(eval_job_id):
    """
    GET /api/eval/result/:eval_job_id
    Trả về kết quả eval sau khi COMPLETED.
    Node backend gọi endpoint này 1 lần sau khi status = COMPLETED
    để POST lên /api/eval/save và lưu vào MongoDB.
    Response 202: eval chưa xong
    Response 200: { evalId, jobId, status, totalSamples, results, summary, ... }
    Response 404: eval_job_id không tồn tại
    """
    entry = eval_jobs_db.get(eval_job_id)
    if not entry:
        persisted_result = _load_eval_checkpoint(eval_job_id, 'final_result', None)
        if persisted_result:
            return jsonify(persisted_result), 200
    if not entry:
        return jsonify({"error": "Eval job không tồn tại"}), 404

    status = entry.get('status')
    if status in ('PENDING', 'RUNNING', 'EVALUATING'):
        return jsonify({"status": status}), 202

    if status in ('FAILED', 'INTERRUPTED'):
        return jsonify({
            "status": status,
            "error": entry.get('error', ''),
            "resumable": status == 'INTERRUPTED',
        }), 200

    result = entry.get('result')
    if not result:
        return jsonify({"status": "PENDING"}), 202

    return jsonify(result), 200


@app.route('/api/model/load', methods=['POST'])
def load_model():
    data = request.json
    hf_model_id = data.get('hf_model_id')
    instance_id = data.get('instance_id') or data.get('instanceId') or 1
    slot_id = int(instance_id)
    force_reload = data.get('force_reload', False)
    pin_model = bool(data.get('pinned', False))

    if not hf_model_id:
        return jsonify({"error": "Missing hf_model_id"}), 400
    if slot_id not in _slot_locks:
        return jsonify({"error": f"instanceId phải là 1 hoặc 2, nhận: {slot_id}"}), 400

    lock = _slot_locks[slot_id]
    if not lock.acquire(blocking=False):
        return jsonify({"error": f"Slot {slot_id} đang bận. Thử lại sau."}), 409

    try:
        current = _model_slots.get(slot_id)
        if current and current["model_id"] != hf_model_id and current.get("pinned", False) and not force_reload:
            return jsonify({
                "error": f"Slot {slot_id} is pinned to {current['model_id']}; use another slot or force_reload."
            }), 409
        if current and current["model_id"] == hf_model_id and not force_reload:
            current["pinned"] = bool(current.get("pinned", False) or pin_model)
            current["last_used_at"] = time.time()
            return jsonify({
                "status": "success",
                "message": f"Model đã được load ở slot {slot_id}, bỏ qua."
            }), 200

        if current:
            _release_slot(slot_id)

        print(f"[Slot {slot_id}] Loading {hf_model_id}...")

        # ✅ Dùng FastLanguageModel thay vì AutoModelForCausalLM
        # — tương thích cả model gốc HF lẫn model đã fine-tune bằng unsloth
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=hf_model_id,
            max_seq_length=2048,
            load_in_4bit=True,
            dtype=None,  # auto-detect
        )
        FastLanguageModel.for_inference(model)  # tăng tốc inference

        _model_slots[slot_id] = {
            "model_id": hf_model_id,
            "model": model,
            "tokenizer": tokenizer,
            "pinned": pin_model,
            "loaded_at": time.time(),
            "last_used_at": time.time(),
        }

        return jsonify({
            "status": "success",
            "message": f"Model {hf_model_id} loaded vào slot {slot_id}."
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        lock.release()


@app.route('/api/model/status', methods=['GET'])
def model_slot_status():
    """Expose non-sensitive slot occupancy for cache-aware routing benchmarks."""
    slots = {}
    for slot_id in sorted(_slot_locks.keys()):
        current = _model_slots.get(slot_id)
        slots[str(slot_id)] = {
            "loaded": current is not None,
            "model_id": current["model_id"] if current else None,
            "busy": _slot_locks[slot_id].locked(),
            "pinned": bool(current.get("pinned", False)) if current else False,
            "loaded_at": current.get("loaded_at") if current else None,
            "last_used_at": current.get("last_used_at") if current else None,
        }
    return jsonify({"status": "success", "slots": slots}), 200


@app.route('/api/model/unload/<int:slot_id>', methods=['POST'])
def unload_model(slot_id):
    lock = _slot_locks.get(slot_id)
    if not lock:
        return jsonify({"error": "Invalid slot"}), 400
    vram_before_mb, _, _ = get_gpu_stats()
    with lock:
        released = _release_slot(slot_id)
    vram_after_mb, _, _ = get_gpu_stats()
    return jsonify({
        "status": "success",
        "message": f"Slot {slot_id} unloaded",
        "released": released,
        "vram_before_mb": vram_before_mb,
        "vram_after_mb": vram_after_mb,
        "active_slots": {
            str(sid): entry["model_id"]
            for sid, entry in _model_slots.items()
        },
        "cluster_device": _service.device,
    }), 200


@app.route('/api/infer/stop/<int:slot_id>', methods=['POST'])
def stop_inference(slot_id):
    if slot_id not in _slot_abort_events:
        return jsonify({"error": "Invalid slot"}), 400
    _slot_abort_events[slot_id].set()
    return jsonify({"status": "stop signal sent"}), 200


@app.route('/api/infer/stream', methods=['POST'])
def infer_model_stream():
    data        = request.json
    print(f"[infer_stream] raw body keys: {list(data.keys())}")
    print(f"[infer_stream] instanceId field: {data.get('instanceId')!r}")

    instance_id = data.get('instance_id') or data.get('instanceId') or 1
    slot_id = int(instance_id)
    print(f"[infer_stream] → resolved slot_id={slot_id}")

    if slot_id not in _slot_locks:
        return jsonify({"error": f"instanceId phải là 1 hoặc 2, nhận: {slot_id}"}), 400

    slot = _model_slots.get(slot_id)
    if slot is None:
        return jsonify({"error": f"Slot {slot_id}: chưa load model. Gọi /api/model/load trước."}), 400

    model      = slot["model"]
    tokenizer  = slot["tokenizer"]
    loaded_id  = slot["model_id"]
    slot["last_used_at"] = time.time()

    text_input    = data.get('text_input')
    system_prompt = data.get('system_prompt', DEFAULT_SYSTEM_PROMPT)

    # --- HISTORY: parse & normalize ---
    raw_history = data.get('history', [])
    history = normalize_history(raw_history, max_messages=10)

    hf_model_id = data.get('hf_model_id')
    if hf_model_id and hf_model_id != loaded_id:
        return jsonify({"error": f"Model mismatch. Slot {slot_id} đang chạy {loaded_id}, bạn gửi {hf_model_id}."}), 400

    if not text_input:
        return jsonify({"error": "Missing text_input"}), 400

    # Parse tham số generation
    gen_max_new_tokens     = data.get('max_new_tokens', 512)
    gen_temperature        = data.get('temperature', 0.3)
    gen_top_k              = data.get('top_k', 40)
    gen_top_p              = data.get('top_p', 0.85)
    gen_repetition_penalty = data.get('repetition_penalty', 1.15)
    gen_do_sample          = data.get('do_sample', True)

    print(f"[Slot {slot_id}] System prompt: {system_prompt}")
    print(f"[Slot {slot_id}] history_count={len(history)}, "
          f"max_new_tokens={gen_max_new_tokens}, temperature={gen_temperature}, "
          f"top_k={gen_top_k}, top_p={gen_top_p}, rep_penalty={gen_repetition_penalty}")

    inference_id = str(uuid.uuid4())
    inference_logs_db[inference_id] = {
        "inference_id": inference_id,
        "timestamp":    datetime.datetime.now().isoformat(),
        "slot_id":      slot_id,
        "model_id":     loaded_id,
        "input_parameters": {
            "text_input":          text_input,
            "system_prompt":       system_prompt,
            "history":             history,           # <-- thêm
            "history_count":       len(history),      # <-- thêm
            "max_new_tokens":      gen_max_new_tokens,
            "temperature":         gen_temperature,
            "top_k":               gen_top_k,
            "top_p":               gen_top_p,
            "repetition_penalty":  gen_repetition_penalty,
            "do_sample":           gen_do_sample,
        },
        "generated_text": "",
        "status": "started",
    }

    lock = _slot_locks[slot_id]

    try:
        # --- dùng history khi build prompt ---
        instruction_text = format_inference_prompt(tokenizer, system_prompt, history, text_input)

        inputs = tokenizer(
            text=instruction_text,
            return_tensors="pt",
        ).to("cuda")
        input_token_count = int(inputs["input_ids"].shape[-1])

        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=gen_max_new_tokens,          # ✅ dùng đúng tên biến
            temperature=gen_temperature,
            top_k=gen_top_k,
            top_p=gen_top_p,
            repetition_penalty=gen_repetition_penalty,
            do_sample=gen_do_sample,
        )

        generation_errors = []

        def _run_generate():
            try:
                with lock:
                    model.generate(**generation_kwargs)
            except Exception as exc:
                generation_errors.append(exc)
                traceback.print_exc()
                # model.generate normally closes the streamer itself. If it
                # raises in the background thread, explicitly send the sentinel
                # so the Flask response cannot hang forever in status=started.
                try:
                    streamer.on_finalized_text("", stream_end=True)
                except Exception:
                    pass

        # ✅ Thứ tự đúng: clear → add stopping_criteria → start thread
        _slot_abort_events[slot_id].clear()
        generation_kwargs["stopping_criteria"] = StoppingCriteriaList([
            AbortStoppingCriteria(_slot_abort_events[slot_id])
        ])
        Thread(target=_run_generate, daemon=True).start()   # ✅ Chỉ start 1 lần

        def generate_stream():
            full_response = []
            completed = False
            try:
                for text in stream_without_thinking(streamer):
                    full_response.append(text)
                    inference_logs_db[inference_id]["generated_text"] = "".join(full_response)
                    inference_logs_db[inference_id]["status"] = "streaming"
                    yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"

                generated_text = "".join(full_response)
                if generation_errors:
                    error_message = str(generation_errors[0])
                    inference_logs_db[inference_id]["status"] = "error"
                    inference_logs_db[inference_id]["error_message"] = error_message
                    yield f"data: {json.dumps({'error': error_message, 'inference_id': inference_id}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Count with the exact tokenizer loaded for this model. Emitting
                # this as a final SSE event lets benchmark clients record
                # measured token use instead of estimating from characters.
                output_token_count = len(tokenizer.encode(generated_text, add_special_tokens=False))
                usage = {
                    "input_tokens": input_token_count,
                    "output_tokens": output_token_count,
                    "total_tokens": input_token_count + output_token_count,
                    "accounting": "model_tokenizer",
                }
                inference_logs_db[inference_id]["generated_text"] = generated_text
                inference_logs_db[inference_id]["usage"] = usage
                inference_logs_db[inference_id]["status"] = "completed"
                completed = True
                yield f"data: {json.dumps({'usage': usage, 'inference_id': inference_id}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
            finally:
                if not completed and inference_logs_db[inference_id].get("status") not in ("error", "completed"):
                    _slot_abort_events[slot_id].set()
                    inference_logs_db[inference_id]["status"] = "interrupted"
                    inference_logs_db[inference_id]["error_message"] = "Client/tunnel disconnected before generation completed."

        return Response(generate_stream(), mimetype='text/event-stream')

    except Exception as e:
        traceback.print_exc()
        inference_logs_db[inference_id]["status"] = "error"
        inference_logs_db[inference_id]["error_message"] = str(e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/infer/logs', methods=['GET'])
@app.route('/api/infer/logs/<inference_id>', methods=['GET'])
def get_inference_logs(inference_id=None):
    if inference_id:
        log = inference_logs_db.get(inference_id)
        if log:
            return jsonify(log), 200
        else:
            return jsonify({"error": "Inference log not found"}), 404
    else:
        # Return all logs, perhaps with pagination in a real-world scenario
        return jsonify(list(inference_logs_db.values())), 200


@app.route('/api/system-eval/resources')
def get_resources():
    info = pynvml.nvmlDeviceGetMemoryInfo(gpu_handle)
    util = pynvml.nvmlDeviceGetUtilizationRates(gpu_handle)
    vram_used_mb  = info.used   // 1024 ** 2
    vram_total_mb = info.total  // 1024 ** 2
    vram_free_mb  = info.free   // 1024 ** 2

    with _active_eval_lock:
        active = gpu_state._active_eval_count

    active_training = any(
        value.get('status') == 'TRAINING'
        for key, value in jobs_db.items()
        if not key.startswith('__eval_tmp_')
    )

    # Ngưỡng VRAM tối thiểu để nhận thêm 1 eval job (MB)
    VRAM_MIN_FREE_MB = 5120  # 5 GB

    can_create = (
        not active_training
        and active < GPU_EVAL_SLOTS
        and vram_free_mb >= VRAM_MIN_FREE_MB
    )

    return jsonify({
        "vram_used_mb":    vram_used_mb,
        "vram_total_mb":   vram_total_mb,
        "vram_free_mb":    vram_free_mb,
        "gpu_util":        util.gpu,
        "active_evals":    active,
        "active_training": active_training,
        "max_evals":       GPU_EVAL_SLOTS,
        "can_create_eval": can_create,
        "vram_min_free_mb": VRAM_MIN_FREE_MB,
        "eval_checkpoint_protocol": 1,
    }), 200


@app.route("/api/cluster", methods=["POST"])
def cluster():
    """
    POST /api/cluster

    Phải gọi /api/cluster/visualize trước (để có embedding cache).
    Chạy DBSCAN lọc noise + KMeans phân cụm, lưu toàn bộ kết quả vào
    _cluster_cache để các bước filter sau có thể đọc độc lập.

    Body JSON:
    {
        "k":           11,   // Tùy chọn, số cụm KMeans,      mặc định 11
        "eps":         0.05, // Tùy chọn, DBSCAN eps,         mặc định 0.05
        "min_samples": 3     // Tùy chọn, DBSCAN min_samples, mặc định 3
    }

    Response JSON:
    {
        "data":        [ { ...original_item, "cluster": int }, ... ],
        "assignments": [ int, ... ],   // -1 = noise, 0..K-1 = cụm KMeans
        "groups":      [ { "groupId": int, "count": int, "label": str }, ... ],
        "clusterStats": [              // trung bình cosine similarity theo từng cụm
            { "clusterId": int, "avgSimilarity": float, "count": int }, ...
        ],
        "avgSimilarity": float         // trung bình cosine similarity toàn bộ tập clean
    }
    """
    body = request.get_json(silent=True) or {}

    k = body.get("k", 11)
    if not isinstance(k, int) or k < 1:
        return jsonify({"error": "'k' phải là số nguyên dương."}), 400

    eps = body.get("eps", 0.05)
    if not isinstance(eps, (int, float)) or eps <= 0:
        return jsonify({"error": "'eps' phải là số thực dương."}), 400

    min_samples = body.get("min_samples", 3)
    if not isinstance(min_samples, int) or min_samples < 1:
        return jsonify({"error": "'min_samples' phải là số nguyên dương."}), 400

    data = body.get("data")
    
    try:
        result = _service.cluster(
            k=int(k),
            eps=float(eps),
            min_samples=int(min_samples),
            data=data,
        )
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/filter", methods=["POST"])
def cluster_filter():
    """
    POST /api/cluster/filter

    Body JSON:
    {
        "threshold": 0.9  // Tùy chọn, mặc định 0.9
    }
    """
    body = request.get_json(silent=True) or {}
    threshold = body.get("threshold", 0.9)
    if not isinstance(threshold, (int, float)) or not (0 < threshold <= 1):
        return jsonify({"error": "'threshold' phải là số thực trong khoảng (0, 1]."}), 400

    try:
        result = _service.filter_deduplicate(threshold=float(threshold))
        return jsonify(result), 200
    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/filter")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/remove-noise", methods=["POST"])
def cluster_filter_remove_noise():
    """
    POST /api/cluster/remove-noise

    Phải gọi /api/cluster trước (để có cluster cache).
    Lọc bỏ toàn bộ điểm bị DBSCAN đánh nhãn noise (cluster == -1),
    trả về phần còn lại với nhãn cụm KMeans nguyên vẹn.

    Không có tham số. Hoạt động độc lập với /deduplicate.

    Response JSON:
    {
        "data":         [ { ...original_item, "cluster": int }, ... ],
        "assignments":  [ int, ... ],   // chỉ còn 0..K-1, không còn -1
        "groups":       [ { "groupId": int, "count": int, "label": str }, ... ],
        "removedCount": int,            // số điểm noise bị loại
        "keptCount":    int             // số điểm còn lại
    }
    """
    try:
        result = _service.filter_remove_noise()
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/remove-noise")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/deduplicate", methods=["POST"])
def cluster_filter_deduplicate():
    """
    POST /api/cluster/deduplicate

    Phải gọi /api/cluster trước (để có cluster cache).
    Loại bỏ các điểm có cosine similarity với tâm cụm > threshold
    (tức là quá giống nhau / trùng lặp), luôn giữ lại điểm gần tâm
    nhất của mỗi cụm. Điểm noise (cluster == -1) bị bỏ qua hoàn toàn.

    Hoạt động độc lập với /remove-noise.

    Body JSON:
    {
        "threshold": 0.9  // Tùy chọn, mặc định 0.9 — khoảng (0, 1]
    }

    Response JSON:
    {
        "data":         [ { ...original_item, "cluster": int }, ... ],
        "assignments":  [ int, ... ],
        "groups":       [ { "groupId": int, "count": int, "label": str }, ... ],
        "removedCount": int,   // số điểm bị loại do quá gần tâm cụm
        "keptCount":    int    // số điểm còn lại
    }
    """
    body = request.get_json(silent=True) or {}

    threshold = body.get("threshold", 0.9)
    if not isinstance(threshold, (int, float)) or not (0 < threshold <= 1):
        return jsonify({"error": "'threshold' phải là số thực trong khoảng (0, 1]."}), 400

    try:
        result = _service.filter_deduplicate(threshold=float(threshold))
        return jsonify(result), 200

    except RuntimeError as re:
        return jsonify({"error": str(re)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/deduplicate")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/visualize", methods=["POST"])
def cluster_visualize():
    """
    POST /api/cluster/visualize

    Body JSON:
    {
        "data":        [ <sample>, ... ],  // Bắt buộc  (OpenAI messages format)
        "max_k":       20,                 // Tùy chọn, mặc định 20
        "eps":         0.1,               // Tùy chọn, DBSCAN eps, mặc định 0.1
        "min_samples": 3                   // Tùy chọn, DBSCAN min_samples, mặc định 3
    }

    Response JSON:
    {
        "elbow":      [ { "k": int, "wcss": float }, ... ],
        "silhouette": [ { "k": int, "silhouette": float }, ... ],
        "kDistance":  [ { "rank": int, "distance": float }, ... ],
        "pointCount": int,
        "noiseCount": int
    }

    Side-effect: lưu conv_embeddings vào cache để /api/cluster tái sử dụng.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body phải là JSON hợp lệ."}), 400

    data = body.get("data")
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({"error": "'data' phải là một mảng không rỗng."}), 400

    max_k = body.get("max_k", 20)
    if not isinstance(max_k, int) or max_k < 1:
        return jsonify({"error": "'max_k' phải là số nguyên dương."}), 400

    eps = body.get("eps", 0.15)
    if not isinstance(eps, (int, float)) or eps <= 0:
        return jsonify({"error": "'eps' phải là số thực dương (ví dụ: 0.15)."}), 400

    min_samples = body.get("min_samples", 6)
    if not isinstance(min_samples, int) or min_samples < 1:
        return jsonify({"error": "'min_samples' phải là số nguyên dương."}), 400

    try:
        result = _service.visualize(
            data=data,
            max_k=max_k,
            eps=float(eps),
            min_samples=int(min_samples),
        )
        return jsonify(result), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as exc:
        app.logger.exception("Lỗi trong /api/cluster/visualize")
        return jsonify({"error": f"Lỗi server: {str(exc)}"}), 500


@app.route("/api/cluster/cache", methods=["DELETE"])
def clear_cache():
    """DELETE /api/cluster/cache — Xóa toàn bộ embedding + cluster cache."""
    _service.clear_cache()
    return jsonify({"message": "Cache đã được xóa."}), 200


# ── Health-check ──────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "device": _service.device}), 200


# clustering_service = ClusteringService()

@app.route("/api/cluster/safe-split", methods=["POST"])
def cluster_safe_split():
    """
    POST /api/cluster/safe-split

    Body JSON:
    {
        "data": [ <sample>, ... ],      // bắt buộc
        "test_percentage": 20,          // tùy chọn, mặc định 20
        "threshold": 0.85,              // tùy chọn, mặc định 0.85
        "max_attempts": 20,             // tùy chọn, mặc định 20
        "seed": 42                      // tùy chọn, mặc định 42
    }
    """
    try:
        body = request.get_json(force=True) or {}
        data = body.get("data")
        test_percentage = body.get("test_percentage", 20)
        threshold = body.get("threshold", 0.85)
        max_attempts = body.get("max_attempts", 20)
        seed = body.get("seed", 42)

        if not isinstance(data, list) or len(data) == 0:
            return jsonify({"error": "Missing or empty data array"}), 400

        result = _service.safe_split(
            data=data,
            test_percentage=float(test_percentage),
            threshold=float(threshold),
            max_attempts=int(max_attempts),
            seed=int(seed),
        )
        return jsonify(result), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e) or "Failed to generate safe split"}), 500



# ======================================================================
# 5. MAIN SERVER STARTUP
# ======================================================================

if __name__ == '__main__':
    start_background_services()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    print(f"🔥 Flask dev server trên {host}:{port} (local only — prod dùng gunicorn)")
    app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
