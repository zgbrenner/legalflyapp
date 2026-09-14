# The Village Lawyer

**A small office. A smaller advocate.**

A playable, browser-local village law office inspired by Pieter II Brueghel's *Village Lawyer* (1621). Eight villagers bring fictional disputes. You examine the facts, ask a fruit-fly-connectome model for advice, teach its artificial readout and keep a casebook.

This replaces the previous Legal Dreaming / hemibrain classifier application. The old application remains in Git history, not in the current runtime. There is **no reduced, synthetic or language-model fallback**.

## Run the prepared application

The successful **Village Lawyer verification** GitHub Actions run provides a `village-lawyer-ready-to-run` artifact. Download and extract it, then run:

```sh
node serve.mjs .
```

Open `http://127.0.0.1:4173`. Node 22 or newer is required for this launcher. The prepared application has no npm dependencies, Python requirement, account, paid service or API key. Double-clicking `index.html` is not supported: workers and checked data loading require HTTP on localhost or HTTPS.

Choose **Load the nervous system**, then **Ask the advocate**. The graph transfer is 138,571,462 bytes, about 139 MB; the retained edge arrays occupy about 205 MB before temporary buffers and browser overhead. Allow roughly 400 MB of free browser memory. A desktop browser is preferable; a phone may reject allocation rather than silently run a smaller graph.

## Build from source

Use Node 22+ and Python 3.11+ in a virtual environment. The first build downloads approximately 1.11 GB of official raw data and caches it under `.cache/`.

```sh
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell instead:
# .venv\Scripts\Activate.ps1
python -m pip install -r requirements-build.txt
npm ci
npm run build
npm start
```

`npm run build` prepares the complete graph, fits the starter readout from actual full-network states, runs the held-out audit and copies the application into `dist/`. No fake scores or sample-sized graph are packaged when a build fails. `npm run dev` refreshes frontend files in an already prepared distribution and serves it locally.

For a subdirectory deployment, keep the `dist` directory contents together. Asset, worker and data URLs are relative. `DEPLOY.md` covers static hosting and security headers. Nothing is publicly deployed by this repository's workflows.

## The experience

- **The office:** eight authored petitions, selectable villagers in the original painting, editable facts, a custom petition, actual network consultation and explicitly templated advice.
- **Teaching:** choose an alternative advice after a consultation. An artificial ridge-regression readout is refitted. The measured biological wiring does not change.
- **Casebook:** record advice, compare it with the fictional village charter and track how often the advice follows that charter. Recording does not train the model. Import/export is explicit; nothing is autosaved.
- **The nervous system:** inspect real sampled soma coordinates and actual simulated activity. All classified neurons are used computationally; the picture is sampled and is not reconstructed morphology.
- **Audit:** rerun all four controls on 24 held-out fact combinations. The audit uses the untouched starter, never a user-edited model.

The petition's prose is a note, not input to a hidden language model. Six dispute types, two three-level fields and five Boolean flags encode to 17 numerical channels. Gifts, petitioner names and writing style do not enter the model. Advice is not a judicial ruling. The game charter is original fiction, not historical or contemporary law.

## The actual connectome

