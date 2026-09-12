"""Feature extraction and end-to-end classification pipeline."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from research.baselines.classifiers import (
    LinearBaseline,
    MLPBaseline,
    MultiLabelReadout,
    Prediction,
    labels_to_matrix,
)
from research.encoders.input_encoding import encode_for_reservoir
from research.encoders.text import TextEncoder, get_encoder, resolve_encoder_kind
from research.graphs.connectome import ConnectomeGraph, apply_control
from research.reservoirs.base import ConnectomeReservoir, make_reservoir

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GRAPH_DIR = REPO_ROOT / "data" / "demo" / "connectome"
HEMIBRAIN_GRAPH_DIR = REPO_ROOT / "data" / "processed" / "hemibrain"
MODELS_DIR = REPO_ROOT / "models"


def active_graph_dir() -> Path:
    """Prefer real hemibrain tissue when processed artifacts exist."""
    if (HEMIBRAIN_GRAPH_DIR / "biological" / "meta.json").exists():
        return HEMIBRAIN_GRAPH_DIR
    return DEMO_GRAPH_DIR


def connectome_mode() -> str:
    return "hemibrain" if active_graph_dir() == HEMIBRAIN_GRAPH_DIR else "demo"


@dataclass
class ModelBundle:
    model_type: str
    encoder: TextEncoder
    readout: MultiLabelReadout | LinearBaseline | MLPBaseline
    reservoir: ConnectomeReservoir | None
    graph: ConnectomeGraph | None
    config: dict[str, Any]

    def trainable_params(self) -> int:
        if hasattr(self.readout, "trainable_params"):
            return int(self.readout.trainable_params())
        return -1


def load_active_graph(control: str = "biological") -> ConnectomeGraph:
    graph_dir = active_graph_dir()
    path = graph_dir / control
    if not path.exists():
        # Fall back to biological + on-the-fly control
        bio = graph_dir / "biological"
        if not bio.exists():
            if graph_dir == HEMIBRAIN_GRAPH_DIR:
                raise FileNotFoundError(
                    "Hemibrain graph missing. Run: "
                    "python scripts/fetch_hemibrain.py && "
                    "python -m research.graphs.build_hemibrain_connectome"
                )
            from research.graphs.build_demo_connectome import build_all

            build_all(DEMO_GRAPH_DIR)
            bio = DEMO_GRAPH_DIR / "biological"
        graph = ConnectomeGraph.load(bio)
        if control != "biological":
            return apply_control(graph, control, seed=42)  # type: ignore[arg-type]
        return graph
    return ConnectomeGraph.load(path)


# Back-compat alias
def load_demo_graph(control: str = "biological") -> ConnectomeGraph:
    return load_active_graph(control)


def reservoir_features(
    texts: list[str],
    encoder: TextEncoder,
    reservoir: ConnectomeReservoir,
    *,
    encoding_mode: str = "temporal",
    timesteps: int = 12,
    seed: int = 42,
    collect_sim: bool = False,
) -> tuple[np.ndarray, list[dict[str, Any]]]:
    embeddings = encoder.encode_batch(texts)
    feats = []
    sims: list[dict[str, Any]] = []
    for emb in embeddings:
        drive = encode_for_reservoir(
            emb,
            mode=encoding_mode,  # type: ignore[arg-type]
            input_dim=reservoir.input_dim,
            timesteps=timesteps,
            seed=seed,
        )
        states = reservoir.run(drive, washout=max(0, timesteps // 4))
        # Echo-state style readout features: mean and final state
        feat = np.concatenate([states.mean(axis=0), states[-1]])
        feats.append(feat)
        if collect_sim:
            sims.append(reservoir.sampled_activity())
    return np.asarray(feats, dtype=np.float32), sims


def embedding_features(texts: list[str], encoder: TextEncoder) -> np.ndarray:
    return encoder.encode_batch(texts)


def build_model(
    model_type: str,
    *,
    encoder_kind: str | None = None,
    seed: int = 42,
    input_dim: int = 64,
    timesteps: int = 12,
    encoding_mode: str = "temporal",
) -> ModelBundle:
    encoder_kind = resolve_encoder_kind(encoder_kind)
    encoder = get_encoder(encoder_kind, seed=seed)
    config = {
        "model_type": model_type,
        "encoder": encoder.name,
        "seed": seed,
        "input_dim": input_dim,
        "timesteps": timesteps,
        "encoding_mode": encoding_mode,
        "demo_mode": True,
    }

    if model_type == "linear":
        return ModelBundle(
            model_type=model_type,
            encoder=encoder,
            readout=LinearBaseline(seed=seed),
            reservoir=None,
            graph=None,
            config=config,
        )
    if model_type == "mlp":
        return ModelBundle(
            model_type=model_type,
            encoder=encoder,
            readout=MLPBaseline(seed=seed),
            reservoir=None,
            graph=None,
            config=config,
        )

    control_map = {
        "connectome": "biological",
        "random_erdos": "random_erdos",
        "random_degree_preserving": "random_degree_preserving",
        "random_weights": "random_weights",
    }
    if model_type not in control_map:
        raise ValueError(f"Unknown model_type: {model_type}")
    graph = load_active_graph(control_map[model_type])
    reservoir = make_reservoir(graph, input_dim=input_dim, seed=seed)
    mode = connectome_mode()
    config.update(
        {
            "reservoir_size": graph.n_nodes,
            "edge_count": graph.n_edges,
            "graph_control": graph.control,
            "leak": reservoir.leak,
            "demo_mode": mode == "demo",
            "connectome_mode": mode,
            "graph_source": graph.metadata.get("source"),
            "anatomical_edges": bool(graph.metadata.get("anatomical", False)),
            "graph_license": graph.metadata.get("license"),
        }
    )
    return ModelBundle(
        model_type=model_type,
        encoder=encoder,
        readout=MultiLabelReadout(seed=seed),
        reservoir=reservoir,
        graph=graph,
        config=config,
    )


def featurize(bundle: ModelBundle, texts: list[str], *, collect_sim: bool = False):
    if bundle.model_type in {"linear", "mlp"}:
        X = embedding_features(texts, bundle.encoder)
        return X, []
    assert bundle.reservoir is not None
    return reservoir_features(
        texts,
        bundle.encoder,
        bundle.reservoir,
        encoding_mode=bundle.config["encoding_mode"],
        timesteps=bundle.config["timesteps"],
        seed=bundle.config["seed"],
        collect_sim=collect_sim,
    )


def train_bundle(
    bundle: ModelBundle,
    texts: list[str],
    label_lists: list[list[str]],
) -> dict[str, Any]:
    t0 = time.perf_counter()
    X, _ = featurize(bundle, texts)
    y = labels_to_matrix(label_lists)
    bundle.readout.fit(X, y)
    train_time = time.perf_counter() - t0
    return {
        "train_time_sec": train_time,
        "n_train": len(texts),
        "feature_dim": int(X.shape[1]),
        "trainable_params": bundle.trainable_params(),
        "config": bundle.config,
    }


def predict_bundle(
    bundle: ModelBundle,
    texts: list[str],
    *,
    with_simulation: bool = False,
) -> tuple[list[Prediction], list[dict[str, Any]], float]:
    t0 = time.perf_counter()
    X, sims = featurize(bundle, texts, collect_sim=with_simulation)
    preds = bundle.readout.predict(X)
    elapsed = time.perf_counter() - t0
    return preds, sims, elapsed


def save_bundle(bundle: ModelBundle, path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    payload = {
        "model_type": bundle.model_type,
        "config": bundle.config,
        "encoder_name": bundle.encoder.name,
    }
    (path / "meta.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    joblib.dump(bundle.readout, path / "readout.joblib")


def load_readout(path: Path):
    return joblib.load(path / "readout.joblib")


def maybe_load_trained(bundle: ModelBundle, models_dir: Path = MODELS_DIR) -> ModelBundle:
    path = models_dir / bundle.model_type
    readout_path = path / "readout.joblib"
    if readout_path.exists():
        bundle.readout = joblib.load(readout_path)
        meta_path = path / "meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            bundle.config = {**bundle.config, **meta.get("config", {})}
    return bundle