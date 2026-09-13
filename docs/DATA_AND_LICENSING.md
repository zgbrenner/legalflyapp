# Data sources and attribution

## Janelia hemibrain v1.2

Source: Janelia FlyEM, `exported-traced-adjacencies-v1.2`. Janelia identifies the dataset as CC BY 4.0.

- Project and license: https://www.janelia.org/project-team/flyem/hemibrain
- License: https://creativecommons.org/licenses/by/4.0/
- Original tables: https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz
- Paper: Scheffer et al. (2020), *A connectome and analysis of the adult Drosophila central brain*, eLife 9:e57443. https://doi.org/10.7554/eLife.57443

The bundled graph has 3,072 neurons and 293,766 directed connections, selected by high degree. It is not the full brain. Credit belongs to the Janelia FlyEM reconstruction team and source authors. The data in `deploy/data/processed/hemibrain/` remain CC BY 4.0; the code's MIT license does not replace dataset rights.

Modifications: select high-degree traced neurons, omit connections below the configured synapse-count threshold, normalize weights for reservoir dynamics, and generate labeled randomized controls. Body IDs are retained. Adjacency is stored as `[presynaptic, postsynaptic]`; propagation uses its transpose. Interface coordinates are illustrative bilateral staging, not EM coordinates. Region labels use coarse cell-type heuristics, not verified input/output circuits.

Independent reproduction downloaded the original archive, checked its SHA-256, rebuilt the subgraph and matched the packaged graph fingerprint. Record: `deploy/research-inputs/hemibrain-provenance.json`.

Archive SHA-256:
`07d8946eb0c4e3a5cb23d5769c9817847494f9fcadbc0ca239eed7bbd5555cf7`

Graph fingerprint:
`9d10adb17bf5a7a9287f55e78e11e1e8a63b6bcd1d99e0fb1b1b190a1feda56b`

## Synthetic material

Project-generated text in `data/demo/sensitive*` and the small synthetic test graph are MIT-licensed project material. The test graph is not anatomical connectivity. Corrected research refuses it as a biological substitute. Randomized hemibrain derivatives retain source attribution and disclose their randomized wiring.

Benchmark passages are generated, not collected client files. Identifiers are fictional examples and can resemble real formats. Template overlap and previous test-set use limit claims about unseen real text.

## MiniLM research inputs

Model: `sentence-transformers/all-MiniLM-L6-v2`. Publisher model card and Apache-2.0 declaration: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

Model weights are not bundled. `deploy/research-inputs/` contains normalized 384-dimensional vectors for the synthetic benchmark, text/file/vector hashes, and the producing workflow and commit. The manifest explicitly records that the original producer did not record an exact model revision. Frozen vectors reproduce this comparison without claiming that an unpinned fresh download will be byte-identical. Review the model card and applicable terms before reuse.

The default live API uses hashing features. The separate research comparison uses MiniLM. These configurations are not interchangeable performance claims.

## Not included

FlyWire/full-brain execution, detailed biophysical dynamics and a verified mushroom-body learning circuit are not implemented. References to those projects are research context, not supported modes. This package does not contain a complete fruit fly brain.
