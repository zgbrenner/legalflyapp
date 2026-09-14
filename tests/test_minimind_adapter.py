from fastapi.testclient import TestClient

from apps.minimind_adapter.service import Adapter, Facts, create_app


class FakeScorer:
    model = object()
    load_seconds = 0.01

    def load(self):
        return None

    def score(self, prompt, candidates):
        return [float(index) for index, _ in enumerate(candidates)]


def client():
    return TestClient(create_app(Adapter(FakeScorer())))


def test_encoder_returns_only_allow_listed_facts_and_a_boundary_receipt():
    response = client().post("/encode", json={"petition": "A goat ate my cabbages."})
    assert response.status_code == 200
    body = response.json()
    assert set(body["facts"]) == {
        "matter", "property", "harm", "proof", "intent", "relationship", "urgency", "ability"
    }
    assert body["receipt"]["answer_labels_available"] is False
    assert body["receipt"]["requires_confirmation"] is True


def test_decoder_cannot_change_the_fly_action_or_receive_other_logits():
    facts = Facts(
        matter="damage", property="crops", harm="moderate", proof="unclear",
        intent="careless", relationship="neighbors", urgency="ordinary", ability="able",
    )
    result = Adapter(FakeScorer()).verbalize(facts, "seek-small-reparation", "medium")
    assert result["action"] == "seek-small-reparation"
    assert result["receipt"]["alternative_actions_available"] is False
    assert "reparation" in result["text"]


def test_unknown_fields_and_actions_are_rejected_before_model_use():
    good = {
        "facts": {
            "matter": "damage", "property": "crops", "harm": "moderate", "proof": "unclear",
            "intent": "careless", "relationship": "neighbors", "urgency": "ordinary", "ability": "able",
        },
        "action": "seek-small-reparation",
        "confidence_band": "medium",
    }
    assert client().post("/verbalize", json={**good, "action": "convict"}).status_code == 422
    assert client().post("/verbalize", json={**good, "facts": {**good["facts"], "label": "refer-higher"}}).status_code == 422


def test_control_endpoint_is_separate_and_bounded():
    response = client().post(
        "/benchmark-control", json={"cases": [{"id": "goat", "petition": "A goat ate my cabbages."}]}
    )
    assert response.status_code == 200
    assert response.json()["rows"][0]["action"] == "refer-higher"
