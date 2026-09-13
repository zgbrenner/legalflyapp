"""Feature extraction, directed reservoir classification and verified checkpoints."""
from __future__ import annotations
import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import joblib
import numpy as np
from research.baselines.classifiers import LinearBaseline, MLPBaseline, MultiLabelReadout, Prediction, labels_to_matrix
from research.encoders.input_encoding import encode_for_reservoir
from research.encoders.text import TextEncoder, get_encoder, resolve_encoder_kind
from research.graphs.connectome import ConnectomeGraph, apply_control, SCIENCE_VERSION, CONTROL_SEEDS
from research.reservoirs.base import ConnectomeReservoir, make_reservoir

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_GRAPH_DIR = REPO_ROOT / "data/demo/connectome"
HEMIBRAIN_GRAPH_DIR = REPO_ROOT / "data/processed/hemibrain"
MODELS_DIR = REPO_ROOT / "models"

def active_graph_dir():
    return HEMIBRAIN_GRAPH_DIR if (HEMIBRAIN_GRAPH_DIR / "biological/meta.json").exists() else DEMO_GRAPH_DIR

def connectome_mode():
    return "hemibrain" if active_graph_dir() == HEMIBRAIN_GRAPH_DIR else "demo"

@dataclass
class ModelBundle:
    model_type: str
    encoder: TextEncoder
    readout: Any
    reservoir: ConnectomeReservoir | None
    graph: ConnectomeGraph | None
    config: dict[str, Any]
    def trainable_params(self):
        return int(self.readout.trainable_params()) if hasattr(self.readout, "trainable_params") else -1

def load_active_graph(control="biological", graph_seed=42):
    graph_dir = active_graph_dir()
    bio = graph_dir / "biological"
    if not bio.exists():
        from research.graphs.build_demo_connectome import build_all
        build_all(DEMO_GRAPH_DIR)
        bio = DEMO_GRAPH_DIR / "biological"
    graph = ConnectomeGraph.load(bio)
    if control == "biological":
        return graph
    path = graph_dir / control
    expected_seed = graph_seed + CONTROL_SEEDS[control]
    if (path / "meta.json").exists():
        candidate = ConnectomeGraph.load(path)
        if (candidate.metadata.get("science_version") == SCIENCE_VERSION
                and candidate.metadata.get("control_seed") == expected_seed
                and candidate.metadata.get("parent_graph_hash") == graph.fingerprint()):
            return candidate
    return apply_control(graph, control, seed=expected_seed)

def load_demo_graph(control="biological"):
    return load_active_graph(control)

