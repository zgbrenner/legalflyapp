# Privacy

LegalFly may receive text that looks like sensitive information. Treat all
user-submitted content as confidential.

## Defaults

- **Submitted text is not persisted** to disk or a database.
- Classification runs in-memory and returns a response.
- Server logs record only **metadata**: model id, character count, coarse timing, and a short **hash fingerprint** of the text.
- Raw text logging is disabled unless `LEGALFLY_LOG_RAW_TEXT=true` (discouraged).
- Error handlers redact emails, phone-like strings, and digits before logging.
- No third-party analytics are attached to submitted content in the default app.
- Optional YES/NO feedback stores correctness flags only — never the original passage.

## Operator checklist

1. Keep `LEGALFLY_LOG_RAW_TEXT=false` in production.
2. Do not add request-body logging middleware.
3. If you add persistence, require explicit opt-in and document retention.
4. Prefer on-prem / local deployment for highly sensitive corpora.
5. Review reverse proxies and APM tools so they do not capture POST bodies.

## User-facing statement

The UI states:

> Submitted text is not saved by default.

## API notes

- `POST /classify` and `POST /simulate` accept text and return predictions.
- `POST /feedback` accepts `{ correct, model, predicted_labels, fingerprint }` only.