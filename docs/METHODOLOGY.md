# Method: corrected science version 2

The question is whether actual fly connectivity adds useful classification signal to shared text features. A higher score alone would not establish that biology, rather than capacity or tuning, caused an improvement.

## Circuit and controls

The experiment uses the packaged Janelia hemibrain v1.2 high-degree subgraph. Its source-row adjacency follows the original CSV:

```
A[source, destination] = connection weight
x(t+1) = (1-leak)*x(t) + leak*tanh(A.T @ x(t) + Win @ u(t))
```

Weights are normalized for reservoir dynamics. States are simplified continuous-valued mathematics, not recorded biological spikes. The graph is frozen; readouts are trained. Tested profiles vary input scale, leak, temporal encoding and coarse region-biased placement. Region bias is not a verified biological learning mechanism.

Random controls have the same node count and exact directed edge count. Degree controls preserve incoming/outgoing unweighted degree sequences and outgoing weighted strength, not incoming weighted strength. Weight controls retain topology and permute original weights. Seeds and graph fingerprints are stable. Cached controls must match their biological parent, not just dimensions.

## Shared text features and readouts

All research models receive the same frozen normalized MiniLM vectors. Fly/random hybrids also receive mean and final activity from 128 deterministically selected neurons. They retain the original text features. This is not a claim that a fly circuit replaces MiniLM.

The published search has ten training-data seeds crossed with two graph/input seeds: 20 paired trials with 120 training, 280 validation and 360 test examples each. Each model family receives 18 validation configurations per condition. Linear and small-MLP comparators have corresponding regularization/width searches. MLP convergence is recorded. Choices are serialized before test scoring; the complete manifest and trials are published.

Bootstrap intervals resample training-data-seed clusters, because graph trials share training examples. Paired sign-permutation p-values are exploratory and unadjusted for multiple comparisons. The status is inconclusive if the interval includes zero or the paired test does not pass 0.05. These summaries describe variation within this experiment, not uncertainty over all legal text.

The dataset is synthetic, shares template families across splits, and appeared in earlier experiments. It is not pristine external validation. Pre-v2 graph-direction/control results are historical, not evidence for corrected models.

## Lesions

A separate diagnostic trains intact hybrid and activity-only classifiers on the full training split. It removes nodes/connections without retraining readouts or amplifying surviving weights. Disabled nodes cannot receive input. A hybrid can still classify with all neurons removed because MiniLM features bypass the circuit. The interface exposes this, rather than calling it biological resilience.

## Display and reproduction

The homepage begins with a genuine recorded synthetic example. Only successful new API requests become live results. Both brains have the same illustrative layout, camera, clock and fixed brightness mapping. Values come from measured model activity. The drawing samples the graph and is not anatomical microscopy.

To reproduce with the committed frozen encoder vectors:

```bash
mkdir -p data/processed .cache/research
cp -R deploy/data/processed/hemibrain data/processed/
cp deploy/research-inputs/minilm_embeddings.npz deploy/research-inputs/embedding_manifest.json .cache/research/
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.search
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.surgery
```

The cache verifies split hashes, vector shapes, finite values and vector hashes. The producer's missing encoder revision remains explicit. See `DATA_AND_LICENSING.md` and `KNOWN_LIMITATIONS.md`.
