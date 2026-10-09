# ScamShield AI

**Check before you trust.**

ScamShield AI analyzes suspicious messages and URLs and explains **why** something appears risky — risk score, risk level, evidence, and a recommended safe action. It never claims certainty it doesn't have.

## What it does (Version 1)

| Capability | Status |
|---|---|
| Paste a suspicious message → full analysis | ✅ |
| Analyze one or more URLs (from text or standalone) | ✅ |
| Hybrid engine: rule-based + ML + URL heuristics | ✅ |
| Transparent 0–100 score with per-component breakdown | ✅ |
| Risk levels incl. **INSUFFICIENT EVIDENCE** abstention | ✅ |
| English / Hindi (Devanagari) / Hinglish detection | ✅ |
| Prompt-injection defense (input treated as data) | ✅ |
| Private history, feedback, per-user rate limiting | ✅ |
| Screenshot / OCR analysis | ⏳ Version 2 (architecture is ready for it) |

## Quick start

```bash
bun install
bun run dev          # app (Freebuff runs this automatically)
bunx convex dev --once   # deploy backend functions + generate types
bun run test         # 70 unit/integration tests (vitest)
bun tsc -b --noEmit  # typecheck
```

The analyzer requires no external AI/reputation API keys and runs locally with no analysis-time network calls. Email OTP delivery reads `VLY_EMAIL_API_KEY` only from the server-side Convex deployment environment; a Vercel frontend variable alone is not sufficient. Never place this key in a `VITE_` variable or commit it. See [deployment instructions](docs/DEPLOYMENT.md).

## Architecture at a glance

```
message text ──► normalize ──► entity extraction ──┐
                              (urls, phones, UPI…) │
                    ┌──────────────────────────────┤
                    ▼                              ▼
              rule engine                    URL analyzer
           (24 audited rules)              (structural only,
                    │                       no site visits)
                    ▼                              │
             NB classifier ◄── seed dataset        │
           (abstains on low margin)                │
                    └───────────┬──────────────────┘
                                ▼
                     scoring engine (0–100)
                    capped components + relief
                                ▼
              assessment + evidence + uncertainty
                                ▼
                  Convex persistence (per-user)
```

Details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · Scoring: [docs/SCORING.md](docs/SCORING.md) ·
Security: [docs/SECURITY.md](docs/SECURITY.md) · Model: [docs/MODEL_CARD.md](docs/MODEL_CARD.md) ·
Limits: [docs/LIMITATIONS.md](docs/LIMITATIONS.md)

## Screens

- `/` — landing ("Check before you trust.")
- `/analyze` — Message / Link tabs
- `/result/:id` — score, level, findings + verbatim evidence, score contributions, link findings, model view, uncertainty, recommended action, feedback
- `/history` — private analysis history
- `/about` — methodology, measured metrics, limitations

## Measured model metrics

Computed by stratified 5-fold cross-validation on the seed dataset at load time — displayed in the app exactly as measured (never invented). Run `bun run test` or open `/about` to see current values.

## License / attribution

Seed dataset is hand-written for this project (no external corpora, no invented sources). All analysis is local; no third-party reputation APIs are called in v1.
