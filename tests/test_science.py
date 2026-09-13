"""Regressions for the scientific claims made by the public demo."""
import numpy as np
from scipy import sparse
from research.graphs.connectome import ConnectomeGraph, build_synthetic_connectome, randomize_erdos, randomize_degree_preserving, randomize_weights
from research.reservoirs.base import ConnectomeReservoir

def test_presynaptic_impulse_reaches_postsynaptic_neuron():
    g=ConnectomeGraph(sparse.csr_matrix(([1.0],([0],[1])),shape=(2,2)),['pre','post'],['test'],['test','test'],np.zeros((2,3)),{})
    r=ConnectomeReservoir(g,input_dim=1,leak=1.)
    r.x[:]=[1.,0.];r.step()
    assert r.x[1]>.5,'Activity must travel pre -> post'
    assert r.x[0]==0

def test_erdos_has_exact_edge_count_and_weights():
    g=build_synthetic_connectome(n_nodes=40,mean_degree=15,seed=9)
    r=randomize_erdos(g,seed=12)
    assert r.n_edges==g.n_edges
    np.testing.assert_array_equal(np.sort(r.adjacency.data),np.sort(g.adjacency.data))
    assert not np.any(r.adjacency.diagonal())

def test_degree_control_preserves_both_degree_sequences():
    g=build_synthetic_connectome(n_nodes=48,mean_degree=14,seed=4)
    r=randomize_degree_preserving(g,seed=9)
    assert r.n_edges==g.n_edges
    for axis in (0,1):np.testing.assert_array_equal(r.adjacency.getnnz(axis=axis),g.adjacency.getnnz(axis=axis))
    assert (r.adjacency!=g.adjacency).nnz>0

def test_weight_control_is_an_actual_permutation():
    g=build_synthetic_connectome(n_nodes=40,seed=3);r=randomize_weights(g,seed=3)
    np.testing.assert_array_equal(r.adjacency.indptr,g.adjacency.indptr)
    np.testing.assert_array_equal(r.adjacency.indices,g.adjacency.indices)
    np.testing.assert_array_equal(np.sort(r.adjacency.data),np.sort(g.adjacency.data))

def test_random_wiring_does_not_claim_anatomical_edges():
    g=build_synthetic_connectome(n_nodes=40,seed=3);g.metadata['anatomical']=True
    assert not randomize_erdos(g).metadata['anatomical']
    assert not randomize_degree_preserving(g).metadata['anatomical']

def test_graph_fingerprint_is_sensitive_to_weights():
    g=build_synthetic_connectome(n_nodes=30,seed=7);r=randomize_weights(g,seed=8)
    assert g.fingerprint()==g.fingerprint()
    assert g.fingerprint()!=r.fingerprint()

def test_requested_minilm_cannot_silently_become_hashing(monkeypatch):
    from research.encoders import text
    import pytest
    monkeypatch.setattr(text,'SentenceTransformer',None)
    with pytest.raises(ImportError):text.get_encoder('minilm')

def test_saved_model_declares_corrected_science_version(tmp_path):
    import json
    from research.experiments.pipeline import build_model,train_bundle,save_bundle
    b=build_model('linear',encoder_kind='hashing')
    train_bundle(b,['hello','email a@example.com'],[['NONE'],['EMAIL']]);save_bundle(b,tmp_path)
    meta=json.loads((tmp_path/'meta.json').read_text())
    assert meta['config'].get('science_version')=='2.0-directed-controls'
    assert len(meta.get('artifact_hash',''))==64

def test_disabled_nodes_cannot_be_excited():
    from research.ablation.ops import apply_ablation,AblationSpec
    g=build_synthetic_connectome(n_nodes=30,seed=3)
    damaged=apply_ablation(g,AblationSpec(kind='remove_fraction',fraction=.25))
    r=ConnectomeReservoir(damaged,input_dim=2,n_input_nodes=30,leak=1.)
    r.run(np.ones((4,2),dtype=np.float32));disabled=damaged.metadata.get('disabled_indices',[])
    assert len(disabled)==7
    assert np.all(r.x[disabled]==0)

def test_lesion_keeps_surviving_weights_unchanged():
    from research.ablation.ops import apply_ablation,AblationSpec
    g=build_synthetic_connectome(n_nodes=30,seed=3)
    damaged=apply_ablation(g,AblationSpec(kind='remove_fraction',fraction=.25));coo=damaged.adjacency.tocoo()
    np.testing.assert_array_equal(coo.data,np.asarray(g.adjacency[coo.row,coo.col]).ravel())

def test_rendered_controls_sample_identical_neuron_ids():
    g=build_synthetic_connectome(n_nodes=400,seed=3);control=randomize_erdos(g,seed=12)
    a=ConnectomeReservoir(g,input_dim=2,seed=8).sampled_activity()
    b=ConnectomeReservoir(control,input_dim=2,seed=8).sampled_activity()
    assert a['node_ids']==b['node_ids']

def test_frozen_normalization_does_not_amplify_lesion():
    g=build_synthetic_connectome(n_nodes=30,seed=3);g.metadata['normalization_frozen']=True
    r=ConnectomeReservoir(g,input_dim=2,spectral_radius=.2)
    np.testing.assert_array_equal(r.W.toarray(),g.adjacency.T.toarray().astype(np.float32))

def test_vectorized_features_match_serving_features():
    from research.experiments.search import batch_features,PROFILES
    from research.experiments.pipeline import reservoir_features
    class Encoder:
        def encode_batch(self,texts):return embeddings
    embeddings=np.random.default_rng(3).normal(size=(3,384)).astype(np.float32)
    g=build_synthetic_connectome(n_nodes=32,seed=3);profile=PROFILES[0]
    settings={k:v for k,v in profile.items() if k not in {'name','encoding_mode','timesteps'}}
    r=ConnectomeReservoir(g,input_dim=64,seed=101,**settings)
    single,_=reservoir_features(['a','b','c'],Encoder(),r,encoding_mode='direct',seed=101,feature_mode='hybrid')
    batched=batch_features(embeddings,g,seed=101,profile=profile,batch_size=2)
    np.testing.assert_allclose(single,batched,rtol=1e-5,atol=1e-6)

def test_paired_statistics_cluster_duplicates():
    from research.experiments.search import paired_statistics
    rows=[]
    for d in range(4):
        for g in range(2):
            for model,value in [('connectome',.8),('linear',.81)]:
                rows.append({'pair_id':f'{d}:{g}','data_seed':d,'model':model,'macro_f1':value})
    stats=paired_statistics(rows,'linear')
    assert stats['n_pairs']==8 and stats['n_data_clusters']==4
    assert stats['status']=='baseline_ahead'
    np.testing.assert_allclose(stats['ci95'],[-.01,-.01])
