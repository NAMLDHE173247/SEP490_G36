#!/usr/bin/env python3
"""Build the one-file Kaggle GPU service from the canonical source files."""

from __future__ import annotations

import argparse
from pathlib import Path


MARKER = "# --- EMBEDDED locked_eval_protocol FOR KAGGLE STANDALONE ---"


def build(app_path: Path, protocol_path: Path, output_path: Path) -> None:
    app = app_path.read_text(encoding="utf-8")
    protocol = protocol_path.read_text(encoding="utf-8")
    import_line = "from locked_eval_protocol import ("
    if import_line not in app:
        raise RuntimeError(f"Cannot find import marker in {app_path}")
    if MARKER in app:
        raise RuntimeError("Input app is already a standalone build")

    escaped = repr(protocol)
    shim = f'''{MARKER}
import sys as _locked_sys
import types as _locked_types
if "locked_eval_protocol" not in _locked_sys.modules:
    _locked_module = _locked_types.ModuleType("locked_eval_protocol")
    _locked_source = {escaped}
    exec(compile(_locked_source, "<embedded locked_eval_protocol>", "exec"), _locked_module.__dict__)
    _locked_sys.modules["locked_eval_protocol"] = _locked_module

'''
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(app.replace(import_line, shim + import_line, 1), encoding="utf-8")
    print(f"Wrote {output_path} ({output_path.stat().st_size:,} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, default=Path("gpu-service/app.py"))
    parser.add_argument("--protocol", type=Path, default=Path("gpu-service/utils/locked_eval_protocol.py"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../deliverables/gpu-service-kaggle-standalone/app.py"),
    )
    args = parser.parse_args()
    build(args.app, args.protocol, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
