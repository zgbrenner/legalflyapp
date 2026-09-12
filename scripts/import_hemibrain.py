#!/usr/bin/env python3
"""Import helper for Janelia hemibrain connectivity (CC BY 4.0).

This script does NOT auto-download multi-GB archives.
Provide a local edge-list / CSV export and convert to LegalFly CSR format.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy import sparse


def convert_edge_list(path: Path, out: Path, max_nodes: int | None = None) -> None:
    """
    Expected CSV columns: pre_id,post_id,weight
    IDs may be integers or strings.
    """
    import csv

    nodes: dict[str, int] = {}
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for rec in reader:
            pre = str(rec["pre_id"])
            post = str(rec["post_id"])
            weight = float(rec.get("weight", 1.0))
            if pre not in nodes:
                if max_nodes is not None and len(nodes) >= max_nodes:
                    continue
                nodes[pre] = len(nodes)
            if post not in nodes:
                if max_nodes is not None and len(nodes) >= max_nodes:
                    continue
                nodes[post] = len(nodes)
            if pre not in nodes or post not in nodes:
                continue
            rows.append(nodes[pre])
            cols.append(nodes[post])
            data.append(weight)

    n = len(nodes)
    adjacency = sparse.csr_matrix((data, (rows, cols)), shape=(n, n))
    out.mkdir(parents=True, exist_ok=True)
    sparse.save_npz(out / "adjacency.npz", adjacency)
    meta = {
        "source": "hemibrain_user_export",
        "license": "CC BY 4.0 (upstream dataset)",
        "attribution": "Cite Xu et al. hemibrain / Janelia FlyEM; indicate modifications.",
        "n_nodes": n,
        "n_edges": int(adjacency.nnz),
        "anatomical": True,
        "commercial_use": "Permitted under CC BY with attribution (verify current terms).",
    }
    # Placeholder abstract positions if coordinates unavailable
    rng = np.random.default_rng(0)
    positions = rng.normal(size=(n, 3))
    np.save(out / "positions.npy", positions)
    payload = {
        "node_ids": [k for k, _ in sorted(nodes.items(), key=lambda kv: kv[1])],
        "regions": ["unknown"],
        "node_regions": ["unknown"] * n,
        "metadata": meta,
        "control": "biological",
    }
    (out / "meta.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edges", type=Path, required=True, help="CSV edge list")
    parser.add_argument("--out", type=Path, default=Path("data/processed/hemibrain"))
    parser.add_argument("--max-nodes", type=int, default=None)
    args = parser.parse_args()
    convert_edge_list(args.edges, args.out, max_nodes=args.max_nodes)


if __name__ == "__main__":
    main()