"""Serving metadata and cached controls must describe the graph actually loaded."""
from types import SimpleNamespace
import numpy as np
from research.graphs.connectome import build_synthetic_connectome, apply_control, CONTROL_SEEDS
from research.experiments import pipeline


def test_graph_cache_is_invalidated_when_biological_parent_changes(tmp_path, monkeypatch):
    graph = build_synthetic_connectome(n_nodes=24, seed=3)
    graph.save(tmp_path / 'biological')
    seed = 42 + CONTROL_SEEDS['random_erdos']
    old = apply_control(graph, 'random_erdos', seed=seed)
    old.save(tmp_path / 'random_erdos')
    graph.adjacency.data[0] *= 2
    graph.save(tmp_path / 'biological')
    monkeypatch.setattr(pipeline, 'active_graph_dir', lambda: tmp_path)
    loaded = pipeline.load_active_graph('random_erdos', graph_seed=42)
    expected = apply_control(graph, 'random_erdos', seed=seed)
    assert loaded.fingerprint() == expected.fingerprint()
    assert loaded.fingerprint() != old.fingerprint()


def test_controls_record_parent_graph_identity():
    graph = build_synthetic_connectome(n_nodes=24, seed=3)
    control = apply_control(graph, 'random_erdos', seed=1)
    assert control.metadata.get('parent_graph_hash') == graph.fingerprint()


def test_linear_configuration_changes_actual_regularization():
    bundle = pipeline.build_model('linear', encoder_kind='hashing', readout_c=.125)
    assert bundle.readout.readout.C == .125


def test_models_status_uses_actual_loaded_graph(monkeypatch):
    from apps.api.app.routes import api
    service = SimpleNamespace(settings=SimpleNamespace(legalfly_demo_mode=True),
                              list_models=lambda:[{'id':'connectome','loaded':True,'demo_mode':False}])
    monkeypatch.setattr(api,'get_model_service',lambda:service)
    assert api.models()['demo_mode'] is False
