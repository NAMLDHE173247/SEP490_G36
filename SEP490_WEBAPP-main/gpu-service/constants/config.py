"""Tunable config constants (paths, batch/slots, judge model, eval stages)."""
import os

UPLOAD_FOLDER = './dataset_uploads'
LOCAL_CHECKPOINT_BASE = "/tmp/checkpoints_"
EVAL_CHECKPOINT_BASE = os.path.join(LOCAL_CHECKPOINT_BASE, "eval_jobs")

MAX_CONCURRENT_JOBS = 1  # 1 GPU Colab runs only 1 job at a time

GPU_EVAL_SLOTS = 3

BATCH_SIZE = 5  # số conversation mỗi lần gọi API

DEFAULT_JUDGE_MODEL = "DeepSeek-V4-Flash"

_CRITERIA_KEYS = [
    "A1_answer_withholding", "A2_scaffolding_quality", "A3_adaptive_response",
    "B1_factual_accuracy", "B2_grade_level", "C1_robustness",
    "C2_coherence", "C3_tone", "D1_hallucination",
]

_SHORT_TO_FULL = {
    "A1": "A1_answer_withholding",
    "A2": "A2_scaffolding_quality",
    "A3": "A3_adaptive_response",
    "B1": "B1_factual_accuracy",
    "B2": "B2_grade_level",
    "C1": "C1_robustness",
    "C2": "C2_coherence",
    "C3": "C3_tone",
    "D1": "D1_hallucination",
}

EVAL_STAGES = {
    "warmup":      {"pct": 3,  "label": "Khởi động GPU"},
    "replay_base": {"pct": 28, "label": "Replay Base model"},
    "replay_ft":   {"pct": 53, "label": "Replay FT model"},
    "replay":      {"pct": 53, "label": "Replay conversations"},
    "judge_base":  {"pct": 70, "label": "Chấm điểm Base model"},
    "judge_ft":    {"pct": 87, "label": "Chấm điểm FT model"},
    "judge":       {"pct": 87, "label": "Chấm điểm LLM judge"},
    "finalize":    {"pct": 98, "label": "Tổng hợp kết quả"},
}

EVAL_STAGE_RANGES = {
    "replay_base": (3, 28),
    "replay_ft": (28, 53),
    "replay": (3, 53),
    "judge_base": (53, 70),
    "judge_ft": (53, 87),
    "judge": (53, 87),
}

