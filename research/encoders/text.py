"""Text encoders for LegalFly."""

from __future__ import annotations

import hashlib
import re
import struct
from abc import ABC, abstractmethod

import numpy as np


class TextEncoder(ABC):
    name: str
    dim: int

    @abstractmethod
    def encode(self, text: str) -> np.ndarray:
        raise NotImplementedError

    def encode_batch(self, texts: list[str]) -> np.ndarray:
        return np.vstack([self.encode(text) for text in texts])


def _stable_hash(seed: int, gram: str) -> int:
    """Process-stable 64-bit hash (do not use Python's salted hash())."""
    digest = hashlib.blake2b(f"{seed}:{gram}".encode(), digest_size=8).digest()
    return struct.unpack("<Q", digest)[0]


class HashingTextEncoder(TextEncoder):
    """
    CPU-friendly deterministic hashing encoder.

    Used for demo mode and offline tests so the project runs without
    downloading large embedding models. Produces a fixed 384-d vector.
    """

    name = "hashing-384"

    def __init__(self, dim: int = 384, ngram_range: tuple[int, int] = (3, 5), seed: int = 42):
        self.dim = dim
        self.ngram_range = ngram_range
        self.seed = seed

    def _ngrams(self, text: str) -> list[str]:
        cleaned = " ".join(text.lower().split())
        grams = cleaned.split()
        lo, hi = self.ngram_range
        char_grams = [
            cleaned[i : i + n]
            for n in range(lo, hi + 1)
            for i in range(max(0, len(cleaned) - n + 1))
        ]
        return grams + char_grams

    def encode(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float64)
        for gram in self._ngrams(text):
            h = _stable_hash(self.seed, gram)
            idx = h % self.dim
            sign = 1.0 if ((h // self.dim) % 2) == 0 else -1.0
            vec[idx] += sign

        # Stable lexical cues help synthetic PII detection without proprietary APIs.
        lowered = text.lower()
        cues = [
            ("@", 0),
            (".com", 1),
            ("email", 2),
            ("phone", 3),
            ("call", 4),
            ("ssn", 5),
            ("social security", 6),
            ("password", 7),
            ("api key", 8),
            ("dob", 9),
            ("date of birth", 10),
            ("street", 11),
            ("address", 12),
            ("patient", 13),
            ("diagnos", 14),
            ("iban", 15),
            ("salary", 16),
            ("passport", 17),
            ("license", 18),
            ("card number", 19),
        ]
        for needle, slot in cues:
            if needle in lowered:
                vec[slot] += 2.5

        if re.search(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b", text):
            vec[3] += 2.0
        if re.search(r"\b\d{3}-\d{2}-\d{4}\b", text):
            vec[5] += 2.5
        if re.search(r"\b(?:\d[ -]*?){13,19}\b", text):
            vec[19] += 2.0

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec.astype(np.float32)


class SentenceTransformerEncoder(TextEncoder):
    """Optional sentence-transformers backend for research mode."""

    name = "sentence-transformers"

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self._model = SentenceTransformer(model_name)
        self.dim = int(self._model.get_sentence_embedding_dimension())
        self.name = f"st:{model_name}"

    def encode(self, text: str) -> np.ndarray:
        emb = self._model.encode([text], normalize_embeddings=True)[0]
        return np.asarray(emb, dtype=np.float32)


def get_encoder(kind: str = "hashing", **kwargs) -> TextEncoder:
    if kind in {"hashing", "demo", "hashing-384"}:
        return HashingTextEncoder(**{k: v for k, v in kwargs.items() if k in {"dim", "seed"}})
    if kind in {"sentence-transformers", "st", "minilm"}:
        return SentenceTransformerEncoder(
            model_name=kwargs.get("model_name", "sentence-transformers/all-MiniLM-L6-v2")
        )
    raise ValueError(f"Unknown encoder: {kind}")
