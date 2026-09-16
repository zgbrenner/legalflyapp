# Deploy The Legal Fly

Do not publish a public deployment without explicit authorization.

## What the web image contains

The production web build is a static Next.js application plus two sets of browser worker assets:

- the official MaleCNS v1.0 browser graph, anatomy, and shuffled control under `/legalfly/`;
- the parity-verified browser MiniMind bundle under `/minimind/`.

It does not need the old Python API for the main Legal Fly experience, and it does not run MiniMind on the server. MiniMind runs only in the visitor's browser, inside a module Web Worker, after the visitor selects **Enable MiniMind**. The Python adapter `apps/minimind_adapter/service.py` is used only inside the disposable conversion stage as the parity reference. It is not in the runtime image, no MiniMind process runs on the host, and no petition text reaches the server.

## Build Inputs

Before building a real preview, prepare both artifact sets:

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser --shuffled
python -m pip install --require-hashes --only-binary=:all: -r tools/requirements/minimind-browser.txt
python tools/prepare_minimind_browser.py --download --convert --quantization q8 --check --export-web
cd apps/web
npm ci
npm run build
```

`apps/web/scripts/export-legalfly-graph.mjs` copies the ignored generated binaries from `data/processed/malecns/v1.0/browser` into `apps/web/public/legalfly` during `predev` and `prebuild`. `prebuild` then runs `apps/web/scripts/verify-minimind-assets.mjs`, which re-reads `apps/web/public/minimind/manifest.json`, checks it against the pinned release contract (schema `legalfly-minimind-browser/1`, model, revision, source SHA-256, the selective q8 quantization config, and exactly five content-addressed files), and re-hashes every artifact.

| Condition | Result of a missing or inconsistent bundle |
|---|---|
| `NODE_ENV=production` or `LEGALFLY_REQUIRE_FULL=1` | build fails |
| `node scripts/verify-minimind-assets.mjs --exact` (or `LEGALFLY_MINIMIND_EXACT=1`) | build fails; also fails if the directory holds anything besides `manifest.json` and the five artifacts |
| otherwise | prints a notice and builds without the helper |

`LEGALFLY_MINIMIND_DIR` points the verifier at a different directory. The generated binaries and the bundle are large and ignored by git.

The two lock files under `tools/requirements/` pin different NumPy releases, so install them in separate environments (as the Docker stages do) or use the plain `pip install pyarrow pandas numpy` line above for MaleCNS.

## Render

The repository Blueprint (`render.yaml`) preserves the legacy `legalfly-api` service and adds a separate `legalfly-web` Docker service for the village application. `Dockerfile.web` has five stages:

| Stage | Base image | What it does |
|---|---|---|
| `connectome` | `python:3.12-slim@sha256:78387bc3881b8273120a12ebe6c1ab22b018ccc2c9adf565ae1ac9b536e184ea` | installs `tools/requirements/malecns.txt` with `--require-hashes`, downloads the official release, verifies publisher MD5, records SHA-256, converts, generates the shuffled control |
| `minimind` | same digest | sets `PYTHONPATH=/repo`, installs `tools/requirements/minimind-browser.txt` with `--require-hashes`, downloads the pinned `jingyaogong/minimind-3` files, verifies the weights SHA-256, exports ONNX, applies the selective q8 quantization, strips the exporter's per-node metadata, exports the readouts, content-addresses the five files, writes `manifest.json`, runs `--check`, then runs `tools/export_minimind_readouts.py --compare` against the Python adapter |
| `dependencies` | `node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293` | `npm ci` |
| `builder` | same digest | copies the graph and bundle in, runs `verify-minimind-assets.mjs --exact`, then `npm run build` with `LEGALFLY_REQUIRE_FULL=1` |
| `runner` | same digest | standalone Next server plus `public/`; runs as `node` |

The parity comparison in the `minimind` stage exits nonzero on any field-label, action, or note-ranking mismatch, so an image cannot be built from a bundle that fails parity. The bundle is not byte-identical across build hosts: the ONNX file and the readouts JSON (float centroids) differ slightly per host while the config and tokenizer files are identical. The exact per-file sizes and SHA-256 values for the build that is actually deployed are recorded in the served `/minimind/manifest.json` and summarized by `/api/health`. The release gate is discrete parity, not byte identity.

The base images are pinned by content digest, not tag. Both Python stages install only from the hash-locked requirement files, so a substituted wheel or a moved transitive release fails the build instead of silently changing the graph or the bundle. The lock files target CPython 3.12 on x86_64 `manylinux_2_28`, wheels only, with CPU-only PyTorch 2.14.0 from the PyTorch CPU index. Regenerate them after editing the `.in` inputs:

```sh
sh tools/requirements/lock.sh
```

`Dockerfile.web.dockerignore` excludes `apps/web/public/minimind` from the build context, so the tracked `.gitkeep` placeholder or a local bundle copy can never enter the image; that directory is created only from the verified `minimind` stage.

From the Render dashboard, sync the Blueprint and inspect the proposed `legalfly-web` service before applying it. This creates a second service and does not replace the existing API.

For a local image build using Docker:

```sh
docker build --file Dockerfile.web --tag legalfly-web:local .
docker run --rm --publish 3000:3000 legalfly-web:local
curl --fail http://127.0.0.1:3000/api/health
curl --fail --range 0-31 http://127.0.0.1:3000/legalfly/malecns.bin --output /dev/null
curl --fail http://127.0.0.1:3000/minimind/manifest.json
ONNX=$(curl --silent --fail http://127.0.0.1:3000/minimind/manifest.json \
  | python3 -c 'import json,sys; print(next(f["file"] for f in json.load(sys.stdin)["files"] if f["file"].endswith(".onnx")))')
