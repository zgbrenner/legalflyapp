"""Controlled lesions for computational wiring experiments."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal
import numpy as np
from research.graphs.connectome import ConnectomeGraph, spectral_radius_scale
AblationKind=Literal['remove_fraction','remove_high_degree','remove_low_degree','remove_region','randomize_region','randomize_weights']

@dataclass
class AblationSpec:
    kind:AblationKind
    fraction:float=.05
    region:str|None=None
    seed:int=0
    label:str=''
    def display_name(self):
        if self.label:return self.label
        names={'remove_fraction':f'Remove {int(self.fraction*100)}% of neurons',
               'remove_high_degree':f'Remove highest-degree neurons ({int(self.fraction*100)}%)',
               'remove_low_degree':f'Remove lowest-degree neurons ({int(self.fraction*100)}%)',
               'remove_region':f'Disable region: {self.region}',
               'randomize_region':f'Randomize region: {self.region}',
               'randomize_weights':'Randomize edge weights'}
        if self.kind not in names:raise ValueError(f'Unknown ablation: {self.kind}')
        return names[self.kind]

def _zero_nodes(graph,mask):
    adjacency=graph.adjacency.tolil(copy=True)
    idx=np.where(mask)[0]
    for i in idx:
        adjacency[i,:]=0;adjacency[:,i]=0
    csr=adjacency.tocsr();csr.eliminate_zeros()
    return ConnectomeGraph(csr,list(graph.node_ids),list(graph.regions),list(graph.node_regions),graph.positions.copy(),
        {**graph.metadata,'ablated_nodes':int(mask.sum()),'disabled_indices':idx.tolist(),'normalization_frozen':True},graph.control)

def apply_ablation(graph:ConnectomeGraph,spec:AblationSpec):
    n=graph.n_nodes
    degrees=np.asarray(graph.adjacency.getnnz(axis=0))+np.asarray(graph.adjacency.getnnz(axis=1))
    rng=np.random.default_rng(spec.seed)
    if spec.kind in {'remove_fraction','remove_high_degree','remove_low_degree'}:
        if not 0<=spec.fraction<=1:raise ValueError('Fraction must be between zero and one')
        k=0 if spec.fraction==0 else max(1,int(n*spec.fraction))
        if spec.kind=='remove_fraction':chosen=rng.choice(n,size=k,replace=False)
        elif spec.kind=='remove_high_degree':chosen=np.argsort(degrees)[-k:] if k else []
        else:chosen=np.argsort(degrees)[:k]
        mask=np.zeros(n,dtype=bool);mask[chosen]=True
        return _zero_nodes(graph,mask)
    if spec.kind=='remove_region':
        if not spec.region:raise ValueError('region required')
        return _zero_nodes(graph,np.array([r==spec.region for r in graph.node_regions],dtype=bool))
    if spec.kind=='randomize_region':
        if not spec.region:raise ValueError('region required')
        # Preserve each affected source's edge count and original weights.
        adjacency=graph.adjacency.tolil(copy=True)
        for i,region in enumerate(graph.node_regions):
            if region!=spec.region:continue
            count=len(adjacency.rows[i]);weights=list(adjacency.data[i])
            candidates=np.delete(np.arange(n),i)
            if count>len(candidates):raise ValueError('Cannot rewire source with self-loops beyond simple-graph capacity')
            targets=rng.choice(candidates,size=count,replace=False)
            order=np.argsort(targets)
            adjacency.rows[i]=targets[order].tolist()
            adjacency.data[i]=np.asarray(weights)[rng.permutation(count)][order].tolist()
        return ConnectomeGraph(adjacency.tocsr(),list(graph.node_ids),list(graph.regions),list(graph.node_regions),graph.positions.copy(),
            {**graph.metadata,'randomized_region':spec.region,'normalization_frozen':True},graph.control)
    if spec.kind=='randomize_weights':
        from research.graphs.connectome import randomize_weights
        return randomize_weights(graph,seed=spec.seed)
    raise ValueError(f'Unknown ablation kind: {spec.kind}')

DEFAULT_ABLATIONS=[AblationSpec(kind='remove_fraction',fraction=f,label=f'Remove {int(f*100)}% of neurons') for f in [.01,.05,.10,.25]]+[
    AblationSpec(kind='remove_high_degree',fraction=.05,label='Remove highest-degree neurons (5%)'),
    AblationSpec(kind='remove_low_degree',fraction=.05,label='Remove lowest-degree neurons (5%)'),
    AblationSpec(kind='randomize_weights',label='Randomize edge weights')]

def default_ablations_for_graph(graph):
    specs=list(DEFAULT_ABLATIONS)
    for region in graph.regions:
        count=sum(1 for r in graph.node_regions if r==region)
        if count<8:continue
        specs.append(AblationSpec(kind='remove_region',region=region,label=f'Excise ROI: {region} ({count} neurons)'))
        specs.append(AblationSpec(kind='randomize_region',region=region,label=f'Scramble ROI: {region} ({count} neurons)'))
    return specs
