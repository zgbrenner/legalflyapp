"""Opt-in real checkpoint test: never downloads and never substitutes a fake model."""

import os

import pytest
from fastapi.testclient import TestClient

from apps.minimind_adapter.service import (
    Adapter, MiniMindScorer, MODEL_ID, MODEL_REVISION, create_app, get_adapter,
)


@pytest.mark.skipif(not os.environ.get("LEGALFLY_TEST_MINIMIND_PATH"), reason="Set LEGALFLY_TEST_MINIMIND_PATH to verified real weights")
def test_real_checkpoint_startup_encode_verbalize_and_control():
    path = os.environ["LEGALFLY_TEST_MINIMIND_PATH"]
    active = Adapter(MiniMindScorer(path), get_adapter().teaching_cases)
    with TestClient(create_app(active)) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["ready"] is True
        assert health.json()["model"] == MODEL_ID
        assert health.json()["model_revision"] == MODEL_REVISION
        assert health.json()["mode"] == "frozen-embedding-readouts"
        assert len(active.field_readouts) == 8
        assert sum(parameter.numel() for parameter in active.scorer.model.parameters()) == 63_912_192

        encoded = client.post("/encode", json={"petition": "A goat ate my cabbages."})
        assert encoded.status_code == 200
        draft = encoded.json()
        assert draft["receipt"]["requires_confirmation"] is True
        assert draft["receipt"]["answer_labels_available"] is False
        assert len(draft["facts"]) == 8

        note = client.post("/verbalize", json={"facts": draft["facts"], "action": "seek-small-reparation", "confidence_band": "medium"})
        assert note.status_code == 200
        assert note.json()["action"] == "seek-small-reparation"
        assert note.json()["receipt"]["alternative_actions_available"] is False
        assert note.json()["text"]

        control = client.post("/benchmark-control", json={"cases": [{"id": "smoke", "petition": "A goat ate my cabbages."}]})
        assert control.status_code == 200
        assert control.json()["rows"][0]["id"] == "smoke"
        assert control.json()["model_revision"] == MODEL_REVISION
