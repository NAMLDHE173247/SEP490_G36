# RP5 — Step-by-step experimental guide

## 0. Files used in the experiment

Do not rename or mix these files during the official run.

| Purpose | File |
|---|---|
| Pooled train + validation | `D:\Sep_G36\socratic_math_physics_v4_stratified_train_validation.zip` |
| Math train + validation | `D:\Sep_G36\socratic_math_v4_stratified_train_validation.zip` |
| Physics train + validation | `D:\Sep_G36\socratic_physics_v4_stratified_train_validation.zip` |
| Combined test (20) | `D:\Sep_G36\socratic_math_physics_v4_stratified_test.json` |
| Math test (10) | `D:\Sep_G36\socratic_math_physics_v4_stratified_math_test.json` |
| Physics test (10) | `D:\Sep_G36\socratic_math_physics_v4_stratified_physics_test.json` |
| Dataset audit | `D:\Sep_G36\socratic_math_physics_v4_stratified_audit.json` |

The current official results must be labelled **Pilot Run 0** because they were produced before validation-only early stopping was fixed.

## 1. Start the corrected GPU worker

1. Open `gpu_service_colab.ipynb` in Colab.
2. Upload `D:\Sep_G36\gpu-service.zip`; its Colab path must be `/content/gpu-service.zip`.
3. Run the installation cell.
4. Run the cell that starts `app.py`.
5. Keep that cell running. Do not close the browser tab or interrupt the cell.
6. Copy the public URL printed by the notebook.
7. Set `GPU_SERVICE_URL=<public URL>` in `backend/.env`.
8. Restart the Node backend.
9. Open `http://localhost:5173` and verify that GPU Worker is **Ready**.

Do not start training if GPU status returns 502 or 503.

## 2. Pilot Physics training

The pilot verifies the corrected pipeline before spending time on all official runs.

1. Open **AutoTrain**.
2. Select base model `Qwen/Qwen2.5-0.5B-Instruct`.
3. Select **Local Upload**.
4. Upload `D:\Sep_G36\socratic_physics_v4_stratified_train_validation.zip`.
5. Confirm column mapping is `messages`.
6. Set project name to `P2-fixed-pilot-s3407`.
7. Set a new Hugging Face repository, for example `anhdai312/physics-rp5-pilot-s3407`.
8. Do not select or resume any checkpoint.
9. Paste the frozen system prompt from section 3.
10. Enter the parameters from section 4.
11. Start training and open the progress panel.

The run is valid only if the log contains:

- `Using locked validation partition: 10 examples`
- `[SFT Mask] assistant_tokens=...`
- `Eval Loss (Overfit)` at evaluation intervals
- completion at 100%

The log must not contain:

- `Resuming from checkpoint`
- `Ngắt sớm: Training Loss`
- missing validation partition
- dataset column errors

If any invalid condition occurs, stop and do not evaluate that repository.

## 3. Frozen system prompt

```text
Bạn là gia sư Socratic môn học dành cho học sinh THCS và THPT Việt Nam.

Mỗi lượt phản hồi phải gồm hai phần tự nhiên:
1. Nhận xét ngắn và chính xác về ý mới nhất của học sinh.
2. Đặt đúng một câu hỏi gợi mở cụ thể để học sinh tự thực hiện bước tiếp theo.

Quy tắc bắt buộc:
- Không viết lời giải hoàn chỉnh.
- Không liệt kê hoặc đánh số các bước giải.
- Không tự đưa đáp án cuối trước khi học sinh nêu ra.
- Không chỉ trả lời chung chung như “Đúng”, “Tốt” hoặc “Chính xác”.
- Nếu học sinh sai, chỉ rõ khái niệm hoặc vị trí cần xem lại nhưng không làm thay.
- Nếu học sinh đúng, xác nhận chính xác nội dung vừa làm đúng rồi yêu cầu tính tiếp, giải thích hoặc tự kiểm tra.
- Luôn kế thừa lượt hội thoại mới nhất và phản hồi đúng nội dung học sinh vừa nói.
- Không lặp nguyên văn phản hồi trước.
- Không xin lỗi máy móc hoặc mở đầu liên tục bằng “Xin lỗi”.
- Không bịa công thức, định lý, dữ kiện hoặc lời nói của học sinh.
- Chỉ hỏi một câu trong mỗi lượt và câu hỏi phải liên quan trực tiếp đến bài toán hiện tại.
- Dùng tiếng Việt tự nhiên, ngắn gọn, tích cực và phù hợp trình độ học sinh.

Khi học sinh đã đưa ra đáp án đúng, không giải lại toàn bộ bài. Hãy xác nhận ngắn gọn và yêu cầu học sinh thay ngược, ước lượng, kiểm tra điều kiện hoặc giải thích vì sao kết quả hợp lý.
```

