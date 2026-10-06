/*
 * Checked-in Convex API references for deterministic builds.
 */
import { anyApi, makeFunctionReference, type AnyApi, type FunctionReference } from "convex/server";
import type { TextAnalysisResult } from "../../lib/analyzer/types.js";
import type { Doc, Id } from "./dataModel.js";

type AnalyzeArgs = { text: string; urls?: string[] };
type AnalyzeReturn = { analysisId: Id<"analyses">; result: TextAnalysisResult };
type AnalyzeUrlArgs = { url: string };
type StatsReturn = { total: number; highRisk: number; byLevel: Array<{ level: string; count: number }> };
type FeedbackArgs = { analysisId: Id<"analyses">; verdict: "correct" | "incorrect" | "not_sure"; comment?: string };

export type AnalysesApi = {
  analyze: FunctionReference<"mutation", "public", AnalyzeArgs, AnalyzeReturn>;
  analyzeUrl: FunctionReference<"mutation", "public", AnalyzeUrlArgs, AnalyzeReturn>;
  listMine: FunctionReference<"query", "public", { limit?: number }, Doc<"analyses">[]>;
  get: FunctionReference<"query", "public", { id: Id<"analyses"> }, Doc<"analyses"> | null>;
  myFeedback: FunctionReference<"query", "public", Record<string, never>, Doc<"feedback">[]>;
  stats: FunctionReference<"query", "public", Record<string, never>, StatsReturn>;
  submitFeedback: FunctionReference<"mutation", "public", FeedbackArgs, Id<"feedback">>;
};

export type UsersApi = {
  currentUser: FunctionReference<"query", "public", Record<string, never>, Doc<"users"> | null>;
};

export type ScamShieldApi = {
  analyses: AnalysesApi;
  users: UsersApi;
};

export const api: ScamShieldApi = {
  analyses: {
    analyze: makeFunctionReference<"mutation", AnalyzeArgs, AnalyzeReturn>("analyses:analyze"),
    analyzeUrl: makeFunctionReference<"mutation", AnalyzeUrlArgs, AnalyzeReturn>("analyses:analyzeUrl"),
    listMine: makeFunctionReference<"query", { limit?: number }, Doc<"analyses">[]>("analyses:listMine"),
    get: makeFunctionReference<"query", { id: Id<"analyses"> }, Doc<"analyses"> | null>("analyses:get"),
    myFeedback: makeFunctionReference<"query", Record<string, never>, Doc<"feedback">[]>("analyses:myFeedback"),
    stats: makeFunctionReference<"query", Record<string, never>, StatsReturn>("analyses:stats"),
    submitFeedback: makeFunctionReference<"mutation", FeedbackArgs, Id<"feedback">>("analyses:submitFeedback"),
  },
  users: {
    currentUser: makeFunctionReference<"query", Record<string, never>, Doc<"users"> | null>("users:currentUser"),
  },
};

// Internal functions are backend-only; keep their dynamic reference semantics.
export const internal: AnyApi = anyApi;
