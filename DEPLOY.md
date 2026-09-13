# Deploy LegalFly

LegalFly is two processes:

1. **Web** (Next.js + Three.js brain viz) → **Vercel** or Cloudflare Pages
2. **API** (FastAPI + connectome reservoir) → **Render** or **Fly.io** (needs a container; not Vercel serverless)

Vercel alone cannot host the Python reservoir + sklearn readouts. Cloudflare Workers also cannot — use Cloudflare Containers / Render / Fly for the API.

## Fastest path (recommended)

### 1. API on Render — use **Web Service** (not Blueprint)

Blueprints are easy to miss on mobile. Do this instead:

1. Open [https://dashboard.render.com](https://dashboard.render.com)
2. Tap **New Web Service →** (under **Web Services**)
3. Connect GitHub and pick **`zgbrenner/legalflyapp`**
4. Settings:

| Field | Value |
|---|---|
| Name | `legalfly-api` |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Dockerfile path | `Dockerfile.api` |
| Instance type | **Free** |

5. Environment variables (Add):

| Key | Value |
|---|---|
| `LEGALFLY_ENCODER` | `hashing` |
| `LEGALFLY_DEMO_MODE` | `false` |
| `LEGALFLY_CORS_ORIGINS` | `*` |
| `LEGALFLY_LOG_RAW_TEXT` | `false` |

6. Create Web Service and wait for the first deploy (can take several minutes on free).
7. Copy the service URL, e.g. `https://legalfly-api.onrender.com`
8. Check: open `https://YOUR-API/health` — should return JSON `status: ok`

> If you prefer Blueprints later (desktop): left sidebar → **Blueprints** → New Blueprint Instance → select the repo (needs `render.yaml` on `main`).

### 2. Web on Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new).
2. Import `zgbrenner/legalflyapp`.
3. Set **Root Directory** to `apps/web`.
4. Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-API.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |

5. Deploy. Open the `*.vercel.app` URL — the twin chamber auto-fires.

### CLI alternative (if you have tokens)

```bash
# API (Fly)
fly auth login
fly launch --config fly.toml --dockerfile Dockerfile.api --yes
fly deploy

# Web (Vercel)
cd apps/web
npx vercel login
npx vercel --prod \
  -e NEXT_PUBLIC_API_URL=https://legalfly-api.fly.dev \
  -e NEXT_PUBLIC_DEMO_MODE=false
```

Or set secrets in this Cloud Agent environment:

- `VERCEL_TOKEN`
- `FLY_API_TOKEN` (or deploy API on Render via the dashboard)

…and ask the agent to finish the deploy.

## What the public API serves

`Dockerfile.api` ships **hashing-encoder** reservoirs (no torch / MiniLM download) so it fits free memory limits. Macro-F1 is still strong on the synthetic harder set; twin viz and ROI meters work the same.

For a MiniLM production box, use a ≥2 GB machine and the research image (`apps/api/Dockerfile`) with `LEGALFLY_ENCODER=minilm`.

## Cloudflare option

- **Pages**: point at `apps/web` (Next.js). Same env vars as Vercel.
- **API**: Cloudflare Containers from `Dockerfile.api`, or keep Render/Fly as the origin.

## Local check before shipping

```bash
docker build -f Dockerfile.api -t legalfly-api .
docker run --rm -p 8000:8000 legalfly-api
curl -s localhost:8000/health
```
