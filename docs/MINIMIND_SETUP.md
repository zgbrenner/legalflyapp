# MiniMind in the browser

MiniMind is the optional language helper of The Legal Fly. It runs only in the visitor's browser. There is no separate installation, no Python process, no local server, and no server-side petition processing.

## What runs where

| Component | Where | Notes |
|---|---|---|
| Model files | served as static files from `/minimind/` on the page's own origin | five content-addressed files plus `manifest.json` |
| Tokenizer | dedicated module Web Worker (`apps/web/workers/minimind.worker.ts`) | Transformers.js 3.8.1 |
| Inference | the same worker | ONNX Runtime Web 1.30.0, WebGPU or WASM |
| Fact readouts | the same worker | centroids exported at conversion time, verified in the browser |
| React page | `apps/web/components/LegalFlyVillage.tsx` through `apps/web/lib/minimind-browser.ts` | talks to the worker only with structured messages |
| Python adapter | `apps/minimind_adapter/service.py`, not deployed | conversion and parity reference only |

The web server sees only ordinary static-asset requests for the model files and IP addresses. `/api/health` reports whether the bundle is present on the server, not the state of any visitor's browser.

## Using it as a visitor

The petition panel shows a card titled **Let MiniMind suggest the eight fact choices** with two actions:

- **Enable MiniMind** downloads the model once and starts it in this browser.
- **Continue with manual facts** keeps the eight selectors editable without MiniMind. It works in every state, including while a download is running.

Once MiniMind is ready, the card is replaced by the compact status line `MiniMind ready · runs on this device`, and a **Draft facts with MiniMind** button appears under the petition. Accepting a draft fills the eight selectors; you still have to select **Confirm these eight facts** before **Hear the case** is enabled. Editing any field or changing the petition revokes confirmation.

The four-step guide above the chamber reads:

1. Choose how to fill the facts (enable the helper or continue manually).
2. Teach the fly (`Teach the ledger`).
3. Prepare the petition (choose or write one, review and confirm the eight facts).
4. Ask the fly (`Hear the case`).

### States

| Phase | Card text (summary) | Actions shown |
|---|---|---|
| `available` | model not downloaded | Enable MiniMind, Continue with manual facts |
| `downloading` | "Downloading MiniMind to this browser." with a progress bar, percent, and `<loaded> of <total>` | Cancel download, manual facts |
| `verifying` | "Download complete. Checking the saved files." | manual facts |
| `cached` | "Found saved MiniMind files. Checking them on this device." | manual facts |
| `loading` | "Starting MiniMind with this device's graphics engine." or "... with the browser compatibility engine." | manual facts |
| `ready` | replaced by `MiniMind ready · runs on this device` | Draft facts with MiniMind |
| `unsupported` | "MiniMind could not start here. You can retry, keep using manual facts, or try a current Chrome, Edge, or another Chromium browser." | Retry MiniMind, manual facts |
| `failed` | the worker's own reason, for example "The MiniMind file list is unavailable. Retry or continue with manual facts." or "MiniMind file verification failed: model.q8.<sha256>.onnx. Retry or continue with manual facts." These messages are fixed strings that name at most an artifact file; they never include petition text. | Retry MiniMind, manual facts |

The card renders fixed wording for the busy phases, chooses the `loading` wording from the worker's state message, and shows the worker's own message verbatim in the `failed` state and for the cancel and eviction notices in the `available` state. The progress readout shows sizes in 1,048,576-byte units, so the complete bundle appears as about `242 MB`.

## Download, verification, and cache

The download starts only when the visitor selects **Enable MiniMind**. The worker then:

1. fetches `/minimind/manifest.json` with `credentials: "omit"`, `redirect: "error"`, and `cache: "no-store"`, and checks it against the contract compiled into the worker (schema `legalfly-minimind-browser/1`, model `jingyaogong/minimind-3`, revision `f92512d4cd6142fa9acc0d6022375049a8974bf6`, source SHA-256 `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`, the exact quantization config, outputs `logits` and `last_hidden_state`, exactly five files of the five expected kinds, each at most 400 MiB, at most 600 MiB in total);
2. fetches each file from the same origin with the same options, reading at most the byte count declared in the manifest and reporting `loaded`, `total`, `percent`, and the current file name as progress;
3. checks the byte count and SHA-256 of each file before storing it in Cache Storage under the cache name `legalfly-minimind-browser-v1`, keyed by the artifact URL;
4. re-reads and re-hashes every stored file (`verifying`) and parses the readouts;
5. stores the manifest in the same cache last, so a cache with a manifest always describes a complete, verified set;
6. initializes the runtime (`loading`) and, after a health check, reports `ready`.

