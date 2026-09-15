# Browser MiniMind implementation handoff

Date halted: 2026-09-15

## Repository and branch

- Canonical repository: `https://github.com/zgbrenner/thelegalfly.git`
- Continue on branch: `feature/browser-minimind`
- Current branch HEAD: `7a2bfbe` (`Ship verified browser MiniMind artifacts`)
- Do not merge to `main` yet. Task 6 has one unresolved review finding, and Task 7/final review are not complete.
- Production entry URL: `https://thelegalfly.vercel.app/`
- The Vercel URL currently redirects to the Render web service. The legacy Python API is not the active browser-app inference path.

## User requirements

1. Make the Legal Fly site genuinely usable.
2. MiniMind must run entirely in each visitor's browser, with no separate installation and no server-side petition processing.
3. Explain the workflow in plain language and make the next click obvious.
4. The MiniMind setup notice must disappear after the model is downloaded/verified; show a compact ready indicator instead.
5. Keep manual fact entry available.
6. Fix responsive spacing/layout, especially the broken 721–1050 px range.
7. Finish, verify, merge to local `main`, and push GitHub `main` only after all release gates pass.

## Approved design

Read these first:

- `docs/superpowers/specs/2026-09-15-browser-minimind-responsive-design.md`
- `docs/superpowers/plans/2026-09-15-browser-minimind-responsive.md`

The design uses a Web Worker, Transformers.js tokenization, ONNX Runtime Web inference, explicit opt-in download, Cache Storage with SHA-256 verification, WebGPU attempt with behavioral validation and WASM fallback, and same-origin content-addressed assets. Petition text must never be fetched or persisted.

## Completed commits

- `feeb121` Document browser MiniMind design
- `9d879a6` Plan browser MiniMind implementation
- `2914bc6` Ignore isolated feature worktrees
- `fd051d5` Add reproducible browser MiniMind conversion
- `0c38dde` Harden browser MiniMind artifact verification
- `c271835` Verify browser MiniMind parity
- `b455c73` Run MiniMind in a browser worker
- `c8cba93` Harden MiniMind worker protocol
- `ab3f8b3` Guide users through local MiniMind setup
- `236c114` Fix responsive Legal Fly chamber layout
- `7a2bfbe` Ship verified browser MiniMind artifacts

## Verified results so far

### Model conversion and parity

- Pinned source checkpoint SHA-256: `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`.
- Full fp32 ONNX matched the Python adapter exactly on all locked discrete decisions.
- Broad q4 and broad q8 quantization were rejected because they changed decisions.
- The accepted graph selectively quantizes semantic module `causal_lm.model.layers.1.mlp.gate_proj` with q8.
- Accepted parity: 0/384 field-label mismatches, 0/48 action mismatches, 0/48 authored-note ranking mismatches.
- Accepted ONNX size is approximately 251.7 MB; complete browser bundle is 253,441,900 bytes across five files.
- Real ONNX Runtime Web WASM inference succeeded and produced expected logits and 768-dimensional hidden states.

### Browser worker/privacy

- No artifact request occurs before explicit enable, except verified cached restoration.
- Cached artifacts are re-hashed before use; corrupt/incomplete bundles are fully evicted.
- Remote model loading is disabled.
- Petition text is not included in fetches or Cache Storage.
- Worker messages reject undeclared fields.
- Advice text is restricted to the exact authored candidate set under immutable confirmed facts and the already-fixed action.
- WebGPU output is behaviorally checked; invalid output is disposed and retried with WASM.

### User interface

- Plain-language local-only setup card, Enable/Cancel/Retry/manual controls, progress, and four-step guide are implemented.
- When ready, the setup notice is replaced with `MiniMind ready · runs on this device`.
- All eight facts still require confirmation; edits/case changes revoke confirmation.
- Worker subscription and lifecycle are cleaned up on unmount.
- Integrated Next build emits the MiniMind worker, ORT WebGPU/WASM chunks, and three WASM binaries.

### Responsive behavior

- Explicit tablet placement at 721–1100 px and mobile reset at 720 px and below.
- Process guide wraps; page/panel/section spacing uses `clamp()`; primary actions have a 44 px minimum height.
- Full official MaleCNS flow passed at widths 1440, 1101, 1100, 1024, 721, 720, 390, and 320 with no horizontal overflow or page errors.

### Production packaging

