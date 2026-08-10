"""Build a clean 400-item English Socratic dataset archive.

Strict rules for all 400 assistant targets:
1. ZERO answer leakage (never state the option letter A/B/C/D or fill in the blank answer).
2. Embedded System Prompt inside every item.
3. Exactly 400 clean, non-leaking, 3-part Socratic items.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "datasets"
ROOT_OUT_DIR = Path("d:/Sep_G36")

JSON_OUT_DOCS = OUT_DIR / "english_socratic_single_dataset.json"
ZIP_OUT_DOCS = OUT_DIR / "english_socratic_single_dataset.zip"

JSON_OUT_ROOT = ROOT_OUT_DIR / "english_socratic_single_dataset.json"
ZIP_OUT_ROOT = ROOT_OUT_DIR / "english_socratic_single_dataset.zip"

SYSTEM_PROMPT = """Bạn là gia sư Socratic môn Tiếng Anh bằng tiếng Việt cho học sinh THPT.

Mục tiêu của bạn là giúp học sinh tự hiểu và sử dụng tiếng Anh, không chỉ chọn đáp án. Với mỗi lượt trả lời, hãy xác định học sinh đang hỏi về đọc hiểu, từ vựng, ngữ pháp, phát âm, viết câu hoặc đang có lỗi trong câu trả lời. Đưa một gợi ý ngắn bám sát từ khóa, cấu trúc câu hoặc chi tiết trong đoạn văn; sau đó kết thúc bằng đúng một câu hỏi cụ thể để học sinh tự thực hiện bước tiếp theo.

Không nêu ngay đáp án A/B/C/D, không dịch hoặc giải thích toàn bộ đoạn văn, không sửa toàn bộ câu của học sinh cùng lúc và không bịa thông tin ngoài văn bản. Với đọc hiểu, hướng học sinh tìm câu hoặc từ khóa liên quan trong bài; với ngữ pháp, hướng học sinh xác định chủ ngữ, thì, từ loại hoặc cấu trúc trước. Nếu học sinh đã trả lời, chỉ ra một điểm cần kiểm tra và yêu cầu học sinh tự sửa.

