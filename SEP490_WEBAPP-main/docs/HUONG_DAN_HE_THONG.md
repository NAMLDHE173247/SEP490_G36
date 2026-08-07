# Hướng dẫn hệ thống SEP490 — Nền tảng huấn luyện gia sư AI theo phương pháp Socratic

> Tài liệu này viết cho người mới tiếp cận dự án: giải thích hệ thống **làm được
> gì**, **vì sao lại làm như vậy**, **cách cài đặt và cấu hình**, và đặc biệt là
> **cách huấn luyện một model cùng ý nghĩa của từng tham số**.
>
> Nếu bạn chỉ cần luồng nghiệp vụ tóm tắt kèm sơ đồ, xem [HAPPY_CASE.md](./HAPPY_CASE.md).
> Nếu bạn cần chi tiết kỹ thuật của dịch vụ GPU, xem
> [gpu-service/docs/ARCHITECTURE.md](../gpu-service/docs/ARCHITECTURE.md).

---

## 1. Hệ thống này làm được gì?

Hãy hình dung bài toán gốc. Một học sinh hỏi "2 cộng 2 bằng mấy?". Một chatbot
thông thường sẽ trả lời "bằng 4" — nhanh, đúng, và **vô ích về mặt sư phạm**, vì
học sinh không học được gì. Một gia sư giỏi sẽ hỏi ngược lại: "Em thử đếm trên
ngón tay xem sao?". Đó là phương pháp Socratic: không đưa đáp án, mà dẫn dắt
bằng câu hỏi để người học tự tìm ra.

Vấn đề là các model ngôn ngữ phổ thông được huấn luyện để **trả lời**, không
phải để **hỏi lại**. Muốn chúng cư xử như gia sư Socratic thì phải huấn luyện
lại (fine-tune) trên dữ liệu hội thoại đúng phong cách đó.

Hệ thống này là một **dây chuyền hoàn chỉnh** để làm việc đó, từ dữ liệu thô cho
tới model đang phục vụ học sinh:

Bạn đưa vào các đoạn hội thoại thô. Hệ thống giúp làm sạch, gom cụm và gán nhãn
chúng, có con người kiểm duyệt để đảm bảo chất lượng. Từ tập dữ liệu đã "chín"
đó, bạn bấm một nút để fine-tune model nền trên GPU. Model mới ra lò được chấm
điểm tự động bằng một LLM đóng vai giám khảo theo chín tiêu chí sư phạm, đồng
thời được người thật chấm chéo để đối chiếu. Chỉ model đạt chuẩn mới được đăng
ký vào kho model và đưa vào phục vụ. Cuối cùng, khi học sinh đặt câu hỏi, hệ
thống tự định tuyến tới đúng model chuyên môn của môn học đó.

Điểm khác biệt so với việc "chạy một script fine-tune" là **tính truy vết và
tính so sánh được**. Mỗi model đều biết mình sinh ra từ phiên bản dữ liệu nào,
prompt nào, tham số nào; và mỗi lần đánh giá đều so sánh model mới với model nền
trên cùng một tập validation đã khoá, để câu "model mới tốt hơn" là một khẳng
định có bằng chứng chứ không phải cảm tính.

---

## 2. Những khái niệm cần hiểu trước

Trước khi dùng, có vài thuật ngữ xuất hiện khắp nơi trong giao diện. Hiểu đúng
chúng sẽ giúp bạn đọc được kết quả thay vì chỉ bấm nút.

**Model nền (base model)** là model có sẵn trên Hugging Face, ví dụ
`Qwen2.5-7B-Instruct` hay `Llama-3.1-8B-Instruct`. Nó đã biết tiếng Việt và kiến
thức chung, nhưng chưa biết cách cư xử như gia sư Socratic. Đây là điểm xuất phát.

**Fine-tune** là quá trình dạy thêm cho model nền bằng dữ liệu của bạn. Hệ thống
không huấn luyện lại toàn bộ model — điều đó cần hàng trăm GB VRAM — mà dùng
**LoRA**.

