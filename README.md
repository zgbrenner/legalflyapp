# The Legal Fly

Can a fly's brain wiring help spot sensitive text?

The Legal Fly turns connections reconstructed from part of a fruit fly brain into a computer model. A trained classifier flags patterns such as email addresses and private identifiers. Compare it with scrambled wiring, inspect real neuron IDs, and read the measured results.

This is a mathematical model, not a living fly, restored mind, full-brain simulation, or legal adviser. Brain shapes are illustrative; connection data and displayed model activity are real.

## The experiment

The homepage starts with a genuine synthetic **Recorded example**. Submitting a passage requests new server-side inference. Failed, cancelled or outdated requests cannot turn a recording into a fabricated live result. Both brain views use the same layout, camera, clock and brightness scale. Known examples show their expected label independently of the model's answer.

The default live API uses a lightweight hashing encoder. The research benchmark uses shared frozen MiniLM features. The interface identifies each configuration rather than treating the saved benchmark as the accuracy of every live request.

## Corrected science and result

Forward propagation uses the transpose of source-row adjacency. Random controls have exact directed edge counts. Degree controls preserve both degree sequences. Weight controls permute original weights. Graph identities, seeds and checkpoint compatibility are verified. Pre-v2 measurements are historical only.

`results/comparison_v2.json` contains 20 paired trials: ten training-data seeds crossed with two graph/input seeds, each with 120 training, 280 validation and 360 test examples. Each model family receives 18 validation candidates. Choices are saved before test scoring in `results/comparison_v2_selection.json`.

The fly models retain MiniLM features and add activity features. They do not replace MiniLM. The corrected run did not establish a fly advantage: mean macro F1 was 0.9457 for the fly hybrid, 0.9511 for MiniLM plus linear readout, and 0.9498 for MiniLM plus a small neural readout. Exact scores, random controls, individual trials and uncertainty are in the published artifact.

Intervals resample training-data-seed clusters. Paired permutation p-values are exploratory and unadjusted for multiple comparisons. The synthetic test shares template structure across splits and was used in earlier experiments. External validation is still needed.

## Run locally

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
printf 'NEXT_PUBLIC_API_URL=http://localhost:8000\n' > .env.local
npm ci
npm run dev
```

## Reproduce the research

```bash
mkdir -p .cache/research
cp deploy/research-inputs/minilm_embeddings.npz deploy/research-inputs/embedding_manifest.json .cache/research/
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.search
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m research.experiments.surgery
LEGALFLY_ENCODER=hashing OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python -m scripts.export_public
```

The frozen vector cache checks dataset hashes, vector shapes, finite values and every vector-array hash. The original producer did not record the encoder revision; that limitation is explicit. Janelia's original archive was independently downloaded, checksum-verified and rebuilt to match the packaged graph. The research refuses a synthetic graph substitute and does not overwrite serving checkpoints.

Lesions compare frozen hybrid and activity-only readouts without retraining or increasing surviving weights. A hybrid can preserve a prediction after every neuron is silenced because it retains text features. That is not biological resilience.

## Verify

```bash
LEGALFLY_ENCODER=hashing OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 pytest -q
cd apps/web && npm test && npm run lint && npm run build
```

With the built frontend and biological API running, use `python -m scripts.browser_smoke`. Chromium screenshots and checks are written outside the source tree. CI exercises desktop/mobile inference, input/network errors, playback, neuron inspection, 2D fallback, results, lesions and reduced motion.

## Deployment, provenance and limits

Use `DEPLOY.md` to deploy the API and frontend from the same release. The API image creates compatible readouts during its build, then disables runtime auto-training. A branch/PR does not certify the existing production host.

The bundled CC BY 4.0 Janelia FlyEM hemibrain v1.2 subgraph contains 3,072 neurons and 293,766 directed connections. It is neither the whole brain nor an intact learning circuit. Credit belongs to the reconstruction team and source authors. Region labels are coarse heuristics; UI coordinates are not microscopy.

Do not submit real client files, passwords or privileged material. Text is sent to a server. A negative score is not a safety guarantee. The live synthetic SSN example currently exposes a false negative; it has not been hidden or rewritten into a success.

See `docs/METHODOLOGY.md`, `docs/DATA_AND_LICENSING.md`, `docs/PRIVACY.md`, and `docs/KNOWN_LIMITATIONS.md`. Code and synthetic examples are MIT-licensed; biological data retain their original license. FlyWire execution and browser-side training are not implemented.
