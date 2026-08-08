# Fine-tuning — Mô hình nền & các cờ cấu hình (chi tiết)

> Tài liệu này giải thích **thật kỹ** những gì bạn chọn khi chạy AutoTrain:
> model nền nào phù hợp bài toán nào, mỗi cờ (flag / hyperparameter) nghĩa là gì,
> giá trị mặc định / biên hợp lệ, và khi nào nên đổi.
>
> Đọc kèm: [HUONG_DAN_HE_THONG.md](./HUONG_DAN_HE_THONG.md) (tổng quan hệ thống),
> [HAPPY_CASE.md](./HAPPY_CASE.md) (luồng nghiệp vụ).

---

## 1. Hệ thống đang fine-tune kiểu gì?

AutoTrain dùng **QLoRA + SFT (Supervised Fine-Tuning)** qua Unsloth trên GPU:

| Thành phần | Ý nghĩa |
|---|---|
| **SFT** | Học có giám sát từ hội thoại mẫu: “học sinh nói X → gia sư nên nói Y” |
| **LoRA** | Không train lại toàn bộ model; chỉ học các “miếng vá” nhỏ gắn vào một số lớp |
| **QLoRA** | Model nền nạp **4-bit** để tiết kiệm VRAM; adapter LoRA vẫn học bình thường |
| **Assistant-only loss** | Chỉ tính loss trên lượt **assistant** (gia sư), không bắt model học thuộc lời học sinh |

**Không phải** full fine-tune, không phải RLHF/DPO trong luồng AutoTrain hiện tại.

Đầu ra điển hình: adapter LoRA (nhẹ) đẩy lên Hugging Face Hub nếu bật `push_to_hub`, rồi đăng ký vào Model Registry để chat.

---

## 2. Chọn model nền — bảng tra cứu

Quy tắc vàng:

1. Chọn **bản Instruct / Chat / `-it`**, không chọn bản base thuần (base thường không có chat template).
2. Ưu tiên bản đã có sẵn trên Unsloth (`unsloth/...-bnb-4bit`) để khớp image GPU.
3. **Cùng model family** lúc train và lúc serve → cùng chat template.
4. Dataset tiếng Việt + Socratic: Qwen / Vistral / Llama thường ổn; Gemma 4 cần Unsloth đủ mới.

### 2.1 Theo môn / mục đích (như trên UI AutoTrain)

#### Lịch sử & KHXH

| Model ID (HF) | Kích thước | Khi nào chọn | Ghi chú |
|---|---|---|---|
| `Viet-Mistral/Vistral-7B-Chat` | 7B | Muốn bản Vistral chính thức tiếng Việt | Cần quyền HF + `HF_TOKEN` |
| `minhtt/vistral-7b-chat` | 7B | Muốn Vistral dùng ngay, không chờ grant | Mirror công khai |
| `unsloth/phi-4-bnb-4bit` | ~14B | Argument mining / hội thoại phân tích sâu | Nặng VRAM hơn 7B |
| `unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit` | 8B | Tư duy phản biện, Socratic tiếng Anh–Việt | Template Llama-3 |
| `unsloth/Qwen2.5-14B-Instruct-bnb-4bit` | 14B | Cần context dài, chất lượng cao hơn 7B | Tốn VRAM rõ |
| `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` | 7B | **Mặc định an toàn** — cân bằng tốc độ & chất lượng | Template kiểu ChatML/Qwen |

#### Tiếng Anh

| Model ID | Kích thước | Khi nào chọn | VRAM gợi ý (QLoRA) |
|---|---|---|---|
| `unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit` | 8B | Tutor Anh chuẩn, ngữ pháp | Trung bình |
| `unsloth/Llama-3.2-3B-Instruct-bnb-4bit` | 3B | GPU nhỏ, prototype nhanh | Thấp |
| `unsloth/Llama-3.2-1B-Instruct-bnb-4bit` | 1B | Edge / thử đường ống | Rất thấp — chất lượng hạn chế |
| `google/gemma-3-4b-it` | 4B | Tham chiếu SocraticBench | Cần bản `-it` |
| `unsloth/gemma-4-E2B-it` | E2B | Gemma 4 nhẹ nhất | ~8–10 GB |
| `unsloth/gemma-4-E4B-it` | E4B | **Gemma 4 khuyến nghị** cho text SFT | ~10–17 GB |
| `unsloth/gemma-4-31B-it` | 31B | Chất lượng cao, GPU lớn | ~22 GB+ QLoRA |
| `unsloth/Mistral-Small-24B-Instruct-2501-bnb-4bit` | 24B | Hội thoại dài, tinh tế | Cao |
| `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` | 7B | Chẩn đoán ngữ pháp Anh | Trung bình |

