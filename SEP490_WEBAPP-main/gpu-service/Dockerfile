# ============================================================
# GPU Service — Dockerfile
# Base: PyTorch official image với CUDA 12.1 + cuDNN 8
# ============================================================
FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-devel

# Metadata
LABEL maintainer="SEP490 Team"
LABEL description="GPU Fine-tuning & Inference Service (Unsloth + Flask)"

# Tránh interactive prompt khi apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Cài system dependencies
RUN apt-get update && apt-get install -y \
    git \
    git-lfs \
    curl \
    wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Bước 1: Cài requirements cơ bản ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Bước 1b: PIN torch stack về CUDA 12.8 ---
# Driver server prod (575.x = CUDA 12.9) KHÔNG chạy được wheel cu130 (torch >= 2.12
# trên PyPI mặc định build cho CUDA 13.0 → "driver too old, found version 12090").
# torch 2.11.0 là bản CUỐI CÙNG còn wheel cu128, và nằm đúng range unsloth yêu cầu
# (>=2.4,<2.12). Cài TRƯỚC unsloth để pip thấy torch đã thỏa mãn → không kéo cu130.
RUN pip install --no-cache-dir --upgrade \
    torch==2.11.0 torchvision torchaudio xformers \
    --index-url https://download.pytorch.org/whl/cu128

# --- Bước 2: Cài Unsloth (torch đã pin đúng version → unsloth không nâng nữa) ---
RUN pip install --no-cache-dir \
    "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"

# --- Bước 2b: bitsandbytes theo range unsloth hỗ trợ ---
# 0.45.5+ bundle sẵn binary cho cu12x, dùng lib nvidia-* do wheel torch cu128 kéo về
# (pin cũ 0.43.3 chỉ cần cho base image CUDA 12.1 thuần — giờ không cần nữa)
RUN pip install --no-cache-dir --upgrade "bitsandbytes>=0.45.5,!=0.46.0,!=0.48.0"

# --- Bước 2c: GUARD — build FAIL ngay nếu bước nào đó lén nâng torch lên cu13x ---
RUN python -c "import torch; v = torch.version.cuda or ''; assert v.startswith('12.'), f'torch {torch.__version__} built cho CUDA {v} — driver server chi ho tro 12.x!'; print('OK: torch', torch.__version__, '| CUDA', v)"

# --- Bước 3: Download NLTK data cần thiết ---
RUN python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True)"

# --- Bước 4: Copy source code ---
COPY app.py ./
COPY gunicorn.conf.py ./
COPY constants ./constants
COPY core ./core
COPY pipelines ./pipelines
COPY services ./services
COPY utils ./utils

# Tạo thư mục cần thiết
RUN mkdir -p /app/dataset_uploads /tmp/checkpoints_

# ============================================================
# Biến môi trường (override lúc docker run hoặc qua .env)
# ============================================================
ENV HOST=0.0.0.0
ENV PORT=5000
ENV BACKEND_URL=""

# Tắt Torch compile để tránh lỗi trên một số GPU
ENV TORCHDYNAMO_DISABLE=1
ENV CUDA_LAUNCH_BLOCKING=0

# Tăng timeout cho HuggingFace download
ENV HF_HUB_DOWNLOAD_TIMEOUT=120

EXPOSE 5000

# Healthcheck — project backend có thể ping endpoint này
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
