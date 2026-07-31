# Hướng dẫn test khóa: Base vs Fine-tuned và đối chiếu LLM lớn

Phiên bản protocol: `RP4-locked-v1`  
Đối tượng chính: ba cặp `B_s`–`F_s` cho `ENGLISH`, `MATH`, `HISTORY`.

## 1. Tách đúng hai câu hỏi so sánh

1. **Base vs Fine-tuned (confirmatory):** `F_s` phải được tạo từ đúng `B_s`. Hai model nhận cùng `item_id`, system prompt, chat template, decoding và giới hạn token. Đây là phép so sánh dùng để kết luận tác động của fine-tuning và kiểm tra H1–H4.
2. **Fine-tuned vs LLM lớn (contextual reference):** chạy cùng nội dung và prompt intent để biết khoảng cách chất lượng–chi phí. Vì khác backbone, tokenizer, dữ liệu tiền huấn luyện và API, kết quả này **không** chứng minh hiệu quả của fine-tuning.

Không gộp hai loại so sánh vào cùng một cột “model thắng”.

## 2. Những gì evaluator hiện đã ghi

- `item_id`, `subject`, Base/FT repository và thời điểm bắt đầu/kết thúc thật.
- Chế độ `locked_single_turn`: chỉ user message duy nhất được đưa vào model; assistant reference không đi vào input.
- P0/P1, prompt version, system-prompt hash và rendered-input hash.
- Greedy decoding (`temperature=0`, `do_sample=false`) và `max_new_tokens` giống nhau.
- K = B1 và S = mean(A1, A2, A3); Overall A–B–C–D cũ chỉ còn exploratory.
- TTFT, E2E, TPOT, token/s, token/phút, words/phút, input/output tokens, output-limit và peak allocated VRAM.
- First-attempt failure không bị retry xóa khỏi log.
- Judge request ID, requested/effective judge model và judge-prompt hash.
- Paired bootstrap CI95% (10.000 resamples), effect size, H1/H2 và H4 theo đúng ngưỡng RP4.
- Model-load time, environment manifest và dataset/config hash.
- `pairIntegrity` và `confirmatoryEligible`: tự kiểm tra đủ cặp, prompt/rendered-input hash, subject, judge failure và effective judge model.

## 3. Chuẩn bị held-out dataset

Mỗi file test môn phải có đúng 50 item chưa dùng train/validation. Mỗi item cần:

```json
{
  "item_id": "MATH-TEST-001",
  "subject": "MATH",
  "messages": [
    {"role": "system", "content": "<P1 đã khóa>"},
    {"role": "user", "content": "<câu hỏi học sinh>"}
  ],
  "reference_answer": "<chỉ dành cho Judge; không đưa vào input Base/FT>",
  "gold_key_points": []
}
```

Giá trị `subject` hợp lệ: `ENGLISH`, `MATH`, `HISTORY`. `item_id` phải ổn định và duy nhất. Xem file mẫu tại `docs/examples/locked_eval_example.json`.

Locked run sẽ dừng nếu:

- thiếu/nhân đôi `item_id`;
- không có subject hợp lệ;
- có 0 hoặc nhiều hơn 1 user message;
- dữ liệu không theo `messages[]`.

Trước khi mở held-out test, lưu riêng:

- SHA-256 của train/validation/test;
- repository và revision chính xác của Base/FT;
- tokenizer revision;
- P0/P1 content + version + hash;
- generation config;
- judge model và judge rubric hash.

Kiểm tra file trước khi upload:

```powershell
python scripts\validate_locked_dataset.py data\math_test.json
```

## 4. Chạy smoke test trước

Chỉ dùng 2–3 item/môn để kiểm tra pipeline. Không đưa số smoke test vào RP5.

```powershell
cd D:\Sep_G36\SEP490_G36\SEP490_WEBAPP-main\gpu-service
python -m unittest test_locked_eval_protocol.py
python -m py_compile app.py locked_eval_protocol.py
```

Trên giao diện Model Evaluation:

1. Chọn Fine-tuned training job.
2. Kiểm tra Base repository tự điền đúng checkpoint gốc.
3. Chọn judge đã khóa: `google/gemini-2.5-flash` (hoặc đổi protocol trước khi xem held-out).
4. Primary run dùng `P1`; nội dung/version prompt được tự động lấy từ file test hoặc Data Prep metadata, rồi mới fallback sang Training Job. Giao diện không cho nhập prompt lần hai. Backend khóa `max_new_tokens=512`.
5. Upload ZIP/JSON test của đúng một môn.
6. Kiểm tra result có `evalMode=paired`, `protocolManifest.single_turn=true`, Base/FT đều có 50 item, không có prompt hash null ở P1.

## 5. Chạy thí nghiệm chính

Thứ tự khuyến nghị:

1. `ENGLISH-P1`: Base vs Fine-tuned, 50 item.
2. `MATH-P1`: Base vs Fine-tuned, 50 item.
3. `HISTORY-P1`: Base vs Fine-tuned, 50 item.
4. Đóng băng ba output JSON trên trước khi phân tích.
5. Chạy P0 như secondary ablation, không dùng thay kết quả P1.
6. Chạy Mathematics seed sensitivity (17/42/73) riêng nếu các checkpoint đã tồn tại.

