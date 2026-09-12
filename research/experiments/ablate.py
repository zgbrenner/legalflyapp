"""Precompute Destroy the Brain ablation benchmarks with live ROI labels."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from research.ablation.ops import AblationSpec, apply_ablation, default_ablations_for_graph
from research.baselines.classifiers import MultiLabelReadout, labels_to_matrix
from research.datasets.sensitive import load_sensitive_split
from research.encoders.text import get_encoder, resolve_encoder_kind
from research.evaluation.metrics import multilabel_metrics
from research.experiments.pipeline import (
    build_model,
    featurize,
    load_active_graph,
    predict_bundle,
    train_bundle,
)
from research.labels import LABELS
from research.reservoirs.base import make_reservoir

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / "results"


def run_ablations(seed: int = 42, encoder: str | None = None) -> dict:
    from research.experiments.run import ensure_data

    ensure_data()
    encoder_kind = resolve_encoder_kind(encoder)
    hard_dir = REPO_ROOT / "data" / "demo" / "sensitive_hard"
    data_dir = hard_dir if (hard_dir / "train.jsonl").exists() else None
    train = load_sensitive_split("train", data_dir=data_dir)
    test = load_sensitive_split("test", data_dir=data_dir)

    base_bundle = build_model("connectome", encoder_kind=encoder_kind, seed=seed)
    train_bundle(base_bundle, [ex.text for ex in train], [ex.labels for ex in train])
    base_preds, _, _ = predict_bundle(base_bundle, [ex.text for ex in test])
    base_metrics = multilabel_metrics(
        [ex.labels for ex in test],
        [p.labels for p in base_preds],
        labels=list(LABELS),
    )
    base_f1 = base_metrics["macro_f1"]
    base_acc = base_metrics["binary_sensitive_accuracy"]

    graph = load_active_graph("biological")
    specs = default_ablations_for_graph(graph)
    results = []
    for spec in specs:
        ablated = apply_ablation(graph, AblationSpec(**{**spec.__dict__, "seed": seed}))
        reservoir = make_reservoir(ablated, input_dim=64, seed=seed)
        enc = get_encoder(encoder_kind, seed=seed)

        class Tmp:
            pass

        tmp = Tmp()
        tmp.model_type = "connectome"
        tmp.encoder = enc
        tmp.reservoir = reservoir
        tmp.config = {
            "encoding_mode": "temporal",
            "timesteps": 12,
            "seed": seed,
            "encoder": enc.name,
        }

        x_train, _ = featurize(tmp, [ex.text for ex in train])  # type: ignore[arg-type]
        y = labels_to_matrix([ex.labels for ex in train])
        readout = MultiLabelReadout(seed=seed).fit(x_train, y)
        x_test, _ = featurize(tmp, [ex.text for ex in test])  # type: ignore[arg-type]
        preds = readout.predict(x_test)
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
        "encoder": encoder_kind,
        "dataset": "sensitive_hard" if data_dir else "sensitive",
        "baseline_model": "connectome",
        "graph_source": graph.metadata.get("source"),
        "regions": list(graph.regions),
        "original_macro_f1": base_f1,
        "original_binary_accuracy": base_acc,
        "ablations": results,
        "note": (
            "Ablations retrain only the readout on fixed ablated reservoir features. "
            "Region cuts use live ROI labels from the active connectome."
        ),
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / "ablation_latest.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--encoder", default=None)
    args = parser.parse_args()
    payload = run_ablations(seed=args.seed, encoder=args.encoder)
    print(
        json.dumps(
            {
                "n_ablations": len(payload["ablations"]),
                "regions": payload["regions"],
                "out": "results/ablation_latest.json",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
