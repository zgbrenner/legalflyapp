"""Train and evaluate a single LegalFly model."""

from __future__ import annotations

import argparse
import json
import platform
import random
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
    hard_data = REPO_ROOT / "data" / "demo" / "sensitive_hard" / "train.jsonl"
    if not hard_data.exists():
        from research.datasets.generate_hard_legal_dataset import write_dataset as write_hard

        write_hard(REPO_ROOT / "data" / "demo" / "sensitive_hard")
    harder_data = REPO_ROOT / "data" / "demo" / "sensitive_harder" / "train.jsonl"
    if not harder_data.exists():
        from research.datasets.generate_harder_legal_dataset import write_dataset as write_harder

        write_harder(REPO_ROOT / "data" / "demo" / "sensitive_harder")
    graph = REPO_ROOT / "data" / "demo" / "connectome" / "biological"
    if not graph.exists():
        from research.graphs.build_demo_connectome import build_all

        build_all(REPO_ROOT / "data" / "demo" / "connectome")


def _active_dataset_name() -> str:
    harder = REPO_ROOT / "data" / "demo" / "sensitive_harder" / "train.jsonl"
    if harder.exists():
        return "sensitive_information_harder"
    hard = REPO_ROOT / "data" / "demo" / "sensitive_hard" / "train.jsonl"
    return "sensitive_information_hard" if hard.exists() else "sensitive_information"


def _primary_label(labels: list[str]) -> str:
    for label in labels:
        upper = label.upper()
        if upper != "NONE":
            return upper
    return "NONE"


def _subsample_train(train: list, max_train: int | None, seed: int) -> list:
    """
    Few-shot subsample with label coverage.

    Round-robin across primary labels so each head still sees both
    positive and negative examples when the budget allows. Plain random
    draws can leave a rare label all-negative and crash logistic heads.
    """
    if max_train is None or max_train <= 0 or max_train >= len(train):
        return train
    rng = random.Random(seed)
    buckets: dict[str, list[int]] = {}
    for i, ex in enumerate(train):
        buckets.setdefault(_primary_label(list(ex.labels)), []).append(i)
    for key in buckets:
        rng.shuffle(buckets[key])

    chosen: list[int] = []
    keys = sorted(buckets.keys())
    while len(chosen) < max_train and keys:
        progressed = False
        next_keys: list[str] = []
        for key in keys:
            if buckets[key]:
                chosen.append(buckets[key].pop())
                progressed = True
                if buckets[key]:
                    next_keys.append(key)
                if len(chosen) >= max_train:
                    break
            # empty buckets are dropped
        keys = next_keys
        if not progressed:
            break

    if len(chosen) < max_train:
        remaining = [i for i in range(len(train)) if i not in set(chosen)]
        rng.shuffle(remaining)
        chosen.extend(remaining[: max_train - len(chosen)])

    return [train[i] for i in sorted(chosen)]


def run_one(
    model: str,
    seed: int,
    encoder: str | None = None,
    *,
    max_train: int | None = None,
    save: bool = True,
) -> dict[str, Any]:
    from research.encoders.text import resolve_encoder_kind

    ensure_data()
    encoder = resolve_encoder_kind(encoder)
    train = _subsample_train(load_sensitive_split("train"), max_train, seed)
    val = load_sensitive_split("validation")
    test = load_sensitive_split("test")
    dataset_name = _active_dataset_name()

    bundle = build_model(model, encoder_kind=encoder, seed=seed)
    train_info = train_bundle(
        bundle,
        [ex.text for ex in train],
        [ex.labels for ex in train],
    )
    if save:
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
        "encoder_name": bundle.encoder.name,
        "dataset": {
            "task": dataset_name,
            "train": len(train),
            "validation": len(val),
            "test": len(test),
            "max_train": max_train,
            "generator": (
                "research.datasets.generate_harder_legal_dataset"
                if dataset_name.endswith("_harder")
                else (
                    "research.datasets.generate_hard_legal_dataset"
                    if dataset_name.endswith("_hard")
                    else "research.datasets.generate_sensitive_dataset"
                )
            ),
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
    parser.add_argument("--encoder", default=None, help="hashing|minilm (default: env/LEGALFLY_ENCODER)")
    parser.add_argument(
        "--max-train",
        type=int,
        default=None,
        help="Optional few-shot cap on training examples (creates headroom past MiniLM ceiling)",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Evaluate without overwriting serving checkpoints",
    )
    args = parser.parse_args()
    models = ALL_MODELS if args.model == "all" else [args.model]
    for model in models:
        result = run_one(
            model,
            seed=args.seed,
            encoder=args.encoder,
            max_train=args.max_train,
            save=not args.no_save,
        )
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