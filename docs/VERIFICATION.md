# The Legal Fly Verification Notes

## Reproduce

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser --shuffled
# Dockerfile.web installs the hash-locked equivalent of the browser extra instead:
# python -m pip install --require-hashes --only-binary=:all: -r tools/requirements/minimind-browser.txt
python -m pip install -e '.[browser,dev]'
python tools/prepare_minimind_browser.py --download --convert --quantization q8 --check --export-web
python tools/export_minimind_readouts.py --model-path models/minimind-3 --output apps/web/public/minimind --compare
LEGALFLY_TEST_MINIMIND_PATH=models/minimind-3 LEGALFLY_TEST_BROWSER_ARTIFACTS=apps/web/public/minimind python -m pytest tests/test_minimind_browser_parity.py -q
cd apps/web
npm ci
npm run test:legalfly
npm test
LEGALFLY_REQUIRE_FULL=1 npm run build
```

Large graph binaries and MiniMind weights are ignored by git.

## MaleCNS Acquisition

Official MaleCNS v1.0 objects acquired on 2026-09-14:

| File | Bytes | Computed SHA-256 | Publisher MD5 |
|---|---:|---|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 14,483,314 | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` | `UKdxh3DFciDxYLpPQxq4ng==` |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | 1,051,241,946 | `e35da783d1c686b2b58b3b87cd6a403ae43bfcfba8bff28e08ef752c1a56afc1` | `8w6dzKJc/QIb8eez2XVZng==` |

The publisher object generations are `1780494878811468` and `1780494887545976` respectively.

## Converted Graph

Selection is `status == Traced`, including isolated retained bodies and every positive released minconf-0.5 pair whose endpoints are retained.

| Count | Value |
|---|---:|
| Retained neuronal bodies | 165,122 |
| Directed neuron-pair records | 25,563,197 |
| Summed synaptic contacts | 124,025,046 |
| Excluded annotation rows | 46,455 |
| Excluded connection rows | 126,293,487 |
| Annotated sensory inputs | 15,897 |
| Disjoint motor/descending output candidates | 2,022 |
| VNC-tagged retained bodies | 28,187 |
| Released soma locations mapped | 140,024 |

Biological browser graph SHA-256: `c7cce7d82cf5a228b92de425e04ecd1ce35795bc3b76ce479ec72b6cb9ea29eb`.

Shuffled browser graph SHA-256: `23723b5fa5d2fa93b50ca4f525d9457f068f2fb9046f172b8b362c4630452354`.

Anatomy browser asset SHA-256: `42d27435b12e880166ee9946adf16e42ce47b2ab2c644503b5235da82b913540`. Its coordinate bounds are `[2468, 4758, 10154]` to `[93668, 68996, 134531]` in the released coordinate columns. The inspector projects x and z and does not infer missing positions.

The shuffled seed is `20260914`. It preserves source out-degree, target in-degree, edge-record count, and the global weight multiset. It may introduce parallel pairs and self-connections.

## Full-Graph Measurements

Measured in Node 22 on the workspace CPU using the same browser-facing core, seed 42, 32 teaching cases, 16 held-out cases, and four updates:

| Measurement | Biological | Shuffled |
|---|---:|---:|
| Training | 5,390 ms | 4,272 ms |
| Mean paired inference, both graphs | 312.6 ms | included |
| Held-out exact | 13/16 | 11/16 |
| Abstentions | 1 | 5 |
| Forced-choice exact | 14/16 | 15/16 |

Other controls: facts-only 14/16, frozen MiniMind plus action readout 7/16, and fictional charter rules 9/16.

Teaching signal touched 75,232 retained bodies. It touched 26,190 of 28,187 VNC-tagged bodies; maximum observed absolute VNC activation was 0.3436. These are continuous leaky-tanh activations, not spikes.

An additional full-data inspection smoke run used the browser-facing core with a checksum-verified graph and anatomy asset. Graph plus anatomy loading took 348.2 ms, one four-update consultation took 276.1 ms, and process RSS was 494.1 MB. The four frames contained 30, 420, 420, and 420 strongest mapped active points. VNC-tagged points among those were 2, 273, 275, and 275. The strongest displayed body ID was `816764`. This was measured under Node in the workspace, not a native browser, and used a deliberately neutral readout that abstained so it tests propagation and mapping rather than benchmark accuracy.

