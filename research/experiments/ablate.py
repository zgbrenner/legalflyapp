"""Precompute Destroy the Brain ablation benchmarks."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from research.ablation.ops import DEFAULT_ABLATIONS, AblationSpec, apply_ablation
from research.baselines.classifiers import MultiLabelReadout, labels_to_matrix
from research.datasets.sensitive import load_sensitive_split
from research.evaluation.metrics import multilabel_metrics
from research.experiments.pipeline import (
    build_model,
    featurize,
    load_demo_graph,
    predict_bundle,
    train_bundle,
)
from research.labels import LABELS
from research.reservoirs.base import make_reservoir

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / "results"


def run_ablations(seed: int = 42) -> dict:
    from research.experiments.run import ensure_data

    ensure_data()
    train = load_sensitive_split("train")
    test = load_sensitive_split("test")

    # Baseline connectome
    base_bundle = build_model("connectome", seed=seed)
    train_bundle(base_bundle, [ex.text for ex in train], [ex.labels for ex in train])
    base_preds, _, _ = predict_bundle(base_bundle, [ex.text for ex in test])
    base_metrics = multilabel_metrics(
        [ex.labels for ex in test],
        [p.labels for p in base_preds],
        labels=list(LABELS),
    )
    base_f1 = base_metrics["macro_f1"]
    base_acc = base_metrics["binary_sensitive_accuracy"]

    graph = load_demo_graph("biological")
    results = []
    for spec in DEFAULT_ABLATIONS:
        ablated = apply_ablation(graph, AblationSpec(**{**spec.__dict__, "seed": seed}))
        reservoir = make_reservoir(ablated, input_dim=64, seed=seed)
        # Rebuild features with ablated reservoir; retrain readout only
        from research.encoders.text import get_encoder

        encoder = get_encoder("hashing", seed=seed)
        # Monkey-patch a temporary bundle-like path
        class Tmp:
            pass

        tmp = Tmp()
        tmp.model_type = "connectome"
        tmp.encoder = encoder
        tmp.reservoir = reservoir
        tmp.config = {"encoding_mode": "temporal", "timesteps": 12, "seed": seed}

        X_train, _ = featurize(tmp, [ex.text for ex in train])  # type: ignore[arg-type]
        y = labels_to_matrix([ex.labels for ex in train])
        readout = MultiLabelReadout(seed=seed).fit(X_train, y)
        X_test, _ = featurize(tmp, [ex.text for ex in test])  # type: ignore[arg-type]
        preds = readout.predict(X_test)
        metrics = multilabel_metrics(
            [ex.labels for ex in test],
            [p.labels for p in preds],
            labels=list(LABELS),
        )
        results.append(
            {
                "ablation": spec.display_name(),
                "kind": spec.kind,
                "fraction": spec.fraction,
                "region": spec.region,
                "macro_f1": metrics["macro_f1"],
                "binary_accuracy": metrics["binary_sensitive_accuracy"],
                "delta_macro_f1": metrics["macro_f1"] - base_f1,
                "delta_binary_accuracy": metrics["binary_sensitive_accuracy"] - base_acc,
                "original_macro_f1": base_f1,
                "original_binary_accuracy": base_acc,
                "status": "measured",
            }
        )

    payload = {
        "timestamp": datetime.now(UTC).isoformat(),
        "seed": seed,
        "baseline_model": "connectome",
        "original_macro_f1": base_f1,
        "original_binary_accuracy": base_acc,
        "ablations": results,
        "note": (
            "Ablations retrain only the readout on fixed ablated reservoir features. "
            "Playful UI copy; scientifically this tests topology robustness."
        ),
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / "ablation_latest.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    payload = run_ablations(seed=args.seed)
    print(json.dumps({"n_ablations": len(payload["ablations"]), "out": "results/ablation_latest.json"}, indent=2))


if __name__ == "__main__":
    main()