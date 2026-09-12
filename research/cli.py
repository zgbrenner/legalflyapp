"""LegalFly research CLI."""

from __future__ import annotations

import typer

app = typer.Typer(help="LegalFly research commands", no_args_is_help=True)


@app.command("generate-data")
def generate_data() -> None:
    from pathlib import Path

    from research.datasets.generate_sensitive_dataset import write_dataset
    from research.graphs.build_demo_connectome import build_all

    root = Path(__file__).resolve().parents[1]
    write_dataset(root / "data" / "demo" / "sensitive")
    build_all(root / "data" / "demo" / "connectome")
    typer.echo("Generated demo dataset and connectome.")


@app.command("run")
def run(model: str = "connectome", seed: int = 42, encoder: str = "hashing") -> None:
    import json

    from research.experiments.run import run_one

    result = run_one(model, seed=seed, encoder=encoder)
    typer.echo(json.dumps({"model": model, "macro_f1": result["metrics_test"]["macro_f1"]}, indent=2))


@app.command("compare")
def compare(seeds: str = "42,43,44") -> None:
    # Reuse argparse-free path
    import sys

    from research.experiments import compare as compare_mod

    sys.argv = ["compare", "--seeds", seeds]
    compare_mod.main()


@app.command("ablate")
def ablate(seed: int = 42) -> None:
    import json

    from research.experiments.ablate import run_ablations

    payload = run_ablations(seed=seed)
    typer.echo(json.dumps({"ablations": len(payload["ablations"])}, indent=2))


if __name__ == "__main__":
    app()