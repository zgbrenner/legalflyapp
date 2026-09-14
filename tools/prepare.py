#!/usr/bin/env python3
"""Verify full MaleCNS compiled arrays and export an exact, browser-readable CSR.

The compiled artifact is by the fly.ai project, not an official Janelia export.
No code, executable models, or pickle data is downloaded or executed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile
import urllib.request
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
N, E = 166700, 25582938
RELEASE = 'https://github.com/alextitonis/fly.ai/releases/download/brain-v1'
FILES = {
    'brain.npz': 'cc9bd1ecd00bd703a6fa648bc6ad145c93c7c1ee53debdcc9ce0d1f4305e6aca',
    'weights.npz': 'c29919aa44069a271b1ee978abe05fa9bf6e45e4ba3e436e92b624ef1b5be40c',
}
ART_URL = 'https://www.mskgent.be/assets/transforms/adlib/_819xAUTO_fit_center-center_85_none/2313-0698984afd69b0185de5e39663cef6c5.jpg'

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()

def download(url: str, dest: Path, expected: str | None = None) -> None:
    if dest.is_file() and expected and digest(dest) == expected:
        print(f'Verified cached {dest.name}', flush=True)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + '.part')
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'VillageLawyer/1.0 (research data preparation)'})
        with urllib.request.urlopen(request, timeout=90) as response, part.open('wb') as f:
            total = 0
            while block := response.read(1 << 20):
                total += len(block)
                if total > 700_000_000:
                    raise ValueError('Download exceeded the expected file size limit.')
                f.write(block)
        if expected and digest(part) != expected:
            raise ValueError(f'Checksum mismatch for {dest.name}; refusing this artifact.')
        part.replace(dest)
    finally:
        part.unlink(missing_ok=True)

def prepare(cache: Path, out: Path, offline: bool = False) -> dict:
    for name, expected in FILES.items():
        path = cache / name
        if not offline:
            download(f'{RELEASE}/{name}', path, expected)
        if not path.is_file() or digest(path) != expected:
            raise ValueError(f'{name} is missing or has the wrong checksum. No fallback graph is available.')
    with np.load(cache / 'brain.npz', allow_pickle=False) as brain, np.load(cache / 'weights.npz', allow_pickle=False) as weights:
        ids = np.asarray(brain['ids'], dtype=np.int64)
        classes = np.asarray(brain['superclass']).astype(str)
        ptr = np.asarray(weights['indptr'], dtype='<u4')
        ix = np.asarray(weights['indices'], dtype='<u4')
        values = np.asarray(weights['data'], dtype='<f4')
        if weights['format'].item() not in (b'csr', 'csr') or tuple(weights['shape']) != (N, N):
            raise ValueError('Expected complete postsynaptic-row MaleCNS CSR arrays.')
        if len(ids) != N or len(classes) != N or len(ix) != E or len(values) != E or len(ptr) != N + 1:
            raise ValueError('The artifact is not the complete expected MaleCNS graph.')
        if ptr[0] != 0 or ptr[-1] != E or np.any(ptr[1:] < ptr[:-1]) or np.max(ix) >= N:
            raise ValueError('Malformed CSR structure.')
        if not np.isfinite(values).all() or np.any(values == 0) or np.max(np.abs(values)) > 1.001:
            raise ValueError('Malformed signed, normalized weights.')
        if np.any(ids[1:] <= ids[:-1]) or np.min(ids) < 0 or np.max(ids) > np.iinfo(np.uint32).max:
            raise ValueError('Invalid or unordered neuron identities.')
        sensory = np.flatnonzero(np.char.find(classes, 'sensory') >= 0).tolist()
        readout = np.flatnonzero(classes == 'descending_neuron').tolist()
        if len(sensory) < 128 or not readout:
            raise ValueError('Missing expected sensory or descending-neuron annotations.')
        out.mkdir(parents=True, exist_ok=True)
        (out / 'manifest.json').unlink(missing_ok=True)
        with tempfile.TemporaryFile() as f:
            f.write(b'VLAW0100' + struct.pack('<II', N, E))
            for array in (ptr, ix, values, ids.astype('<u4')):
                f.write(array.tobytes(order='C'))
            total = f.tell()
            f.seek(0)
            whole = hashlib.sha256()
            parts = []
            while block := f.read(16 * 1024 * 1024):
                name = f'part-{len(parts):03d}.bin'
                whole.update(block)
                tmp = out / f'{name}.part'
                tmp.write_bytes(block)
                tmp.replace(out / name)
                parts.append({'file': name, 'bytes': len(block), 'sha256': hashlib.sha256(block).hexdigest()})
        meta = {
            'schema': 1, 'dataset': 'MaleCNS v1.0', 'coverage': 'brain_and_ventral_nerve_cord',
            'neurons': N, 'connections': E, 'bytes': total, 'sha256': whole.hexdigest(), 'parts': parts,
            'sensory': sensory, 'readout': readout,
            'source': 'https://male-cns.janelia.org/download/', 'paper': 'https://doi.org/10.1016/j.cell.2026.08.015',
            'compiledBy': 'alextitonis/fly.ai, brain-v1', 'compiledSource': RELEASE,
            'sourceChecksums': FILES, 'license': 'CC-BY-4.0',
            'nodePolicy': 'All entries with a nonempty superclass annotation, ordered by bodyId; no restriction to Traced status.',
            'edgePolicy': 'Every directed connection between retained neurons. No extra weight threshold, sensory-edge removal, node crop, or quantization.',
            'upstreamFilter': 'Published synapse confidence threshold 0.5; unannotated segmentation fragments are not simulated neurons.',
            'weightModel': 'Presynaptic GABA/glutamate/histamine predictions treated as negative; other predictions positive. Absolute incoming weights normalized per neuron. This is a modeling approximation, not measured synaptic physiology.',
            'neuronClasses': {str(k): int(v) for k, v in zip(*np.unique(classes, return_counts=True))},
        }
        tmp = out / 'manifest.json.part'
        tmp.write_text(json.dumps(meta, indent=2), encoding='utf-8')
        tmp.replace(out / 'manifest.json')
        print(json.dumps({k: meta[k] for k in ['dataset', 'neurons', 'connections', 'bytes', 'sha256']}, indent=2), flush=True)
        return meta

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / 'data' / 'compiled')
    parser.add_argument('--out', type=Path, default=ROOT / 'site' / 'data')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--skip-art', action='store_true')
    args = parser.parse_args()
    prepare(args.cache, args.out, args.offline)
    if not args.skip_art:
        art = ROOT / 'site' / 'assets' / 'village-lawyer.jpg'
        download(ART_URL, art)
        if not art.read_bytes().startswith(b'\xff\xd8'):
            art.unlink(missing_ok=True)
            raise ValueError('The museum artwork response was not a JPEG.')
        (ROOT / 'site' / 'assets' / 'artwork.json').write_text(json.dumps({'title': 'Village Lawyer', 'artist': 'Pieter II Brueghel', 'date': 1621, 'collection': 'MSK Ghent, 1952-G', 'license': 'Public domain', 'source': ART_URL, 'sha256': digest(art)}, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
