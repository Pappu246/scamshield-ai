# Model Card — ScamShield text classifier (`nb-scam-v1`)

## Model
- **Type**: Multinomial Naive Bayes (Laplace smoothing α=1), binary (scam / legit).
- **Training**: at application load time on the bundled seed dataset (`src/lib/analyzer/dataset.ts`).
- **Inference**: `predictText(text)` → scam probability + decision margin + top token contributions per class.
- **Version constant**: `MODEL_VERSION = "nb-scam-v1"`, stored with every analysis row.

## Data
- ~75 hand-written seed examples — **no external corpora; no invented "sources"**.
- Scam side: job/internship fee scams, phishing/KYC/OTP, advance-fee & prize, investment/Ponzi, scholarship-fee, impersonation, prompt-injection bait.
- Legitimate side (hard negatives on purpose): real interview invites, "no fee" job mails, bill/EMI reminders with amounts, urgent work/team messages, legitimate scholarship notices, Hinglish family/college messages, short everyday texts, an app-generated OTP note.
- Multilingual: English, Hinglish (Roman), Hindi (Devanagari → transliterated before tokenization).

## Preprocessing
Tokenization lowercases and keeps `[a-z]+|\d+` runs after Unicode normalization + transliteration; a small English stopword list is removed. Numbers survive as separate tokens (`1999`, `24`), which the scam register relies on.

## Evaluation (measured, not claimed)
Stratified 5-fold cross-validation runs at load time (`crossValidate(5)`); the exact current values are displayed in the app (`/about`) and can be reproduced with `bun run test`.

Current measured values (from this dataset):

| Metric | Value |
|---|---|
| Accuracy | ~0.88 |
| Precision (scam) | ~0.84 |
| Recall (scam) | 1.00 |
| F1 | ~0.91 |
| False-positive rate | ~0.31 of legit folds (10 FP) |

Interpretation, honestly stated:
- **Recall 1.0 / FP 10**: the model over-alerts on legitimate money-adjacent language. That is acceptable because the model is only one capped component (≤ 30 points) of the score and its margin gates its own contribution. It is *not* acceptable as a standalone verdict — which is why the architecture doesn't use it that way.
- These numbers describe the **seed dataset only**, not unseen real-world messages. They will not transfer 1:1.

## Intended use / misuse
- Use: one signal among several in a transparent, explainable risk score with human-readable evidence.
- Misuse (not supported): as an autonomous scam verdict, a content blocker, or an accusation of any sender.

## Limitations
- Small, hand-written data → vocabulary sensitivity; paraphrased scams may evade it.
- Naive Bayes independence assumption; word order handled only via token co-occurrence.
- Transliteration variance ("naukri" spellings) only partially covered by the vocabulary map.
- Upgrade path: swap `predictText` internals for a transformer (e.g. distilled multilingual model) behind the same interface; keep abstention semantics.

## Feedback policy
User feedback (correct / incorrect / not sure) is stored for future **evaluation** only. Nothing auto-retrains from unverified feedback.
