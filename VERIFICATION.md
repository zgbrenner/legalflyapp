# Verification record

## Verified before the first complete application commit

- Official source-download and checksum inspection: successful GitHub Actions run [34884063206](https://github.com/zgbrenner/legalflyapp/actions/runs/34884063206).
- Full classified graph preparation: successful run [34884604025](https://github.com/zgbrenner/legalflyapp/actions/runs/34884604025). Counts: 166,700 neurons; 25,582,938 directed pairs; 124,177,617 represented synaptic contacts; 217 isolates.
- Local Node 22 unit suite: 11 passing tests. Python selector suite: 2 passing tests.
- Actual complete-graph verification: deterministic repeated inference, zero-stimulus silence, disconnected non-input readout, cancellation, teaching changes readout weights, model hash check, audit reconciliation.
- Initial fixed-seed held-out audit: biological 20/24, direct facts 20/24, shuffled labels 3/24, severed 3/24. Training recognition 42/48. No biological advantage established.
- Initial Node full-graph test RSS at reporting: approximately 295 MB. This is not browser peak memory or a device compatibility guarantee.

## Browser status at this commit

The local browser refused localhost navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. No security policy was bypassed. Browser verification is performed by `.github/workflows/village.yml` in GitHub Actions, with actual data and no mock neural results. Inspect the workflow's final result and `village-lawyer-verification` artifact for completed checks, console errors, screenshots and measured browser scores. This initial record does not pre-claim a passing browser result.

The suite covers full graph loading, inference, explicit teaching, model export/import and rejection, starter reset, cancellation, full 24-case audit, casebook round trips, custom text, safe text rendering, desktop 1440 x 1100 and mobile-layout 390 x 844, and absence of external or body-bearing network requests. Mobile layout testing in desktop Chromium is not a low-memory phone hardware test. Safari and Firefox are not yet certified.

## Visual brief and intentional deviations

The approved product is an interactive office inspired by Brueghel, not a generic dashboard. The original public-domain painting is used rather than an AI imitation. The small fly line drawing is a UI emblem. Neural points use sampled source soma coordinates and actual activity, not invented motion. The visual brief uses parchment `#f0ebde`, ink `#282920`, oxblood `#733c32`, olive `#394134`, serif headings, fine rules and square-edged forms. Browser screenshots must be inspected before claiming visual completion.

## Reproduction

See README.md. Full build and test outputs are generated afresh by CI. The ready-to-run artifact is uploaded only after the browser suite passes; screenshots and diagnostics are uploaded on failure too. No public website is deployed.
