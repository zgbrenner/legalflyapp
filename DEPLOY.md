# Deploy The Legal Fly

The Next.js website and Python inference service are separate deployments. Updating the website does not update the trained server models. Deploy both from the same reviewed release.

## API

Build the root `Dockerfile.api`. It packages the real hemibrain subgraph and builds compatible hashing-encoder readouts during image construction. Production runtime auto-training is disabled. Missing, old, corrupt or incompatible checkpoints must fail startup.

```bash
docker build -f Dockerfile.api -t the-legal-fly-api .
docker run --rm -p 8000:8000 \
  -e LEGALFLY_CORS_ORIGINS=http://localhost:3000 the-legal-fly-api
curl --fail http://localhost:8000/ready
```

Production settings:

```
LEGALFLY_ENCODER=hashing
LEGALFLY_ALLOW_AUTO_TRAIN=false
LEGALFLY_CORS_ORIGINS=https://thelegalfly.vercel.app
LEGALFLY_LOG_RAW_TEXT=false
OPENBLAS_NUM_THREADS=1
OMP_NUM_THREADS=1
```

Use `/ready`, not merely `/health`, for readiness. `/models` describes the actual loaded graph and encoder. Inference responses must identify science version `2.0-directed-controls`. Compare the graph hash with `deploy/research-inputs/hemibrain-provenance.json`.

The browser checks exercise the actual biological API directly. They do not establish that the destination host's Docker image, memory limits, reverse proxy, or cold starts work. Verify those before promotion.

## Website

Vercel project root: `apps/web`. Install using the committed lock with `npm ci`. Set `NEXT_PUBLIC_API_URL` to the corrected API's HTTPS origin and rebuild. This public variable is compiled into the browser bundle. Never put credentials in `NEXT_PUBLIC_*` variables.

Add each preview's exact origin to the API's comma-separated `LEGALFLY_CORS_ORIGINS`. Do not use a wildcard as the production default. `NEXT_PUBLIC_DEMO_MODE` is obsolete: provenance comes from the actual model response.

The initial synthetic passage is a genuine saved inference labeled **Recorded example**. Only a successful new request becomes a **Live result**. Without an API origin, the site can still display recordings and bundled research, but cannot classify new text. Offline and outdated backends produce errors rather than fabricated predictions.

## Release checks

Run Python tests, frontend tests, lint, the production build, and `python -m scripts.browser_smoke` against the built frontend and biological API. Inspect the desktop and mobile screenshots. Verify new inference and source hashes. Deploy the corrected API first, then the frontend pointing at it. Retain the previous compatible image/build for rollback. Do not mix old readouts with new dynamics.

The limiter is per process. Multiple instances need a shared or edge limiter. Trust forwarded headers only from the actual hosting proxy. Do not enable request-body logging or session replay. See `docs/PRIVACY.md` and `docs/KNOWN_LIMITATIONS.md`.

The lightweight live hashing model is not the same configuration as the saved MiniLM research benchmark. Both are explicitly labeled. This branch does not by itself certify or update the public production deployment.
