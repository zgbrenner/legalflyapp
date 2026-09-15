# Browser MiniMind and Responsive Chamber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the pinned MiniMind model entirely inside the visitor's browser, guide users through the chamber clearly, and repair responsive layout behavior from 320–1440px.

**Architecture:** A reproducible Python build tool converts and verifies the pinned Qwen3 MiniMind checkpoint into quantized ONNX plus immutable manifest/readout artifacts. A dedicated browser Web Worker owns Transformers.js/ONNX initialization, cache restoration, constrained inference, and progress; React communicates through a typed adapter and never transmits petition text over the network. Existing chamber components gain a plain-language setup card and numbered workflow, while explicit breakpoint placement removes the tablet grid defect.

**Tech Stack:** Python 3.12, PyTorch/Transformers/Optimum ONNX export, Transformers.js 3.x, ONNX Runtime Web, TypeScript, React 19, Next.js 15, Web Workers, Cache Storage, Vitest, Playwright, Render Docker.

**Spec:** `docs/superpowers/specs/2026-09-15-browser-minimind-responsive-design.md`

## Global Constraints

- Canonical model: `jingyaogong/minimind-3` revision `f92512d4cd6142fa9acc0d6022375049a8974bf6`; source weights SHA-256 `3adf69402b5d22e693151cabadc12528f923c4ba6bf343738aaf13f0892162e8`.
- Petition text must remain inside the page and its dedicated worker; it must never enter URLs, analytics, logs, cache keys, model artifacts, or network request bodies.
- Model download requires explicit **Enable MiniMind** action; verified cached artifacts may restore automatically later.
- MiniMind may propose eight visible facts and select an authored note only after the fly action is fixed; it may not choose or alter the fly action.
- Manual facts must work in every MiniMind state.
- Production builds fail when required browser model artifacts are absent or invalid.
- No document-level horizontal overflow or clipped primary action from 320px through 1440px.

---

### Task 1: Prove and package browser-model conversion

**Files:**
- Create: `tools/prepare_minimind_browser.py`
- Create: `tests/test_prepare_minimind_browser.py`
- Create: `apps/web/public/minimind/.gitkeep`
- Modify: `.gitignore`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: pinned source checkpoint contract from `tools/prepare_minimind.py`.
- Produces: `convert_model(source: Path, output: Path, quantization: str) -> BrowserManifest` and JSON manifest schema `legalfly-minimind-browser/1` with `model`, `revision`, `source_sha256`, `files`, `quantization`, `outputs`.

- [ ] **Step 1: Write failing conversion-contract tests**

```python
def test_manifest_rejects_wrong_source_hash(tmp_path):
    source = make_minimal_checkpoint(tmp_path, weights=b"wrong")
    with pytest.raises(ValueError, match="SHA-256"):
        prepare.verify_source(source)

def test_manifest_uses_content_addressed_files(tmp_path):
    manifest = prepare.build_manifest(FIXTURE_EXPORT, revision=REVISION, quantization="q8")
    assert manifest["schema"] == "legalfly-minimind-browser/1"
    assert all(entry["sha256"] in entry["file"] for entry in manifest["files"])
    assert manifest["outputs"] == ["logits", "last_hidden_state"]
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/test_prepare_minimind_browser.py -q`
Expected: collection/import failure because `prepare_minimind_browser` does not exist.

- [ ] **Step 3: Implement verified export and manifest generation**

Implement explicit allow-listed downloads, source hash verification, Qwen3 ONNX export with logits and final hidden state, q4/q8 selection flag, SHA-256-renamed outputs, and atomic manifest writing. Keep download/export behind CLI flags `--download`, `--convert`, `--quantization {q4,q8}`, `--check`, and `--export-web`.

- [ ] **Step 4: Run conversion tests and fixture export**

Run: `python -m pytest tests/test_prepare_minimind_browser.py -q`
Expected: PASS without downloading the real checkpoint.

- [ ] **Step 5: Commit**

```sh
git add tools/prepare_minimind_browser.py tests/test_prepare_minimind_browser.py apps/web/public/minimind/.gitkeep .gitignore pyproject.toml
git commit -m "Add reproducible browser MiniMind conversion"
```

