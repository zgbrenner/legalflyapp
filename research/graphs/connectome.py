"""Connectome graph structures and randomization controls."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
from scipy import sparse

ControlType = Literal[
    "biological",
    "random_erdos",
    "random_degree_preserving",
    "random_weights",
]


@dataclass
class ConnectomeGraph:
    """Sparse directed graph used as reservoir connectivity."""

    adjacency: sparse.csr_matrix
    node_ids: list[str]
    regions: list[str]
    node_regions: list[str]
    positions: np.ndarray
    metadata: dict[str, Any]
    control: ControlType = "biological"

    @property
    def n_nodes(self) -> int:
        return int(self.adjacency.shape[0])

    @property
    def n_edges(self) -> int:
        return int(self.adjacency.nnz)

    def degree(self) -> np.ndarray:
        return np.asarray(self.adjacency.sum(axis=1)).ravel() + np.asarray(
            self.adjacency.sum(axis=0)
        ).ravel()

    def save(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        sparse.save_npz(path / "adjacency.npz", self.adjacency)
        np.save(path / "positions.npy", self.positions)
        payload = {
            "node_ids": self.node_ids,
            "regions": self.regions,
            "node_regions": self.node_regions,
            "metadata": self.metadata,
            "control": self.control,
        }
        (path / "meta.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> ConnectomeGraph:
        adjacency = sparse.load_npz(path / "adjacency.npz").tocsr()
        positions = np.load(path / "positions.npy")
        payload = json.loads((path / "meta.json").read_text(encoding="utf-8"))
        return cls(
            adjacency=adjacency,
            node_ids=payload["node_ids"],
            regions=payload["regions"],
            node_regions=payload["node_regions"],
            positions=positions,
            metadata=payload.get("metadata", {}),
            control=payload.get("control", "biological"),
        )

    def summary(self) -> dict[str, Any]:
        return {
            "n_nodes": self.n_nodes,
            "n_edges": self.n_edges,
            "control": self.control,
            "regions": self.regions,
            "metadata": self.metadata,
        }


def spectral_radius_scale(matrix: sparse.spmatrix, target: float = 0.9) -> sparse.csr_matrix:
    """Scale sparse matrix so spectral radius approximates target (power iteration)."""
    mat = matrix.tocsr().astype(np.float64)
    if mat.nnz == 0:
        return mat
    rng = np.random.default_rng(0)
    vec = rng.normal(size=mat.shape[0])
    vec /= np.linalg.norm(vec) + 1e-12
    for _ in range(40):
        vec = mat @ vec
        norm = np.linalg.norm(vec) + 1e-12
        vec /= norm
    radius = float(np.linalg.norm(mat @ vec))
    if radius < 1e-12:
        return mat
    return (mat * (target / radius)).tocsr()


def build_synthetic_connectome(
    n_nodes: int = 512,
    mean_degree: float = 8.0,
    seed: int = 42,
    n_regions: int = 8,
) -> ConnectomeGraph:
    """
    Build a small redistributable demo graph with modular regional structure.

    This is NOT anatomical fly data. It is a demo topology with community
    structure loosely inspired by multi-region connectomes.
    """
    rng = np.random.default_rng(seed)
    regions = [
        "optic_lobe",
        "antennal_lobe",
        "mushroom_body",
        "central_complex",
        "lateral_horn",
        "protocerebrum",
        "gnathal_ganglia",
        "descending",
    ][:n_regions]
    node_regions = [regions[i % n_regions] for i in range(n_nodes)]
    node_ids = [f"n{i:04d}" for i in range(n_nodes)]

    # Place nodes in region clusters (abstract layout — not fly anatomy).
    positions = np.zeros((n_nodes, 3), dtype=np.float64)
    region_centers = rng.normal(size=(n_regions, 3)) * 3.0
    for i in range(n_nodes):
        r = i % n_regions
        positions[i] = region_centers[r] + rng.normal(scale=0.55, size=3)

    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []

    n_edges = int(n_nodes * mean_degree)
    # Prefer intra-region edges to create modular biological-like structure.
    for _ in range(n_edges):
        src = int(rng.integers(0, n_nodes))
        if rng.random() < 0.72:
            candidates = [j for j in range(n_nodes) if node_regions[j] == node_regions[src] and j != src]
            if not candidates:
                dst = int(rng.integers(0, n_nodes))
            else:
                dst = int(rng.choice(candidates))
        else:
            dst = int(rng.integers(0, n_nodes))
            if dst == src:
                dst = (dst + 1) % n_nodes
        weight = float(rng.lognormal(mean=0.0, sigma=0.35))
        # Mix excitatory / inhibitory-like signs
        if rng.random() < 0.2:
            weight *= -1.0
        rows.append(src)
        cols.append(dst)
        data.append(weight)

    adjacency = sparse.csr_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes))
    adjacency = spectral_radius_scale(adjacency, target=0.9)
    return ConnectomeGraph(
        adjacency=adjacency,
        node_ids=node_ids,
        regions=regions,
        node_regions=node_regions,
        positions=positions,
        metadata={
            "source": "synthetic_demo",
            "license": "MIT (project-generated)",
            "anatomical": False,
            "description": (
                "Abstract modular graph for LegalFly demo mode. "
                "Not derived from FlyWire or hemibrain edge lists."
            ),
            "seed": seed,
            "mean_degree_target": mean_degree,
        },
        control="biological",
    )


def randomize_erdos(graph: ConnectomeGraph, seed: int = 0) -> ConnectomeGraph:
    """Random A: same node/edge count, fully randomized connectivity."""
    rng = np.random.default_rng(seed)
    n = graph.n_nodes
    m = graph.n_edges
    weights = graph.adjacency.data.copy()
    rng.shuffle(weights)
    rows = rng.integers(0, n, size=m)
    cols = rng.integers(0, n, size=m)
    mask = rows != cols
    rows, cols, weights = rows[mask], cols[mask], weights[mask]
    # Top up if self-loops removed
    while len(rows) < m:
        r = int(rng.integers(0, n))
        c = int(rng.integers(0, n))
        if r == c:
            continue
        rows = np.append(rows, r)
        cols = np.append(cols, c)
        weights = np.append(weights, float(rng.normal()))
    adjacency = sparse.csr_matrix((weights[:m], (rows[:m], cols[:m])), shape=(n, n))
    adjacency = spectral_radius_scale(adjacency, target=0.9)
    return ConnectomeGraph(
        adjacency=adjacency,
        node_ids=list(graph.node_ids),
        regions=list(graph.regions),
        node_regions=list(graph.node_regions),
        positions=graph.positions.copy(),
        metadata={**graph.metadata, "randomized": "erdos", "parent_control": graph.control},
        control="random_erdos",
    )


def randomize_degree_preserving(graph: ConnectomeGraph, seed: int = 0, swaps: int | None = None) -> ConnectomeGraph:
    """Random B: approximate degree-preserving rewiring via edge swaps."""
    rng = np.random.default_rng(seed)
    coo = graph.adjacency.tocoo()
    edges = list(zip(coo.row.tolist(), coo.col.tolist(), coo.data.tolist()))
    if len(edges) < 2:
        return randomize_erdos(graph, seed=seed)
    n_swaps = swaps if swaps is not None else max(100, len(edges) * 2)
    for _ in range(n_swaps):
        i, j = rng.choice(len(edges), size=2, replace=False)
        a, b, wa = edges[i]
        c, d, wb = edges[j]
        if len({a, b, c, d}) < 4:
            continue
        # Swap destinations
        if a == d or c == b:
            continue
        edges[i] = (a, d, wa)
        edges[j] = (c, b, wb)
    rows, cols, data = zip(*edges)
    adjacency = sparse.csr_matrix((data, (rows, cols)), shape=graph.adjacency.shape)
    adjacency = spectral_radius_scale(adjacency, target=0.9)
    return ConnectomeGraph(
        adjacency=adjacency,
        node_ids=list(graph.node_ids),
        regions=list(graph.regions),
        node_regions=list(graph.node_regions),
        positions=graph.positions.copy(),
        metadata={**graph.metadata, "randomized": "degree_preserving", "swaps": n_swaps},
        control="random_degree_preserving",
    )


def randomize_weights(graph: ConnectomeGraph, seed: int = 0) -> ConnectomeGraph:
    """Random C: keep topology, shuffle / redraw weights."""
    rng = np.random.default_rng(seed)
    adjacency = graph.adjacency.copy().tocsr().astype(np.float64)
    new_weights = rng.lognormal(mean=0.0, sigma=0.35, size=adjacency.nnz)
    signs = np.where(rng.random(adjacency.nnz) < 0.2, -1.0, 1.0)
    adjacency.data = new_weights * signs
    adjacency = spectral_radius_scale(adjacency, target=0.9)
    return ConnectomeGraph(
        adjacency=adjacency,
        node_ids=list(graph.node_ids),
        regions=list(graph.regions),
        node_regions=list(graph.node_regions),
        positions=graph.positions.copy(),
        metadata={**graph.metadata, "randomized": "weights"},
        control="random_weights",
    )


def apply_control(graph: ConnectomeGraph, control: ControlType, seed: int = 0) -> ConnectomeGraph:
    if control == "biological":
        return graph
    if control == "random_erdos":
        return randomize_erdos(graph, seed=seed)
    if control == "random_degree_preserving":
        return randomize_degree_preserving(graph, seed=seed)
    if control == "random_weights":
        return randomize_weights(graph, seed=seed)
    raise ValueError(f"Unknown control: {control}")