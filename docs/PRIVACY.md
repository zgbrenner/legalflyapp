# Legal Dreaming privacy

The new `/` laboratory reads, trains, simulates, and decodes in a dedicated browser worker. Imported teaching cards and models are read as local files. Application network requests fetch same-origin static assets, not the teaching text. No language-model service or inference API is used by this laboratory. There is no automatic persistence.

Notebook and model downloads include your teaching passages and annotations. Keep them confidential where appropriate. The notebook contains bounded sampled state traces, not an exhaustive biological recording. Hosting may still record ordinary static-asset requests and IP addresses; browser-local computation is not a promise of anonymity or a substitute for a deployment security review.

Reading and replay can be cancelled or paused. The worker cooperatively yields during training and stops advancing after a pause; leaving the route terminates it. Hidden tabs trigger pause. Do not add analytics, error payload collection, or session replay that captures user text.

## The browser-only MiniMind helper

The Legal Fly village at `/` offers an optional language helper, MiniMind, that runs only in your browser. It is a 63.9M-parameter model executed by ONNX Runtime Web inside a dedicated Web Worker on the page's own origin. There is no language-model service, no inference API, and no server-side petition processing.

What leaves your browser:

- If you select **Enable MiniMind**, the worker downloads six same-origin static files once: `/minimind/manifest.json` and five content-addressed model files, about 252 MB in total (exact sizes are listed in the manifest). These are ordinary static-asset requests. The model graph itself ships without the exporter's per-node metadata, so it carries no build-host file paths. Nothing is downloaded before you select the button, except that a later visit re-checks a copy already stored in this browser.
- The worker's own runtime files (ONNX Runtime Web glue and `.wasm` binaries) load from the page's origin as part of the application bundle; the Transformers.js CDN default is disabled.
- Nothing else. Petition text goes from the page to the worker as a structured message and is not placed in a URL, a fetch body, a log, `localStorage`, a Cache Storage key, or exported metadata. Transformers.js remote model loading is disabled (`env.allowRemoteModels = false`), and the worker's own cache refuses writes. Petition inference after the model is ready produces no network request.

What stays in your browser:

- The verified model files are kept in Cache Storage under `legalfly-minimind-browser-v1` so later visits do not download them again. Clearing site data removes them.
- Petition text is not persisted by the helper. Casebook and model exports contain user-entered material only when you explicitly export them.

Limits on what the worker accepts: every message must carry exactly the declared fields, petitions are limited to 1000 characters, and failures are reported with a fixed message that cannot echo petition text.

The helper only proposes the eight fact fields, which you must confirm, and afterwards selects the wording of the fly's already-fixed action from authored notes. It cannot choose or change the action.

Hosting still records ordinary static-asset requests and IP addresses. Browser-local computation is not a promise of anonymity. Do not enter real client information, passwords, privileged communications, or documents you are not authorized to share.

## Different boundary: the earlier classifier

The retained `/classification` feature uses a Python inference API and has the separate behavior below. The browser-only claim does not apply to that older route.


The Legal Fly is a public research demo. Do not submit real client information, passwords, privileged communications, or documents you are not authorized to share.

## Where text goes

The initial recording is a bundled synthetic passage and its actual saved model output. Replaying it does not submit a passage for inference. **Run the experiment** sends entered text to the configured API over HTTPS in production. This is server-side computation, not browser-only processing. The default live encoder uses local hashing features, not an external language-model API. Every result identifies its actual encoder.

## Application behavior

Classification routes do not write passages to disk or a database. Inference runs in memory. Normal model-service logs include model, character count, timing, and predicted sensitive/not-sensitive flag, but not passage text or fingerprints. Exception handlers record exception types, not submitted text. Validation errors omit rejected input. Feedback logs a boolean correctness flag, not arbitrary client strings.

Legacy fingerprint and redaction helpers remain in the source but classification does not use fingerprints as telemetry. `LEGALFLY_LOG_RAW_TEXT` controls the legacy defensive logging filter; it does not authorize request-body logging or cause classification to start logging passages. Leave it false.

There is no session-replay or text-analytics integration. Responses and activity remain in page memory. This does not guarantee that hosting providers, reverse proxies, operating systems, or future operators retain nothing. Infrastructure and the in-memory request limiter can process IP addresses.

## Cancellation and limits

**Cancel request** aborts the browser request and prevents its response from replacing the display. It does not guarantee that computation already started on the server has stopped. Text is bounded to 4,000 characters, request bodies are bounded, and POST requests have a per-process rate limit. Multiple instances require a shared or edge limiter.

## Operator requirements

Use HTTPS and exact allowed origins. Do not add body logging, session replay, or exception tools that capture payloads. Trust forwarded headers only from the real reverse proxy. Audit hosting logs and retention. Sensitive deployments need their own security and confidentiality review.

A negative prediction is not a guarantee that text is safe to share. Model scores are not calibrated safety probabilities. The Legal Fly does not determine legal privilege, satisfy a compliance obligation, or provide legal advice.
