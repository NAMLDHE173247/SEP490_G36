"""Build a de-duplicated, fact-anchored History dataset for the Base-vs-FT study.

This script intentionally creates a NEW ZIP.  It does not overwrite any prior
archive because the former History test has exact learner-query leakage into
training data.  The new split is a *withheld-query* split: a normalised learner
query appears in exactly one partition, while different paraphrases of the
same curriculum event may appear in training and test.  This fits the stated
course-tutor question (generalisation to unseen wording within the curriculum)
and must not be described as event-held-out generalisation.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


SOURCE = Path(r"D:\history-20260729T164133Z-1-001_LOCKED_RP5_v2.before-history-socratic-strict-v1.zip")
OUTPUT = Path(r"D:\history-20260729T164133Z-1-001_DEDUP_FACT_V3_LOCKED_SOURCE_FINAL.zip")
PREFIX = "history/"
PROMPT_VERSION = "P_HISTORY_FACT_CONTRASTIVE_V3"

PROMPT = """Bạn là gia sư Socratic môn Lịch sử bằng tiếng Việt cho học sinh THPT.

Mục tiêu là giúp học sinh hiểu đúng sự kiện, nhân vật, mốc thời gian, nguyên nhân, kết quả và ý nghĩa lịch sử. Khi học sinh hỏi trực tiếp về một mốc thời gian, nhân vật, sự kiện hoặc kết quả, hãy đưa tối đa một dữ kiện lịch sử ngắn, chính xác và liên quan trực tiếp làm điểm tựa; sau đó kết thúc bằng đúng một câu hỏi cụ thể để học sinh tự liên hệ, so sánh hoặc giải thích. Khi học sinh đã tự trả lời, chỉ ra một dữ kiện cần đối chiếu và hỏi em tự sửa.

