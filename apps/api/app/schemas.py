from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from apps.api.app.config import get_settings


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    model: str = "connectome"
    with_simulation: bool = True

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Text must not be empty")
        max_chars = get_settings().legalfly_max_text_chars
        if len(cleaned) > max_chars:
            raise ValueError(f"Text exceeds limit of {max_chars} characters")
        return cleaned


class LabelScore(BaseModel):
    name: str
    confidence: float


class ClassifyResponse(BaseModel):
    contains_sensitive: bool
    labels: list[LabelScore]
    scores: dict[str, float]
    model: str
    demo_mode: bool
    connectome_mode: str = "demo"
    graph_label: str
    graph_source: str | None = None
    anatomical_edges: bool = False
    inference_time_sec: float
    simulation: dict[str, Any]
    disclaimer: str


class SimulateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    model: Literal[
        "connectome",
        "random_erdos",
        "random_degree_preserving",
        "random_weights",
        "linear",
        "mlp",
    ] = "connectome"
    timesteps: int = Field(default=12, ge=1, le=64)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        return ClassifyRequest.validate_text(value)


class FeedbackRequest(BaseModel):
    """Optional ephemeral feedback — not persisted with raw text."""

    correct: bool
    model: str
    predicted_labels: list[str] = []
    fingerprint: str | None = None