## MiniMind Measurements

Pinned MiniMind-3 revision: `f92512d4cd6142fa9acc0d6022375049a8974bf6`. The `model.safetensors` file is 127,834,168 bytes with computed SHA-256 `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`.

Measured on the same CPU with all 63.9M MiniMind parameters frozen:

| Measurement | Result |
|---|---:|
| Model load plus teaching-only readout fit | 4.85 s |
| Mean held-out petition encoding | 50.0 ms |
| Structured field accuracy | 82/128, 64.1% |
| Exact eight-field parses | 1/16 |
| MiniMind-only action exact | 7/16 |

An earlier zero-shot candidate-likelihood encoder scored only 21.1% per field and 0/16 exact parses. It was replaced by frozen embeddings with teaching-only field readouts. Confirmation remains mandatory because the improved encoder is still wrong on most complete parses.

### Browser MiniMind parity gate

The real browser parity run on 2026-09-15 used the pinned checkpoint above and all 48 locked teaching/holdout cases. The unquantized float32 ONNX graph first established that the export and ONNX Runtime execution path itself has exact discrete parity: 0/384 field-label mismatches, 0/48 action-label mismatches, and 0/48 authored-note ranking mismatches. Its maximum readout cosine-score delta was `3.5762786865234375e-07`, maximum embedding-component delta was `1.7299316823482513e-07`, and maximum candidate-score delta was `4.291534423828125e-06`.

Quantization was evaluated in the required q4-then-q8 order:

| Candidate | ONNX bytes | Field mismatches | Action mismatches | Note-ranking mismatches | Maximum cosine-score delta | Result |
|---|---:|---:|---:|---:|---:|---|
| q4, weight-only block 128 over supported MatMul/Gather weights | 54,972,589 | 50/384 | 9/48 | 3/48 | 0.071780264377594 | rejected |
| q8, weight-only block 32 over all supported MatMul weights | 87,409,139 | 2/384 | 2/48 | 0/48 | 0.002124786376953125 | rejected |
| q8, weight-only block 32 over the parity-proven module allowlist | 251,710,377 | 0/384 | 0/48 | 0/48 | 0.00012540817260742188 | selected |

The selected q8 allowlist contains only `causal_lm.model.layers.1.mlp.gate_proj`; all other weights remain float32. This limited scope is recorded explicitly in `manifest.json` under `quantization_config` and is necessary because broader q8 transforms changed locked discrete outputs. The selected bundle is 253,441,900 bytes (241.70 MiB) including its readouts and tokenizer files. Its maximum embedding-component delta is `0.0003248246503062546`, maximum candidate-score delta is `0.010023117065429688`, and every candidate ranking is identical to the Python adapter.

Selected content-addressed artifacts:

| File | Bytes | SHA-256 |
|---|---:|---|
| `model.q8.d9e7fd8f89dbf4139637caeb7cb1ecc89c8010050a61a152c50ff446568929a5.onnx` | 251,710,377 | `d9e7fd8f89dbf4139637caeb7cb1ecc89c8010050a61a152c50ff446568929a5` |
| `readouts.f9754426a25e42ecb6fad0c81c1631e1b075463be4c5573e4e6523f019217fed.json` | 1,271,933 | `f9754426a25e42ecb6fad0c81c1631e1b075463be4c5573e4e6523f019217fed` |
| `config.efcfa39ede9bbb5b64ded2bb90969e4b840f0f9e1e36725d386acb7eca1c6d05.json` | 863 | `efcfa39ede9bbb5b64ded2bb90969e4b840f0f9e1e36725d386acb7eca1c6d05` |
| `tokenizer.71f32c68cf63a15355a8fc171b7594b3d41870fe0ddb54fc6aefa55f73a4a668.json` | 451,182 | `71f32c68cf63a15355a8fc171b7594b3d41870fe0ddb54fc6aefa55f73a4a668` |
| `tokenizer_config.04ae7620b9cf93fd2d6fbf94936b0c3c4be65f30cd6ef6fa8741baac986525d1.json` | 7,545 | `04ae7620b9cf93fd2d6fbf94936b0c3c4be65f30cd6ef6fa8741baac986525d1` |