**LoRA (Low-Rank Adaptation)** là kỹ thuật đóng băng toàn bộ model gốc và chỉ
gắn thêm những "miếng vá" rất nhỏ vào một số lớp. Chỉ các miếng vá này được học.
Kết quả là bạn huấn luyện một model 7 tỉ tham số trên một GPU phổ thông, và sản
phẩm đầu ra chỉ nặng vài chục MB thay vì vài chục GB. **QLoRA** là LoRA cộng
thêm việc nén model gốc xuống 4-bit để tiết kiệm VRAM hơn nữa — đây là chế độ hệ
thống đang dùng.

**Dataset version** là một ảnh chụp bất biến của dữ liệu tại một thời điểm, gồm
ba phần train / validation / test kèm một file metadata mô tả nguồn gốc. Sự bất
biến này quan trọng: nếu dữ liệu thay đổi giữa hai lần train, bạn không còn cách
nào biết model tốt lên nhờ dữ liệu hay nhờ tham số.

**Tập validation khoá (locked validation)** là phần dữ liệu model **không bao
giờ được học**, chỉ dùng để chấm. Nó là bài kiểm tra thật. Nếu model học thuộc
tập này thì mọi con số đánh giá đều vô nghĩa.

**Overfit (học vẹt)** là hiện tượng model thuộc lòng dữ liệu train thay vì hiểu
quy luật. Dấu hiệu nhận biết: loss trên tập train tiếp tục giảm nhưng loss trên
tập validation bắt đầu tăng. Đây chính là lý do màn hình huấn luyện vẽ hai đường
loss cạnh nhau.

**LLM judge (giám khảo AI)** là một model mạnh (mặc định `google/gemini-2.5-flash`
qua OpenRouter) được giao việc đọc câu trả lời của model bạn và chấm điểm theo
thang chuẩn. Nó thay thế việc phải đọc tay hàng trăm hội thoại, nhưng không thay
thế hoàn toàn con người — vì thế mới có thêm bước Human Audit.

**Human Audit** là vòng chấm điểm bởi người thật trên cùng các hội thoại mà AI
đã chấm. Khi người và AI bất đồng, hệ thống ghi nhận xung đột và chuyển cho
Checker phân xử. Cơ chế này vừa kiểm tra model, vừa kiểm tra chính giám khảo AI.

**Định tuyến theo môn (subject routing)** là việc hệ thống tự chọn model phù hợp
với câu hỏi. Một model được fine-tune riêng cho môn Toán sẽ trả lời câu hỏi Toán
tốt hơn model chung, nên khi học sinh hỏi Toán, câu hỏi được đưa tới đúng model đó.

---

## 3. Hệ thống gồm những phần nào

Có bốn thành phần chạy độc lập và nói chuyện với nhau qua HTTP.

**Frontend** (React + Vite) là toàn bộ giao diện người dùng. Nó không bao giờ
gọi thẳng sang dịch vụ GPU — mọi thứ đều đi qua backend.

**Backend** (Node.js + Express + MongoDB) là bộ não điều phối. Nó giữ tài khoản,
phân quyền, lưu lịch sử, quản lý phiên bản dữ liệu và model, rồi chuyển tiếp các
tác vụ nặng sang dịch vụ GPU. Đây cũng là nơi duy nhất giữ khoá bí mật.

**GPU service** (Python + Flask) là nơi thực sự chạy máy học: fine-tune, đánh
giá, phục vụ inference, và gom cụm dữ liệu. Nó cần một GPU NVIDIA. Vì các
endpoint của nó tiêu tiền thật (thời gian GPU, API key giám khảo), nó được bảo
vệ bằng một shared secret: mọi request phải kèm header `X-GPU-Token`.

**Object storage** (MinIO khi chạy local, CDN S3 khi chạy production) giữ các
dataset một cách bền vững, để việc khởi động lại container không làm mất dữ liệu
đang huấn luyện dở.

Một chi tiết vận hành quan trọng: **GPU chỉ chạy một job huấn luyện tại một thời
điểm** (`MAX_CONCURRENT_JOBS = 1`). Các job gửi sau sẽ nằm trong hàng đợi và tự
động được nhặt ra khi GPU rảnh. Riêng đánh giá thì chạy song song được tối đa 3
slot vì nhẹ hơn.

---

## 4. Vai trò và quyền hạn

