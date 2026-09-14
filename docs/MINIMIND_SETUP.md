# MiniMind: local process, not a hosted model

## Root cause and boundary

The web image runs Next.js/Node and serves the MaleCNS browser assets. It does not contain the Python MiniMind adapter or its checkpoint. A browser request to `127.0.0.1:8123` targets the visitor's computer, not the web host. The adapter's default CORS origins permit only `http://localhost:3000` and `http://127.0.0.1:3000`. A hosted page therefore cannot assume access even when the visitor has started a process.

The client now defaults to loopback only on localhost pages. Hosted pages require explicit build-time configuration. All language calls remain direct browser-to-loopback calls; remote destinations and redirects are blocked, and there is no same-origin petition proxy. No external service is a fallback.

`checkMiniMind()` returns `ready`, `status`, and `message`. The statuses distinguish `not-configured`, `invalid-configuration`, `unreachable`, `invalid-response`, `not-ready`, and `ready`. A fetch failure cannot establish whether a checkpoint is missing: process, CORS, permissions, timeout, and network failures can look identical to the browser. A successful health response is validated against the expected model/revision and schema, but is not cryptographic attestation of weights.

The web `/api/health` checks graph assets, not the visitor's MiniMind process.

## Setup from the repository root

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[linguistic]'
python tools/prepare_minimind.py
python tools/prepare_minimind.py --check
CUDA_VISIBLE_DEVICES='' python -m uvicorn apps.minimind_adapter.service:app --host 127.0.0.1 --port 8123
```

The download is an explicit setup step, not something that happens when checking health. `--check` is offline, works without the linguistic dependencies, never starts inference, and exits nonzero for missing or corrupt files. Both setup and the adapter honor `LEGALFLY_MINIMIND_PATH`. Setup also accepts `--model-path`; when using it, set the same path in `LEGALFLY_MINIMIND_PATH` before starting the adapter.

Setup requires `model.safetensors`, `config.json`, `tokenizer.json`, and `tokenizer_config.json`. It compares the actual weights to the SHA-256 recorded in `docs/VERIFICATION.md`, parses required JSON files, and writes file fingerprints only after verification. It does not certify tokenizer semantics, dependency compatibility, memory capacity, model loading, or readout fitting. The actual adapter startup must still complete successfully.

In another terminal, start the localhost web app. A metadata-only check is:

```sh
curl --fail http://127.0.0.1:8123/health
```

The adapter loads weights and fits its readouts before Uvicorn completes startup. A missing checkpoint or load failure prevents startup; inspect the terminal traceback. This patch does not alter adapter lifecycle behavior.

## Explicit private hosted-page use

Only if a private preview is already authorized, configure the web build with `NEXT_PUBLIC_MINIMIND_URL=http://127.0.0.1:8123`. Next.js embeds this public setting at build time; changing only the running container's environment does not update an existing bundle.

On the visitor's machine, set `LEGALFLY_MINIMIND_ORIGINS` to the exact HTTPS preview origin before starting the loopback adapter. Do not bind it to `0.0.0.0` or use a wildcard CORS origin. Browser local-network permissions, HTTPS/HTTP policy, and organizational settings can still prevent access. CORS configuration does not bypass those controls. If blocked, use the local web app or manual facts; do not tunnel petitions through a hosted endpoint.

## Actual training provenance and current blockers

The source implementation is pinned to `jingyaogong/minimind` commit `21ec325dbaa0942ac667323a509aac60a58044a4`. The checkpoint is `jingyaogong/minimind-3` revision `f92512d4cd6142fa9acc0d6022375049a8974bf6`; the recorded 127,834,168-byte weights have SHA-256 `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`.

`apps/minimind_adapter/service.py` loads local weights only. It selects `split == "teach"` cases from `apps/web/public/legalfly/cases.json`, embeds their petitions, and fits per-field centroids plus an independent benchmark-action centroid readout. The pretrained parameters are not optimized. Field readouts do not use action labels; the separate benchmark readout does. Verbalization ranks authored, action-locked note candidates, not unrestricted generated advice. These language readouts are distinct from the browser's full MaleCNS graph and motor/descending readout.

At this change's local verification, this worktree's `models/minimind-3` was absent, including all four required files. Calling the actual adapter's `load()` at that default path raised `FileNotFoundError`. The pinned revision was also absent from the standard Hugging Face snapshot cache. A real download attempt (`HF_HUB_ETAG_TIMEOUT=5 HF_HUB_DOWNLOAD_TIMEOUT=5 timeout 40s python tools/prepare_minimind.py`) exited 1: the Hub client could not locate the files and had no matching local snapshot. It did not install the checkpoint.

However, the sibling checkout already contained real weights at `/workspace/scratch/ac01c2d4bda4/legalflyapp/models/minimind-3`. Offline verification matched the pinned SHA-256 above. Using that explicit path, actual CPU loading and readout fitting succeeded in approximately 4.7 seconds with 63,912,192 parameters and all eight field readouts. Encoding the fictional smoke-test petition, action-locked verbalization, and the independent control classifier all executed successfully. The real FastAPI lifespan and all four routes also passed an in-process integration test without a fake scorer. Installed runtime versions were torch `2.14.0+cu130` (CUDA unavailable), transformers `4.57.6`, and huggingface-hub `0.36.2`.

To repeat against those existing local assets (no download or remote inference):

```sh
LEGALFLY_TEST_MINIMIND_PATH=/workspace/scratch/ac01c2d4bda4/legalflyapp/models/minimind-3 CUDA_VISIBLE_DEVICES='' python -m pytest tests/test_minimind_real_runtime.py -q
LEGALFLY_MINIMIND_PATH=/workspace/scratch/ac01c2d4bda4/legalflyapp/models/minimind-3 CUDA_VISIBLE_DEVICES='' python -m uvicorn apps.minimind_adapter.service:app --host 127.0.0.1 --port 8123
```

The first command is an opt-in integration test; without the explicit test path it skips. An explicitly supplied missing or unusable checkpoint fails rather than skipping. No runtime remains running after the test. The second command is the local service startup command, not a public deployment.

Remaining blockers are configuration and hosting boundaries, not a universally missing model: this worktree still needs the explicit sibling path or a successful download, and the hosted web image still has no adapter. Hosted browser-to-loopback access, CORS and local-network permissions were not verified end to end. The generated MaleCNS graph, anatomy, and shuffled binaries are separate assets; none were replaced, reduced, or synthesized for this fix. Flemish painting assets and CSS were untouched by this MiniMind change.
