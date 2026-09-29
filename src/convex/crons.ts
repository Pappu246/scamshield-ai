/**
 * ScamShield AI — scheduled maintenance jobs.
 *
 * Any row whose fixed-window period has ended can never be read again:
 * `checkRateLimit` (see analyses.ts) only ever reads the *current* window's
 * row for a key, so rows with windowStart < now - windowMs are stale forever
 * and safe to delete. This keeps the rateLimits table bounded.
 */

import { cronJobs } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Keep in sync with RATE_LIMIT.windowMs in analyses.ts. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Delete at most this many rows per page while sweeping. */
const PAGE_SIZE = 500;

async function deleteExpiredRows(ctx: MutationCtx): Promise<number> {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  let deleted = 0;
  let cursor: string | null = null;

  for (;;) {
    // Empty index range over by_key_window = ordered full scan of the table.
    // The table stays small (only windows that saw traffic have rows), so a
    // simple sweep is fine for v1.
    const page = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_window")
      .paginate({ numItems: PAGE_SIZE, cursor });

    for (const row of page.page) {
      if (row.windowStart < cutoff) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  return deleted;
}

/**
 * Deletes stale rate-limit rows. Internal mutation so it can also be triggered
 * manually (npx convex run crons:cleanupExpired) as well as by the cron.
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await deleteExpiredRows(ctx);
  },
});

// Daily at 03:00 UTC.
crons.interval(
  "cleanup-expired-rate-limits",
  { minuteUTC: 0, hourUTC: 3 },
  internal.crons.cleanupExpired,
);

export default crons;
