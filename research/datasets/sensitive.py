"""Load synthetic sensitive-information splits."""

from __future__ import annotations

import json
from pathlib import Path

from research.tasks.base import Example

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = REPO_ROOT / "data" / "demo" / "sensitive"


def load_sensitive_split(split: str, data_dir: Path | None = None) -> list[Example]:
    if split not in {"train", "validation", "test"}:
        raise ValueError(f"Unknown split: {split}")
    base = data_dir or DEFAULT_DIR
    # Prefer harder legal set when callers pass None and it exists beside demo data.
    if data_dir is None:
        hard = REPO_ROOT / "data" / "demo" / "sensitive_hard"
        if (hard / f"{split}.jsonl").exists() and (hard / "train.jsonl").exists():
            base = hard
    path = base / f"{split}.jsonl"
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Run: python -m research.datasets.generate_sensitive_dataset "
            "or python -m research.datasets.generate_hard_legal_dataset"
        )
    examples: list[Example] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            examples.append(
                Example(
                    text=row["text"],
                    labels=list(row["labels"]),
                    contains_sensitive=bool(row["contains_sensitive"]),
                    difficulty=row.get("difficulty", "medium"),
                    metadata={k: v for k, v in row.items() if k not in {"text", "labels"}},
                )
            )
    return examples