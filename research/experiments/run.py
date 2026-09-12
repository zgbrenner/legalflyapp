"""Train and evaluate a single LegalFly model."""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from research.datasets.sensitive import load_sensitive_split
from research.evaluation.metrics import multilabel_metrics
from research.experiments.pipeline import build_model, predict_bundle, save_bundle, train_bundle
from research.labels import LABELS

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / "results"
MODELS_DIR = REPO_ROOT / "models"

ALL_MODELS = [
    "connectome",
    "random_erdos",
    "random_degree_preserving",
    "random_weights",
    "linear",
    "mlp",
]


def ensure_data() -> None:
    demo_data = REPO_ROOT / "data" / "demo" / "sensitive" / "train.jsonl"
    if not demo_data.exists():
        from research.datasets.generate_sensitive_dataset import write_dataset

        write_dataset(REPO_ROOT / "data" / "demo" / "sensitive")
    graph = REPO_ROOT / "data" / "demo" / "connectome" / "biological"
    if not graph.exists():
        from research.graphs.build_demo_connectome import build_all

        build_all(REPO_ROOT / "data" / "demo" / "connectome")


def run_one(model: str, seed: int, encoder: str = "hashing") -> dict[str, Any]:
    ensure_data()
    train = load_sensitive_split("train")
    val = load_sensitive_split("validation")
    test = load_sensitive_split("test")

    bundle = build_model(model, encoder_kind=encoder, seed=seed)
    train_info = train_bundle(
        bundle,
        [ex.text for ex in train],
        [ex.labels for ex in train],
    )
    save_bundle(bundle, MODELS_DIR / model)

    t0 = time.perf_counter()
    preds, _, _ = predict_bundle(bundle, [ex.text for ex in test])
    infer_time = time.perf_counter() - t0
    metrics = multilabel_metrics(
        [ex.labels for ex in test],
        [p.labels for p in preds],
        labels=list(LABELS),
    )
    # Validation quick check
    val_preds, _, _ = predict_bundle(bundle, [ex.text for ex in val])
    val_metrics = multilabel_metrics(
        [ex.labels for ex in val],
        [p.labels for p in val_preds],
        labels=list(LABELS),
    )

    result = {
        "timestamp": datetime.now(UTC).isoformat(),
        "seed": seed,
        "model_type": model,
        "encoder": encoder,
        "dataset": {
            "task": "sensitive_information",
            "train": len(train),
            "validation": len(val),
            "test": len(test),
            "generator": "research.datasets.generate_sensitive_dataset",
        },
        "graph": {
            "reservoir_size": bundle.config.get("reservoir_size"),
            "edge_count": bundle.config.get("edge_count"),
            "control": bundle.config.get("graph_control"),
            "preprocessing": "demo_synthetic_modular_csr_spectral_scaled",
        },
        "trainable_parameter_count": train_info["trainable_params"],
        "feature_dim": train_info["feature_dim"],
        "training_time_sec": train_info["train_time_sec"],
        "inference_time_sec_total": infer_time,
        "inference_time_sec_per_example": infer_time / max(1, len(test)),
        "metrics_test": metrics,
        "metrics_validation": val_metrics,
        "hardware": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor() or "unknown",
        },
        "config": bundle.config,
        "claim": (
            "Measured result on synthetic demo connectome / controls. "
            "Do not interpret as anatomical fly-brain competence."
        ),
    }

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = RESULTS_DIR / f"experiment_{stamp}_{model}_seed{seed}"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    # Also refresh latest pointer for UI
    latest = RESULTS_DIR / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    (latest / f"{model}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Run LegalFly experiment")
    parser.add_argument("--model", default="connectome", help="model or 'all'")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--encoder", default="hashing")
    args = parser.parse_args()
    models = ALL_MODELS if args.model == "all" else [args.model]
    for model in models:
        result = run_one(model, seed=args.seed, encoder=args.encoder)
        print(
            json.dumps(
                {
                    "model": model,
                    "macro_f1": result["metrics_test"]["macro_f1"],
                    "binary_f1": result["metrics_test"]["binary_sensitive_f1"],
                    "params": result["trainable_parameter_count"],
                    "out": "results/latest",
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()