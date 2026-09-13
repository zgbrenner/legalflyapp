"""Validation-only search with a shared frozen MiniLM encoder and paired controls.

Run with --cache pointing at verified minilm_embeddings.npz + embedding_manifest.json,
or omit --cache to create them using sentence-transformers. Test labels are used only
after every candidate has been selected on validation. This does not rewrite serving models.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from research.baselines.classifiers import MultiLabelReadout, labels_to_matrix
from research.datasets.sensitive import load_sensitive_split
from research.encoders.input_encoding import encode_for_reservoir
from research.evaluation.metrics import multilabel_metrics
from research.experiments.pipeline import load_active_graph
from research.experiments.run import _subsample_train
from research.graphs.connectome import SCIENCE_VERSION
from research.labels import LABELS
from research.reservoirs.base import make_reservoir

ROOT = Path(__file__).resolve().parents[2]
PROFILES = [
    {"name": "direct", "encoding_mode": "direct", "leak": .55, "input_scale": 2., "spectral_radius": .9, "timesteps": 12, "input_routing": "random"},
    {"name": "temporal", "encoding_mode": "temporal", "leak": .45, "input_scale": 4., "spectral_radius": .9, "timesteps": 12, "input_routing": "random"},
    {"name": "region", "encoding_mode": "direct", "leak": .55, "input_scale": 2., "spectral_radius": .9, "timesteps": 12, "input_routing": "region"},
]

def paired_statistics(rows: list[dict], reference: str, *, seed: int = 2026) -> dict:
    """Cluster on training-data seed, not shared trials treated as independent."""
    by_pair = {}
    for row in rows:
        by_pair.setdefault(row['pair_id'], {})[row['model']] = row
    deltas, groups = [], {}
    for models in by_pair.values():
        if 'connectome' not in models or reference not in models:
            continue
        a, b = models['connectome'], models[reference]
        delta = a['macro_f1'] - b['macro_f1']
        deltas.append(delta)
        groups.setdefault(a['data_seed'], []).append(delta)
    means = np.array([np.mean(v) for v in groups.values()])
    if len(means) < 2:
        return {'reference': reference, 'status': 'insufficient_trials', 'delta': float(np.mean(deltas)) if deltas else None}
    rng = np.random.default_rng(seed)
    boot = means[rng.integers(0, len(means), size=(10000, len(means)))].mean(axis=1)
    low, high = np.quantile(boot, [.025, .975])
    if len(means) <= 16:
        signs = 2 * ((np.arange(2**len(means))[:, None] >> np.arange(len(means))) & 1) - 1
        perm = (signs * means).mean(axis=1)
        p = np.mean(np.abs(perm) >= abs(means.mean()) - 1e-12)
    else:
        perm = (rng.choice([-1, 1], size=(10000, len(means))) * means).mean(axis=1)
        p = (1 + np.sum(np.abs(perm) >= abs(means.mean()))) / 10001
    return {'reference': reference, 'delta': float(np.mean(deltas)), 'ci95': [float(low), float(high)],
            'p_value_unadjusted': float(p), 'n_pairs': len(deltas), 'n_data_clusters': len(means),
            'status': 'inconclusive' if low <= 0 <= high else ('fly_ahead' if low > 0 else 'baseline_ahead'),
            'method': 'paired data-seed cluster bootstrap; two-sided cluster sign permutation; exploratory, unadjusted for multiple comparisons'}

def batch_features(embeddings, graph, *, seed, profile, batch_size=128):
    """Same forward dynamics as pipeline.py, vectorized over independent examples."""
    settings = {k: v for k,v in profile.items() if k not in {'name','encoding_mode','timesteps'}}
    reservoir = make_reservoir(graph, input_dim=64, seed=seed, **settings)
    sample = np.sort(np.random.default_rng(seed).choice(graph.n_nodes, size=min(128, graph.n_nodes), replace=False))
    blocks = []
    for start in range(0, len(embeddings), batch_size):
        batch = embeddings[start:start+batch_size]
        drive = np.array([encode_for_reservoir(e, input_dim=64, timesteps=profile['timesteps'],
                          mode=profile['encoding_mode'], seed=seed) for e in batch])
        state = np.zeros((graph.n_nodes, len(batch)), dtype=np.float32)
        mean = np.zeros((len(sample), len(batch)), dtype=np.float32)
        washout = profile['timesteps']//4
        for t in range(profile['timesteps']):
            activation = reservoir.W @ state
            activation[reservoir.input_indices] += reservoir.Win[reservoir.input_indices] @ drive[:,t,:].T
            state = (1-reservoir.leak)*state + reservoir.leak*np.tanh(activation)
            if t >= washout:
                mean += state[sample]
        blocks.append(np.concatenate([batch, (mean/(profile['timesteps']-washout)).T, state[sample].T], axis=1))
    return np.concatenate(blocks)

def metrics(labels, predictions):
    return multilabel_metrics(labels, predictions, list(LABELS))

def mlp_labels(probabilities):
    labels = []
    for row in probabilities:
        active = sorted([(name,float(p)) for name,p in zip(LABELS,row) if name!='NONE' and p>=.5], key=lambda t:-t[1])
        labels.append([n for n,p in active if p >= active[0][1]-.25][:3] if active else ['NONE'])
    return labels

def load_embeddings(cache: Path, dataset: Path):
    paths = {s: dataset/(s+'.jsonl') for s in ('train','validation','test')}
    expected = {s: hashlib.sha256(p.read_bytes()).hexdigest() for s,p in paths.items()}
    if not (cache/'minilm_embeddings.npz').exists():
        from research.encoders.text import get_encoder
        encoder = get_encoder('minilm')
        arrays = {s: encoder.encode_batch([json.loads(l)['text'] for l in p.read_text().splitlines()]) for s,p in paths.items()}
        cache.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache/'minilm_embeddings.npz', **arrays)
        (cache/'embedding_manifest.json').write_text(json.dumps({'encoder':'sentence-transformers/all-MiniLM-L6-v2', 'files':expected}))
    manifest = json.loads((cache/'embedding_manifest.json').read_text())
    if manifest.get('files') != expected or manifest.get('encoder') != 'sentence-transformers/all-MiniLM-L6-v2':
        raise ValueError('Embedding provenance mismatch; refusing the comparison')
    with np.load(cache/'minilm_embeddings.npz', allow_pickle=False) as stored:
        arrays = {s: stored[s].copy() for s in paths}
    return arrays, manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/research')
    parser.add_argument('--data-seeds', default='42,43,44,45,46,47,48,49,50,51')
    parser.add_argument('--graph-seeds', default='101,102')
    parser.add_argument('--max-train', type=int, default=120)
    parser.add_argument('--out', type=Path, default=ROOT/'results/comparison_v2.json')
    args=parser.parse_args()
    warnings.filterwarnings('ignore', category=ConvergenceWarning)
    ds=[int(x) for x in args.data_seeds.split(',')]; gs=[int(x) for x in args.graph_seeds.split(',')]
    if len(set(ds)) != len(ds) or len(set(gs)) != len(gs) or not ds or not gs or args.max_train < 1:
        raise ValueError('Use distinct, nonempty seed lists and a positive training budget.')
    data_dir=ROOT/'data/demo/sensitive_harder'
    examples={s:load_sensitive_split(s,data_dir) for s in ('train','validation','test')}
    embeddings,manifest=load_embeddings(args.cache, data_dir)
    cuts=np.cumsum([0]+[len(examples[s]) for s in ('train','validation','test')])
    all_emb=np.concatenate([embeddings[s] for s in ('train','validation','test')])
    y=labels_to_matrix([e.labels for e in examples['train']])
    val_labels=[e.labels for e in examples['validation']]
    selected=[]; feature_bank={}; graph_info={}; trace=[]
    for graph_seed in gs:
        for model,control in [('connectome','biological'),('random_erdos','random_erdos'),('random_degree_preserving','random_degree_preserving')]:
            graph=load_active_graph(control, graph_seed=graph_seed)
            if graph.metadata.get('source') != 'janelia_hemibrain_v1.2' and graph.metadata.get('parent_source') != 'janelia_hemibrain_v1.2':
                raise ValueError('This protocol requires actual hemibrain artifacts; synthetic fallback is not allowed.')
            graph_info[f'{model}:{graph_seed}']={'hash':graph.fingerprint(),'nodes':graph.n_nodes,'edges':graph.n_edges}
            for profile in PROFILES:
                key=f'{model}:{graph_seed}:{profile["name"]}'
                cache_path=args.cache/(hashlib.sha256((key+SCIENCE_VERSION+graph.fingerprint()+json.dumps(profile,sort_keys=True)+json.dumps(manifest,sort_keys=True)).encode()).hexdigest()+'.npy')
                if cache_path.exists():
                    feats=np.load(cache_path,allow_pickle=False)
                else:
                    started=time.perf_counter()
                    feats=batch_features(all_emb, graph, seed=graph_seed, profile=profile)
                    np.save(cache_path,feats)
                    print('features',key,round(time.perf_counter()-started,2),'sec',flush=True)
                feature_bank[key]=feats
    train_text_index={id(ex):i for i,ex in enumerate(examples['train'])}
    baseline_choices={}
    for data_seed in ds:
        subset=_subsample_train(examples['train'],args.max_train,data_seed)
        idx=np.array([train_text_index[id(e)] for e in subset])
        # Equal budget: 18 candidates per model; selection uses validation only.
        for model in ['linear','mlp']:
            best=None
            for candidate in range(18):
                if model=='linear':
                    c=float(np.logspace(-4,2,18)[candidate])
                    fitted=MultiLabelReadout(C=c,seed=data_seed).fit(embeddings['train'][idx],y[idx])
                    preds=[p.labels for p in fitted.predict(embeddings['validation'])]
                    config={'C':c}; scaler=None
                else:
                    hidden=[32,64,128][candidate//6]; alpha=float(np.logspace(-4,1,6)[candidate%6])
                    scaler=StandardScaler().fit(embeddings['train'][idx])
                    fitted=MLPClassifier(hidden_layer_sizes=(hidden,),alpha=alpha,solver='lbfgs',max_iter=150,random_state=data_seed)
                    fitted.fit(scaler.transform(embeddings['train'][idx]),y[idx])
                    preds=mlp_labels(fitted.predict_proba(scaler.transform(embeddings['validation'])))
                    config={'hidden':hidden,'alpha':alpha}
                score=metrics(val_labels,preds)['macro_f1']
                trace.append({'data_seed':data_seed,'model':model,'candidate':config,'validation_f1':score})
                if best is None or score>best['validation_f1']:
                    best={'model':model,'data_seed':data_seed,'validation_f1':score,'config':config,'fitted':fitted,'scaler':scaler,'indices':idx}
            baseline_choices[(model,data_seed)]=best
        for graph_seed in gs:
            for model in ['connectome','random_erdos','random_degree_preserving']:
                best=None
                for profile in PROFILES:
                    key=f'{model}:{graph_seed}:{profile["name"]}'
                    feats=feature_bank[key]
                    for c in [.01,.1,1.]:
                        for weight in [.1,.5]:
                            weights=np.concatenate([np.ones(384),np.full(feats.shape[1]-384,weight)])
                            fitted=MultiLabelReadout(C=c,seed=data_seed,feature_weights=weights).fit(feats[idx],y[idx])
                            preds=[p.labels for p in fitted.predict(feats[cuts[1]:cuts[2]])]
                            score=metrics(val_labels,preds)['macro_f1']
                            config={**profile,'C':c,'reservoir_weight':weight}
                            trace.append({'data_seed':data_seed,'graph_seed':graph_seed,'model':model,'candidate':config,'validation_f1':score})
                            if best is None or score>best['validation_f1']:
                                best={'model':model,'data_seed':data_seed,'graph_seed':graph_seed,'validation_f1':score,'config':config,'fitted':fitted,'key':key}
                selected.append(best)
        print('locked validation selections for data seed',data_seed,flush=True)
    # Freeze every choice to disk before scoring any test labels.
    selection_artifact=[{k:v for k,v in row.items() if k not in {'fitted','scaler','indices'}} for row in selected+list(baseline_choices.values())]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    selection_path=args.out.with_name(args.out.stem+'_selection.json')
    selection_path.write_text(json.dumps({'selection':'validation_only','candidates_per_model':18,'selected':selection_artifact,'trace':trace},indent=2))
    test_labels=[e.labels for e in examples['test']]
    rows=[]
    for choice in selected:
        predictions=choice['fitted'].predict(feature_bank[choice['key']][cuts[2]:])
        measured=metrics(test_labels,[p.labels for p in predictions])
        rows.append({'pair_id':f'{choice["data_seed"]}:{choice["graph_seed"]}',
                     'model':choice['model'],'data_seed':choice['data_seed'],'graph_seed':choice['graph_seed'],
                     'macro_f1':measured['macro_f1'],'binary_sensitive_f1':measured['binary_sensitive_f1'],
                     'validation_f1':choice['validation_f1'],'configuration':choice['config'],
                     'trainable_params':choice['fitted'].trainable_params(),
                     'per_class':measured['per_class'], 'confusion_matrix':measured['confusion_matrix_sensitive'],
                     'graph':graph_info[f'{choice["model"]}:{choice["graph_seed"]}']})
    for choice in baseline_choices.values():
        if choice['model']=='linear':
            preds=[p.labels for p in choice['fitted'].predict(embeddings['test'])]
            params=choice['fitted'].trainable_params()
        else:
            preds=mlp_labels(choice['fitted'].predict_proba(choice['scaler'].transform(embeddings['test'])))
            params=sum(x.size for x in choice['fitted'].coefs_+choice['fitted'].intercepts_)
        measured=metrics(test_labels,preds)
        for graph_seed in gs:
            rows.append({'pair_id':f'{choice["data_seed"]}:{graph_seed}','model':choice['model'],
                         'data_seed':choice['data_seed'],'graph_seed':graph_seed,'macro_f1':measured['macro_f1'],
                         'binary_sensitive_f1':measured['binary_sensitive_f1'],'validation_f1':choice['validation_f1'],
                         'configuration':choice['config'],'trainable_params':params,
                         'per_class':measured['per_class'],'confusion_matrix':measured['confusion_matrix_sensitive']})
    models={}
    rng=np.random.default_rng(2026)
    for model in ['connectome','random_erdos','random_degree_preserving','linear','mlp']:
        part=[row for row in rows if row['model']==model]
        values=np.array([row['macro_f1'] for row in part])
        group_means=np.array([np.mean([row['macro_f1'] for row in part if row['data_seed']==d]) for d in ds])
        boot=group_means[rng.integers(0,len(ds),size=(10000,len(ds)))].mean(axis=1)
        ci=np.quantile(boot,[.025,.975]).tolist()
        models[model]={'macro_f1_mean':float(values.mean()),'macro_f1_std':float(values.std(ddof=1)) if len(values)>1 else 0,
                       'ci95':ci,'binary_sensitive_f1_mean':float(np.mean([row['binary_sensitive_f1'] for row in part])),
                       'n_runs':len(part),'trainable_params':part[0]['trainable_params'],
                       'trainable_params_range':[min(row['trainable_params'] for row in part),max(row['trainable_params'] for row in part)],
                       'reservoir_size':part[0].get('graph',{}).get('nodes'),
                       'edge_count':part[0].get('graph',{}).get('edges'),'status':'measured'}
    report={'schema_version':2,'science_version':SCIENCE_VERSION,'status':'measured',
            'timestamp':datetime.now(timezone.utc).isoformat(),'encoder':'minilm','encoder_name':manifest['encoder'],
            'graph_source':'janelia_hemibrain_v1.2','connectome_mode':'hemibrain','dataset':'sensitive_information_harder',
            'max_train':args.max_train,'n_validation':len(val_labels),'n_test':len(test_labels),
            'data_seeds':ds,'graph_seeds':gs,'n_seeds':len(ds),'seeds':ds,'n_pairs':len(ds)*len(gs),
            'models':models,'pairs':rows,'comparisons':[paired_statistics(rows,m) for m in ['linear','mlp','random_erdos','random_degree_preserving']],
            'dataset_hashes':manifest['files'],'selection_sha256':hashlib.sha256(selection_path.read_bytes()).hexdigest(),
            'interpretation':'Exploratory results on a synthetic legal-text benchmark. Fly models retain the same MiniLM embeddings and add compact reservoir activity features. All models receive 18 validation candidates. Training and validation label budgets are reported separately. Intervals cluster by data seed and condition on the same test set. A hybrid win is not proof of a topology-specific advantage; compare both randomized controls.',
            'limitations':['Two graph/input seeds do not cover all graph randomness.','Synthetic templates can share structure across splits.','This test set was used in earlier project experiments; independent external replication is still required.','Training accuracy is not evidence of legal competence.','Confidence scores are not calibrated probabilities of safety.']}
    args.out.write_text(json.dumps(report,indent=2)+'\n')
    for model,value in models.items():print(model,round(value['macro_f1_mean'],4),flush=True)
    print('wrote',args.out,flush=True)

if __name__=='__main__':main()