The bundle is about 252 MB (240 MiB). It is not byte-identical across build hosts: the ONNX graph and the readouts JSON (float centroids) differ slightly per host, while the config and tokenizer files are identical. The exact per-file sizes and SHA-256 values of the build that is actually deployed are recorded in the served `/minimind/manifest.json`, and `/api/health` reports the total. The values below are the 2026-09-15 reference build:

| Item (2026-09-15 reference build) | Value |
|---|---:|
| Files | 5 |
| Total | 252,092,335 bytes (240.4 MiB) |
| ONNX graph `model.q8.<sha256>.onnx` | 250,360,989 bytes |
| Readouts `readouts.<sha256>.json` | 1,271,933 bytes |
| Tokenizer `tokenizer.<sha256>.json` | 451,182 bytes |
| Tokenizer config `tokenizer_config.<sha256>.json` | 7,545 bytes |
| Model config `config.<sha256>.json` | 863 bytes |

The artifact files are served with `Cache-Control: public, max-age=31536000, immutable` and `Accept-Ranges: bytes`; `manifest.json` is served with `public, max-age=0, must-revalidate`. Render's free tier has no edge caching, so the first download can be slow.

**Cancel download** aborts the fetch, removes everything downloaded so far from the cache, and returns to the `available` card, which now shows the worker's message "MiniMind download canceled. Manual facts are still available.". Any other failure (unavailable file, byte-count or hash mismatch, invalid manifest, initialization failure) also evicts the partial set and moves to `failed`: the card shows the worker's reason followed by "Retry or continue with manual facts.", and the page shows the fixed line "MiniMind could not finish this local operation." beneath it.

### Later visits

On every page load the worker opens the cache and looks for a stored manifest. If there is none, the card shows the `available` state and no `/minimind/` request is made. If there is one, the card shows `cached`, the worker checks the stored manifest against the compiled-in contract, re-reads every stored file, compares byte counts and SHA-256 hashes, parses the readouts, and then initializes the runtime from the cache. No model bytes are downloaded and the server manifest is not fetched.

If any of those checks fails, the worker deletes the stored manifest and every file it lists (or every entry in the cache when the manifest itself cannot be parsed) and returns to the `available` card, which shows the worker's message "Saved MiniMind files were incomplete. Enable MiniMind to download a clean copy.". There is no partial reuse.

### Model version changes

The worker does not carry a separate version number; its contract is the pinned schema, model, revision, source SHA-256, and quantization config listed above. A release that changes any of them ships a new worker bundle. On the next visit the old cached manifest fails the new worker's check, the old set is evicted, and the card returns to `available`; the visitor selects **Enable MiniMind** again and the new bundle is downloaded. The **Enable** button is only offered in the `available`, `failed`, and `unsupported` states, so a verified cache is never re-downloaded without the visitor's action.

Because a cached set is restored without contacting the server, a bundle rebuilt under the same contract but with different file hashes is not detected while the old cached set still verifies. There is no in-page update prompt. To pick up such a rebuild, clear the site's data (or just the `legalfly-minimind-browser-v1` cache in the browser's developer tools) and enable MiniMind again.

### Clearing

Clearing site data for the origin removes the cached model. The next visit shows the `available` card and the download must be repeated.

## Runtime selection

ONNX Runtime Web's own files (the JavaScript glue embedded in the worker bundle and the `.wasm` binaries Next emits under `/_next/static/media/`) are served from the page's origin. Transformers.js sets a `cdn.jsdelivr.net` default for those files while it is imported; the worker clears that default on both runtime views immediately afterwards, and the browser acceptance script fails if any request leaves the origin. This was caught by the acceptance run on 2026-09-15 and fixed before release.


The worker tries backends in order and keeps the first one that passes a behavioral health check:

1. `webgpu`, only when `navigator.gpu` exists in the worker scope;
2. `wasm`, once, if WebGPU is unavailable or fails.