- Full web suite at Task 6: 80/80 passed.
- Deployment suite: 10/10 passed.
- TypeScript, ESLint, production build, health check, manifest serving, and ranged model serving passed.
- Real model probe returned HTTP 206 for bytes 0–99 of 251,710,377 with immutable caching and `Accept-Ranges`.
- Production/full mode fails closed if MaleCNS or MiniMind artifacts are missing/stale.
- No generated model or graph binaries are committed.

## Current unresolved review finding

Task 6 was rejected pending one Important fix and one small cleanup:

1. `Dockerfile.web` uses mutable `python:3.12-slim` and unhashed pip inputs in the MiniMind conversion stage. Pin the Python base image by a verified digest and install all conversion dependencies from a hash-locked requirements file using `pip --require-hashes`. Account for Render's Linux build platform and lock all transitive wheels.
2. Prevent `apps/web/public/minimind/.gitkeep` from entering the final runtime image. Remove it before the artifact overlay or exclude it from the Docker context, and add a static/deployment test.

No fix edits were present when work was halted; `7a2bfbe` is clean.

After fixing, create a new commit (do not rewrite `7a2bfbe`) and rerun the scoped Task 6 review.

## Remaining work

### Finish Task 6

- Apply the reproducibility and `.gitkeep` fixes above.
- Run at minimum:
  - `cd apps/web && npm test -- --run tests/deployment.test.ts`
  - full web tests
  - `npx tsc --noEmit`
  - `npm run lint`
  - `git diff --check`
- Re-run a real full-production build with the ignored local MaleCNS/MiniMind artifacts if available.
- A literal Docker build could not be run on the original computer because Docker/Podman/Buildah/nerdctl were unavailable. Run it on the new computer or rely on an actual Render preview build.

### Task 7

Extract and follow Task 7 from the implementation plan. It covers documentation, privacy/security assertions, browser acceptance, and deployed-service checks. Specifically:

- Update setup/deployment/methodology docs to describe browser-only MiniMind, one-time download size, cache behavior, fallback, privacy boundary, and supported browsers.
- Ensure no old copy claims a local adapter/server installation is required.
- Run privacy tests proving petition text never enters network requests, logs, URLs, storage, or service-worker/cache keys.
- Run real first-download, cancellation/retry, cache-reload, corrupt-cache recovery, WebGPU/WASM fallback, manual bypass, full MaleCNS journey, and responsive matrix checks.
- Build the real Docker image or validate an actual Render preview build.
- Probe `/api/health`, the MiniMind manifest, all content-addressed assets, and a ranged ONNX request.
- Check the public deployment only after the branch is complete and reviewed.

### Final review and integration

- Run a whole-branch code/security/privacy review against the approved design and plan.
- Run the complete JS/Python test suites and production build again from a clean checkout.
- Check `git status`, `git diff --check`, and confirm no generated weights, graph binaries, secrets, QA screenshots, or temporary files are tracked.
- Merge `feature/browser-minimind` into local `main` without discarding the three design/plan/worktree commits already included in this branch.
- Push `main` to GitHub only after all gates pass.
- Monitor GitHub/Render/Vercel deployment results and verify the live flow.

## Environment notes

- Original working tree: `C:\Users\zach.brenner\legalflyapp`
- Original isolated worktree: `C:\Users\zach.brenner\legalflyapp\.worktrees\browser-minimind`
- The `.superpowers/sdd/2026-09-15-browser-minimind-responsive/` task reports are gitignored and will not transfer through GitHub. This handoff contains the material results.
- Ignored QA copies of MaleCNS and MiniMind artifacts also will not transfer. Regenerate/download them using the repository tooling and pinned manifests.
- The original machine lacked a container engine and the browser plugin; Chrome through Playwright was used for browser QA.
- Render free services do not provide edge caching. The first MiniMind download is about 253.4 MB, though subsequent verified loads use browser cache.

## Suggested Claude Code startup prompt

```text
Clone https://github.com/zgbrenner/thelegalfly and check out feature/browser-minimind. Read docs/HANDOFF_BROWSER_MINIMIND.md, then read the approved design and implementation plan it links. Do not merge or deploy yet. First finish the two open Task 6 review fixes: digest-pin the Python conversion base image, add a fully hash-locked conversion requirements file installed with --require-hashes, and ensure .gitkeep cannot enter the runtime MiniMind directory. Add tests, run all Task 6 gates, and commit without rewriting existing commits. Then complete Task 7, run an independent whole-branch review and clean-checkout acceptance, build/validate the Render container, and only after every gate passes merge into main, push GitHub main, and verify the live Vercel/Render flow. Preserve the core privacy rule: petition text is processed only in the visitor's browser and is never sent or persisted.
```
