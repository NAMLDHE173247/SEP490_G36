import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from locked_eval_protocol import (
    decide_hypotheses,
    extract_item_metadata,
    paired_adaptive_statistics,
    paired_integrity,
    paired_research_statistics,
    validate_adaptive_dataset,
    validate_locked_dataset,
)


def result(item_id, subject, b1, a1, a2, a3, tpot=10.0, failed=False):
    return {
        "item_id": item_id,
        "subject": subject,
        "criteria_scores": {"B1": b1, "A1": a1, "A2": a2, "A3": a3},
        "telemetry": {"tpot_ms": tpot},
        "first_attempt_failed": failed,
    }


class LockedProtocolTests(unittest.TestCase):
    def test_empty_dataset_is_invalid(self):
        self.assertFalse(validate_locked_dataset([])["valid"])

    def test_dataset_validation_rejects_missing_subject_and_generated_id(self):
        report = validate_locked_dataset([{"messages": [{"role": "user", "content": "x"}]}])
        self.assertFalse(report["valid"])
        self.assertTrue(report["errors"])

    def test_item_metadata_normalizes_subject(self):
        meta = extract_item_metadata({"item_id": "EN-01", "subject": "Tiếng Anh"}, 0)
        self.assertEqual(meta["subject"], "ENGLISH")
        self.assertEqual(meta["item_id"], "EN-01")

    def test_confirmatory_dataset_requires_50_items_and_references(self):
        rows = [
            {
                "item_id": f"MATH-{index:03d}",
                "subject": "MATH",
                "messages": [{"role": "user", "content": f"Question {index}"}],
                "reference_answer": f"Reference {index}",
            }
            for index in range(50)
        ]
        report = validate_locked_dataset(rows)
        self.assertTrue(report["valid"])
        self.assertTrue(report["confirmatory_sample_size"])
        self.assertTrue(report["confirmatory_reference_coverage"])
        report = validate_locked_dataset(rows[:-1])
        self.assertTrue(report["valid"])
        self.assertFalse(report["confirmatory_sample_size"])

    def test_adaptive_dataset_requires_complete_contrastive_pairs(self):
        def adaptive_item(item_id, state, strategy):
            return {
                "item_id": item_id,
                "subject": "MATH",
                "messages": [{"role": "user", "content": f"Student state: {state}"}],
                "metadata": {"adaptive_socratic": {
                    "contrastive_pair_id": "PAIR-001",
                    "learner_state": state,
                    "misconception_key": "fraction-denominator",
                    "expected_strategy": strategy,
                }},
            }

        rows = [
            adaptive_item("MATH-A", "misconception", "Probe the denominator misconception"),
            adaptive_item("MATH-B", "correct", "Confirm and ask for transfer"),
        ]
        report = validate_adaptive_dataset(rows)
        self.assertTrue(report["eligible"])
        self.assertEqual(report["complete_pair_count"], 1)

        invalid = validate_adaptive_dataset(rows[:1])
        self.assertFalse(invalid["eligible"])
        self.assertTrue(invalid["errors"])

    def test_adaptive_statistics_use_pair_as_unit(self):
        base = []
        ft = []
        for index in range(8):
            pair_id = f"PAIR-{index:03d}"
            base.append({
                "item_id": pair_id,
                "subject": "MATH",
                "adaptive_scores": {"P1": 2, "O1": 2, "E1": 2},
            })
            ft.append({
                "item_id": pair_id,
                "subject": "MATH",
                "adaptive_scores": {"P1": 4, "O1": 4, "E1": 4},
            })
        stats = paired_adaptive_statistics(ft, base, resamples=200, seed=7)
        self.assertEqual(stats["unit_of_analysis"], "contrastive_pair")
        self.assertEqual(stats["criteria"]["AS"]["n"], 8)
        self.assertGreater(stats["criteria"]["AS"]["ci95"][0], 0)
        self.assertEqual(stats["criteria"]["O1"]["n"], 8)
        self.assertGreater(stats["criteria"]["O1"]["ci95"][0], 0)
        self.assertIn("holm_p_adjusted", stats["criteria"]["P1"])

    def test_bootstrap_and_hypotheses(self):
        base = []
        ft = []
        for subject in ("ENGLISH", "MATH", "HISTORY"):
            for index in range(8):
                item_id = f"{subject}-{index}"
                base.append(result(item_id, subject, 3, 3, 3, 3, tpot=10))
                ft.append(result(item_id, subject, 4, 4, 4, 4, tpot=10.5))
        stats = paired_research_statistics(ft, base, resamples=500, seed=7)
        self.assertGreater(stats["macro_equal_weight"]["K"]["ci95"][0], 0)
        decisions = decide_hypotheses(stats, ft, base)
        self.assertEqual(decisions["H1"], "supported")
        self.assertEqual(decisions["H2"], "supported")
        self.assertTrue(all(v["decision"] == "supported" for v in decisions["H4_by_subject"].values()))

    def test_h2_rejects_component_degradation_hidden_by_upper_bound(self):
        statistics_result = {
            "macro_equal_weight": {
                "K": {"status": "ok", "ci95": [0.10, 0.40]},
                "S": {"status": "ok", "ci95": [0.20, 0.80]},
                "A1": {"status": "ok", "ci95": [-1.20, 0.10]},
                "A2": {"status": "ok", "ci95": [0.00, 0.50]},
                "A3": {"status": "ok", "ci95": [0.00, 0.50]},
            },
            "per_subject": {},
        }
        decisions = decide_hypotheses(statistics_result, [], [])
        self.assertEqual(decisions["H2"], "not_supported")

    def test_pair_integrity_detects_rendered_prompt_mismatch(self):
        judge = "google/gemini-2.5-flash"
        common = {
            "item_id": "MATH-001",
            "subject": "MATH",
            "judge_status": "success",
            "effective_judge_model": judge,
            "prompt_trace": {
                "system_prompt_hash": "same-system",
                "rendered_input_hash": "same-rendered",
            },
        }
        base = [dict(common)]
        ft = [dict(common)]
        self.assertTrue(paired_integrity(base, ft, judge)["confirmatory_eligible"])
        ft[0] = {**common, "prompt_trace": {**common["prompt_trace"], "rendered_input_hash": "different"}}
        audit = paired_integrity(base, ft, judge)
        self.assertFalse(audit["confirmatory_eligible"])
        self.assertEqual(audit["rendered_input_hash_mismatches"], ["MATH-001"])

    def test_offline_analysis_and_human_audit_pipeline(self):
        repo_root = Path(__file__).resolve().parents[1]
        judge = "google/gemini-2.5-flash"

        def scored_row(item_id, subject, score, condition):
            return {
                "item_id": item_id,
                "subject": subject,
                "generation_status": "success",
                "judge_status": "success",
                "effective_judge_model": judge,
                "criteria_scores": {
                    "A1": score, "A2": score, "A3": score, "B1": score,
                    "B2": score, "C1": score, "C2": score, "C3": score,
                    "D1": score, "D2": 5,
                },
                "telemetry": {"tpot_ms": 10.0},
                "first_attempt_failed": False,
                "replay_turns": [{
                    "user": f"Question {item_id}",
                    "model": f"{condition} answer {item_id}",
                    "latency_ms": 100,
                }],
                "reference_answer": f"Reference {item_id}",
                "gold_key_points": [],
            }

        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            run_paths = []
            for subject in ("ENGLISH", "MATH", "HISTORY"):
                base = [scored_row(f"{subject}-{index:03d}", subject, 3, "BASE") for index in range(50)]
                ft = [scored_row(f"{subject}-{index:03d}", subject, 4, "FT") for index in range(50)]
                path = temp / f"{subject.lower()}.json"
                path.write_text(json.dumps({
                    "confirmatoryEligible": True,
                    "results": ft,
                    "baseResults": base,
                }), encoding="utf-8")
                run_paths.append(path)

            analysis_path = temp / "analysis.json"
            command = [sys.executable, str(repo_root / "scripts" / "analyze_locked_runs.py")]
            for run_path in run_paths:
                command.extend(["--run", str(run_path)])
            command.extend(["--output", str(analysis_path), "--resamples", "100", "--seed", "7"])
            subprocess.run(command, check=True, capture_output=True, text=True)
            analysis = json.loads(analysis_path.read_text(encoding="utf-8"))
            self.assertEqual(analysis["researchStatistics"]["macro_equal_weight"]["K"]["status"], "ok")
            self.assertEqual(analysis["researchStatistics"]["macro_equal_weight"]["B2"]["status"], "ok")
            self.assertIn("holm_p_adjusted", analysis["researchStatistics"]["macro_equal_weight"]["D1"])
            self.assertEqual(analysis["hypothesisDecisions"]["H1"], "supported")

            audit_csv = temp / "blind.csv"
            key_json = temp / "key.json"
            sample_command = [
                sys.executable, str(repo_root / "scripts" / "sample_human_audit.py"),
                "--audit-csv", str(audit_csv), "--key-json", str(key_json),
                "--per-cell", "2", "--seed", "7",
            ]
            for run_path in run_paths:
                sample_command.extend(["--run", str(run_path)])
            subprocess.run(sample_command, check=True, capture_output=True, text=True)
            with audit_csv.open(encoding="utf-8-sig", newline="") as handle:
                public_rows = list(csv.DictReader(handle))
            self.assertEqual(len(public_rows), 12)
            self.assertTrue(all(row["reference_answer"] for row in public_rows))

            ratings_path = temp / "ratings.csv"
            fieldnames = list(public_rows[0].keys())
            with ratings_path.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames)
                writer.writeheader()
                for row in public_rows:
                    for rater in ("R1", "R2"):
                        writer.writerow({**row, "rater_id": rater, "A1": 4, "A2": 4, "A3": 4, "B1": 4})
            agreement_path = temp / "agreement.json"
            subprocess.run([
                sys.executable, str(repo_root / "scripts" / "analyze_human_audit.py"),
                "--ratings", str(ratings_path), "--output", str(agreement_path),
                "--expected-items", "12", "--resamples", "100", "--seed", "7",
            ], check=True, capture_output=True, text=True)
            agreement = json.loads(agreement_path.read_text(encoding="utf-8"))
            self.assertEqual(agreement["items"], 12)
            self.assertEqual(agreement["metrics"]["B1"]["quadratic_weighted_kappa"], 1.0)


if __name__ == "__main__":
    unittest.main()
