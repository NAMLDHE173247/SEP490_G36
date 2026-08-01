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
- K = B1 và S = mean(A1, A2, A3). Công thức weighted Overall A–B–C–D cũ đã ngừng dùng vì các hệ số không có nguồn hoặc validation độc lập đủ để bảo vệ.
- Diễn giải các năng lực sư phạm trong S:
  - A1: không tiết lộ đáp án thay cho học sinh;
  - A2: nhận ra học sinh đang hiểu/chưa hiểu hoặc mắc ngộ nhận, dẫn dắt từng bước và khơi gợi tư duy phản biện;
  - A3: cá nhân hóa và thích nghi lượng gợi ý, độ khó, cách giải thích theo phản hồi cụ thể của học sinh.
- Không cộng thêm bốn năng lực trên thành một công thức mới vì sẽ đếm trùng A2/A3 và phá khả năng so sánh với locked run. Khi cần phân tích sâu, báo cáo A2 và A3 riêng bên cạnh S.
- “Học sinh không hiểu bài” không phải nhãn phán xét học sinh. Rubric chỉ chấm xem tutor có suy ra đúng trạng thái hiểu bài từ bằng chứng trong lượt trả lời và điều chỉnh bước dẫn dắt tương ứng hay không; không có bằng chứng thì tutor phải hỏi kiểm tra thay vì tự kết luận.
- Human Audit được giao thành gói riêng theo từng project/evaluation. Một Staff đủ để tạo bản audit; tối thiểu hai Staff chỉ cần khi báo cáo inter-rater agreement (IAA), không phải điều kiện khóa. Mỗi gói phải có Checker được chỉ định và chỉ Checker đó được adjudicate conflict.

### Cách viết kết quả Base–Fine-tuned trong báo cáo

Không viết chung chung rằng “Fine-tuned tốt hơn Base”. Báo cáo K và S là hai outcome chính đã đăng ký trước; đồng thời trình bày A1–D1 là outcome phụ bắt buộc và D2/latency là outcome vận hành. Với từng chỉ số, ghi mean Base, mean Fine-tuned, chênh lệch paired `Delta = FT - Base`, CI95, effect size `dz` và Holm-adjusted p cho family A1–D1. Không diễn giải D2 như chất lượng sư phạm và không tạo một Overall mới sau khi nhìn kết quả.

Mẫu diễn giải:

> Trên cùng tập held-out và cùng cấu hình Judge, Fine-tuned đạt K = [FT_K] so với [BASE_K] của Base (Delta = [DELTA_K], CI95 [L, U]). Điểm Socratic S đạt [FT_S] so với [BASE_S] (Delta = [DELTA_S], CI95 [L, U]). Phân tích theo rubric cho thấy cải thiện rõ ở [các tiêu chí có CI95 không chứa 0], trong khi [các tiêu chí còn lại] chưa có khác biệt đủ rõ hoặc suy giảm. Các chỉ số vận hành được báo cáo riêng: E2E [FT] so với [BASE], TPOT [FT] so với [BASE], và failure rate [FT] so với [BASE]. Vì vậy, kết luận chỉ giới hạn ở các dimension có bằng chứng paired tương ứng, không dựa trên một weighted Overall.
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

### 3.1 Adaptive Socratic Diagnostic (tùy chọn)

P1/O1/E1 vẫn đánh giá năng lực dạy học Socratic nhưng dùng protocol riêng, không
thay thế A1–D2. Mỗi đơn vị phân tích là một cặp đối chứng gồm đúng hai item cùng
bài học nhưng có hai trạng thái học sinh khác nhau. Metadata đặt tại
`metadata.adaptive_socratic`:

```json
[
  {
    "item_id": "MATH-ADAPT-001-A",
    "subject": "MATH",
    "messages": [{"role": "user", "content": "Em nghĩ 1/3 lớn hơn 1/2 vì 3 lớn hơn 2."}],
    "metadata": {"adaptive_socratic": {
      "contrastive_pair_id": "MATH-ADAPT-001",
      "learner_state": "misconception",
      "misconception_key": "fraction-denominator-order",
      "expected_strategy": "Dùng biểu diễn trực quan để kiểm tra ngộ nhận về mẫu số."
    }}
  },
  {
    "item_id": "MATH-ADAPT-001-B",
    "subject": "MATH",
    "messages": [{"role": "user", "content": "Em nghĩ 1/2 lớn hơn 1/3 vì chia cùng một vật thành ít phần hơn."}],
    "metadata": {"adaptive_socratic": {
      "contrastive_pair_id": "MATH-ADAPT-001",
      "learner_state": "correct",
      "misconception_key": "fraction-denominator-order",
      "expected_strategy": "Xác nhận ngắn rồi yêu cầu áp dụng vào một cặp phân số mới."
    }}
  }
]
```

