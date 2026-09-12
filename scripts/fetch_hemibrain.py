#!/usr/bin/env python3
"""Fetch Janelia hemibrain compact adjacency tables (CC BY 4.0).

Source:
  https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz

This is real Drosophila central-brain connectivity (~21k traced neurons),
not a synthetic demo graph. Cite Xu / Scheffer / Plaza et al. (hemibrain).
"""

from __future__ import annotations

import argparse
import hashlib
import tarfile
import urllib.request
from pathlib import Path

DEFAULT_URL = (
    "https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz"
)
REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "data" / "raw" / "hemibrain"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, out_dir: Path, *, force: bool = False) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / "exported-traced-adjacencies-v1.2.tar.gz"
    extract_dir = out_dir / "extract"

    if force or not archive.exists() or archive.stat().st_size < 1_000_000:
        print(f"Downloading {url}")
        urllib.request.urlretrieve(url, archive)  # noqa: S310 — pinned public dataset URL
    else:
        print(f"Using cached archive {archive} ({archive.stat().st_size} bytes)")

    print(f"sha256={_sha256(archive)}")
    extract_dir.mkdir(parents=True, exist_ok=True)
    marker = extract_dir / "exported-traced-adjacencies-v1.2" / "traced-total-connections.csv"
    if force or not marker.exists():
        print(f"Extracting to {extract_dir}")
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(extract_dir)
    print(f"Ready: {marker}")
    return marker.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    path = fetch(args.url, args.out, force=args.force)
    print(path)


if __name__ == "__main__":
    main()
