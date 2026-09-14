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


def versioned_url(meta: dict[str, str | int]) -> str:
    """Return the immutable GCS object generation recorded by the publisher."""
    return f"{meta['url']}?generation={meta['generation']}"


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
            acquisition_url = versioned_url(meta)
            print(f"Downloading {name}: {acquisition_url}")
            urllib.request.urlretrieve(acquisition_url, dest)
        got = digest(dest)
        if got["size"] != meta["size"] or got["md5_b64"] != meta["md5_b64"]:
            raise SystemExit(f"Integrity check failed for {dest}")
        provenance["objects"][name] = {**meta, "acquisition_url": versioned_url(meta), **got}
    (RAW / "provenance.json").write_text(json.dumps(provenance, indent=2))


def load_annotations():
    try:
        import pyarrow.feather as feather
    except ModuleNotFoundError as exc:
        raise SystemExit("Install pyarrow first: python -m pip install pyarrow pandas numpy") from exc
    return feather.read_table(RAW / "body-annotations-male-cns-v1.0-minconf-0.5.feather").to_pandas()


def load_tables():
    try:
        import pyarrow.feather as feather
    except ModuleNotFoundError as exc:
        raise SystemExit("Install pyarrow first: python -m pip install pyarrow pandas numpy") from exc
    return load_annotations(), feather.read_table(RAW / "connectome-weights-male-cns-v1.0-minconf-0.5.feather").to_pandas()


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


ANATOMY_MISSING = np.iinfo(np.int32).min


def write_anatomy_bin(path: Path, body_ids, coordinates, flags) -> str:
    """Write the aligned released soma coordinates used by the browser inspector."""
    body_ids = np.asarray(body_ids, dtype="<u4")
    coordinates = np.asarray(coordinates, dtype="<i4")
    flags = np.asarray(flags, dtype=np.uint8)
    if body_ids.ndim != 1 or coordinates.shape != (len(body_ids), 3) or flags.shape != (len(body_ids),):
        raise ValueError("Anatomy arrays have incompatible dimensions")
    has_coordinate = (flags & 8) != 0
    if np.any(has_coordinate & np.any(coordinates == ANATOMY_MISSING, axis=1)):
        raise ValueError("Anatomy flags claim a missing coordinate is present")
    payload = (
        b"LFLYAN1\0"
        + struct.pack("<II", len(body_ids), int(np.count_nonzero(has_coordinate)))
        + body_ids.tobytes()
        + coordinates.tobytes()
        + flags.tobytes()
    )
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def build_anatomy(annotations, meta: dict) -> dict:
    """Align soma coordinates and released annotations to the retained graph order."""
    body_col = first_col(annotations, ["bodyId", "body", "body_id"])
    status_col = first_col(annotations, ["status"])
    soma_col = first_col(annotations, ["somaLocation", "soma_location"])
    superclass_col = first_col(annotations, ["superclass"])
    class_col = first_col(annotations, ["class"])
    neuromere_col = first_col(annotations, ["somaNeuromere"])
    body_ids = np.asarray([int(body) for body in meta["body_ids"]], dtype=np.uint32)
    index = {int(body): i for i, body in enumerate(body_ids)}
    coordinates = np.full((len(body_ids), 3), ANATOMY_MISSING, dtype=np.int32)
    flags = np.zeros(len(body_ids), dtype=np.uint8)
    input_superclasses = {"vnc_sensory", "ol_sensory", "cb_sensory", "sensory_ascending"}
    output_superclasses = {"vnc_motor", "descending_neuron"}
    retained = annotations[annotations[status_col].astype(str).eq("Traced")]
    for _, row in retained.iterrows():
        body = row[body_col]
        if body is None or not math.isfinite(float(body)) or int(body) not in index:
            continue
        i = index[int(body)]
        superclass = "" if row[superclass_col] is None else str(row[superclass_col])
        class_name = "" if row[class_col] is None else str(row[class_col])
        neuromere = "" if row[neuromere_col] is None else str(row[neuromere_col])
        if superclass in input_superclasses or "sensory" in class_name.lower():
            flags[i] |= 1
        if superclass in output_superclasses:
            flags[i] |= 2
        if superclass.startswith("vnc_") or (neuromere and neuromere.lower() != "nan"):
            flags[i] |= 4
        soma = row[soma_col]
        if isinstance(soma, (list, tuple, np.ndarray)) and len(soma) >= 3:
            values = np.asarray(soma[:3], dtype=np.float64)
            if np.all(np.isfinite(values)) and np.all(values >= np.iinfo(np.int32).min + 1) and np.all(values <= np.iinfo(np.int32).max):
                coordinates[i] = values.astype(np.int32)
                flags[i] |= 8
    PROCESSED.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(PROCESSED / "malecns-anatomy.npz", body_ids=body_ids, coordinates=coordinates, flags=flags)
    present = (flags & 8) != 0
    valid_coordinates = coordinates[present]
    anatomy = {
        "coordinate_count": int(np.count_nonzero(present)),
        "coordinate_source": "MaleCNS v1.0 body-annotations somaLocation",
        "coordinate_policy": "Released somaLocation only. Missing soma coordinates remain missing; no positions are inferred.",
        "coordinate_bounds": [valid_coordinates.min(axis=0).tolist(), valid_coordinates.max(axis=0).tolist()],
    }
    meta.update(anatomy)
    (PROCESSED / "meta.json").write_text(json.dumps(meta, indent=2))
    return anatomy


