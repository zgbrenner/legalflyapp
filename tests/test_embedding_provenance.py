import hashlib
import json
import numpy as np
import pytest
from research.experiments.search import load_embeddings

@pytest.fixture
def embedding_cache(tmp_path):
    dataset = tmp_path / 'dataset'; dataset.mkdir()
    cache = tmp_path / 'cache'; cache.mkdir()
    arrays = {}; files = {}; hashes = {}
    for split in ('train', 'validation', 'test'):
        path = dataset / (split + '.jsonl')
        path.write_text(json.dumps({'text': 'Synthetic example'}) + '\n')
        files[split] = hashlib.sha256(path.read_bytes()).hexdigest()
        arr = np.zeros((1,384),dtype=np.float32); arr[0,0] = 1
        arrays[split] = arr
        hashes[split] = hashlib.sha256(arr.astype('<f4').tobytes()).hexdigest()
    np.savez_compressed(cache/'minilm_embeddings.npz', **arrays)
    manifest = {'encoder':'sentence-transformers/all-MiniLM-L6-v2', 'files':files, 'array_sha256':hashes}
    (cache/'embedding_manifest.json').write_text(json.dumps(manifest))
    return cache, dataset, arrays

def test_embedded_vectors_are_verified(embedding_cache):
    cache,dataset,arrays=embedding_cache
    loaded,_=load_embeddings(cache,dataset)
    np.testing.assert_array_equal(loaded['train'],arrays['train'])

def test_tampered_embeddings_are_rejected(embedding_cache):
    cache,dataset,arrays=embedding_cache
    arrays['test'][0,0]=.9
    np.savez_compressed(cache/'minilm_embeddings.npz', **arrays)
    with pytest.raises(ValueError, match='Embedding'):
        load_embeddings(cache,dataset)

def test_wrong_embedding_row_count_is_rejected(embedding_cache):
    cache,dataset,arrays=embedding_cache
    arrays['validation']=np.zeros((2,384),dtype=np.float32)
    np.savez_compressed(cache/'minilm_embeddings.npz', **arrays)
    with pytest.raises(ValueError, match='Embedding'):
        load_embeddings(cache,dataset)
