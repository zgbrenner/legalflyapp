# The Village Lawyer Implementation Plan

**Goal:** Replace the old hemibrain application with an end-to-end fictional village-law office using the complete classified MaleCNS graph.

**Architecture:** Official data are verified and packaged at build time. A browser worker runs the full sparse rate network, and a separately trained artificial ridge readout chooses advice. UI, notes, casebook and audit stay local.

**Tech stack:** Standard browser ES modules, Node 22 standard library, Python with NumPy and PyArrow for source preparation, Playwright for real browser tests.

**Spec:** ../specs/2026-09-14-village-lawyer.md

## Execution

- [x] Inspect original repository and create isolated codex/village-lawyer branch.
- [x] Inspect official schemas and verify all three source files and their checksums.
- [x] Write failing feature/engine/selection tests; implement deterministic facts, charter, split and complete-graph reservoir.
- [x] Prepare every classified neuron and every edge between selected endpoints. Record coverage, source hashes, generated hashes, transmitters and sampled soma positions.
- [x] Fit the starter using actual full-network states. Run fixed-seed held-out biological, direct, shuffled-label and severed controls.
- [x] Add real browser worker commands, progress, cancellation, model validation and bounded teaching.
- [x] Build the office, editable petitions, local casebook, neural inspector and audit views.
- [x] Run local unit and actual full-graph tests.
- [ ] Complete browser interaction and visual verification in GitHub Actions; inspect desktop and mobile screenshots.
- [ ] Publish ready-to-run artifact after tests pass and open a reviewable pull request.

All old runtime source is removed in the replacement tree but remains in Git history. No website is publicly deployed and no paid infrastructure is provisioned.
