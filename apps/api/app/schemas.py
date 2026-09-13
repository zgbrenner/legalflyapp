from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator
from apps.api.app.config import get_settings

class ClassifyRequest(BaseModel):
    text: str = Field(...,min_length=1)
    model: str = "connectome"
    with_simulation: bool = True
    @field_validator("text")
    @classmethod
    def validate_text(cls,value):
        cleaned=value.strip()
        if not cleaned:raise ValueError("Text must not be empty")
        maximum=get_settings().legalfly_max_text_chars
        if len(cleaned)>maximum:raise ValueError(f"Text exceeds limit of {maximum} characters")
        return cleaned

class LabelScore(BaseModel):
    name: str
    confidence: float

class ClassifyResponse(BaseModel):
    encoder_name: str = "unknown"
    science_version: str | None = None
    graph_hash: str | None = None
    artifact_hash: str | None = None
    training_examples: int = 0
    contains_sensitive: bool
    labels: list[LabelScore]
    scores: dict[str,float]
    model: str
    demo_mode: bool
    connectome_mode: str = "demo"
    graph_label: str
    graph_source: str | None = None
    anatomical_edges: bool = False
    inference_time_sec: float
    simulation: dict[str,Any]
    disclaimer: str

class TwinRequest(BaseModel):
    text: str = Field(...,min_length=1)
    with_simulation: bool = True
    @field_validator("text")
    @classmethod
    def validate_text(cls,value):return ClassifyRequest.validate_text(value)

class TwinResponse(BaseModel):
    tissue: ClassifyResponse
    twin: ClassifyResponse
    baseline: ClassifyResponse | None = None
    agree_on_sensitive: bool
    disclaimer: str

class SimulateRequest(ClassifyRequest):
    timesteps: int = Field(default=12,ge=1,le=64)

class FeedbackRequest(BaseModel):
    correct: bool
    model: str
    predicted_labels: list[str] = Field(default_factory=list)
    fingerprint: str | None = None
