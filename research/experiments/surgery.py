"""Measure lesions with frozen classifiers and unchanged surviving weights.

Hybrid classifiers keep MiniLM features after a lesion. Small changes do not imply
anatomical resilience. This is a single-seed computational diagnostic.
"""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from research.ablation.ops import AblationSpec, apply_ablation
from research.baselines.classifiers import MultiLabelReadout, labels_to_matrix
from research.datasets.sensitive import load_sensitive_split
from research.experiments.pipeline import load_active_graph
from research.experiments.search import load_embeddings, batch_features, metrics, PROFILES
from research.graphs.connectome import SCIENCE_VERSION, ConnectomeGraph
from research.reservoirs.base import make_reservoir
ROOT=Path(__file__).resolve().parents[2]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,default=ROOT/'.cache/research')
    parser.add_argument('--out',type=Path,default=ROOT/'results/ablation_latest.json')
    args=parser.parse_args()
    arrays,manifest=load_embeddings(args.cache,ROOT/'data/demo/sensitive_harder')
    train=load_sensitive_split('train');test=load_sensitive_split('test')
    graph=load_active_graph('biological')
    if not graph.metadata.get('anatomical'):
        raise ValueError('Actual hemibrain connectivity is required for this diagnostic.')
    profile=PROFILES[0];seed=42
    operator=make_reservoir(graph,input_dim=64,seed=seed,leak=.55,input_scale=2.)
    graph=ConnectomeGraph(operator.W.T.tocsr(),graph.node_ids,graph.regions,
                          graph.node_regions,graph.positions,{**graph.metadata,'normalization_frozen':True})
    embeddings=np.concatenate([arrays['train'],arrays['test']])
    intact=batch_features(embeddings,graph,seed=seed,profile=profile)
    y=labels_to_matrix([e.labels for e in train]);labels=[e.labels for e in test]
    n=len(train); classifiers={}; original={}
    for mode,offset in [('hybrid',0),('activity_only',384)]:
        weights=np.concatenate([np.ones(384),np.full(256,.1)]) if mode=='hybrid' else None
        clf=MultiLabelReadout(C=.1,seed=seed,feature_weights=weights).fit(intact[:n,offset:],y)
        original[mode]=metrics(labels,[p.labels for p in clf.predict(intact[n:,offset:])])
        classifiers[mode]=clf
    specs=[AblationSpec(kind='remove_fraction',fraction=f,seed=seed,label=f'Remove {int(f*100)}% of neurons') for f in [.01,.05,.25,1.]]
    specs += [AblationSpec(kind='remove_high_degree',fraction=.05,label='Remove the most connected 5%'),
              AblationSpec(kind='remove_low_degree',fraction=.05,label='Remove the least connected 5%'),
              AblationSpec(kind='randomize_weights',seed=seed,label='Shuffle connection strengths')]
    specs += [AblationSpec(kind='remove_region',region=r,label='Disable '+r.replace('_',' ')) for r in graph.regions if r in ['mushroom_body','central_complex','descending']]
    rows=[]
    for spec in specs:
        damaged=apply_ablation(graph,spec)
        damaged.metadata['normalization_frozen']=True
        features=batch_features(arrays['test'],damaged,seed=seed,profile=profile)
        measurements={}
        for mode,offset in [('hybrid',0),('activity_only',384)]:
            scored=metrics(labels,[p.labels for p in classifiers[mode].predict(features[:,offset:])])
            measurements[mode]={'macro_f1':scored['macro_f1'],'binary_accuracy':scored['binary_sensitive_accuracy'],
                                'delta_macro_f1':scored['macro_f1']-original[mode]['macro_f1']}
        item={'ablation':spec.display_name(),'kind':spec.kind,'region':spec.region,
              'removed_neurons':len(damaged.metadata.get('disabled_indices',[])),
              'remaining_edges':damaged.n_edges,'measurements':measurements,'graph_hash':damaged.fingerprint()}
        rows.append(item)
        print(item['ablation'],measurements,flush=True)
    payload={'science_version':SCIENCE_VERSION,'status':'measured','timestamp':datetime.now(timezone.utc).isoformat(),
             'protocol':'Frozen readouts, no retraining after lesion; surviving synaptic strengths unchanged. Direct drive; seed 42; C=0.1.',
             'encoder':'sentence-transformers/all-MiniLM-L6-v2','dataset':'sensitive_information_harder',
             'n_train':n,'n_test':len(test),'seed':seed,'original':original,'ablations':rows,
             'total_neurons':graph.n_nodes,'total_edges':graph.n_edges,'dataset_hashes':manifest['files'],
             'note':'Single-seed diagnostic on a synthetic dataset. Not a biological lesion experiment. Region names use coarse cell-type heuristics. Hybrid classifiers retain the original text features, even when every simulated neuron is silenced.'}
    args.out.parent.mkdir(exist_ok=True,parents=True)
    args.out.write_text(json.dumps(payload,indent=2)+'\n')

if __name__=='__main__':main()
