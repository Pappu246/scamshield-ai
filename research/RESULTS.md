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

## Multilingual Hindi/Hinglish smoke benchmark

Dataset: `karanverma19/Indian_Multilingual_Scam_Message_Dataset`, pinned to
file revision `7019a60`, 120 rows, Apache-2.0.

| Metric | Production v1 | Candidate v1.1 |
|---|---:|---:|
| Accuracy | 86.67% | 88.33% |
| Precision | 78.95% | 91.07% |
| Recall | 100.00% | 85.00% |
| F1 | 88.24% | 87.93% |
| False-positive rate | 26.67% | 8.33% |

Candidate per-language recall:

| Language | Rows | Recall | False-positive rate |
|---|---:|---:|---:|
| English | 41 | 90.91% | 5.26% |
| Hindi | 37 | 71.43% | 0.00% |
| Hinglish | 42 | 94.12% | 16.00% |

This is a small curated smoke benchmark. It supports further multilingual
testing but is not sufficient by itself to replace the production model.

## Larger independent Indian communication benchmark
A 10,000-row external Indian scam-communication corpus is now wired as an
evaluation-only gate in `research/indian-communication-benchmark.ts`.
The corpus includes call/chat/SMS-style communication, so any result will be
reported as a communication benchmark rather than a direct real-world
SMS-fraud accuracy estimate. The source file is pinned to revision `8e80dd576610feede6a4c456f95fbd6b8ac13c2c`.

A current authoritative end-to-end Actions run (`37223619398`) loaded all 10,000 rows
from the pinned dataset revision `8e80dd576610feede6a4c456f95fbd6b8ac13c2c` and measured:

| Metric | Production v1 | Candidate v1.1 |
|---|---:|---:|
| Accuracy | 85.09% | 82.73% |
| Precision | 80.62% | 82.03% |
| Recall | 92.38% | 83.82% |
| F1 | 86.10% | 82.92% |
| False-positive rate | 22.20% | 18.36% |

The current-pin result is authoritative for this benchmark. It improves false-positive
rate but has materially lower recall than production v1, so it does not support promotion.

## Post-correction authoritative research run

The current successful run (`37223619398`) completed the full research workflow,
including seed/ensemble selection, UCI, multilingual, and 10,000-row Indian
communication evaluation.

The selected configuration is:
- seed oversampling factor: **32x**
- classification threshold: **0.90**
- ensemble weight: **1**
- model: `nb-scam-v1.1-external-seed-oversampled`

### Corrected external train/validation/test selection

Threshold selection used frozen seed CV plus external validation; the external test
split was report-only.

| Metric | Seed CV | External validation | External test |
|---|---:|---:|---:|
| Accuracy | 91.76% | 98.52% | 98.33% |
| Precision | 89.66% | 98.95% | 96.13% |
| Recall | 98.11% | 97.41% | 99.33% |
| F1 | 93.69% | 98.17% | 97.70% |
| False-positive rate | 18.75% | 0.71% | 2.24% |

The external test result was computed only after configuration selection.

## Current gate

The v1.1 candidate remains **research-only**. Independent evaluation still does not
justify production replacement:
- UCI SMS benchmark recall: **58.10%**
- 120-row multilingual smoke benchmark overall recall: **85.00%**
- 10,000-row Indian communication benchmark recall: **83.82%**, versus **92.38%** for production v1

These are benchmark results, not real-world fraud-detection accuracy claims.

## Methodology hardening

External data is split deterministically into train/validation/test. Candidate threshold and
ensemble configuration selection uses frozen seed cross-validation plus the external validation
split only. The external test split is evaluated only after selection and is report-only.
Earlier 80/20 holdout-selection results remain historical evidence and are not the authoritative
post-correction result.
