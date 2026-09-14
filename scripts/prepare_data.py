"""Prepare authentic MaleCNS v1.0. No reduced or synthetic fallback exists."""
from __future__ import annotations
import collections
import gzip
import hashlib
import json
import pathlib
import shutil
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
SOURCES = {
    'body-annotations-male-cns-v1.0-minconf-0.5.feather': '2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2',
    'body-neurotransmitters-male-cns-v1.0.feather': '95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621',
    'connectome-weights-male-cns-v1.0-minconf-0.5.feather': 'e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1',
}
ART = 'https://www.mskgent.be/assets/transforms/adlib/_819xAUTO_fit_center-center_85_none/2313-0698984afd69b0185de5e39663cef6c5.jpg'

def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while block := f.read(4 * 1024 * 1024):
            h.update(block)
    return h.hexdigest()

def download(url, path, expected=None):
    path = pathlib.Path(path)
    if path.exists() and (expected is None or sha_file(path) == expected):
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.partial')
    try:
        request = urllib.request.Request(url, headers={'User-Agent':'VillageLawyer/1.0 (research data preparation)'})
        with urllib.request.urlopen(request, timeout=180) as response, open(temp, 'wb') as out:
            shutil.copyfileobj(response, out, 4 * 1024 * 1024)
        if expected and sha_file(temp) != expected:
            raise ValueError('Source SHA-256 mismatch: ' + path.name)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)

def select_neurons(rows):
    selected = sorted((r for r in rows if r.get('superclass') not in (None, '')), key=lambda r:r['bodyId'])
    ids = [r['bodyId'] for r in selected]
    if len(ids) != len(set(ids)) or any(not isinstance(i, int) or i < 1 for i in ids):
        raise ValueError('Duplicate or invalid annotated neuron ID.')
    return selected

