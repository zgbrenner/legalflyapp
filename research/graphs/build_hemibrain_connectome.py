"""Build LegalFly reservoirs from real Janelia hemibrain adjacency (CC BY 4.0).

We do not pretend the surgical subgraph is the entire fly mind.
We do use real synapse-count-weighted edges between real traced bodyIds.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy import sparse

from research.graphs.connectome import ConnectomeGraph, apply_control, spectral_radius_scale

REPO = Path(__file__).resolve().parents[2]
RAW_DIR = REPO / "data" / "raw" / "hemibrain" / "extract" / "exported-traced-adjacencies-v1.2"
OUT_DIR = REPO / "data" / "processed" / "hemibrain"


def _load_neurons(path: Path) -> dict[str, dict[str, str]]:
    neurons: dict[str, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            body = str(row["bodyId"])
            neurons[body] = {
                "type": row.get("type") or "unknown",
                "instance": row.get("instance") or "unknown",
            }
    return neurons


def _region_for_type(cell_type: str) -> str:
    t = (cell_type or "unknown").upper()
    if t.startswith(("KC", "MBON", "MBIN", "APL", "DAN", "OA")):
        return "mushroom_body"
    if t.startswith(("EPG", "PEG", "PEN", "ELL", "DELTA", "PFN", "PFR", "FC")):
        return "central_complex"
    if "OL" in t or t.startswith(("T4", "T5", "LPI", "LC", "LT")):
        return "optic_lobe_like"
    if t.startswith(("PN", "ORN", "AL")):
        return "antennal_lobe_like"
    if t.startswith(("DNS", "DN", "MN")):
        return "descending"
    return "central_brain"


def build_hemibrain_subgraph(
    neurons_csv: Path,
    connections_csv: Path,
    *,
    max_nodes: int = 3072,
    min_weight: int = 2,
    seed: int = 42,
) -> ConnectomeGraph:
    """
    Excise a high-degree surgical subgraph from the real hemibrain adjacency.

    Every retained edge exists in hemibrain v1.2. Node positions in the UI are
    abstract region clusters — not EM skeleton coordinates.
    """
    neurons = _load_neurons(neurons_csv)
    degree: dict[str, float] = defaultdict(float)
    edges: list[tuple[str, str, float]] = []

    with connections_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            pre = str(row["bodyId_pre"])
            post = str(row["bodyId_post"])
            weight = float(row["weight"])
            if weight < min_weight:
                continue
            if pre not in neurons or post not in neurons:
                continue
            degree[pre] += weight
            degree[post] += weight
            edges.append((pre, post, weight))

    ranked = sorted(degree.keys(), key=lambda body: degree[body], reverse=True)
    keep = set(ranked[:max_nodes])
    ordered = [body for body in ranked if body in keep]
    index = {body: i for i, body in enumerate(ordered)}

    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []
    for pre, post, weight in edges:
        if pre not in index or post not in index:
            continue
        rows.append(index[pre])
        cols.append(index[post])
        data.append(weight)

    n = len(ordered)
    adjacency = sparse.csr_matrix((data, (rows, cols)), shape=(n, n), dtype=np.float64)
    adjacency = spectral_radius_scale(adjacency, target=0.9)

    node_regions = [_region_for_type(neurons[body]["type"]) for body in ordered]
    regions = sorted(set(node_regions))

    rng = np.random.default_rng(seed)
    region_centers = {region: rng.normal(scale=3.0, size=3) for region in regions}
    positions = np.zeros((n, 3), dtype=np.float64)
    for i, body in enumerate(ordered):
        region = node_regions[i]
        jitter = rng.normal(scale=0.55, size=3)
        positions[i] = region_centers[region] + jitter + np.array([0.0, 0.0, -0.001 * i])

    return ConnectomeGraph(
        adjacency=adjacency.astype(np.float32),
        node_ids=ordered,
        regions=regions,
        node_regions=node_regions,
        positions=positions,
        metadata={
            "source": "janelia_hemibrain_v1.2",
            "license": "CC BY 4.0",
            "attribution": (
                "Scheffer et al. / Janelia FlyEM hemibrain. "
                "Compact adjacency: exported-traced-adjacencies-v1.2."
            ),
            "anatomical": True,
            "layout": "abstract_region_clusters_not_em_coordinates",
            "selection": "top_degree_surgical_subgraph",
            "max_nodes": max_nodes,
            "min_weight": min_weight,
            "parent_neurons_traced": len(neurons),
            "parent_edges_considered": len(edges),
            "description": (
                "Real hemibrain synapse-weighted edges among the highest-degree "
                "traced neurons. A surgical cut of biological tissue topology, "
                "reanimated as a computational reservoir. Not a mind."
            ),
            "seed": seed,
        },
        control="biological",
    )


def build_all(
    *,
    max_nodes: int = 3072,
    min_weight: int = 2,
    seed: int = 42,
    raw_dir: Path = RAW_DIR,
    out_dir: Path = OUT_DIR,
) -> dict:
    neurons_csv = raw_dir / "traced-neurons.csv"
    connections_csv = raw_dir / "traced-total-connections.csv"
    if not neurons_csv.exists() or not connections_csv.exists():
        raise FileNotFoundError(
            f"Missing hemibrain CSVs in {raw_dir}. Run: python scripts/fetch_hemibrain.py"
        )

    bio = build_hemibrain_subgraph(
        neurons_csv,
        connections_csv,
        max_nodes=max_nodes,
        min_weight=min_weight,
        seed=seed,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    bio.save(out_dir / "biological")
    summaries = {"biological": bio.summary()}
    for control in ("random_erdos", "random_degree_preserving", "random_weights"):
        graph = apply_control(bio, control, seed=seed + (hash(control) % 10_000))  # type: ignore[arg-type]
        graph.metadata = {
            **graph.metadata,
            "parent_source": "janelia_hemibrain_v1.2",
            "control_note": "Matched-size randomisation of the surgical hemibrain subgraph.",
        }
        graph.save(out_dir / control)
        summaries[control] = graph.summary()

    index = {
        "mode": "hemibrain_research",
        "dataset": "janelia_hemibrain_v1.2",
        "license": "CC BY 4.0",
        "anatomical_edges": True,
        "anatomical_coordinates": False,
        "max_nodes": max_nodes,
        "min_weight": min_weight,
        "seed": seed,
        "variants": summaries,
        "warning": (
            "Edges are real hemibrain connectivity. Node positions in the UI are abstract "
            "region clusters for visualization — not EM skeleton coordinates."
        ),
    }
    (out_dir / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-nodes", type=int, default=3072)
    parser.add_argument("--min-weight", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    index = build_all(
        max_nodes=args.max_nodes,
        min_weight=args.min_weight,
        seed=args.seed,
        raw_dir=args.raw_dir,
        out_dir=args.out,
    )
    print(json.dumps(index, indent=2))


if __name__ == "__main__":
    main()