The fixed readout has 768 dimensions, temperature multiplier 4.0, and teaching-case SHA-256 `12c50fa700f5ad7720b9af4ca2efafc651110e4266a142ff07bc0a9a63a4acf2`. The measured backend was Python 3.14.7 with PyTorch 2.14.0+cpu, Transformers 4.57.6, safetensors 0.8.0, huggingface-hub 0.36.2, NumPy 2.3.3, ONNX 1.22.0, ONNX Runtime 1.30.0, ONNX Script 0.7.2, and pytest 9.1.1. `onnxscript` and ONNX Runtime 1.30 or newer are declared in the `browser` optional dependency group because the current PyTorch Qwen3 exporter and MatMulNBits quantizer require them.

The release gate was reproduced with:

```sh
python tools/export_minimind_readouts.py --model-path models/minimind-3 --output models/minimind-3-browser/q8-selected --compare
LEGALFLY_TEST_MINIMIND_PATH=models/minimind-3 LEGALFLY_TEST_BROWSER_ARTIFACTS=models/minimind-3-browser/q8-selected python -m pytest tests/test_minimind_browser_parity.py -q
```

## Reproducibility and release gates, 2026-09-15 (Linux x86_64 build host)

This section records the Task 6 and Task 7 gates run on a Linux x86_64 host (4 CPUs, 15 GiB RAM, Docker Engine 29.3.1 with overlay2). Earlier sections record the original Windows conversion; where the two differ, this section explains why.

### Pinned build inputs

| Input | Pin |
|---|---|
| `python:3.12-slim` | `sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea` (CPython 3.12.14, Debian trixie, glibc 2.41) |
| `node:20-alpine` | `sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293` |
| `tools/requirements/minimind-browser.txt` | 40 distributions, 807 SHA-256 hashes, CPython 3.12 x86_64 manylinux_2_28, wheels only, `torch==2.14.0+cpu` from the PyTorch CPU index |
| `tools/requirements/malecns.txt` | 7 distributions with hashes |

Both locks installed with `pip install --require-hashes --only-binary=:all:` into fresh CPython 3.12 environments on the host and inside the Docker stages.

### Conversion reproducibility

The MaleCNS conversion is byte-identical across machines: the graph, anatomy, and shuffled-control SHA-256 values produced here (`c7cce7d8...`, `42d27435...`, `23723b5f...`) equal the values recorded from the original Windows conversion above.

The MiniMind conversion is not byte-identical across machines, for two reasons that were separated during this run:

1. The PyTorch dynamo exporter annotated every ONNX node with `pkg.torch.onnx.stack_trace`, `namespace`, and related metadata containing absolute build-host paths and interpreter-specific line numbers. That shipped the build host's file layout to every visitor and made the graph host-dependent. `tools/prepare_minimind_browser.py` now strips all node metadata and doc strings after quantization (`strip_exporter_metadata`), covered by `test_quantized_graph_ships_no_exporter_metadata_or_host_paths`. The graph shrank from 251,710,377 to 250,360,989 bytes with no numeric change, and the offline check (`assert_no_exporter_provenance`) fails if any exporter marker or host path remains in the serialized graph.
2. The exported readout centroids are float32 results of the reference model; they differ in the last digits across CPUs and BLAS kernels (here 1,271,756 versus 1,271,933 bytes as serialized JSON).

Consequently the release gate is discrete parity, not byte identity. `Dockerfile.web` now runs `tools/export_minimind_readouts.py --compare` inside the `minimind` stage after `--check`, so an image cannot be built from a bundle whose field labels, action labels, or note rankings differ from the Python reference.

Bundle produced on this host (identical, file for file, to the bundle produced inside the Docker image on the same host):

