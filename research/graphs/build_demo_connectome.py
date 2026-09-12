"""Build and persist the redistributable demo connectome."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from research.graphs.connectome import (
    apply_control,
    build_synthetic_connectome,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "connectome"


def build_all(out_dir: Path, *, n_nodes: int = 512, seed: int = 42) -> dict:
    base = build_synthetic_connectome(n_nodes=n_nodes, seed=seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    base.save(out_dir / "biological")
    summaries = {"biological": base.summary()}
    for control in ("random_erdos", "random_degree_preserving", "random_weights"):
        g = apply_control(base, control, seed=seed + hash(control) % 10_000)  # type: ignore[arg-type]
        g.save(out_dir / control)
        summaries[control] = g.summary()
    meta = {
        "demo": True,
        "anatomical": False,
        "n_nodes": n_nodes,
        "seed": seed,
        "variants": summaries,
        "layout_note": (
            "Node positions are abstract region clusters, not fly anatomy."
        ),
    }
    (out_dir / "index.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--n-nodes", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    print(json.dumps(build_all(args.out, n_nodes=args.n_nodes, seed=args.seed), indent=2))


if __name__ == "__main__":
    main()