#### Toán

| Model ID | Khi nào chọn |
|---|---|
| `unsloth/Qwen2.5-Math-7B-Instruct-bnb-4bit` | Chuyên giải / giải thích toán |
| `unsloth/DeepSeek-R1-Distill-Qwen-7B-unsloth-bnb-4bit` | Reasoning dài; cần tắt/lọc `<think>` lúc serve (hệ thống đã có filter) |

### 2.2 Chat template theo họ model (rất quan trọng)

Model học **chuỗi định dạng**, không chỉ nội dung. Train sai template → chat kém dù loss đẹp.

| Họ model | Template Unsloth / hành vi hệ thống | Có phải ChatML? |
|---|---|---|
| Qwen 2.5 | Native hoặc `qwen-2.5` | Gần ChatML (`<\|im_start\|>`) |
| Llama 3.x | Native hoặc `llama-3` | **Không** |
| Gemma 2 | `gemma` | **Không** (`<start_of_turn>`) |
| Gemma 3 | `gemma3` (hoặc native) | **Không** |
| **Gemma 4 nhỏ** (E2B/E4B/12B) | **Ép** `gemma-4` (Unsloth) | **Không** |
| **Gemma 4 lớn** (26B/31B/A4B) | **Ép** `gemma-4-thinking` | **Không** |
| Phi-4 | Native hoặc `phi-4` | **Không** |
| Mistral / Vistral | Native hoặc `mistral` | Thường không phải ChatML thuần |

