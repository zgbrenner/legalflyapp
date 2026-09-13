"""Connectome graph structures and randomization controls."""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
import numpy as np
from scipy import sparse

SCIENCE_VERSION = "2.0-directed-controls"
CONTROL_SEEDS = {"random_erdos": 101, "random_degree_preserving": 211, "random_weights": 307}
ControlType = Literal["biological", "random_erdos", "random_degree_preserving", "random_weights"]

@dataclass
class ConnectomeGraph:
    """Sparse directed graph; adjacency[source, destination]."""
    adjacency: sparse.csr_matrix
    node_ids: list[str]
    regions: list[str]
    node_regions: list[str]
    positions: np.ndarray
    metadata: dict[str, Any]
    control: ControlType = "biological"

    @property
    def n_nodes(self):
        return int(self.adjacency.shape[0])

    @property
    def n_edges(self):
        return int(self.adjacency.nnz)

    def fingerprint(self):
        matrix = self.adjacency.copy().tocsr()
        matrix.sort_indices()
        digest = hashlib.sha256()
        digest.update(json.dumps(self.node_ids, separators=(",", ":")).encode())
        digest.update(np.asarray(matrix.shape, dtype="<i8").tobytes())
        for values, dtype in ((matrix.indptr, "<i8"), (matrix.indices, "<i8"), (matrix.data, "<f4")):
            digest.update(np.asarray(values, dtype=dtype).tobytes())
        return digest.hexdigest()

    def degree(self):
        return np.asarray(self.adjacency.sum(axis=1)).ravel() + np.asarray(self.adjacency.sum(axis=0)).ravel()

    def save(self, path: Path):
        path.mkdir(parents=True, exist_ok=True)
        sparse.save_npz(path / "adjacency.npz", self.adjacency)
        np.save(path / "positions.npy", self.positions)
        payload = {"node_ids": self.node_ids, "regions": self.regions, "node_regions": self.node_regions,
                   "metadata": self.metadata, "control": self.control}
        (path / "meta.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path):
        payload = json.loads((path / "meta.json").read_text(encoding="utf-8"))
        return cls(sparse.load_npz(path / "adjacency.npz").tocsr(), payload["node_ids"],
                   payload["regions"], payload["node_regions"], np.load(path / "positions.npy"),
                   payload.get("metadata", {}), payload.get("control", "biological"))

    def summary(self):
        return {"n_nodes": self.n_nodes, "n_edges": self.n_edges, "control": self.control,
                "regions": self.regions, "metadata": self.metadata}


def spectral_radius_scale(matrix, target=0.9):
    """Approximate spectral normalization by deterministic power iteration."""
    mat = matrix.tocsr().astype(np.float64)
    if mat.nnz == 0:
        return mat
    vec = np.random.default_rng(0).normal(size=mat.shape[0])
    vec /= np.linalg.norm(vec) + 1e-12
    for _ in range(40):
        vec = mat @ vec
        vec /= np.linalg.norm(vec) + 1e-12
    radius = float(np.linalg.norm(mat @ vec))
    return mat if radius < 1e-12 else (mat * (target / radius)).tocsr()


def build_synthetic_connectome(n_nodes=512, mean_degree=8.0, seed=42, n_regions=8):
    """Synthetic modular control data, not anatomical fly connectivity."""
    rng = np.random.default_rng(seed)
    regions = ["optic_lobe", "antennal_lobe", "mushroom_body", "central_complex", "lateral_horn",
               "protocerebrum", "gnathal_ganglia", "descending"][:n_regions]
    node_regions = [regions[i % n_regions] for i in range(n_nodes)]
    node_ids = [f"n{i:04d}" for i in range(n_nodes)]
    positions = np.zeros((n_nodes, 3), dtype=np.float64)
    centers = rng.normal(size=(n_regions, 3)) * 3.0
    for i in range(n_nodes):
        positions[i] = centers[i % n_regions] + rng.normal(scale=0.55, size=3)
    rows, cols, data = [], [], []
    for _ in range(int(n_nodes * mean_degree)):
        src = int(rng.integers(0, n_nodes))
        if rng.random() < 0.72:
            candidates = [j for j in range(n_nodes) if node_regions[j] == node_regions[src] and j != src]
            dst = int(rng.choice(candidates)) if candidates else int(rng.integers(0, n_nodes))
        else:
            dst = int(rng.integers(0, n_nodes))
            if dst == src:
                dst = (dst + 1) % n_nodes
        weight = float(rng.lognormal(mean=0.0, sigma=0.35))
        if rng.random() < 0.2:
            weight *= -1.0
        rows.append(src); cols.append(dst); data.append(weight)
    adjacency = spectral_radius_scale(sparse.csr_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes)))
    return ConnectomeGraph(adjacency, node_ids, regions, node_regions, positions,
                           {"source": "synthetic_demo", "license": "MIT (project-generated)", "anatomical": False,
                            "description": "Abstract modular demo, not traced anatomical connectivity.",
                            "seed": seed, "mean_degree_target": mean_degree})


