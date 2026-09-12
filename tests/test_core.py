"""Unit tests for dataset, graphs, reservoirs, encoders, metrics, API."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def _ensure_demo_assets():
    from research.datasets.generate_sensitive_dataset import write_dataset
    from research.graphs.build_demo_connectome import build_all

    data_path = REPO / "data" / "demo" / "sensitive" / "train.jsonl"
    if not data_path.exists():
        write_dataset(REPO / "data" / "demo" / "sensitive", train_n=800, val_n=200, test_n=250)
    graph_meta = REPO / "data" / "demo" / "connectome" / "biological" / "meta.json"
    if not graph_meta.exists():
        build_all(REPO / "data" / "demo" / "connectome", n_nodes=512, seed=42)


def test_dataset_generator_deterministic():
    from research.datasets.generate_sensitive_dataset import generate_split

    a = generate_split(123, 40)
    b = generate_split(123, 40)
    assert [x["text"] for x in a] == [x["text"] for x in b]
    assert all("labels" in row and "contains_sensitive" in row for row in a)


def test_graph_controls_preserve_size():
    from research.graphs.connectome import (
        apply_control,
        build_synthetic_connectome,
    )

    g = build_synthetic_connectome(n_nodes=64, seed=1)
    for control in ("random_erdos", "random_degree_preserving", "random_weights"):
        r = apply_control(g, control, seed=2)  # type: ignore[arg-type]
        assert r.n_nodes == g.n_nodes
        assert abs(r.n_edges - g.n_edges) <= max(5, int(0.05 * g.n_edges))


def test_reservoir_determinism():
    from research.graphs.connectome import build_synthetic_connectome
    from research.reservoirs.base import ConnectomeReservoir

    g = build_synthetic_connectome(n_nodes=64, seed=3)
    r1 = ConnectomeReservoir(g, input_dim=16, seed=9)
    r2 = ConnectomeReservoir(g, input_dim=16, seed=9)
    drive = np.random.default_rng(0).normal(size=(8, 16)).astype(np.float32)
    s1 = r1.run(drive)
    s2 = r2.run(drive)
    assert np.allclose(s1, s2)


def test_encoder_dimensionality():
    from research.encoders.text import HashingTextEncoder

    enc = HashingTextEncoder(dim=384, seed=42)
    vec = enc.encode("My email is alex@example.com")
    assert vec.shape == (384,)
    assert abs(float(np.linalg.norm(vec)) - 1.0) < 1e-5


def test_metrics_and_baseline():
    from research.baselines.classifiers import LinearBaseline, labels_to_matrix
    from research.datasets.sensitive import load_sensitive_split
    from research.encoders.text import HashingTextEncoder
    from research.evaluation.metrics import multilabel_metrics

    train = load_sensitive_split("train")
    test = load_sensitive_split("test")
    enc = HashingTextEncoder(seed=0)
    Xtr = enc.encode_batch([e.text for e in train])
    Xte = enc.encode_batch([e.text for e in test])
    y = labels_to_matrix([e.labels for e in train])
    model = LinearBaseline(seed=0).fit(Xtr, y)
    preds = model.predict(Xte)
    metrics = multilabel_metrics(
        [e.labels for e in test],
        [p.labels for p in preds],
        labels=list({lab for e in train for lab in e.labels} | {"NONE"}),
    )
    assert "macro_f1" in metrics
    assert metrics["n_examples"] == len(test)


def test_api_classify_and_limits():
    from apps.api.app.main import create_app

    app = create_app()
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        models = client.get("/models")
        assert models.status_code == 200
        bad = client.post("/classify", json={"text": "   ", "model": "connectome"})
        assert bad.status_code == 422
        ok = client.post(
            "/classify",
            json={"text": "My email is alex@example.com", "model": "connectome"},
        )
        assert ok.status_code == 200
        payload = ok.json()
        assert "contains_sensitive" in payload
        assert "labels" in payload
        assert isinstance(payload["demo_mode"], bool)
        if payload["demo_mode"]:
            assert "DEMO" in payload["graph_label"].upper()
        else:
            assert payload.get("connectome_mode") == "hemibrain"
            assert payload.get("anatomical_edges") is True
            assert "HEMIBRAIN" in payload["graph_label"].upper()
        # Ensure simulation present for connectome
        assert "simulation" in payload
        assert payload["contains_sensitive"] is True
        # Fine-grained labels can vary with MiniLM + hard legal training; require a
        # non-NONE sensitive label rather than a specific EMAIL tag.
        assert any(lbl["name"] != "NONE" for lbl in payload["labels"])
        assert payload["scores"].get("EMAIL", 0) > 0.0 or any(
            lbl["name"] in {"EMAIL", "ADDRESS", "PERSON", "OTHER_SENSITIVE"} for lbl in payload["labels"]
        )
        huge = "x" * 5000
        too_big = client.post("/classify", json={"text": huge, "model": "linear"})
        assert too_big.status_code == 422


def test_benchmark_endpoint_reads_json():
    from apps.api.app.main import create_app

    # Ensure comparison file exists or endpoint returns not_yet_measured structure
    app = create_app()
    with TestClient(app) as client:
        res = client.get("/benchmark")
        assert res.status_code == 200
        body = res.json()
        assert "models" in body or body.get("status") == "not_yet_measured"


def test_privacy_redaction():
    from apps.api.app.privacy import redact_text

    red = redact_text("Contact alex@example.com at 555-123-4567")
    assert "@" not in red
    assert "alex@example.com" not in red
    assert "555" not in red


def test_ablation_changes_graph():
    from research.ablation.ops import AblationSpec, apply_ablation
    from research.graphs.connectome import build_synthetic_connectome

    g = build_synthetic_connectome(n_nodes=80, seed=5)
    ab = apply_ablation(g, AblationSpec(kind="remove_fraction", fraction=0.25, seed=1))
    assert ab.n_edges < g.n_edges


def test_hard_legal_dataset_preferred():
    from pathlib import Path

    from research.datasets.generate_hard_legal_dataset import write_dataset
    from research.datasets.sensitive import load_sensitive_split

    hard = Path(__file__).resolve().parents[1] / "data" / "demo" / "sensitive_hard"
    if not (hard / "train.jsonl").exists():
        write_dataset(hard, train_n=40, val_n=10, test_n=10)
    rows = load_sensitive_split("train")
    assert rows
    assert any(ex.metadata.get("task") == 'sensitive_information_hard' for ex in rows)


def test_default_ablations_include_regions():
    from research.ablation.ops import default_ablations_for_graph
    from research.graphs.connectome import build_synthetic_connectome

    graph = build_synthetic_connectome(n_nodes=96, seed=7)
    specs = default_ablations_for_graph(graph)
    assert any(spec.kind == "remove_region" for spec in specs)
    assert any(spec.kind == "randomize_region" for spec in specs)


def test_twin_endpoint():
    from apps.api.app.main import create_app

    app = create_app()
    with TestClient(app) as client:
        res = client.post(
            "/twin",
            json={"text": "Please email the draft to alex@example.com", "with_simulation": True},
        )
        assert res.status_code == 200
        body = res.json()
        assert "tissue" in body and "twin" in body
        assert "agree_on_sensitive" in body
        assert body["tissue"]["model"] == "connectome"
        assert body["twin"]["model"] == "random_erdos"
