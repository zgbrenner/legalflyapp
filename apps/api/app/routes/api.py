import logging
from fastapi import APIRouter, HTTPException
from apps.api.app.schemas import ClassifyRequest,ClassifyResponse,FeedbackRequest,SimulateRequest,TwinRequest,TwinResponse
from apps.api.app.services.models import get_model_service
from apps.api.app.services.results import list_experiments,load_ablations,load_benchmark
logger=logging.getLogger("legalfly.api")
router=APIRouter()

@router.get("/health")
def health():return {"status":"ok","service":"legalfly-api"}

@router.get("/ready")
def ready():
    service=get_model_service()
    if not service._ready:raise HTTPException(status_code=503,detail="Models are not ready")
    return {"status":"ready","models":service.list_models()}

@router.get("/models")
def models():
    service=get_model_service()
    items = service.list_models()
    active = next((item for item in items if item["id"] == "connectome" and item["loaded"]), None)
    return {"models":items,"demo_mode":active.get("demo_mode") if active else None}

@router.post("/classify",response_model=ClassifyResponse)
def classify(body:ClassifyRequest):
    try:return get_model_service().classify(body.text,body.model,with_simulation=body.with_simulation)
    except KeyError as exc:raise HTTPException(status_code=400,detail="Unknown model") from exc
    except Exception as exc:
        logger.error("classification failed (%s)",type(exc).__name__)
        raise HTTPException(status_code=500,detail="Classification failed") from exc

@router.post("/twin",response_model=TwinResponse)
def twin(body:TwinRequest):
    try:return get_model_service().classify_twin(body.text,with_simulation=body.with_simulation)
    except Exception as exc:
        logger.error("twin classification failed (%s)",type(exc).__name__)
        raise HTTPException(status_code=500,detail="Twin classification failed") from exc

@router.post("/simulate")
def simulate(body:SimulateRequest):
    if body.timesteps!=12:
        raise HTTPException(status_code=422,detail="The trained model uses 12 timesteps. Retrain before changing its dynamics.")
    try:result=get_model_service().classify(body.text,body.model,with_simulation=True)
    except KeyError as exc:raise HTTPException(status_code=400,detail="Unknown model") from exc
    return {key:result[key] for key in ("model","simulation","labels","contains_sensitive")}

@router.get("/benchmark")
def benchmark():return load_benchmark()

@router.get("/experiments")
def experiments():return {"experiments":list_experiments()}

@router.get("/ablations")
def ablations():return load_ablations()

@router.post("/feedback")
def feedback(body:FeedbackRequest):
    # Count-only feedback; never log arbitrary client-supplied strings.
    logger.info("feedback correct=%s",body.correct)
    return {"ok":True,"persisted_text":False}
