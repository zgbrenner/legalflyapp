# Known limits of this release

## Observed live false negative

During checks of the default hashing-encoder live API, all three classifiers (fly hybrid, scrambled hybrid and linear baseline) returned NONE for this exact invented passage:

> For the confidential personnel file, the employee's Social Security number is 000-12-3456. This is an invented example.

The planted number is synthetic and not a valid assigned SSN. It remains an SSN-format example that the demonstration intends to flag. The miss stays available as **A private number**. The interface compares the answer to the expected label and reports misses. Agreement between models is not success. This observation concerns the live hashing configuration, not the MiniLM research benchmark.

The email example was flagged EMAIL. The legal-number decoy and ordinary meeting sentence were not flagged. Four examples are only a smoke test, not an estimate of real-world accuracy. Do not use this as a privacy gate or redaction product.

## Research result

The corrected 120-example paired search did not establish a fly advantage. Standard MiniLM classifiers have higher mean scores. The hybrids retain original text features; full lesions can leave those features sufficient for a prediction. Raw trials and unsuccessful comparisons are retained.

Data are synthetic, share template structure and were used in earlier project experiments. The search is exploratory. More seeds do not create independent external validation. The original encoder producer omitted the exact MiniLM revision. Frozen vectors with hashes are included rather than a claim that an unpinned new download reproduces identical vectors.

## Unsupported or unverified

This section concerns the legacy `/classification` demo, not the Legal Fly village at `/`.

This is a 3,072-neuron hemibrain subgraph, not the whole fly brain. Coordinates are illustrative. Flashes replay mathematical activity, not biological recordings or consciousness. Region labels/routing are coarse heuristics, not a validated mushroom-body learning circuit.

Browser inference, client-side readout training, full FlyWire execution and user model import are not implemented by this application. Cancellation stops the browser accepting a response but does not guarantee that server computation stops. Destination Docker execution, proxy behavior, cold starts and infrastructure privacy require separate deployment verification.

## Browser MiniMind helper

The Legal Fly village runs MiniMind only in the visitor's browser. Its limits:

| Limit | Detail |
|---|---|
| Download size | About 252 MB (240 MiB) once per browser profile; the exact total for the deployed build is in `/minimind/manifest.json` and `/api/health`. Render's free tier has no edge caching, so the first download can be slow. |
| Memory | The ONNX graph alone is about 250 MB (250,360,989 bytes in the 2026-09-15 Linux reference build) and is held in memory by the runtime. Low-memory devices may fail to start it or lose the worker; the page then offers manual facts. |
| Browsers | Verified in headless Chromium on the WASM backend. The WebGPU backend is attempted first when `navigator.gpu` exists and is validated against a fixture, but is not certified on real hardware. Firefox and Safari are not certified. |
| Accuracy | MiniMind's field readouts reached 64.1% per-field accuracy and 1/16 exact eight-field parses on held-out cases. Every draft must be confirmed by the visitor. |
| Petition length | The worker rejects petitions longer than 1000 characters and truncates embedding input at 256 tokens. |
| Cache | The cached model is tied to this browser profile and origin. Clearing site data removes it. A rebuilt bundle under the same pinned contract is not detected while a verified cache exists; there is no in-page update prompt. |
| Offline | The first download needs the network. A verified cached copy restores without it, but the rest of the app still needs its own static assets. |
| Parity | The bundle is not byte-identical across build hosts (the ONNX graph and readout centroids differ slightly; config and tokenizer files are identical). The release gate is discrete parity with the Python adapter (0/384 field labels, 0/48 actions, 0/48 note rankings on the 48 locked cases), measured with ONNX Runtime on CPU and rerun inside every Docker image build. The JavaScript stack itself (Transformers.js tokenizer plus ONNX Runtime Web WASM, `apps/web/tests/minimind-runtime-parity.test.ts`) was then run on all 48 cases: all 128 note selections and all but one case agree with the reference; 38 of the 432 reference decisions (31 field labels across 21 cases and 7 benchmark actions) have a top-two margin below 5e-4, the floor derived from the measured cross-backend float noise, and are recorded as knife-edge in the fixture and in the parity harness output. On the WASM run only two of them landed on the runner-up, both in `holdout-net-return` (margins about 1.4e-6 and 1.7e-6): the browser reads `harm` as `moderate` (reference `low`) and the MiniMind-only control picks `seek-small-reparation` (reference and ground truth `request-return`). In the browser the MiniMind-only control therefore scores 6/16 rather than 7/16 and field accuracy 81/128 rather than 82/128. The gate asserts strict equality above the floor and top-two membership below it, and fails if a regenerated fixture changes the knife-edge set silently. WebGPU was not measured. |
