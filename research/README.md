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

The current authoritative end-to-end research run (`37223619398`) selected:

- seed oversampling factor: 32x
- classification threshold: 0.90
- ensemble weight: 1
- candidate model version: nb-scam-v1.1-external-seed-oversampled
- dataset revision: 09afd479908c443e46be2629185ba8cd1de8abb8

Under the corrected train/validation/test methodology, selection used frozen seed
CV plus external validation, while external test data was report-only. The selected
candidate measured:

- selected seed CV: 91.76% accuracy, 89.66% precision, 98.11% recall,
  93.69% F1, 18.75% FPR
- external validation: 98.52% accuracy, 98.95% precision, 97.41% recall,
  98.17% F1, 0.71% FPR
- external test: 98.33% accuracy, 96.13% precision, 99.33% recall,
  97.70% F1, 2.24% FPR
- independent UCI SMS Spam Collection: 89.49% accuracy, 61.39% precision,
  58.10% recall, 59.70% F1, 5.66% FPR

The UCI benchmark is a generic English SMS spam/ham benchmark, not a real-world
fraud-detection accuracy claim. The weaker independent recall remains a blocker
to production replacement.

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

The current authoritative run (`37223619398`) loaded all 10,000 rows from the
pinned dataset revision `8e80dd576610feede6a4c456f95fbd6b8ac13c2c`:

| Metric | Production v1 | Candidate v1.1 |
|---|---:|---:|
| Accuracy | 85.09% | 82.73% |
| Precision | 80.62% | 82.03% |
| Recall | 92.38% | 83.82% |
| F1 | 86.10% | 82.92% |
| False-positive rate | 22.20% | 18.36% |

The candidate reduces false-positive rate but loses substantial recall versus the
frozen production model. This benchmark therefore does not support promotion.


## Methodology hardening

External data is split deterministically into train/validation/test. Candidate
threshold and ensemble configuration selection uses frozen seed CV plus the
external validation split; the external test split is evaluated only after
selection and is never used to choose the configuration. This keeps the final
test evaluation independent while avoiding seed-only overfitting.
## Current production/research gate snapshot

This research branch is intentionally kept separate from production. As of the latest gate review:

- production `main`: `4c7d79cf3fbba857ba73714daae068f8b4d1a516`
- production deployment: `dpl_92rSEow71i5YHVPXifDnuRX5kkDe`
- the v1.1 candidate is not approved for production promotion because independent benchmarks remain materially weaker than the frozen production model
- the research/security gates are re-evaluated from the exact current commit; stale historical workflow runs must not be treated as fresh verification

A research-only documentation change does not alter the production scoring path or model artifact.
