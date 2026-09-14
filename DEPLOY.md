# Deploy The Legal Fly

Do not publish a public deployment without explicit authorization.

## Build Inputs

The production web build is a static Next.js application plus browser worker assets. It does not need the old Python API for the main Legal Fly experience.

Before building a real preview, prepare the official MaleCNS browser graph:

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser --shuffled
cd apps/web
npm ci
npm run build
```

`apps/web/scripts/export-legalfly-graph.mjs` copies the ignored generated binaries from `data/processed/malecns/v1.0/browser` into `apps/web/public/legalfly` during `predev` and `prebuild`. The binaries are large and ignored by git.


## Render

The repository Blueprint preserves the legacy `legalfly-api` service and adds a separate `legalfly-web` Docker service for the village application. `Dockerfile.web` performs the official download, publisher MD5 verification, independent SHA-256 recording, conversion, and shuffled-control generation in a disposable build stage. The final image contains the browser application and generated binaries, not the 1 GB source Feather files or Python conversion environment.

From the Render dashboard, sync the Blueprint and inspect the proposed `legalfly-web` service before applying it. This creates a second service and does not replace the existing API. Do not point a public build at a shared MiniMind adapter.

For a local image build using Docker:

```sh
docker build --file Dockerfile.web --tag legalfly-web:local .
docker run --rm --publish 3000:3000 legalfly-web:local
curl --fail http://127.0.0.1:3000/api/health
curl --fail --range 0-31 http://127.0.0.1:3000/legalfly/malecns.bin --output /dev/null
```

The connectome build downloads roughly 1 GB from the pinned official release and emits roughly 413 MB of graph, shuffled-control, and anatomy assets. A cold Render build will therefore take materially longer than an ordinary frontend deployment. Docker layer caching avoids repeating the conversion when the acquisition stage and pinned inputs do not change. The free service is suitable only for a private preview: it has 512 MB RAM, spins down when idle, and does not provide edge caching. Expect a cold-start delay and substantial bandwidth use when browsers fetch the graph assets.

## Required Static Assets

Serve these same-origin paths with revalidation and byte-range support. The binary filenames are stable, so they must not be marked immutable unless a future release fingerprints the filenames:

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

Do not replace a missing MaleCNS graph with hemibrain, a random graph, a small circuit, or a pre-recorded animation.

## Browser Requirements

The worker requires module workers, typed arrays, and Web Crypto for SHA-256 verification. HTTPS is required outside localhost. If a device cannot load the full graph safely, the app should show the blocked neural state and keep the non-neural chamber usable.

## Privacy and Headers

Do not add analytics, session replay, request-body logging, or third-party AI calls that capture petition text. Useful headers:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The current app is local-first in the browser. Casebook and model exports contain user-entered material only when the user explicitly exports them.

## Optional MiniMind Adapter

The MiniMind adapter is intentionally a separate loopback process. Do not point a public build at a shared language endpoint without a new privacy and threat review.

```sh
python -m pip install -e '.[linguistic]'
python tools/prepare_minimind.py
CUDA_VISIBLE_DEVICES='' python -m uvicorn apps.minimind_adapter.service:app --host 127.0.0.1 --port 8123
```

For local web development, the default adapter URL is `http://127.0.0.1:8123`. Override it at web build time with `NEXT_PUBLIC_MINIMIND_URL` only for an explicitly authorized private environment. The adapter CORS allowlist defaults to loopback port 3000 and can be set with `LEGALFLY_MINIMIND_ORIGINS`.

## Verification Before Promotion

Run:

```sh
cd apps/web
npm run test:legalfly
npm test
npm run build
```

Verify that `manifest.json` contains the graph and anatomy SHA-256 values and that both binary paths use `application/octet-stream`. Then serve the production build and exercise:

```text
load graph -> teach ledger -> call petitioner -> hear case -> inspect sampled activity -> correct -> change evidence -> export -> reset -> import -> benchmark -> cancel
```

Capture desktop and mobile screenshots plus a short interaction recording. Treat fixture tests and build success as necessary but not sufficient.
