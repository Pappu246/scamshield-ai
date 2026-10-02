/**
 * Extract the user-facing sentence from a thrown error for display in a toast.
 *
 * Convex delivers every failed server function as a multi-line envelope, e.g.
 *
 *   [CONVEX M(analyses:analyzeUrl)] [Request ID: 5aae1579b96fe095] Server Error
 *   Uncaught Error: URL contains invalid characters.
 *       at handler (../../src/convex/analyses.ts:213:4)
 *
 *     Called by client
 *
 * Toasting `err.message` verbatim leaks the request id and the internal stack
 * trace to the user, which contradicts the documented error contract (see
 * docs/SECURITY.md: plain messages only, no stack traces). This returns just
 * the friendly sentence when present, the first cleaned line otherwise, or
 * the supplied fallback.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || err.message.length === 0) return fallback;

  const unwrapped = /Uncaught Error: (.*)/.exec(err.message);
  if (unwrapped?.[1]) return unwrapped[1].trim() || fallback;

  const firstLine = err.message
    .split("\n")[0]
    .replace(/^\[CONVEX[^\]]*\]\s*/, "")
    .replace(/^\[Request ID:[^\]]*\]\s*/, "")
    .trim();
  if (!firstLine || firstLine === "Server Error") return fallback;
  return firstLine;
}
