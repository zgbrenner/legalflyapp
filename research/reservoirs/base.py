"""Simplified computational dynamics on directed connectome topology."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import numpy as np
from research.graphs.connectome import ConnectomeGraph, spectral_radius_scale

class Reservoir(ABC):
    @abstractmethod
    def reset(self): ...
    @abstractmethod
    def stimulate(self, input_signal): ...
    @abstractmethod
    def step(self, steps=1): ...
    @abstractmethod
    def read_state(self): ...

    def run(self, inputs, washout=0):
        self.reset()
        states = []
        for t, u in enumerate(inputs):
            self.stimulate(u)
            self.step(1)
            if t >= washout:
                states.append(self.read_state().copy())
        return np.asarray(states, dtype=np.float32)

class ConnectomeReservoir(Reservoir):
    """x(t+1)=(1-leak)x(t)+leak*tanh(Wx(t)+Win*u(t)); not a biological simulation."""
    def __init__(self, graph, input_dim, *, leak=.3, input_scale=.35, activation="tanh",
                 n_input_nodes=None, seed=42, spectral_radius=.9, input_routing="random"):
        self.graph = graph
        # Stored adjacency[source,destination]; column-vector propagation needs transpose.
        self.W = (graph.adjacency.T if graph.metadata.get("normalization_frozen") else
                  spectral_radius_scale(graph.adjacency.T, target=spectral_radius)).tocsr().astype(np.float32)
        self.n_nodes = graph.n_nodes
        self.input_dim = input_dim
        self.leak = float(leak)
        self.input_scale = float(input_scale)
        self.activation = activation
        self.seed = seed
        self.input_routing = input_routing
        rng = np.random.default_rng(seed)
        n_in = n_input_nodes or max(16, self.n_nodes // 8)
        if input_routing == "region":
            preferred = np.array([i for i, r in enumerate(graph.node_regions)
                                  if r in {"antennal_lobe_like", "mushroom_body"}], dtype=int)
            remaining = np.setdiff1d(np.arange(self.n_nodes), preferred)
            order = np.concatenate([rng.permutation(preferred), rng.permutation(remaining)])
            self.input_indices = np.sort(order[:min(n_in, self.n_nodes)])
        elif input_routing == "random":
            self.input_indices = np.sort(rng.choice(self.n_nodes, size=min(n_in, self.n_nodes), replace=False))
        else:
            raise ValueError(f"Unknown input routing: {input_routing}")
        self.Win = np.zeros((self.n_nodes, input_dim), dtype=np.float32)
        proj = rng.normal(0., 1., size=(len(self.input_indices), input_dim)).astype(np.float32)
        proj /= np.linalg.norm(proj, axis=1, keepdims=True) + 1e-8
        self.Win[self.input_indices] = proj * self.input_scale
        self.disabled_indices = np.asarray(graph.metadata.get("disabled_indices", []), dtype=int)
        self.Win[self.disabled_indices] = 0
        self.reset()

    def _act(self, z):
        if self.activation == "tanh":
            return np.tanh(z)
        if self.activation == "relu":
            return np.maximum(z, 0.)
        raise ValueError(f"Unknown activation: {self.activation}")

    def reset(self):
        self.x = np.zeros(self.n_nodes, dtype=np.float32)
        self._last_u = np.zeros(self.input_dim, dtype=np.float32)
        self.history = []

    def stimulate(self, input_signal):
        u = np.asarray(input_signal, dtype=np.float32).reshape(-1)
        if u.shape[0] != self.input_dim:
            raise ValueError(f"Expected input_dim={self.input_dim}, got {u.shape[0]}")
        self._last_u = u

    def step(self, steps=1):
        for _ in range(steps):
            nxt = self._act(self.W @ self.x + self.Win @ self._last_u)
            self.x = (1. - self.leak) * self.x + self.leak * nxt
            self.x[self.disabled_indices] = 0
            self.history.append(self.x.copy())

    def read_state(self):
        return self.x

    def sampled_activity(self, max_nodes=360) -> dict[str, Any]:
        rng = np.random.default_rng(self.seed)
        # Same IDs in both panels, independent of graph topology.
        idx = np.sort(rng.choice(self.n_nodes, size=min(max_nodes, self.n_nodes), replace=False))
        traj = np.asarray(self.history, dtype=np.float32) if self.history else np.zeros((1, self.n_nodes))
        region_activity = {}
        for region in self.graph.regions:
            mask = np.array([r == region for r in self.graph.node_regions])
            region_activity[region] = float(np.mean(np.abs(self.x[mask]))) if mask.any() else 0.
        local = {int(g): i for i, g in enumerate(idx.tolist())}
        coo = self.graph.adjacency.tocoo()
        edges = [[local[row], local[col], float(abs(weight))]
                 for row, col, weight in zip(coo.row.tolist(), coo.col.tolist(), coo.data.tolist())
                 if row != col and row in local and col in local]
        if len(edges) > 1600:
            weights = np.asarray([e[2] for e in edges], dtype=np.float64)
            weights /= weights.sum() + 1e-12
            pick = rng.choice(len(edges), size=1600, replace=False, p=weights)
            edges = [edges[i] for i in sorted(pick.tolist())]
        return {"indices": idx.tolist(), "node_ids": [self.graph.node_ids[i] for i in idx],
                "in_degrees": self.graph.adjacency.getnnz(axis=0)[idx].tolist(),
                "out_degrees": self.graph.adjacency.getnnz(axis=1)[idx].tolist(),
                "total_neurons": self.n_nodes, "total_edges": self.graph.n_edges,
                "graph_hash": self.graph.fingerprint(),
                "display_note": "Measured model activity replay; illustrative layout, not microscopy coordinates.",
                "positions": self.graph.positions[idx].tolist(),
                "regions": [self.graph.node_regions[i] for i in idx],
                "final_activity": np.abs(self.x[idx]).tolist(),
                "trajectory": np.abs(traj[:, idx]).astype(np.float32).tolist(), "edges": edges,
                "input_indices_local": [local[i] for i in self.input_indices.tolist() if i in local],
                "aggregate": {"mean_abs": float(np.mean(np.abs(self.x))), "max_abs": float(np.max(np.abs(self.x))),
                              "input_mean_abs": float(np.mean(np.abs(self.Win @ self._last_u))), "region_activity": region_activity},
                "timesteps": int(traj.shape[0]), "layout": "abstract_region_clusters",
                "anatomical": bool(self.graph.metadata.get("anatomical", False))}

class RandomGraphReservoir(ConnectomeReservoir):
    """Identical dynamics, randomized wiring."""

def make_reservoir(graph: ConnectomeGraph, input_dim: int, **kwargs):
    cls = ConnectomeReservoir if graph.control == "biological" else RandomGraphReservoir
    return cls(graph, input_dim, **kwargs)
