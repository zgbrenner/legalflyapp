# Privacy and the public experiment

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
