"""Download and fingerprint the pinned MiniMind checkpoint used by the local adapter."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from huggingface_hub import snapshot_download

MODEL_ID = "jingyaogong/minimind-3"
REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6"
TARGET = Path(__file__).resolve().parents[1] / "models" / "minimind-3"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    snapshot_download(
        MODEL_ID,
        revision=REVISION,
        local_dir=TARGET,
        allow_patterns=["*.json", "*.safetensors", "tokenizer*", "*.model"],
    )
    files = {
        path.relative_to(TARGET).as_posix(): {"bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in sorted(TARGET.rglob("*"))
        if path.is_file() and ".cache" not in path.parts and path.name != "provenance.json"
    }
    provenance = {"model": MODEL_ID, "revision": REVISION, "files": files}
    (TARGET / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