Hệ thống có bốn vai trò, mỗi vai trò thấy một menu khác nhau khi đăng nhập.

**Admin** thấy toàn bộ, thêm quyền quản lý tài khoản người dùng.

**Supervisor** là vai trò vận hành chính: chuẩn bị dữ liệu, giao việc gán nhãn,
duyệt nhãn, chạy AutoTrain, xem lịch sử huấn luyện, quản lý kho model, chạy đánh
giá và benchmark định tuyến.

**Checker** chuyên về kiểm duyệt: duyệt nhãn, kiểm duyệt bài rewrite, và quan
trọng nhất là phân xử khi hai người gán nhãn bất đồng hoặc khi người và AI chấm
lệch nhau.

**Staff** là người làm việc trực tiếp với dữ liệu: nhận task được giao, gán nhãn
hoặc viết lại hội thoại, chấm Human Audit, và xem thống kê cá nhân của mình.

Ranh giới quyền được cài ở backend chứ không chỉ ở giao diện, nên việc ẩn menu
không phải là biện pháp bảo mật duy nhất — API cũng từ chối nếu sai vai trò.

---

## 5. Cài đặt và cấu hình

### 5.1 Chạy trên máy cá nhân (development)

Bạn cần Node.js, Python 3.12, MongoDB, và một GPU NVIDIA nếu muốn train thật.
Không có GPU thì vẫn chạy được phần dữ liệu và giao diện, chỉ không train được.

Bắt đầu bằng việc tạo file cấu hình từ mẫu:

```bash
cp .env.example .env
```

Sau đó mở `.env` và điền giá trị thật. Ba biến **bắt buộc** phải đổi, hệ thống
sẽ không khởi động nếu chúng còn là giá trị mẫu:

```bash
# Sinh nhanh từng khoá:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # GPU_SERVICE_TOKEN
```

Rồi khởi động ba tiến trình ở ba cửa sổ terminal:

```bash
cd backend      && npm install && npm run dev     # http://localhost:3000
cd frontend_v2  && npm install && npm run dev     # http://localhost:5173
cd gpu-service  && pip install -r requirements.txt && python app.py   # http://localhost:5000
```

Nếu muốn có luôn MongoDB và MinIO mà không cài tay, dùng `docker-compose.yml` ở
thư mục gốc — nó dựng sẵn database và object storage cho môi trường dev.

### 5.2 Chạy production

Dùng `docker-compose.prod.yml`. File này đã cấu hình sẵn backend, MongoDB và
GPU service (kèm khai báo tài nguyên NVIDIA), dùng tên network và volume riêng
để không đụng độ với dịch vụ khác trên cùng máy chủ. Frontend không được host ở
đây vì nó được build tĩnh và deploy riêng.

Mọi giá trị cần thay đều để dạng `<<PLACE_HOLDER>>` — bạn điền hết rồi
`docker compose -f docker-compose.prod.yml up -d` là chạy.

Image được build sẵn và đẩy lên Docker Hub bằng `scripts/docker-publish.ps1`,
nên trên máy chủ Linux chỉ cần kéo về dùng.

### 5.3 Ý nghĩa các biến môi trường quan trọng

| Biến | Ý nghĩa | Lưu ý |
|---|---|---|
| `JWT_SECRET` | Khoá ký token đăng nhập | Bắt buộc, chuỗi ngẫu nhiên dài |
| `ENCRYPTION_KEY` | Khoá mã hoá API key lưu trong DB | Bắt buộc, **phải khác** `JWT_SECRET` |
| `GPU_SERVICE_TOKEN` | Shared secret giữa backend và GPU service | Bắt buộc ở mọi deployment mở ra ngoài |
| `MONGO_URI` | Chuỗi kết nối MongoDB | Nhớ kèm user/password nếu DB bật auth |
| `GPU_SERVICE_URL` | Địa chỉ GPU service | `http://gpu-service:5000` khi chạy trong Docker |
| `FRONTEND_ORIGINS` | Danh sách origin được phép gọi API (CORS) | Phân tách bằng dấu phẩy |
| `HF_TOKEN` | Token Hugging Face | Cần khi dùng model có gated access hoặc push kết quả |
| `GPU_MEMORY_FRACTION` | Giới hạn phần trăm VRAM được dùng | Ví dụ `0.2` = chỉ dùng 20%, để chạy chung máy với dịch vụ khác |
| `STORAGE_*` | Cấu hình MinIO/S3 lưu dataset | Bucket mặc định `llm_trains` |
| `ALLOW_DEMO_SEED` | Tạo tài khoản demo mật khẩu "1" | **Luôn để `false` ở production** |
| `ALLOW_MOCK_OAUTH` | Cho đăng nhập giả lập bằng email bất kỳ | **Luôn để `false` ở production** |

