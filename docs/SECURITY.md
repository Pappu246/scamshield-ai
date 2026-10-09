# Security

## Threat model & mitigations

### SSRF — eliminated by construction
The URL analyzer performs **zero network I/O**. It parses and inspects the URL string only: no fetches, no redirects, no DNS resolution, no downloads. Classic SSRF vectors (internal ranges, cloud metadata endpoints, redirect chains, `file://`, `gopher://`) have no path into the system.

Input parsing additionally rejects:
- non-http(s) schemes (`javascript:`, `data:`, `file:` …) — only `http:`/`https:` (or bare domains, treated as web addresses) are analyzable;
- control characters and whitespace inside URLs;
- hostnames over 2048 characters, or labels with invalid characters;
- hosts without a plausible domain structure (except intentional raw-IP detection, which is itself a red flag, not a fetch target).

### Prompt injection — input is data, never instructions
Analyzed text is passed through pure pattern-matching functions. There is no LLM in the v1 pipeline, so there is nothing to inject. Defense-in-depth:
- rule `INJ-001` detects "ignore previous instructions"-style content and flags it as suspicious evidence — the system does not act on it;
- the orchestrator (`src/lib/analyzer/index.ts`) treats input strictly as `string` data; no `eval`, no dynamic code paths, no shell, no file execution anywhere in the pipeline;
- tested: `flags prompt injection as data without following it`.

### Authentication & authorization
- All analysis mutations require a Convex Auth session (`getAuthUserId`); unauthenticated calls fail closed.
- Every read (`get`, `listMine`, `myFeedback`, `stats`) and write checks `userId` ownership — users can only ever see their own analyses and feedback.
- Frontend routes `/analyze`, `/result/:id`, `/history` are wrapped in `RequireAuth`, which preserves the intended path through `/auth?returnTo=…`.

### Rate limiting
Fixed-window counter in the `rateLimits` table: **20 analyses / minute / user / kind**. Exceeding it throws a user-visible error; no queue, no lockout beyond the window.

### Input validation
- Text: 3–10,000 characters, string-typed, server-side enforced (`ValidationError`).
- URLs: ≤ 2048 chars, ≤ 5 per analysis, scheme + structure validated before analysis.
- Unknown/malformed links inside text become `unverifiable` reports rather than crashes.

### Data minimization & retention
- Raw input stored **truncated to 2,000 characters** (`inputPreview`); the full structured result (evidence quotes, findings) is stored for traceability of that analysis.
- No third-party analytics and no external calls during analysis/inference. The only external credential used by the app is the server-side email OTP provider key described above; it is not exposed to the client.
- The email OTP provider credential is read only from the server-side `VLY_EMAIL_API_KEY` environment variable in the Convex deployment running `src/convex/auth/emailOtp.ts`.
- Configure the key in Convex's deployment environment, not a browser-exposed `VITE_` variable. A Vercel frontend environment variable alone does not make the key available to Convex functions.
- Never put the key in source, client code, or a committed `.env` file.
- Historical exposure requires provider-side revocation/rotation; deleting the source value alone does not invalidate the old credential.
- Feedback comments truncated to 500 chars.

### Error handling
User-facing errors are plain messages (validation, rate limit, auth). Internal exceptions never surface stack traces through the API; the client shows generic failure toasts.