Source: [Janelia FlyEM MaleCNS v1.0](https://male-cns.janelia.org/download/), CC BY 4.0. The full raw files contain segmented objects that are not all classified neurons. The app selects **every row with a nonempty `superclass` annotation**, not only `Traced` rows, and every published connection with both endpoints in that set.

| Quantity | Count |
| --- | ---: |
| Classified neurons retained | 166,700 |
| Directed neuron-pair connections retained | 25,582,938 |
| Synaptic contacts represented by their weights | 124,177,617 |
| Isolated classified neurons retained | 217 |
| Source annotation rows | 211,577 |
| Unclassified annotation rows excluded | 44,877 |
| Source segment-pair rows | 151,856,684 |
| Pairs involving nonselected endpoints excluded | 126,273,746 |

All optic-lobe, central-brain and ventral-nerve-cord classified neurons are retained. Source synapse confidence is at least 0.5. There is no further degree cutoff, synapse-count cutoff, top-k selection or active-subnetwork replacement. Exact-zero source activity can skip an arithmetic operation, but no approximate sparsification is used.

### Integrity

The preparer pins SHA-256 hashes for all three official Feather files, rejects duplicate neuron IDs or neuron-pair rows, records selection coverage and hashes the generated graph. The browser independently verifies every compressed graph chunk and the prepared starter model. A checksum failure stops loading.

| Source filename | SHA-256 |
| --- | --- |
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` |
| `body-neurotransmitters-male-cns-v1.0.feather` | `95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | `e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1` |

Graph payloads are split into roughly 8 MB uncompressed chunks, so no single hosting asset exceeds 25 MB. Graph fingerprints include the prepared payloads; import compatibility is checked against the actual distribution's manifest.

## Model, precisely

Engine `malecns-village-rate-1` is a **connectome-constrained rate reservoir**, not a validated full biophysical emulation:

```text
next = 0.55 * state + 0.45 * tanh(0.92 * incoming + drive)
```

Each petition starts with zero state and runs 24 steps. Connection magnitude is the published contact count divided by the destination's total incoming contact count. GABA and glutamate are assigned negative signs; other or unknown transmitters are assigned positive signs. This ignores receptor-specific effects and is explicitly an approximation. There is no simulated physical body, gap-junction model, neuromodulator chemistry, dopamine-gated biological learning or consciousness claim.

A fixed seed selects 1,024 source-annotated sensory neurons for engineered stimulation. An engineered readout samples 192 **non-input** neurons, 64 each from central-brain, optic-lobe and VNC groups, at steps 8, 16 and 24. The resulting 576-dimensional state is standardized and fitted by dual ridge regression with regularization 0.12. There is no direct fact bypass in the biological readout. Non-input electrodes ensure that the severed control cannot merely read injected input.

The starter uses 48 unique synthetic fact combinations, six per advice category. The held-out set has 24 other combinations, three per category. Both are generated once from a fixed seed of 42; there is no search for a favorable seed. This is a tiny, balanced synthetic split with overlapping rule structure, not broad legal generalization.

## Measured initial results

The initial complete-graph run scored:

| System | Correct / 24 | Accuracy |
| --- | ---: | ---: |
| MaleCNS + learned readout | 20 | 83.3% |
| Direct facts + same readout | 20 | 83.3% |
| MaleCNS + shuffled teaching labels | 3 | 12.5% |
| Severed connections + same readout | 3 | 12.5% |

Training recognition was 42/48. The connectome **tied**, rather than beat, the direct-facts baseline. That does not show a biological advantage. The shuffled-label control uses identical neural states with permuted teaching labels; the severed control zeroes transmission and independently fits its readout. There is not yet a degree-preserving rewired-topology control, so no wiring-specific superiority claim is supported.

Every build recomputes `dist/data/audit.json` and `results/full-data-audit.json`, including predictions, ground truth, facts, timings and fingerprint. CPU and browser timings vary; the initial Node audit took about 24.6 seconds for all 24 examples and controls. Browser results are recorded separately by CI.

## Verification

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
npm run test:full
python -m pip install -r requirements-test.txt
python -m playwright install chromium
npm start
# In another terminal with the same Python environment:
EVIDENCE_DIR=/tmp/village-evidence npm run test:browser
```

The browser suite uses the **actual full graph**, not synthetic graph mocks. It covers load, inference, teaching, cancellation, model and casebook import/export, wrong-fingerprint rejection, reset, full held-out evaluation, custom petitions, safe text rendering, desktop/mobile layouts and a check that no request transmits case text or reaches an external origin. Tiny explicitly synthetic graph fixtures appear only in unit tests. Local Chromium navigation was blocked by the working environment's administrator policy, so rendered validation is run in the GitHub Actions browser instead of bypassing that policy.

The workflow uploads browser screenshots and JSON evidence even on failure. A passing unit suite alone is not a claim that the browser or complete graph works. See `VERIFICATION.md` and the linked CI run for the actual completion status.

## Privacy and licenses

Simulation runs in a dedicated browser worker. There is no analytics, login, external AI service or server-side case processing. The included server accepts only GET/HEAD and does not log request bodies. A third-party static host can still log ordinary asset requests and IP addresses; the app does not submit cases to it.

Nothing is saved automatically. Casebook exports contain entered prose; model exports contain numerical learned states and labels. Use fictional examples, not client information.

Code and fictional petitions: MIT. MaleCNS connectivity/annotations: Janelia FlyEM, CC BY 4.0. Painting: Pieter II Brueghel, *Village Lawyer*, 1621, [MSK Ghent, accession 1952-G](https://www.mskgent.be/en/collection/1952-g), Public Domain. Original image URL, SHA-256 and attribution are packaged in `assets/credit.json`.
