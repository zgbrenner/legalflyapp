#!/usr/bin/env python3
"""Acquire and convert the official MaleCNS v1.0 flat connectome.

This script intentionally writes large outputs under data/, which is ignored by
git. It requires pyarrow for Feather input:

    python -m pip install pyarrow pandas numpy
    python tools/prepare_malecns.py --download --convert --export-browser
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import random
import struct
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/malecns/v1.0"
PROCESSED = ROOT / "data/processed/malecns/v1.0"
BROWSER = PROCESSED / "browser"
BASE = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome"

OBJECTS = {
    "annotations": {
        "url": f"{BASE}/body-annotations-male-cns-v1.0-minconf-0.5.feather",
        "generation": "1780494878811468",
        "md5_b64": "UKdxh3DFciDxYLpPQxq4ng==",
        "size": 14483314,
    },
    "weights": {
        "url": f"{BASE}/connectome-weights-male-cns-v1.0-minconf-0.5.feather",
        "generation": "1780494887545976",
        "md5_b64": "8w6dzKJc/QIb8eez2XVZng==",
        "size": 1051241946,
    },
}


def digest(path: Path) -> dict[str, str | int]:
    h = hashlib.sha256()
    m = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
            m.update(chunk)
    return {"sha256": h.hexdigest(), "md5_b64": base64.b64encode(m.digest()).decode(), "size": path.stat().st_size}


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    provenance = {"release": "MaleCNS v1.0", "source": "https://male-cns.janelia.org/download/", "objects": {}}
    for name, meta in OBJECTS.items():
        dest = RAW / Path(meta["url"]).name
        if not dest.exists() or dest.stat().st_size != meta["size"]:
            print(f"Downloading {name}: {meta['url']}")
            urllib.request.urlretrieve(meta["url"], dest)
        got = digest(dest)
        if got["size"] != meta["size"] or got["md5_b64"] != meta["md5_b64"]:
            raise SystemExit(f"Integrity check failed for {dest}")
        provenance["objects"][name] = {**meta, **got}
    (RAW / "provenance.json").write_text(json.dumps(provenance, indent=2))


def load_tables():
    try:
        import pyarrow.feather as feather
    except ModuleNotFoundError as exc:
        raise SystemExit("Install pyarrow first: python -m pip install pyarrow pandas numpy") from exc
    annotations = feather.read_table(RAW / "body-annotations-male-cns-v1.0-minconf-0.5.feather").to_pandas()
    weights = feather.read_table(RAW / "connectome-weights-male-cns-v1.0-minconf-0.5.feather").to_pandas()
    return annotations, weights


def first_col(df, names):
    lowered = {c.lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lowered:
            return lowered[name.lower()]
    for c in df.columns:
        lc = c.lower()
        if all(part in lc for part in names[0].lower().split("_")):
            return c
    raise SystemExit(f"Could not find any of {names} in columns: {list(df.columns)}")


def convert() -> None:
    annotations, weights = load_tables()
    body_col = first_col(annotations, ["bodyId", "body", "body_id"])
    pre_col = first_col(weights, ["body_pre", "pre", "bodyId_pre", "body_pre_id"])
    post_col = first_col(weights, ["body_post", "post", "bodyId_post", "body_post_id"])
    weight_col = first_col(weights, ["weight", "syn_count", "count"])

    bodies = sorted(int(x) for x in annotations[body_col].dropna().unique())
    index = {b: i for i, b in enumerate(bodies)}
    rows: list[tuple[int, int, float]] = []
    excluded = 0
    contacts = 0
    for pre, post, w in zip(weights[pre_col], weights[post_col], weights[weight_col], strict=False):
        pre_i = index.get(int(pre)) if not math.isnan(float(pre)) else None
        post_i = index.get(int(post)) if not math.isnan(float(post)) else None
        if pre_i is None or post_i is None or float(w) <= 0:
            excluded += 1
            continue
        rows.append((pre_i, post_i, float(w)))
        contacts += int(w)

    rows.sort()
    indptr = np.zeros(len(bodies) + 1, dtype=np.uint32)
    indices = np.zeros(len(rows), dtype=np.uint32)
    data = np.zeros(len(rows), dtype=np.float32)
    for src, dst, w in rows:
        indptr[src + 1] += 1
    np.cumsum(indptr, out=indptr)
    cursor = indptr[:-1].copy()
    for src, dst, w in rows:
        j = cursor[src]
        indices[j] = dst
        data[j] = w
        cursor[src] += 1

    PROCESSED.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(PROCESSED / "malecns-csr.npz", indptr=indptr, indices=indices, data=data)
    meta = {
        "selection_policy": "All annotated traced neuronal bodies in body-annotations; all positive released minconf-0.5 directed body-pair connections between retained bodies. Isolated retained bodies are preserved.",
        "exclusions": "Glia, untraced fragments, bodies absent from body-annotations, nonpositive weights, and connection rows whose endpoint was excluded.",
        "confidence_filter": "Publisher flat-connectome files labeled minconf-0.5.",
        "neuronal_bodies": len(bodies),
        "directed_neuron_pair_connections": len(rows),
        "summed_synaptic_contacts": contacts,
        "source_records_excluded": excluded,
        "body_ids": [str(x) for x in bodies],
        "raw": json.loads((RAW / "provenance.json").read_text()) if (RAW / "provenance.json").exists() else {},
    }
    (PROCESSED / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: meta[k] for k in ["neuronal_bodies", "directed_neuron_pair_connections", "summed_synaptic_contacts", "source_records_excluded"]}, indent=2))


def recurrence_scale(indptr, indices, data) -> float:
    n = len(indptr) - 1
    state = np.full(n, 1 / math.sqrt(n), dtype=np.float64)
    radius = 1.0
    for _ in range(40):
        nxt = np.zeros(n, dtype=np.float64)
        for src in range(n):
            start, end = indptr[src], indptr[src + 1]
            if end > start:
                nxt[indices[start:end]] += data[start:end] * state[src]
        radius = float(np.linalg.norm(nxt)) or 1.0
        state = nxt / radius
    return 0.85 / radius


def write_bin(path: Path, indptr, indices, data) -> str:
    payload = b"LFLYMC1\0" + struct.pack("<II", len(indptr) - 1, len(indices)) + indptr.astype("<u4").tobytes() + indices.astype("<u4").tobytes() + data.astype("<f4").tobytes()
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def export_browser(include_shuffled: bool = False) -> None:
    BROWSER.mkdir(parents=True, exist_ok=True)
    meta = json.loads((PROCESSED / "meta.json").read_text())
    z = np.load(PROCESSED / "malecns-csr.npz")
    indptr, indices, data = z["indptr"], z["indices"], z["data"]
    graph_sha = write_bin(BROWSER / "malecns.bin", indptr, indices, data)
    stride = max(1, len(meta["body_ids"]) // 360)
    sample_body_ids = [[i, meta["body_ids"][i]] for i in range(0, len(meta["body_ids"]), stride)]
    manifest = {
        "dataset": {"name": "MaleCNS", "release": "v1.0", "source": "https://male-cns.janelia.org/download/", "license": "CC BY 4.0"},
        "graph": {
            "neurons": meta["neuronal_bodies"],
            "connections": meta["directed_neuron_pair_connections"],
            "contacts": meta["summed_synaptic_contacts"],
            "excluded": meta["source_records_excluded"],
            "fingerprint": hashlib.sha256((json.dumps(meta["body_ids"]) + graph_sha).encode()).hexdigest(),
            "recurrenceScale": recurrence_scale(indptr, indices, data),
            "sha256": graph_sha,
            "selectionPolicy": meta["selection_policy"],
            "sampleBodyIds": sample_body_ids,
        },
        "shuffled": None,
        "provenance": meta["raw"],
    }
    if include_shuffled:
        shuffled = indices.copy()
        rng = random.Random(20260914)
        sources = np.repeat(np.arange(len(indptr) - 1, dtype=np.uint32), np.diff(indptr))
        used = set(zip(sources.tolist(), shuffled.tolist()))
        swaps = 0
        for _ in range(min(len(shuffled) * 6, 20_000_000)):
            a, b = rng.randrange(len(shuffled)), rng.randrange(len(shuffled))
            s, t, u, v = int(sources[a]), int(sources[b]), int(shuffled[a]), int(shuffled[b])
            if s == t or u == v or s == v or t == u or (s, v) in used or (t, u) in used:
                continue
            used.remove((s, u)); used.remove((t, v)); used.add((s, v)); used.add((t, u))
            shuffled[a], shuffled[b] = v, u
            swaps += 1
        shuffled_sha = write_bin(BROWSER / "malecns-shuffled.bin", indptr, shuffled, data)
        manifest["shuffled"] = {"sha256": shuffled_sha, "acceptedSwaps": swaps, "preserves": "source out-degree sequence, target in-degree sequence after accepted swaps, and weight multiset"}
    (BROWSER / "manifest.json").write_text(json.dumps(manifest, indent=2))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--download", action="store_true")
    p.add_argument("--convert", action="store_true")
    p.add_argument("--export-browser", action="store_true")
    p.add_argument("--shuffled", action="store_true", help="Also build the large degree-preserving shuffled browser control")
    args = p.parse_args()
    if args.download:
        download()
    if args.convert:
        convert()
    if args.export_browser:
        export_browser(args.shuffled)


if __name__ == "__main__":
    main()
