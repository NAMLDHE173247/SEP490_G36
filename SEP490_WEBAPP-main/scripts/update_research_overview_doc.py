from pathlib import Path
from shutil import copy2

from docx import Document
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph


SOURCE = Path(r"D:\Tổng quan về nghiên cứu hiện tại .docx")
BACKUP = Path(r"D:\Tổng quan về nghiên cứu hiện tại - bản gốc trước cập nhật.docx")


def set_text(paragraph, text):
    """Replace wording while retaining the paragraph's existing style."""
    if paragraph.runs:
        paragraph.runs[0].text = text
        for run in paragraph.runs[1:]:
            run.text = ""
    else:
        paragraph.add_run(text)


def insert_after(paragraph, text, style=None):
    new_p = OxmlElement("w:p")
    paragraph._p.addnext(new_p)
    new_para = Paragraph(new_p, paragraph._parent)
    if style:
        new_para.style = style
    new_para.add_run(text)
    return new_para


def replace_prefix(document, prefix, text):
    for paragraph in document.paragraphs:
        if paragraph.text.strip().startswith(prefix):
            set_text(paragraph, text)
            return paragraph
    raise KeyError(f"Paragraph not found: {prefix}")


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    if not BACKUP.exists():
        copy2(SOURCE, BACKUP)

    doc = Document(SOURCE)

    intro_heading = replace_prefix(doc, "1. Vấn đề của Router", "1. Vấn đề của Router và trạng thái triển khai hiện tại")
    status = insert_after(
        intro_heading,
        "Cập nhật thực nghiệm (17/07/2026): nhóm đã triển khai Rule, LLM-as-Router và Hybrid Router; đã fine-tune bốn LoRA adapter gồm GENERAL, MATH, PHYSICS và CHEMISTRY. Kết quả Router và chất lượng phản hồi chỉ được kết luận sau khi chạy benchmark trên tập kiểm tra hold-out và đánh giá end-to-end.",
        "Normal",
    )

    replace_prefix(doc, "Nhiều SLM theo môn", "Nhiều model theo môn, gồm một GENERAL tutor và ba specialist MATH, PHYSICS, CHEMISTRY. Router có nhiệm vụ phân tích câu hỏi và chuyển đến model phù hợp. Bốn adapter LoRA đã được train trên cùng base model; việc benchmark sẽ kiểm chứng lợi ích thực tế của việc chia theo môn.")
    replace_prefix(doc, "RQ5: Socratic", "RQ5: So với POOLED GENERAL và Oracle routing, Hybrid routing có duy trì chất lượng phản hồi Socratic và factuality ở mức gần Oracle, với trade-off latency và chi phí hợp lý không?")
    replace_prefix(doc, "H5: Hybrid Router", "H5: Hybrid Router cân bằng accuracy, latency và LLM-call rate tốt hơn LLM-as-Router-only trong các case rõ ràng.")
    after_h5 = replace_prefix(doc, "Các giả thuyết này", "H6: Ở đánh giá end-to-end, Hybrid routing tạo phản hồi có chất lượng Socratic và factuality cao hơn hoặc tương đương POOLED GENERAL, đồng thời tiếp cận Oracle routing khi Router chọn đúng specialist.\nCác giả thuyết này chỉ được kết luận sau khi chạy cùng tập kiểm tra hold-out, cùng cấu hình và cùng metric. Không nên kết luận Hybrid tốt hơn nếu chưa có kết quả evaluation chính thức.")

    replace_prefix(doc, "8.1. Đã có", "8.1. Đã triển khai")
    replace_prefix(doc, "Dataset: data/test_router", "Dữ liệu huấn luyện: GENERAL gồm 600 mẫu; MATH, PHYSICS và CHEMISTRY gồm 200 mẫu/môn. Tất cả là dữ liệu synthetic/template-assisted theo phong cách Socratic và cần human review trước khi đưa ra kết luận mạnh.")
    replace_prefix(doc, "Rule-based Router:", "Router: đã có Rule, LLM-as-Router và Hybrid Router, cùng logic history, previous subject, confidence/fallback, logging và benchmark dashboard.")
    replace_prefix(doc, "Evaluation scripts:", "Evaluation: đã có Router Benchmark (RP4) và end-to-end replay (RP5); Model Eval/Gemini Judge dùng để chấm Socratic quality, factuality và overall quality sau khi hệ thống sinh phản hồi.")
    replace_prefix(doc, "8.2. Đang làm", "8.2. Đang hoàn thiện và kiểm chứng")
    replace_prefix(doc, "Qwen Router V0:", "Registry và serving: cần đăng ký bốn adapter vào Model Registry với một active version có hfRepoId hợp lệ để Chat, Router Benchmark và RP5 tải được model.")
    replace_prefix(doc, "GPU service / adapter:", "GPU service / adapter: dùng để tải base model và LoRA adapter từ Hugging Face; mỗi training job phải được export sang Hugging Face Hub trước khi có thể serving.")
    replace_prefix(doc, "8.3. Tiếp theo", "8.3. Các thử nghiệm phải chạy tiếp theo")
    replace_prefix(doc, "Hybrid V0:", "RP4 - Router Benchmark: chạy RULE, LLM và HYBRID trên cùng tập hold-out; dùng 3 repeats để đo stability, cùng các ablation về history, previous subject và ngưỡng strict/lenient.")
    replace_prefix(doc, "Full evaluation:", "RP5 - End-to-end evaluation: chạy POOLED (GENERAL), ORACLE (gold subject) và HYBRID (Router tự chọn) trên cùng prompt test; lưu replay tách riêng theo điều kiện để Model Eval chấm.")
    replace_prefix(doc, "Error analysis:", "Error analysis: phân tích lỗi theo subject, intent, need_clarification, case type và lỗi route; ở RP5 phân tích thêm factuality, direct-answer behavior, Socratic score, latency sinh phản hồi và token/cost nếu provider trả usage.")

    replace_prefix(doc, "9. File dữ liệu test", "9. Dữ liệu, tách train-test và cấu trúc đánh giá")
    replace_prefix(doc, "9.1. File dữ liệu test", "9.1. Tập kiểm tra Router hold-out")
    replace_prefix(doc, "File dữ liệu test dùng để đánh giá Router", "File dùng cho benchmark Router là docs/datasets/router_test_v1.json, gồm 60 cases hold-out: 20 MATH, 20 PHYSICS và 20 CHEMISTRY. Tập này có câu viết tắt, lỗi chính tả, câu mơ hồ, history follow-up và nhãn gold_subject, gold_intent, gold_need_clarification. Tập test không dùng để train hoặc tune rule sau khi xem kết quả.")
    replace_prefix(doc, "Math: 60 câu", "MATH: 20 cases.")
    replace_prefix(doc, "Physics: 60 câu", "PHYSICS: 20 cases.")
    replace_prefix(doc, "Chemistry: 60 câu", "CHEMISTRY: 20 cases.")
    replace_prefix(doc, "Interdisciplinary: 62", "Các case follow-up, mơ hồ và câu khó được phân bố trong ba môn để kiểm tra history, clarification và fallback.")
    replace_prefix(doc, "Ambiguous: 29", "Tập train của Router là docs/datasets/router_train_v1.json gồm 90 mẫu calibration; không dùng làm kết quả benchmark chính thức.")
    replace_prefix(doc, "Out-of-scope: 29", "Dữ liệu train response được tách riêng: general_tutor_train_v1.json có 600 mẫu; mỗi specialist_*_train_v1.json có 200 mẫu.")
    replace_prefix(doc, "Tổng: 300", "Tổng benchmark Router chính thức hiện tại: 60 cases. Đây là quy mô nhỏ; báo cáo phải nêu rõ hạn chế và không suy rộng ra toàn bộ học sinh THPT Việt Nam.")

    replace_prefix(doc, "12.1. Metric lõi", "12.1. Metric RP4 - đánh giá Router")
    replace_prefix(doc, "Primary Subject Accuracy:", "Primary Subject Accuracy và Macro-F1: Router chọn đúng môn chính và không bị lệch theo môn.")
    replace_prefix(doc, "Intent Accuracy / F1:", "Intent Accuracy: Router nhận diện đúng mục đích học tập không.")
    replace_prefix(doc, "Target SLM Accuracy:", "Exact Match: đúng đồng thời subject, intent và need_clarification theo schema benchmark.")
    replace_prefix(doc, "Need Clarification Accuracy:", "Wrong-route rate và Need-Clarification accuracy: tỷ lệ route sai và tỷ lệ phát hiện đúng câu cần hỏi lại.")
    replace_prefix(doc, "Exact Match Accuracy:", "Router latency, LLM-call rate, Router LLM calls và Stability qua 3 repeats.")
    replace_prefix(doc, "Average Latency:", "Các ablation: HYBRID_NO_HISTORY, HYBRID_NO_PREVIOUS_SUBJECT, HYBRID_STRICT và HYBRID_LENIENT để kiểm chứng đóng góp của context và ngưỡng confidence.")
    replace_prefix(doc, "JSON Validity Rate:", "JSON/schema validity rate và fallback-on-error rate nếu LLM Router được gọi.")
    replace_prefix(doc, "12.2. Metric mở rộng", "12.2. Metric RP5 - đánh giá phản hồi end-to-end")
    replace_prefix(doc, "Multi-turn Routing Accuracy:", "Điều kiện so sánh: POOLED GENERAL (baseline), ORACLE specialist routing (upper bound) và HYBRID routing (phương pháp đề xuất), dùng cùng prompt test.")
    replace_prefix(doc, "Interdisciplinary Accuracy:", "Socratic quality, factuality và overall quality do Gemini Judge chấm theo rubric cố định; cần lưu cả prompt judge, phiên bản model judge và replay để tái lập.")
    replace_prefix(doc, "Out-of-domain Detection:", "Generation latency, token/cost khi có usage và tỷ lệ direct answer quá sớm.")
    replace_prefix(doc, "Token Usage:", "Phân tích lỗi RP5 theo route đúng/sai để tách tác động của Router khỏi năng lực của specialist model.")
    replace_prefix(doc, "Socratic Quality Score:", "Điểm Socratic 1-5 chỉ là proxy do judge/model hoặc reviewer đánh giá; không được diễn giải thành bằng chứng về learning gain của học sinh.")
    replace_prefix(doc, "Direct Answer Rate:", "Direct Answer Rate: tỷ lệ phản hồi đưa đáp án trực tiếp quá sớm.")

    replace_prefix(doc, "Không train full SLM", "Không train full SLM từ đầu: nhóm fine-tune LoRA adapters trên một base model chung; đây là research prototype, không phải huấn luyện mô hình nền tảng.")
    replace_prefix(doc, "Output 4: Hybrid Router", "Output 4: Hybrid Router proposed method và bốn LoRA response adapters (GENERAL, MATH, PHYSICS, CHEMISTRY).")
    replace_prefix(doc, "Output 5: Evaluation pipeline", "Output 5: Evaluation pipeline RP4/RP5 gồm router predictions, end-to-end replays, metrics, judge scores và error analysis.")
    replace_prefix(doc, "1: Chạy Qwen Router", "1: Hoàn tất export 4 adapter lên Hugging Face Hub, đăng ký đúng hfRepoId vào Model Registry và đặt từng version là Active.")
    replace_prefix(doc, "2: Implement Hybrid", "2: Smoke-test Chat cho GENERAL, MATH, PHYSICS và CHEMISTRY sau khi Registry tải được adapter.")
    replace_prefix(doc, "3: Thêm threshold", "3: Chạy RP4 trên router_test_v1.json: RULE, LLM, HYBRID và các ablation; không tune tiếp trên chính test set.")
    replace_prefix(doc, "4: Chạy so sánh", "4: Chạy RP5: POOLED, ORACLE, HYBRID cùng 60 prompts; tách replay và chấm bằng Model Eval/Gemini Judge.")
    replace_prefix(doc, "5: Phân tích lỗi", "5: Phân tích errors và report confidence/latency/LLM-call rate; với RP5 phân tích Socratic, factuality, overall và generation latency.")
    replace_prefix(doc, "6: Chuẩn bị phần", "6: Cập nhật Report 4 bằng setup, dataset split, công thức metric và ablation; cập nhật Report 5 bằng bảng kết quả, error analysis và limitations.")

    # Keep the leading status paragraph near the title visually distinct.
    status.paragraph_format.space_after = intro_heading.paragraph_format.space_after
    doc.save(SOURCE)
    print(f"Updated: {SOURCE}")
    print(f"Backup: {BACKUP}")


if __name__ == "__main__":
    main()
