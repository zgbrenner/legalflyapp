"""Ablation utilities for Destroy the Brain experiments."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from research.graphs.connectome import ConnectomeGraph, spectral_radius_scale

AblationKind = Literal[
    "remove_fraction",
    "remove_high_degree",
    "remove_low_degree",
    "remove_region",
    "randomize_region",
    "randomize_weights",
]


@dataclass
class AblationSpec:
    kind: AblationKind
    fraction: float = 0.05
    region: str | None = None
    seed: int = 0
    label: str = ""

    def display_name(self) -> str:
        if self.label:
            return self.label
        if self.kind == "remove_fraction":
            return f"Remove {int(self.fraction * 100)}% of neurons"
        if self.kind == "remove_high_degree":
            return f"Remove highest-degree neurons ({int(self.fraction * 100)}%)"
        if self.kind == "remove_low_degree":
            return f"Remove lowest-degree neurons ({int(self.fraction * 100)}%)"
        if self.kind == "remove_region":
            return f"Disable region: {self.region}"
        if self.kind == "randomize_region":
            return f"Randomize region: {self.region}"
        if self.kind == "randomize_weights":
            return "Randomize edge weights"
        raise ValueError(f"Unknown ablation: {self.kind}")


def _zero_nodes(graph: ConnectomeGraph, mask: np.ndarray) -> ConnectomeGraph:
    adjacency = graph.adjacency.tolil(copy=True)
    idx = np.where(mask)[0]
    for i in idx:
        adjacency[i, :] = 0
        adjacency[:, i] = 0
    csr = spectral_radius_scale(adjacency.tocsr(), target=0.9)
    return ConnectomeGraph(
        adjacency=csr,
        node_ids=list(graph.node_ids),
        regions=list(graph.regions),
        node_regions=list(graph.node_regions),
        positions=graph.positions.copy(),
        metadata={**graph.metadata, "ablated_nodes": int(mask.sum())},
        control=graph.control,
    )


def apply_ablation(graph: ConnectomeGraph, spec: AblationSpec) -> ConnectomeGraph:
    n = graph.n_nodes
    degrees = graph.degree()
    rng = np.random.default_rng(spec.seed)

    if spec.kind == "remove_fraction":
        k = max(1, int(n * spec.fraction))
        chosen = rng.choice(n, size=k, replace=False)
        mask = np.zeros(n, dtype=bool)
        mask[chosen] = True
        return _zero_nodes(graph, mask)

    if spec.kind == "remove_high_degree":
        k = max(1, int(n * spec.fraction))
        chosen = np.argsort(degrees)[-k:]
        mask = np.zeros(n, dtype=bool)
        mask[chosen] = True
        return _zero_nodes(graph, mask)

    if spec.kind == "remove_low_degree":
        k = max(1, int(n * spec.fraction))
        chosen = np.argsort(degrees)[:k]
        mask = np.zeros(n, dtype=bool)
        mask[chosen] = True
        return _zero_nodes(graph, mask)

    if spec.kind == "remove_region":
        if not spec.region:
            raise ValueError("region required")
        mask = np.array([r == spec.region for r in graph.node_regions], dtype=bool)
        return _zero_nodes(graph, mask)

    if spec.kind == "randomize_region":
        if not spec.region:
            raise ValueError("region required")
        adjacency = graph.adjacency.tocsr().astype(np.float64).copy()
        region_idx = [i for i, r in enumerate(graph.node_regions) if r == spec.region]
        # Rewire outgoing edges from region nodes to random targets.
        lil = adjacency.tolil()
        for i in region_idx:
            lil[i, :] = 0
            targets = rng.choice(n, size=min(8, n - 1), replace=False)
            targets = [t for t in targets if t != i][:8]
            weights = rng.lognormal(0.0, 0.35, size=len(targets))
            for t, w in zip(targets, weights):
                lil[i, t] = w
        csr = spectral_radius_scale(lil.tocsr(), target=0.9)
        return ConnectomeGraph(
            adjacency=csr,
            node_ids=list(graph.node_ids),
            regions=list(graph.regions),
            node_regions=list(graph.node_regions),
            positions=graph.positions.copy(),
            metadata={**graph.metadata, "randomized_region": spec.region},
            control=graph.control,
        )

    if spec.kind == "randomize_weights":
        from research.graphs.connectome import randomize_weights

        return randomize_weights(graph, seed=spec.seed)

    raise ValueError(f"Unknown ablation kind: {spec.kind}")


DEFAULT_ABLATIONS: list[AblationSpec] = [
    AblationSpec(kind="remove_fraction", fraction=0.01, label="Remove 1% of neurons"),
    AblationSpec(kind="remove_fraction", fraction=0.05, label="Remove 5% of neurons"),
    AblationSpec(kind="remove_fraction", fraction=0.10, label="Remove 10% of neurons"),
    AblationSpec(kind="remove_fraction", fraction=0.25, label="Remove 25% of neurons"),
    AblationSpec(kind="remove_high_degree", fraction=0.05, label="Remove highest-degree neurons (5%)"),
    AblationSpec(kind="remove_low_degree", fraction=0.05, label="Remove lowest-degree neurons (5%)"),
    AblationSpec(kind="randomize_weights", label="Randomize edge weights"),
]


def default_ablations_for_graph(graph: ConnectomeGraph) -> list[AblationSpec]:
    """Build ablation list including every non-trivial ROI present in the graph."""
    specs = list(DEFAULT_ABLATIONS)
    for region in graph.regions:
        count = sum(1 for r in graph.node_regions if r == region)
        if count < 8:
            continue
        specs.append(
            AblationSpec(
                kind="remove_region",
                region=region,
                label=f"Excise ROI: {region} ({count} neurons)",
            )
        )
        specs.append(
            AblationSpec(
                kind="randomize_region",
                region=region,
                label=f"Scramble ROI: {region} ({count} neurons)",
            )
        )
    return specs