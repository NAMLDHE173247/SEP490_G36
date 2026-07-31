"""Repair English SFT targets with passage-specific Socratic evidence cues.

The locked test split is copied byte-for-byte. Train/validation targets are
rebuilt from each record's own Article/Question, never from an answer option.
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


PROMPT = """Bạn là gia sư Socratic môn Tiếng Anh bằng tiếng Việt cho học sinh THPT.

Mục tiêu là giúp học sinh hiểu bằng chứng trong bài đọc, từ vựng, ngữ pháp và cách lập luận; không chỉ chọn đáp án. Với câu đọc hiểu, hãy nêu hoặc trích tối đa một chi tiết ngắn có thật trong bài đọc, giải thích ngắn chi tiết đó liên quan đến câu hỏi ra sao, rồi kết thúc bằng đúng một câu hỏi để học sinh tự suy luận. Với ngữ pháp hoặc từ vựng, hãy chỉ ra tối đa một từ khóa hoặc cấu trúc cần kiểm tra rồi hỏi học sinh áp dụng nó.

Không nêu đáp án A/B/C/D, không liệt kê toàn bộ đáp án, không dịch hay tóm tắt toàn bộ bài đọc và không bịa chi tiết không có trong đề. Nếu học sinh đã nêu đáp án, yêu cầu em đối chiếu với một câu hoặc từ khóa trong bài. Phản hồi bằng tiếng Việt tự nhiên, tối đa 120 từ, không dùng nhãn như [SCAF], [HINT] hay [DIRECT_ANSWER]."""

TAG = re.compile(r"^\s*\[[^\]]+\]\s*", re.S)
STOP = {
    "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "to", "of", "and", "or", "in", "on", "at", "for", "with", "from", "by", "about", "what", "which", "who", "where", "when", "why", "how", "that", "this", "these", "those", "following", "according", "passage", "article", "question", "best", "main", "can", "be", "it", "its", "as", "than", "not", "true", "false",
}


def js_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def message(record: dict, role: str) -> dict | None:
    return next((m for m in record.get("messages", []) if m.get("role") == role), None)


def clean(text: str) -> str:
    return TAG.sub("", str(text or "")).strip()


def parts(text: str) -> tuple[str, str]:
    text = clean(text)
    article_match = re.search(r"\b(?:Article|Passage)\s*:\s*", text, re.I)
    question_match = re.search(r"\bQuestion\s*:\s*", text, re.I)
    options_match = re.search(r"\bOptions\s*:\s*", text, re.I)
    if article_match and question_match:
        article = text[article_match.end():question_match.start()].strip()
        end = options_match.start() if options_match and options_match.start() > question_match.end() else len(text)
        return article, text[question_match.end():end].strip()
    return "", text


def words(text: str) -> set[str]:
    return {w.lower() for w in re.findall(r"[A-Za-z]{3,}", text) if w.lower() not in STOP}


def compact(text: str, limit: int = 190) -> str:
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def evidence_sentence(article: str, question: str, index: int) -> str:
    sentences = [compact(s, 220) for s in re.split(r"(?<=[.!?])\s+", article) if len(s.strip()) > 12]
    if not sentences:
        return compact(article, 190)
    q_words = words(question)
    scored = [(len(words(sentence) & q_words), -abs(pos - len(sentences) // 2), sentence) for pos, sentence in enumerate(sentences)]
    scored.sort(reverse=True)
    return scored[0][2] if scored[0][0] > 0 else sentences[index % len(sentences)]


def target(user_text: str, index: int) -> str:
    article, question = parts(user_text)
    if article:
        evidence = evidence_sentence(article, question, index)
        question_short = compact(question, 120)
        variants = [
            f"Em hãy đọc lại chi tiết: “{evidence}”. Chi tiết này cho em bằng chứng gì để trả lời câu hỏi “{question_short}”?",
            f"Trong bài có câu: “{evidence}”. Em hãy đối chiếu câu này với yêu cầu “{question_short}”; em suy ra được điều gì?",
            f"Đừng chọn đáp án vội; hãy dùng chi tiết “{evidence}” làm điểm xuất phát. Nó liên quan thế nào đến câu hỏi “{question_short}”?",
        ]
        return variants[index % len(variants)]
    query = compact(clean(user_text), 140)
    return f"Hãy xác định một từ khóa hoặc cấu trúc quan trọng trong yêu cầu “{query}” trước. Em sẽ kiểm tra chi tiết nào đầu tiên?"


def repair(records: list[dict]) -> tuple[list[dict], int]:
    result = copy.deepcopy(records)
    count = 0
    for index, record in enumerate(result):
        assistant, user, system = message(record, "assistant"), message(record, "user"), message(record, "system")
        if not assistant:
            continue
        assistant["content"] = target(str(user.get("content") if user else ""), index)
        if system:
            system["content"] = PROMPT
        count += 1
    return result, count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--backup-suffix", default=".before-english-contextual-v2.zip")
    args = parser.parse_args()
    target_zip = args.zip_path.resolve()
    backup = target_zip.with_name(target_zip.stem + args.backup_suffix)
    if backup.exists():
        raise SystemExit(f"Backup exists: {backup}")
    with zipfile.ZipFile(target_zip) as archive:
        names = archive.namelist()
        meta_name = next(n for n in names if n.endswith("_metadata.json"))
        train_name = next(n for n in names if n.endswith("train_dataset.json"))
        val_name = next(n for n in names if n.endswith("validation_dataset.json"))
        test_name = next(n for n in names if n.endswith("test_dataset.json"))
        original = {n: archive.read(n) for n in names if not n.endswith("/")}
    meta = json.loads(original[meta_name])
    train, val, test = json.loads(original[train_name]), json.loads(original[val_name]), json.loads(original[test_name])
    test_hash = js_hash(test)
    if test_hash != meta.get("datasetHashes", {}).get("test_sha256"):
        raise SystemExit("Locked test hash mismatch; refusing to write.")
    train_new, train_count = repair(train)
    val_new, val_count = repair(val)
    meta["datasetHashes"].update({"train_sha256": js_hash(train_new), "validation_sha256": js_hash(val_new), "test_sha256": test_hash})
    meta["socraticPolicyRepair"] = {
        "version": "ENGLISH_CONTEXTUAL_SOCRATIC_V2",
        "performedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "train_and_validation_only",
        "trainingPromptVersion": "P_ENGLISH_CONTEXTUAL_SOCRATIC_V2",
        "rewrittenTargets": {"train": train_count, "validation": val_count},
        "policy": "Each reading-comprehension target cites one short source passage detail and asks one evidence-based question; no answer option is named.",
        "lockedTestHashUnchanged": test_hash,
    }
    changed = {
        meta_name: json.dumps(meta, ensure_ascii=False, indent=2).encode(),
        train_name: json.dumps(train_new, ensure_ascii=False, separators=(",", ":")).encode(),
        val_name: json.dumps(val_new, ensure_ascii=False, separators=(",", ":")).encode(),
        test_name: original[test_name],
    }
    shutil.copy2(target_zip, backup)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=target_zip.parent) as temp:
        temp_path = Path(temp.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as out:
            for name in names:
                out.writestr(name, b"" if name.endswith("/") else changed.get(name, original[name]))
        temp_path.replace(target_zip)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    print(json.dumps({"updated": str(target_zip), "backup": str(backup), "rewritten": {"train": train_count, "validation": val_count}, "locked_test_sha256": test_hash}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
