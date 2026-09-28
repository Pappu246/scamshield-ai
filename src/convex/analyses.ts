/**
 * ScamShield AI — Convex backend functions.
 *
 * Security model:
 *  - All analysis mutations require an authenticated user (Convex Auth).
 *  - Rate limiting is a fixed-window counter per user per analysis kind.
 *  - Users can only read their own analyses and feedback (ownership checks).
 *  - Raw input is truncated before persistence; the full result (including
 *    evidence quotes) is stored to make every analysis reproducible.
 */

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  analyzeText,
  analyzeUrlOnly,
  ValidationError,
} from "../lib/analyzer/index";
import { truncateForStorage } from "../lib/analyzer/validation";
import type { TextAnalysisResult, RiskAssessment, UrlAnalysisResult } from "../lib/analyzer/types";

export const ANALYZER_VERSION = "v1.0.0";

const RATE_LIMIT = { windowMs: 60_000, max: 20 }; // 20 analyses / minute / user

/**
 * Assessment for a link-only analysis (no text). Only the URL component is
 * populated; text layers are shown as explicitly not applicable.
 */
function assessLinkOnly(urlReport: UrlAnalysisResult): RiskAssessment {
  const URL_POINTS: Record<UrlAnalysisResult["verdict"], number> = {
    safe_structurally: 0,
    unverifiable: 8,
    suspicious: 20,
    dangerous: 32,
  };
  const points = URL_POINTS[urlReport.verdict] ?? 0;
  const finalScore = Math.max(0, Math.min(100, points));
  const riskLevel =
    finalScore >= 75 ? ("CRITICAL RISK" as const)
    : finalScore >= 55 ? ("HIGH RISK" as const)
    : finalScore >= 30 ? ("MEDIUM RISK" as const)
    : ("LOW RISK" as const);

  return {
    riskLevel,
    riskScore: finalScore,
    breakdown: {
      finalScore,
      components: [
        {
          label: "URL analysis",
          points,
          raw: points,
          cap: 32,
          description: `Structural verdict: ${urlReport.verdict.replace(/_/g, " ")} (${urlReport.flags.length} finding${urlReport.flags.length === 1 ? "" : "s"}).`,
        },
        {
          label: "Rule engine",
          points: 0,
          raw: 0,
          cap: 55,
          description: "Not applicable — no message text was analyzed.",
        },
        {
          label: "ML classifier",
          points: 0,
          raw: 0,
          cap: 30,
          description: "Not applicable — no message text was analyzed.",
        },
        {
          label: "Entity risk",
          points: 0,
          raw: 0,
          cap: 15,
          description: urlReport.urlKind === "ip"
            ? "Raw IP host counts as a risky entity."
            : "No additional risky entities.",
        },
        {
          label: "Legitimacy relief",
          points: 0,
          raw: 0,
          cap: 18,
          description: "Not applicable — no message text was analyzed.",
        },
      ],
      topDrivers: points !== 0
        ? [{ label: "URL analysis", points }]
        : [],
    },
    uncertaintyNotes: [
      {
        code: "no-external-verification" as const,
        message:
          "Links are analyzed structurally only. Domain ownership, blocklist status and live-site content were not checked — unable to verify. Structural findings are indicators, not proof.",
      },
    ],
    disclaimer:
      "ScamShield AI provides a risk assessment, not a guaranteed determination. Independent verification is always recommended.",
    recommendedAction:
      finalScore >= 55
        ? "Do not enter credentials or payment details on this link. If it claims to be your bank or a service you use, open their official app or type the known address yourself."
        : "Exercise caution with this link. Prefer reaching the service through its official app or a bookmarked address.",
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (fixed window counter)
// ---------------------------------------------------------------------------

async function checkRateLimit(
  ctx: MutationCtx,
  userId: string,
  kind: string,
): Promise<void> {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_LIMIT.windowMs) * RATE_LIMIT.windowMs;
  const key = `${kind}:${userId}`;

  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key_window", (q) => q.eq("key", key))
    .filter((q) => q.eq(q.field("windowStart"), windowStart))
    .first();

  if (row) {
    if (row.count >= RATE_LIMIT.max) {
      throw new Error(
        `Rate limit reached (${RATE_LIMIT.max} analyses per minute). Please wait a moment.`,
      );
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
  } else {
    await ctx.db.insert("rateLimits", { key, windowStart, count: 1 });
  }
}

// ---------------------------------------------------------------------------
// Analysis mutations
// ---------------------------------------------------------------------------

/**
 * Run the full text analysis pipeline and persist the result.
 * Returns the analysis id plus the result so the UI can render immediately.
 */
export const analyze = mutation({
  args: {
    text: v.string(),
    urls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { text, urls }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Authentication required. Sign in to run an analysis.");
    }

    await checkRateLimit(ctx, userId, "text");

    let result: TextAnalysisResult;
    try {
      result = analyzeText(text, urls);
    } catch (err) {
      if (err instanceof ValidationError) throw new Error(err.message);
      throw err;
    }

    const now = Date.now();
    const trimmed = text.trim();
    const title =
      trimmed.slice(0, 80).replace(/\s+/g, " ") +
      (trimmed.length > 80 ? "…" : "");

    const analysisId = await ctx.db.insert("analyses", {
      userId,
      kind: "text",
      inputPreview: truncateForStorage(text),
      urls: result.urlReports.map((u) => u.url),
      riskLevel: result.assessment.riskLevel,
      riskScore: result.assessment.riskScore,
      resultJson: JSON.stringify(result),
      modelVersion: result.ml.modelVersion,
      analyzerVersion: ANALYZER_VERSION,
      createdAt: now,
    });

    return { analysisId, result };
  },
});

/**
 * Standalone URL analysis. Routes through the same scoring engine so a
 * link-only analysis produces the same evidence shape as a text one.
 */
export const analyzeUrl = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Authentication required. Sign in to run an analysis.");
    }

    await checkRateLimit(ctx, userId, "url");

    const urlResult = analyzeUrlOnly(url);
    const now = Date.now();

    const assessment = assessLinkOnly(urlResult);

    const finalResult: TextAnalysisResult = {
      entities: [],
      findings: [],
      ml: {
        scamProbability: 0.5,
        confidence: 0,
        modelVersion: "none",
        topScamTokens: [],
        topLegitTokens: [],
      },
      urlReports: [urlResult],
      assessment,
      summary: `Link ${urlResult.host} analyzed: ${urlResult.verdict.replace(/_/g, " ")}.`,
    };

    const analysisId = await ctx.db.insert("analyses", {
      userId,
      kind: "url",
      inputPreview: truncateForStorage(url, 500),
      urls: [urlResult.url],
      riskLevel: assessment.riskLevel,
      riskScore: assessment.riskScore,
      resultJson: JSON.stringify(finalResult),
      modelVersion: "none",
      analyzerVersion: ANALYZER_VERSION,
      createdAt: now,
    });

    return { analysisId, result: finalResult };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Paginated history for the signed-in user (newest first). */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("analyses")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 50, 100));
  },
});

