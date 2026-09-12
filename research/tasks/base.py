"""Task interface for LegalFly benchmarks."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Example:
    text: str
    labels: list[str]
    contains_sensitive: bool
    difficulty: str
    metadata: dict[str, Any] | None = None


class Task(ABC):
    """Abstract classification task. Sensitive-information detection is task #1."""

    name: str
    labels: tuple[str, ...]

    @abstractmethod
    def load_split(self, split: str) -> list[Example]:
        raise NotImplementedError

    @abstractmethod
    def evaluate(self, y_true: list[list[str]], y_pred: list[list[str]]) -> dict[str, Any]:
        raise NotImplementedError


class SensitiveInformationTask(Task):
    name = "sensitive_information"

    def __init__(self) -> None:
        from research.labels import LABELS

        self.labels = LABELS

    def load_split(self, split: str) -> list[Example]:
        from research.datasets.sensitive import load_sensitive_split

        return load_sensitive_split(split)

    def evaluate(self, y_true: list[list[str]], y_pred: list[list[str]]) -> dict[str, Any]:
        from research.evaluation.metrics import multilabel_metrics

        return multilabel_metrics(y_true, y_pred, labels=list(self.labels))


TASK_REGISTRY: dict[str, type[Task]] = {
    "sensitive_information": SensitiveInformationTask,
}


def get_task(name: str) -> Task:
    if name not in TASK_REGISTRY:
        raise KeyError(f"Unknown task: {name}. Available: {sorted(TASK_REGISTRY)}")
    return TASK_REGISTRY[name]()