Hai biến cuối cùng tồn tại để tiện thử nghiệm, nhưng bật chúng ở production đồng
nghĩa với việc ai cũng đăng nhập được. Đây là lỗi cấu hình nghiêm trọng nhất mà
người mới hay mắc.

---

## 6. Sử dụng hệ thống theo trình tự

Phần này đi theo đúng thứ tự công việc thực tế, từ dữ liệu thô đến model phục vụ.

### Bước 1 — Chuẩn bị dữ liệu (màn hình **Data Prep**)

Bạn tải lên file hội thoại thô, hỗ trợ `.json`, `.jsonl`, `.csv`, `.xlsx` hoặc
`.zip`. Hệ thống tự nhận diện định dạng và chuyển về cấu trúc hội thoại chuẩn.

Tiếp theo là làm sạch: bỏ các thẻ suy nghĩ nội bộ như `<think>`, chuẩn hoá lượt
nói. Sau đó tới bước thú vị nhất — **gom cụm**. Hệ thống biến mỗi hội thoại
thành một vector ngữ nghĩa rồi dùng thuật toán phân cụm để nhóm các hội thoại
giống nhau lại. Việc này phục vụ ba mục đích: phát hiện dữ liệu trùng lặp, loại
bỏ mẫu nhiễu nằm lạc lõng ngoài mọi cụm, và giúp bạn gán nhãn hàng loạt cho cả
cụm thay vì từng mẫu.

Có một chức năng tên **safe split** đáng chú ý: khi chia dữ liệu thành train và
validation, nó đảm bảo các hội thoại trong cùng một cụm không bị chia về hai
phía. Nếu không làm vậy, model sẽ gặp trong bài kiểm tra một biến thể gần giống
hệt thứ nó đã học — điểm số sẽ đẹp một cách giả tạo.

Kết thúc, bạn xuất ra một **Dataset Version**. Từ đây dữ liệu đã bất biến.

### Bước 2 — Gán nhãn có kiểm duyệt

Supervisor giao từng dải mẫu cho các Staff. Staff gán nhãn rồi nộp. Checker duyệt
kết quả, và khi hai Staff gán nhãn khác nhau cho cùng một mẫu, Checker là người
phân xử rồi publish nhãn thống nhất.

Vòng này tốn công nhưng không bỏ được: chất lượng model bị chặn trên bởi chất
lượng nhãn. Dữ liệu nhãn ẩu thì không tham số nào cứu được.

### Bước 3 — Huấn luyện (màn hình **AutoTrain**)

