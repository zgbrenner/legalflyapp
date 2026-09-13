# The Legal Fly: verification record

Verified application commit: `dfac9277470535ecb1574d25efe26d6d7a122049`.
Browser/build workflow: https://github.com/zgbrenner/legalflyapp/actions/runs/34737183700
Evidence artifact: `legalfly-browser-evidence`, ID `10310859524`.
Artifact SHA-256: `2b899600a7e463aa0119f16d6a2c8f54d0fe9e4d66048f819375b162bea1f189`.

The final documentation/temporary-workflow cleanup does not change application behavior. The retained read-only CI repeats tests and browser verification on pull requests. Temporary source-writing/recovery workflows have been removed; normal builds do not depend on expiring workflow artifacts.

## Passed

- 38 Python tests, including directed propagation, exact random graph controls, immutable graph/checkpoint identity, model metadata, embedding integrity, statistics and API behavior.
- 12 frontend tests, including cancellation, stale-science rejection and truthful expected-label feedback.
- Frontend lint and optimized production build using the committed Next 15.5.24 / React 19.2.8 dependency lock.
- Twelve browser checks in Chromium at 1440x1000 and 390x844, with the real local biological API, not mocked predictions.

Browser checks: homepage identity and genuine recorded playback; actual email inference; shared pause; shared rotation and keyboard-accessible neuron inspection; real-data 2D fallback; blank-input rejection without clearing the previous result; explicit network failure; real results and paired-trial controls; measured lesion selection and hybrid/activity-only comparison; legacy comparison redirect; mobile without horizontal overflow and reduced-motion pause; no JavaScript exceptions or framework overlay.

Screenshots retained in the artifact: `desktop.png`, `experiment.png`, `mobile.png`, `results.png`, `ablations.png`. The automated results screenshot can show the focused accessibility skip link; it is not a permanent overlay.

## Biological data verification

Independent reproduction downloaded the original Janelia adjacency archive, checked SHA-256 and rebuilt exactly the packaged 3,072-neuron, 293,766-directed-connection graph. See `deploy/research-inputs/hemibrain-provenance.json`. All displayed activity uses this real subgraph or explicitly identified randomized controls. The illustrative bilateral layout is not EM anatomy.

The science reproduction passed in workflow https://github.com/zgbrenner/legalflyapp/actions/runs/34736567501 before that run's subsequent dependency-install failure. The dependency issue was separately corrected and the complete application passed the later verification run linked above. No failed run is being presented as an entirely successful one.

## Measured research result

Twenty paired trials, 120 training examples, shared frozen MiniLM vectors, equal validation budgets. Mean macro F1:

| Model | Mean macro F1 |
|---|---:|
| Fly hybrid | 0.9457395654 |
| Random-wiring hybrid | 0.9462348985 |
| Degree-matched hybrid | 0.9457353599 |
| MiniLM + linear readout | 0.9510641721 |
| MiniLM + small neural readout | 0.9497754508 |

No fly superiority was established. The hybrids retain MiniLM text features, so they are not a fly replacing MiniLM. The paired comparison to the small neural baseline favors that baseline under the exploratory unadjusted test; other evidence remains inconclusive. See `results/comparison_v2.json` and the validation-choice manifest for exact trials and limitations.

## Disclosed failure and boundaries

The live hashing configuration misses the planted SSN-format number in the synthetic **A private number** example; all three classifiers return NONE. The example remains in the UI with an expected-label miss notice. Do not use this research demo as a privacy gate. See `docs/KNOWN_LIMITATIONS.md`.

The public production frontend/API have not been promoted or certified by these checks. Both must be deployed from the same corrected release. Destination Docker execution, hosting limits, reverse proxy, cold starts, privacy of provider logs, Safari, Firefox and physical iPhones were not verified. Mobile verification is a Chromium viewport test. Cancellation aborts the client request and prevents stale rendering, not guaranteed server-compute interruption.

The experiment uses a hemibrain subgraph, not the whole fly. Full FlyWire execution, browser-side training and user model import are not implemented. Region routing is heuristic, not a validated mushroom-body learning circuit. Synthetic benchmarks are not external real-document validation.
