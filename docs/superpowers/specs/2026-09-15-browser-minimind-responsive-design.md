# Browser MiniMind and Responsive Chamber Design

## Status

Approved in chat on 2026-09-15. This document defines the implementation contract for moving the optional MiniMind language helper entirely into the visitor's browser and clarifying the Legal Fly chamber workflow.

## Goals

- Process petition text only on the visitor's device.
- Require no local Python service or separate installation.
- Download MiniMind only after an explicit user action, then reuse the verified cached model on later visits.
- Remove the setup notice after the cached model has loaded successfully.
- Explain what MiniMind does, what the fly does, and what the visitor should click next in plain language.
- Make the chamber usable while continuously resizing between mobile, tablet, and desktop widths.
- Preserve the existing action boundary: MiniMind may propose facts and choose an authored rendering, but it may not choose or alter the fly's recommendation.

## Non-goals

- MiniMind will not provide legal advice or generate unrestricted prose.
- Petition text will not be proxied through Vercel, Render, Hugging Face, or another server.
- The biological MaleCNS graph and its trained readout will not be replaced or modified.
- The browser model will not silently download before the visitor opts in.
- The existing Python adapter will not remain part of the hosted user journey. It may remain as a conversion and parity reference.

## Architecture

### Model artifact

The canonical source remains `jingyaogong/minimind-3` at revision `f92512d4cd6142fa9acc0d6022375049a8974bf6`. Its configuration identifies `Qwen3ForCausalLM` with 63,912,192 parameters.

A reproducible conversion tool will:

1. Download only the allow-listed files from the pinned revision.
2. Verify the existing source weight SHA-256 before conversion.
3. Export a browser-compatible ONNX graph that exposes both causal-language-model logits and the final hidden representation required by the current readouts.
4. Quantize the graph for browser delivery, preferring 4-bit weights if parity passes and otherwise using 8-bit weights.
5. emit a versioned manifest containing the source revision, source and artifact hashes, byte sizes, tokenizer files, quantization, expected outputs, and schema version.
6. Fail the production build when required artifacts are absent, truncated, or inconsistent with the manifest.

The implementation must not claim equivalence merely because conversion succeeds. It must compare browser-runtime outputs against the pinned Python adapter on fixed fixtures before selecting the production quantization.

### Browser runtime

MiniMind will run in a dedicated module Web Worker so model download, initialization, embedding, and scoring do not block the React rendering thread. The worker will use Transformers.js/ONNX Runtime Web.

Runtime selection:

- Prefer WebGPU when the browser exposes a compatible adapter and the model initializes successfully.
- Fall back to WASM when WebGPU is unavailable or initialization fails.
- Report a plain-language unsupported state if neither backend works.
- Keep only one initialized MiniMind runtime per page and dispose it when the worker is terminated.

The browser adapter will port the existing constrained operations:

- petition embedding and teaching-only field centroid readouts;
- action-locked counsel-note candidate scoring;
- the independent MiniMind benchmark control;
- strict enum and receipt validation.

Centroid artifacts should be generated during the conversion/build step from the locked teaching cases. Browsers will verify and load them rather than fitting them on every visit. This reduces startup work and makes parity reproducible.

### Artifact delivery and caching

Versioned MiniMind files will be served from the same Render web origin as the application. They will use content-addressed filenames and long-lived immutable caching. The small manifest will use revalidation.

The worker will download only after the visitor selects **Enable MiniMind**. It will report per-file and aggregate progress. Browser Cache Storage is the canonical persisted cache; the manifest version and hashes determine whether a cached set is usable.

State rules:

- `available`: compatible browser, model not downloaded;
- `downloading`: explicit download in progress, with progress and cancel;
- `verifying`: all bytes downloaded, integrity checks running;
- `loading`: verified model initializing on WebGPU or WASM;
- `ready`: inference passed a health fixture; the setup notice is removed;
- `cached`: model was found locally and is being restored;
- `unsupported`: browser cannot run the available backends;
- `failed`: download, integrity, initialization, or inference failed, with retry and manual fallback.

On a later visit, the app may automatically restore and initialize a verified cached model. It must not re-download the model without an explicit retry/update action. A successful ready state displays only a compact `MiniMind ready · runs on this device` indicator. Clearing site data removes the cached model.

## Privacy and security boundary

- Petition strings are sent only from the React page to the same-origin MiniMind Web Worker using structured messages.
- The worker must not call any inference API or include petition text in URLs, analytics, logs, error telemetry, localStorage, Cache Storage keys, or exported model metadata.
- Network tests must demonstrate that inference after model readiness sends no petition-bearing request.
- Model artifacts may be requested from the same origin; runtime remote-model loading must be disabled.
- Worker messages and returned objects must be schema-validated. Unknown message types and undeclared fields fail closed.
- Existing confirmation remains mandatory because MiniMind's complete eight-field parse is not reliably correct.

## User experience

### Plain-language setup

Replace the current hosted-page warning with a task card near the petition controls:

> Optional language helper
>
> MiniMind can suggest the eight fact choices from a petition. Download it once and it runs only in this browser. Your petition stays on this device. You will review every suggestion before the fly sees it.

