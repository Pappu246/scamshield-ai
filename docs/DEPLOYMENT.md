# Deployment

## This project (Freebuff web + Convex)
The platform runs the dev server and `convex dev` automatically; edits deploy on save. For a manual/local environment:

```bash
bun install
bunx convex dev --once     # push functions + generate types (needs CONVEX deploy auth)
bun run build              # tsc -b && vite build
bun run test               # vitest suite (70 tests)
```

## Environment variables
- `VITE_CONVEX_URL` — provided by the platform; used by `src/main.tsx` for the Convex client.
- `CONVEX_SITE_URL` — provided by the platform; used by Convex Auth.
- `VLY_EMAIL_API_KEY` — server-side email OTP provider credential; set it in the Convex/Vercel environment and never commit the value. The analyzer itself still performs local inference without external AI APIs.

## Production checklist
1. `bunx convex dev --once` succeeds (schema: analyses, feedback, rateLimits + auth tables).
2. `bun tsc -b --noEmit` clean.
3. `bun run test` green.
4. `VLY_EMAIL_API_KEY` is configured in the server/Convex environment before testing email OTP.
5. Sign-in flow: `/auth` → email OTP (or guest) → redirect back to `/analyze`.
5. Rate limiting active (20/min/user) — visible as error toast when exceeded.
6. History private per account — verify another account cannot open `/result/<id>`.

## Scaling notes (v2+)
- Add OCR service behind the `image` analysis kind.
- Add external reputation API (e.g. URL blocklist) behind `UrlAnalysisResult.verification: "external"`.
- Consider aging analyses (data-retention policy) if storage becomes a concern. A scheduled cleanup mutation for expired `rateLimits` rows already ships in v1 (`src/convex/crons.ts`, daily).
