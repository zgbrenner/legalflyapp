"""Shared label taxonomy for sensitive-information detection."""

from __future__ import annotations

LABELS: tuple[str, ...] = (
    "NONE",
    "PERSON",
    "EMAIL",
    "PHONE",
    "ADDRESS",
    "SSN",
    "CREDIT_CARD",
    "DATE_OF_BIRTH",
    "FINANCIAL",
    "MEDICAL",
    "CREDENTIAL",
    "OTHER_SENSITIVE",
)

SENSITIVE_LABELS: tuple[str, ...] = tuple(label for label in LABELS if label != "NONE")

LABEL_TO_INDEX = {label: idx for idx, label in enumerate(LABELS)}
INDEX_TO_LABEL = {idx: label for label, idx in LABEL_TO_INDEX.items()}


def multilabel_vector(labels: list[str]) -> list[int]:
    vec = [0] * len(LABELS)
    normalized = {label.upper() for label in labels}
    if not normalized or normalized == {"NONE"}:
        vec[LABEL_TO_INDEX["NONE"]] = 1
        return vec
    for label in normalized:
        if label == "NONE":
            continue
        if label not in LABEL_TO_INDEX:
            raise ValueError(f"Unknown label: {label}")
        vec[LABEL_TO_INDEX[label]] = 1
    return vec


def contains_sensitive(labels: list[str]) -> bool:
    return any(label.upper() != "NONE" for label in labels)