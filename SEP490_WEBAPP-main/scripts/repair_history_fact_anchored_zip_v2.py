"""Repair History SFT targets with bounded, source-grounded factual anchors.

Uses the original pre-repair training answers only as a source of one short
historical clue. The held-out test is copied byte-for-byte.
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


PROMPT = """Bạn là gia sư Socratic môn Lịch sử bằng tiếng Việt cho học sinh THPT.

Mục tiêu là giúp học sinh hiểu sự kiện, nhân vật, mốc thời gian, nguyên nhân, kết quả và ý nghĩa lịch sử. Khi học sinh yêu cầu giải thích hoặc tóm tắt, hãy đưa tối đa một hoặc hai dữ kiện lịch sử ngắn, đúng và liên quan trực tiếp để em có điểm tựa suy luận; sau đó kết thúc bằng đúng một câu hỏi cụ thể. Khi học sinh đã tự trả lời hoặc làm sai, không đưa lời giải hoàn chỉnh; chỉ nêu một dữ kiện cần đối chiếu và hỏi em tự sửa.

Không kể lại toàn bộ sự kiện, không liệt kê toàn bộ ý đáp án, không bịa mốc thời gian, nhân vật hay quan hệ nhân quả. Phân biệt rõ dữ kiện, nguyên nhân, kết quả và ý nghĩa; phản hồi bằng tiếng Việt tự nhiên, tối đa 120 từ. Không dùng nhãn như [SCAF], [HINT] hay [DIRECT_ANSWER]."""

TAG = re.compile(r"^\s*\[[^\]]+\]\s*", re.S)


def js_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def message(record: dict, role: str) -> dict | None:
    return next((m for m in record.get("messages", []) if m.get("role") == role), None)


def clean(text: str) -> str:
    text = TAG.sub("", str(text or "")).strip()
    return re.sub(r"\s+", " ", text)


def compact(text: str, limit: int = 210) -> str:
    text = re.sub(r"\*+", "", text).strip(" :.-")
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def factual_anchor(original_answer: str, fallback_query: str) -> str:
    """Pick one fact-bearing sentence; do not copy a full multi-point answer."""
    text = clean(original_answer)
    sentences = [compact(s, 230) for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 18]
    # Year-bearing sentences are the safest way to drop generic preambles
    # without relying on language-specific template wording.
    factish = [s for s in sentences if re.search(r"\d", s)]
    if factish:
        candidate = factish[0]
        first_digit = re.search(r"\d", candidate)
        # If a generic teacher preamble precedes the date, the final colon
        # before that date separates it from the source fact.
        colon = candidate.rfind(":", 0, first_digit.start()) if first_digit else -1
        if colon >= 0:
            candidate = candidate[colon + 1:].strip()
        return candidate
    # Some source records have the clue after a colon rather than a sentence.
    if ":" in text:
        tail = compact(text.split(":", 1)[1], 230)
        if tail:
            return tail
    return compact(fallback_query, 180)


def target(query: str, anchor: str, index: int) -> str:
    q = clean(query)
    lower = q.lower()
    if any(w in lower for w in ("nguyên nhân", "vì sao", "tại sao")):
        suffix = "Từ dữ kiện này, theo em nguyên nhân gần nào cần phân tích trước?"
    elif any(w in lower for w in ("ý nghĩa", "vai trò", "đóng góp", "tác động", "ảnh hưởng")):
        suffix = "Từ dữ kiện này, theo em nó cho thấy ý nghĩa hoặc vai trò nào?"
    elif any(w in lower for w in ("kể", "trình bày", "tóm tắt", "điểm chính", "diễn biến")):
        suffix = "Em hãy chọn một ý chính từ dữ kiện này và giải thích nó liên quan thế nào đến yêu cầu của đề?"
    elif any(w in lower for w in ("năm", "khi nào", "mốc")):
        suffix = "Em hãy đặt dữ kiện này vào đúng mốc thời gian; sự kiện hoặc giai đoạn nào cần đối chiếu tiếp?"
    else:
        options = [
            "Dữ kiện này liên quan thế nào đến câu hỏi của em?",
            "Theo em, chi tiết nào trong dữ kiện này quan trọng nhất để trả lời đề?",
            "Từ dữ kiện này, em sẽ kiểm tra nguyên nhân, diễn biến hay ý nghĩa trước?",
        ]
        suffix = options[index % len(options)]
    return f"Một dữ kiện cần bám là: {anchor}. {suffix}"


def load_records(zip_path: Path) -> tuple[list[str], dict[str, bytes], str, str, str, str]:
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        meta_name = next(n for n in names if n.endswith("_metadata.json"))
        train_name = next(n for n in names if n.endswith("train_dataset.json"))
        val_name = next(n for n in names if n.endswith("validation_dataset.json"))
        test_name = next(n for n in names if n.endswith("test_dataset.json"))
        return names, {n: archive.read(n) for n in names if not n.endswith("/")}, meta_name, train_name, val_name, test_name


def original_answers(source_zip: Path) -> dict[str, str]:
    names, raw, _meta, train_name, val_name, _test = load_records(source_zip)
    mapping: dict[str, str] = {}
    for name in (train_name, val_name):
        for record in json.loads(raw[name]):
            assistant = message(record, "assistant")
            if assistant:
                mapping[str(record.get("conversation_id"))] = str(assistant.get("content") or "")
    return mapping


def repair(records: list[dict], originals: dict[str, str]) -> tuple[list[dict], int]:
    result = copy.deepcopy(records)
    count = 0
    for index, record in enumerate(result):
        assistant, user, system = message(record, "assistant"), message(record, "user"), message(record, "system")
        if not assistant:
            continue
        query = str(user.get("content") if user else "")
        old = originals.get(str(record.get("conversation_id")), "")
        assistant["content"] = target(query, factual_anchor(old, query), index)
        if system:
            system["content"] = PROMPT
        count += 1
    return result, count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("source_zip", type=Path, help="Original ZIP before generic-target repair")
    parser.add_argument("--backup-suffix", default=".before-history-fact-anchored-v2.zip")
    args = parser.parse_args()
    target_zip, source_zip = args.zip_path.resolve(), args.source_zip.resolve()
    backup = target_zip.with_name(target_zip.stem + args.backup_suffix)
    if backup.exists():
        raise SystemExit(f"Backup exists: {backup}")
    names, raw, meta_name, train_name, val_name, test_name = load_records(target_zip)
    meta = json.loads(raw[meta_name])
    train, val, test = json.loads(raw[train_name]), json.loads(raw[val_name]), json.loads(raw[test_name])
    test_hash = js_hash(test)
    if test_hash != meta.get("datasetHashes", {}).get("test_sha256"):
        raise SystemExit("Locked test hash mismatch; refusing to write.")
    originals = original_answers(source_zip)
    train_new, train_count = repair(train, originals)
    val_new, val_count = repair(val, originals)
    meta["datasetHashes"].update({"train_sha256": js_hash(train_new), "validation_sha256": js_hash(val_new), "test_sha256": test_hash})
    meta["socraticPolicyRepair"] = {
        "version": "HISTORY_FACT_ANCHORED_SOCRATIC_V2",
        "performedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "train_and_validation_only",
        "trainingPromptVersion": "P_HISTORY_FACT_ANCHORED_SOCRATIC_V2",
        "rewrittenTargets": {"train": train_count, "validation": val_count},
        "policy": "Each target contains at most one source-grounded historical anchor plus one analytical question; locked test is unchanged.",
        "sourceAnswerArchive": source_zip.name,
        "lockedTestHashUnchanged": test_hash,
    }
    changed = {
        meta_name: json.dumps(meta, ensure_ascii=False, indent=2).encode(),
        train_name: json.dumps(train_new, ensure_ascii=False, separators=(",", ":")).encode(),
        val_name: json.dumps(val_new, ensure_ascii=False, separators=(",", ":")).encode(),
        test_name: raw[test_name],
    }
    shutil.copy2(target_zip, backup)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=target_zip.parent) as temp:
        temp_path = Path(temp.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as out:
            for name in names:
                out.writestr(name, b"" if name.endswith("/") else changed.get(name, raw[name]))
        temp_path.replace(target_zip)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    print(json.dumps({"updated": str(target_zip), "backup": str(backup), "rewritten": {"train": train_count, "validation": val_count}, "locked_test_sha256": test_hash}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
