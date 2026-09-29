# Scoring methodology

## Formula

```
final = clamp( Σ component_points , 0, 100 )

component_points:
  rules        = min( Σ rule.weights ,                       55 )
  ml           = p(scam) × margin × 30   (× 0.25 if margin < 0.2)
  url          = worst link verdict points                  ≤ 32
                  (safe 0 · unverifiable 8 · suspicious 20 · dangerous 32)
  entity       = ip_link 8 + payment_handle 7 + phone&amount 3   ≤ 15
  relief       = −( up to 18 when the model is confidently legitimate )
```

Levels: `LOW < 30 ≤ MEDIUM < 55 ≤ HIGH < 75 ≤ CRITICAL`.
`INSUFFICIENT EVIDENCE` replaces LOW when input < ~8 words and no strong signal exists.

## Worked example

Input: *"Congratulations sir, aap select ho gaye ho. Bas 1999 registration fee jama kijiye. Pay at http://hr-secure-xyz.top/pay"*

| Component | Raw | Points | Why |
|---|---|---|---|
| Rule engine | 22 (PAY-001) | 22 | upfront fee |
| ML classifier | p=1.00, margin=1.00 | 30 | strong scam vocabulary match |
| URL analysis | suspicious | 20 | http + high-abuse `.top` TLD |
| Entity risk | — | 0 | no raw IP / UPI handle |
| Relief | — | 0 | no legitimacy evidence |
| **Total** | | **72 → HIGH** (verified by running the pipeline on this exact input) |

Every result page shows this exact table (points / raw / cap per component), so the score is fully auditable.

## Design principles
1. **No single component decides.** Caps force multi-signal agreement for HIGH/CRITICAL.
2. **Weak signals can't condemn.** Low-severity rules carry 5–12 points; one of them alone can't exceed MEDIUM.
3. **The model abstains.** Margin-weighted contribution prevents confident-looking noise.
4. **Legitimacy is evidence too.** Relief subtracts when the model is confidently legitimate on real-world money language.
5. **Unknown ≠ safe.** Unverifiable links add points, never subtract them.