Tải artifact đầy đủ bằng endpoint:

```text
GET /api/model-eval/<evalId>/export
```

Sau khi có ba JSON primary:

```powershell
python scripts\analyze_locked_runs.py `
  --run results\english_p1.json `
  --run results\math_p1.json `
  --run results\history_p1.json `
  --output results\confirmatory_analysis.json
```

Script tạo cả JSON và CSV cho RP5.

## 6. Cách đọc H1–H4

- **H1:** supported khi lower CI95 của `Delta K_macro` > 0.
- **H2:** supported khi lower CI95 của `Delta S_macro` > 0 và không dimension A1/A2/A3 nào có upper CI95 < 0.
- **H3:** chỉ test khi Version 1 được khóa đủ repository/revision/tokenizer/prompt/config; nếu không ghi `not testable`.
- **H4 theo từng môn:** tất cả gate phải qua:
  - lower CI95 của Delta K, Delta S, Delta A1/A2/A3 >= -0.25/5;
  - upper CI95 của Delta violation-rate(A1<=1) <= 0.05;
  - median TPOT ratio FT/Base <= 1.10;
  - first-attempt failure rate FT <= 0.02.

Không đổi ngưỡng sau khi nhìn kết quả.

### 6.1 Quy tắc thiếu output phải khóa trước held-out

- **Model sinh lỗi/empty output:** gán trước điểm `0` cho K, S, A1/A2/A3 và các tiêu chí chẩn đoán; vẫn giữ item trong mẫu số paired 50 câu và đồng thời báo failure rate. Đây là “không có giá trị trợ giảng”, không phải lỗi đo.
- **Judge/API lỗi, parse miss hoặc effective judge sai model:** coi là thiếu phép đo, tuyệt đối không đổi thành điểm `0`; run có `confirmatoryEligible=false` và phải chấm lại toàn bộ run theo cùng manifest.

Quy tắc này phải được bổ sung vào RP4/protocol freeze trước khi mở held-out. File phân tích sẽ từ chối JSON không có `confirmatoryEligible=true`.

## 7. Benchmark nào dùng để so với LLM lớn?

### 7.1 Primary product benchmark — bắt buộc

Dùng chính 150 held-out item nội bộ (50/môn) với cùng P1, output cap và rubric K/S. Đây là benchmark duy nhất đo trực tiếp hành vi tutor Socratic đúng use case của hệ thống.

Báo cáo với LLM lớn:

- K, S và A1/A2/A3;
- failure/output-limit rate;
- E2E, words/minute và chi phí/100 item;
- model ID được yêu cầu và model/provider thực tế trả về;
- human audit trên cùng sample.

Không so token/s trực tiếp giữa tokenizer family khác nhau; bổ sung words/minute hoặc characters/second.

### 7.2 External knowledge/generalization benchmark

