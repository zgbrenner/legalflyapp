from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from apps.api.app.privacy import text_fingerprint
from apps.api.app.schemas import (
    ClassifyRequest,
    ClassifyResponse,
    FeedbackRequest,
    SimulateRequest,
    TwinRequest,
    TwinResponse,
)
from apps.api.app.services.models import get_model_service
from apps.api.app.services.results import list_experiments, load_ablations, load_benchmark

logger = logging.getLogger("legalfly.api")
router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "legalfly-api"}


@router.get("/models")
def models() -> dict:
    service = get_model_service()
    return {"models": service.list_models(), "demo_mode": service.settings.legalfly_demo_mode}


@router.post("/classify", response_model=ClassifyResponse)
def classify(body: ClassifyRequest) -> ClassifyResponse:
    service = get_model_service()
    try:
        result = service.classify(body.text, body.model, with_simulation=body.with_simulation)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("classify failed fingerprint=%s", text_fingerprint(body.text))
        raise HTTPException(status_code=500, detail="Classification failed") from exc
    return ClassifyResponse(**result)




@router.post("/twin", response_model=TwinResponse)
def twin(body: TwinRequest) -> TwinResponse:
    service = get_model_service()
    try:
        result = service.classify_twin(body.text, with_simulation=body.with_simulation)
    except Exception as exc:
        logger.exception("twin failed fingerprint=%s", text_fingerprint(body.text))
        raise HTTPException(status_code=500, detail="Twin classification failed") from exc
    return TwinResponse(**result)

@router.post("/simulate")
def simulate(body: SimulateRequest) -> dict:
    service = get_model_service()
    try:
        result = service.classify(body.text, body.model, with_simulation=True)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "model": result["model"],
        "simulation": result["simulation"],
        "labels": result["labels"],
        "contains_sensitive": result["contains_sensitive"],
    }


@router.get("/benchmark")
def benchmark() -> dict:
    return load_benchmark()


@router.get("/experiments")
def experiments() -> dict:
    return {"experiments": list_experiments()}


@router.get("/ablations")
def ablations() -> dict:
    return load_ablations()


@router.post("/feedback")
def feedback(body: FeedbackRequest) -> dict:
    # Explicitly do not store raw text. Count-only telemetry could be added later.
    logger.info(
        "feedback correct=%s model=%s labels=%s fingerprint=%s",
        body.correct,
        body.model,
        body.predicted_labels,
        body.fingerprint,
    )
    return {"ok": True, "persisted_text": False}