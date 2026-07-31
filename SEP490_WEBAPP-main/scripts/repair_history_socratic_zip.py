"""In-place Socratic repair for the existing Vietnamese History training ZIP.

The public-source question, split, IDs, and sealed test remain untouched.
Only the teacher target in train/validation is replaced with a context-sensitive
first-turn Socratic move; direct historical facts are not copied into the
model-visible target.
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


HISTORY_PROMPT = """Bạn là gia sư Socratic môn Lịch sử bằng tiếng Việt cho học sinh THPT.

Mục tiêu của bạn là giúp học sinh tự phân tích và kiểm chứng kiến thức lịch sử, không chỉ ghi nhớ đáp án. Với mỗi lượt trả lời, hãy xác định học sinh đang hỏi về sự kiện, nhân vật, mốc thời gian, nguyên nhân-kết quả, ý nghĩa lịch sử hoặc có nhận định chưa chính xác. Đưa một gợi ý ngắn, chính xác và kết thúc bằng đúng một câu hỏi cụ thể để học sinh tự suy luận bước tiếp theo.

Không đưa đáp án hoàn chỉnh, không kể lại toàn bộ sự kiện, không liệt kê nhiều ý cùng lúc và không bịa mốc thời gian, nhân vật, tư liệu hay quan hệ nhân quả. Nếu học sinh đã nêu câu trả lời, chỉ ra một điểm cần kiểm tra và yêu cầu học sinh đối chiếu với sự kiện hoặc mốc thời gian liên quan. Nếu chưa chắc chắn về dữ kiện, hãy nói rõ giới hạn thay vì suy đoán.

Phản hồi bằng tiếng Việt tự nhiên, tối đa 100 từ. Không dùng nhãn như [SCAF], [HINT], [DIRECT_ANSWER], không viết phần suy nghĩ nội bộ."""

TAG_PREFIX = re.compile(r"^\s*\[(?:SCAF|HINT|LOGIC_BREAKDOWN|IDENTIFY_INCORRECT_ANSWER|DIRECT_ANSWER|CONCEPT_CLARIFY)\]\s*", re.I)


def js_hash(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def message_by_role(record: dict, role: str) -> dict | None:
    return next((message for message in record.get("messages", []) if message.get("role") == role), None)


def history_hint(user_text: str, index: int) -> str:
    """Generate a varied, question-specific first turn without leaking facts."""
    query = re.sub(r"^\s*\[[^\]]+\]\s*", "", str(user_text or "")).strip()
    lower = query.lower()
    # The templates map to distinct historical reasoning operations, rather
    # than repeating a generic "hãy suy nghĩ" sentence for every record.
    if any(word in lower for word in ("nguyên nhân", "vì sao", "tại sao", "do đâu")):
        return (
            "Em hãy tách bối cảnh trước sự kiện thành nguyên nhân gần và nguyên nhân sâu xa trước. "
            "Theo em, yếu tố nào cần kiểm tra đầu tiên để giải thích vì sao sự kiện xảy ra?"
        )
    if any(word in lower for word in ("ý nghĩa", "vai trò", "đóng góp", "quan trọng", "tác động", "ảnh hưởng")):
        return (
            "Thay vì nêu ngay ý nghĩa, em hãy so sánh tình hình trước và sau sự kiện được hỏi. "
            "Theo em, thay đổi quan trọng nhất cần dùng làm bằng chứng là gì?"
        )
    if any(word in lower for word in ("năm", "khi nào", "mốc thời gian", "niên đại")):
        return (
            "Em hãy đặt nội dung được hỏi lên một trục thời gian và xác định giai đoạn lịch sử liên quan. "
            "Theo em, mốc hoặc biến cố nào nên được đối chiếu trước?"
        )
    if any(word in lower for word in ("ai", "nhân vật", "lãnh đạo", "vua", "tướng")):
        return (
            "Em hãy xác định chủ thể trực tiếp và bối cảnh họ hành động trước khi nêu tên nhân vật. "
            "Theo em, nhân vật hoặc lực lượng nào có vai trò cần kiểm tra đầu tiên?"
        )
    if any(word in lower for word in ("kết quả", "hệ quả", "thành công", "thất bại")):
        return (
            "Em hãy phân biệt kết quả trực tiếp của sự kiện với ý nghĩa lâu dài của nó. "
            "Theo em, kết quả xảy ra ngay sau sự kiện là gì?"
        )
    if any(word in lower for word in ("so sánh", "khác nhau", "giống nhau")):
        return (
            "Em hãy chọn một tiêu chí chung như bối cảnh, lực lượng, mục tiêu hoặc kết quả để đối chiếu. "
            "Theo em, tiêu chí nào nên được so sánh trước?"
        )
    if any(word in lower for word in ("trình bày", "kể", "tóm tắt", "diễn biến")):
        return (
            "Em hãy xác định lần lượt bối cảnh, chủ thể và diễn biến chính thay vì kể ngay toàn bộ sự kiện. "
            "Theo em, yếu tố nào cần nêu đầu tiên để mở đầu câu trả lời?"
        )
    variants = [
        "Em hãy xác định bối cảnh lịch sử và chủ thể liên quan trước. Theo em, chi tiết nào trong câu hỏi cần kiểm tra đầu tiên?",
        "Hãy thử liên hệ nội dung được hỏi với giai đoạn lịch sử rộng hơn. Theo em, mối liên hệ nào giúp em suy luận câu trả lời?",
        "Em hãy tách câu hỏi thành mốc thời gian, chủ thể và hệ quả. Theo em, phần nào em đã chắc chắn nhất để bắt đầu?",
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
        assistant["content"] = history_hint(str(user.get("content") if user else ""), index)
        if system:
            system["content"] = HISTORY_PROMPT
        rewritten += 1
    return repaired, rewritten


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--backup-suffix", default=".before-history-socratic-strict-v1.zip")
    args = parser.parse_args()
    target = args.zip_path.resolve()
    backup = target.with_name(target.stem + args.backup_suffix)
    if not target.exists() or target.suffix.lower() != ".zip":
        raise SystemExit(f"ZIP not found: {target}")
    if backup.exists():
        raise SystemExit(f"Backup already exists; refusing to overwrite it: {backup}")

    with zipfile.ZipFile(target, "r") as archive:
        names = archive.namelist()
        metadata_name = next(name for name in names if name.endswith("_metadata.json"))
        train_name = next(name for name in names if name.endswith("train_dataset.json"))
        validation_name = next(name for name in names if name.endswith("validation_dataset.json"))
        test_name = next(name for name in names if name.endswith("test_dataset.json"))
        original = {name: archive.read(name) for name in names if not name.endswith("/")}

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
        "version": "HISTORY_SOCRATIC_STRICT_V1",
        "performedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "train_and_validation_only",
        "trainingPromptVersion": "P_HISTORY_SOCRATIC_STRICT_V1",
        "rewrittenTargets": {"train": train_rewritten, "validation": validation_rewritten},
        "preserved": ["source_questions", "conversation_id", "split_assignment", "source_provenance", "locked_test"],
        "lockedTestHashUnchanged": test_hash,
        "policy": "A first-turn target gives one bounded historical-reasoning cue and one question; it does not reveal the requested historical fact or full explanation.",
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


if __name__ == "__main__":
    main()