1. **VNHSGE:** lọc các câu text-only thuộc English, Mathematics và History. Dùng exact-match accuracy cho multiple-choice; loại item ảnh nếu pipeline chưa hỗ trợ ảnh. Bộ dữ liệu bao phủ chín môn và hơn 19.000 câu trắc nghiệm, phù hợp kiểm tra kiến thức THPT Việt Nam. Nguồn: [paper](https://arxiv.org/abs/2305.12199), [official repository](https://github.com/Xdao85/VNHSGE).
2. **VMLU:** dùng subset tương ứng kiến thức, đọc hiểu và suy luận tiếng Việt; giữ nguyên official prompt/evaluator cho bảng external. VMLU gồm bốn bộ dữ liệu đánh giá general knowledge, reading comprehension, reasoning và conversational ability. Nguồn: [ACL 2025 paper](https://aclanthology.org/2025.acl-long.563/).
3. **MathTutorBench:** chỉ dùng cho MATH và báo cáo riêng năng lực sư phạm open-ended; không mở rộng kết quả sang English/History. Nguồn: [EMNLP 2025 paper](https://aclanthology.org/2025.emnlp-main.11/).

Trước khi dùng external subset: deduplicate với train/validation/internal test; lưu số item trước/sau eligibility và hash. External benchmark không dùng chọn checkpoint.

### 7.3 Không dùng làm benchmark chính

- GSM8K/MATH chỉ đo giải toán, không đo tutor Socratic hay bối cảnh Việt Nam.
- MMLU tổng hợp không đại diện trực tiếp chương trình THPT và hành vi tutor.
- BLEU/ROUGE không đủ để kết luận chất lượng trả lời mở; chỉ giữ diagnostic.
- Một leaderboard công khai không thay thế chạy cùng prompt và cùng subset của đề tài.

## 8. Chọn LLM lớn như thế nào?

Chọn tối đa hai model để tránh mở rộng scope:

1. một frontier proprietary model;
2. một strong open-weight model lớn làm cost/ownership reference.

Panel tối thiểu đề xuất tại ngày 28/07/2026:

- `openai/gpt-5.6-sol`: frontier proprietary reference;
- `qwen/qwen3.6-27b`: open-weight 27B reference, Apache-2.0 theo [official model card](https://huggingface.co/Qwen/Qwen3.6-27B).

Panel này tránh dùng chính `google/gemini-2.5-flash` vừa làm candidate vừa làm judge. Nếu đổi target/judge, phải khóa lại trước held-out và giữ judge độc lập với candidate khi có thể.

Không dùng alias kiểu `auto`, `latest` hoặc free router trong locked run. Tra cứu model hiện có và canonical slug ngay trước ngày chạy:

```powershell
Invoke-RestMethod https://openrouter.ai/api/v1/models | `
  Select-Object -ExpandProperty data | `
  Select-Object id, canonical_slug, context_length, pricing
```

Khóa canonical model ID, provider policy, output cap, seed/temperature/reasoning mode khi endpoint hỗ trợ và ngày chạy. Script tự đọc `supported_parameters`; không gửi tham số model không hỗ trợ và lưu rõ giá trị `null` thay vì giả vờ hai API có cùng cơ chế decoding. Nếu OpenRouter trả effective model khác requested model, đánh dấu run invalid hoặc exploratory. Models API và `usage` cung cấp model metadata, token count và pricing cần lưu: [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models).

## 9. Chạy larger-LLM contextual reference

Thiết lập key trong process hiện tại, không ghi key vào source/log:

```powershell
$env:OPENROUTER_API_KEY = '<key>'
python scripts\run_large_llm_reference.py `
  --dataset data\math_test.json `
  --model '<canonical-model-slug>' `
  --judge-model 'google/gemini-2.5-flash' `
  --prompt-variant P1 `
  --prompt-file prompts\P1.txt `
  --prompt-version 'P1-v1' `
  --max-new-tokens 512 `
  --seed 42 `
  --reasoning-effort medium `
  --output results\math_large_llm_reference.json
```

Chạy lại cho ba môn và từng larger LLM. Script lưu raw output, requested/effective model, response IDs, usage/cost fields, latency, prompt hashes và judge result. `comparisonRole` luôn là `contextual_large_llm_reference`.

## 10. Human audit và operational test

Human audit primary gồm đúng 60 output: 10 output ngẫu nhiên từ mỗi cell trong `3 subjects x 2 conditions (Base/FT)`. Hai người chấm mù độc lập; đóng băng weighted Cohen's kappa, exact agreement và mean absolute disagreement trước adjudication.

Tạo gói audit đã che condition/model:

```powershell
python scripts\sample_human_audit.py `
  --run results\english_p1.json `
  --run results\math_p1.json `
  --run results\history_p1.json `
  --audit-csv audit\blind_ratings.csv `
  --key-json audit\private_condition_key.json
```

Hai rater chấm độc lập trên hai bản sao của CSV; sau đó ghép thành một CSV có hai dòng cho mỗi `audit_id` và chạy:

```powershell
python scripts\analyze_human_audit.py `
  --ratings audit\ratings_two_raters.csv `
  --output audit\pre_adjudication_agreement.json
```

Chỉ mở `private_condition_key.json` và adjudicate sau khi file pre-adjudication đã đóng băng.

Operational test:

- Cold: 30 lần/condition qua ít nhất 3 session blocks; mỗi lần process/model chưa load.
- Warm: 30 lần/condition sau một warm-up.
- Sequential load: 30 cặp Base unload -> FT load nếu khả thi.

Evaluator ghi load time và warm metrics cho mỗi job. Để có 30 cold repetitions, cần chạy 30 job/process độc lập; không được coi 30 item trong một model load là 30 cold runs.

## 11. Nếu muốn nghiên cứu CoT/reasoning

Không trộn CoT vào primary Base–Fine-tuned run. Primary hiện khóa `enable_thinking=false` và chỉ so sánh output tutor nhìn thấy.

Nếu có đủ thời gian, tạo secondary ablation riêng:

- P1: Socratic prompt hiện tại, không yêu cầu hiện chain-of-thought;
- P2: cùng weights/item/output cap nhưng bật một reasoning setting đã khóa hoặc yêu cầu model lập kế hoạch sư phạm ngắn trước khi trả lời;
- so P2–P1 theo paired item cho K, S, failure, output length, E2E và chi phí;
- không yêu cầu các proprietary LLM tiết lộ hidden chain-of-thought; chỉ đánh giá final tutor response và metadata reasoning mà API chính thức cung cấp;
- kết luận là “inference/prompt effect”, không phải “fine-tuning effect”.

## 12. Điều kiện invalid run

Không đưa run vào bảng confirmatory nếu có một trong các lỗi:

- FT không xuất phát từ Base đã ghi;
- `evalMode` không phải paired;
- thiếu subject/item ID hoặc không đủ cặp;
- P1 nhưng prompt hash null/khác giữa Base và FT;
- decoding/output cap khác nhau;
- effective judge/model ID không khớp manifest;
- judge lỗi bị ghi thành điểm 0 (khác với model-generation failure đã pre-specify điểm 0);
- retry làm mất dấu first-attempt failure;
- held-out data đã được dùng để chọn model/prompt/hyperparameter.