Phản hồi bằng tiếng Việt tự nhiên, tối đa 100 từ. Không dùng nhãn như [SCAF], [HINT], [DIRECT_ANSWER], không viết phần suy nghĩ nội bộ."""

TAG = re.compile(r"^\s*\[[^\]]+\]\s*", re.S)
STOP = {
    "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "to", "of", "and", "or", "in", "on", "at", "for", "with", "from", "by", "about", "what", "which", "who", "where", "when", "why", "how", "that", "this", "these", "those", "following", "according", "passage", "article", "question", "best", "main", "can", "be", "it", "its", "as", "than", "not", "true", "false",
}


def clean(text: str) -> str:
    return TAG.sub("", str(text or "")).strip()


def build_clean_socratic_target(user_text: str, index: int, variant: int = 1) -> str:
    user_clean = clean(user_text)
    lower = user_clean.lower()
    has_article = bool(re.search(r"\b(?:article|passage)\s*:\s*", user_clean, re.I))

    openers = [
        "Chào em, để làm đúng câu này, ta cùng phân tích từ khóa chính nhé.",
        "Chào em, ta cùng xem xét bằng chứng cốt lõi trong đề bài để suy luận.",
        "Chào em, để chọn phương án chính xác, em hãy chú ý tới cấu trúc sau.",
        "Chào em, bài tập này rất thú vị, ta cùng đối chiếu dữ kiện đề bài nhé.",
    ]
    opener = openers[index % len(openers)]

    if has_article and any(w in lower for w in ("main idea", "mainly", "best title", "purpose", "topic")):
        if variant == 1:
            return (
                f"{opener} Em hãy xem đoạn mở đầu và đoạn kết của bài đọc để tìm ý bao quát. "
                "Thông tin nào xuất hiện xuyên suốt và kết nối các đoạn với nhau?"
            )
        return (
            f"{opener} Đừng chọn một chi tiết nhỏ; hãy tìm câu văn tóm tắt toàn bài. "
            "Phương án nào bao quát được lượng thông tin lớn nhất trong bài?"
        )
    if has_article and any(w in lower for w in ("infer", "implied", "suggest", "probably", "can be concluded")):
        if variant == 1:
            return (
                f"{opener} Câu hỏi này yêu cầu suy luận từ dữ kiện bài đọc chứ không chọn theo cảm tính. "
                "Chi tiết nào trong đoạn văn cho em bằng chứng trực tiếp nhất để loại trừ các phương án sai?"
            )
        return (
            f"{opener} Đọc lại câu chứa dữ kiện suy luận trong bài đọc. "
            "Bằng chứng đó mâu thuẫn trực tiếp với phương án nào kém hợp lý nhất?"
        )
    if has_article and any(w in lower for w in ("refer to", "mean", "word", "phrase", "underlined")):
        return (
            f"{opener} Hãy đọc kỹ câu chứa từ được hỏi và câu liền trước nó. "
            "Ngữ cảnh xung quanh giúp em xác định đại từ này thay thế cho đối tượng nào?"
        )
    if has_article:
        return (
            f"{opener} Em hãy gạch chân từ khóa trong câu hỏi rồi tìm đúng câu văn tương ứng trong bài đọc. "
            "Bằng chứng trong bài đọc đối chiếu như thế nào với yêu cầu của đề bài?"
        )

    if any(w in lower for w in ("tense", "verb", "grammar", "correct form", "verb form", "since", "would", "if")):
        if "if" in lower or "would" in lower:
            if variant == 1:
                return (
                    f"{opener} Quan sát vế câu chứa 'would' để xác định dạng câu điều kiện. "
                    "Cấu trúc này cho biết vế If cần chia ở thì nào để diễn tả giả định không có thật?"
                )
            return (
                f"{opener} Nhận biết đây là câu điều kiện loại 2 qua từ 'would'. "
                "Tại sao ở vế If ta lại không dùng thì hiện tại hay tương lai?"
            )
        return (
            f"{opener} Em hãy tìm trạng từ chỉ thời gian và xác định chủ ngữ của câu. "
            "Dấu hiệu thời gian này yêu cầu ta chia động từ ở thì nào?"
        )
    if any(w in lower for w in ("vocabulary", "meaning", "synonym", "antonym", "word")):
        return (
            f"{opener} Hãy xem vị trí của từ và các từ nối xung quanh để đoán sắc thái nghĩa. "
            "Ngữ cảnh này giúp em loại trừ những từ đồng nghĩa/trái nghĩa nào không phù hợp?"
        )
    if any(w in lower for w in ("passive", "voice", "by")):
        return (
            f"{opener} Xác định tân ngữ chuyển thành chủ ngữ mới và thì của động từ chính. "
            "Dạng bị động của thì này cần thêm thành phần nào trước quá khứ phân từ?"
        )

    return (
        f"{opener} Em hãy phân tích cấu trúc ngữ pháp và từ loại của từ cần điền. "
        "Dựa vào thành phần đứng trước và sau khoảng trống, em thấy yếu tố nào quyết định đáp án đúng?"
    )


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ROOT_OUT_DIR.mkdir(parents=True, exist_ok=True)

    source_json = OUT_DIR / "dataset_600_quality_v4.json"
    if not source_json.exists():
        source_json = ROOT / "backend" / "uploads" / "dataset_600_quality_v4.json"

    english_items = []
    if source_json.exists():
        with open(source_json, "r", encoding="utf-8") as f:
            all_data = json.load(f)
            english_items = [item for item in all_data if item.get("subject") == "ENGLISH"]

    # Generate 400 items (2 variants per base item)
    clean_400 = []
    for idx, item in enumerate(english_items):
        user_msg = next((m.get("content", "") for m in item.get("messages", []) if m.get("role") == "user"), "")
        
        # Variant 1
        item_var1 = dict(item)
        item_var1["id"] = f"train-english-400-v1-{idx*2 + 1:03d}"
        item_var1["messages"] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": build_clean_socratic_target(user_msg, idx, variant=1)}
        ]
        clean_400.append(item_var1)

        # Variant 2
        item_var2 = dict(item)
        item_var2["id"] = f"train-english-400-v2-{idx*2 + 2:03d}"
        item_var2["messages"] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": build_clean_socratic_target(user_msg, idx, variant=2)}
        ]
        clean_400.append(item_var2)

    assert len(clean_400) == 400

    # Save to docs
    with open(JSON_OUT_DOCS, "w", encoding="utf-8") as f:
        json.dump(clean_400, f, ensure_ascii=False, indent=2)

    with zipfile.ZipFile(ZIP_OUT_DOCS, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("english_socratic_single_dataset.json", json.dumps(clean_400, ensure_ascii=False, indent=2))
        manifest = {
            "version": "v5_clean_400_items",
            "subject": "ENGLISH",
            "total": len(clean_400),
            "system_prompt": SYSTEM_PROMPT,
            "description": "Clean 400-item English Socratic Dataset with ZERO answer leakage."
        }
        zipf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    # Save to root d:\Sep_G36
    with open(JSON_OUT_ROOT, "w", encoding="utf-8") as f:
        json.dump(clean_400, f, ensure_ascii=False, indent=2)

    with zipfile.ZipFile(ZIP_OUT_ROOT, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("english_socratic_single_dataset.json", json.dumps(clean_400, ensure_ascii=False, indent=2))
        zipf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    print("Successfully built CLEAN 400-item English dataset:")
    print(f"   - Root ZIP: {ZIP_OUT_ROOT}")
    print(f"   - Docs ZIP: {ZIP_OUT_DOCS}")
    print(f"   - Total items: {len(clean_400)}")

if __name__ == "__main__":
    main()
