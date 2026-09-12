"""Compare connectome reservoir vs random controls vs baselines across seeds."""

from __future__ import annotations

import argparse
import json
import statistics
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

from research.experiments.run import ALL_MODELS, run_one

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / "results"
MODELS_DIR = REPO_ROOT / "models"
SERVING_SEED = 42
console = Console()


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_model: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_model.setdefault(row["model_type"], []).append(row)

    summary = {
        "timestamp": datetime.now(UTC).isoformat(),
        "n_seeds": len({r["seed"] for r in rows}),
        "seeds": sorted({r["seed"] for r in rows}),
        "models": {},
        "interpretation": (
            "Measured metrics on the LegalFly synthetic sensitive-information "
            "benchmark (hard legal set when present) using the active connectome "
            "(hemibrain surgical tissue when built, else demo). "
            "Biological topology 'wins' only if measured values show it."
        ),
    }
    for model, items in by_model.items():
        f1s = [i["metrics_test"]["macro_f1"] for i in items]
        bin_f1s = [i["metrics_test"]["binary_sensitive_f1"] for i in items]
        params = items[0]["trainable_parameter_count"]
        mean_f1 = statistics.mean(f1s)
        std_f1 = statistics.pstdev(f1s) if len(f1s) > 1 else 0.0
        summary["models"][model] = {
            "macro_f1_mean": mean_f1,
            "macro_f1_std": std_f1,
            "macro_f1_ci95_approx": 1.96 * std_f1 / max(1, len(f1s) ** 0.5),
            "binary_sensitive_f1_mean": statistics.mean(bin_f1s),
            "binary_sensitive_f1_std": statistics.pstdev(bin_f1s) if len(bin_f1s) > 1 else 0.0,
            "trainable_params": params,
            "reservoir_size": items[0]["graph"]["reservoir_size"],
            "edge_count": items[0]["graph"]["edge_count"],
            "n_runs": len(items),
            "status": "measured",
        }
    return summary


def print_table(summary: dict[str, Any]) -> None:
    table = Table(title="LegalFly comparison (measured)")
    table.add_column("MODEL")
    table.add_column("MACRO F1")
    table.add_column("BIN F1")
    table.add_column("PARAMS")
    table.add_column("NODES")
    order = [
        "connectome",
        "random_erdos",
        "random_degree_preserving",
        "random_weights",
        "linear",
        "mlp",
    ]
    for model in order:
        if model not in summary["models"]:
            continue
        m = summary["models"][model]
        table.add_row(
            model,
            f"{m['macro_f1_mean']:.3f} ± {m['macro_f1_std']:.3f}",
            f"{m['binary_sensitive_f1_mean']:.3f}",
            str(m["trainable_params"]),
            str(m["reservoir_size"] or "—"),
        )
    console.print(table)
    console.print(f"Seeds: {summary['seeds']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", default="42,43,44")
    parser.add_argument("--models", default="connectome,random_erdos,random_degree_preserving,linear")
    parser.add_argument("--encoder", default=None, help="hashing|minilm (default: env)")
    args = parser.parse_args()
    seeds = [int(s.strip()) for s in args.seeds.split(",") if s.strip()]
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if models == ["all"]:
        models = ALL_MODELS

    rows = []
    for seed in seeds:
        for model in models:
            console.print(f"[bold]Running[/bold] model={model} seed={seed}")
            rows.append(run_one(model, seed=seed, encoder=args.encoder))

    # Restore serving checkpoints at the canonical API seed so interactive demo
    # models are not left pointing at the last comparison seed.
    if SERVING_SEED in seeds:
        console.print(f"[bold]Restoring serving models at seed={SERVING_SEED}[/bold]")
        for model in models:
            run_one(model, seed=SERVING_SEED, encoder=args.encoder)

    summary = summarize(rows)
    if rows:
        summary["encoder"] = rows[0].get("encoder")
        summary["encoder_name"] = rows[0].get("encoder_name")
        summary["dataset"] = rows[0].get("dataset", {}).get("task")
        summary["graph_source"] = rows[0].get("config", {}).get("graph_source")
        summary["connectome_mode"] = rows[0].get("config", {}).get("connectome_mode")
    out = RESULTS_DIR / "comparison_latest.json"
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print_table(summary)
    console.print(f"Wrote {out}")


if __name__ == "__main__":
    main()