**Gemma 4** (theo [notebook Unsloth 31B](https://www.kaggle.com/code/danielhanchen/gemma4-31b-unsloth)):

- Không dùng ChatML, không dùng template Gemma 2 cũ.
- Hệ thống **luôn** gọi `get_chat_template` Unsloth cho Gemma 4.
- Cờ UI/API **`enable_thinking` / Train Thinking** (mặc định **tắt**):
  - `false`: format với `enable_thinking=False` — phù hợp gia sư Socratic.
  - `true`: format với `enable_thinking=True`; Gemma 4 nhỏ cũng chuyển sang template `gemma-4-thinking`. Nên có ≥75% mẫu chứa reasoning (`<think>`, `<|channel>thought`, …) — pipeline sẽ cảnh báo nếu thấp hơn.
- Bản lớn (26B/31B) luôn dùng template `gemma-4-thinking` (cấu trúc model), dù cờ think tắt hay bật.
- **Chat/serve** vẫn lọc khối think khi stream (không tự bật thinking lúc inference).

### 2.2.1 Model lạ (Custom HF ID) — chọn template thế nào?

Khi chọn model **ngoài danh sách** (dropdown → `🤗 Custom HuggingFace Model ID...`),
phần Advanced hiện thêm ô **“Model lạ — định dạng hội thoại”**. Quy trình:

1. **Luôn để `Tự động` trước.** Hệ thống ưu tiên template native của tokenizer,
   thiếu mới gắn template Unsloth theo họ model.
2. Train xong (hoặc đang chạy) → **Lịch sử Huấn luyện** → mở job → **Audit & Logs**
   → tìm dòng `[ChatTemplate]`:
   - `applied=native` hoặc `applied=<tên họ>` → **ổn, không cần làm gì**.
   - `mode=failed` hoặc cảnh báo ⚠️ → mới cần can thiệp (bước 3/4).
3. **Biết model thuộc họ nào** (đọc model card HF: “fine-tuned from Qwen2.5…”)
   → chọn đúng mục “Đây là họ Qwen / Llama 3 / …” rồi train lại.
4. **Có chuỗi template từ người tạo model** → chọn **“Dán template thủ công…”**
   và paste chuỗi Jinja vào ô textarea. Lấy chuỗi này ở: repo HF → tab **Files**
   → `tokenizer_config.json` → copy giá trị field `chat_template`
   (chuỗi chứa `{{` / `{%`). Log sẽ hiện `mode=jinja_override applied=jinja`.

**Không đoán bừa họ model theo tên tự đặt.** Nếu không biết base model và auto
fail, hỏi người tạo model trước khi train tiếp.

Các giá trị `mode` trong log `[ChatTemplate]`:

| `mode` | Ý nghĩa |
|---|---|
| `native` | Dùng template sẵn trong tokenizer — bình thường nhất |
| `unsloth` | Tokenizer thiếu template → hệ thống gắn theo họ model |
| `unsloth_override` | Bạn ép template qua dropdown |
| `jinja_override` | Bạn dán template thủ công |
| `native_override` | Bạn chọn “Giữ template gốc” (bỏ qua ép Gemma 4) |
| `native_fallback` | Ép Unsloth lỗi → lui về native (xem `error` kèm theo) |
| `failed` | Không có template nào áp được — **phải xử lý** trước khi tin kết quả |

### 2.3 Gợi ý chọn nhanh

| Tình huống | Chọn |
|---|---|
| Mới bắt đầu, dataset Việt, GPU ~16–24GB | `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` |
| Tutor Anh, GPU vừa | Llama 3.1 8B hoặc Llama 3.2 3B |
| Muốn thử Gemma 4 | `unsloth/gemma-4-E4B-it` trước; 31B khi VRAM ≥ ~22GB |
| Toán | Qwen2.5-Math-7B hoặc DeepSeek-R1-Distill-Qwen-7B |
| Dataset < 50 mẫu | Model ≤ 8B + preset Standard / để AutoTune hạ rank |

---

## 3. Các cờ / tham số — từ điển đầy đủ

Tên bên trái là **tên gửi API / GPU service** (snake_case). UI có thể dùng camelCase tương đương.

### 3.0 Request body `POST /api/train/start` — từ điển key backend nhận

Frontend gửi **multipart/form-data** (mọi giá trị là string, backend tự parse).
Đây là toàn bộ key backend đọc từ `req.body`, khớp 1-1 với destructuring trong
`backend/src/controllers/trainController.ts` (hàm `startTraining`).

#### Nhóm A — Model & nguồn dữ liệu

| Key | Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| `model_name` | string, **bắt buộc** | `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` | HF id model nền sẽ fine-tune |
| `file` (multipart) | file | `dataset.json` / `.jsonl` / `.csv` / `.zip` | Dataset upload trực tiếp. ZIP có thể kèm metadata + validation set |
| `dataset` | string | `team/vi-socratic-math` | HF Hub **dataset** id — chỉ dùng khi **không** upload `file` |
| `cloudLoadedDataset` | string | `/app/uploads/cloud/abc.json` | Path file backend đã tải sẵn từ object storage (luồng "Load from cloud") |

Ưu tiên: `file` > `cloudLoadedDataset` > `dataset`. Gửi cả ba thì file thắng.

#### Nhóm B — Tham số học (optimizer / schedule)

| Key | Kiểu | Mặc định backend | Ví dụ | Ý nghĩa |
|---|---|---|---|---|
| `epochs` | int | — (bắt buộc hợp lệ) | `3` | Số lần quét hết dataset |
| `batchSize` | int | `1` | `2` | Mẫu / bước / GPU |
| `learningRate` | float | `2e-4` | `0.00005` | Tốc độ học. LoRA khuyến nghị 2e-5–5e-5 |
| `blockSize` | int | `512` | `1024` | Số token tối đa một mẫu khi train |
| `modelMaxLength` | int | `2048` | `1024` | Max seq length nạp model |
| `gradient_accumulation_steps` | int | `4` | `4` | Batch hiệu dụng = batchSize × số này |
| `warmup_steps` | int | `5` | `10` | Số bước LR tăng dần từ 0 |
| `optim` | string | `adamw_8bit` | `adamw_8bit` | Xem mục 3.6 danh sách hợp lệ |
| `weight_decay` | float | `0.01` | `0.01` | Regularization |
| `lr_scheduler_type` | string | `linear` | `cosine` | Xem mục 3.6 |
| `seed` / `random_state` | int | `3407` | `3407` | Seed tái lập. UI gửi cùng giá trị cho cả hai |

#### Nhóm C — LoRA

| Key | Kiểu | Mặc định | Ví dụ | Ý nghĩa |
|---|---|---|---|---|
| `r` | int | `16` | `16` | Rank LoRA — to hơn = học nhiều hơn, dễ overfit dataset nhỏ |
| `lora_alpha` | int | `16` | `32` | Hệ số scale, thường = 2×r |
| `lora_dropout` | float | `0` | `0.05` | Dropout trên nhánh LoRA |
| `lora_target_modules` | string | preset gpu-service | `all-linear` hoặc `q_proj,k_proj,v_proj` | Preset (`attention`, `all-linear`) hoặc danh sách module cách nhau dấu phẩy |
| `use_rslora` | bool-string | `false` | `"true"` | Rank-stabilized LoRA |

#### Nhóm D — Chất lượng / chống overfit (tuỳ chọn)

**Chỉ gửi khi người dùng đặt rõ** — bỏ trống để gpu-service tự áp mặc định đã
hiệu chỉnh (backend cố tình không điền default cho nhóm này).

| Key | Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| `early_stopping_loss` | float | `0.3` | Dừng khi train loss < ngưỡng. Không gửi = tắt |
| `early_stopping_patience` | int | `3` | Số lần eval không cải thiện thì dừng |
| `early_stopping_min_delta` | float | `0.01` | Cải thiện tối thiểu để tính là "tốt hơn" |
| `neftune_noise_alpha` | float | `5` | Nhiễu embedding NEFTune. UI chỉ gửi khi > 0 |
| `max_grad_norm` | float | `1` | Ngưỡng clip gradient |
| `warmup_ratio` | float | `0.03` | Warmup theo tỉ lệ tổng bước. UI chỉ gửi khi > 0 |
| `group_by_length` | bool-string | `"false"` | Gom mẫu cùng độ dài, giảm padding |
| `eval_steps` | int | `50` | Bước giữa 2 lần validate. Trống = tự suy (~8 điểm/run) |
| `save_steps` | int | `50` | Bước lưu checkpoint. Trống = bằng `eval_steps` |
| `dataloader_num_workers` | int | `2` | Worker nạp data. Trống = 0 |
| `auto_tune` | bool-string | `"false"` | `false` = khóa AutoTune, giữ nguyên mọi knob tay. Không gửi = bật |
| `enable_thinking` | bool-string | `"false"` | Train khối reasoning/think — xem mục 2.2 |
| `chat_template` | string | `auto` / `paste` / `qwen-2.5` | Override định dạng hội thoại — xem mục 2.2.1 |
| `chat_template_jinja` | string | `{% for message in messages %}...` | Chuỗi Jinja dán tay, đi kèm `chat_template=paste`. Backend cắt tối đa 200KB |

#### Nhóm E — Hugging Face Hub

| Key | Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| `push_to_hub` | bool-string | `"true"` | Đẩy adapter lên HF Hub sau train |
| `hf_repo_id` | string | `team/socratic-tutor-v1` | Repo đích (bắt buộc khi push) |
| `hf_token` | string | `hf_xxx...` | Token HF — cần khi model gated hoặc push |

#### Nhóm F — Metadata (chỉ lưu `TrainingHistory`, không đổi hành vi train)

| Key | Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| `projectName` | string | `socratic-math-tutor-v2` | Tên hiển thị trên UI Lịch sử |
| `datasetSource` | string | `local` / `hub` / `cloud` | Nguồn dataset — để UI hiển thị đúng |
| `columnMapping` / `column_mapping` | string | `messages` | Cột chứa hội thoại. Nhận cả 2 dạng; ZIP metadata có thể ghi đè |
| `systemPrompt` | string | `Bạn là gia sư Socratic...` | Persona — **được gửi xuống GPU** để train đúng prompt lúc serve |
| `systemPromptVersion` | string | `Math-Socratic-V2` | Truy vết phiên bản prompt |
| `totalTokens` | int | `48210` | Ước tính token của dataset (frontend đếm sẵn) |
| `totalRecords` | int | `120` | Số mẫu của dataset |

(`systemPrompt` nằm nhóm này vì frontend gửi camelCase, nhưng nó **có** ảnh
hưởng train — backend đổi tên thành `system_prompt` khi forward xuống GPU.)

#### Nhóm G — Chống double-submit

| Key | Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| `clientTrainingKey` / `idempotencyKey` | string | `uuid-v4-do-client-tao` | Client tạo 1 key cho mỗi lần bấm Start. Nếu đã có job **đang chạy** cùng key + cùng user → backend trả lại job cũ thay vì tạo job trùng |

#### Ví dụ request hoàn chỉnh

```bash
curl -X POST https://<backend>/api/train/start \
  -H "Authorization: Bearer <JWT>" \
  -F "file=@socratic_math.json" \
  -F "model_name=unsloth/Qwen2.5-7B-Instruct-bnb-4bit" \
  -F "epochs=3" -F "batchSize=1" -F "learningRate=0.00005" \
  -F "blockSize=1024" -F "modelMaxLength=1024" \
  -F "r=16" -F "lora_alpha=32" -F "lora_dropout=0.05" \
  -F "gradient_accumulation_steps=4" -F "warmup_steps=5" \
  -F "weight_decay=0.01" -F "seed=3407" -F "random_state=3407" \
  -F "optim=adamw_8bit" -F "lr_scheduler_type=cosine" \
  -F "lora_target_modules=all-linear" -F "use_rslora=false" \
  -F "neftune_noise_alpha=5" -F "warmup_ratio=0.03" \
  -F "group_by_length=false" -F "enable_thinking=false" \
  -F "early_stopping_patience=3" -F "max_grad_norm=1" \
  -F "push_to_hub=true" -F "hf_repo_id=team/socratic-tutor-v1" -F "hf_token=hf_xxx" \
  -F "projectName=socratic-math-tutor-v2" \
  -F "datasetSource=local" -F "columnMapping=messages" \
  -F "systemPrompt=Bạn là gia sư Toán theo phương pháp Socratic..." \
  -F "systemPromptVersion=Math-Socratic-V2" \
  -F "totalRecords=120" -F "totalTokens=48210" \
  -F "clientTrainingKey=550e8400-e29b-41d4-a716-446655440000"
```

Model lạ cần dán template thủ công thì thêm:

```bash
  -F "chat_template=paste" \
  -F "chat_template_jinja={% for message in messages %}...{% endfor %}"
```

### 3.1 Nhóm bắt buộc / nhận diện job

| Cờ | Kiểu | Mặc định | Bắt buộc? | Ý nghĩa |
|---|---|---|---|---|
| `job_id` | string | (client tạo) | Có | ID job duy nhất |
| `model_name` | string | `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` | Có | Model nền HF |
| `system_prompt` | string | prompt Socratic mặc định nếu trống | Nên có | Persona gia sư — **phải khớp** lúc eval/serve |
| `system_prompt_version` | string | hash tự sinh | Nên có | Truy vết phiên bản prompt |
| `column_mapping` / `columnMapping` | string | `messages` / `text` | Nên có | Cột chứa thoại trong dataset |
| `dataset_hf_id` | string | — | Nếu không upload file | Dataset trên HF Hub |
| `hf_token` | string | env `HF_TOKEN` | Khi model gated / push Hub | Token Hugging Face |
| `push_to_hub` | bool | `false` | Không | Đẩy adapter lên HF sau train |
| `hf_repo_id` | string | — | Nếu push | `username/repo` hoặc tên repo ngắn |

### 3.2 Nhóm học (optimizer schedule)

| Cờ | UI | Mặc định | Biên | Ý nghĩa & khi nào đổi |
|---|---|---|---|---|
| `epochs` | Epochs | `3` | 1–100 | Số lần đọc hết dataset. Dataset nhỏ: 2–3; lớn: 1–3. AutoTune có thể hạ xuống ≤3 hoặc ≤4 |
| `learningRate` | Learning Rate | `2e-4` (GPU) / UI Standard `5e-5` | `1e-7`–`1e-2` | Bước cập nhật. Cao → loss loạn; thấp → không học. LoRA thường `5e-5`–`2e-4` |
| `batchSize` | Batch Size | `2` | 1–64 | Số mẫu / bước trên 1 GPU. Hết VRAM → giảm về 1 |
| `gradient_accumulation_steps` | Grad Accumulation | `4` | 1–128 | Cộng dồn gradient. **Batch hiệu dụng = batchSize × grad_accum** |
| `modelMaxLength` | Max Length | `2048` (GPU) / UI `1024` | 128–32768 | Cắt hội thoại dài hơn. >20% mẫu bị cắt → tăng giá trị hoặc rút dữ liệu |
| `warmup_steps` | Warmup Steps | `5` | 0–10000 | LR tăng dần từ 0. Dùng khi `warmup_ratio = 0` |
| `warmup_ratio` | Warmup Ratio | `0` | 0–0.5 | LR warmup theo **tỉ lệ** tổng step (ổn định hơn khi đổi cỡ data). >0 thì **bỏ** `warmup_steps` |
| `lr_scheduler_type` | LR Scheduler | `cosine` | xem mục 3.6 | Cách LR giảm theo thời gian |
| `optim` | Optimizer | `adamw_8bit` | xem mục 3.6 | Thuật toán cập nhật trọng số |
| `weight_decay` | Weight Decay | `0.01` | 0–1 | Chống overfit nhẹ. `0` = tắt |
| `max_grad_norm` | Max Grad Norm | `1.0` | 0–100 | Clip gradient; tránh 1 batch “nổ” loss |
| `seed` / `random_state` | Seed | `3407` | ≥0 | Tái lập thí nghiệm |

### 3.3 Nhóm LoRA

| Cờ | UI | Mặc định | Biên | Ý nghĩa & khi nào đổi |
|---|---|---|---|---|
| `r` | LoRA Rank | `16` | 1–256 | Dung lượng adapter. Cao = học chi tiết hơn, dễ overfit khi data ít. AutoTune: `<30` mẫu → ≤8; `<100` → ≤16 |
| `lora_alpha` | LoRA Alpha | `32` | 1–512 | Scale ảnh hưởng LoRA. Quy tắc: **≈ 2×r**. Hệ thống cảnh báo nếu alpha \< r |
| `lora_dropout` | LoRA Dropout | `0.05` | 0–0.5 | Tắt ngẫu nhiên một phần adapter. Data nhỏ: giữ ≥0.05 |
| `lora_target_modules` | LoRA Targets | `all-linear` | preset hoặc list | Xem bảng dưới |
| `use_rslora` | rsLoRA | tự `true` nếu r≥32 | bool | Rank-Stabilized LoRA — ổn định khi rank cao |

**Preset `lora_target_modules`:**

| Giá trị | Module | Khi nào |
|---|---|---|
| `all-linear` | q,k,v,o + gate,up,down | **Mặc định — chất lượng tốt nhất** |
| `attention` | chỉ q,k,v,o | Data rất nhỏ / VRAM chặt |
| `mlp` | chỉ MLP | Ít dùng đơn lẻ |
| `q_proj,v_proj,...` | list tùy chỉnh | Nâng cao |

### 3.4 Nhóm chất lượng / chống overfit

| Cờ | UI | Mặc định | Ý nghĩa |
|---|---|---|---|
| `neftune_noise_alpha` | NEFTune Alpha | `0` (tắt); Standard/HQ preset = `5` | Nhiễu embedding lúc train — thường giúp instruction-following. `5` theo paper |
| `early_stopping_patience` | Early Stop Patience | `3` | Số lần eval liên tiếp **không** cải thiện eval_loss thì dừng. AutoTune có thể hạ còn 2 nếu data \<30 |
| `early_stopping_min_delta` | (API) | `0` | Cải thiện tối thiểu để tính là “tốt hơn” |
| `early_stopping_loss` | (API) | **tắt** (`null`) | Ngưỡng loss tuyệt đối — **chỉ bật khi bạn tự set** (không còn mặc định 0.5) |
| `eval_steps` | Eval Steps | tự suy (~8 điểm / run) | Để trống = tốt nhất. Số bước giữa 2 lần validate |
| `save_steps` | (API) | = `eval_steps` (bội số) | Lưu checkpoint; HF yêu cầu bội của `eval_steps` khi `load_best_model_at_end` |
| `save_total_limit` | (API) | `2` | Giữ tối đa N checkpoint local |
| `group_by_length` | Group By Length | `false` | Gom mẫu dài gần bằng nhau → ít padding. Tắt khi so sánh nhiều run (đổi thứ tự batch) |
| `enable_thinking` | Train Thinking | `false` | Bật format reasoning/think (Gemma 4 / Qwen3). **Tắt** cho tutor Socratic. Khi bật: Gemma 4 nhỏ chuyển sang template `gemma-4-thinking`; log cảnh báo nếu \<75% mẫu có dấu hiệu think. Chat/serve vẫn lọc `<think>` mặc định |
| `chat_template` | Model lạ → định dạng hội thoại | `auto` | Override cách đóng gói hội thoại: `auto` (khuyến nghị), `native`, `paste`, hoặc tên template Unsloth (`qwen-2.5`, `llama-3`, `gemma-4`, `gemma-4-thinking`, `gemma3`, `mistral`, `phi-4`, `chatml`). UI chỉ hiện khi dùng Custom HF model — xem mục 2.2.1 |
| `chat_template_jinja` | Dán template thủ công | — | Chuỗi Jinja dán tay (copy từ `tokenizer_config.json` của model). Gửi kèm `chat_template=paste`. Ưu tiên cao nhất, thắng cả rule ép Gemma 4 |
| `auto_tune` | (API, mặc định true) | `true` | Tự dưới rank/epochs khi dataset nhỏ. Gửi `false` để khóa mọi knob tay |
| `gradient_checkpointing` | (API) | `true` | Đổi VRAM lấy thời gian; Unsloth dùng `"unsloth"` |
| `dataloader_num_workers` | (API) | `0` | Worker nạp data. Giữ 0 cho ổn định; thử 2–4 trên GPU Linux nếu chắc chắn |
| `logging_steps` | (API) | `1` | Log loss mỗi N bước |

### 3.5 Nhóm resume / checkpoint

| Cờ | Ý nghĩa |
|---|---|
| `checkpoint_source` | `"worker"` = resume từ disk GPU; `"hf"` = từ Hub |
| `checkpoint_hf_repo` | Repo chứa `last-checkpoint` |
| `checkpoint_file_id` | ID file (legacy / drive) nếu có |

Không gửi các field này khi **train mới** — nếu không, job có thể resume nhầm checkpoint cũ.

### 3.6 Optimizer & scheduler hợp lệ

**`optim`:** `adamw_8bit` (khuyến nghị), `paged_adamw_8bit`, `adamw_torch`, `adamw_torch_fused`, `adafactor`, `sgd`.

**`lr_scheduler_type`:** `linear`, `cosine` (khuyến nghị), `cosine_with_restarts`, `polynomial`, `constant`, `constant_with_warmup`.

Giá trị lạ → hệ thống thay bằng mặc định và ghi warning trong log job.

---

## 4. Ba preset trên UI

| Preset | Mục đích | Điểm khác biệt chính |
|---|---|---|
| **Quick Training (~5 min)** | Smoke test đường ống | 1 epoch, r=4, attention-only, LR cao, NEFTune tắt |
| **Standard (Recommended)** | Hầu hết production nhỏ–vừa | 3 epoch, r=16, all-linear, cosine, NEFTune=5, warmup_ratio=0.03 |
| **High Quality (~45 min)** | Chất lượng tối đa khi data đủ | 5 epoch, r=32, rsLoRA bật, NEFTune=5, patience=4 |

Preset **không thay thế** AutoTune: nếu data quá nhỏ, GPU service vẫn có thể hạ `r` / `epochs` trừ khi `auto_tune=false`.

---

## 5. AutoTune theo số mẫu train (sau khi lọc dữ liệu)

| Số mẫu sau filter | Hệ thống tự làm (nếu `auto_tune=true`) |
|---|---|
| \< 30 | `epochs ≤ 3`, `r ≤ 8`, `lora_dropout ≥ 0.05`, `early_stopping_patience ≤ 2` |
| 30–99 | `epochs ≤ 4`, `r ≤ 16` |
| ≥ 100 | Giữ nguyên config người dùng |

Mọi thay đổi hiện trong log: `[AutoTune] r 32→16 vì chỉ có 42 mẫu`.

---

## 6. Cổng dữ liệu & báo cáo trước khi train (không phải “cờ UI” nhưng bắt buộc hiểu)

Trước `trainer.train()`, pipeline tự:

1. **Lọc mẫu bẩn** — thiếu user/assistant, assistant \< 8 ký tự, trùng hash → drop + đếm lý do.
2. **Chat template** — theo họ model (mục 2.2).
3. **Preflight mask** — thử mask assistant trên 8 mẫu; fail → fallback full-LM + cảnh báo.
4. **Length report** — nếu \>20% mẫu dài hơn `modelMaxLength` → cảnh báo truncation.
5. Ghi `effective_config` (lora, schedule, `data_report`, `chat_template`) vào trạng thái job.

Nếu sau lọc còn **0 mẫu** → job **ERROR** ngay, không train.

---

## 7. Biến môi trường liên quan fine-tune

| Biến | Ai đọc | Ý nghĩa |
|---|---|---|
| `HF_TOKEN` | GPU (+ có thể gửi từ request) | Tải model gated, push Hub |
| `GPU_SERVICE_URL` | Backend | Địa chỉ worker train |
| `GPU_SERVICE_TOKEN` | Backend + GPU | Header `X-GPU-Token` |
| `GPU_MEMORY_FRACTION` | GPU | Giới hạn % VRAM process (vd `0.2`) |
| `STORAGE_*` | Backend | Lưu dataset bền vững (MinIO/CDN) |
| `ANTHROPIC_API_KEY` / OpenRouter keys | Eval (không phải train) | LLM judge sau khi train |

---

## 8. Checklist trước khi bấm Start

1. Dataset ≥ ~50 hội thoại Socratic sạch; đã có validation khoá nếu muốn so sánh công bằng.
2. `system_prompt` đã set và **sẽ dùng lại** lúc eval/chat.
3. `model_name` là bản `-it` / Instruct; Gemma 4 dùng id Unsloth.
4. Chọn preset Standard trừ khi đang smoke-test.
5. Kiểm tra VRAM vs kích thước model (đặc biệt Gemma 4 31B / Qwen 14B / Mistral 24B).
6. Có `HF_TOKEN` nếu model gated hoặc cần push Hub.
7. Sau khi chạy: đọc log `[ChatTemplate]`, `[DataQuality]`, `[AutoTune]`, `[Length]`, `[SFT Mask]`.
8. Theo dõi **eval_loss**, không chỉ train loss.

---

## 9. Ví dụ cấu hình JSON gửi GPU (rút gọn)

```json
{
  "job_id": "job-2026-demo-01",
  "model_name": "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
  "system_prompt": "Bạn là gia sư Socratic...",
  "system_prompt_version": "socratic-v3",
  "column_mapping": "messages",
  "epochs": 3,
  "batchSize": 1,
  "gradient_accumulation_steps": 4,
  "learningRate": 5e-5,
  "modelMaxLength": 1024,
  "r": 16,
  "lora_alpha": 32,
  "lora_dropout": 0.05,
  "lora_target_modules": "all-linear",
  "use_rslora": false,
  "neftune_noise_alpha": 5,
  "lr_scheduler_type": "cosine",
  "optim": "adamw_8bit",
  "warmup_ratio": 0.03,
  "max_grad_norm": 1.0,
  "early_stopping_patience": 3,
  "auto_tune": true,
  "push_to_hub": true,
  "hf_repo_id": "my-org/socratic-qwen7b-lora"
}
```

Gemma 4 E4B — chỉ cần đổi `model_name` (template tự xử lý):

```json
{
  "model_name": "unsloth/gemma-4-E4B-it",
  "epochs": 3,
  "r": 16,
  "lora_alpha": 32,
  "neftune_noise_alpha": 5,
  "auto_tune": true
}
```

---

## 10. Lỗi thường gặp liên quan model / cờ

| Triệu chứng | Nguyên nhân hay gặp | Cách xử lý |
|---|---|---|
| Train xong, chat kém / format lạ | Sai họ template / ép ChatML (đã sửa) | Dùng đúng Instruct; xem log `[ChatTemplate]` |
| Loss multimodal Gemma ~13–15 | Quirk model nhỏ E2B/E4B (Unsloth) | Có thể bình thường; so bằng eval Socratic chứ không chỉ loss |
| OOM giữa chừng | `batchSize` / `modelMaxLength` / model quá to | Giảm batch, tăng grad_accum, giảm max length hoặc đổi model nhỏ hơn |
| Job drop hết mẫu | Dataset không đúng `messages` / assistant trống | Sửa data; xem `[DataQuality:train_raw]` |
| Overfit nhanh | r/epochs cao trên data nhỏ | Để `auto_tune=true` hoặc hạ r; tăng dropout |
| Resume về step 0 | Thiếu `checkpoint_hf_repo` / `checkpoint_source` | Chỉ gửi khi thật sự Resume |

---

## 11. Tài liệu & mã nguồn liên quan

| Nội dung | Chỗ xem trong repo |
|---|---|
| Validate / clamp / AutoTune | `gpu-service/pipelines/train_config.py` |
| Defaults & biên | `gpu-service/constants/training_defaults.py` |
| Template + lọc data + length | `gpu-service/pipelines/train_data_quality.py` |
| Vòng train SFT | `gpu-service/pipelines/training.py` |
| Danh sách model + preset UI | `frontend_v2/src/components/autotrain/types.ts` |
| Pass-through cờ từ API | `backend/src/controllers/trainController.ts` |
| Unsloth Gemma 4 31B (tham chiếu ngoài) | https://www.kaggle.com/code/danielhanchen/gemma4-31b-unsloth |
| Hướng dẫn train Gemma 4 (Unsloth) | https://unsloth.ai/docs/models/gemma-4/train |
