"""Model service: loads/trains demo models and runs inference without persisting text."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from apps.api.app.config import Settings, get_settings
from research.datasets.sensitive import load_sensitive_split
from research.experiments.pipeline import (
    ModelBundle,
    build_model,
    maybe_load_trained,
    predict_bundle,
    train_bundle,
)
from research.experiments.run import ensure_data

logger = logging.getLogger("legalfly.api")

MODEL_ALIASES = {
    "connectome": "connectome",
    "biological": "connectome",
    "real": "connectome",
    "fly": "connectome",
    "random": "random_erdos",
    "random_erdos": "random_erdos",
    "random_degree": "random_degree_preserving",
    "random_degree_preserving": "random_degree_preserving",
    "random_weights": "random_weights",
    "linear": "linear",
    "baseline": "linear",
    "mlp": "mlp",
}


class ModelService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._bundles: dict[str, ModelBundle] = {}
        self._ready = False

    def startup(self) -> None:
        ensure_data()
        # Prefetch primary models used by the UI
        for model in ("connectome", "random_erdos", "linear"):
            self.get_bundle(model)
        self._ready = True
        logger.info(
            "ModelService ready demo_mode=%s encoder=%s",
            self.settings.legalfly_demo_mode,
            self.settings.legalfly_encoder,
        )

    def resolve_model(self, name: str) -> str:
        key = name.strip().lower()
        if key not in MODEL_ALIASES:
            raise KeyError(f"Unknown model '{name}'")
        return MODEL_ALIASES[key]

    def _feature_dim(self, bundle: ModelBundle) -> int:
        if bundle.reservoir is not None:
            return int(bundle.reservoir.n_nodes * 2)
        return int(bundle.encoder.dim)

    def _readout_compatible(self, bundle: ModelBundle) -> bool:
        readout = bundle.readout
        scaler = getattr(readout, "scaler", None)
        if scaler is None or not hasattr(scaler, "n_features_in_"):
            # LinearBaseline wraps readout
            inner = getattr(readout, "readout", None)
            scaler = getattr(inner, "scaler", None) if inner is not None else None
        if scaler is None or not hasattr(scaler, "n_features_in_"):
            return False
        return int(scaler.n_features_in_) == self._feature_dim(bundle)

    def get_bundle(self, model: str) -> ModelBundle:
        model = self.resolve_model(model)
        if model in self._bundles:
            return self._bundles[model]
        bundle = build_model(
            model,
            encoder_kind=self.settings.legalfly_encoder,
            seed=self.settings.legalfly_seed,
        )
        models_dir = self.settings.repo_root / self.settings.legalfly_models_dir
        readout_path = models_dir / model / "readout.joblib"
        needs_train = True
        if readout_path.exists():
            bundle = maybe_load_trained(bundle, models_dir=models_dir)
            needs_train = not self._readout_compatible(bundle)
        if needs_train:
            train = load_sensitive_split("train")
            subset = train[:400]
            train_bundle(bundle, [ex.text for ex in subset], [ex.labels for ex in subset])
            from research.experiments.pipeline import save_bundle

            save_bundle(bundle, models_dir / model)
        self._bundles[model] = bundle
        return bundle

    def classify(self, text: str, model: str, with_simulation: bool = True) -> dict[str, Any]:
        from apps.api.app.privacy import text_fingerprint

        bundle = self.get_bundle(model)
        preds, sims, elapsed = predict_bundle(
            bundle, [text], with_simulation=with_simulation and bundle.reservoir is not None
        )
        pred = preds[0]
        labels = [
            {"name": name, "confidence": float(pred.scores.get(name, 0.0))}
            for name in pred.labels
        ]

        logger.info(
            "classify model=%s chars=%d fingerprint=%s elapsed=%.3fs sensitive=%s",
            bundle.model_type,
            len(text),
            text_fingerprint(text),
            elapsed,
            pred.contains_sensitive,
        )
        return {
            "contains_sensitive": pred.contains_sensitive,
            "labels": labels,
            "scores": pred.scores,
            "model": bundle.model_type,
            "demo_mode": self.settings.legalfly_demo_mode,
            "graph_label": (
                "DEMO CONNECTOME"
                if bundle.model_type == "connectome"
                else bundle.model_type.replace("_", " ").upper()
            ),
            "inference_time_sec": elapsed,
            "simulation": sims[0]
            if sims
            else {
                "timesteps": 0,
                "sampled_activity": [],
                "aggregate": {},
                "anatomical": False,
                "layout": "none",
            },
            "disclaimer": (
                "LegalFly does not simulate consciousness and does not provide legal advice. "
                "Submitted text is not stored by default."
            ),
        }

    def list_models(self) -> list[dict[str, Any]]:
        items = []
        for name in ("connectome", "random_erdos", "random_degree_preserving", "random_weights", "linear", "mlp"):
            items.append(
                {
                    "id": name,
                    "name": name,
                    "demo_mode": self.settings.legalfly_demo_mode,
                    "loaded": name in self._bundles,
                }
            )
        return items


@lru_cache
def get_model_service() -> ModelService:
    return ModelService(get_settings())