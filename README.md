# The Legal Fly

**Can a fruit fly make a good lawyer?**

The Legal Fly is a local-first experiment: an animated early-modern village lawyer's office where villagers bring fictional disputes to a tiny fruit-fly counsel. The fly recommends next steps under a toy village charter. It does not issue judgments or understand law.

## Run the App

```sh
cd apps/web
npm ci
npm run dev
```

Open `http://localhost:3000`.

The app requires the official MaleCNS browser graph for neural inference. If the graph has not been prepared, the worker refuses to substitute the older hemibrain subset or a synthetic graph.

## Prepare MaleCNS

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser
cd apps/web
npm run dev
```

Large generated files stay under ignored `data/` paths and ignored `apps/web/public/legalfly/*.bin`.

## Add MiniMind

MiniMind is an optional local linguistic adapter. Its 63.9M parameters stay fixed. Small teaching-only readouts map its text representation to the eight visible fact fields and to the independent MiniMind-only benchmark control. It never receives the fly's teaching label during active inference.

```sh
python -m pip install -e '.[linguistic]'
python tools/prepare_minimind.py
CUDA_VISIBLE_DEVICES='' python -m uvicorn apps.minimind_adapter.service:app --host 127.0.0.1 --port 8123
```

Then run the web app in a second terminal. The browser talks only to that loopback service. MiniMind drafts structured facts for confirmation and selects among action-locked counsel-note templates. Manual fields and authored notes remain available when the adapter is offline.

Pinned sources:

| Source | Revision |
|---|---|
| `jingyaogong/minimind` | `21ec325dbaa0942ac667323a509aac60a58044a4` |
| `jingyaogong/minimind-3` | `f92512d4cd6142fa9acc0d6022375049a8974bf6` |

## What It Does

1. The user selects or edits a fictional petition.
2. MiniMind may propose eight structured fields, but the user must confirm them.
3. Only the confirmed fields reach the fly: matter, property, harm, proof, intent, relationship, urgency, and ability.
4. A deterministic projection stimulates 15,897 release-annotated sensory neurons.
5. Activity propagates through the fixed MaleCNS graph using leaky-tanh dynamics.
6. A trained artificial readout maps 256 disjoint motor/descending neural features to one of eight recommendations or abstention.
7. MiniMind may select an action-locked authored rendering. It cannot change the action.
8. Each of the four full-graph updates emits a bounded inspection frame from the worker.
9. The UI maps the strongest real values to released soma coordinates inside the painted fly and on an accessible parchment inspector. The simulation still uses every retained edge.

Narrative petition text is casebook context. It is not magically understood.

## Dataset

Source: Janelia FlyEM MaleCNS v1.0, CC BY 4.0.

Pinned publisher metadata:

| Object | GCS generation | Publisher MD5 |
|---|---:|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | `1780494878811468` | `UKdxh3DFciDxYLpPQxq4ng==` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | `1780494887545976` | `8w6dzKJc/QIb8eez2XVZng==` |

Derived counts from the current acquisition:

| Count | Value |
|---|---:|
| Retained `status == Traced` neuronal bodies | 165,122 |
| Directed neuron-pair connections | 25,563,197 |
| Summed synaptic contacts | 124,025,046 |
| Annotation rows excluded by policy | 46,455 |
| Connection rows excluded by policy | 126,293,487 |
| Retained bodies with released `somaLocation` | 140,024 |

The remaining retained bodies have no released soma coordinate and are not given an invented display position. The anatomy binary SHA-256 is `42d27435b12e880166ee9946adf16e42ce47b2ab2c644503b5235da82b913540`.

## Current Held-Out Result

The same 32 teaching cases and 16 held-out scenario families are used for each trained control. Seed 42 results from the generated full assets:

| System | Exact | Abstentions | Forced choice |
|---|---:|---:|---:|
| Biological MaleCNS + fixed MiniMind rendering | 13/16 | 1 | 14/16 |
| Shuffled full graph + fixed MiniMind rendering | 11/16 | 5 | 15/16 |
| Facts-only centroid learner | 14/16 | 0 | 14/16 |
| Frozen MiniMind + action readout | 7/16 | 0 | 7/16 |
| Fictional charter rules | 9/16 | 0 | 9/16 |

MiniMind's field readouts reached 64.1% per-field accuracy and 1/16 exact eight-field parses on the held-out cases. The interface therefore never applies a MiniMind parse without confirmation.

See `docs/METHOD.md` and `docs/VERIFICATION.md`.

## Tests

```sh
cd apps/web
npm run test:legalfly
npm test
npm run build
```

The Legal Fly unit tests include fixture-based checks for edge direction, deterministic encoding, answer-label isolation, strict model validation, abstention, correction safety, anatomy provenance, and cancellation between neural updates. Fixture tests do not certify full MaleCNS browser performance.

## Privacy

Connectome training, inference, corrections, model import/export, casebook import/export, and graph benchmarks run in a browser worker. Optional language operations send petition text only to the user-run loopback MiniMind process. The app does not automatically persist petition text. Exported models and casebooks can contain user-entered material.
