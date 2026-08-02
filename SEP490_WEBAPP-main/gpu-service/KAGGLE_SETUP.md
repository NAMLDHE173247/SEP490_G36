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
pip install -r requirements.txt
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
