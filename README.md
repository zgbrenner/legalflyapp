# The Legal Fly

**Can a fruit fly make a good lawyer?**

The Legal Fly is a browser-local experiment: an animated early-modern village lawyer's office where villagers bring fictional disputes to a tiny fruit-fly counsel. The fly recommends next steps under a toy village charter. It does not issue judgments, understand law, or call an external AI service.

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

## What It Does

1. The user selects or edits a fictional petition.
2. Only structured fields reach the model: matter, property, harm, proof, intent, relationship, urgency, and ability.
3. A deterministic encoder stimulates selected input neurons.
4. Activity propagates through the fixed MaleCNS graph using leaky-tanh dynamics.
5. A trained artificial readout maps separate neural features to one of eight recommendations or abstention.
6. The UI animates the petitioner, fly consultation, seal/paper result, corrections, case filing, and sampled neural inspection.

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
| Retained neuronal bodies | 211,577 |
| Directed neuron-pair connections | 26,028,386 |
| Summed synaptic contacts | 125,365,933 |
| Source records excluded by policy | 125,828,298 |

See `docs/METHOD.md` and `docs/VERIFICATION.md`.

## Tests

```sh
cd apps/web
npm run test:legalfly
npm test
npm run build
```

The Legal Fly unit tests include fixture-based checks for edge direction, deterministic encoding, answer-label isolation, strict model validation, abstention, correction safety, and cancellation. Fixture tests do not certify full MaleCNS browser performance.

## Privacy

Training, inference, corrections, model import/export, casebook import/export, and benchmarking run in a browser worker. The app does not automatically persist petition text. Exported models and casebooks can contain user-entered material.
