# The Village Lawyer

**Bring a grievance. Mind the wings.**

A browser experiment inspired by Pieter II Brueghel's crowded legal office. Six fictional villagers bring their disputes to a fruit-fly advocate. Confirm a fact sheet, teach the artificial readout, ask for counsel, challenge its answer, and keep a casebook.

This replaces the previous LegalFly application. There is no legacy hemibrain fallback, language-model lawyer, server inference, or fabricated benchmark score.

## Run this branch

Requirements: Node.js 20 or newer, Python 3.10 or newer with `venv`, and internet access for initial preparation. Start in a checkout of this branch, not the old application.

```sh
npm run setup
npm start
```

Open `http://127.0.0.1:3000`. The setup command creates an isolated Python environment, installs the pinned NumPy dependency, downloads and checksums the full compiled MaleCNS graph, creates browser-readable data chunks, and downloads the museum artwork. The application has no npm runtime dependencies or API keys.

In the chamber, select **Load the complete fly**, then **Teach the village customs**, then **Ask for counsel**. Model and casebook data stay in the tab unless explicitly exported. Export a learned model to avoid repeating the apprenticeship in the next session.

The browser graph is **205,997,124 bytes**, roughly 206 MB before HTTP compression. Desktop browsers are the intended compute target. A mobile layout is included, but phones with limited memory may not run the entire graph. Allocation or checksum failures stop the experiment; they never select a smaller network.

## What it includes

- **The chamber:** six authored clients, editable facts, custom fictional cases, eight kinds of counsel, an uncertainty state, and human corrections.
- **Schoolroom:** 64 teaching fact sheets, model import/export with graph/schema validation, and a separately trained held-out comparison with downloadable confusion matrices.
- **Casebook:** explicitly saved advice and facts, JSON export, and clear. No automatic persistence or case uploads.
- **Inside the fly:** live worker-computed activity, exact loaded counts, graph fingerprint, source credit, and the distinction between measured wiring and invented dynamics.

Advice is selected computationally. Its written explanation is an authored template, not language generated or understood by the fly. The fly illustration is decorative, not a decoded biological motor action. The app does not resolve actual legal matters or emulate the original animal's consciousness.

## Exactly which graph?

The application retains **166,700 superclass-annotated MaleCNS v1.0 neurons** and **25,582,938 directed connections between those neurons**, covering the brain and ventral nerve cord. It does not restrict the population to `Traced` status. Unannotated segmentation fragments are not counted as neurons. The upstream synapse-confidence threshold is 0.5; no additional edge threshold, sensory-edge removal, crop, random replacement, or weight quantization is applied here.

Official data: <https://male-cns.janelia.org/download/>. Paper: <https://doi.org/10.1016/j.cell.2026.08.015>. Biological data is CC BY 4.0; credit HHMI Janelia FlyEM, Cambridge, MRC LMB, Google Research, and collaborators.

For practical installation, this repository consumes the **third-party `alextitonis/fly.ai` `brain-v1` compiled arrays**, not an official Janelia binary. Their source is <https://github.com/alextitonis/fly.ai/tree/main/flybrain>. Both downloaded archives are pinned:

| Artifact | SHA-256 |
| --- | --- |
| `brain.npz` | `cc9bd1ecd00bd703a6fa648bc6ad145c93c7c1ee53debdcc9ce0d1f4305e6aca` |
| `weights.npz` | `c29919aa44069a271b1ee978abe05fa9bf6e45e4ba3e436e92b624ef1b5be40c` |

The independently written exporter checks those hashes, array types and dimensions, CSR structure, ordered identities, finite signed weights, and sensory annotations. It preserves the compiled float32 weights exactly. Every browser chunk and the assembled graph are SHA-256 checked again. The exported graph fingerprint is `177b379c324efb0385f77b221a5eb81558e202364ccdb296f93976de37d557f3`.

**This is not an independent re-audit of the original billion-byte raw connectome against the compiled artifact.** The manifest records the compiler, filtering policy, transformations, and original archive hashes so this dependency is visible.

## How counsel is computed

