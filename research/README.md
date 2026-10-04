# ScamShield AI v1.1 model research

This directory contains research-only evaluation and candidate-model code. The
verified v1 production model remains unchanged until a candidate demonstrates
better behavior on both the frozen seed cross-validation and an external
benchmark.

## Research tracks

### External-data word-level Naive Bayes candidate

The primary v1.1 candidate is a word-level Naive Bayes model trained from the
external Indian spam/scam dataset plus repeated copies of the frozen
85-example ScamShield seed set. The seed oversampling factor and classification
threshold are selected from reproducible evaluation rules; the production
classifier is never modified by the research scripts.

Source dataset:

- Hugging Face: anmolshrivastav/scam-ham-india
- License: Apache-2.0
- Split: train
- Reported size: 2,272 rows
- Labels: ham / spam
- The dataset mixes real-world Indian SMS with synthetic augmentation and is
  English-only.

The benchmark maps spam -> scam only to reuse the same binary metrics.
This is deliberately described as an external spam/scam benchmark, not
real-world fraud accuracy.

The evaluation pins the dataset-server x-revision fingerprint and refuses
partial or internally changing data.

### Character n-gram experiment

src/lib/analyzer/classifierExperimental.ts contains a separate
character n-gram Naive Bayes experiment. It is deliberately not wired into the
production analyzer and is retained as a reproducible rejected candidate.

## Latest measured candidate results

The latest successful end-to-end research run selected:

- seed oversampling factor: 32x
- classification threshold: 0.90
- candidate model version: nb-scam-v1.1-external-seed-oversampled
- dataset revision: 09afd479908c443e46be2629185ba8cd1de8abb8

At that threshold, the candidate measured:

- frozen 85-example seed 5-fold CV: 89.41% accuracy, 86.67% precision,
  98.11% recall, 92.04% F1, 25.00% FPR
- primary held-out slice from the same external dataset: 97.41% accuracy,
  98.17% precision, 95.27% recall, 96.70% F1, 1.18% FPR
- independent UCI SMS Spam Collection benchmark: 90.71% accuracy, 67.48%
  precision, 59.17% recall, 63.05% F1, 4.41% FPR

The UCI benchmark contains generic spam/ham SMS rather than a pure fraud corpus,
so it is an independent spam benchmark, not a real-world scam-detection
accuracy claim.

The primary held-out slice comes from the same external dataset distribution
used to train the candidate, so it can be optimistic. The independent UCI
recall result is not high enough to justify silently replacing the production
model.

## Promotion criteria

A future v1.1 promotion should satisfy all of the following:

1. Candidate recall is preserved or improved on the frozen seed CV.
2. False positives are materially reduced without a meaningful recall
   regression.
3. The candidate is checked on an independent external dataset.
4. The production analyzer, scoring contract, and existing regression suite
   remain stable.
5. The evidence is strong enough to justify replacing the frozen v1 model.

Until those gates are met, the research branch remains separate from main.
## Multilingual research gate

`research/multilingual-benchmark.ts` adds an evaluation-only check for a small
Indian Hindi/Hinglish/English scam-message CSV. The source describes 120 rows
with `message`, `label`, `reason`, `domain`, and `language` fields and is
licensed Apache-2.0.

The benchmark reports overall and per-language results for the frozen v1 model
and the generated v1.1 candidate. It is deliberately a **smoke benchmark**:
the dataset is small and curated, so it is not a replacement for a larger
independent multilingual holdout.

The manual research workflow now includes this benchmark after candidate
generation. The harness pins the standard Hugging Face dataset repository to
file revision `7019a60`, avoiding the earlier bucket raw-path instability.

Measured on the 120-row smoke set:

- production v1: 86.67% accuracy, 78.95% precision, 100.00% recall, 88.24% F1,
  26.67% false-positive rate
- candidate v1.1: 88.33% accuracy, 91.07% precision, 85.00% recall, 87.93% F1,
  8.33% false-positive rate

Per-language candidate recall is 90.91% on English, 71.43% on Hindi, and
94.12% on Hinglish. The smoke set is small and curated, so these numbers are
diagnostic only.

Source dataset:

- Hugging Face: karanverma19/Indian_Multilingual_Scam_Message_Dataset
- File: ultra_premium_scam_dataset.csv
- Pinned file revision: 7019a60
- Rows: 120
- License: Apache-2.0
- Fields: message, label, reason, domain, language

### Larger independent Indian communication benchmark

`research/indian-communication-benchmark.ts` evaluates the frozen v1 model and v1.1 candidate on a separate 10,000-row Indian scam-communication corpus. It is intentionally evaluation-only and is treated as an external communication benchmark because the corpus includes SMS, chat, and call-transcript-style records. It is not a direct real-world fraud accuracy claim.

The workflow pins the corpus file to revision `8e80dd576610feede6a4c456f95fbd6b8ac13c2c` and refuses incomplete or malformed data. Results are required before any candidate promotion decision.


## Larger independent Indian communication benchmark — observed result

A prior successful end-to-end Actions run (`37148264682`) loaded all 10,000 rows
from `ysangam/Indian_Cyber_Scam_PhoneCall_Hinglish_Dataset` and measured the
following external communication benchmark:

| Metric | Production v1 | Candidate v1.1 |
|---|---:|---:|
| Accuracy | 85.09% | 86.62% |
| Precision | 80.62% | 85.71% |
| Recall | 92.38% | 87.90% |
| F1 | 86.10% | 86.79% |
| False-positive rate | 22.20% | 14.66% |

The successful run used an earlier data-file revision (`c1baf5a`). The branch
now pins the dataset repository to `8e80dd576610feede6a4c456f95fbd6b8ac13c2c`,
so the figures above are retained as observed evidence rather than presented
as a current-pin CI PASS. A fresh run at the updated pin is required before
using the benchmark as a completed promotion gate.


## Methodology hardening

External data is split deterministically into train/validation/test. Candidate
threshold and ensemble configuration selection uses frozen seed CV plus the
external validation split; the external test split is evaluated only after
selection and is never used to choose the configuration. This keeps the final
test evaluation independent while avoiding seed-only overfitting.
