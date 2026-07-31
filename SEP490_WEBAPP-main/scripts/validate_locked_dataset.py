#!/usr/bin/env python3
"""Validate a JSON/JSONL file before uploading it as a locked test set."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "gpu-service"))
from locked_eval_protocol import validate_locked_dataset  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    args = parser.parse_args()
    if args.dataset.suffix.lower() == ".jsonl":
        rows = [json.loads(line) for line in args.dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        payload = json.loads(args.dataset.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("conversations"), list):
            rows = payload["conversations"]
        elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
            rows = payload["items"]
        else:
            rows = payload if isinstance(payload, list) else [payload]
    report = validate_locked_dataset(rows, strict=True)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
