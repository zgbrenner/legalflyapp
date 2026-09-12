"""Result artifact loaders for benchmark / ablation pages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from apps.api.app.config import get_settings


def _results_dir() -> Path:
    settings = get_settings()
    return settings.repo_root / settings.legalfly_results_dir


def load_benchmark() -> dict[str, Any]:
    path = _results_dir() / "comparison_latest.json"
    if not path.exists():
        # Fall back to latest per-model files if present
        latest = _results_dir() / "latest"
        models = {}
        if latest.exists():
            for file in latest.glob("*.json"):
                data = json.loads(file.read_text(encoding="utf-8"))
                models[file.stem] = {
                    "macro_f1_mean": data["metrics_test"]["macro_f1"],
                    "macro_f1_std": 0.0,
                    "macro_f1_ci95_approx": 0.0,
                    "binary_sensitive_f1_mean": data["metrics_test"]["binary_sensitive_f1"],
                    "trainable_params": data["trainable_parameter_count"],
                    "reservoir_size": data["graph"]["reservoir_size"],
                    "edge_count": data["graph"]["edge_count"],
                    "n_runs": 1,
                    "status": "measured",
                }
        if models:
            return {
                "status": "partial",
                "models": models,
                "n_seeds": 1,
                "seeds": [42],
                "interpretation": "Loaded from latest single-seed experiment files.",
            }
        return {
            "status": "not_yet_measured",
            "models": {
                "connectome": {"status": "Not yet measured"},
                "random_erdos": {"status": "Not yet measured"},
                "random_degree_preserving": {"status": "Not yet measured"},
                "linear": {"status": "Not yet measured"},
            },
            "interpretation": "Run `make benchmark` to generate measured results.",
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    data["status"] = "measured"
    return data


def load_ablations() -> dict[str, Any]:
    path = _results_dir() / "ablation_latest.json"
    if not path.exists():
        return {
            "status": "not_yet_measured",
            "ablations": [],
            "note": "Run `make ablate` to generate Destroy the Brain results.",
        }
    data = json.loads(path.read_text(encoding="utf-8"))
    data["status"] = "measured"
    return data


def list_experiments() -> list[dict[str, Any]]:
    root = _results_dir()
    if not root.exists():
        return []
    items = []
    for path in sorted(root.glob("experiment_*/result.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        items.append(
            {
                "path": str(path.relative_to(root)),
                "model_type": data.get("model_type"),
                "seed": data.get("seed"),
                "macro_f1": data.get("metrics_test", {}).get("macro_f1"),
                "timestamp": data.get("timestamp"),
            }
        )
    return items