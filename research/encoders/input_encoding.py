"""Embedding to reservoir drive, using immutable cached projection matrices."""
from __future__ import annotations
from typing import Literal
from functools import lru_cache
import numpy as np
EncodingMode = Literal["direct", "temporal"]

@lru_cache(maxsize=256)
def projection_matrix(embedding_dim: int, input_dim: int, seed: int):
    matrix = np.random.default_rng(seed).normal(0., 1./np.sqrt(embedding_dim), size=(input_dim, embedding_dim)).astype(np.float32)
    matrix.setflags(write=False)
    return matrix

def project_embedding(embedding, input_dim, *, seed=42):
    emb = np.asarray(embedding, dtype=np.float32).reshape(-1)
    out = projection_matrix(emb.shape[0], input_dim, seed) @ emb
    norm = np.linalg.norm(out)
    return out / norm if norm > 0 else out

def encode_for_reservoir(embedding, *, mode: EncodingMode="temporal", input_dim=64, timesteps=12, seed=42):
    projected = project_embedding(embedding, input_dim, seed=seed)
    if mode == "direct":
        return np.tile(projected, (timesteps, 1))
    if mode == "temporal":
        emb = np.asarray(embedding, dtype=np.float32).reshape(-1)
        frames = []
        rng = np.random.default_rng(seed)
        for t, chunk in enumerate(np.array_split(emb, timesteps)):
            padded = np.zeros(emb.shape[0], dtype=np.float32)
            padded[:chunk.shape[0]] = chunk
            local = project_embedding(padded, input_dim, seed=seed+t+17)
            frame = .65*local + .35*projected
            gate = .5 + .5*np.sin(2*np.pi*(t+1)/(timesteps+1))
            noise = rng.normal(0., .01, size=input_dim).astype(np.float32)
            frames.append(gate*frame + noise)
        return np.asarray(frames, dtype=np.float32)
    raise ValueError(f"Unknown encoding mode: {mode}")
