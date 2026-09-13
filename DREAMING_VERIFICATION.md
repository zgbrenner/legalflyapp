# Legal Dreaming verification

Implementation branch: `feat/legal-dreaming`, based on corrected engine commit `69587dc87f7513f87d411335341f3bcd7681d398` from the existing unmerged PR #2. Main and the production deployment were not changed.

## Verified locally

- 38 existing Python regression tests pass.
- 12 existing frontend tests pass.
- 17 new Node engine tests pass using the actual packaged biological graph, not a synthetic stand-in.
- Production Next.js build, TypeScript checks, and lint complete successfully.
- Lossless browser export matches the original CSR pointers, indices, weights and node IDs, with the recorded biological fingerprint.
- The generated control preserves every node's incoming and outgoing degree, exact edge count, unique connections, and weight multiset.
- Three seeds, four cues, 256 steps per run measured on both biological and rewired graphs; raw data in `results/dreaming/diagnostics.json`.

The original Vite CommonJS configuration emits a deprecation warning during frontend tests. It does not fail the test suite.

## Browser evidence

Local Chromium navigation to localhost was blocked by an administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). No attempt was made to alter that policy. The repository's existing GitHub Actions browser job is used for production-build interaction tests and screenshots instead. Its script exercises real browser-side learning, actual connectome assets, cancellation, replay/silence, downloads/imports, controls, bad-checksum rejection, privacy canary checks and desktop/mobile layouts.

Browser results must be read from the corresponding completed CI run and `dream-checks.json` artifact. A successful local build alone is not browser verification.

## Scientific limits

The model learns an added numerical feedback map, not biological synaptic plasticity. Replay receives internal feedback but no new external text. Silence receives neither. The source graph is a 3,072-neuron subset, not a complete fly nervous system. The initial corpus is 16 fictional scenarios, not a library of court opinions.

The first diagnostic shows sustained feedback activity and quiet feedback-off decay. It does not demonstrate novel law, semantic legal understanding, or superiority of biological wiring. Label changes include abstention; the rewired control held the taught associations more consistently on these runs.

## Deployment and unverified boundaries

Production hosting, Safari, Firefox, physical iPhones, long background sessions, arbitrary private corpora, and whole-brain execution are not certified here. Existing API behavior is retained only for the earlier classifier. This change does not merge, publish, or promote production.
