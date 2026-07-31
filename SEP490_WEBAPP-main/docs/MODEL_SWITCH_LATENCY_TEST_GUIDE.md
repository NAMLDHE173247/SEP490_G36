# Model-switch latency test guide

## Mục tiêu

Đo riêng chi phí Router, tải/chuyển model, TTFT, decode và tổng thời gian người dùng chờ khi hội thoại thay đổi môn liên tục.

File test này chỉ là engineering latency pilot. Không dùng các môn trong file để tuyên bố thay đổi scope nghiên cứu chính thức.

## File cần dùng

- GPU worker ZIP: `D:\Sep_G36\gpu-service-latency-v1.zip`
- Test scenarios: `docs/datasets/router_latency_switch_test_v1.json`

## 1. Khởi động GPU worker đã cập nhật

1. Mở notebook Colab đang dùng để chạy GPU service.
2. Dừng cell `app.py` cũ.
3. Xóa thư mục `/content/gpu-service` cũ nếu notebook chưa tự ghi đè.
4. Upload `D:\Sep_G36\gpu-service-latency-v1.zip` và đổi tên trên Colab thành `/content/gpu-service.zip` nếu notebook yêu cầu tên cố định.
5. Chạy lại cell unzip/install và cell khởi động `app.py`.
6. Sao chép URL tunnel mới vào `backend/.env` ở biến `GPU_SERVICE_URL`.
7. Chờ `/health` trả trạng thái Ready.
8. Kiểm tra `/api/model/status`; response phải có hai slot `1` và `2`.

Không chạy benchmark khi tunnel trả 502 hoặc 503.

## 2. Kiểm tra model map

Trong **Hybrid Router Benchmark**, upload file latency test và ánh xạ:

- `GENERAL` → `anhdai312/General19`
- `ENGLISH` → `anhdai312/English19`
- `MATH` → `anhdai312/Math19`
- `HISTORY` → `anhdai312/History19`

Đây là model map kỹ thuật hiện có. Kết quả không thay thế benchmark môn học chính thức trong RP5.

## 3. Cold-start run

1. Giải phóng cả hai GPU slots hoặc khởi động lại GPU worker.
2. Upload `router_latency_switch_test_v1.json`.
3. Chỉ chọn điều kiện `ORACLE` để bảo đảm chuỗi chuyển model đúng theo gold subject.
4. Đặt `E2E repeats = 1`.
5. Bấm **Run End-to-End RP5**.
6. Tải artifact ngay khi hoàn tất và đặt tên `latency_cold_oracle_r1.json`.

Cold run dùng để đo model load khi cache rỗng. Không gộp cold run với warm run.

## 4. Warm/cache run

1. Không giải phóng model sau cold run.
2. Giữ nguyên file và model map.
3. Chọn `ORACLE`.
4. Đặt `E2E repeats = 3`.
5. Chạy lại và tải artifact với tên `latency_warm_oracle_r3.json`.

Oracle run cô lập chi phí switching khỏi lỗi Router.

## 5. Hybrid switching run

1. Giữ nguyên file test và model map.
2. Chỉ chọn `HYBRID`.
3. Đặt `E2E repeats = 3`.
4. Chạy và tải artifact với tên `latency_hybrid_r3.json`.

So sánh route trace của Hybrid với `turn_gold_subjects`. Nếu Hybrid yêu cầu clarification thì lượt đó không gọi model và không được diễn giải như cache hit.

## 6. Chỉ số cần lưu

Cho từng condition và từng turn, lưu:

- `router_latency_ms`
- `model_switch_latency_ms`
- `ttft_ms`
- `decode_latency_ms`
- `generation_latency_ms`
- `end_to_end_latency_ms`
- `gpu_slot_id`
- `model_cache_hit`
- `model_load_action`
- `previous_model`
- `model_evicted`

Ở summary, lưu:

- Average, median và p95 end-to-end latency
- `end_to_end_latency_cv`
- Cache-hit rate
- Cold-load count
- Switch-load count
- Eviction count

## 7. Cách đọc sáu scenario

| Scenario | Câu hỏi nghiên cứu |
|---|---|
| LAT-001 | Cold load một specialist mất bao lâu? |
| LAT-002 | Cùng model qua nhiều turn có giữ warm cache không? |
| LAT-003 | General → specialist có thêm bao nhiêu switch latency? |
| LAT-004 | Quay lại model cũ khi chỉ dùng hai model có cache hit không? |
| LAT-005 | Bốn model trên hai slot gây bao nhiêu eviction/reload? |
| LAT-006 | Follow-up có giữ subject; câu mơ hồ có clarification đúng không? |

## 8. Điều kiện kết luận

- Không dùng `router_latency_ms` thay cho thời gian người dùng chờ.
- Không cộng TTFT hai lần; TTFT end-to-end đã bao gồm routing và model switching.
- Báo cáo cold và warm riêng.
- Nếu LAT-005 có switch-load lớn, ghi rõ giới hạn hai GPU slot và đề xuất sticky routing, template greeting hoặc LoRA adapter hot-swap.
- Kết quả tốc độ và cache nằm ở RP5; RP4 chỉ chứa protocol.
