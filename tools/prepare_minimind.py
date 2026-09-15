"""Download and fingerprint the pinned MiniMind checkpoint used for the browser conversion."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

MODEL_ID = "jingyaogong/minimind-3"
REVISION = "f92512d4cd6142fa9acc0d6022375049a8974bf6"
TARGET = Path(__file__).resolve().parents[1] / "models" / "minimind-3"
WEIGHTS_SHA256 = "3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8"
REQUIRED_FILES = ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json")


def snapshot_download(*args, **kwargs):
    # Offline --check must work even before linguistic dependencies are installed.
    from huggingface_hub import snapshot_download as download

    return download(*args, **kwargs)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify checkpoint files offline; do not download or start inference")
    parser.add_argument("--model-path", type=Path, default=Path(os.environ.get("LEGALFLY_MINIMIND_PATH", str(TARGET))))
    args = parser.parse_args()
    target = args.model_path.expanduser().resolve()
    try:
        if not args.check:
            snapshot_download(
                MODEL_ID,
                revision=REVISION,
                local_dir=target,
                allow_patterns=["*.json", "*.safetensors", "tokenizer*", "*.model"],
            )
        missing = [name for name in REQUIRED_FILES if not (target / name).is_file()]
        if missing:
            raise ValueError(f"Missing checkpoint files at {target}: {', '.join(missing)}. Run tools/prepare_minimind.py without --check to download the pinned checkpoint.")
        if sha256(target / "model.safetensors") != WEIGHTS_SHA256:
            raise ValueError(f"MiniMind model.safetensors SHA-256 mismatch at {target}; refusing to certify these weights.")
        for name in REQUIRED_FILES[1:]:
            if not isinstance(json.loads((target / name).read_text()), dict):
                raise ValueError(f"Invalid JSON object in {name}")
    except Exception as exc:
        print(f"MiniMind setup failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    if args.check:
        print(f"Verified pinned MiniMind weights and required JSON files at {target}. Runtime loading and readout fitting have NOT been checked.")
        return
    files = {
        path.relative_to(target).as_posix(): {"bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in sorted(target.rglob("*"))
        if path.is_file() and ".cache" not in path.parts and path.name != "provenance.json"
    }
    provenance = {"model": MODEL_ID, "revision": REVISION, "files": files}
    (target / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