curl --fail --range 0-99 --output /dev/null --write-out '%{http_code}\n' "http://127.0.0.1:3000/minimind/$ONNX"
```

The last request should return `206` with `Accept-Ranges: bytes` and `Cache-Control: public, max-age=31536000, immutable`.

Build cost: the connectome stage downloads roughly 1 GB from the pinned official release and emits roughly 413 MB of graph, shuffled-control, and anatomy assets. The MiniMind stage installs CPU PyTorch, downloads the 127,834,168-byte checkpoint plus its three JSON files, converts, and emits a bundle of about 252 MB (240 MiB). A cold Render build therefore takes materially longer than an ordinary frontend deployment. Docker layer caching avoids repeating either conversion while the pinned inputs do not change.

The free service is suitable only for a private preview: it has 512 MB RAM, spins down when idle, and does not provide edge caching. Expect a cold-start delay, and expect the first MiniMind download (about 252 MB, or 241 MiB, per browser) to be slow. Later visits restore the bundle from the browser's Cache Storage and do not fetch model bytes again.

## Vercel

`thelegalfly.vercel.app` does not serve the application. Its `vercel.json` redirects `/` and `/:path*` to the Render web origin `https://legalfly-web.onrender.com`. The Vercel project therefore does not build the Next application at all (that build fails closed by design without the MaleCNS graph and the MiniMind bundle); `vercel.json` sets `framework` to `null` and runs `scripts/build-vercel-redirect-shell.mjs`, which emits a one-page static output so the redirect rules can deploy. The MiniMind worker requests every artifact from the page's own origin, so the bundle must be served by the origin that serves the page.

## Required Static Assets

Serve these same-origin paths with revalidation and byte-range support. The MaleCNS filenames are stable, so they must not be marked immutable unless a future release fingerprints the filenames:

```text
/legalfly/manifest.json
/legalfly/cases.json
/legalfly/core.mjs
/legalfly/worker.mjs
/legalfly/malecns.bin
/legalfly/malecns-anatomy.bin
```

If generated:

```text
/legalfly/malecns-shuffled.bin
```

The MiniMind files are content-addressed (the SHA-256 is part of the filename), so `next.config.js` marks them immutable and only the manifest revalidates:

```text
/minimind/manifest.json                     Cache-Control: public, max-age=0, must-revalidate
/minimind/config.<sha256>.json              Cache-Control: public, max-age=31536000, immutable
/minimind/model.q8.<sha256>.onnx            Accept-Ranges: bytes
/minimind/readouts.<sha256>.json
/minimind/tokenizer.<sha256>.json
/minimind/tokenizer_config.<sha256>.json
```

Do not replace a missing MaleCNS graph with hemibrain, a random graph, a small circuit, or a pre-recorded animation. Do not replace a missing MiniMind bundle with a remote inference endpoint; the worker disables remote model loading and the page falls back to manual facts.

