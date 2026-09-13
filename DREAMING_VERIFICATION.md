# Legal Dreaming verification

Implementation branch: `feat/legal-dreaming`, based on corrected engine commit `69587dc87f7513f87d411335341f3bcd7681d398` from the existing unmerged PR #2. Main and production were not changed. Pull request: https://github.com/zgbrenner/legalflyapp/pull/3

## Verified locally

- 38 existing Python regression tests pass.
- 13 frontend tests pass, including stable accessible names for the new controls.
- 17 new Node engine tests pass using the actual packaged biological graph, not a synthetic stand-in.
- Production Next.js build, TypeScript checks, and lint complete successfully.
- Lossless browser export matches the original CSR pointers, indices, weights and node IDs, with the recorded biological fingerprint.
- The generated control preserves every node's incoming and outgoing degree, exact edge count, unique connections, and weight multiset.
- Three seeds, four cues, 256 steps per run measured on both biological and rewired graphs; raw data in `results/dreaming/diagnostics.json`.

## Browser evidence

Local Chromium navigation was administrator-blocked. The existing GitHub Actions browser job runs the production build instead, using the real browser worker and biological assets. Read the latest completed run and `dream-checks.json` in its `browser-evidence` artifact for the exact checks reached and measurements, rather than treating compilation or configured tests as a browser pass.

The first run, 34744936421, passed all 12 legacy classifier checks, graph loading and corpus-import/cancellation checks, then caught a reading-set label mismatch. Explicit accessible names and the mobile viewport setup were corrected in the follow-up commit. Results of subsequent runs are linked in PR #3.

The browser script covers training, pause/resume, replay/silence, model/notebook downloads, import rejection and round trips, genuine matched-size controls, checksum failure, a network privacy canary, method disclosures, desktop/mobile layout and reduced motion. The visibility check tests the event handler, not physical-device background scheduling.

## Scientific limits

The model learns an added numerical feedback map, not biological synaptic plasticity. Replay receives internal feedback but no new external text. Silence receives neither. The source graph is a 3,072-neuron subset, not a complete fly nervous system. The initial corpus is 16 fictional scenarios, not a library of court opinions.

The first diagnostic shows sustained feedback activity and quiet feedback-off decay. It does not demonstrate novel law, semantic legal understanding, or superiority of biological wiring. Label changes include abstention; the rewired control held the taught associations more consistently on these runs.

## Deployment and unverified boundaries

The existing Vercel integration builds a branch preview. This is not a production promotion or a direct runtime verification of that hosted URL. Safari, Firefox, physical iPhones, long background sessions, arbitrary private corpora and whole-brain execution are not certified here. The earlier classifier still uses its API.

The inherited npm lockfile emitted seven audit findings during installation (four moderate, two high, one critical). Their exact dependency paths and exploitability have not been triaged here. A successful build is not a security clearance; investigate these before production use. No force-upgrade was applied.
