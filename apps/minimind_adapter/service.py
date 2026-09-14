"""Local-only, schema-constrained MiniMind language adapter."""

from __future__ import annotations

import math
import os
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

MODEL_ID = "jingyaogong/minimind-3"
MODEL_REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6"
UPSTREAM_COMMIT = "21ec325dbaa0942ac667323a509aac60a58044a4"
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "minimind-3"

FIELD_OPTIONS = {
    "matter": ["damage", "debt", "property", "delivery", "boundary", "insult", "account", "charter", "official", "threat"],
    "property": ["none", "crops", "animal", "tool", "goods", "payment", "money", "land", "document", "public place", "small item", "service", "clothing", "fence"],
    "harm": ["none", "low", "moderate", "high"],
    "proof": ["unclear", "witness", "admitted", "document"],
    "intent": ["unclear", "careless", "deliberate", "unable"],
    "relationship": ["neighbors", "trade", "official"],
    "urgency": ["low", "ordinary", "high"],
    "ability": ["able", "unable"],
}

ACTIONS = {
    "let-rest": "Let the matter rest.",
    "seek-small-reparation": "Seek small reparation.",
    "seek-full-reparation": "Seek full reparation.",
    "request-return": "Request return of property.",
    "find-witness": "Find a witness.",
    "sworn-account": "Request a sworn account within the fictional charter.",
    "propose-settlement": "Propose settlement.",
    "refer-higher": "Refer the matter to a higher authority.",
    "abstain": "The fly declines to advise.",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PetitionRequest(StrictModel):
    petition: str = Field(min_length=1, max_length=1000)

    @field_validator("petition")
    @classmethod
    def strip_petition(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("petition must contain text")
        return value.strip()


class Facts(StrictModel):
    matter: str
    property: str
    harm: str
    proof: str
    intent: str
    relationship: str
    urgency: str
    ability: str

    @field_validator("*")
    @classmethod
    def validate_enum(cls, value: str, info) -> str:
        if value not in FIELD_OPTIONS[info.field_name]:
            raise ValueError(f"unsupported {info.field_name}")
        return value


class VerbalizeRequest(StrictModel):
    facts: Facts
    action: Literal[
        "let-rest", "seek-small-reparation", "seek-full-reparation", "request-return",
        "find-witness", "sworn-account", "propose-settlement", "refer-higher", "abstain",
    ]
    confidence_band: Literal["low", "medium", "high"]


class BenchmarkCase(PetitionRequest):
    id: str = Field(min_length=1, max_length=100)


class BenchmarkRequest(StrictModel):
    cases: list[BenchmarkCase] = Field(min_length=1, max_length=32)


class MiniMindScorer:
    """Ranks allow-listed continuations. It never accepts free-form output."""

    def __init__(self, model_path: str | Path):
        self.model_path = Path(model_path)
        self.model = None
        self.tokenizer = None
        self.load_seconds = None

    def load(self) -> None:
        if self.model is not None:
            return
        if not (self.model_path / "model.safetensors").exists():
            raise FileNotFoundError(
                f"MiniMind checkpoint missing at {self.model_path}. Run tools/prepare_minimind.py."
            )
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        started = time.perf_counter()
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, local_files_only=True)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_path, local_files_only=True, dtype=torch.float32
        )
        self.model.eval()
        self.load_seconds = time.perf_counter() - started

    def score(self, prompt: str, candidates: list[str]) -> list[float]:
        self.load()
        import torch

        prefix = self.tokenizer.encode(prompt, add_special_tokens=False)
        encoded = [prefix + self.tokenizer.encode(c, add_special_tokens=False) for c in candidates]
        width = max(map(len, encoded))
        pad_id = self.tokenizer.pad_token_id or self.tokenizer.eos_token_id or 0
        ids = torch.full((len(encoded), width), pad_id, dtype=torch.long)
        mask = torch.zeros_like(ids)
        for row, values in enumerate(encoded):
            ids[row, : len(values)] = torch.tensor(values)
            mask[row, : len(values)] = 1
        with torch.inference_mode():
            logits = self.model(input_ids=ids, attention_mask=mask).logits[:, :-1]
            log_probs = logits.log_softmax(dim=-1)
        scores = []
        for row, values in enumerate(encoded):
            start = max(0, len(prefix) - 1)
            targets = ids[row, 1 : len(values)]
            token_scores = log_probs[row, start : len(values) - 1].gather(1, targets[start:].unsqueeze(1))
            scores.append(float(token_scores.mean()))
        return scores

    def embed(self, petitions: list[str]):
        self.load()
        import torch

        prompts = [
            "<|im_start|>user\nRead this village petition literally: "
            + petition
            + "<|im_end|>\n<|im_start|>assistant\n"
            for petition in petitions
        ]
        batch = self.tokenizer(prompts, return_tensors="pt", padding=True, truncation=True, max_length=256)
        batch.pop("token_type_ids", None)
        with torch.inference_mode():
            output = self.model(**batch, output_hidden_states=True)
        hidden = output.hidden_states[-1]
        mask = batch["attention_mask"].unsqueeze(-1)
        pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp_min(1)
        pooled = torch.nn.functional.normalize(pooled.float(), dim=1)
        return pooled.cpu().numpy()