## Health

`/api/health` reports the artifacts on disk. It does not, and cannot, report the visitor's browser state.

```json
{
  "status": "ok",
  "service": "legalfly-web",
  "services": { "maleCns": "ready", "miniMindArtifacts": "ready" },
  "miniMind": {
    "revision": "f92512d4cd6142fa9acc0d6022375049a8974bf6",
    "quantization": "q8",
    "bytes": 252092335
  }
}
```

`bytes` is the bundle total of the build that is actually deployed; the example shows the 2026-09-15 reference build. The response is `200` with `status: "ok"` only when both artifact sets verify; otherwise it is `503` with `status: "unavailable"`, each service reported independently, and the `miniMind` block omitted. It is sent with `Cache-Control: no-store`. Render uses this path as the service health check.

## Browser Requirements

The MaleCNS worker requires module workers, typed arrays, and Web Crypto for SHA-256 verification. The MiniMind worker additionally requires Cache Storage and WebAssembly, and uses WebGPU when `navigator.gpu` exists and its output passes a health check. HTTPS is required outside localhost.

| Path | Status |
|---|---|
| Headless Chromium, WASM backend | verified through Playwright |
| WebGPU backend | attempted first when available, not certified |
| Firefox, Safari | not certified |

If a device cannot load the full graph safely, the app shows the blocked neural state and keeps the non-neural chamber usable. If a device cannot run MiniMind, the setup card shows an `unsupported` or `failed` message with retry and manual-facts actions.

## Privacy and Headers

Do not add analytics, session replay, request-body logging, or third-party AI calls that capture petition text. Useful headers, already set by `next.config.js`:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Petition text never leaves the visitor's browser: the page posts it to the same-origin MiniMind worker as a structured message, the worker never puts it in a URL, fetch body, log, `localStorage`, or Cache Storage key, and Transformers.js remote model loading is disabled. Hosting still sees ordinary static-asset requests and IP addresses. Casebook and model exports contain user-entered material only when the user explicitly exports them.

## Browser MiniMind

There is no MiniMind adapter, no `NEXT_PUBLIC_MINIMIND_URL`, and no `LEGALFLY_MINIMIND_ORIGINS`. The hosted path is:

1. The page loads with the setup card and the model not downloaded. No `/minimind/` request is made unless a verified cached copy already exists in this browser.
2. The visitor selects **Enable MiniMind**. The worker fetches `/minimind/manifest.json`, then the five files (about 252 MB in total), hashing each with SHA-256 and storing it in Cache Storage `legalfly-minimind-browser-v1`.
3. After verification the worker starts ONNX Runtime Web, trying WebGPU first when available and falling back once to WASM, and replaces the card with `MiniMind ready · runs on this device`.
4. On later visits the worker re-hashes the cached files and restores them without downloading. A corrupt or incomplete set is evicted entirely and the card returns to the enable state.

A release that changes the pinned model contract ships a new worker; the old cached set fails its check on the next visit, is evicted, and the visitor is asked to enable again. Details, states, and troubleshooting are in `docs/MINIMIND_SETUP.md`.

## Verification Before Promotion

Run:

```sh
cd apps/web
npm run lint
npx tsc --noEmit
npm run test:legalfly
npm test
LEGALFLY_REQUIRE_FULL=1 npm run build
```

Verify that `/legalfly/manifest.json` contains the graph and anatomy SHA-256 values, that both binary paths use `application/octet-stream`, that `/api/health` returns `200` with both services `ready`, and that a ranged request for the ONNX file returns `206`. Then serve the production build and exercise:

```text
enable MiniMind (first download) -> reload (cached restore) -> load graph -> teach ledger -> call petitioner -> draft facts with MiniMind -> confirm facts -> hear case -> inspect sampled activity -> correct -> change evidence -> export -> reset -> import -> benchmark -> cancel
```

Repeat the core flow with **Continue with manual facts** and MiniMind never enabled. The scripted equivalent is:

```sh
QA_BASE_URL=http://127.0.0.1:3000 python -m scripts.legalfly_full_browser
```

Capture desktop, tablet, and mobile screenshots plus console and page-error logs. Treat fixture tests and build success as necessary but not sufficient.
