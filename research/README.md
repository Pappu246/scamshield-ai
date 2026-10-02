# ScamShield AI v1.1 model research

This directory contains research-only evaluation and candidate-model code. The
verified v1 production model remains unchanged until a candidate demonstrates
better behavior on both the frozen seed cross-validation and an external
benchmark.

## External benchmark

Source dataset:

- Hugging Face: `anmolshrivastav/scam-ham-india`
- License: Apache-2.0
- Split: `train`
- Labels: `ham` / `spam`
- Reported size: 2,272 rows
- The dataset mixes real-world Indian SMS with synthetic augmentation and is
  English-only.

The benchmark maps `spam` → `scam` only to reuse the same binary metrics.
This is deliberately described as an **external spam/scam benchmark**, not
real-world fraud accuracy.

The benchmark records the Hugging Face dataset-server `x-revision` fingerprint
and refuses to score a partial or internally changing dataset.

## Candidate model

`classifierExperimental.ts` adds a character n-gram Naive Bayes signal to the
existing word-level Naive Bayes probability. It uses a fixed 0.25 ensemble
weight and is not wired into the production pipeline.

Promotion criteria for a future v1.1 release:

1. Candidate must improve or preserve recall on the frozen seed CV.
2. Candidate should materially reduce false positives without creating a
   meaningful recall regression.
3. Candidate must be evaluated on the external benchmark before promotion.
4. All existing production tests and type checks must remain green.
5. The current v1 production model stays untouched until these checks are met.