| File | Bytes | SHA-256 |
|---|---:|---|
| `model.q8.e382bc46766ecc0c4abbc57296b327d90495a2617f2fd32f852b843645a8ec36.onnx` | 250,360,989 | `e382bc46766ecc0c4abbc57296b327d90495a2617f2fd32f852b843645a8ec36` |
| `readouts.752ef179d18c0987db877e969f473048fc3489254308745dcd311be4d76c5b42.json` | 1,271,756 | `752ef179d18c0987db877e969f473048fc3489254308745dcd311be4d76c5b42` |
| `config.efcfa39ede9bbb5b64ded2bb90969e4b840f0f9e1e36725d386acb7eca1c6d05.json` | 863 | unchanged |
| `tokenizer.71f32c68cf63a15355a8fc171b7594b3d41870fe0ddb54fc6aefa55f73a4a668.json` | 451,182 | unchanged |
| `tokenizer_config.04ae7620b9cf93fd2d6fbf94936b0c3c4be65f30cd6ef6fa8741baac986525d1.json` | 7,545 | unchanged |

Total 252,092,335 bytes (240.4 MiB).

Parity of this bundle against the Python adapter on all 48 locked cases, measured on the host (`tests/test_minimind_browser_parity.py`, 5 passed) and again inside the Docker `minimind` stage:

| Measurement | Value |
|---|---:|
| Field-label mismatches | 0/384 |
| Action-label mismatches | 0/48 |
| Note-ranking mismatches | 0/48 |
| Maximum cosine-score delta | 0.0001251697540283203 |
| Maximum embedding-component delta | 0.0003247372223995626 |
| Maximum candidate-score delta | 0.010021209716796875 |

### Browser-stack parity

`tests/minimind-runtime-parity.test.ts` (run with `LEGALFLY_TEST_MINIMIND_BUNDLE=public/minimind npm run test:minimind-runtime`) drives the production worker code with the real Transformers.js 3.8.1 tokenizer and ONNX Runtime Web 1.30.0 WASM backend under Node against `apps/web/tests/fixtures/minimind-expectations.json`, which `tools/export_minimind_expectations.py` generates from the Python reference adapter and the shipped readout centroids (tied to the readouts, cases, and teaching-case hashes). The Python-versus-ORT-CPU harness stays strict; this JavaScript gate is margin-aware: every reference decision is recorded with its top-two cosine margin, decisions at or above the 5e-4 floor must match exactly, decisions below it must land on one of the reference's top two labels, and the fixture's knife-edge set must equal the set its own margins imply.

| Measurement | Result |
|---|---:|
| Runtime ready from the cache-restore path (WASM) | 3.4 s |
| Field labels | 384/384 (353 strict, 31 sub-floor within the top two) |
| MiniMind-only benchmark actions | 48/48 (41 strict, 7 sub-floor within the top two) |
| Authored-note selections (16 representative cases, all 8 actions) | 128/128 strict |
| Reference decisions below the 5e-4 floor | 38 (31 fields across 21 cases, 7 actions) |
| Sub-floor decisions that landed on the runner-up | 2, both `holdout-net-return`: `harm` (margin 1.43e-6, `low` read as `moderate`) and action (margin 1.67e-6, `request-return` read as `seek-small-reparation`) |
| Smallest reference margins | field 1.49e-6, action 1.55e-6 |
| Fetches during inference, petition text in posted messages, cache evictions | none |
| Wall time | 264 s (encode 14 s, benchmark 16 s, verbalize 230 s single-threaded) |

`compare_backends` now reports `min_field_margin`, `min_action_margin`, and the same 38 `knife_edge_decisions`.

### Docker image

