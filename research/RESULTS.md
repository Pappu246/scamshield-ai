# ScamShield v1.1 Research Results

Status: **research-only; not promoted to `main`**.

## Selected candidate

- Model: `nb-scam-v1.1-external-seed-oversampled`
- External dataset: `anmolshrivastav/scam-ham-india`
- Dataset revision: `09afd479908c443e46be2629185ba8cd1de8abb8`
- Seed oversampling factor: `32x`
- Classification threshold: `0.90`

## Frozen seed cross-validation

| Metric | Production v1 | Candidate v1.1 |
|---|---:|---:|
| Accuracy | 87.06% | 89.41% |
| Precision | 82.81% | 86.67% |
| Recall | 100.00% | 98.11% |
| F1 | 90.60% | 92.04% |
| False-positive rate | 34.38% | 25.00% |

The seed result is a small 85-example stratified 5-fold benchmark, not a
real-world performance estimate.

## Primary external held-out slice

| Metric | Candidate v1.1 |
|---|---:|
| Accuracy | 97.41% |
| Precision | 98.17% |
| Recall | 95.27% |
| F1 | 96.70% |
| False-positive rate | 1.18% |

This held-out slice is from the same external dataset distribution used for
training, so it may be optimistic.

## Independent UCI SMS Spam Collection

| Metric | Candidate v1.1 |
|---|---:|
| Precision | 67.48% |
| Recall | 59.17% |
| F1 | 63.05% |
| Accuracy | 90.71% |
| False-positive rate | 4.41% |

This is a generic English SMS spam/ham benchmark, not a dedicated fraud corpus.
The 59.17% recall is a meaningful limitation and is one reason the candidate
has not been wired into the production analyzer.

## Rejected character n-gram experiment

`nb-scam-v1.1-char-ensemble` remains research-only. Its fixed 0.25 character
weight did not improve the frozen seed benchmark enough to justify replacing
the production word-level model.

## Next research gate

The next useful evidence is a larger hard-negative and Hindi/Hinglish
evaluation set that is kept separate from training, followed by an independent
holdout check before any production promotion.
