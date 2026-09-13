"""Import source-linked MiniLM vectors without trusting row order implicitly.

The input is the encoder-evidence artifact produced by the repository's verified
encoder workflow. This checks every text hash and vector shape before making the
local cache. It does not invent a model revision the producer did not record.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]

def import_embeddings(source: Path, cache: Path) -> dict:
    metadata = json.loads((source / 'embeddings.json').read_text())
    if metadata.get('encoder') != 'st:sentence-transformers/all-MiniLM-L6-v2':
        raise ValueError('Unexpected encoder artifact')
    arrays, files, hashes = {}, {}, {}
    for split in ('train', 'validation', 'test'):
        path = ROOT / 'data/demo/sensitive_harder' / (split + '.jsonl')
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        text_hash = hashlib.sha256(json.dumps([row['text'] for row in rows], ensure_ascii=False).encode()).hexdigest()
        if text_hash != metadata['splits'][split]['texts_sha256']:
            raise ValueError(f'Text provenance mismatch: {split}')
        values = np.load(source / f'minilm_{split}.npy', allow_pickle=False)
        if values.shape != (len(rows),384) or not np.isfinite(values).all():
            raise ValueError(f'Invalid embeddings: {split}')
        if not np.allclose(np.linalg.norm(values,axis=1),1,atol=1e-4):
            raise ValueError(f'Embeddings are not normalized: {split}')
        arrays[split] = values
        files[split] = hashlib.sha256(path.read_bytes()).hexdigest()
        hashes[split] = hashlib.sha256(values.astype('<f4').tobytes()).hexdigest()
    manifest = {'encoder':'sentence-transformers/all-MiniLM-L6-v2', 'files':files, 'array_sha256':hashes,
                'producer':{'repository':'zgbrenner/legalflyapp','commit':'4019f07ebb26208b5b136d54109636b01d7db4d7',
                            'run_id':34731746744,'artifact_id':10310380460,'texts_manifest':metadata},
                'normalized':True,'model_revision':'not recorded by original producer'}
    cache.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(cache / 'minilm_embeddings.npz', **arrays)
    (cache / 'embedding_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--cache',type=Path,default=ROOT / '.cache/research')
    args=parser.parse_args()
    print(json.dumps(import_embeddings(args.source,args.cache),indent=2))
