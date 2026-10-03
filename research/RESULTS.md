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
SMS-fraud accuracy estimate. The source file is pinned to revision `c1baf5a`
and is not used for training or threshold tuning.

No score is claimed until the GitHub Actions run completes successfully.

## Current gate

The v1.1 candidate remains research-only. Independent UCI recall remains the
main blocker to silent production replacement, and the larger Hindi/Hinglish
communication benchmark must complete before promotion is reconsidered.
