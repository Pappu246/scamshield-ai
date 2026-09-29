# Limitations

ScamShield AI v1 is a risk-**assessment** tool. It is not a verdict machine. The limitations below are product decisions, stated openly in the UI.

## Detection limitations
- **Small seed dataset.** The classifier trains on 85 hand-written examples. Real-world scam language drifts fast; paraphrases and novel scripts may evade both rules and model.
- **Transliteration coverage.** Hindi (Devanagari) support works via char-level transliteration plus a vocabulary map. Uncommon spellings and regional vocabulary may not match rules.
- **No live URL checking.** Links are inspected structurally only. A clean-looking domain can still be malicious and a weird-looking one can be genuine; ownership, blocklists and page content are simply unknown — reported as "Unable to verify".
- **No OCR in v1.** Screenshots are out of scope; the architecture reserves an `image` analysis kind for v2.
- **IPv6 literal hosts.** Bracketed IPv6 hosts (`http://[::1]/`) are rejected as malformed in v1 — raw-IP detection covers IPv4 only. A link submitted on its own returns a friendly validation error; one pasted inside a message text is kept visible as an unverifiable (URL-000) report rather than silently dropped.
- **English-centric rules.** Non-English, non-Hindi messages get weak coverage.
- **Adversarial evasion.** Trivial perturbations ("reg1stration", zero-width tricks, emoji padding) can defeat regex rules; only zero-width stripping is normalized away.

## Why thresholds are where they are
- **30 / 55 / 75** (medium/high/critical): 30 ≈ one moderate rule hit; 55 ≈ a strong rule (e.g. upfront-fee 22–28 pts) or combinations; 75 ≈ multiple strong rules or strong rules + suspicious link + model agreement.
- **Abstention (INSUFFICIENT EVIDENCE)**: fewer than ~8 words and no strong signal — too little context to justify even "LOW".
- **ML margin gate (0.2)**: below a 20-point margin the model is near its decision boundary; its contribution is cut to 25% because confidence there is mostly noise.
- **Caps**: no single component can dominate (rules ≤ 55, model ≤ 30, URL ≤ 32, entities ≤ 15), so one loud signal cannot manufacture a CRITICAL verdict alone.
- **Legitimacy relief**: strong, confidently-legitimate model evidence subtracts up to 18 points so real bills/interviews stay LOW.

## Uncertainty communication
Every result shows: which component contributed what, uncertainty notes (short input, no external verification, low model margin), a plain-language disclaimer ("risk assessment, not a guaranteed determination"), and a recommended action that always points to independent verification through official channels the user looks up themselves.

## Data & privacy
- Inputs stored truncated (2,000 chars) per account; delete by not using the history (v1 has no user-facing deletion; rows are private to the account).
- Feedback never auto-retrains anything.

## Out of scope for v1
OCR/screenshots · external reputation APIs (WHOIS/Google Safe Browsing) · LLM explanations · multilingual UI switching (the *engine* handles Hinglish/Devanagari; the UI chrome is English) · team/org accounts · bulk import.