Primary action: **Enable MiniMind**. Secondary action: **Continue with manual facts**.

During download, show transferred size, percentage, and **Cancel download**. During initialization, say which local engine is being tried without exposing implementation jargon as the headline. On failure, explain the next action: retry, use manual facts, or try a current Chromium-family browser.

### Guided chamber flow

The chamber will expose a numbered progress guide:

1. Enable the optional local language helper, or continue manually.
2. Teach the fly's readout from the fictional ledger.
3. Choose or write a petition and confirm all eight facts.
4. Ask the fly for a recommendation.

Only the current actionable step receives primary visual emphasis. Disabled controls include nearby explanatory text rather than relying on reduced opacity. Existing labels such as `Teach the ledger` and `Hear the case` may remain for character, but supporting text must explain their effect in ordinary language.

MiniMind readiness is not required for the manual path. Graph loading, model teaching, petition selection, fact confirmation, and hearing remain distinct states.

## Responsive layout

The confirmed 721–1050px defect comes from conflicting grid placement rules. The chamber grid will use explicit placements at every breakpoint:

- Above 1100px: docket, petition, and counsel note use the intended desktop columns.
- 721–1100px: docket occupies the narrow first column, petition occupies the flexible second column, and counsel note spans the row below.
- 720px and below: all panels stack in reading order with no inherited grid-column placement.

Spacing will use a small set of responsive custom properties based on `clamp()` rather than unrelated fixed values. Controls may wrap, but primary actions must remain full-label, visible, and at least 44 CSS pixels high. No content may cause document-level horizontal overflow at widths from 320px through 1440px. The process guide may wrap into rows rather than requiring horizontal scrolling.

The neural inspector retains its existing desktop, two-column, and stacked modes, but will be exercised with loaded anatomy rather than only the empty state.

## Components and files

Expected implementation areas:

- conversion/export tooling under `tools/`;
- generated manifest/readout schema and deployment build stages;
- a browser MiniMind worker under `apps/web/public/minimind/` or a TypeScript worker entry bundled by Next.js;
- a typed browser adapter replacing hosted use of `apps/web/lib/minimind.ts`;
- MiniMind setup/progress UI and guided-step semantics in `LegalFlyVillage.tsx`;
- responsive rules and spacing tokens in `globals.css`;
- documentation updates to `README.md`, `DEPLOY.md`, `METHOD.md`, `VERIFICATION.md`, and MiniMind setup documentation.

Exact file placement may change during implementation if the bundler requires a different worker boundary, but the privacy, cache, schema, and action constraints may not.

## Error handling

- A failed MiniMind operation never blocks manual facts or substitutes invented values.
- Partial downloads are not marked ready and may be discarded safely.
- Integrity failure evicts the bad artifact set and requires explicit retry.
- WebGPU initialization failure is allowed one WASM fallback attempt.
- Out-of-memory or worker termination produces a recoverable message and returns the UI to manual mode.
- A model version change is presented as an optional update; the current verified cache remains usable unless its schema is incompatible.
- MaleCNS graph failure and MiniMind failure remain visually and operationally separate.

## Testing and acceptance criteria

### Conversion parity

- Source revision and SHA verification fail closed.
- ONNX logits rank every locked counsel-note candidate identically to the Python adapter on the parity fixture set, or documented tolerances identify and reject an unsuitable quantization.
- Browser embeddings produce the same field and benchmark labels as the Python adapter on all locked teaching and held-out fixtures. Numeric cosine/logit tolerances are recorded.
- Artifact manifests, sizes, and hashes validate in CI and in the browser worker.

### Browser behavior

- No MiniMind artifact request occurs before **Enable MiniMind**.
- First enable shows progress, verifies, initializes, and reaches ready.
- Reload restores the verified cache without downloading model bytes again.
- The setup notice is absent in ready state and a compact local-ready indicator is visible.
- Clearing or corrupting the cache returns to a truthful setup/retry state.
- WebGPU and WASM paths are covered where CI/browser capabilities allow.
- Petition inference produces no network request containing petition text.
- Manual facts work in every unavailable, downloading, unsupported, and failed state.

### Responsive and journey validation

- Exercise 1440, 1101, 1100, 1024, 721, 720, 390, and 320 pixel widths.
- Resize continuously across the 1100 and 720 breakpoints and assert that the petition panel never enters the docket column accidentally.
- Assert no horizontal document overflow and no clipped primary action.
- Complete: enable cached MiniMind -> teach ledger -> choose petition -> accept/edit suggestions -> hear case -> file case.
- Repeat the core flow with MiniMind disabled using manual facts.
- Capture desktop, tablet, and mobile screenshots plus console/page-error logs.

## Deployment

The Render web image will build or copy the pinned browser artifacts and serve them from versioned same-origin paths. `/api/health` will continue to describe the MaleCNS asset readiness; MiniMind artifact readiness will be represented in its own manifest and verified client-side. The Vercel entry URL will continue redirecting to the canonical Render web origin until a separate CDN architecture is adopted.

The release is not complete until the public URL passes the full browser journey and a ranged request for each required MaleCNS and MiniMind artifact succeeds.

