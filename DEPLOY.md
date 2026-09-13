# Deploy Legal Dreaming

Legal Dreaming is a browser-local Next.js application. The public site does **not** require the retired classifier API, API keys, or `NEXT_PUBLIC_API_URL`.

## Build

Use a full repository checkout:

```sh
cd apps/web
npm ci
npm run build
```

The prebuild step exports and checksum-verifies the packaged biological graph. It reads:

- `deploy/data/processed/hemibrain/biological`
- `deploy/research-inputs/hemibrain-provenance.json`

Do not replace missing biological input with a synthetic fallback.

## Hosting

For Vercel, keep the project rooted at `apps/web` while ensuring the build context can access the root-level `deploy/` inputs above. The deployed site must serve:

- `/dream/manifest.json`
- `/dream/biological.bin`
- `/dream/random_degree_preserving.bin`

Outside localhost, use HTTPS so the browser can perform SHA-256 verification through `crypto.subtle`.

## Release checks

Before promotion, run:

```sh
pytest -q
cd apps/web
npm test
npm run test:dream
npm run build
cd ../..
python -m scripts.dream_browser_smoke
python -m scripts.hero_browser_smoke
```

The browser checks exercise the actual production build, browser worker, biological graph, training, replay, silence, import/export, controls, scroll behavior, responsive layout, reduced motion, and verify that retired experiment routes return 404.

Do not enable analytics, session replay, or third-party scripts that capture teaching text. User-supplied corpora and learned models are processed locally in the browser and are not saved automatically.

A successful build does not establish scientific validity or browser compatibility beyond the environments actually tested. Review `DREAMING_VERIFICATION.md` and `/dreaming-method` for current boundaries and disclosures.