For each attempt the worker imports the matching ONNX Runtime Web build, loads the tokenizer from the verified cache through a read-only alias cache, creates an inference session from the verified model bytes with that single execution provider, and then runs a fixture: it embeds the sentence "A neighbor reports a small village dispute." and requires exactly one finite, unit-norm vector with the readouts' 768 dimensions, then scores two candidate notes and requires two finite, distinct scores. A backend that fails is disposed before the next attempt. If every attempt fails the state is `unsupported` (worker state message: "MiniMind could not start in this browser. Try a current Chrome or Edge browser, retry, or continue with manual facts."); the card shows the retry text quoted in the states table.

Two earlier checks also produce `unsupported`: a browser without `crypto.subtle` (worker state message "This browser cannot verify MiniMind files.") and a browser where Cache Storage cannot be opened ("This browser cannot use saved MiniMind files."). If the worker itself crashes, the page reports "MiniMind stopped. You can retry or continue with manual facts."

| Browser path | Status |
|---|---|
| Headless Chromium, WASM backend | verified with Playwright; the browser acceptance script is `scripts/legalfly_full_browser.py` |
| WebGPU backend | attempted first when available; behaviorally validated, not certified on real hardware |
| Firefox, Safari | not certified |

## Privacy boundary

- Petition text goes from the React page to the worker as a structured `postMessage`, and nowhere else. The worker never puts it in a URL, a fetch body, a log, `localStorage`, a Cache Storage key, or exported metadata. Cache keys are the six `/minimind/` URLs.
- Transformers.js runs with `env.allowRemoteModels = false`, `env.useBrowserCache = false`, `env.useFSCache = false`, and a custom cache that serves only the verified bytes and throws on any write.
- Every worker message must carry exactly the declared fields; undeclared fields, unknown message types, and out-of-range values are rejected. Petitions are limited to 1000 characters by `assertSafeText` in the worker; a benchmark request carries 1 to 32 cases with IDs of at most 100 characters.
- Worker failures are reported back as the fixed text "MiniMind could not finish this local operation." so error messages cannot echo petition text.
- The page validates every worker reply: a fact draft must contain exactly the eight declared fields with allowed values and a receipt stating `answer_labels_available: false` and `requires_confirmation: true`; a counsel note must name the already-fixed action and be one of the authored notes for those facts.

Hosting still sees ordinary static-asset requests and IP addresses. This is a research demo; do not enter real client information.

## Action boundary

MiniMind proposes; it does not decide.

- Encoding: the worker embeds the petition (chat-style prompt, at most 256 tokens, mean-pooled final hidden state, L2-normalized) and compares it with per-field centroids using temperature 4.0. It returns one proposed value and a confidence for each of the eight fields. These field readouts never see action labels. The visitor must confirm the eight fields; edits revoke confirmation.
- Verbalizing: after the fly's action is fixed, the worker receives only the selected action, the confirmed facts, and a coarse confidence band. It scores the authored, action-locked counsel notes for that action by mean token log-likelihood and returns the best one. It cannot choose or alter the action; the page rejects a note whose action differs or whose text is not in the authored set and shows the authored fallback instead.
- Benchmark: the independent MiniMind-only control uses a separate action-centroid readout over the same embedding. It is the only readout that sees action labels, and it is never used for the visitor's active recommendation.

## Conversion and provenance

| Item | Value |
|---|---|
| Source | `jingyaogong/minimind-3`, revision `f92512d4cd6142fa9acc0d6022375049a8974bf6` |
| Source weights SHA-256 | `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8` (127,834,168 bytes) |
| Tool | `tools/prepare_minimind_browser.py --download --convert --quantization q8 --check --export-web` |
| Export | PyTorch dynamo ONNX export, opset 18, outputs `logits` and `last_hidden_state`; the exporter's per-node metadata (`pkg.torch.onnx.stack_trace`, `namespace`, and similar strings that embed absolute build-host paths) is stripped after quantization, so the shipped graph carries no build-host information |
| Quantization | weight-only q8, block size 32, applied only to `causal_lm.model.layers.1.mlp.gate_proj`; all other weights float32 |
| Readouts | `tools/export_minimind_readouts.py`, fit from the 32 locked teaching cases at conversion time, 768 dimensions, temperature 4.0 |

The unquantized float32 export matched the Python adapter exactly on all locked discrete decisions. Broad q4 and broad q8 quantization were rejected because they changed locked decisions. The accepted graph has 0/384 field-label, 0/48 action, and 0/48 authored-note ranking mismatches against the Python adapter on the 48 locked teaching and holdout cases; the same result was obtained for the bundle freshly converted on the Linux build host. The browser's own stack (Transformers.js tokenizer plus ONNX Runtime Web WASM) reproduces every note selection and every decision whose reference margin exceeds 5e-4; two of the 38 knife-edge decisions below that floor land on the runner-up (both in `holdout-net-return`, margins about 1e-6); see `docs/VERIFICATION.md` and `docs/KNOWN_LIMITATIONS.md`.