/** Fetch one analysis; only the owner can read it. */
export const get = query({
  args: { id: v.id("analyses") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) return null;
    return row;
  },
});

/** Feedback rows the user has submitted (for their own review). */
export const myFeedback = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Aggregate statistics for the signed-in user. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { total: 0, highRisk: 0, byLevel: [] as { level: string; count: number }[] };
    }
    const all = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const levels = [
      "LOW RISK",
      "MEDIUM RISK",
      "HIGH RISK",
      "CRITICAL RISK",
      "INSUFFICIENT EVIDENCE",
    ];
    const byLevel = levels
      .map((level) => ({ level, count: all.filter((a) => a.riskLevel === level).length }))
      .filter((row) => row.count > 0);

    return {
      total: all.length,
      highRisk: all.filter(
        (a) => a.riskLevel === "HIGH RISK" || a.riskLevel === "CRITICAL RISK",
      ).length,
      byLevel,
    };
  },
});

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Submit feedback on an analysis (must be the owner). */
export const submitFeedback = mutation({
  args: {
    analysisId: v.id("analyses"),
    verdict: v.union(
      v.literal("correct"),
      v.literal("incorrect"),
      v.literal("not_sure"),
    ),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { analysisId, verdict, comment }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");

    const analysis = await ctx.db.get(analysisId);
    if (!analysis || analysis.userId !== userId) {
      throw new Error("Analysis not found.");
    }

    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_analysis", (q) => q.eq("analysisId", analysisId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { verdict, comment });
      return existing._id;
    }

    return await ctx.db.insert("feedback", {
      analysisId,
      userId,
      verdict,
      comment: comment ? truncateForStorage(comment, 500) : undefined,
    });
  },
});
