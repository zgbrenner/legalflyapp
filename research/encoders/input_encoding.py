"""Embedding → reservoir input encoding strategies."""

from __future__ import annotations

from typing import Literal

import numpy as np

EncodingMode = Literal["direct", "temporal"]


def project_embedding(
    embedding: np.ndarray,
    input_dim: int,
    *,
    seed: int = 42,
) -> np.ndarray:
    """Fixed random projection of embedding into reservoir input dimension."""
    emb = np.asarray(embedding, dtype=np.float32).reshape(-1)
    rng = np.random.default_rng(seed)
    proj = rng.normal(0.0, 1.0 / np.sqrt(emb.shape[0]), size=(input_dim, emb.shape[0])).astype(
        np.float32
    )
    out = proj @ emb
    norm = np.linalg.norm(out)
    if norm > 0:
        out = out / norm
    return out


def encode_for_reservoir(
    embedding: np.ndarray,
    *,
    mode: EncodingMode = "temporal",
    input_dim: int = 64,
    timesteps: int = 12,
    seed: int = 42,
) -> np.ndarray:
    """
    Convert text embedding into a (T, input_dim) drive signal.

    direct: repeat projected vector across timesteps
    temporal: chunk / rotate projection across timesteps
    """
    projected = project_embedding(embedding, input_dim, seed=seed)
    if mode == "direct":
        return np.tile(projected, (timesteps, 1))

    if mode == "temporal":
        emb = np.asarray(embedding, dtype=np.float32).reshape(-1)
        # Split embedding into chunks mapped over time.
        chunks = np.array_split(emb, timesteps)
        frames = []
        rng = np.random.default_rng(seed)
        for t, chunk in enumerate(chunks):
            # Pad chunk then project with time-specific seeded matrix
            padded = np.zeros(emb.shape[0], dtype=np.float32)
            padded[: chunk.shape[0]] = chunk
            local = project_embedding(padded, input_dim, seed=seed + t + 17)
            # Mild mixing with global projection for continuity
            frame = 0.65 * local + 0.35 * projected
            # Temporal gate
            gate = 0.5 + 0.5 * np.sin(2 * np.pi * (t + 1) / (timesteps + 1))
            noise = rng.normal(0.0, 0.01, size=input_dim).astype(np.float32)
            frames.append(gate * frame + noise)
        arr = np.asarray(frames, dtype=np.float32)
        return arr

    raise ValueError(f"Unknown encoding mode: {mode}")