### Task 2: Establish Python/ONNX parity and export fixed readouts

**Files:**
- Create: `tools/export_minimind_readouts.py`
- Create: `tests/test_minimind_browser_parity.py`
- Modify: `tools/prepare_minimind_browser.py`
- Modify: `docs/VERIFICATION.md`

**Interfaces:**
- Consumes: Task 1 ONNX model with `logits` and `last_hidden_state`; locked cases in `apps/web/public/legalfly/cases.json`.
- Produces: `readouts.<sha256>.json` containing normalized field/action centroids, labels, dimensions, teaching-case hash, and artifact hash.

- [ ] **Step 1: Write failing parity/readout tests**

```python
def test_exported_readouts_are_normalized(browser_artifacts):
    readouts = json.loads(browser_artifacts.readouts.read_text())
    for group in [*readouts["fields"].values(), readouts["actions"]]:
        assert all(abs(np.linalg.norm(row) - 1.0) < 1e-5 for row in group["centroids"])

def test_browser_backend_matches_python_labels(real_minimind_path, browser_artifacts):
    comparison = compare_backends(real_minimind_path, browser_artifacts, locked_cases())
    assert comparison.field_label_mismatches == []
    assert comparison.action_label_mismatches == []
    assert comparison.note_ranking_mismatches == []
```

- [ ] **Step 2: Run parity tests and verify RED or explicit real-model skip**

Run: `python -m pytest tests/test_minimind_browser_parity.py -q`
Expected: fixture test FAIL for missing exporter; real-model test skips unless `LEGALFLY_TEST_MINIMIND_PATH` is set.

- [ ] **Step 3: Implement centroid export and comparison harness**

Use the Python adapter's exact prompt formatting, mean pooling, normalization, temperature multiplier, candidate token averaging, and label ordering. Record numeric cosine/logit deltas as diagnostics while gating release on identical discrete outputs.

- [ ] **Step 4: Run q4 then q8 against the real pinned checkpoint**

Run q4 parity first. Select q4 only if every discrete parity assertion passes; otherwise record the failure and select q8. Update `docs/VERIFICATION.md` with chosen size, hashes, backend versions, label parity, maximum cosine delta, and candidate-ranking parity.

- [ ] **Step 5: Commit**

```sh
git add tools/export_minimind_readouts.py tools/prepare_minimind_browser.py tests/test_minimind_browser_parity.py docs/VERIFICATION.md
git commit -m "Verify browser MiniMind parity"
```

### Task 3: Build the typed MiniMind browser worker

**Files:**
- Create: `apps/web/workers/minimind.worker.ts`
- Create: `apps/web/lib/minimind-browser.ts`
- Create: `apps/web/tests/minimind-worker.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/next.config.js`

**Interfaces:**
- Consumes: Task 1 manifest/model and Task 2 readouts.
- Produces: `MiniMindBrowserClient` with `enable()`, `cancelDownload()`, `encodePetition()`, `verbalizeAdvice()`, `benchmarkMiniMind()`, `dispose()` and subscribed `MiniMindBrowserState`.

- [ ] **Step 1: Write failing worker protocol tests**

```ts
it("does not request artifacts before enable", async () => {
  const runtime = createHarness();
  await runtime.start();
  expect(runtime.fetches).toEqual([]);
});

it("restores a verified cached model and becomes ready", async () => {
  const runtime = createHarness({ cache: verifiedArtifacts });
  await runtime.start();
  await expect(runtime.state()).resolves.toMatchObject({ phase: "ready", source: "cache" });
});

it("never fetches petition text", async () => {
  const runtime = createReadyHarness();
  await runtime.encodePetition("private goat petition");
  expect(runtime.fetches.some(request => request.serialized.includes("private goat petition"))).toBe(false);
});
```

- [ ] **Step 2: Run worker tests and verify RED**

Run: `cd apps/web && npm test -- --run tests/minimind-worker.test.ts`
Expected: FAIL because worker/client modules are absent.

- [ ] **Step 3: Implement protocol, caching, integrity, and inference**

