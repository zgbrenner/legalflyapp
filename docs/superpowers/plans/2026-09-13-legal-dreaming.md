# Legal Dreaming implementation

Goal: remake the homepage around a real browser-side associative replay experiment, using the existing corrected hemibrain topology and preserving the prior classifier research.

## Design and boundaries

The previous conversational proposal is the approved product direction. A fixed fading-memory reservoir cannot learn autonomous dynamics merely by labeling its states. Implement two explicitly different modes: silent decay (zero input, no feedback) and trained replay (no external text, but an artificial learned numerical feedback map). No LLM, hard-coded dream timeline, claim of fly sleep, or invention-of-law detector. Decoder can abstain, and inactivity is reported as inactivity.

Keep the 3,072 neurons and all 293,766 directed connections in the packaged biological graph. Port its leaky tanh recurrence, with correct source-to-destination propagation, into a worker. A dependency-free build script exports existing NPZ assets and records hashes. It must reject graph drift and never substitute a synthetic graph. Rewired controls remain labeled controls, not biology.

The reading corpus starts with clearly fictional legal teaching cards, not full court opinions. Users can import their own bounded JSON corpus locally. Feedback learns numerical associations; semantic labels never feed the recurrence. A nearest-state atlas only annotates activity, subject to energy, similarity and margin gates. A near-zero state never becomes a dream because cosine normalization amplified it.

Preserve the ivory, ink and oxblood visual system and existing brain renderer. Homepage becomes the reading room and live notebook. Prior classifier, scores and ablations remain separate. All new computation, training, import and export stay in a worker; no submitted content is fetched or posted. Pause/cancel aborts or yields, and route unmount terminates the worker.

## Execution checklist

- [ ] Write failing directed-propagation, silence, learning, decoder abstention, deterministic replay and import validation tests.
- [ ] Export checksummed binary CSR graphs from the packaged NPZ. Compare all entries with Python/SciPy.
- [ ] Implement deterministic numerical encoding, trained feedback, zero-input baseline and bounded model/trace export in a dependency-free worker core.
- [ ] Implement cancellable training/loading, pause/resume, same-seed controls and safe validated import.
- [ ] Add reading-room UI, real live brain activity, notebook and explanatory method page; relocate prior classifier.
- [ ] Test actual biological data on desktop and mobile, including error/cancellation and download/upload paths.
- [ ] Record measured behavior without selecting flattering scores; build/lint/regression check; publish code on an isolated branch and open a PR.

## Test criteria

The biological asset must match the existing graph fingerprint and all CSR entries. Directional unit test: source activity reaches only the destination. Same seed and same trained model reproduce the same numeric states. Silent mode records external and feedback drive exactly zero. Readout learning must reduce actual training reconstruction error; thinned-card recognition is separately labeled as a non-independent diagnostic; no novelty claim follows from that. Invalid model version, graph, dimensions, nonfinite values, unknown mode and excessive corpus size are rejected. A stale cancelled generation cannot overwrite a new session. No requests contain entered teaching text. Browser controls must work at 1440px and 390px, with reduced motion and no horizontal overflow.
