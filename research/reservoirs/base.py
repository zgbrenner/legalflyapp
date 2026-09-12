"""Reservoir computing abstractions mapped from connectome topology."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from research.graphs.connectome import ConnectomeGraph


class Reservoir(ABC):
    """
    Computational reservoir interface.

    This is NOT a biophysically exact neuron simulation. It is a discrete-time
    dynamical system whose sparse connectivity is derived from (or controlled
    against) connectome topology.
    """

    @abstractmethod
    def reset(self) -> None: ...

    @abstractmethod
    def stimulate(self, input_signal: np.ndarray) -> None: ...

    @abstractmethod
    def step(self, steps: int = 1) -> None: ...

    @abstractmethod
    def read_state(self) -> np.ndarray: ...

    def run(self, inputs: np.ndarray, washout: int = 0) -> np.ndarray:
        """
        Drive reservoir with a sequence of input vectors (T, input_dim).
        Returns state trajectory after washout: (T - washout, n_nodes).
        """
        self.reset()
        states = []
        for t, u in enumerate(inputs):
            self.stimulate(u)
            self.step(1)
            if t >= washout:
                states.append(self.read_state().copy())
        return np.asarray(states, dtype=np.float32)


class ConnectomeReservoir(Reservoir):
    """
    x(t+1) = (1 - leak) * x(t) + leak * f(W x(t) + Win u(t))

    W is connectome-derived sparse connectivity.
    """

    def __init__(
        self,
        graph: ConnectomeGraph,
        input_dim: int,
        *,
        leak: float = 0.3,
        input_scale: float = 0.35,
        activation: str = "tanh",
        n_input_nodes: int | None = None,
        seed: int = 42,
    ) -> None:
        self.graph = graph
        self.W = graph.adjacency.tocsr().astype(np.float32)
        self.n_nodes = graph.n_nodes
        self.input_dim = input_dim
        self.leak = float(leak)
        self.input_scale = float(input_scale)
        self.activation = activation
        self.seed = seed
        rng = np.random.default_rng(seed)

        n_in = n_input_nodes or max(16, self.n_nodes // 8)
        self.input_indices = np.sort(rng.choice(self.n_nodes, size=min(n_in, self.n_nodes), replace=False))
        # Dense Win only into selected nodes (stored as full matrix for simplicity at demo scale)
        self.Win = np.zeros((self.n_nodes, input_dim), dtype=np.float32)
        proj = rng.normal(0.0, 1.0, size=(len(self.input_indices), input_dim)).astype(np.float32)
        proj /= np.linalg.norm(proj, axis=1, keepdims=True) + 1e-8
        self.Win[self.input_indices] = proj * self.input_scale

        self.x = np.zeros(self.n_nodes, dtype=np.float32)
        self._last_u = np.zeros(input_dim, dtype=np.float32)
        self.history: list[np.ndarray] = []

    def _act(self, z: np.ndarray) -> np.ndarray:
        if self.activation == "tanh":
            return np.tanh(z)
        if self.activation == "relu":
            return np.maximum(z, 0.0)
        raise ValueError(f"Unknown activation: {self.activation}")

    def reset(self) -> None:
        self.x = np.zeros(self.n_nodes, dtype=np.float32)
        self._last_u = np.zeros(self.input_dim, dtype=np.float32)
        self.history = []

    def stimulate(self, input_signal: np.ndarray) -> None:
        u = np.asarray(input_signal, dtype=np.float32).reshape(-1)
        if u.shape[0] != self.input_dim:
            raise ValueError(f"Expected input_dim={self.input_dim}, got {u.shape[0]}")
        self._last_u = u

    def step(self, steps: int = 1) -> None:
        for _ in range(steps):
            pre = self.W @ self.x + self.Win @ self._last_u
            nxt = self._act(pre)
            self.x = (1.0 - self.leak) * self.x + self.leak * nxt
            self.history.append(self.x.copy())

    def read_state(self) -> np.ndarray:
        return self.x

    def sampled_activity(self, max_nodes: int = 220) -> dict[str, Any]:
        rng = np.random.default_rng(self.seed)
        # Prefer high-degree nodes so synaptic edges remain visible in the UI.
        degrees = np.asarray(self.W.getnnz(axis=1)).ravel()
        top_k = min(max_nodes, self.n_nodes)
        if top_k < self.n_nodes:
            # Mix hubs with a random sample so regions stay represented.
            hub_n = max(top_k // 2, 1)
            hubs = np.argsort(degrees)[-hub_n:]
            remaining = np.setdiff1d(np.arange(self.n_nodes), hubs, assume_unique=True)
            extra = rng.choice(remaining, size=min(top_k - len(hubs), len(remaining)), replace=False)
            idx = np.sort(np.concatenate([hubs, extra]))
        else:
            idx = np.arange(self.n_nodes)

        traj = np.asarray(self.history, dtype=np.float32) if self.history else np.zeros((1, self.n_nodes))
        region_activity = {}
        for region in self.graph.regions:
            mask = np.array([r == region for r in self.graph.node_regions])
            region_activity[region] = float(np.mean(np.abs(self.x[mask]))) if mask.any() else 0.0

        # Sampled synapses among the chosen neurons (local indices into the sample).
        local = {int(g): i for i, g in enumerate(idx.tolist())}
        coo = self.W.tocoo()
        edges: list[list[float]] = []
        for row, col, weight in zip(coo.row.tolist(), coo.col.tolist(), coo.data.tolist()):
            if row == col:
                continue
            if row in local and col in local:
                edges.append([local[row], local[col], float(abs(weight))])
        if len(edges) > 900:
            pick = rng.choice(len(edges), size=900, replace=False)
            edges = [edges[i] for i in sorted(pick.tolist())]

        return {
            "indices": idx.tolist(),
            "positions": self.graph.positions[idx].tolist(),
            "regions": [self.graph.node_regions[i] for i in idx],
            "final_activity": np.abs(self.x[idx]).tolist(),
            "trajectory": np.abs(traj[:, idx]).astype(np.float32).tolist(),
            "edges": edges,
            "input_indices_local": [local[i] for i in self.input_indices.tolist() if i in local],
            "aggregate": {
                "mean_abs": float(np.mean(np.abs(self.x))),
                "max_abs": float(np.max(np.abs(self.x))),
                "input_mean_abs": float(np.mean(np.abs(self.Win @ self._last_u))),
                "region_activity": region_activity,
            },
            "timesteps": int(traj.shape[0]),
            "layout": "abstract_region_clusters",
            "anatomical": bool(self.graph.metadata.get("anatomical", False)),
        }


class RandomGraphReservoir(ConnectomeReservoir):
    """Same dynamics; graph should already be a randomized control."""



def make_reservoir(graph: ConnectomeGraph, input_dim: int, **kwargs) -> ConnectomeReservoir:
    if graph.control == "biological":
        return ConnectomeReservoir(graph, input_dim, **kwargs)
    return RandomGraphReservoir(graph, input_dim, **kwargs)