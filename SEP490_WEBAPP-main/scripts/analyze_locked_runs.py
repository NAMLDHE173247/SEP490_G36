#!/usr/bin/env python3
"""Merge subject runs and compute RP4 paired statistics/H1-H4 decisions."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "gpu-service"))

from locked_eval_protocol import decide_hypotheses, paired_research_statistics  # noqa: E402


def load_results(payload: dict, path: Path, role: str) -> list[dict]:
    candidates = (
        payload.get("results")
        if role == "ft"
        else payload.get("baseResults") or payload.get("basePerConvResults")
    )
    if not candidates and payload.get("gpuResult"):
        gpu = payload["gpuResult"]
        candidates = gpu.get("perConvResults") if role == "ft" else gpu.get("basePerConvResults")
    if not isinstance(candidates, list):
        raise ValueError(f"Could not find {role} results in {path}")
    return candidates


def require_confirmatory_eligible(payload: dict, path: Path) -> None:
    gpu = payload.get("gpuResult") if isinstance(payload.get("gpuResult"), dict) else {}
    eligible = payload.get("confirmatoryEligible", gpu.get("confirmatoryEligible"))
    integrity = payload.get("pairIntegrity") or gpu.get("pairIntegrity")
    if eligible is not True:
        raise ValueError(
            f"{path} is not confirmatory-eligible. pairIntegrity={integrity!r}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, action="append", required=True, help="Saved evaluation JSON; repeat for EN/MATH/HISTORY")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resamples", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    ft_results: list[dict] = []
    base_results: list[dict] = []
    for path in args.run:
        payload = json.loads(path.read_text(encoding="utf-8"))
        require_confirmatory_eligible(payload, path)
        ft_results.extend(load_results(payload, path, "ft"))
        base_results.extend(load_results(payload, path, "base"))

    statistics = paired_research_statistics(ft_results, base_results, args.resamples, args.seed)
    decisions = decide_hypotheses(statistics, ft_results, base_results)
    report = {
        "analysisRole": "confirmatory_matched_base_vs_fine_tuned",
        "inputRuns": [str(path.resolve()) for path in args.run],
        "researchStatistics": statistics,
        "hypothesisDecisions": decisions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.output.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["level", "subject", "metric", "n", "mean_delta", "ci95_low", "ci95_high", "effect_size_dz", "status"])
        for subject, metrics in statistics["per_subject"].items():
            for metric, row in metrics.items():
                interval = row.get("ci95") or [None, None]
                writer.writerow(["subject", subject, metric, row.get("n"), row.get("mean_delta"), interval[0], interval[1], row.get("effect_size_dz"), row.get("status")])
        for metric, row in statistics["macro_equal_weight"].items():
            interval = row.get("ci95") or [None, None]
            writer.writerow(["macro", "ENGLISH+MATH+HISTORY", metric, "", row.get("mean_delta"), interval[0], interval[1], "", row.get("status")])

    print(f"Saved {args.output}")
    print(f"Saved {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