Pin `@huggingface/transformers`; disable remote models; load same-origin content-addressed files; validate manifest and worker messages; emit aggregate progress; attempt WebGPU once then WASM; reproduce constrained field/readout/note logic; evict corrupt cache entries; never persist petition data.

- [ ] **Step 4: Run worker and existing MiniMind tests**

Run: `cd apps/web && npm test -- --run tests/minimind-worker.test.ts tests/minimind.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/web/workers/minimind.worker.ts apps/web/lib/minimind-browser.ts apps/web/tests/minimind-worker.test.ts apps/web/package.json apps/web/package-lock.json apps/web/next.config.js
git commit -m "Run MiniMind in a browser worker"
```

### Task 4: Add plain-language setup and guided actions

**Files:**
- Modify: `apps/web/components/LegalFlyVillage.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/legal-fly-village.test.tsx`
- Modify: `apps/web/tests/minimind.test.ts`

**Interfaces:**
- Consumes: `MiniMindBrowserClient` and `MiniMindBrowserState` from Task 3.
- Produces: accessible setup card, progress/status UI, manual bypass, and numbered four-step chamber guide.

- [ ] **Step 1: Write failing user-journey component tests**

```tsx
it("explains and enables the local language helper", async () => {
  render(<LegalFlyVillage />);
  expect(screen.getByText(/runs only in this browser/i)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Enable MiniMind" }));
  expect(fakeMiniMind.enable).toHaveBeenCalledOnce();
});

it("removes setup notice after cached MiniMind becomes ready", async () => {
  renderWithMiniMind({ phase: "ready", source: "cache", backend: "wasm" });
  expect(screen.queryByRole("button", { name: "Enable MiniMind" })).not.toBeInTheDocument();
  expect(screen.getByText("MiniMind ready · runs on this device")).toBeVisible();
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `cd apps/web && npm test -- --run tests/legal-fly-village.test.tsx tests/minimind.test.ts`
Expected: FAIL on missing setup action and ready copy.

- [ ] **Step 3: Implement the setup card and workflow guide**

Add explicit enable/manual actions, download bytes and percentage, cancel/retry, compact ready indicator, actionable failure copy, four numbered steps, current-step emphasis, and disabled-control explanations. Preserve mandatory fact confirmation and authored fallback behavior.

- [ ] **Step 4: Run component tests**

Run: `cd apps/web && npm test -- --run tests/legal-fly-village.test.tsx tests/minimind.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add apps/web/components/LegalFlyVillage.tsx apps/web/app/globals.css apps/web/tests/legal-fly-village.test.tsx apps/web/tests/minimind.test.ts
git commit -m "Guide users through local MiniMind setup"
```

### Task 5: Repair responsive chamber layout

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/tests/ui.test.ts`
- Modify: `scripts/legalfly_full_browser.py`

**Interfaces:**
- Consumes: existing chamber DOM classes.
- Produces: explicit desktop/tablet/mobile placement and responsive spacing tokens.

- [ ] **Step 1: Write failing breakpoint assertions**

Add CSS contract assertions for explicit `.lf-petition-panel` placement at 721–1100px and reset at 720px. Extend Playwright widths to `[1440, 1101, 1100, 1024, 721, 720, 390, 320]`; assert petition width exceeds 45% of viewport at tablet sizes, document scroll width never exceeds viewport, and primary controls have height at least 44px.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `cd apps/web && npm test -- --run tests/ui.test.ts`
Expected: FAIL because tablet placement contract is absent.

- [ ] **Step 3: Implement explicit placement and fluid spacing**

Add `@media (max-width:1100px) and (min-width:721px)` placements, reset grid columns below 721px, replace the process ribbon's forced horizontal scrolling with wrapping, and introduce `--space-page`, `--space-panel`, and `--space-section` using `clamp()`.

- [ ] **Step 4: Run UI and full-browser responsive tests**

Run: `cd apps/web && npm test -- --run tests/ui.test.ts tests/legal-fly-village.test.tsx`
Then run the full browser script against a full-data local server.
Expected: all assertions pass at every target width.

- [ ] **Step 5: Commit**

