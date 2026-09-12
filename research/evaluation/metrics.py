"""Evaluation metrics for multilabel sensitive-information detection."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from research.labels import LABEL_TO_INDEX, multilabel_vector


def multilabel_metrics(
    y_true: list[list[str]],
    y_pred: list[list[str]],
    labels: list[str],
) -> dict[str, Any]:
    yt = np.asarray([multilabel_vector(row) for row in y_true], dtype=np.int32)
    yp = np.asarray([multilabel_vector(row) for row in y_pred], dtype=np.int32)

    # Exact-match accuracy across full label vectors
    exact = float(accuracy_score(yt, yp))
    macro_f1 = float(f1_score(yt, yp, average="macro", zero_division=0))
    micro_f1 = float(f1_score(yt, yp, average="micro", zero_division=0))
    precision = float(precision_score(yt, yp, average="macro", zero_division=0))
    recall = float(recall_score(yt, yp, average="macro", zero_division=0))

    # Binary sensitive detection
    true_sens = np.array([0 if row == ["NONE"] else 1 for row in y_true])
    pred_sens = np.array([0 if row == ["NONE"] else 1 for row in y_pred])
    binary_acc = float(accuracy_score(true_sens, pred_sens))
    binary_f1 = float(f1_score(true_sens, pred_sens, zero_division=0))
    cm = confusion_matrix(true_sens, pred_sens, labels=[0, 1]).tolist()

    per_class = {}
    for label in labels:
        idx = LABEL_TO_INDEX[label]
        per_class[label] = {
            "precision": float(precision_score(yt[:, idx], yp[:, idx], zero_division=0)),
            "recall": float(recall_score(yt[:, idx], yp[:, idx], zero_division=0)),
            "f1": float(f1_score(yt[:, idx], yp[:, idx], zero_division=0)),
            "support": int(yt[:, idx].sum()),
        }

    return {
        "exact_match_accuracy": exact,
        "macro_f1": macro_f1,
        "micro_f1": micro_f1,
        "precision_macro": precision,
        "recall_macro": recall,
        "binary_sensitive_accuracy": binary_acc,
        "binary_sensitive_f1": binary_f1,
        "confusion_matrix_sensitive": cm,
        "per_class": per_class,
        "n_examples": len(y_true),
    }