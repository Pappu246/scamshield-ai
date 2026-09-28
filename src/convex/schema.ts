import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const riskLevelValidator = v.union(
  v.literal("LOW RISK"),
  v.literal("MEDIUM RISK"),
  v.literal("HIGH RISK"),
  v.literal("CRITICAL RISK"),
  v.literal("INSUFFICIENT EVIDENCE"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ------------------------------------------------------------------
    // ScamShield AI
    // ------------------------------------------------------------------

    /**
     * One row per analysis. The full structured result is stored as JSON so
     * the result page is a pure render of persisted evidence (traceability).
     * Raw input is truncated (see lib/analyzer/validation.ts) to limit
     * retention of sensitive content.
     */
    analyses: defineTable({
      userId: v.id("users"),
      kind: v.union(v.literal("text"), v.literal("url")),
      /** Truncated raw input (text) or the analyzed URL. */
      inputPreview: v.string(),
      /** Full analyzed URLs, if any (max 5, from text or user-supplied). */
      urls: v.optional(v.array(v.string())),
      riskLevel: riskLevelValidator,
      riskScore: v.number(),
      /** Entire TextAnalysisResult / {urlAnalysis} serialized. */
      resultJson: v.string(),
      /** ML model version that produced the stored prediction. */
      modelVersion: v.string(),
      /** Analyzer version (pipeline/rules/scoring revision). */
      analyzerVersion: v.string(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"]),

    /**
     * User feedback on an analysis. Used for future model evaluation only —
     * never auto-retrains anything.
     */
    feedback: defineTable({
      analysisId: v.id("analyses"),
      userId: v.id("users"),
      verdict: v.union(
        v.literal("correct"),
        v.literal("incorrect"),
        v.literal("not_sure"),
      ),
      comment: v.optional(v.string()),
    })
      .index("by_analysis", ["analysisId"])
      .index("by_user", ["userId"]),

    /**
     * Fixed-window rate limit counters. One row per (key, windowStart).
     * key examples: "text:anonymous", "url:<userId>"
     */
    rateLimits: defineTable({
      key: v.string(),
      windowStart: v.number(),
      count: v.number(),
    }).index("by_key_window", ["key", "windowStart"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
