# Chạy GPU service trên Kaggle

Kaggle phải có **cả hai file** trong cùng thư mục làm việc:

```text
/kaggle/working/app.py
/kaggle/working/locked_eval_protocol.py
```

Nếu chỉ upload `app.py`, service sẽ dừng với:
`ModuleNotFoundError: No module named 'locked_eval_protocol'`.

Có thể clone repository rồi chạy:

```bash
cd /kaggle/working
git clone --depth 1 https://github.com/NAMLDHE173247/SEP490_G36.git repo
cd repo/SEP490_WEBAPP-main/gpu-service
python -m pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
python -m pip install -r requirements.txt
python app.py
```

Hoặc upload/copy tối thiểu `app.py` và `locked_eval_protocol.py` vào cùng thư mục.
Sau khi Flask chạy, mở tunnel đến cổng `5000` và dùng đúng URL mà tunnel in ra:

```python
health_url = public_url.rstrip('/') + '/health'
print('GPU_SERVICE_URL:', public_url)
print('Health check:', health_url)
```

URL cần nhập vào Web UI là dạng `https://host.loca.lt`, **không** thêm `https://`
lần nữa và không nhập `/health`. Kiểm tra trước bằng:

```bash
curl -i "$GPU_SERVICE_URL/health"
```

Kết quả hợp lệ có HTTP 200 và JSON chứa `"status": "ok"`.

## Bàn giao cho người đang giữ GPU/A100

Nếu GPU thuộc tài khoản Kaggle khác, chỉ cần gửi họ file ZIP mới nhất và cell
dưới đây. Cell không giả định dataset slug là `test321`, không dùng `!cd`
(vì mỗi dòng `!` chạy ở shell riêng), và không dùng option `pip -p`.

```python
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ZIP_NAME = "gpu-service-chat-template-train-loss-fix-20260810.zip"
INPUT_ROOT = Path("/kaggle/input")
WORK_ROOT = Path("/kaggle/working/sep490")

matches = [p for p in INPUT_ROOT.rglob(ZIP_NAME) if p.is_file()]
if not matches:
    raise FileNotFoundError("Không tìm thấy ZIP GPU service trong /kaggle/input")

zip_path = matches[0]
with zipfile.ZipFile(zip_path) as archive:
    names = set(archive.namelist())
    required = {
        "gpu-service/pipelines/training.py",
        "gpu-service/pipelines/peft_compat.py",
    }
    missing = required - names
    if missing:
        raise RuntimeError(
            f"Đang chọn nhầm ZIP cũ; thiếu file fix TorchAO: {sorted(missing)}"
        )
service_dir = WORK_ROOT / "gpu-service"
if service_dir.exists():
    shutil.rmtree(service_dir)
WORK_ROOT.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(zip_path) as archive:
    # ZIP mới dùng dấu /; chặn path traversal trước khi giải nén.
    root = WORK_ROOT.resolve()
    for name in archive.namelist():
        target = (WORK_ROOT / name).resolve()
        if root not in target.parents and target != root:
            raise RuntimeError(f"Tên file ZIP không an toàn: {name}")
    archive.extractall(WORK_ROOT)

subprocess.check_call([
    sys.executable, "-m", "pip", "install",
    "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git",
])
subprocess.check_call([
    sys.executable, "-m", "pip", "install", "-r",
    str(service_dir / "requirements.txt"),
])
print("GPU service source:", service_dir)
```

Chạy service bằng một cell Python khác:

```python
import os
import subprocess
import sys

env = os.environ.copy()
env["HOST"] = "0.0.0.0"
env["PORT"] = "5000"
subprocess.run([sys.executable, "/kaggle/working/sep490/gpu-service/app.py"], env=env, check=False)
```

Sau khi worker mới chạy, log phải có:

```text
[Build] training_pipeline=chat-template-train-loss-20260810-v3
```

và sau mỗi eval có `[Eval] captured ... validation sample details`. Nếu không
có dòng `[Build]` thì A100 vẫn đang chạy worker cũ; backend không thể tự bịa
nội dung câu trả lời mà worker chưa gửi lên.