def main():
    import numpy as np
    import pyarrow.feather as feather
    import pyarrow.ipc as ipc
    cache, out = ROOT / '.cache' / 'malecns-v1', ROOT / 'dist'
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(exist_ok=True)
    data = out / 'data'
    data.mkdir(exist_ok=True)
    for name, digest in SOURCES.items():
        print('Verifying', name, flush=True)
        download(BASE + name, cache / name, digest)
    table = feather.read_table(cache / next(iter(SOURCES)), columns=['bodyId','superclass','class','somaLocation','status'])
    rows = select_neurons(table.to_pylist())
    n = len(rows)
    if n != 166700:
        raise ValueError(f'Unexpected classified neuron count: {n}; refusing a partial or changed release.')
    ids = np.array([r['bodyId'] for r in rows], dtype=np.int64)
    superclasses = collections.Counter(r['superclass'] for r in rows)
    for required in ['cb_intrinsic','ol_intrinsic','vnc_intrinsic']:
        if required not in superclasses:
            raise ValueError('Missing CNS compartment: ' + required)
    signs = np.ones(n, dtype=np.float32)
    nt_counts = collections.Counter()
    nt = ipc.open_file(str(cache / 'body-neurotransmitters-male-cns-v1.0.feather'))
    matched_nt = 0
    for k in range(nt.num_record_batches):
        b = nt.get_batch(k)
        bodies = b.column(b.schema.get_field_index('body')).to_numpy()
        ix = np.searchsorted(ids, bodies)
        mask = (ix < n) & (ids[np.minimum(ix, n-1)] == bodies)
        names = b.column(b.schema.get_field_index('consensus_nt')).to_pylist()
        for j in np.flatnonzero(mask):
            label = names[j] or 'unknown'
            nt_counts[label] += 1
            signs[ix[j]] = -1 if label in ('gaba','glutamate') else 1
            matched_nt += 1
    nt_counts['no_record'] = n - matched_nt
    edge_reader = ipc.open_file(str(cache / 'connectome-weights-male-cns-v1.0-minconf-0.5.feather'))
    pres, posts, counts = [], [], []
    source_rows = source_synapses = kept_synapses = 0
    for k in range(edge_reader.num_record_batches):
        b = edge_reader.get_batch(k)
        pre = b.column(0).to_numpy(); post = b.column(1).to_numpy(); weight = b.column(2).to_numpy()
        a = np.searchsorted(ids, pre); z = np.searchsorted(ids, post)
        mask = (a < n) & (z < n) & (ids[np.minimum(a,n-1)] == pre) & (ids[np.minimum(z,n-1)] == post)
        if np.any(weight <= 0):
            raise ValueError('Unexpected non-positive source connection.')
        source_rows += len(weight); source_synapses += int(weight.sum())
        kept_synapses += int(weight[mask].sum())
        pres.append(a[mask].astype(np.uint32)); posts.append(z[mask].astype(np.uint32)); counts.append(weight[mask].astype(np.uint32))
        if k % 400 == 0:
            print('Reading connection batch', k, '/', edge_reader.num_record_batches, flush=True)
    pre = np.concatenate(pres); post = np.concatenate(posts); count = np.concatenate(counts)
    del pres, posts, counts
    keys = pre.astype(np.uint64) * n + post
    order = np.argsort(keys, kind='stable')
    if np.any(np.diff(keys[order]) == 0):
        raise ValueError('Duplicate source-target pairs in official aggregate graph.')
    pre, post, count = pre[order], post[order], count[order]
    del keys, order
    edges = len(pre)
    if not (1000000 < edges < 100000000):
        raise ValueError('Implausible retained graph size.')
    ptr = np.zeros(n+1, dtype='<u4')
    ptr[1:] = np.cumsum(np.bincount(pre, minlength=n), dtype=np.uint64)
    indegree = np.bincount(post, weights=count, minlength=n)
    weights = (count / np.maximum(1, indegree[post]) * signs[pre]).astype('<f4')
    if not np.isfinite(weights).all():
        raise ValueError('Nonfinite normalized connection weights.')
    arrays = {}
    def pack(label, arr):
        parts = []
        for start in range(0, len(arr), 2097152):
            piece = arr[start:start+2097152]
            name = f'{label}-{len(parts):03}.bin.gz'
            payload = gzip.compress(piece.tobytes(), compresslevel=6, mtime=0)
            (data / name).write_bytes(payload)
            parts.append({'file':name,'offset':start,'length':len(piece),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
        arrays[label] = {'length':len(arr),'parts':parts}
    pack('ptr', ptr); pack('targets', post.astype('<u4')); pack('weights', weights)
    rng = np.random.default_rng(42)
    sensory = [i for i,r in enumerate(rows) if 'sensory' in r['superclass']]
    inputs = sorted(int(i) for i in rng.choice(sensory, 1024, replace=False))
    input_set = set(inputs)
    outputs = []
    for region in ['cb','ol','vnc']:
        candidates = [i for i,r in enumerate(rows) if r['superclass'].startswith(region+'_') and i not in input_set]
        outputs.extend(int(i) for i in rng.choice(candidates, 64, replace=False))
    sampled = sorted(set(inputs + outputs + [int(i) for i in rng.choice(n, 512, replace=False)]))
    sample = [{'index':i,'bodyId':int(ids[i]),'superclass':rows[i]['superclass'],'position':rows[i]['somaLocation']} for i in sampled]
    coverage = {'selection':'all-nonnull-superclass','annotationRows':len(table),'classifiedNeurons':n,'excludedAnnotationRows':len(table)-n,'sourcePairs':source_rows,'retainedPairs':edges,'excludedPairs':source_rows-edges,'sourceSynapticContacts':source_synapses,'retainedSynapticContacts':kept_synapses,'isolatedNeurons':int(np.sum((np.diff(ptr)==0)&(indegree==0))),'superclasses':dict(superclasses),'neurotransmitters':dict(nt_counts)}
    fingerprint = hashlib.sha256(json.dumps({'sources':SOURCES,'neuronIds':hashlib.sha256(ids.astype('<i8').tobytes()).hexdigest(),'arrays':arrays,'selection':coverage['selection']},sort_keys=True).encode()).hexdigest()
    manifest = {'dataset':'male-cns:v1.0','engine':'malecns-village-rate-1','n':n,'edges':edges,'fingerprint':fingerprint,'sources':{BASE+k:v for k,v in SOURCES.items()},'coverage':coverage,'arrays':arrays,'inputs':inputs,'outputs':outputs,'sample':sample,'dynamics':'leaky-tanh, 24 steps, 0.55 retention, 0.92 coupling; incoming absolute-weight normalization; GABA and glutamate negative, all other/unknown transmitters positive','license':'CC BY 4.0','sourcePage':'https://male-cns.janelia.org/download/'}
    (data/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    if (ROOT/'web').is_dir():
        shutil.copytree(ROOT/'web',out,dirs_exist_ok=True)
    assets = out/'assets'; assets.mkdir(exist_ok=True)
    download(ART, assets/'village-lawyer.jpg')
    art = {'title':'Village Lawyer','artist':'Pieter II Brueghel','year':1621,'collection':'MSK Ghent','rights':'Public Domain','source':'https://www.mskgent.be/en/collection/1952-g','image':ART,'sha256':sha_file(assets/'village-lawyer.jpg')}
    (assets/'credit.json').write_text(json.dumps(art,indent=2))
    print(json.dumps({'fingerprint':fingerprint,'coverage':coverage,'downloadBytes':sum(p['bytes'] for a in arrays.values() for p in a['parts'])},indent=2),flush=True)

if __name__ == '__main__':
    main()
