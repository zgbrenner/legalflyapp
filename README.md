# The Legal Fly

Can a fly's brain wiring help spot sensitive text?

The Legal Fly turns connections reconstructed from part of a fruit fly brain into a computational circuit. A trained classifier reads its activity and flags patterns such as email addresses and private identifiers. Compare it with scrambled wiring, inspect actual neuron IDs, and read the measured results.

This is not a living fly, a restored mind, a full-brain simulation, or legal advice. Neural dynamics are simplified mathematics. The visual brain shape is illustrative, not reconstructed anatomy.

## Corrected science

Source-row adjacency is transposed for forward propagation. Random controls preserve exact edge counts; directed degree controls preserve both degree sequences; weight controls permute original weights. Seeds and graph fingerprints are deterministic. Checkpoints are versioned and checksummed. Old checkpoints are rejected.

All pre-v2 measurements are historical only. They used incorrect propagation/control implementations and are not evidence for the corrected model. The API will not serve them as current results.

## The MiniLM experiment

`results/comparison_v2.json` contains 20 paired trials: ten training-data seeds crossed with two graph/input seeds. Each uses 120 training examples, 280 validation examples, and 360 test passages from the existing synthetic legal-text dataset. Every model family receives 18 validation candidates. All choices are saved before the test is evaluated, in `results/comparison_v2_selection.json`.

The fly models are hybrids: they retain MiniLM features and add compact activity features. They do not replace MiniLM. Comparators are a linear readout, a small neural readout, random wiring, and degree-matched wiring. A hybrid improvement alone would not demonstrate a biological-topology advantage.

The initial corrected run did not beat the standard MiniLM classifiers. Read the published artifact for exact means, individual trials, per-class metrics and paired intervals. Intervals resample training-data-seed clusters rather than treating correlated trials as independent. Sign-permutation p-values are exploratory and unadjusted for multiple comparisons.

The test is synthetic, shares template structure across splits, and was used in earlier project experiments. Independent external replication remains necessary.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
mkdir -p data/processed
cp -R deploy/data/processed/hemibrain data/processed/
LEGALFLY_ENCODER=hashing OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 uvicorn apps.api.app.main:app --port 8000
```

In another terminal:

```bash
cd apps/web
npm ci
npm run dev
```

The live lightweight API uses hashing features, not MiniLM. The interface reports the encoder it actually receives. The research benchmark uses frozen `all-MiniLM-L6-v2` features. Missing MiniLM dependencies raise an error rather than silently substituting hashing.

The homepage initially shows a genuine saved inference, labeled **Recorded example**. Running the experiment submits a new request to the configured API. Failure never turns the recording into a fabricated live result.

## Reproduce research and public assets

```bash
pip install -e '.[research,dev]'
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.search
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.surgery
LEGALFLY_ENCODER=hashing OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m scripts.export_public
```

The embedding cache manifest verifies the encoder and SHA-256 hashes of all dataset splits. The search does not overwrite serving checkpoints. It refuses synthetic graph fallback.

The separate ablation diagnostic compares frozen hybrid and activity-only readouts. Disabled neurons receive no input. Surviving weights are not amplified after damage. Neither classifier is retrained. A hybrid can keep its prediction after all neurons are silenced because it retains text features; that is not biological resilience.

## Verification

```bash
LEGALFLY_ENCODER=hashing OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 pytest -q
cd apps/web && npm test && npm run build
```

For browser checks, start the Next frontend and API, install Playwright Chromium, then run `python -m scripts.browser_smoke`. Screenshots go to `/tmp/legalfly-qa`, not into the source tree. CI checks desktop/mobile inference, errors, playback, neuron selection, 2D fallback, result selectors, lesions and reduced motion.

## Deployment

Vercel project root: `apps/web`. Set `NEXT_PUBLIC_API_URL` to the HTTPS API origin and rebuild the frontend. Without this setting, the public site provides explicitly labeled recorded playback and bundled results, not pretend live inference.

Build the API using `Dockerfile.api`. Corrected readouts are trained once during image construction. Runtime auto-training is disabled; missing, mismatched or corrupted artifacts fail startup. Both Render and Fly configurations use `/ready` and restricted CORS. Add a preview origin explicitly when testing a Vercel preview against that API.

The limiter is per process, with bounded client state. Multiple instances require an additional shared or edge limiter. Reverse-proxy forwarding headers must only be trusted from the actual hosting proxy. Request bodies are bounded, errors do not echo submitted passages, and inference is serialized because reservoir state is mutable.

## Data, limitations and privacy

The bundled real graph is a high-degree subgraph: 3,072 neurons and 293,766 directed connections from Janelia FlyEM hemibrain v1.2, CC BY 4.0. It is not the full brain or an intact learning circuit. Region names use coarse cell-type heuristics. UI coordinates are illustrative; edges and activity come from the computational model. Rendering applies the same layout rule, camera, timing and intensity scale to both models.

Do not submit client files, passwords or privileged material to a public demo. Text is sent to a server, even though this application does not persist it. This does not guarantee anything about every hosting provider's infrastructure. Model scores are not calibrated guarantees of safety.

Code and synthetic examples: MIT. Hemibrain data: CC BY 4.0, attributed to Janelia FlyEM and Scheffer and colleagues. FlyWire is not bundled or simulated by this implementation. Full provenance remains in `docs/DATA_AND_LICENSING.md`.
