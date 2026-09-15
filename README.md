# The Legal Fly

> **Can a fruit fly be a good lawyer?**

The Legal Fly is an experiment that tests whether the real neural connectome of a fruit fly can make simple legal recommendations.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_the_Fly-brightgreen)](https://legalfly-web.onrender.com/)
[![GitHub](https://img.shields.io/badge/GitHub-thelegalfly-181717?logo=github)](https://github.com/zgbrenner/thelegalfly)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Connectome](https://img.shields.io/badge/Brain-MaleCNS_v1.0-green)](#the-fly-brain-is-not-decorative)
[![Local First](https://img.shields.io/badge/Architecture-Local--First-blue)](#privacy)
[![MiniMind](https://img.shields.io/badge/Language-MiniMind-purple)](#give-the-fly-language)

---

## What is this?

A villager walks into a tiny early-modern law office:

> "My neighbor's goat keeps eating my cabbages."

Instead of sending that dispute directly to a conventional AI model, The Legal Fly converts it into structured facts, stimulates sensory neurons inside a reconstruction of the **male fruit fly brain and central nervous system**, propagates activity through the biological connectome, and reads the resulting neural state to decide what the village lawyer should recommend.

The lawyer is a fly.

The nervous system is real.

The legal system is fictional.

---

## The Experiment

```text
GOAT EATS CABBAGES
        ↓
structured facts
        ↓
sensory neuron stimulation
        ↓
REAL FRUIT FLY CONNECTOME
        ↓
neural activity propagates
        ↓
motor / descending neurons
        ↓
"Seek restitution."
```

The core question is deliberately strange:

> **Can the structure of a biological nervous system be repurposed as a computational substrate for a task it never evolved to perform?**

Fruit flies did not evolve to interpret contracts, weigh evidence, or resolve property disputes.

So naturally, we made one a lawyer.

---

## The Fly Brain Is Not Decorative

The simulation uses the **Janelia FlyEM MaleCNS v1.0 connectome**.

| Metric                                 |           Count |
| -------------------------------------- | --------------: |
| Traced neuronal bodies                 |     **165,122** |
| Directed neuron-pair connections       |  **25,563,197** |
| Synaptic contacts                      | **124,025,046** |
| Neurons with released soma coordinates |     **140,024** |

The interface visualizes real released neuron positions inside the fly.

When neurons light up, those values correspond to actual nodes used by the simulation.

This is not a random glowing-brain animation pasted on top of a classifier.

---

## How It Works

```text
Petition
   ↓
MiniMind / Manual Input
   ↓
8 confirmed fact dimensions
   ↓
15,897 sensory neurons
   ↓
MaleCNS connectome
   ↓
neural propagation
   ↓
256 motor / descending features
   ↓
trained readout
   ↓
8 recommendations
or
ABSTAIN
```

The eight fact dimensions are:

* matter
* property
* harm
* proof
* intent
* relationship
* urgency
* ability

Only confirmed facts reach the fly.

The language model does not get to secretly choose the answer.

---

## Give the Fly Language

The fruit fly connectome does not understand English.

For that, The Legal Fly uses **MiniMind**, a small local language model that can translate a villager's petition into structured facts.

MiniMind can:

* extract candidate facts
* translate natural language into the eight input dimensions
* help render the fly's chosen recommendation into readable language

MiniMind cannot:

* override the fly's selected action
* receive the correct legal answer during active inference
* replace the connectome

### Local MiniMind

MiniMind can run as a local loopback service:

```bash
python -m pip install -e '.[linguistic]'

python tools/prepare_minimind.py
python tools/prepare_minimind.py --check

CUDA_VISIBLE_DEVICES='' \
python -m uvicorn \
apps.minimind_adapter.service:app \
--host 127.0.0.1 \
--port 8123
```

Its **63.9M parameters remain frozen**.

### MiniMind in the Browser

A browser-native MiniMind option is also planned.

The goal is to let users run the linguistic layer **directly in the browser**, without installing Python or starting a local server.

```text
Petition
   ↓
MiniMind in your browser
   ↓
confirmed structured facts
   ↓
fruit fly nervous system
```

That keeps the experiment close to its local-first philosophy and makes the complete pipeline accessible from a normal web page.

---

## So... Is the Fly Actually Good at Law?

Current held-out results:

| System                  |       Exact |
| ----------------------- | ----------: |
| Biological MaleCNS      | **13 / 16** |
| Shuffled connectome     |     11 / 16 |
| Facts-only centroid     | **14 / 16** |
| Frozen MiniMind readout |      7 / 16 |
| Fictional charter rules |      9 / 16 |

So no, this repository does **not** prove that fruit flies secretly understand law.

The simple facts-only baseline currently performs better.

That matters.

The point is not to manufacture a flashy benchmark. The point is to ask whether the organization of a biological nervous system contributes anything measurable when the inputs, task, training examples, and evaluation are controlled.

---

## The Village Lawyer

The experiment lives inside a fictional early-modern village law office inspired by old European legal paintings.

Villagers bring disputes.

The fly listens.

Its nervous system activates.

Then it gives counsel under a tiny fictional village charter.

**The aesthetic is ridiculous. The computation is not.**

---

## Try It

### Live demo

[Open The Legal Fly](https://legalfly-web.onrender.com/)

[![Open The Legal Fly](https://img.shields.io/badge/Open_The_Legal_Fly-Live_Demo-brightgreen?style=for-the-badge)](https://legalfly-web.onrender.com/)

### Run locally

```bash
git clone https://github.com/zgbrenner/thelegalfly.git
cd thelegalfly/apps/web

npm ci
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

## Prepare the Brain

```bash
python -m pip install pyarrow pandas numpy

python tools/prepare_malecns.py \
  --download \
  --convert \
  --export-browser
```

Then restart the web app.

The application intentionally refuses to silently replace the MaleCNS dataset with an older subset or synthetic graph.

---

## Architecture

```text
┌─────────────────────┐
│  Villager Petition  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│      MiniMind       │
│   local / browser   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Confirmed Fact Vec. │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Sensory Stimulation │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ MaleCNS Connectome  │
│   165k+ neurons     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Neural Readout    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Legal Recommendation│
└─────────────────────┘
```

---

## Privacy

The project is designed around **local-first computation**.

Connectome inference, training, model inspection, benchmarks, and visualization run locally.

Optional language processing uses MiniMind rather than a hosted general-purpose LLM.

The planned browser-native MiniMind path is intended to make even that linguistic preprocessing possible entirely on-device.

No API key should be required to ask a fly about your fictional goat dispute.

---

## Reproducibility

The project pins its source data and model revisions so the experiment can be reproduced rather than hand-waved.

See:

* `docs/METHOD.md`
* `docs/VERIFICATION.md`
* `docs/MINIMIND_SETUP.md`

The repository includes checks for:

* edge direction
* deterministic encoding
* label leakage
* abstention behavior
* anatomy provenance
* shuffled-graph controls
* correction safety
* model validation

---

## Data

Connectome:

**Janelia FlyEM MaleCNS v1.0**

Dataset license:

**CC BY 4.0**

The Legal Fly source code itself is released under the **MIT License**.

---

## Contributing

Experiments, controls, visualization improvements, browser inference work, and scientifically defensible weird ideas are welcome.

```bash
git clone https://github.com/zgbrenner/thelegalfly.git
```

Open an issue or submit a pull request.

If you manage to make the fly a materially better lawyer, evidence is preferred.

---

## License

The Legal Fly is open source under the **MIT License**.

See [`LICENSE`](LICENSE).

Connectome data retains its original **CC BY 4.0** licensing and attribution requirements.

---

## Disclaimer

The Legal Fly is an experimental computational neuroscience and software project.

It is not:

* legal advice
* a legal reasoning system
* evidence that fruit flies understand law
* proof that biological connectomes outperform machine learning
* a replacement for an attorney
* a tiny member of the bar trapped inside your browser

At least not yet.

---

## The Question

Most AI projects ask:

> **How much intelligence can we build?**

The Legal Fly asks something stranger:

> **How much computation is already hiding inside a brain built for something else?**

And, critically:

> **Can it handle the goat case?**

[![Try The Legal Fly](https://img.shields.io/badge/Try_The_Legal_Fly-Live-brightgreen?style=for-the-badge)](https://legalfly-web.onrender.com/)
[![View on GitHub](https://img.shields.io/badge/View_on_GitHub-Repository-181717?style=for-the-badge\&logo=github)](https://github.com/zgbrenner/thelegalfly)