Không đoán hoặc ghép mốc thời gian của nhân vật/sự kiện khác. Nếu không chắc chắn về dữ kiện, nói rõ cần kiểm tra tài liệu thay vì bịa. Không kể lại toàn bộ sự kiện, không liệt kê toàn bộ ý đáp án, không dùng nhãn như [SCAF], [HINT] hay [DIRECT_ANSWER]. Phản hồi bằng tiếng Việt tự nhiên, tối đa 120 từ."""

TAG = re.compile(r"^\s*\[[^\]]+\]\s*", re.S)
YEAR = re.compile(r"(?<!\d)(?:9\d\d|1\d{3}|20\d{2})(?!\d)")


def compact_json_hash(value: object) -> str:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def role_message(record: dict, role: str) -> dict | None:
    return next((m for m in record.get("messages", []) if m.get("role") == role), None)


def clean(text: str) -> str:
    text = TAG.sub("", str(text or "")).strip()
    return re.sub(r"\s+", " ", text)


def normalised_query(record: dict) -> str:
    user = role_message(record, "user")
    return re.sub(r"\s+", " ", str(user.get("content") if user else "").strip()).casefold()


def source_answer(record: dict) -> str:
    assistant = role_message(record, "assistant")
    if assistant:
        return clean(str(assistant.get("content") or ""))
    # Locked evaluation records deliberately omit an assistant message; their
    # factual reference is stored outside the model-visible conversation.
    return clean(str(record.get("reference_answer") or ""))


def factual_anchor(record: dict) -> str:
    """Extract one source-grounded fact-bearing sentence from the original target."""
    text = source_answer(record)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 12]
    dated = [s for s in sentences if YEAR.search(s)]
    candidate = dated[0] if dated else (sentences[0] if sentences else text)
    # Source answers often put an empty teacher preamble before a colon.
    first_year = YEAR.search(candidate)
    if first_year:
        colon = candidate.rfind(":", 0, first_year.start())
        if colon >= 0:
            candidate = candidate[colon + 1:].strip()
    candidate = re.sub(r"\*+", "", candidate).strip(" .:-")
    return candidate[:260]


def event_signature(record: dict) -> str:
    # Used only for reporting coverage, never to place different events in a
    # single partition. The split itself is by learner query.
    years = sorted(set(YEAR.findall(source_answer(record))))
    return "|".join(years) if years else "NO_YEAR"


def socratic_target(record: dict, index: int) -> str:
    query = clean(str((role_message(record, "user") or {}).get("content", "")))
    lower = query.casefold()
    anchor = factual_anchor(record)
    if any(token in lower for token in ("nguyên nhân", "vì sao", "tại sao", "bối cảnh")):
        question = "Từ dữ kiện này, theo em nguyên nhân hoặc bối cảnh nào cần giải thích trước?"
    elif any(token in lower for token in ("ý nghĩa", "vai trò", "tác động", "hệ quả", "kết quả")):
        question = "Theo em, dữ kiện này dẫn tới kết quả trực tiếp hay ý nghĩa lâu dài nào?"
    elif any(token in lower for token in ("năm", "khi nào", "mốc", "niên đại")):
        question = "Em hãy đặt dữ kiện này lên trục thời gian; sự kiện nào dễ bị nhầm với nó?"
    elif any(token in lower for token in ("so sánh", "khác", "giống")):
        question = "Theo em, nên đối chiếu nhân vật, bối cảnh hay kết quả trước?"
    else:
        questions = [
            "Theo em, chi tiết nào trong dữ kiện này trả lời trực tiếp câu hỏi?",
            "Em hãy thử liên hệ dữ kiện này với nguyên nhân hoặc kết quả của sự kiện.",
            "Theo em, em cần kiểm tra nhân vật, mốc thời gian hay kết quả trước?",
        ]
        question = questions[index % len(questions)]
    return f"Một dữ kiện cần bám là: {anchor}. {question}"


def rewrite_sft(record: dict, index: int) -> dict:
    result = copy.deepcopy(record)
    messages = [dict(m) for m in result.get("messages", []) if m.get("role") != "system"]
    assistant = next((m for m in messages if m.get("role") == "assistant"), None)
    if assistant is None:
        raise ValueError("Source training record has no assistant target")
    assistant["content"] = socratic_target(record, index)
    result["messages"] = [{"role": "system", "content": PROMPT}] + messages
    return result


def make_test_record(record: dict, index: int) -> dict:
    user = role_message(record, "user")
    if not user:
        raise ValueError("Source record has no user message")
    anchor = factual_anchor(record)
    return {
        "item_id": f"HISTORY-V3-TEST-{index:03d}",
        "subject": "HISTORY",
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": str(user.get("content") or "")},
        ],
        "reference_answer": source_answer(record),
        "gold_key_points": [anchor],
        "reference_source": "dataset_assistant_response_curated_v3",
        "metadata": {
            "original_conversation_id": record.get("conversation_id"),
            "event_signature": event_signature(record),
            "prompt_version": PROMPT_VERSION,
            "split_policy": "query_deduplicated_withheld_wording_v3",
        },
    }


def source_priority(part: str) -> int:
    return {"test": 0, "validation": 1, "train": 2}[part]


def choose_representatives(records_by_query: dict[str, list[tuple[str, dict]]]) -> dict[str, tuple[str, dict]]:
    chosen: dict[str, tuple[str, dict]] = {}
    for query, candidates in records_by_query.items():
        chosen[query] = sorted(
            candidates,
            key=lambda pair: (source_priority(pair[0]), str(pair[1].get("conversation_id") or "")),
        )[0]
    return chosen


def stable_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source archive: {SOURCE}")
    if OUTPUT.exists():
        raise SystemExit(f"Refusing to overwrite existing output: {OUTPUT}")

    with zipfile.ZipFile(SOURCE) as archive:
        train = json.loads(archive.read(PREFIX + "train_dataset.json"))
        validation = json.loads(archive.read(PREFIX + "validation_dataset.json"))
        test = json.loads(archive.read(PREFIX + "test_dataset.json"))

    grouped: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for part, records in (("train", train), ("validation", validation), ("test", test)):
        for record in records:
            grouped[normalised_query(record)].append((part, record))
    representatives = choose_representatives(grouped)

    # Keep the original test intent where possible, but take only one record per
    # normalised query. Add exactly one unseen test-query group to reach n=50.
    original_test_keys: list[str] = []
    for record in test:
        key = normalised_query(record)
        if key not in original_test_keys:
            original_test_keys.append(key)
    test_keys = original_test_keys[:]
    if len(test_keys) != 49:
        raise SystemExit(f"Expected 49 unique original test queries, found {len(test_keys)}")
    remaining = sorted((key for key in representatives if key not in set(test_keys)), key=stable_key)
    test_keys.append(remaining[0])

    # Preserve validation intent, excluding test queries, then fill to 100 from
    # the remaining unique learner formulations. This yields 322/100/50.
    validation_keys: list[str] = []
    test_key_set = set(test_keys)
    for record in validation:
        key = normalised_query(record)
        if key not in test_key_set and key not in validation_keys:
            validation_keys.append(key)
    fill = sorted((key for key in representatives if key not in test_key_set and key not in set(validation_keys)), key=stable_key)
    validation_keys.extend(fill[:100 - len(validation_keys)])
    validation_key_set = set(validation_keys)
    train_keys = sorted((key for key in representatives if key not in test_key_set and key not in validation_key_set), key=stable_key)

    if not (len(train_keys) == 322 and len(validation_keys) == 100 and len(test_keys) == 50):
        raise SystemExit(f"Unexpected split counts: train={len(train_keys)}, validation={len(validation_keys)}, test={len(test_keys)}")

    train_out = [rewrite_sft(representatives[key][1], i) for i, key in enumerate(train_keys, 1)]
    val_out = [rewrite_sft(representatives[key][1], i) for i, key in enumerate(validation_keys, 1)]
    test_out = [make_test_record(representatives[key][1], i) for i, key in enumerate(test_keys, 1)]

    # Hard gates: no exact learner-query overlap and all tests have factual keys.
    train_queries = {normalised_query(record) for record in train_out}
    val_queries = {normalised_query(record) for record in val_out}
    test_queries = {normalised_query(record) for record in test_out}
    if train_queries & val_queries or train_queries & test_queries or val_queries & test_queries:
        raise SystemExit("Exact learner-query leakage remains after split")
    if any(not str(item["gold_key_points"][0]).strip() for item in test_out):
        raise SystemExit("Every test item must include a non-empty factual key point")

    event_coverage = {
        "train": sorted({event_signature(record) for record in train_out}),
        "validation": sorted({event_signature(record) for record in val_out}),
        "test": sorted({str(record.get("metadata", {}).get("event_signature") or "NO_YEAR") for record in test_out}),
    }
    metadata = {
        "projectName": "Vietnam-History-200K-Vi",
        "subject": "HISTORY",
        "totalTrain": len(train_out),
        "totalValidation": len(val_out),
        "totalTest": len(test_out),
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "lockedProtocol": "RP5_BASE_FT_SINGLE_TURN_V1",
        "systemPrompt": PROMPT,
        "systemPromptVersion": PROMPT_VERSION,
        "datasetHashes": {
            "train_sha256": compact_json_hash(train_out),
            "validation_sha256": compact_json_hash(val_out),
            "test_sha256": compact_json_hash(test_out),
        },
        "testHashSemantics": "sha256(JSON.stringify(parsed_test_records))",
        "referencePolicy": "assistant target separated from model input; source-derived factual keys are supplied to the judge; human review required before confirmatory claims",
        "splitPolicy": {
            "version": "HISTORY_QUERY_DEDUP_FACT_V3",
            "unit": "normalised learner query",
            "rule": "Each exact normalised learner query exists in exactly one partition. This is a withheld-wording split; curriculum events may appear through different phrasings across partitions.",
            "sourceRows": 641,
            "uniqueLearnerQueries": len(representatives),
            "discardedDuplicateRows": 641 - len(representatives),
            "counts": {"train": len(train_out), "validation": len(val_out), "test": len(test_out)},
            "eventCoverageByYearSignature": event_coverage,
        },
        "socraticPolicy": {
            "version": PROMPT_VERSION,
            "targetRule": "One source-grounded fact anchor plus one specific Socratic question.",
            "factSafetyRule": "Do not guess or swap dates, entities or events; uncertainty must be stated rather than fabricated.",
        },
    }
    manifest = {
        "sourceArchive": SOURCE.name,
        "outputArchive": OUTPUT.name,
        "generatedAt": metadata["exportedAt"],
        "promptVersion": PROMPT_VERSION,
        "counts": metadata["splitPolicy"]["counts"],
        "checks": {
            "exactQueryOverlap": 0,
            "testGoldKeyPointsMissing": 0,
            "testItemIdsUnique": len({x["item_id"] for x in test_out}) == len(test_out),
        },
    }

    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(PREFIX + "_metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
        archive.writestr(PREFIX + "train_dataset.json", json.dumps(train_out, ensure_ascii=False, separators=(",", ":")))
        archive.writestr(PREFIX + "validation_dataset.json", json.dumps(val_out, ensure_ascii=False, separators=(",", ":")))
        archive.writestr(PREFIX + "test_dataset.json", json.dumps(test_out, ensure_ascii=False, separators=(",", ":")))
        archive.writestr(PREFIX + "split_manifest_v3.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    print(json.dumps({"output": str(OUTPUT), "metadata": metadata, "manifest": manifest}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
