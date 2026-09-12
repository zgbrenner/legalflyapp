"""Trainable readouts and baseline classifiers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.multioutput import MultiOutputClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from research.labels import INDEX_TO_LABEL, LABELS, multilabel_vector

ModelKind = Literal[
    "connectome",
    "random_erdos",
    "random_degree_preserving",
    "random_weights",
    "linear",
    "mlp",
]


@dataclass
class Prediction:
    labels: list[str]
    scores: dict[str, float]
    contains_sensitive: bool


class MultiLabelReadout:
    """Independent logistic heads on reservoir features / embeddings."""

    def __init__(self, C: float = 1.0, max_iter: int = 400, seed: int = 42):
        self.scaler = StandardScaler()
        self.model = MultiOutputClassifier(
            LogisticRegression(
                C=C,
                max_iter=max_iter,
                solver="lbfgs",
                random_state=seed,
            )
        )
        self.fitted = False

    def fit(self, X: np.ndarray, y: np.ndarray) -> MultiLabelReadout:
        Xs = self.scaler.fit_transform(X)
        self.model.fit(Xs, y)
        self.fitted = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        Xs = self.scaler.transform(X)
        probas = []
        for est in self.model.estimators_:
            if hasattr(est, "predict_proba"):
                p = est.predict_proba(Xs)
                probas.append(p[:, 1] if p.shape[1] == 2 else p[:, 0])
            else:
                probas.append(est.decision_function(Xs))
        return np.vstack(probas).T

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> list[Prediction]:
        probs = self.predict_proba(X)
        out: list[Prediction] = []
        for row in probs:
            scores = {INDEX_TO_LABEL[i]: float(row[i]) for i in range(len(LABELS))}
            none_score = scores["NONE"]
            sensitive_scores = {k: v for k, v in scores.items() if k != "NONE"}
            ranked = sorted(sensitive_scores.items(), key=lambda kv: kv[1], reverse=True)
            active = [name for name, score in ranked if score >= threshold]
            # If NONE dominates and no sensitive label clears threshold, abstain to NONE.
            if not active:
                best_name, best_score = ranked[0] if ranked else ("NONE", 0.0)
                if none_score >= best_score:
                    labels = ["NONE"]
                else:
                    labels = [best_name]
            else:
                # Keep top labels; drop weak extras more than 0.25 behind the leader
                top = ranked[0][1]
                labels = [name for name, score in ranked if score >= threshold and score >= top - 0.25][
                    :3
                ]
            contains = labels != ["NONE"]
            out.append(Prediction(labels=labels, scores=scores, contains_sensitive=contains))
        return out

    def trainable_params(self) -> int:
        total = 0
        for est in self.model.estimators_:
            if hasattr(est, "coef_"):
                total += int(np.prod(est.coef_.shape))
                if est.intercept_ is not None:
                    total += int(np.prod(est.intercept_.shape))
        return total


class LinearBaseline:
    name = "linear"

    def __init__(self, seed: int = 42):
        self.readout = MultiLabelReadout(seed=seed)
        self.seed = seed

    def fit(self, X: np.ndarray, y: np.ndarray) -> LinearBaseline:
        self.readout.fit(X, y)
        return self

    def predict(self, X: np.ndarray) -> list[Prediction]:
        return self.readout.predict(X)

    def trainable_params(self) -> int:
        return self.readout.trainable_params()


class MLPBaseline:
    name = "mlp"

    def __init__(self, seed: int = 42, hidden=(128, 64)):
        self.scaler = StandardScaler()
        self.model = MultiOutputClassifier(
            MLPClassifier(
                hidden_layer_sizes=hidden,
                max_iter=200,
                random_state=seed,
                early_stopping=True,
                validation_fraction=0.1,
            )
        )
        self.fitted = False

    def fit(self, X: np.ndarray, y: np.ndarray) -> MLPBaseline:
        Xs = self.scaler.fit_transform(X)
        self.model.fit(Xs, y)
        self.fitted = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        Xs = self.scaler.transform(X)
        probas = []
        for est in self.model.estimators_:
            p = est.predict_proba(Xs)
            probas.append(p[:, 1] if p.shape[1] == 2 else p[:, 0])
        return np.vstack(probas).T

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> list[Prediction]:
        probs = self.predict_proba(X)
        out: list[Prediction] = []
        for row in probs:
            scores = {INDEX_TO_LABEL[i]: float(row[i]) for i in range(len(LABELS))}
            active = [LABELS[i] for i, p in enumerate(row) if p >= threshold and LABELS[i] != "NONE"]
            if not active:
                best = int(np.argmax(row))
                labels = ["NONE"] if LABELS[best] == "NONE" else [LABELS[best]]
            else:
                labels = active
            out.append(
                Prediction(labels=labels, scores=scores, contains_sensitive=labels != ["NONE"])
            )
        return out

    def trainable_params(self) -> int:
        total = 0
        for est in self.model.estimators_:
            for coef in est.coefs_:
                total += int(np.prod(coef.shape))
            for intercept in est.intercepts_:
                total += int(np.prod(intercept.shape))
        return total


def labels_to_matrix(label_lists: list[list[str]]) -> np.ndarray:
    return np.asarray([multilabel_vector(labels) for labels in label_lists], dtype=np.int32)