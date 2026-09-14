# Verification record

## Actual full-network measurement

Run: https://github.com/zgbrenner/legalflyapp/actions/runs/34887003923

Application commit: `b53293aea7ff6c346b027f88375d72ba19c8c4cd`. Measured on September 14, 2026, with Node 22.23.2 on the GitHub-hosted Ubuntu runner. These measurements used the real checksum-pinned compiled MaleCNS graph, not the small mechanical test fixture.

Graph: 166,700 annotated neurons; 25,582,938 directed connections; 205,997,124 bytes; SHA-256 `177b379c324efb0385f77b221a5eb81558e202364ccdb296f93976de37d557f3`.

All 12 mechanical tests passed. Full-graph checks passed for checksums, exact retained coverage, deterministic inference, mid-run cancellation, readout training, model export/import, foreign-graph rejection, readout correction, and disconnected-input isolation. One trial traversed 306,995,256 edges. The probe produced non-input feature norm 1.0975921718199926 and 144,622 units above absolute activity 0.000001 on its last step. These units are model activations, not measured biological firing.

| Freshly trained readout | Correct / held out | Accuracy | Non-abstained coverage |
| --- | --- | --- | --- |
| Complete MaleCNS activity | 28 / 32 | 87.5% | 96.875% |
| Input-only classifier | 29 / 32 | 90.625% | 96.875% |
| Disconnected control | 4 / 32 | 12.5% | 0% |

The benchmark took 47.073 seconds on that runner; the complete integration script took 79.624 seconds. These are observed test durations, not performance promises for another computer. The biological topology did not outperform the input-only baseline. The holdout contains 32 different combinations of authored fictional facts, not independent legal cases. No rewired-topology control or independent raw-connectome audit was performed.

## Browser and deployment checks

The same commit passed the static production build and received a successful Vercel deployment status. Its first Chromium run successfully loaded and trained the actual graph, heard cases, corrected the readout, cancelled retraining while preserving the previous model, reimported a model, rejected a foreign model, and saved two cases. That run then stopped on a Python test-harness error (`Locator.first` was incorrectly called as a method), so it was not a passing complete browser suite.

The revised `tests/browser.py` fixes that assertion and additionally runs the full comparison through the browser worker, verifies exported results, captures mobile/desktop views, and checks runtime errors and unwanted network writes. The GitHub Actions result for the current PR commit is authoritative for the complete browser-suite status. Reports and full-resolution screenshots are saved in the `full-male-cns-evidence` artifact; a successful run also packages the complete `dist/` directory as `village-lawyer-static-site`. Do not infer a passing run from the existence of this test code.

Preview: https://legalfly-git-feat-village-lawyer-zachary-brenners-projects.vercel.app

Pull request: https://github.com/zgbrenner/legalflyapp/pull/6

The local editing environment did not permit Chromium to navigate to localhost. Browser evidence therefore comes from the actual GitHub-hosted Chromium run, not a claimed local preview or synthetic substitute.
