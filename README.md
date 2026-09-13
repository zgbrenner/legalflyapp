# LegalFly

We cut wiring out of a dead fruit fly and asked it to smell secrets in legal text.

LegalFly is an open-source Frankenstein experiment: Drosophila connectome topology, reanimated as a reservoir computer for sensitive-information detection.

![LegalFly interface](docs/screenshot.svg)

> **Scientific framing:** This tests whether biological neural connectivity provides useful inductive structure for low-parameter text classification. LegalFly does **not** restore a mind, simulate consciousness, understand law, or provide legal advice. When hemibrain tissue is loaded, edges are real Janelia FlyEM connectivity (CC BY). The gothic tone is aesthetic; the metrics are measured.

## Why this exists

The strange-but-legitimate research question:

**If you steal the wiring diagram of a fly brain, freeze most of it, and train only a thin readout — does that stolen biology help classify legal/compliance text better than matched random corpses?**

Pipeline:

```
Legal text
  → text encoder
  → fixed-dimensional representation
  → temporal / neural input encoding
  → fruit-fly connectome reservoir (mostly fixed)
  → reservoir activity
  → small trainable readout
  → classification
```

Task #1: **sensitive-information detection** (`EMAIL`, `PHONE`, `SSN`, `CREDENTIAL`, `NONE`, …).

## Real tissue vs demo corpse

| Mode | What it is | License |
|---|---|---|
| **Hemibrain research** (preferred when built) | Surgical high-degree subgraph (~3072 neurons) from Janelia hemibrain v1.2 traced adjacencies | CC BY 4.0 |
| **Demo** | Synthetic modular graph | MIT |

```bash
make fetch-hemibrain   # ~44MB compact adjacency tables
make build-hemibrain   # surgical subgraph + random controls
make train-hemibrain   # train readout on real tissue + compare/ablate
```

Processed hemibrain graphs live under `data/processed/hemibrain/` (gitignored; rebuild locally).

## Measured training update (harder set + MiniLM)

### Full-data ceiling (seeds 42–43)
| Model | Macro F1 |
|---|---|
| Degree-matched random | ~0.985 |
| Random Erdos–Renyi | ~0.984 |
| Linear (MiniLM readout) | ~0.982 |
| Hemibrain connectome | ~0.981 |

On the full harder set, scores are still near ceiling and biology does **not** beat matched random.

### Few-shot headroom (`--max-train 160`, seeds 42–43)
| Model | Macro F1 | Binary F1 |
|---|---|---|
| Linear | ~0.964 | 1.000 |
| Hemibrain connectome | ~0.947 | 0.983 |
| Degree-matched random | ~0.937 | 0.974 |
| Random Erdos–Renyi | ~0.934 | 0.975 |

With scarce labels, the stolen wiring **does** beat random twins — but the thin linear MiniLM readout still wins overall. Use `make train-fewshot` to reproduce.

### Few-shot @ 120 labels × 3 seeds (MiniLM)
| Model | Macro F1 | Binary F1 |
|---|---|---|
| Linear | ~0.935 | ~0.991 |
| Hemibrain connectome | ~0.902 | ~0.969 |
| Random Erdos–Renyi | ~0.898 | ~0.968 |
| Degree-matched random | ~0.893 | ~0.962 |

With fewer labels, biological topology keeps a thin edge over random twins; linear MiniLM still leads. Reproduce: `make train-fewshot`.

### Few-shot @ 80 labels × 5 seeds (MiniLM)
| Model | Macro F1 | Binary F1 |
|---|---|---|
| Linear | ~0.897 | ~0.949 |
| Hemibrain connectome | ~0.842 | ~0.925 |
| Random Erdos–Renyi | ~0.835 | ~0.917 |
| Degree-matched random | ~0.831 | ~0.912 |

Scarcer labels widen the gap a little: connectome stays ahead of both random twins; linear MiniLM still leads. Artifact: `results/comparison_fewshot_80.json`.

### Few-shot @ 60 labels × 6 seeds (MiniLM)
| Model | Macro F1 | Binary F1 |
|---|---|---|
| Linear | ~0.847 | ~0.914 |
| Degree-matched random | ~0.797 | ~0.881 |
| Connectome | ~0.796 | ~0.879 |
| Random Erdos–Renyi | ~0.796 | ~0.878 |

At 60 labels the biological edge collapses into noise — connectome and random twins are statistically tied; linear MiniLM still leads. Artifact: `results/comparison_fewshot_60.json`.

### Few-shot @ 120 labels × 3 seeds (hashing encoder)
| Model | Macro F1 |
|---|---|
| Linear | ~0.926 |
| Random Erdos–Renyi | ~0.858 |
| Degree-matched random | ~0.849 |
| Hemibrain connectome | ~0.839 |

With hashing features, random twins beat biology. Topology help is encoder-dependent — not a universal win.

### Few-shot @ 80 labels × 5 seeds (hashing encoder)
| Model | Macro F1 | Binary F1 |
|---|---|---|
| Linear | ~0.893 | ~0.963 |
| Degree-matched random | ~0.795 | ~0.924 |
| Random Erdos–Renyi | ~0.792 | ~0.922 |
| Hemibrain connectome | ~0.774 | ~0.914 |

Same story under scarcity with hashing: random twins beat biology. Artifact: `results/comparison_hashing_fewshot_80.json`.


## Architecture

```
apps/web      Next.js research demo (classify, compare, ablate, benchmark)
apps/api      FastAPI inference + artifact serving
research/     datasets, encoders, reservoirs, baselines, experiments
data/demo     redistributable synthetic graph + synthetic PII benchmark
data/raw      downloaded hemibrain tables (ignored)
data/processed  built reservoirs (ignored)
results/      measured experiment JSON (never fabricated UI numbers)
```

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

make generate-data
# Optional but recommended for the Frankenstein path:
make train-hemibrain

make api
# → http://localhost:8000/health

cd apps/web && npm install && npm run dev
# → http://localhost:3000
```

Or: `docker compose up --build`

## Research commands

```bash
python -m research.experiments.run --model connectome --seed 42
python -m research.experiments.run --model all --seed 42
python -m research.experiments.compare --seeds 42,43,44
python -m research.experiments.ablate --seed 42
```

## Web routes

| Route | Purpose |
|---|---|
| `/` | Twin chamber: real tissue vs random twin |
| `/benchmark` | Autopsy table of measured scores |
| `/compare` | Real tissue vs randomized twin |
| `/ablate` | Destroy the brain |
| `/methodology` | How we borrow the dead |
| `/about` | What this is / is not |

## Privacy

Submitted text is **not saved by default**. Logs store fingerprints/metadata only. Details: `docs/PRIVACY.md`.

## Licensing

- Code: MIT (`LICENSE`)
- Demo graph + synthetic dataset: MIT
- Hemibrain import: CC BY 4.0 (download separately; cite Scheffer / Xu / Plaza et al., Janelia FlyEM)
- FlyWire import: CC BY-NC 4.0 (non-commercial only)

Full provenance: `docs/DATA_AND_LICENSING.md`.

## Limitations

- Hemibrain mode uses a surgical subgraph, not the entire central brain
- UI node positions are abstract region clusters, not EM coordinates
- Synthetic PII can be easy for linear baselines
- Browser visualization samples activity; it does not render every synapse
- Dynamics are computational, not biophysically exact spiking

## Brand tone

Serious science, macabre theatre:

- Feed it the text.
- Destroy the brain.
- Real tissue vs. randomized twin.
- The tissue has rendered its verdict.

Never: “the fly understands your contract.”
Never: “we uploaded a consciousness.”