`docker build --file Dockerfile.web` succeeded from the committed recipe (the sandbox build injected only the session's egress proxy CA after each `FROM`; no other line changed).

| Stage | Wall time |
|---|---:|
| `connectome` download, verification, conversion, shuffled control | 308.1 s |
| `minimind` hash-locked install | 81.7 s |
| `minimind` download, export, quantization, readouts, check, parity comparison | 257.6 s |
| `builder` exact verification and `next build` | 52.2 s |

Image `legalfly-web:browser-minimind`: 1,362,030,721 bytes, linux/amd64. Probes against the running container:

- `/api/health` returned 200 with `services.maleCns` and `services.miniMindArtifacts` both `ready` and the deployed bundle's revision, quantization, and byte count.
- `/app/public/minimind` inside the image contains exactly `manifest.json` and the five artifacts; no `.gitkeep` or temporary file is present anywhere under `/app/public`.
- `/minimind/manifest.json` is served with `Cache-Control: public, max-age=0, must-revalidate`.
- A `Range: bytes=0-99` request for the ONNX file returned 206 with `Content-Range: bytes 0-99/250360989`, `Accept-Ranges: bytes`, and `Cache-Control: public, max-age=31536000, immutable`; every other artifact and all three MaleCNS binaries also answered ranged requests with 206.

### Test suites

- `python -m pytest -q` with the real parity environment (`LEGALFLY_TEST_MINIMIND_PATH`, `LEGALFLY_TEST_BROWSER_ARTIFACTS`): 89 passed in the conversion environment; the one remaining test, `test_generated_anatomy_matches_every_available_official_soma_location`, needs `pyarrow` and passed in the MaleCNS environment together with the acquisition tests.
- `npm test`: all web suites passed (see the browser acceptance subsection for the acceptance run).
- `npx tsc --noEmit` and `npm run lint`: clean.
- `LEGALFLY_REQUIRE_FULL=1 npm run build` with the real graph and bundle: passed.
- `git diff --check`: clean.

### Browser acceptance

`scripts/legalfly_full_browser.py` ran in native headless Chromium 141.0.7390.37 (Playwright 1.56) against the production build served from the same origin, with every request recorded through both `page.on("request")` and a pass-through route so worker fetches are included. All assertions passed; `measurements.json`, `requests.json`, screenshots, and video are the run's artifacts (kept out of the repository).

| Check | Result |
|---|---|
| Requests to `/minimind/` before Enable MiniMind | none |
| Manifest and every artifact served with the contract headers; `.onnx` `Range: bytes=0-99` | 206, `Content-Range: bytes 0-99/250360989`, immutable |
| First download after Enable MiniMind | 252,115,674 bytes in 12.4 s from localhost; 100 distinct progress values from 0 to 100 |
| Backends attempted | WebGPU first (`navigator.gpu` exists in headless Chromium but has no adapter), then WASM; ready on WASM |
| Ready state | setup card and Enable button removed; `MiniMind ready · runs on this device` shown |
| Reload with a verified cache | ready again in 10.3 s with zero network requests after reload |
| Corrupted cached ONNX entry | detected on reload, whole set evicted, card shows "Saved MiniMind files were incomplete", re-enable re-downloads and reaches ready |
| Cancel during download | returns to the available card with "MiniMind download canceled", Cache Storage empty, retry reaches ready in 11.5 s |
| Privacy canary (`CANARY-<uuid>` petition drafted, confirmed, heard, note rendered by MiniMind) | absent from all 222 request URLs and bodies, localStorage, sessionStorage, every Cache Storage key and body, and the console |
| Cross-origin requests during the whole run | none (358 request events, 38 unique URLs, all on the page's origin) |
| Manual flow in a fresh context | recommendation rendered with the authored fallback; zero `/minimind/` requests |
| Full MaleCNS journey | graph ready in 2.3 s, teaching 10.7 s, consultation 0.9 s, nonzero activation in the inspector, file, export, reset, import |
| Responsive matrix 1440, 1101, 1100, 1024, 721, 720, 390, 320 | no horizontal overflow; petition beside the docket from 721 to 1100 and below it at 720 and less; primary actions 44 px high and inside the viewport; step guide never overflows; ready indicator visible at every width |
| Page errors and console errors | none |

The first acceptance run caught a real defect: with `navigator.gpu` present, the worker imported the WebGPU runtime first and Transformers.js set that runtime's `wasmPaths` to `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/`, so the runtime glue was fetched from a CDN (and from a different ONNX Runtime version than the bundled binary). The worker now clears that default immediately after importing Transformers.js, and the run above confirms that no request leaves the origin.

The same script then ran against the rebuilt Docker image (`legalfly-web:browser-minimind` on port 3100) with the same result: first download 11.2 s, cached reload 7.6 s, cancel-then-retry 11.5 s, 358 request events, no cross-origin request, no page or console errors.

Screenshots captured: `desktop-idle.png`, `minimind-downloading.png`, `minimind-ready.png`, `desktop-advice.png`, `desktop-canary-advice.png`, `minimind-retry-ready.png`, `manual-advice.png`, and `chamber-<width>.png` for each width.