def convert_anatomy() -> None:
    meta_path = PROCESSED / "meta.json"
    if not meta_path.exists():
        raise SystemExit("Convert the graph before exporting anatomy: python tools/prepare_malecns.py --convert")
    anatomy = build_anatomy(load_annotations(), json.loads(meta_path.read_text()))
    print(json.dumps(anatomy, indent=2))


def convert() -> None:
    annotations, weights = load_tables()
    body_col = first_col(annotations, ["bodyId", "body", "body_id"])
    pre_col = first_col(weights, ["body_pre", "pre", "bodyId_pre", "body_pre_id"])
    post_col = first_col(weights, ["body_post", "post", "bodyId_post", "body_post_id"])
    weight_col = first_col(weights, ["weight", "syn_count", "count"])
    status_col = first_col(annotations, ["status"])
    superclass_col = first_col(annotations, ["superclass"])
    class_col = first_col(annotations, ["class"])
    neuromere_col = first_col(annotations, ["somaNeuromere"])

    retained_annotations = annotations[annotations[status_col].astype(str).eq("Traced")].copy()
    bodies = sorted(int(x) for x in retained_annotations[body_col].dropna().unique())
    index = {b: i for i, b in enumerate(bodies)}
    input_superclasses = {"vnc_sensory", "ol_sensory", "cb_sensory", "sensory_ascending"}
    output_superclasses = {"vnc_motor", "descending_neuron"}
    input_bodies, output_bodies, vnc_bodies = [], [], []
    for _, row in retained_annotations.iterrows():
        body = int(row[body_col])
        superclass = str(row[superclass_col]) if not __import__("pandas").isna(row[superclass_col]) else ""
        class_name = str(row[class_col]) if not __import__("pandas").isna(row[class_col]) else ""
        neuromere = str(row[neuromere_col]) if not __import__("pandas").isna(row[neuromere_col]) else ""
        if superclass in input_superclasses or "sensory" in class_name.lower():
            input_bodies.append(body)
        if superclass in output_superclasses:
            output_bodies.append(body)
        if superclass.startswith("vnc_") or neuromere:
            vnc_bodies.append(body)
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
    input_body_set = set(input_bodies)
    meta = {
        "selection_policy": "All bodies whose release annotation status is exactly Traced; all positive released minconf-0.5 directed body-pair connections between retained bodies. Isolated retained bodies are preserved.",
        "exclusions": "Annotation rows not labeled Traced, including Glia, Orphan, Unimportant, Assign, and Anchor; bodies absent from retained annotations; nonpositive weights; and connection rows whose endpoint was excluded.",
        "confidence_filter": "Publisher flat-connectome files labeled minconf-0.5.",
        "neuronal_bodies": len(bodies),
        "directed_neuron_pair_connections": len(rows),
        "summed_synaptic_contacts": contacts,
        "source_records_excluded": excluded,
        "annotation_records_excluded": int(len(annotations) - len(retained_annotations)),
        "connection_records_excluded": excluded,
        "body_ids": [str(x) for x in bodies],
        "input_body_ids": [str(x) for x in input_bodies if x in index],
        "output_body_ids": [str(x) for x in output_bodies if x in index and x not in input_body_set],
        "vnc_body_ids": [str(x) for x in vnc_bodies if x in index],
        "raw": json.loads((RAW / "provenance.json").read_text()) if (RAW / "provenance.json").exists() else {},
    }
    (PROCESSED / "meta.json").write_text(json.dumps(meta, indent=2))
    build_anatomy(annotations, meta)
    print(json.dumps({k: meta[k] for k in ["neuronal_bodies", "directed_neuron_pair_connections", "summed_synaptic_contacts", "annotation_records_excluded", "connection_records_excluded"]}, indent=2))


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
    previous_manifest_path = BROWSER / "manifest.json"
    previous_manifest = json.loads(previous_manifest_path.read_text()) if previous_manifest_path.exists() else {}
    meta = json.loads((PROCESSED / "meta.json").read_text())
    z = np.load(PROCESSED / "malecns-csr.npz")
    indptr, indices, data = z["indptr"], z["indices"], z["data"]
    graph_sha = write_bin(BROWSER / "malecns.bin", indptr, indices, data)
    previous_graph = previous_manifest.get("graph", {})
    graph_scale = previous_graph.get("recurrenceScale") if previous_graph.get("sha256") == graph_sha else None
    if not isinstance(graph_scale, (int, float)) or not math.isfinite(graph_scale) or graph_scale <= 0:
        graph_scale = recurrence_scale(indptr, indices, data)
    anatomy_path = PROCESSED / "malecns-anatomy.npz"
    if not anatomy_path.exists():
        build_anatomy(load_annotations(), meta)
        meta = json.loads((PROCESSED / "meta.json").read_text())
    anatomy_arrays = np.load(anatomy_path)
    anatomy_sha = write_anatomy_bin(
        BROWSER / "malecns-anatomy.bin",
        anatomy_arrays["body_ids"], anatomy_arrays["coordinates"], anatomy_arrays["flags"]
    )
    stride = max(1, len(meta["body_ids"]) // 360)
    sample_body_ids = [[i, meta["body_ids"][i]] for i in range(0, len(meta["body_ids"]), stride)]
    body_index = {body: i for i, body in enumerate(meta["body_ids"])}
    manifest = {
        "dataset": {"name": "MaleCNS", "release": "v1.0", "source": "https://male-cns.janelia.org/download/", "license": "CC BY 4.0"},
        "graph": {
            "neurons": meta["neuronal_bodies"],
            "connections": meta["directed_neuron_pair_connections"],
            "contacts": meta["summed_synaptic_contacts"],
            "excluded": meta["source_records_excluded"],
            "annotationExcluded": meta["annotation_records_excluded"],
            "connectionExcluded": meta["connection_records_excluded"],
            "fingerprint": hashlib.sha256((json.dumps(meta["body_ids"]) + graph_sha).encode()).hexdigest(),
            "recurrenceScale": graph_scale,
            "sha256": graph_sha,
            "selectionPolicy": meta["selection_policy"],
            "sampleBodyIds": sample_body_ids,
            "inputIndices": [body_index[body] for body in meta["input_body_ids"]],
            "outputIndices": [body_index[body] for body in meta["output_body_ids"]],
            "vncIndices": [body_index[body] for body in meta["vnc_body_ids"]],
        },
        "shuffled": None,
        "anatomy": {
            "neurons": meta["neuronal_bodies"],
            "coordinateCount": meta["coordinate_count"],
            "sha256": anatomy_sha,
            "source": "MaleCNS v1.0 body-annotations somaLocation",
            "policy": meta["coordinate_policy"],
            "bounds": meta["coordinate_bounds"],
            "projection": "Released x and z coordinate components projected onto the display plane.",
        },
        "provenance": meta["raw"],
    }
    if include_shuffled:
        shuffled = indices.copy()
        seed = 20260914
        np.random.default_rng(seed).shuffle(shuffled)
        shuffled_sha = write_bin(BROWSER / "malecns-shuffled.bin", indptr, shuffled, data)
        manifest["shuffled"] = {
            **manifest["graph"],
            "sha256": shuffled_sha,
            "fingerprint": hashlib.sha256(("shuffled-target-permutation" + str(seed) + shuffled_sha).encode()).hexdigest(),
            "recurrenceScale": recurrence_scale(indptr, shuffled, data),
            "seed": seed,
            "method": "Uniform seeded permutation of all target entries in the full CSR edge array.",
            "preserves": "Source out-degree sequence, target in-degree sequence, edge count, and global weight multiset.",
            "limitations": "Parallel source-target pairs and self-connections may be introduced; unique pair count and per-neuron incoming weight sums are not preserved.",
        }
    elif (BROWSER / "malecns-shuffled.bin").exists() and previous_manifest.get("shuffled"):
        manifest["shuffled"] = previous_manifest["shuffled"]
    (BROWSER / "manifest.json").write_text(json.dumps(manifest, indent=2))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--download", action="store_true")
    p.add_argument("--convert", action="store_true")
    p.add_argument("--anatomy", action="store_true", help="Rebuild anatomy from annotations and an existing converted graph")
    p.add_argument("--export-browser", action="store_true")
    p.add_argument("--shuffled", action="store_true", help="Also build the large degree-preserving shuffled browser control")
    args = p.parse_args()
    if args.download:
        download()
    if args.convert:
        convert()
    if args.anatomy:
        convert_anatomy()
    if args.export_browser:
        export_browser(args.shuffled)


if __name__ == "__main__":
    main()