def confidence(scores: list[float]) -> float:
    peak = max(scores)
    values = [math.exp(s - peak) for s in scores]
    return max(values) / sum(values)


def best(scorer: MiniMindScorer, prompt: str, candidates: list[str]) -> tuple[str, float]:
    scores = scorer.score(prompt, candidates)
    index = max(range(len(scores)), key=scores.__getitem__)
    return candidates[index], confidence(scores)


class Adapter:
    def __init__(self, scorer: MiniMindScorer, teaching_cases: list[dict] | None = None):
        self.scorer = scorer
        self.teaching_cases = [case for case in (teaching_cases or []) if case.get("split") == "teach"]
        self.field_readouts = {}
        self.action_readout = None
        self.readout_parameters = 0

    def load(self) -> None:
        self.scorer.load()
        if self.teaching_cases and hasattr(self.scorer, "embed"):
            self._fit_readouts()

    def _fit_readouts(self) -> None:
        import numpy as np

        vectors = self.scorer.embed([case["petition"] for case in self.teaching_cases])
        dimensions = vectors.shape[1]
        for field in FIELD_OPTIONS:
            labels = sorted({case["facts"][field] for case in self.teaching_cases})
            centroids = np.stack(
                [vectors[[case["facts"][field] == label for case in self.teaching_cases]].mean(axis=0) for label in labels]
            )
            centroids /= np.linalg.norm(centroids, axis=1, keepdims=True).clip(min=1e-12)
            self.field_readouts[field] = (labels, centroids)
            self.readout_parameters += len(labels) * (dimensions + 1)
        labels = list(ACTIONS)[:-1]
        centroids = np.stack(
            [vectors[[case["label"] == label for case in self.teaching_cases]].mean(axis=0) for label in labels]
        )
        centroids /= np.linalg.norm(centroids, axis=1, keepdims=True).clip(min=1e-12)
        self.action_readout = (labels, centroids)
        self.readout_parameters += len(labels) * (dimensions + 1)

    @staticmethod
    def _readout(vector, readout) -> tuple[str, float]:
        import numpy as np

        labels, centroids = readout
        scores = centroids @ vector
        probabilities = np.exp((scores - scores.max()) * 4)
        probabilities /= probabilities.sum()
        index = int(probabilities.argmax())
        return labels[index], float(probabilities[index])

    def encode(self, petition: str) -> dict:
        facts, scores = {}, {}
        if self.field_readouts:
            vector = self.scorer.embed([petition])[0]
            for field in FIELD_OPTIONS:
                facts[field], scores[field] = self._readout(vector, self.field_readouts[field])
        else:
            for field, choices in FIELD_OPTIONS.items():
                prompt = (
                    "<|im_start|>system\nYou are a literal village clerk. Choose one listed value. "
                    "Do not decide an outcome.<|im_end|>\n<|im_start|>user\n"
                    f"Petition: {petition}\nField: {field}\nAllowed values: {', '.join(choices)}"
                    f"<|im_end|>\n<|im_start|>assistant\n{field}="
                )
                facts[field], scores[field] = best(self.scorer, prompt, choices)
        return {
            "facts": facts,
            "field_confidence": scores,
            "receipt": {
                "input": ["petition"],
                "output": list(FIELD_OPTIONS),
                "answer_labels_available": False,
                "requires_confirmation": True,
                "mode": "frozen MiniMind embedding with teaching-only field readouts" if self.field_readouts else "candidate likelihood",
            },
        }

    def verbalize(self, facts: Facts, action: str, confidence_band: str) -> dict:
        fact_map = facts.model_dump()
        subject = fact_map["property"] if fact_map["property"] != "none" else "the matter"
        templates = {
            "let-rest": ["Let the matter rest unless the facts change.", "No further step is advised on the present account."],
            "seek-small-reparation": [f"First speak with the other party. Record the harm to {subject}. Seek modest reparation if it continues.", f"Document the harm to {subject}, then ask for a small reparation."],
            "seek-full-reparation": [f"Preserve the account of harm to {subject}. Seek full reparation under the fictional charter.", f"Record the loss involving {subject} and request full reparation."],
            "request-return": [f"Ask for the return of {subject}. Record the request and any reply.", f"Request that {subject} be returned before taking a further step."],
            "find-witness": ["Find a witness before pressing the petition further.", "Write down the disputed account and seek someone who observed it."],
            "sworn-account": ["Request a sworn account under the fictional village charter.", "Ask each party for a sworn account within the fictional charter."],
            "propose-settlement": ["Put a practical settlement to both parties and record what each accepts.", "Propose terms both parties can keep, then write them into the ledger."],
            "refer-higher": ["Refer the petition to a higher authority. The fly offers no final judgment.", "Place the matter before a higher authority under the fictional charter."],
            "abstain": ["The fly declines to advise on the present facts.", "The account is too uncertain for this fly to recommend a next step."],
        }[action]
        prompt = (
            "<|im_start|>system\nSelect one supplied counsel note. The action is fixed and cannot "
            "be changed.<|im_end|>\n<|im_start|>user\n"
            f"Selected action: {ACTIONS[action]}\nConfirmed facts: {fact_map}\n"
            f"Confidence band: {confidence_band}<|im_end|>\n<|im_start|>assistant\n"
        )
        note, score = best(self.scorer, prompt, templates)
        return {
            "text": note,
            "action": action,
            "selection_confidence": score,
            "receipt": {
                "input": ["selected_action", "confirmed_facts", "confidence_band"],
                "alternative_actions_available": False,
                "output_mode": "allow-listed sentence selection",
            },
        }

    def classify_control(self, petition: str) -> dict:
        if self.action_readout is not None:
            action, score = self._readout(self.scorer.embed([petition])[0], self.action_readout)
            return {"action": action, "confidence": score}
        candidates = list(ACTIONS)[:-1]
        prompt = (
            "<|im_start|>system\nChoose one fictional charter action ID.<|im_end|>\n"
            f"<|im_start|>user\nPetition: {petition}\nAction ID:<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
        action, score = best(self.scorer, prompt, candidates)
        return {"action": action, "confidence": score}


@lru_cache
def get_adapter() -> Adapter:
    path = os.environ.get("LEGALFLY_MINIMIND_PATH", str(DEFAULT_MODEL_PATH))
    cases_path = Path(__file__).resolve().parents[2] / "apps" / "web" / "public" / "legalfly" / "cases.json"
    cases = __import__("json").loads(cases_path.read_text())
    return Adapter(MiniMindScorer(path), cases)


def create_app(adapter: Adapter | None = None) -> FastAPI:
    active = adapter or get_adapter()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        import asyncio

        await asyncio.to_thread(active.load)
        yield

    app = FastAPI(title="The Legal Fly MiniMind Adapter", version="1.0", lifespan=lifespan)
    origins = os.environ.get(
        "LEGALFLY_MINIMIND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in origins if origin.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )

    @app.get("/health")
    def health():
        return {
            "ready": active.scorer.model is not None,
            "model": MODEL_ID,
            "model_revision": MODEL_REVISION,
            "upstream_commit": UPSTREAM_COMMIT,
            "load_seconds": active.scorer.load_seconds,
            "mode": "frozen-embedding-readouts" if active.field_readouts else "candidate-likelihood",
            "readout_parameters": active.readout_parameters,
        }

    @app.post("/encode")
    def encode(request: PetitionRequest):
        try:
            return active.encode(request.petition)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/verbalize")
    def verbalize(request: VerbalizeRequest):
        try:
            return active.verbalize(request.facts, request.action, request.confidence_band)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/benchmark-control")
    def benchmark_control(request: BenchmarkRequest):
        try:
            return {
                "rows": [
                    {"id": case.id, **active.classify_control(case.petition)} for case in request.cases
                ],
                "model_revision": MODEL_REVISION,
            }
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    return app


app = create_app()
