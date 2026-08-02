"""In-place Socratic repair for the existing English training ZIP.

The public-source questions, split, IDs and locked test set remain untouched.
Only train/validation targets are replaced so that the fine-tuned model learns
one bounded English-learning cue and one question, without leaking A/B/C/D.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path


ENGLISH_PROMPT = """Bạn là gia sư Socratic môn Tiếng Anh bằng tiếng Việt cho học sinh THPT.

Mục tiêu của bạn là giúp học sinh tự hiểu và sử dụng tiếng Anh, không chỉ chọn đáp án. Với mỗi lượt trả lời, hãy xác định học sinh đang hỏi về đọc hiểu, từ vựng, ngữ pháp, phát âm, viết câu hoặc đang có lỗi trong câu trả lời. Đưa một gợi ý ngắn bám sát từ khóa, cấu trúc câu hoặc chi tiết trong đoạn văn; sau đó kết thúc bằng đúng một câu hỏi cụ thể để học sinh tự thực hiện bước tiếp theo.

Không nêu ngay đáp án A/B/C/D, không dịch hoặc giải thích toàn bộ đoạn văn, không sửa toàn bộ câu của học sinh cùng lúc và không bịa thông tin ngoài văn bản. Với đọc hiểu, hướng học sinh tìm câu hoặc từ khóa liên quan trong bài; với ngữ pháp, hướng học sinh xác định chủ ngữ, thì, từ loại hoặc cấu trúc trước. Nếu học sinh đã trả lời, chỉ ra một điểm cần kiểm tra và yêu cầu học sinh tự sửa.

