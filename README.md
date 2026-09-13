# The Legal Fly: Legal Dreaming

**Can a fruit fly retain legal concepts after the text is gone?**

Legal Dreaming is a browser-local associative replay experiment built around a real Janelia hemibrain subgraph. Teach the network a small set of fictional legal scenarios, remove the text, and observe what learned patterns remain in its activity.

The graph contains **3,072 neurons and 293,766 directed connections**. It is a high-degree subset of hemibrain v1.2, not a complete fruit-fly brain or nervous system.

## Run it

```sh
cd apps/web
npm ci
npm run dev
```

Open `http://localhost:3000`, choose a reading set and final cue, then select **Read, then dream**. Training and replay run in a dedicated browser worker. No API key, language model, or server-side text processing is required.

The build must run from a full repository checkout because `apps/web/scripts/export-dream-graph.mjs` reads the checked-in biological graph and provenance files under `deploy/` before development and production builds.

## What the experiment does

1. A deterministic 64-dimensional word/character hashing encoder turns each teaching passage into numbers.
2. Those numbers stimulate seeded neurons in a leaky-tanh simulation of the measured connectivity.
3. A small artificial ridge-regression readout learns to reconstruct each input vector from neural activity. The biological connections remain fixed.
4. In **learned replay**, external text stops and the learned numerical readout feeds back into the network.
5. In **silence**, both external text and learned feedback are zero.
6. A separate nearest-state atlas annotates activity and abstains on quiet, ambiguous, or dissimilar states.

This is not biological sleep, consciousness, legal reasoning, or a fly understanding English. The "dream" is learned numerical replay through measured biological wiring.

## Controls

- Mixed, contracts, torts, and privacy teaching sets
- Import 2–48 custom JSON teaching cards locally
- Learned replay vs. feedback-off silence
- Seeded perturbation controls
- Degree-preserving rewired graph comparison
- Pause, resume, restart from a different cue, and cancel training
- Model import/export with graph-fingerprint validation
- Dream notebook export with teaching text, settings, measured states, and associations

Sessions stop after 2,048 steps and pause when the tab is hidden. Reduced-motion preferences suppress automatic replay after reading.

## Scientific boundaries

The starter corpus contains 16 original fictional legal scenarios, not court opinions or verified holdings. Concept labels are human annotations and do not drive the network dynamics.

A close atlas match is not a probability of legal correctness. An unmatched state is not a new doctrine. Repetition, fading activity, and silence are valid outcomes.

The visual brain uses schematic positions rather than electron-microscopy coordinates. Connection weights come from scaled positive synapse counts, so this is not a neurotransmitter-signed or biophysical spiking simulation.

The initial saved diagnostic does **not** show a biological-wiring advantage. In those runs, the degree-preserving rewired control retained taught associations more consistently than the biological graph. The interface exposes that result rather than hiding it.

## Verification

```sh
pytest -q
cd apps/web
npm test
npm run test:dream
npm run build
cd ../..
python -m scripts.dream_browser_smoke
python -m scripts.hero_browser_smoke
```

GitHub Actions builds the production frontend and exercises the real browser worker, biological graph loading, training, replay, silence, import/export, controls, responsive layouts, reduced motion, and retirement of old public experiment routes.

## Source and license

Code and original fictional teaching cards: MIT. Biological connectivity: Janelia FlyEM hemibrain v1.2, CC BY 4.0, Scheffer and colleagues (2020).

- Source archive SHA-256: `07d8946eb0c4e3a5cb23d5769c9817847494f9fcadbc0ca239eed7bbd5555cf7`
- Biological graph fingerprint: `9d10adb17bf5a7a9287f55e78e11e1e8a63b6bcd1d99e0fb1b1b190a1feda56b`
- Generated browser graph SHA-256: `74224a10d083123cb17ddabc663222b3f93c5d0e3d05533f766b0a66dc788831`

The rewired control is generated from the biological graph with exact directed degree, edge-count, and weight-multiset preservation. Fingerprints, normalization factors, and accepted swap counts are recorded in the generated `/dream/manifest.json`.
