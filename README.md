# The Legal Fly: Legal Dreaming

**Teach a fly-wired network a few legal ideas. Remove the text. Watch what lingers.**

Legal Dreaming remakes the homepage as a browser-local associative replay experiment. It preserves the repository's real Janelia hemibrain subgraph and brain visualization. It does not substitute a random graph, a decorative animation, or a language model.

The graph has **3,072 neurons and 293,766 directed connections**. This is the existing high-degree hemibrain subset, **not a whole fly brain**. All retained connections participate in the computation; the visualization shows a sample in an illustrative layout.

## Use it

```sh
cd apps/web
npm ci
npm run dev
```

Open `http://localhost:3000`. Select a reading set and a last-read card, then choose **Read, then dream**. Training and replay run in a dedicated browser worker. The graph exporter runs before development and production builds, using the checked-in biological NPZ and provenance. No Python API, AI service, or API key is needed for the new laboratory.

Build from a full repository checkout: `apps/web/scripts/export-dream-graph.mjs` reads `deploy/data/processed/hemibrain/biological` and `deploy/research-inputs/hemibrain-provenance.json`. Hosting restricted to the `apps/web` subtree must include these root-level source files in its build input.

## What it actually does

1. A deterministic 64-dimensional word/character hashing encoder turns each teaching passage into numbers. No LLM is involved.
2. Those numbers stimulate 384 seeded neurons in a leaky-tanh simulation of the measured connectivity.
3. A small artificial ridge-regression readout learns to reconstruct each input vector from activity in 192 non-input neurons. **The original biological connections do not learn or change.**
4. In **learned replay**, external text stops, but the learned numerical readout feeds back into the network. In **silence**, both external text and feedback are zero.
5. A separate nearest-state atlas annotates activity. It abstains on quiet, ambiguous, or dissimilar states. The titles and legal concept labels do not drive the model.

The important correction to an easy-to-make claim: labeling states in a fixed reservoir does not teach that reservoir to dream. Learned replay here has an explicit artificial feedback loop. It is not raw fly wiring spontaneously understanding law, and it is not biological sleep.

## Available controls

- Select mixed, contracts, torts, or privacy teaching sets.
- Import 2–48 of your own JSON teaching cards, entirely locally.
- Switch between learned replay and feedback-off silence.
- Set the random seed and explicitly injected noise, including zero noise.
- Pause, resume, restart from a different cue, and cancel reading or comparisons.
- Inspect the actual sampled neural activity, rotate the original brain view, or use its 2D fallback.
- Save/import a learned model with strict engine-version and graph-fingerprint checks.
- Save a notebook containing the teaching text, cue, seed, mode, settings, sampled states, association scores, and controls.
- Compare biological replay, feedback-off decay, and independently trained degree-matched rewired replay.

Sessions stop after 2,048 steps and pause when the tab becomes hidden. Reduced-motion preferences suppress automatic replay after reading. Nothing is saved automatically. Downloaded files include your teaching text.

## Scientific boundaries

The starter set contains **16 original fictional legal scenarios**, not court opinions or verified holdings. The model uses lexical hashing, not a legal semantic encoder. Source notes and concept labels are supplied by the person preparing the corpus.

A close atlas match is not a probability of legal correctness. An unmatched state is not a new doctrine or an unwritten case. A fixed point, repetition, or silence is a valid outcome. There is no prose generator and no hidden playlist of concepts.

The display uses schematic positions, not EM coordinates. The model uses scaled positive connection counts and mathematical dynamics, not a neurotransmitter-signed spiking simulation. Model choices, the artificial feedback, and the sampled display are disclosed in `/dreaming-method`.

## Measured first diagnostic

Reproduce after graph export:

```sh
cd apps/web
npm run test:dream
node scripts/probe-dream.mjs ../../results/dreaming/diagnostics.json
```

The saved diagnostic uses 16 fictional cards, seeds 42/43/44, four preselected cues, 256 steps per run, and no injected noise. These are **dynamical diagnostics**, not held-out legal accuracy or proof of a biological advantage.

| Mode | Runs | Mean matched steps / 256 | Mean label changes | Final activity RMS range |
|---|---:|---:|---:|---:|
| Biological learned replay | 12 | 101.17 | 0.67 | 0.06119–0.07174 |
| Biological feedback off | 12 | 46.17 | 1.33 | 0.00000012–0.00000677 |
| Degree-matched rewired replay | 12 | 256.00 | 0.00 | 0.06138–0.07049 |

Label changes include transitions to abstention, not just jumps between cases. The initial biological runs mostly held an association or lost a clear match. They did **not** produce rich legal narratives, and the rewired control retained taught associations more consistently on this diagnostic. The interface does not hide either result.

For the biological model at seed 42, the thinned-card recognition diagnostic was 14/16; the same cards were used for teaching, so this is not an independent test set. Full raw traces and settings are in `results/dreaming/diagnostics.json`.

## Verification

```sh
pytest -q                            # existing Python research/API regression tests
cd apps/web
npm test                             # existing frontend tests
npm run test:dream                   # real-graph engine and control tests
npm run build                       # production build, lint, TypeScript
# With a local production server running at http://127.0.0.1:3000:
cd ../..
python -m scripts.dream_browser_smoke # real browser-worker flows, not mocked scores
```

GitHub Actions also verifies the retained classifier against its actual Python API. Browser evidence and exact current verification boundaries belong in `DREAMING_VERIFICATION.md`.

## Earlier experiment

The prior sensitive-information classifier remains at `/classification`; results and lesion studies remain at `/benchmark` and `/ablate`. That older feature still sends text to its configured Python API. It is not covered by the new laboratory's browser-only processing claim.

The earlier project README is preserved in `docs/CLASSIFIER_README.md`. Its original verification record remains in `RELEASE_VERIFICATION.md` and does not certify the new dreaming code.

## Source and license

Code and original fictional teaching cards: MIT. Biological connectivity: Janelia FlyEM hemibrain v1.2, CC BY 4.0, Scheffer and colleagues (2020). The retained source archive was independently verified in the earlier corrected-engine work; this build verifies the packaged graph against that recorded provenance rather than redownloading the archive each time.

- Source archive SHA-256: `07d8946eb0c4e3a5cb23d5769c9817847494f9fcadbc0ca239eed7bbd5555cf7`
- Biological graph fingerprint: `9d10adb17bf5a7a9287f55e78e11e1e8a63b6bcd1d99e0fb1b1b190a1feda56b`
- Generated browser graph SHA-256: `74224a10d083123cb17ddabc663222b3f93c5d0e3d05533f766b0a66dc788831`

The rewired control is generated afresh from that graph with exact directed degree, edge-count, and weight-multiset preservation. It does not reuse the stale packaged rewired artifact. Fingerprints, normalization factors, and accepted swap counts are in the generated `/dream/manifest.json`.
