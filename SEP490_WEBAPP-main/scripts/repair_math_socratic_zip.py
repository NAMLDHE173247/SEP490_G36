"""Repair Socratic-policy conflicts in the existing Mathematics training ZIP.

This is intentionally an in-place dataset repair: source questions, item IDs,
splits, source provenance, and the locked test file remain unchanged.  Only
assistant targets in the train/validation partitions are made policy-consistent.
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


POLICY_CONFLICT_TAGS = {
    "[DIRECT_ANSWER]",
    "[LOGIC_BREAKDOWN]",
    "[CONCEPT_CLARIFY]",
    "[IDENTIFY_INCORRECT_ANSWER]",
}
TAG_PREFIX = re.compile(r"^\s*\[(?:SCAF|HINT|LOGIC_BREAKDOWN|IDENTIFY_INCORRECT_ANSWER|DIRECT_ANSWER|CONCEPT_CLARIFY)\]\s*", re.I)


def js_hash(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def message_by_role(record: dict, role: str) -> dict | None:
    return next((item for item in record.get("messages", []) if item.get("role") == role), None)


def normalize_good_target(text: str) -> str:
    cleaned = TAG_PREFIX.sub("", str(text or "")).strip()
    if not cleaned:
        return "Em hãy xác định dữ kiện hoặc khái niệm then chốt trước. Theo em, bước đầu tiên cần làm là gì?"
    # Preserve a good existing hint but make the learner action explicit when
    # the target has no question at all.
    if "?" not in cleaned:
        cleaned = cleaned.rstrip(". ") + ". Em sẽ bắt đầu từ đâu?"
    return cleaned


def socratic_rewrite(user_text: str, old_target: str) -> str:
    """Turn an answer-first target into a bounded first-turn tutoring move.

    The source question is deliberately retained only as context; no answer,
    formula, calculation, or conclusion from the old target is copied.
    """
    query = re.sub(r"^\s*\[[^\]]+\]\s*", "", str(user_text or "")).strip()
    query = re.sub(r"\s+", " ", query)
    lower = query.lower()
    if "tích phân" in lower or "nguyên hàm" in lower:
        return (
            "Trước khi tính kết quả, em hãy xác định nguyên hàm của từng hạng tử hoặc hàm số trước. "
            "Em nhớ quy tắc nguyên hàm phù hợp là gì không?"
        )
    if "đạo hàm" in lower:
        return (
            "Em hãy xác định đây có phải hàm hợp hay không rồi chọn quy tắc đạo hàm phù hợp. "
            "Theo em, biểu thức nào cần lấy đạo hàm trước?"
        )
    if "log" in lower or "logarit" in lower:
        return (
            "Với biểu thức logarit, em hãy kiểm tra điều kiện để các biểu thức bên trong logarit có nghĩa trước. "
            "Em tìm được điều kiện nào cho biến?"
        )
    if "bất phương trình" in lower:
        return (
            "Em hãy kiểm tra điều kiện xác định rồi đưa bất phương trình về dạng dễ so sánh hơn. "
            "Theo em, điều kiện hoặc phép biến đổi đầu tiên là gì?"
        )
    if "phương trình" in lower:
        return (
            "Em hãy nhận dạng dạng phương trình và xác định điều kiện cần thiết trước khi biến đổi. "
            "Theo em, bước đầu tiên để đưa phương trình về dạng quen thuộc là gì?"
        )
    if "tỉ lệ thức" in lower:
        return (
            "Em hãy viết lại tỉ lệ thức và thử kiểm tra mối quan hệ giữa các số hạng bằng phép nhân chéo. "
            "Hai tích em cần so sánh là những tích nào?"
        )
    if "xác suất" in lower:
        return (
            "Em hãy xác định không gian mẫu và biến cố cần xét trước khi tính. "
            "Theo em, có bao nhiêu kết quả có thể xảy ra và bao nhiêu kết quả thuận lợi?"
        )
    if any(token in lower for token in ("diện tích", "tam giác", "hình thang", "đường tròn", "hình hộp", "hình chóp")):
        return (
            "Em hãy phác thảo hình và ghi rõ những đại lượng đã biết, đại lượng cần tìm trước. "
            "Theo em, công thức nào có liên quan trực tiếp nhất đến bài toán?"
        )
    if any(token in lower for token in ("định nghĩa", "là gì", "khái niệm", "tính chất", "quy tắc")):
        return (
            "Trước khi kết luận, em hãy nhắc lại bằng lời của mình khái niệm hoặc quy tắc liên quan. "
            "Theo em, đặc điểm quan trọng nhất để nhận ra nó là gì?"
        )
    if any(token in lower for token in ("chứng minh", "đúng không", "sai ở đâu", "bạn em")):
        return (
            "Em hãy khoan kết luận ngay và kiểm tra lại giả thiết cùng quy tắc đang áp dụng. "
            "Theo em, bước nào trong lập luận cần được xem lại trước?"
        )
    return (
        "Em hãy xác định dữ kiện, đại lượng cần tìm và quy tắc hoặc công thức có thể liên quan trước. "
        "Theo em, bước đầu tiên để bắt đầu giải là gì?"
    )


def repair_partition(records: list[dict]) -> tuple[list[dict], dict[str, int]]:
    repaired = copy.deepcopy(records)
    counts = {"rewritten": 0, "tag_removed": 0, "question_appended": 0}
    for record in repaired:
        assistant = message_by_role(record, "assistant")
        user = message_by_role(record, "user")
        if not assistant:
            continue
        original = str(assistant.get("content") or "")
        tag_match = re.match(r"^\s*(\[[^\]]+\])", original)
        tag = tag_match.group(1).upper() if tag_match else ""
        is_answer_first = (
            tag in {"[DIRECT_ANSWER]", "[LOGIC_BREAKDOWN]", "[IDENTIFY_INCORRECT_ANSWER]"}
            or (tag == "[CONCEPT_CLARIFY]" and "?" not in original)
        )
        if is_answer_first:
            assistant["content"] = socratic_rewrite(
                str(user.get("content") if user else ""), original
            )
            counts["rewritten"] += 1
            continue
        normalized = normalize_good_target(original)
        if normalized != original:
            counts["tag_removed"] += int(bool(tag_match))
            counts["question_appended"] += int("?" not in original and "?" in normalized)
            assistant["content"] = normalized
    return repaired, counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--backup-suffix", default=".pre-socratic-repair.zip")
    args = parser.parse_args()

    target = args.zip_path.resolve()
    if not target.exists() or target.suffix.lower() != ".zip":
        raise SystemExit(f"ZIP not found: {target}")
    backup = target.with_name(target.stem + args.backup_suffix)
    if backup.exists():
        raise SystemExit(f"Backup already exists; refusing to overwrite it: {backup}")

    with zipfile.ZipFile(target, "r") as source:
        names = source.namelist()
        metadata_name = next(name for name in names if name.endswith("_metadata.json"))
        train_name = next(name for name in names if name.endswith("train_dataset.json"))
        validation_name = next(name for name in names if name.endswith("validation_dataset.json"))
        test_name = next(name for name in names if name.endswith("test_dataset.json"))
        original_bytes = {name: source.read(name) for name in names if not name.endswith("/")}

    metadata = json.loads(original_bytes[metadata_name])
    train_before = json.loads(original_bytes[train_name])
    validation_before = json.loads(original_bytes[validation_name])
    test_before = json.loads(original_bytes[test_name])
    train_after, train_counts = repair_partition(train_before)
    validation_after, validation_counts = repair_partition(validation_before)

    test_hash_before = js_hash(test_before)
    if test_hash_before != metadata.get("datasetHashes", {}).get("test_sha256"):
        raise SystemExit("Test hash does not match metadata; refusing to modify the archive.")

    metadata["datasetHashes"]["train_sha256"] = js_hash(train_after)
    metadata["datasetHashes"]["validation_sha256"] = js_hash(validation_after)
    metadata["datasetHashes"]["test_sha256"] = test_hash_before
    metadata["socraticPolicyRepair"] = {
        "version": "MATH_SOCRATIC_STRICT_V1",
        "performedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "train_and_validation_only",
        "preserved": ["source_questions", "conversation_id", "split_assignment", "source_provenance", "locked_test"],
        "train": train_counts,
        "validation": validation_counts,
        "lockedTestHashUnchanged": test_hash_before,
        "policy": "No direct answer, full worked solution, or concept definition in a first-turn tutoring target; retain one bounded learner-facing question.",
    }

    replacements = {
        metadata_name: json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
        train_name: json.dumps(train_after, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        validation_name: json.dumps(validation_after, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        # Preserve the locked test bytes exactly, including its existing hash.
        test_name: original_bytes[test_name],
    }

    shutil.copy2(target, backup)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=target.parent) as tmp_file:
        temp_path = Path(tmp_file.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for name in names:
                if name.endswith("/"):
                    output.writestr(name, b"")
                else:
                    output.writestr(name, replacements.get(name, original_bytes[name]))
        temp_path.replace(target)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    print(json.dumps({
        "updated": str(target),
        "backup": str(backup),
        "counts": {"train": train_counts, "validation": validation_counts},
        "test_hash": test_hash_before,
        "counts_preserved": {
            "train": len(train_after), "validation": len(validation_after), "test": len(test_before),
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
