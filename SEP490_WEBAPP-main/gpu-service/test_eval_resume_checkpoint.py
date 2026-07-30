import ast
import datetime
import json
import os
import re
import tempfile
import threading
import unittest

APP_PATH = os.environ.get("EVAL_APP_PATH") or os.path.join(os.path.dirname(__file__), "app.py")


def secure_filename(value):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(value))


def load_functions(*names, extra_globals=None):
    with open(APP_PATH, "r", encoding="utf-8") as handle:
        tree = ast.parse(handle.read(), APP_PATH)
    selected = [
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names
    ]
    namespace = {
        "os": os,
        "json": json,
        "threading": threading,
        "datetime": datetime,
        "secure_filename": secure_filename,
    }
    namespace.update(extra_globals or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), APP_PATH, "exec"), namespace)
    return namespace


class EvalCheckpointTests(unittest.TestCase):
    def test_atomic_checkpoint_round_trip(self):
        with tempfile.TemporaryDirectory() as checkpoint_root:
            namespace = load_functions(
                "_eval_checkpoint_dir",
                "_eval_checkpoint_path",
                "_save_eval_checkpoint",
                "_load_eval_checkpoint",
                extra_globals={
                    "EVAL_CHECKPOINT_BASE": checkpoint_root,
                    "_eval_checkpoint_lock": threading.RLock(),
                },
            )
            payload = [{"item_id": "MATH-001", "score": 4.5}]
            namespace["_save_eval_checkpoint"]("eval_test", "judge_ft_results", payload)
            self.assertEqual(
                namespace["_load_eval_checkpoint"]("eval_test", "judge_ft_results", []),
                payload,
            )
            self.assertFalse(
                os.path.exists(os.path.join(checkpoint_root, "eval_test", "judge_ft_results.json.tmp"))
            )

    def test_replay_resume_skips_checkpointed_items(self):
        generated_indexes = []
        saved_snapshots = []
        existing = [
            {"item_id": "A", "turns": [], "subject": "MATH"},
            {"item_id": "B", "turns": [], "subject": "MATH"},
        ]

        class FakeModel:
            def eval(self):
                return None

        class FakeFastLanguageModel:
            @staticmethod
            def for_inference(_model):
                return None

        def replay_conversation(_conv, _model, _tokenizer, **kwargs):
            generated_indexes.append(kwargs["item_index"])
            return {
                "item_id": "C",
                "subject": "MATH",
                "turns": [{"user": "question", "model_response": "answer"}],
            }

        namespace = load_functions(
            "_run_single_replay",
            extra_globals={
                "_load_eval_checkpoint": lambda *_args: list(existing),
                "_save_eval_checkpoint": lambda _job, _name, value: saved_snapshots.append(list(value)),
                "_eval_log": lambda *_args, **_kwargs: None,
                "_eval_progress": lambda *_args, **_kwargs: None,
                "replay_conversation": replay_conversation,
                "FastLanguageModel": FakeFastLanguageModel,
            },
        )
        results = namespace["_run_single_replay"](
            "job", "eval", [{}, {}, {}], FakeModel(), object(), "replay_ft", "Replay FT"
        )
        self.assertEqual(generated_indexes, [2])
        self.assertEqual(len(results), 3)
        self.assertEqual(len(saved_snapshots[-1]), 3)

    def test_judge_has_rate_limit_backoff_and_batch_checkpoint(self):
        with open(APP_PATH, "r", encoding="utf-8") as handle:
            source = handle.read()
        self.assertIn("for rate_attempt in range(6)", source)
        self.assertIn("_save_eval_checkpoint(eval_job_id, checkpoint_name, per_conv_results)", source)
        self.assertIn("/api/eval/resume/<eval_job_id>", source)

    def test_judge_resume_skips_completed_batches(self):
        judge_calls = []
        snapshots = []
        saved = [{"saved": 0}, {"saved": 1}]
        failed_replay = {
            "item_id": "item",
            "subject": "MATH",
            "turns": [],
            "generation_status": "failed",
            "failure_type": "generation_failed",
            "telemetry": {},
            "prompt_trace": {},
        }
        namespace = load_functions(
            "_run_batch_judge",
            extra_globals={
                "BATCH_SIZE": 2,
                "_load_eval_checkpoint": lambda *_args: list(saved),
                "_save_eval_checkpoint": lambda _job, _name, value: snapshots.append(list(value)),
                "_eval_log": lambda *_args, **_kwargs: None,
                "_eval_progress": lambda *_args, **_kwargs: None,
                "_judge_batch": lambda *_args, **_kwargs: judge_calls.append(True),
                "_compute_group_scores_research": lambda scores: {"knowledge": scores["B1"]},
                "_score_latency": lambda _latency: 5.0,
                "_SHORT_TO_FULL": {"A1": "A1_answer_withholding"},
                "sha256_text": lambda value: value,
                "stable_json_hash": lambda value: str(value),
                "compute_ngram_metrics": lambda *_args: {"bleu": 0, "rouge_l": 0},
                "compute_question_detection_rate": lambda *_args: 0,
            },
        )
        results = namespace["_run_batch_judge"](
            "job",
            "eval",
            [{}, {}, {}, {}],
            [dict(failed_replay) for _ in range(4)],
            "judge",
            "judge_ft",
            "Judge",
        )
        self.assertEqual(judge_calls, [])
        self.assertEqual(results[:2], saved)
        self.assertEqual(len(results), 4)
        self.assertEqual(len(snapshots[-1]), 4)


if __name__ == "__main__":
    unittest.main()