`learner_state` chỉ nhận `correct`, `partial`, `misconception`, hoặc `confused`.
Hai item trong cặp phải khác trạng thái, cùng subject và đều có
`misconception_key`, `expected_strategy`. P1 và E1 được chấm ở từng item rồi lấy
trung bình trong cặp; O1 chỉ chấm một lần trên cả cặp. Base–FT được bootstrap theo
cặp và hiệu chỉnh Holm riêng cho family P1/O1/E1. Module tính một composite minh
bạch `AS = (P1 + O1 + E1) / 3`. Đây là điểm tổng của riêng Adaptive Diagnostic,
không phải Overall toàn model và không được trộn tự động với K, S hoặc A1–D2.

Nếu dataset không khai báo metadata trên, Model Eval hiển thị “Dataset chưa khai
báo” và không tự suy diễn điểm cá nhân hóa từ A3. Nếu đã khai báo nhưng cặp không
hợp lệ, script validation và giao diện trả lỗi cụ thể.
File chạy thử: `docs/examples/adaptive_socratic_example.json`.

Mẫu viết báo cáo:

> Adaptive Socratic Diagnostic được phân tích riêng trên [N] cặp tình huống đối
> chứng. Fine-tuned đạt AS=[...] với P1=[...], O1=[...], E1=[...] so với Base lần lượt là
> [...]. Chênh lệch paired, CI95, effect size và Holm-adjusted p được báo cáo cho
> từng tiêu chí. AS là trung bình bằng nhau đã định nghĩa trước, không phải weighted
> Overall của toàn model.

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
- **H3:** so sánh specialist FT với đúng mô hình Version 1 đã fine-tune chung dữ liệu ba môn. Với từng môn, V1 phải chạy lại trên đúng 50 held-out item, cùng system prompt, output cap và Judge của specialist. Chỉ test khi V1 được khóa đủ repository/revision/tokenizer; nếu không ghi `not testable`.
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

## 8. Chọn đối chứng mở rộng như thế nào?

Panel mở rộng gồm đúng hai vai trò để tránh mở rộng scope:

1. một LLM lớn chạy qua OpenRouter;
2. mô hình Version 1 shared fine-tuned đã học chung dữ liệu Tiếng Anh, Toán và Lịch sử.

Model LLM lớn đã khóa cho các run RP5 hiện tại:

- `qwen/qwen-2.5-72b-instruct`.

Không dùng `google/gemini-2.5-flash` làm candidate vì model này đang là Judge. Nếu đổi target/judge, phải khóa lại trước held-out và giữ Judge độc lập với candidate khi có thể.

Không dùng alias kiểu `auto`, `latest` hoặc free router trong locked run. Tra cứu model hiện có và canonical slug ngay trước ngày chạy:

```powershell
Invoke-RestMethod https://openrouter.ai/api/v1/models | `
  Select-Object -ExpandProperty data | `
  Select-Object id, canonical_slug, context_length, pricing
```

Khóa canonical model ID, provider policy, output cap, seed/temperature/reasoning mode khi endpoint hỗ trợ và ngày chạy. Script tự đọc `supported_parameters`; không gửi tham số model không hỗ trợ và lưu rõ giá trị `null` thay vì giả vờ hai API có cùng cơ chế decoding. Nếu OpenRouter trả effective model khác requested model, đánh dấu run invalid hoặc exploratory. Models API và `usage` cung cấp model metadata, token count và pricing cần lưu: [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models).

## 9. Chạy LLM lớn và Version 1 shared reference

Trên giao diện Model Eval, mở **Đối chứng mở rộng**:

1. chọn LLM lớn nếu cần;
2. chọn Training Job của Version 1 shared fine-tuned — không chọn base gốc và không chọn lại specialist đang xem;
3. tải đúng locked-test ZIP/JSON đã dùng cho lần specialist Base–FT;
4. chạy và đọc bảng năm cột: Base gốc, Specialist FT, LLM lớn, Version 1 shared FT.

Backend từ chối file có hash khác. Version 1 được chạy local/GPU bằng Hugging Face repo trong Training History và dùng system prompt/Judge của evaluation specialist hiện tại. Vì vậy phải lặp quy trình này cho English, Math và History để trả lời câu hỏi “specialist có hơn V1 ở từng môn hay không”.

Nếu cần chạy LLM lớn bằng script thay vì giao diện:

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