```sh
git add apps/web/app/globals.css apps/web/tests/ui.test.ts scripts/legalfly_full_browser.py
git commit -m "Fix responsive Legal Fly chamber layout"
```

### Task 6: Integrate artifacts into Docker and production readiness

**Files:**
- Modify: `Dockerfile.web`
- Modify: `Dockerfile.web.dockerignore`
- Modify: `apps/web/scripts/export-legalfly-graph.mjs`
- Create: `apps/web/scripts/verify-minimind-assets.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tests/deployment.test.ts`
- Modify: `apps/web/app/api/health/readiness.ts`

**Interfaces:**
- Consumes: conversion CLI and artifact schema from Tasks 1–2.
- Produces: production image with verified same-origin MiniMind files and health metadata.

- [ ] **Step 1: Write failing deployment tests**

```ts
it("fails production verification without browser MiniMind artifacts", () => {
  expect(() => verifyMiniMindAssets(emptyDirectory)).toThrow(/MiniMind browser manifest/);
});

it("reports both graph and local-language artifacts ready", async () => {
  const response = createHealthResponse(completeFixtureRoot);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    services: { maleCns: "ready", miniMindArtifacts: "ready" },
  });
});
```

- [ ] **Step 2: Run deployment tests and verify RED**

Run: `cd apps/web && npm test -- --run tests/deployment.test.ts`
Expected: FAIL because MiniMind asset verification is absent.

- [ ] **Step 3: Add conversion build stage and fail-closed prebuild**

Extend the Docker conversion stage to acquire, verify, export, and copy MiniMind browser artifacts. Make `prebuild` invoke `verify-minimind-assets.mjs` under production/`LEGALFLY_REQUIRE_FULL=1`. Add immutable headers for content-addressed model files and revalidation for the manifest.

- [ ] **Step 4: Verify fixture and full Docker builds**

Run unit deployment tests, `npm run build` in fixture mode, then `docker build --file Dockerfile.web --tag legalfly-web:browser-minimind .`. Probe `/api/health`, manifest, and ranged model requests.

- [ ] **Step 5: Commit**

```sh
git add Dockerfile.web Dockerfile.web.dockerignore apps/web/scripts apps/web/package.json apps/web/tests/deployment.test.ts apps/web/app/api/health/readiness.ts
git commit -m "Ship verified browser MiniMind artifacts"
```

### Task 7: Documentation, security regression, and public acceptance

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `docs/METHOD.md`
- Modify: `docs/MINIMIND_SETUP.md`
- Modify: `docs/VERIFICATION.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/legalfly_full_browser.py`

**Interfaces:**
- Consumes: complete browser runtime and image.
- Produces: accurate operator/user documentation and CI/public acceptance evidence.

- [ ] **Step 1: Add failing full-journey and privacy checks**

Extend the browser script to record requests after entering a unique petition canary, assert the canary appears in no URL/request body, verify first-download progress, reload without model-byte downloads, ensure setup UI disappears in ready state, and complete both MiniMind and manual flows.

- [ ] **Step 2: Run against local full-data image and verify failures before final wiring**

Run: `QA_BASE_URL=http://127.0.0.1:3000 python -m scripts.legalfly_full_browser`
Expected before final CI wiring: failure on missing cached-reload or network-canary evidence.

- [ ] **Step 3: Update documentation and CI**

Replace local-helper instructions with browser download/cache behavior; document size, compatibility, privacy, clearing cached files, conversion provenance, parity results, action boundary, and troubleshooting. Cache source/conversion layers in CI and upload desktop/tablet/mobile screenshots plus measurements.

- [ ] **Step 4: Run complete verification**

Run:

```sh
python -m pytest -q
cd apps/web
npm test
npm run test:legalfly
npm run test:dream
npm run build
```

Build and run the full Docker image, execute `scripts/legalfly_full_browser.py`, then deploy and repeat against `https://thelegalfly.vercel.app`.

- [ ] **Step 5: Commit**

```sh
git add README.md DEPLOY.md docs .github/workflows/ci.yml scripts/legalfly_full_browser.py
git commit -m "Document and verify local browser MiniMind"
```