Use the same prompt for all three training configurations. Only the project/repository name and dataset file may change.

## 4. Frozen training parameters

| Parameter | Value |
|---|---:|
| Epochs | 3 |
| Batch Size | 1 |
| Learning Rate | 0.0002 |
| Block Size | 1024 |
| Max Length | 1024 |
| Gradient Accumulation | 4 |
| Warmup Steps | 5 |
| Weight Decay | 0.01 |
| Optimizer | adamw_8bit |
| LR Scheduler | linear |
| LoRA Rank | 16 |
| LoRA Alpha | 32 |
| LoRA Dropout | 0 |
| Random Seed | 3407 for pilot |

## 5. Pilot Physics evaluation

1. Open **Model Eval**.
2. Click **New evaluation**.
3. Select `P2-fixed-pilot-s3407`.
4. Select the fixed Gemini Judge `google/gemini-2.5-flash`.
5. Upload `D:\Sep_G36\socratic_math_physics_v4_stratified_physics_test.json`.
6. Use the complete conversation replay mode.
7. Confirm that the test contains 10 conversations.
8. Start evaluation and wait until status is `COMPLETED`.
9. Record Overall, A/B/C/D, latency, token count, Judge confidence and all flags.
10. Open at least three low-scoring conversations and record their error categories.

For an apples-to-apples comparison, evaluate the pooled repository on the same Physics test file. Do not compare a 10-conversation Physics run directly with a 20-conversation combined run.

Pilot decision:

- If the corrected P2 score improves and replay outputs are coherent, proceed to official runs.
- If the score remains below the pooled model on the same Physics test, retain the result and report that Physics specialization is not supported.

## 6. Official main experiments

Run the following for seeds `3407`, `42`, and `2026`. Every run must use a new repository and must not resume a checkpoint.

| Configuration | Train file | Test file |
|---|---|---|
| Pooled | combined train/validation ZIP | combined test (20) |
| Math specialist | Math train/validation ZIP | Math test (10) |
| Physics specialist | Physics train/validation ZIP | Physics test (10) |

Recommended names:

- `pooled-rp5-s3407`, `math-rp5-s3407`, `physics-rp5-s3407`
- repeat with `s42` and `s2026`

For each seed calculate:

```text
Specialist Macro = (Math Overall + Physics Overall) / 2
Delta Specialist = Specialist Macro - Pooled Overall
```

Report mean and standard deviation across the three seeds.

## 7. Router experiment

1. Keep the test subject labels hidden from the router input.
2. Route the 20 combined test conversations using the Hybrid Router.
3. Record the selected model and expected subject for every conversation.
4. Calculate router accuracy, Math/Physics precision, recall, macro-F1 and confusion matrix.
5. Replay each conversation with the selected specialist and calculate the end-to-end Hybrid score.
6. Compare Hybrid against Oracle Specialists and Pooled.

```text
Oracle Specialists = correct specialist selected from the known test subject
Hybrid = model selected by the actual router
Router penalty = Hybrid Overall - Oracle Specialists Overall
```

The current `verified-subject-direct` evaluation is the Oracle condition, not the Hybrid Router condition.

## 8. Data-volume ablation

Create a balanced pooled subset containing 40 Math and 40 Physics training conversations. Train it with the same settings and compare:

- Pooled-160
- Pooled-80 balanced
- Math-80
- Physics-80

Interpretation:

- If Pooled-160 wins but Pooled-80 does not, the main advantage is data volume/training steps.
- If Pooled-80 still wins, cross-domain transfer is the stronger explanation.

This is an exploratory ablation and must be labelled separately from the pre-defined primary hypothesis.

## 9. RP5 result tables

Create these tables:

1. Dataset split and token statistics.
2. Training configuration and convergence (train/eval loss).
3. Overall and A/B/C/D by model and subject.
4. Three-seed mean ± standard deviation.
5. Pooled versus Oracle Specialists versus Hybrid Router.
6. Router confusion matrix and macro-F1.
7. Latency p50/p95 and token usage.
8. Error categories and representative replay examples.
9. Pooled-160 versus Pooled-80 ablation.

## 10. Final hypothesis wording

Do not alter the original directional hypothesis after observing the pilot.

If specialists remain below Pooled:

> The results do not support the hypothesis that subject-specialized SLMs with Hybrid routing outperform pooled fine-tuning under the tested Qwen 0.5B and 80-sample-per-domain setting. Math specialization showed a small domain benefit, whereas Physics specialization degraded substantially. The pooled model benefited from greater per-model data diversity and cross-domain transfer.

If specialists win after the corrected controlled reruns, report the effect size and confidence interval rather than claiming success from a single score.
