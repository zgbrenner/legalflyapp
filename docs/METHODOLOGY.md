# Methodology

LegalFly evaluates whether connectome-derived sparse connectivity improves
reservoir-computing performance on sensitive-information detection relative to
matched random controls and simple embedding baselines.

## Task

Multilabel classification over:

`NONE, PERSON, EMAIL, PHONE, ADDRESS, SSN, CREDIT_CARD, DATE_OF_BIRTH, FINANCIAL, MEDICAL, CREDENTIAL, OTHER_SENSITIVE`

## Dataset

Synthetic generator with deterministic seeds and fixed splits.
Includes easy positives, hard negatives (“Call Section 555…”), redaction, and formatting noise.

## Models

1. **Connectome reservoir** — biological / demo modular topology
2. **Random A** — randomized sparse graph
3. **Random B** — degree-preserving rewiring
4. **Random C** — topology fixed, weights randomized
5. **Linear baseline** — logistic heads on encoder embeddings
6. **MLP baseline** — optional small multilayer perceptron

## Reservoir

```
x(t+1) = (1 - λ) x(t) + λ tanh(W x(t) + Win u(t))
```

Only the readout is trained by default.

## Reporting

Every run stores seed, graph stats, encoder, split sizes, trainable params,
train/inference time, macro F1, precision/recall, per-class metrics, and confusion matrix
under `results/`.

## Integrity

Never hard-code favorable benchmark numbers in the UI.
Until artifacts exist, pages must show **Not yet measured**.

Distinguish:

- Measured result
- Hypothesis
- Speculation

See also `docs/DATA_AND_LICENSING.md` and `/methodology` in the web app.