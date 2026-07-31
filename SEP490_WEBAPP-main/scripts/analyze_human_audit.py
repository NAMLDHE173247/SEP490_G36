#!/usr/bin/env python3
"""Compute pre-adjudication inter-rater evidence for the RP4 human audit."""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path


METRICS = ("A1", "A2", "A3", "B1")


def weighted_kappa(a: list[float], b: list[float]) -> float | None:
    # The rubric is a fixed six-category ordinal scale. Using only observed
    # categories would incorrectly make, for example, scores 0/3/5 equidistant.
    categories = [0, 1, 2, 3, 4, 5]
    index = {value: position for position, value in enumerate(categories)}
    n = len(a)
    observed = [[0.0 for _ in categories] for _ in categories]
    for left, right in zip(a, b):
        observed[index[left]][index[right]] += 1 / n
    left_marginal = [sum(row) for row in observed]
    right_marginal = [sum(observed[i][j] for i in range(len(categories))) for j in range(len(categories))]
    denominator = max(1, len(categories) - 1) ** 2
    weighted_observed = 0.0
    weighted_expected = 0.0
    for i in range(len(categories)):
        for j in range(len(categories)):
            weight = ((i - j) ** 2) / denominator
            weighted_observed += weight * observed[i][j]
            weighted_expected += weight * left_marginal[i] * right_marginal[j]
    if weighted_expected == 0:
        return 1.0 if weighted_observed == 0 else None
    return 1 - weighted_observed / weighted_expected


def percentile(values: list[float], p: float) -> float:
    values = sorted(values)
    position = (len(values) - 1) * p
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return values[lower]
    return values[lower] * (upper - position) + values[upper] * (position - lower)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ratings", type=Path, required=True, help="Combined CSV containing two rows per audit_id")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-items", type=int, default=60)
    parser.add_argument("--resamples", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    grouped: dict[str, list[dict]] = defaultdict(list)
    with args.ratings.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            for metric in ("A1", "A2", "A3", "B1"):
                value = float(row[metric])
                if not 0 <= value <= 5 or not value.is_integer():
                    raise ValueError(f"{row['audit_id']} {metric} must be an integer from 0 to 5")
                row[metric] = int(value)
            row["S"] = statistics.fmean(row[metric] for metric in ("A1", "A2", "A3"))
            grouped[row["audit_id"]].append(row)

    if len(grouped) != args.expected_items:
        raise ValueError(f"Expected {args.expected_items} audit items, found {len(grouped)}")
    invalid = [audit_id for audit_id, rows in grouped.items() if len(rows) != 2 or rows[0]["rater_id"] == rows[1]["rater_id"]]
    if invalid:
        raise ValueError(f"Each audit_id needs two distinct raters: {invalid[:10]}")

    pairs = [rows for _, rows in sorted(grouped.items())]
    report = {"status": "pre_adjudication_frozen", "items": len(pairs), "metrics": {}}
    rng = random.Random(args.seed)
    for metric in METRICS:
        a = [rows[0][metric] for rows in pairs]
        b = [rows[1][metric] for rows in pairs]
        averages = [(left + right) / 2 for left, right in zip(a, b)]
        differences = [left - right for left, right in zip(a, b)]
        boot_means = []
        boot_diffs = []
        for _ in range(args.resamples):
            sample = [rng.randrange(len(pairs)) for _ in pairs]
            boot_means.append(statistics.fmean(averages[index] for index in sample))
            boot_diffs.append(statistics.fmean(differences[index] for index in sample))
        report["metrics"][metric] = {
            "quadratic_weighted_kappa": weighted_kappa(a, b),
            "exact_agreement": sum(left == right for left, right in zip(a, b)) / len(a),
            "mean_absolute_disagreement": statistics.fmean(abs(left - right) for left, right in zip(a, b)),
            "mean_two_rater_score": statistics.fmean(averages),
            "score_ci95": [percentile(boot_means, 0.025), percentile(boot_means, 0.975)],
            "mean_rater_difference": statistics.fmean(differences),
            "difference_ci95": [percentile(boot_diffs, 0.025), percentile(boot_diffs, 0.975)],
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
