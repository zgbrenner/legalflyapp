"""Small trained readouts shared by text and reservoir baselines."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.multioutput import MultiOutputClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from research.labels import INDEX_TO_LABEL, LABELS, multilabel_vector
ModelKind = Literal["connectome", "random_erdos", "random_degree_preserving", "random_weights", "linear", "mlp"]

@dataclass
class Prediction:
    labels: list[str]
    scores: dict[str, float]
    contains_sensitive: bool

class MultiLabelReadout:
    def __init__(self, C=1., max_iter=400, seed=42, feature_weights=None):
        self.scaler = StandardScaler()
        self.feature_weights = feature_weights
        self.C, self.max_iter, self.seed = C, max_iter, seed
        self.estimators_, self.constants_ = [], []
        self.fitted = False
        self.model = None

    def fit(self, X, y):
        Xs = self.scaler.fit_transform(X)
        if self.feature_weights is not None:
            Xs = Xs * self.feature_weights
        self.estimators_, self.constants_ = [], []
        for col in range(y.shape[1]):
            yi = y[:, col]
            classes = np.unique(yi)
            if classes.size < 2:
                self.estimators_.append(None)
                self.constants_.append(float(classes[0]) if classes.size else 0.)
                continue
            est = LogisticRegression(C=self.C, max_iter=self.max_iter, solver="lbfgs", random_state=self.seed)
            est.fit(Xs, yi)
            self.estimators_.append(est)
            self.constants_.append(None)
        self.fitted = True
        return self

    def predict_proba(self, X):
        Xs = self.scaler.transform(X)
        if getattr(self, "feature_weights", None) is not None:
            Xs = Xs * self.feature_weights
        if self.model is not None and not self.estimators_:
            return np.vstack([est.predict_proba(Xs)[:, 1] if len(est.classes_) == 2 else
                              np.full(len(Xs), float(est.classes_[0])) for est in self.model.estimators_]).T
        probabilities = []
        for est, constant in zip(self.estimators_, self.constants_):
            if est is None:
                probabilities.append(np.full(Xs.shape[0], float(constant or 0.)))
            else:
                p = est.predict_proba(Xs)
                probabilities.append(p[:, 1] if p.shape[1] == 2 else np.full(Xs.shape[0], float(est.classes_[0])))
        return np.vstack(probabilities).T

    def predict(self, X, threshold=.5):
        out = []
        for row in self.predict_proba(X):
            scores = {INDEX_TO_LABEL[i]: float(row[i]) for i in range(len(LABELS))}
            ranked = sorted(((k,v) for k,v in scores.items() if k != "NONE"), key=lambda kv: kv[1], reverse=True)
            active = [name for name, score in ranked if score >= threshold]
            labels = [name for name, score in ranked if score >= threshold and score >= ranked[0][1]-.25][:3] if active else ["NONE"]
            out.append(Prediction(labels, scores, labels != ["NONE"]))
        return out

    def trainable_params(self):
        total = 0
        estimators = self.estimators_ or (self.model.estimators_ if self.model is not None else [])
        for est in estimators:
            if est is not None and hasattr(est, "coef_"):
                total += int(np.prod(est.coef_.shape))
                if est.intercept_ is not None:
                    total += int(np.prod(est.intercept_.shape))
        return total

class LinearBaseline:
    name = "linear"
    def __init__(self, seed=42, C=1.):
        self.readout = MultiLabelReadout(seed=seed, C=C)
        self.seed = seed
    def fit(self, X, y):
        self.readout.fit(X, y)
        return self
    def predict(self, X):
        return self.readout.predict(X)
    def trainable_params(self):
        return self.readout.trainable_params()

class MLPBaseline:
    name = "mlp"
    def __init__(self, seed=42, hidden=(128,64)):
        self.scaler = StandardScaler()
        self.model = MultiOutputClassifier(MLPClassifier(hidden_layer_sizes=hidden, max_iter=200,
                   random_state=seed, early_stopping=True, validation_fraction=.1))
        self.fitted = False
    def fit(self, X, y):
        self.model.fit(self.scaler.fit_transform(X), y)
        self.fitted = True
        return self
    def predict_proba(self, X):
        Xs = self.scaler.transform(X)
        values = []
        for est in self.model.estimators_:
            p = est.predict_proba(Xs)
            values.append(p[:,1] if p.shape[1] == 2 else p[:,0])
        return np.vstack(values).T
    def predict(self, X, threshold=.5):
        out = []
        for row in self.predict_proba(X):
            scores = {INDEX_TO_LABEL[i]: float(row[i]) for i in range(len(LABELS))}
            labels = [LABELS[i] for i,p in enumerate(row) if p >= threshold and LABELS[i] != "NONE"]
            if not labels:
                best = int(np.argmax(row))
                labels = ["NONE"] if LABELS[best] == "NONE" else [LABELS[best]]
            out.append(Prediction(labels, scores, labels != ["NONE"]))
        return out
    def trainable_params(self):
        return sum(int(np.prod(v.shape)) for est in self.model.estimators_ for v in est.coefs_+est.intercepts_)

def labels_to_matrix(label_lists):
    return np.asarray([multilabel_vector(labels) for labels in label_lists], dtype=np.int32)
