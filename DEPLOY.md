# Running and hosting The Village Lawyer

## Prepared artifact

Extract the `village-lawyer-ready-to-run` artifact from a successful verification workflow. It includes the actual graph, a verified starter, measured audit, local painting and server launcher.

```sh
node serve.mjs .
```

Open `http://127.0.0.1:4173`. Alternatively, any ordinary static server over localhost or HTTPS can serve the folder. Do not open `index.html` with a `file:` URL.

## Source build

Install Node 22+, Python 3.11+, and `requirements-build.txt` in a virtual environment. Then run `npm ci && npm run build`. Serve `dist/` without changing its internal directory structure. `npm start` uses the supplied loopback-only development server; a production host should serve the static assets directly.

The first build downloads about 1.11 GB and needs several GB of build RAM. Subsequent builds reuse SHA-verified `.cache/malecns-v1` sources. The browser downloads about 139 MB of graph data. Its core typed edge arrays use about 205 MB before overhead. There is no smaller automatic fallback.

## Static hosts

Upload the entire contents of `dist/` to a static host. A subdirectory path works because asset, module, worker and fetch URLs are relative. The graph is split into files below 25 MB. Do not strip `data/`, change `.bin.gz` names or apply a `Content-Encoding: gzip` header to those files: they are intentionally gzip containers that the worker verifies and decompresses itself. Serve them as `application/octet-stream`.

Correct MIME types are required: `.mjs` as JavaScript, `.json` as JSON and `.bin.gz` as binary. Serve the app over HTTPS except for localhost development. Browser `crypto.subtle`, module workers and `DecompressionStream` must be available. A browser memory failure should produce an explicit error, not a partial result.

Use atomic deployments and retain the previous distribution during rollout. Avoid mixing a new manifest with old chunks or model weights. Cache hashed graph payloads conservatively; do not cache the manifest or HTML across incompatible deployments without revalidation.

## Recommended response headers

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

The provided Node server sets these headers. A static host must be configured separately. Do not add analytics, case text in URLs, session replay, remote error payloads containing form state, or external model APIs.

No workflow publishes the website. Deployment credentials and a public hostname are deliberately not assumed. The feature branch and ready-to-run artifact can be reviewed before a deployment decision.
