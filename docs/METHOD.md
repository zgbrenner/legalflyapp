# The Legal Fly Method

The Legal Fly is a fictional village-lawyer experiment. It is not legal advice, historical reconstruction, consciousness research, or a claim that a fruit fly understands language.

## Biological Source

The intended graph is the official Janelia FlyEM MaleCNS v1.0 release, including brain and ventral nerve cord. The preparation script starts from the flat-connectome Feather files published at `https://male-cns.janelia.org/download/`.

Pinned objects used by `tools/prepare_malecns.py`:

| Object | GCS generation | Publisher MD5 |
|---|---:|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | `1780494878811468` | `UKdxh3DFciDxYLpPQxq4ng==` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | `1780494887545976` | `8w6dzKJc/QIb8eez2XVZng==` |

The pipeline also records locally computed SHA-256 hashes in `data/raw/malecns/v1.0/provenance.json`.

## Selection Policy

Retain every body whose release annotation `status` is exactly `Traced`. Retain every positive released minconf-0.5 directed body-pair connection where both endpoints are retained. Preserve isolated retained neurons. Exclude annotation rows labeled Glia, Orphan, Unimportant, Assign, or Anchor, endpoints absent from the retained body set, and nonpositive connection rows.

Counts are derived by the preparation script from the acquired files.

## Anatomical Inspection

The browser anatomy asset aligns every retained body ID with the release annotation's `somaLocation`. The current release supplies 140,024 soma locations for 165,122 retained traced bodies. Missing locations remain missing and are not interpolated. Released x and z coordinate components are projected onto the two-dimensional parchment view. That projection is a display choice, not another biological measurement.

After each of four complete sparse graph updates, the worker selects up to 420 coordinate-mapped neurons with the largest absolute continuous activation and adds a stable bounded sample of mapped anatomical context. Positive and negative values remain signed. Each displayed point retains its source body ID, coordinate, input/output/VNC role flags, and update number. The larger canvas uses the released x/z projection. The small overlay repeats that projection across the painted fly silhouette and is not anatomical registration. Both canvases are sampled while the computation itself still considers every retained positive edge. Frames stop when computation completes or is cancelled.

## Model Boundary

Visible structured facts are encoded deterministically and projected to 15,897 retained neurons selected from the release's sensory superclass and class annotations. Activity propagates through the fixed MaleCNS sparse graph with four leaky-tanh updates. A cosine-centroid artificial readout is trained from 256 seeded samples of a disjoint, release-annotated motor/descending population to one of eight recommendation categories or abstention.

The readout does not receive the original structured facts directly. Labels, expected answers, split identifiers, and benchmark IDs never enter the neural input.

The biological graph does not learn. There is no dopamine-learning claim, no biological synaptic plasticity, no spiking model, and no legal understanding claim.

## MiniMind Boundary

The optional language adapter uses MiniMind-3 with all 63.9M model parameters frozen. It is pinned to Hugging Face revision `f92512d4cd6142fa9acc0d6022375049a8974bf6`; the source implementation is pinned to `jingyaogong/minimind` commit `21ec325dbaa0942ac667323a509aac60a58044a4`.

The encoder extracts a normalized final-layer text representation. Teaching-only centroid readouts propose each of the eight structured fields. Recommendation labels are not available to these field readouts. The proposed fields are visible and must be confirmed before they reach MaleCNS.

The decoder receives only the selected fly action, confirmed facts, and a coarse confidence band. It uses MiniMind candidate likelihood to select between authored, action-locked counsel notes. Alternative actions, class scores, teaching labels, and hidden biological activity are withheld. Invalid responses fail closed to an authored note.

The MiniMind-alone benchmark has its own teaching-only action readout over the same frozen text representation. It is never used for the visitor's active fly recommendation.

## Shuffled Control

The shuffled control applies a seeded uniform permutation to all target entries in the full CSR edge array. This preserves source out-degree, target in-degree, the edge-record count, and the global weight multiset. It may introduce self-connections and parallel source-target pairs, so unique pair count and per-neuron incoming weight sums are not preserved. It is independently normalized and trained with the same cases, seed, and update count.

## Fictional Charter

The teaching source is an authored fictional village charter represented by 48 disputes: 32 teaching cases and 16 held-out cases. The labels are toy-task ground truth only.

Recommendation categories:

1. Let the matter rest.
2. Seek small reparation.
3. Seek full reparation.
4. Request return of property.
5. Find a witness.
6. Request a sworn account within the fictional charter.
7. Propose settlement.
8. Refer the matter to a higher authority.

Abstention is used when the model is untrained, silent, ambiguous, or outside the supported inputs.
