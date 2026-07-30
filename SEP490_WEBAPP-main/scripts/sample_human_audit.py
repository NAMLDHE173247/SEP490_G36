#!/usr/bin/env python3
"""Create the blinded 60-output human-audit package required by RP4."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from pathlib import Path


def load_run(path: Path) -> tuple[list[dict], list[dict]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    ft = payload.get("results") or payload.get("gpuResult", {}).get("perConvResults") or []
    base = payload.get("baseResults") or payload.get("gpuResult", {}).get("basePerConvResults") or []
    if not ft or not base:
        raise ValueError(f"Paired outputs not found in {path}")
    return ft, base


def eligible(result: dict) -> bool:
    return (
        result.get("generation_status") == "success"
        and result.get("judge_status") == "success"
        and bool(result.get("replay_turns"))
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, action="append", required=True)
    parser.add_argument("--audit-csv", type=Path, required=True)
    parser.add_argument("--key-json", type=Path, required=True)
    parser.add_argument("--per-cell", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    selected = []
    for path in args.run:
        ft, base = load_run(path)
        for condition, rows in (("BASE", base), ("FINE_TUNED", ft)):
            candidates = [row for row in rows if eligible(row)]
            if len(candidates) < args.per_cell:
                raise ValueError(f"{path} {condition}: need {args.per_cell} eligible outputs, found {len(candidates)}")
            for row in rng.sample(candidates, args.per_cell):
                selected.append({"condition": condition, "source": str(path.resolve()), "row": row})

    rng.shuffle(selected)
    public_rows = []
    private_key = []
    for index, entry in enumerate(selected):
        row = entry["row"]
        item_id = str(row.get("item_id"))
        audit_id = hashlib.sha256(f"{args.seed}:{index}:{item_id}:{entry['condition']}".encode()).hexdigest()[:12]
        turn = row["replay_turns"][0]
        public_rows.append(
            {
                "audit_id": audit_id,
                "subject": row.get("subject", "UNKNOWN"),
                "student_input": turn.get("user", ""),
                "tutor_response": turn.get("model", ""),
                "reference_answer": row.get("reference_answer", ""),
                "gold_key_points": json.dumps(row.get("gold_key_points") or [], ensure_ascii=False),
                "rater_id": "",
                "A1": "",
                "A2": "",
                "A3": "",
                "B1": "",
                "note": "",
            }
        )
        private_key.append(
            {
                "audit_id": audit_id,
                "item_id": item_id,
                "subject": row.get("subject", "UNKNOWN"),
                "condition": entry["condition"],
                "source": entry["source"],
                "conv_index": row.get("conv_index"),
            }
        )

    args.audit_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.audit_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(public_rows[0]))
        writer.writeheader()
        writer.writerows(public_rows)
    args.key_json.parent.mkdir(parents=True, exist_ok=True)
    args.key_json.write_text(
        json.dumps({"seed": args.seed, "per_cell": args.per_cell, "key": private_key}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Blinded audit: {args.audit_csv} ({len(public_rows)} outputs)")
    print(f"Private key: {args.key_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