def reservoir_features(texts, encoder, reservoir, *, encoding_mode="temporal", timesteps=12,
                       seed=42, collect_sim=False, feature_mode="states"):
    embeddings = encoder.encode_batch(texts)
    feats, sims = [], []
    for emb in embeddings:
        drive = encode_for_reservoir(emb, mode=encoding_mode, input_dim=reservoir.input_dim, timesteps=timesteps, seed=seed)
        states = reservoir.run(drive, washout=max(0, timesteps // 4))
        if feature_mode == "hybrid":
            idx = np.sort(np.random.default_rng(seed).choice(reservoir.n_nodes, size=min(128, reservoir.n_nodes), replace=False))
            feat = np.concatenate([emb, states.mean(axis=0)[idx], states[-1, idx]])
        else:
            feat = np.concatenate([states.mean(axis=0), states[-1]])
        feats.append(feat)
        if collect_sim:
            sims.append(reservoir.sampled_activity())
    return np.asarray(feats, dtype=np.float32), sims

def embedding_features(texts, encoder):
    return encoder.encode_batch(texts)

def build_model(model_type, *, encoder_kind=None, seed=42, input_dim=64, timesteps=12,
                encoding_mode="temporal", feature_mode="states", graph_seed=None, leak=.3,
                input_scale=.35, spectral_radius=.9, input_routing="random", readout_c=1., reservoir_weight=1.):
    encoder = get_encoder(resolve_encoder_kind(encoder_kind), seed=seed)
    config = {"science_version": SCIENCE_VERSION, "model_type": model_type, "feature_mode": feature_mode,
              "graph_seed": seed if graph_seed is None else graph_seed, "reservoir_weight": reservoir_weight,
              "readout_c": readout_c, "encoder": encoder.name, "seed": seed, "input_dim": input_dim,
              "timesteps": timesteps, "encoding_mode": encoding_mode, "demo_mode": True}
    if model_type in {"linear", "mlp"}:
        readout = LinearBaseline(seed=seed, C=readout_c) if model_type == "linear" else MLPBaseline(seed=seed)
        return ModelBundle(model_type, encoder, readout, None, None, config)
    controls = {"connectome": "biological", "random_erdos": "random_erdos",
                "random_degree_preserving": "random_degree_preserving", "random_weights": "random_weights"}
    if model_type not in controls:
        raise ValueError(f"Unknown model_type: {model_type}")
    graph = load_active_graph(controls[model_type], graph_seed=seed if graph_seed is None else graph_seed)
    reservoir = make_reservoir(graph, input_dim=input_dim, seed=seed, leak=leak, input_scale=input_scale,
                               spectral_radius=spectral_radius, input_routing=input_routing)
    mode = connectome_mode()
    config.update({"graph_hash": graph.fingerprint(), "input_scale": input_scale, "spectral_radius": spectral_radius,
                   "input_routing": input_routing, "reservoir_size": graph.n_nodes, "edge_count": graph.n_edges,
                   "graph_control": graph.control, "leak": reservoir.leak, "demo_mode": mode == "demo",
                   "connectome_mode": mode, "graph_source": graph.metadata.get("source"),
                   "anatomical_edges": bool(graph.metadata.get("anatomical", False)), "graph_license": graph.metadata.get("license")})
    weights = np.concatenate([np.ones(encoder.dim), np.full(min(128, graph.n_nodes)*2, reservoir_weight)]) if feature_mode == "hybrid" else None
    readout = MultiLabelReadout(seed=seed, C=readout_c, feature_weights=weights)
    return ModelBundle(model_type, encoder, readout, reservoir, graph, config)

def featurize(bundle, texts, *, collect_sim=False):
    if bundle.model_type in {"linear", "mlp"}:
        return embedding_features(texts, bundle.encoder), []
    assert bundle.reservoir is not None
    return reservoir_features(texts, bundle.encoder, bundle.reservoir, encoding_mode=bundle.config["encoding_mode"],
                              timesteps=bundle.config["timesteps"], seed=bundle.config["seed"], collect_sim=collect_sim,
                              feature_mode=bundle.config.get("feature_mode", "states"))

def train_bundle(bundle, texts, label_lists):
    started = time.perf_counter()
    X, _ = featurize(bundle, texts)
    bundle.readout.fit(X, labels_to_matrix(label_lists))
    bundle.config["training_examples"] = len(texts)
    return {"train_time_sec": time.perf_counter()-started, "n_train": len(texts), "feature_dim": int(X.shape[1]),
            "trainable_params": bundle.trainable_params(), "config": bundle.config}

def predict_bundle(bundle, texts, *, with_simulation=False):
    started = time.perf_counter()
    X, sims = featurize(bundle, texts, collect_sim=with_simulation)
    preds = bundle.readout.predict(X)
    return preds, sims, time.perf_counter()-started

def save_bundle(bundle, path):
    path.mkdir(parents=True, exist_ok=True)
    artifact = path / "readout.joblib"
    joblib.dump(bundle.readout, artifact)
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    bundle.config["artifact_hash"] = digest
    payload = {"model_type": bundle.model_type, "config": bundle.config, "encoder_name": bundle.encoder.name, "artifact_hash": digest}
    (path / "meta.json").write_text(json.dumps(payload, indent=2)+"\n", encoding="utf-8")

def load_readout(path):
    return joblib.load(path / "readout.joblib")

def maybe_load_trained(bundle, models_dir=MODELS_DIR):
    path = models_dir / bundle.model_type
    artifact = path / "readout.joblib"
    if not artifact.exists():
        return bundle
    meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
    saved = meta.get("config", {})
    for key in ("science_version", "graph_hash", "encoder", "seed", "input_dim", "timesteps", "encoding_mode",
                "feature_mode", "leak", "input_scale", "spectral_radius", "input_routing", "reservoir_weight", "readout_c"):
        if saved.get(key) != bundle.config.get(key):
            raise ValueError(f"Incompatible checkpoint: {key}. Rebuild the serving bundle.")
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != meta.get("artifact_hash"):
        raise ValueError("Checkpoint checksum mismatch")
    bundle.readout = joblib.load(artifact)
    bundle.config.update(saved)
    return bundle