Phản hồi bằng tiếng Việt tự nhiên, tối đa 100 từ. Không dùng nhãn như [SCAF], [HINT], [DIRECT_ANSWER], không viết phần suy nghĩ nội bộ."""


def js_hash(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def message_by_role(record: dict, role: str) -> dict | None:
    return next((m for m in record.get("messages", []) if m.get("role") == role), None)


def question_text(user_text: str) -> str:
    match = re.search(r"(?:^|\n)Question\s*:\s*(.*)$", user_text, re.I | re.S)
    return match.group(1).strip() if match else user_text.strip()


def english_hint(user_text: str, index: int) -> str:
    """Generate a varied first-turn English-learning cue without answer leakage."""
    task = question_text(user_text)
    lower = task.lower()
    has_article = bool(re.search(r"(?:^|\n)(?:article|passage)\s*:", user_text, re.I))

    # RACE-derived records are primarily reading-comprehension items.  The
    # templates teach an evidence-finding operation, not a particular option.
    if has_article and any(w in lower for w in ("main idea", "mainly", "best title", "purpose", "topic")):
        return (
            "Em hãy nhìn phần mở đầu và kết đoạn để xác định chủ đề lặp lại, rồi phân biệt chủ đề với một chi tiết nhỏ. "
            "Theo em, ý nào bao quát được nhiều chi tiết trong bài nhất?"
        )
    if has_article and any(w in lower for w in ("infer", "implied", "suggest", "probably", "can be concluded")):
        return (
            "Câu này cần suy luận từ bằng chứng trong bài, không chọn theo cảm giác. "
            "Chi tiết nào trong đoạn văn cho em bằng chứng mạnh nhất cho suy luận của mình?"
        )
    if has_article and any(w in lower for w in ("refer to", "mean", "word", "phrase", "underlined")):
        return (
            "Hãy đọc câu chứa từ hoặc cụm từ được hỏi và cả một câu trước hoặc sau nó để xem ngữ cảnh. "
            "Theo em, từ nào xung quanh giúp xác định nghĩa hoặc đối tượng được nhắc đến?"
        )
    if has_article and any(w in lower for w in ("according to", "mentioned", "true", "not true", "which of the following")):
        return (
            "Đừng chọn đáp án trước; hãy gạch chân từ khóa của câu hỏi rồi tìm đúng câu mang thông tin tương ứng trong bài. "
            "Em tìm được câu hoặc cụm từ nào trong bài làm bằng chứng?"
        )
    if has_article:
        variants = [
            "Hãy xác định từ khóa trong câu hỏi rồi quay lại đoạn văn tìm câu diễn đạt cùng ý, không cần chọn đáp án ngay. Em thấy bằng chứng nằm ở câu nào?",
            "Em thử tách câu hỏi thành người, sự việc và chi tiết cần tìm; sau đó đối chiếu từng phần với bài đọc. Chi tiết nào khớp trực tiếp nhất?",
            "Với đọc hiểu, bằng chứng phải nằm trong văn bản hoặc là suy luận rất gần từ văn bản. Em sẽ dùng chi tiết nào để bảo vệ lựa chọn của mình?",
        ]
        return variants[index % len(variants)]

    if any(w in lower for w in ("tense", "verb", "grammar", "correct form", "verb form")):
        return (
            "Hãy xác định chủ ngữ và dấu hiệu thời gian trước, vì hai điểm này quyết định dạng động từ. "
            "Chủ ngữ là gì và dấu hiệu nào cho em biết nên dùng thì nào?"
        )
    if any(w in lower for w in ("vocabulary", "meaning", "synonym", "antonym", "word")):
        return (
            "Em hãy xem từ đó đứng cạnh những từ nào và nó đang giữ vai trò gì trong câu, thay vì dịch từng từ riêng lẻ. "
            "Ngữ cảnh xung quanh gợi cho em nghĩa hoặc từ loại nào?"
        )
    if any(w in lower for w in ("rewrite", "sentence", "writing", "error", "mistake")):
        return (
            "Đừng sửa cả câu một lúc; hãy kiểm tra trước chủ ngữ, động từ chính và trật tự từ. "
            "Em thấy thành phần nào của câu cần được kiểm tra đầu tiên?"
        )
    variants = [
        "Hãy bắt đầu bằng một từ khóa hoặc cấu trúc quyết định trong câu hỏi thay vì chọn đáp án ngay. Em muốn kiểm tra chi tiết nào trước?",
        "Em thử nói rõ bằng chứng ngôn ngữ nào khiến em nghiêng về một cách hiểu. Từ hoặc cấu trúc nào hỗ trợ lập luận của em?",
        "Hãy chia nhiệm vụ thành một bước nhỏ: xác định từ loại, cấu trúc hoặc chi tiết văn bản liên quan. Bước đầu tiên của em là gì?",
    ]
    return variants[index % len(variants)]


def repair_partition(records: list[dict]) -> tuple[list[dict], int]:
    repaired = copy.deepcopy(records)
    rewritten = 0
    for index, record in enumerate(repaired):
        assistant = message_by_role(record, "assistant")
        user = message_by_role(record, "user")
        system = message_by_role(record, "system")
        if not assistant:
            continue
        assistant["content"] = english_hint(str(user.get("content") if user else ""), index)
        if system:
            system["content"] = ENGLISH_PROMPT
        rewritten += 1
    return repaired, rewritten


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--backup-suffix", default=".before-english-socratic-strict-v1.zip")
    args = parser.parse_args()
    target = args.zip_path.resolve()
    backup = target.with_name(target.stem + args.backup_suffix)
    if not target.exists() or target.suffix.lower() != ".zip":
        raise SystemExit(f"ZIP not found: {target}")
    if backup.exists():
        raise SystemExit(f"Backup already exists; refusing to overwrite it: {backup}")

    with zipfile.ZipFile(target, "r") as archive:
        names = archive.namelist()
        metadata_name = next(n for n in names if n.endswith("_metadata.json"))
        train_name = next(n for n in names if n.endswith("train_dataset.json"))
        validation_name = next(n for n in names if n.endswith("validation_dataset.json"))
        test_name = next(n for n in names if n.endswith("test_dataset.json"))
        original = {n: archive.read(n) for n in names if not n.endswith("/")}

    metadata = json.loads(original[metadata_name])
    train_before = json.loads(original[train_name])
    validation_before = json.loads(original[validation_name])
    test_before = json.loads(original[test_name])
    test_hash = js_hash(test_before)
    if test_hash != metadata.get("datasetHashes", {}).get("test_sha256"):
        raise SystemExit("Test hash does not match metadata; refusing to modify archive.")

    train_after, train_rewritten = repair_partition(train_before)
    validation_after, validation_rewritten = repair_partition(validation_before)
    metadata["datasetHashes"]["train_sha256"] = js_hash(train_after)
    metadata["datasetHashes"]["validation_sha256"] = js_hash(validation_after)
    metadata["datasetHashes"]["test_sha256"] = test_hash
    metadata["socraticPolicyRepair"] = {
        "version": "ENGLISH_SOCRATIC_STRICT_V1",
        "performedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "train_and_validation_only",
        "trainingPromptVersion": "P_ENGLISH_SOCRATIC_STRICT_V1",
        "rewrittenTargets": {"train": train_rewritten, "validation": validation_rewritten},
        "preserved": ["source_questions", "conversation_id", "split_assignment", "source_provenance", "locked_test"],
        "lockedTestHashUnchanged": test_hash,
        "policy": "A first-turn target supplies one bounded English-learning cue and one question; it never reveals an option label or final answer.",
    }
    replacements = {
        metadata_name: json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
        train_name: json.dumps(train_after, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        validation_name: json.dumps(validation_after, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        test_name: original[test_name],
    }

    shutil.copy2(target, backup)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=target.parent) as temp:
        temp_path = Path(temp.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for name in names:
                output.writestr(name, b"" if name.endswith("/") else replacements.get(name, original[name]))
        temp_path.replace(target)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    print(json.dumps({
        "updated": str(target), "backup": str(backup),
        "train": len(train_after), "validation": len(validation_after), "test": len(test_before),
        "rewritten": {"train": train_rewritten, "validation": validation_rewritten},
        "locked_test_sha256": test_hash,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