Nine categorical fact fields become a 23-component one-hot vector. A deterministic mapping stimulates four annotated sensory neurons per component. Raw prose, case titles, answer labels, and the customs-rule function do not enter consultation inference.

A module worker updates all retained neurons and all retained edges for twelve recurrent steps. The signed leaky-tanh units are a mathematical rate-network approximation, not a validated spiking emulation. State resets between cases. Inherited compiled weights treat predicted GABA, glutamate, and histamine sources as negative, other predictions as positive, and normalize absolute incoming weights. These are simplifying modeling assumptions, not measured receptor physiology.

A fixed signed 128-bin projection summarizes the last four steps of **non-input** activity. Directly stimulated neurons are excluded, preventing the readout from simply copying the injected feature vector. A regularized eight-class linear softmax readout learns the authored customs. Human corrections change only this artificial classifier. There is no dopamine-gated biological synaptic plasticity in this version.

The leading score margin below 0.08 produces abstention. Neither softmax output nor margin is a calibrated probability of legal correctness.

## Tests and honest measurements

```sh
npm test                    # Small mechanical fixtures only
npm run test:full           # Requires the real complete graph
npm run build               # Refuses missing/corrupted data or missing artwork
```

The full test verifies checksums, exact graph coverage, deterministic inference, signal reaching non-input units, mid-run cancellation, training, feedback, model roundtrip, foreign-model rejection, and the disconnected no-bypass control. It writes `results/full-verification.json` with actual timings and scores.

The benchmark trains on 64 fact combinations and tests on 32 distinct combinations, balanced across eight labels. Labels come from the disclosed **fictional customs**, not independent lawyer annotations. It compares a fresh full-CNS readout with an independently trained input-only classifier and an exactly zero-recurrence control. No held-out labels enter feature construction or fitting. A disconnected network's non-input state stays zero; the full test checks this equivalence. This is not a legal-reasoning benchmark, and without a rewired-topology control it cannot establish an advantage of biological wiring.

GitHub Actions additionally builds the complete static site, runs Chromium against the real graph, and captures desktop/mobile screenshots. Browser checks cover loading, teaching, advice, correction, cancellation preserving the previous model, valid/invalid imports, casebook export, computed activity, horizontal overflow, runtime errors, and unwanted network writes. Actual run results, not this description, determine whether those checks passed.

For local browser tests:

```sh
python -m pip install playwright==1.55.0 pillow==11.3.0
python -m playwright install chromium
FULL_CNS=1 python tests/browser.py
```

On Windows PowerShell, set `$env:FULL_CNS='1'` before the last command. `CHROMIUM_PATH` optionally selects a locally installed Chromium. A run without `FULL_CNS=1` is only a missing-data failure-path test and expects an unprepared checkout.

## Deployment

```sh
npm run setup
npm run build
```

Deploy **all of `dist/`**, including the data chunks, on an HTTPS static host. Relative paths support hosting under a subdirectory. Do not deploy `site/` before preparation or omit large data files: the UI deliberately refuses a data-free production build. The successful CI run also produces a `village-lawyer-static-site` artifact containing a ready-built package.

`vercel.json` configures the repository root as a static application. `apps/web/` is a small compatibility build entry for an existing Vercel project whose root was the old Next.js app. It builds the same new application; it does not retain the old product. A monorepo-root project must permit build access to files outside that directory. Account-level settings, deployment protection, and custom-domain changes are separate from the repository configuration.

Browser simulations use no API server. The included read-only development server sends a restrictive content-security policy and rejects writes and path traversal. Vercel receives equivalent security headers. Other hosts should apply the same policy and serve `.mjs` as JavaScript. Ordinary asset requests may appear in host logs; case facts and prose are not placed in those requests. Do not add analytics or request logging of case inputs.

## Art and license

Pieter II Brueghel, **Village Lawyer (1621)**, MSK Ghent, inventory 1952-G: <https://www.mskgent.be/en/collection/1952-g>. The public-domain painting is downloaded from the museum and credited in the app. The visual fiction is not a reconstruction of seventeenth-century legal doctrine.

Application code: MIT, retaining the existing repository's copyright notice. Biological data: CC BY 4.0. The independently drawn fly mark is part of the application.
