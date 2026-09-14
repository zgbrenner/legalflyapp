"""Measure the pinned MiniMind adapter on the locked village holdout cases."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.minimind_adapter.service import Adapter, MiniMindScorer


def main() -> None:
    root = ROOT
    cases = json.loads((root / "apps/web/public/legalfly/cases.json").read_text())
    holdout = [case for case in cases if case["split"] == "holdout"]
    adapter = Adapter(MiniMindScorer(root / "models/minimind-3"), cases)
    started = time.perf_counter()
    adapter.load()
    load_seconds = time.perf_counter() - started
    rows = []
    for case in holdout:
        started = time.perf_counter()
        encoded = adapter.encode(case["petition"])
        encode_seconds = time.perf_counter() - started
        control = adapter.classify_control(case["petition"])
        matching = sum(encoded["facts"][field] == value for field, value in case["facts"].items())
        rows.append(
            {
                "id": case["id"],
                "fields_correct": matching,
                "fields_total": len(case["facts"]),
                "encoder_exact": matching == len(case["facts"]),
                "minimind_alone": control["action"],
                "expected": case["label"],
                "control_correct": control["action"] == case["label"],
                "encode_seconds": encode_seconds,
            }
        )
    print(
        json.dumps(
            {
                "load_seconds": load_seconds,
                "cases": len(rows),
                "field_accuracy": sum(row["fields_correct"] for row in rows) / sum(row["fields_total"] for row in rows),
                "encoder_exact_cases": sum(row["encoder_exact"] for row in rows),
                "minimind_alone_exact": sum(row["control_correct"] for row in rows),
                "mean_encode_seconds": sum(row["encode_seconds"] for row in rows) / len(rows),
                "rows": rows,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