def _control_graph(graph, adjacency, kind, seed, **details):
    assert adjacency.nnz == graph.n_edges
    return ConnectomeGraph(adjacency, list(graph.node_ids), list(graph.regions), list(graph.node_regions),
                           graph.positions.copy(), {**graph.metadata,
                           "anatomical": kind == "random_weights" and bool(graph.metadata.get("anatomical")),
                           "randomized": kind, "parent_source": graph.metadata.get("source"), "source": kind,
                           "control_seed": seed, "science_version": SCIENCE_VERSION,
                           "parent_graph_hash": graph.fingerprint(), **details}, kind)


def randomize_erdos(graph, seed=0):
    """Exact directed G(n,m), no loops/duplicates, original weight multiset."""
    rng = np.random.default_rng(seed)
    n, m = graph.n_nodes, graph.n_edges
    if m > n * (n - 1):
        raise ValueError("Loop-free control requires m <= n*(n-1)")
    pairs = rng.choice(n * (n - 1), size=m, replace=False)
    rows = pairs // max(1, n - 1)
    cols = pairs % max(1, n - 1)
    cols += cols >= rows
    adjacency = sparse.csr_matrix((rng.permutation(graph.adjacency.data), (rows, cols)), shape=(n, n))
    return _control_graph(graph, adjacency, "random_erdos", seed)


def randomize_degree_preserving(graph, seed=0, swaps=None):
    """Directed edge swaps preserve in/out degree, weight multiset, and source strength.

    Duplicate-edge rejection prevents CSR merging. Incoming weighted strength is not preserved.
    """
    rng = np.random.default_rng(seed)
    coo = graph.adjacency.tocoo()
    rows, cols = coo.row.copy(), coo.col.copy()
    present = set(zip(rows.tolist(), cols.tolist()))
    attempts = swaps if swaps is not None else max(100, graph.n_edges * 2)
    accepted = 0
    if len(rows) >= 2:
        for _ in range(attempts):
            i, j = rng.integers(0, len(rows), size=2)
            a, b, c, d = int(rows[i]), int(cols[i]), int(rows[j]), int(cols[j])
            if i == j or a == c or b == d or a == d or c == b:
                continue
            if (a, d) in present or (c, b) in present:
                continue
            present.remove((a, b)); present.remove((c, d))
            present.add((a, d)); present.add((c, b))
            cols[i], cols[j] = d, b
            accepted += 1
    adjacency = sparse.csr_matrix((coo.data.copy(), (rows, cols)), shape=graph.adjacency.shape)
    for axis in (0, 1):
        np.testing.assert_array_equal(adjacency.getnnz(axis=axis), graph.adjacency.getnnz(axis=axis))
    return _control_graph(graph, adjacency, "random_degree_preserving", seed,
                          swap_attempts=attempts, accepted_swaps=accepted)


def randomize_weights(graph, seed=0):
    """Keep every directed edge and permute original signed weights exactly."""
    adjacency = graph.adjacency.copy().tocsr()
    adjacency.data = np.random.default_rng(seed).permutation(adjacency.data)
    return _control_graph(graph, adjacency, "random_weights", seed)


def apply_control(graph, control, seed=0):
    if control == "biological":
        return graph
    functions = {"random_erdos": randomize_erdos, "random_degree_preserving": randomize_degree_preserving,
                 "random_weights": randomize_weights}
    if control not in functions:
        raise ValueError(f"Unknown control: {control}")
    return functions[control](graph, seed=seed)
