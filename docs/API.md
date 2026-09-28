# API

The backend is Convex (typed RPC, not REST). These are the public functions in `src/convex/analyses.ts`; all require an authenticated session unless noted.

## Mutations

### `analyses.analyze({ text, urls? })`
Runs the full text pipeline and persists the result.

- `text: string` — 3–10,000 chars (server-validated)
- `urls?: string[]` — up to 5 extra URLs to analyze alongside those found in the text
- **Returns** `{ analysisId: Id<"analyses">, result: TextAnalysisResult }`
- **Errors**: auth required · validation (length, URL count) · rate limit (20/min)

### `analyses.analyzeUrl({ url })`
Standalone link analysis (structural only). Persisted with `kind: "url"`.

- `url: string` — ≤ 2048 chars
- **Returns** `{ analysisId, result: TextAnalysisResult }` (text layers zeroed)
- **Errors**: auth · invalid URL · rate limit

### `analyses.submitFeedback({ analysisId, verdict, comment? })`
- `verdict: "correct" | "incorrect" | "not_sure"`
- Stores/upserts feedback; owner-only. Used for future evaluation, never auto-retraining.

## Queries

### `analyses.listMine({ limit? })`
Newest-first private history (default 50, max 100). Returns stored summaries (id, kind, inputPreview, riskLevel, riskScore, createdAt).

### `analyses.get({ id })`
Single analysis; **null if not owner** (no existence leak).

### `analyses.myFeedback()`
The caller's feedback rows.

### `analyses.stats()`
`{ total, highRisk, byLevel[] }` for the signed-in user.

## Shared result shape (`TextAnalysisResult`)

```jsonc
{
  "entities": [{ "kind": "url | ip_url | email | phone | payment_handle | amount | language", "value": "…", "host": "…" }],
  "findings": [{ "id": "PAY-001", "title": "Upfront fee or deposit requested", "category": "financial",
                 "severity": "high", "explanation": "…", "evidence": ["registration fee ₹1,999"],
                 "weight": 22, "source": "rule_engine" }],
  "ml": { "scamProbability": 0.98, "confidence": 0.96, "modelVersion": "nb-scam-v1",
          "topScamTokens": [{ "token": "fee", "logOdds": 2.1 }], "topLegitTokens": [] },
  "urlReports": [{ "url": "…", "host": "…", "protocol": "http", "isHttps": false,
                   "flags": [{ "id": "URL-004", "title": "…", "detail": "…", "severity": "medium" }],
                   "featureFlags": ["no_https", "high_risk_tld"], "verdict": "suspicious",
                   "verification": "rule", "note": "Unable to verify ownership." }],
  "assessment": {
    "riskLevel": "HIGH RISK", "riskScore": 72,
    "breakdown": { "components": [{ "label": "Rule engine", "points": 34, "raw": 34, "cap": 55, "description": "…" }],
                   "topDrivers": [{ "label": "Rule engine", "points": 34 }] },
    "uncertaintyNotes": [{ "code": "no-external-verification", "message": "…" }],
    "disclaimer": "ScamShield AI provides a risk assessment, not a guaranteed determination…",
    "recommendedAction": "Do not send money or share OTPs…"
  },
  "summary": "…"
}
```

## REST endpoints?
None in v1. Convex functions are callable from any Convex client; an HTTP wrapper can be added via `convex/http.ts` if a public API is needed later.