Đây là trọng tâm, được trình bày riêng ở [mục 7](#7-huấn-luyện-chi-tiết).

### Bước 4 — Đánh giá (màn hình **Model Eval**)

Sau khi train xong, bạn chạy đánh giá. Hệ thống lấy các hội thoại trong tập
đánh giá và cho **cả model nền lẫn model vừa fine-tune** trả lời lại từ đầu
(gọi là replay). Sau đó nó gửi cả hai kết quả cho giám khảo AI chấm mù theo chín
tiêu chí, thang 0–5:

| Nhóm | Mã | Tiêu chí | Câu hỏi mà nó trả lời |
|---|---|---|---|
| A. Sư phạm | A1 | Answer withholding | Model có kìm được việc đưa đáp án ngay không? |
| | A2 | Scaffolding quality | Gợi ý có dẫn dắt từng bước hợp lý không? |
| | A3 | Adaptive response | Có phản ứng đúng theo việc học sinh đúng hay sai không? |
| B. Nội dung | B1 | Factual accuracy | Kiến thức có chính xác không? |
| | B2 | Grade level | Ngôn ngữ có vừa trình độ học sinh không? |
| C. Hội thoại | C1 | Robustness | Có giữ vững khi học sinh hỏi lệch hướng không? |
| | C2 | Coherence | Mạch hội thoại có liền lạc không? |
| | C3 | Tone | Giọng điệu có phù hợp gia sư không? |
| D. An toàn | D1 | Hallucination | Có bịa dữ kiện không? |

Vì cả hai model chạy trên cùng dữ liệu, cùng prompt, cùng giám khảo, nên chênh
lệch điểm phản ánh đúng tác động của việc fine-tune. Job đánh giá có checkpoint,
nên nếu bị gián đoạn giữa chừng bạn có thể resume thay vì chạy lại từ đầu.

Song song, **Human Audit** cho người thật chấm cùng các hội thoại đó. Khi người
và AI lệch nhau, xung đột được ghi nhận và chuyển cho Checker.

### Bước 5 — Đăng ký model (màn hình **Model Registry**)

Model đạt chuẩn được version hoá và đánh dấu trạng thái sẵn sàng. Kho model cũng
cho phép quay lui về phiên bản cũ nếu phiên bản mới có vấn đề khi chạy thật.

### Bước 6 — Phục vụ (màn hình **Chat**)

Model được nạp vào một GPU slot, sau đó câu hỏi của học sinh được định tuyến tới
đúng model chuyên môn và trả lời theo kiểu streaming — chữ hiện dần thay vì chờ
trọn câu.

---

## 7. Huấn luyện chi tiết

### 7.1 Trình tự thao tác

Vào màn hình **AutoTrain**. Bạn sẽ đi qua ba bước.

Đầu tiên chọn **model nền** và **nguồn dữ liệu**. Dữ liệu có thể là file tải lên
từ máy, một dataset trên Hugging Face Hub, hoặc dataset đã lưu trên cloud. Giao
diện có sẵn danh sách model nền gợi ý theo môn học.

Tiếp theo là **cấu hình**. Nếu bạn chưa quen, hãy chọn một trong ba preset:
*Quick Training* để thử nhanh xem đường ống có thông không, *Standard* cho hầu
hết trường hợp thực tế, và *High Quality* khi bạn muốn kết quả tốt nhất và chấp
nhận chờ lâu hơn. Ba preset này đã được chỉnh sẵn cả các tham số nâng cao.

Cũng ở bước này, bạn viết **System Prompt** — đoạn mô tả tính cách và nguyên tắc
hành xử của gia sư. Đây là một trong những thứ ảnh hưởng mạnh nhất tới kết quả,
nhưng lại hay bị bỏ qua. Prompt bạn đặt ở đây sẽ đi cùng **mọi mẫu dữ liệu lúc
train**, và cũng chính là prompt được dùng lúc đánh giá và lúc phục vụ. Sự nhất
quán này là cố ý: nếu train một đằng, phục vụ một nẻo, model sẽ hoạt động dưới
điều kiện nó chưa từng thấy.

Cuối cùng bạn xem lại và bấm bắt đầu. Job vào hàng đợi, và khi GPU rảnh nó tự
chạy. Màn hình sẽ hiện log theo thời gian thực cùng biểu đồ loss.

### 7.2 Ý nghĩa từng tham số

Đây là phần đáng đọc kỹ nhất. Tham số được chia làm ba nhóm.

#### Nhóm 1 — Điều khiển quá trình học

**Epochs** là số lần model đọc hết toàn bộ dữ liệu. Ít quá thì model chưa kịp
học; nhiều quá thì nó bắt đầu học vẹt. Với dataset nhỏ vài chục đến vài trăm mẫu,
3–5 epoch là khoảng hợp lý.

**Learning Rate** là độ lớn mỗi bước điều chỉnh. Đây là tham số nhạy nhất. Đặt
quá cao, model "nhảy" qua lời giải tốt và loss dao động loạn xạ; đặt quá thấp,
nó học chậm tới mức hết epoch vẫn chưa tiến bộ. Với LoRA, khoảng `1e-4` đến
`2e-4` là an toàn; nếu dữ liệu ít và bạn muốn thận trọng, `5e-5` cũng hợp lý.

**Batch Size** là số mẫu xử lý cùng lúc, bị giới hạn bởi VRAM.
**Grad Accumulation** là mẹo để có batch lớn mà không cần thêm VRAM: nó cộng dồn
gradient qua nhiều bước rồi mới cập nhật một lần. **Batch hiệu dụng = Batch Size
× Grad Accumulation** — đây mới là con số thực sự ảnh hưởng tới chất lượng. Ví
dụ batch 2 với accumulation 4 tương đương batch 8.

**Max Length** là số token tối đa mỗi mẫu. Hội thoại dài hơn sẽ bị cắt. Đặt quá
ngắn thì mất phần cuối hội thoại — thường lại là phần quan trọng nhất; đặt quá
dài thì tốn VRAM vô ích.

**Warmup Steps / Warmup Ratio** là giai đoạn learning rate tăng dần từ 0 lên mức
đặt, tránh cú sốc ở những bước đầu. Ratio (ví dụ `0.03` = 3% tổng số bước) ổn
định hơn số bước cố định, vì nó tự co giãn theo kích thước dataset.

**LR Scheduler** quyết định learning rate thay đổi thế nào về sau. `cosine` giảm
mượt theo đường cong và thường cho kết quả tốt hơn `linear`; `constant` giữ
nguyên, hiếm khi dùng cho fine-tune.

**Optimizer** là thuật toán cập nhật trọng số. `adamw_8bit` tiết kiệm khoảng 75%
VRAM so với bản thường và là lựa chọn mặc định an toàn.

**Weight Decay** kéo trọng số về gần 0 để chống học vẹt. `0.01` là giá trị chuẩn.

**Max Grad Norm** cắt ngọn gradient khi nó quá lớn, để một batch dữ liệu bất
thường không làm hỏng cả run. Giữ `1.0`.

**Seed** cố định tính ngẫu nhiên. Cùng seed, cùng dữ liệu thì cùng kết quả — cần
thiết khi bạn muốn lặp lại một thí nghiệm.

#### Nhóm 2 — Cấu hình LoRA

**LoRA Rank (r)** là "dung lượng" của miếng vá. Rank cao học được nhiều chi tiết
hơn nhưng tốn VRAM hơn và dễ học vẹt hơn khi dữ liệu ít. Các giá trị thường dùng
là 8, 16, 32.

**LoRA Alpha** là hệ số khuếch đại ảnh hưởng của miếng vá. Quy tắc kinh nghiệm:
đặt bằng khoảng hai lần rank. Nếu alpha nhỏ hơn rank, hệ thống sẽ cảnh báo vì
adapter có thể học không đủ mạnh.

**LoRA Dropout** ngẫu nhiên tắt bớt một phần adapter trong lúc học để chống học
vẹt. `0` đến `0.1` là khoảng hợp lý; `0.05` là mặc định.

**LoRA Targets** chọn những lớp nào được gắn adapter. `all-linear` (cả phần chú
ý lẫn phần MLP) cho chất lượng tốt nhất và là mặc định; `attention` nhẹ hơn về
VRAM và đủ dùng khi dữ liệu rất ít.

**rsLoRA** là biến thể giữ cho hệ số scaling ổn định khi rank cao. Hệ thống tự
bật nó khi rank từ 32 trở lên. Ở rank thấp nó gần như không tạo khác biệt.

#### Nhóm 3 — Chất lượng và chống học vẹt

**NEFTune Alpha** thêm một chút nhiễu vào embedding trong lúc train. Nghe phản
trực giác, nhưng đây là kỹ thuật đã được chứng minh giúp model bám theo chỉ dẫn
tốt hơn và bớt trả lời rập khuôn. `0` là tắt, `5` là giá trị được khuyến nghị.

**Early Stop Patience** là số lần chấm validation liên tiếp không tiến bộ trước
khi hệ thống tự dừng. Đặt thấp thì dừng sớm khi vừa chớm học vẹt; đặt cao thì
cho model thêm cơ hội. Mặc định là 3.

**Eval Steps** là khoảng cách giữa hai lần chấm validation. **Để trống là tốt
nhất** — hệ thống sẽ tự tính sao cho có khoảng 8 điểm validation trải đều cả
run, bất kể dataset to hay nhỏ.

**Group By Length** gom các mẫu dài gần bằng nhau vào chung batch để đỡ lãng phí
tính toán cho phần đệm. Nó làm thay đổi thứ tự batch, nên hãy tắt khi bạn đang
so sánh nhiều run với nhau.

### 7.3 Hệ thống tự làm gì cho bạn

Có vài thứ chạy ngầm trước và trong lúc train mà bạn nên biết.

**Chọn đúng chat template của model.** Hệ thống giữ template sẵn trên tokenizer
của model Instruct (Llama, Gemma 3, Qwen…). Chỉ khi tokenizer thiếu template nó
mới gắn bản Unsloth theo family. **Gemma 4** là ngoại lệ: theo notebook Unsloth
[Gemma4-31B](https://www.kaggle.com/code/danielhanchen/gemma4-31b-unsloth), hệ
thống luôn gắn `gemma-4` (E2B/E4B/12B) hoặc `gemma-4-thinking` (26B/31B) — không
dùng ChatML hay template Gemma cũ. Việc ép một format chung cho mọi model sẽ làm
model học format khác lúc chat.

**Cổng chất lượng dữ liệu.** Trước khi format, các mẫu không có lượt user /
assistant, assistant quá ngắn, hoặc trùng nội dung gần exact bị loại. Log ghi
`kept/dropped` kèm lý do. Nếu sau lọc còn 0 mẫu, job dừng ngay với lỗi rõ ràng.

**Tự chỉnh hyperparam theo cỡ dataset (AutoTune).** Dataset nhỏ mà LoRA rank /
epoch cao dễ học vẹt. Khi còn bật `auto_tune` (mặc định), hệ thống kẹp trần an
toàn: dưới 30 mẫu thì epochs ≤ 3 và r ≤ 8; dưới 100 mẫu thì epochs ≤ 4 và r ≤ 16.
Mọi thay đổi được ghi `[AutoTune] …` trong log. Gửi `auto_tune=false` nếu bạn
muốn giữ nguyên mọi knob đã chọn.

**Báo cáo độ dài và truncation.** Sau khi format, hệ thống ước lượng phân phối
độ dài token và cảnh báo nếu hơn 20% mẫu bị cắt bởi `modelMaxLength`.

**Chỉ tính loss trên phần trả lời của gia sư.** Model chỉ cần học cách *trả lời*,
không học cách *đặt câu hỏi thay học sinh*. Trước khi train, hệ thống thử mask
trên 8 mẫu; nếu dataset sai định dạng, log cảnh báo rõ thay vì train âm thầm sai.

**Tự dừng khi bắt đầu học vẹt** và **tự lấy lại checkpoint tốt nhất** khi kết
thúc, chứ không phải checkpoint cuối cùng.

**Kiểm tra và kẹp biên tham số.** Giá trị vô lý bị kẹp về khoảng hợp lệ kèm cảnh
báo, thay vì để job chết OOM giữa chừng.

**Lưu checkpoint định kỳ và cho phép resume.** Job gián đoạn có thể tiếp tục từ
checkpoint gần nhất.

### 7.4 Đọc kết quả huấn luyện

Trong lúc train, màn hình hiện hai đường loss.

**Train loss** đo mức sai trên dữ liệu model đang học. Nó gần như luôn giảm —
bản thân việc này không nói lên điều gì về chất lượng.

**Eval loss** đo mức sai trên tập validation model chưa từng thấy. **Đây mới là
con số cần nhìn.**

Ba tình huống thường gặp. Nếu cả hai cùng giảm, mọi thứ đang tốt. Nếu train loss
giảm nhưng eval loss bắt đầu tăng, model đã bắt đầu học vẹt — hệ thống sẽ tự
dừng, và bạn nên giảm epoch, giảm rank, hoặc bổ sung dữ liệu. Nếu cả hai đều
đứng yên, thường là learning rate quá thấp hoặc dữ liệu quá ít để có tín hiệu.

Log còn hiện thêm dòng tóm tắt cấu hình thực tế đã chạy (số bước mỗi epoch, batch
hiệu dụng, lịch eval, tỉ lệ token được tính loss). Khi cần so sánh hai run hoặc
truy nguyên một kết quả lạ, dòng này là chỗ nhìn đầu tiên.

---

## 8. Vận hành và xử lý sự cố

**Job nằm mãi ở trạng thái QUEUED.** GPU đang bận một job khác. Xem
`GET /api/train/queue-status` để biết còn bao nhiêu job đang chờ. Đây là hành vi
bình thường, không phải lỗi.

**Job chết vì hết VRAM.** Giảm Batch Size (bù lại bằng cách tăng Grad
Accumulation để giữ nguyên batch hiệu dụng), giảm Max Length, hoặc giảm LoRA
Rank. Nếu máy chủ chạy chung với dịch vụ khác, kiểm tra `GPU_MEMORY_FRACTION` —
có thể bạn đang tự giới hạn mình.

**Log báo không mask được assistant.** Định dạng dataset không khớp với chat
template của model nền. Model vẫn train được nhưng sẽ học cả lượt của học sinh,
làm giảm chất lượng. Nên sửa dữ liệu rồi train lại.

**Log cảnh báo không nhận được system prompt.** Cấu hình AutoTrain chưa truyền
prompt xuống. Model sẽ được train với prompt Socratic mặc định, khác với prompt
dùng lúc phục vụ — nên sửa trước khi tin vào kết quả.

**Backend không khởi động.** Gần như luôn là do thiếu `JWT_SECRET` hoặc
`ENCRYPTION_KEY`. Đây là chủ ý thiết kế: thà không chạy còn hơn chạy với khoá mặc
định ai cũng đoán được.

**GPU service trả về 401.** Header `X-GPU-Token` không khớp. Kiểm tra
`GPU_SERVICE_TOKEN` ở cả hai phía đã giống nhau chưa.

**Thao tác database báo lỗi cần xác thực.** MongoDB đang bật auth nhưng
`MONGO_URI` chưa có user/password.

---

## 9. Câu hỏi thường gặp

**Cần dataset bao nhiêu mẫu là đủ?** Dưới 20 mẫu thì kết quả gần như không dùng
được. Từ 50 mẫu trở lên bắt đầu có ý nghĩa. Trên 100 mẫu chất lượng tốt là
khoảng đáng để đầu tư công sức. Quan trọng hơn số lượng là **sự nhất quán về
phong cách** — 50 hội thoại Socratic chuẩn tốt hơn 500 hội thoại lẫn lộn.

**Không có GPU thì dùng được không?** Phần chuẩn bị dữ liệu, gán nhãn, kiểm duyệt
và quản lý đều chạy bình thường. Chỉ huấn luyện, đánh giá và chat với model tự
train là cần GPU.

**Train mất bao lâu?** Phụ thuộc kích thước dữ liệu, model nền và preset. Với vài
chục hội thoại và model 7B, preset Quick khoảng vài phút, Standard khoảng 15
phút, High Quality khoảng 45 phút.

**Vì sao model mới điểm cao hơn nhưng chat lại thấy tệ hơn?** Thường là do lệch
điều kiện: system prompt lúc chat khác lúc train hoặc lúc đánh giá. Kiểm tra
`system_prompt_version` trong lịch sử huấn luyện và so với prompt đang dùng để
phục vụ.

**Nên dùng preset nào?** Bắt đầu bằng Standard. Chỉ chuyển sang High Quality khi
Standard đã cho kết quả ổn và bạn muốn cải thiện thêm. Quick chỉ nên dùng để
kiểm tra đường ống có thông không, đừng đánh giá chất lượng model qua nó.

---

## 10. Tài liệu liên quan

- [HAPPY_CASE.md](./HAPPY_CASE.md) — luồng nghiệp vụ end-to-end kèm sơ đồ
- [gpu-service/docs/ARCHITECTURE.md](../gpu-service/docs/ARCHITECTURE.md) — kiến trúc chi tiết dịch vụ GPU
- [LOCKED_EVALUATION_GUIDE.md](./LOCKED_EVALUATION_GUIDE.md) — giao thức đánh giá bất biến
- [QUALITY_REVIEW_WORKFLOW.md](./QUALITY_REVIEW_WORKFLOW.md) — quy trình kiểm duyệt chất lượng
