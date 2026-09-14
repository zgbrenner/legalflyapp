# Deploy The Legal Fly

Do not publish a public deployment without explicit authorization.

## Build Inputs

The production web build is a static Next.js application plus browser worker assets. It does not need the old Python API for the main Legal Fly experience.

Before building a real preview, prepare the official MaleCNS browser graph:

```sh
python -m pip install pyarrow pandas numpy
python tools/prepare_malecns.py --download --convert --export-browser
cd apps/web
npm ci
npm run build
```

`apps/web/scripts/export-legalfly-graph.mjs` copies the ignored generated binaries from `data/processed/malecns/v1.0/browser` into `apps/web/public/legalfly` during `predev` and `prebuild`. The binaries are large and ignored by git.

## Required Static Assets

Serve these same-origin paths with normal static caching and byte-range support where available:

```text
/legalfly/manifest.json
/legalfly/cases.json
/legalfly/core.mjs
/legalfly/worker.mjs
/legalfly/malecns.bin
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

## Verification Before Promotion

Run:

```sh
cd apps/web
npm run test:legalfly
npm test
npm run build
```

Then serve the production build and exercise:

```text
load graph -> teach ledger -> call petitioner -> hear case -> inspect sampled activity -> correct -> change evidence -> export -> reset -> import -> benchmark -> cancel
```

Capture desktop and mobile screenshots plus a short interaction recording. Treat fixture tests and build success as necessary but not sufficient.
