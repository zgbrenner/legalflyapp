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

Retain all annotated traced neuronal bodies from the body annotations table. Retain every positive released minconf-0.5 directed body-pair connection where both endpoints are retained. Preserve isolated retained neurons. Exclude glia, untraced fragments, endpoints absent from the retained body set, and nonpositive connection rows.

Counts are derived by the preparation script from the acquired files.

## Model Boundary

Visible structured facts are encoded deterministically and stimulate selected input neurons. Activity propagates through the fixed MaleCNS sparse graph with leaky-tanh dynamics. A separate artificial readout is trained from non-input neural features to one of eight recommendation categories or abstention.

The readout does not receive the original structured facts directly. Labels, expected answers, split identifiers, and benchmark IDs never enter the neural input.

The biological graph does not learn. There is no dopamine-learning claim, no biological synaptic plasticity, no spiking model, and no legal understanding claim.

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