The release gate is discrete parity, not byte identity. `python tools/export_minimind_readouts.py --model-path <checkpoint> --output <bundle> --compare` exits nonzero on any field-label, action, or note-ranking mismatch, and `Dockerfile.web` runs that comparison inside the `minimind` stage after `--check`, so an image cannot be built from a bundle that fails parity.

Readouts are exported once, content-addressed, checked in the browser (schema, model, revision, source hash, unit-norm centroids, label sets), and never refit per visit.

## Local development

Without the bundle the app runs normally: the setup card appears, and **Enable MiniMind** moves it to the retry state with "MiniMind could not finish this local operation." beneath (the worker state message records "The MiniMind file list is unavailable. Retry or continue with manual facts."). Manual facts work.

To get the real helper locally, the conversion tools run as plain scripts from any directory (they add the repository root to `sys.path` themselves; `Dockerfile.web` also sets `PYTHONPATH=/repo`):

```sh
python -m pip install --require-hashes --only-binary=:all: -r tools/requirements/minimind-browser.txt
python tools/prepare_minimind_browser.py --download --convert --quantization q8 --export-web
```

The hash-locked file targets CPython 3.12 on Linux x86_64 (`manylinux_2_28`) with CPU-only PyTorch 2.14.0. On another platform use:

```sh
python -m pip install -e '.[browser]'
python tools/prepare_minimind_browser.py --download --convert --quantization q8 --export-web
```

`--download` fetches only `model.safetensors`, `config.json`, `tokenizer.json`, and `tokenizer_config.json` at the pinned revision into `models/minimind-3` and refuses to continue if the weights hash differs. `--convert` exports, quantizes, fits the readouts, content-addresses the files, and writes `manifest.json` atomically. `--export-web` targets `apps/web/public/minimind` (ignored by git); without it the bundle goes to `models/minimind-3-browser`. `--check` verifies an existing bundle offline:

```sh
python tools/prepare_minimind_browser.py --check --export-web
```

To reproduce the parity comparison against the Python adapter:

```sh
python tools/export_minimind_readouts.py --model-path models/minimind-3 --output apps/web/public/minimind --compare
```

It prints the mismatch counts and numeric deltas and exits nonzero if any discrete decision differs. Expect small numeric deltas and different ONNX and readout hashes from another machine's build; the discrete counts must all be zero. Then restart `npm run dev`. The Next build (`prebuild`) verifies the bundle; see `DEPLOY.md` for the fail-closed rules.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Download interrupted or "A required MiniMind file is unavailable" | Select **Retry MiniMind**. Partial downloads are discarded, so the download restarts from the beginning. |
| "MiniMind could not start in this browser" | Use a current Chromium-family browser (Chrome, Edge), or continue with manual facts. Firefox and Safari are not certified. |
| Tab crashes or the worker stops on a low-memory device | The page reports "MiniMind stopped." Continue with manual facts. The bundle needs roughly 250 MB of memory plus runtime overhead. |
| Ready on the last visit, download offered again | Site data or the `legalfly-minimind-browser-v1` cache was cleared, or the release changed the pinned model contract. Enable again; it is a fresh download of about 253 MB. |
| "Saved MiniMind files were incomplete" | The cached set failed its hash check and was removed. Enable again. |
| Very slow first download | Render's free tier has no edge caching. Later visits do not download model bytes. |
| Corporate proxy strips `Range` or `immutable` headers | Harmless. The worker downloads whole files and verifies them by hash; only speed and cache efficiency suffer. |
| `/api/health` reports `miniMindArtifacts: "unavailable"` | The server bundle is missing or fails verification. Rebuild with the conversion commands above; production builds should have failed closed. |

## The legacy Python adapter

`apps/minimind_adapter/service.py` is retained as the reference implementation that the browser bundle is compared against (`tests/test_minimind_browser_parity.py`, `tools/export_minimind_readouts.py --compare`). It is not started by the web app, not deployed, and not reachable from the hosted page. `apps/web/lib/minimind.ts` contains only the shared fact schema and types; no HTTP client remains.
