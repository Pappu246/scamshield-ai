/**
 * ScamShield AI — shared types for the analysis pipeline.
 *
 * Everything the pipeline produces is typed here so the rule engine, ML layer,
 * URL analyzer, scoring engine and the UI all agree on one shape.
 */

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export type EntityKind =
  | "url"
  | "ip_url"
  | "email"
  | "phone"
  | "payment_handle"
  | "amount"
  | "language";

export interface ExtractedEntity {
  kind: EntityKind;
  value: string;
  /** Lowercased host for URL entities, otherwise same as value. */
  host?: string;
}

// ---------------------------------------------------------------------------
// Rules (rule engine)
// ---------------------------------------------------------------------------

export type RuleCategory =
  | "financial"
  | "credentials"
  | "urgency"
  | "impersonation"
  | "job-scam"
  | "scholarship-scam"
  | "investment-scam"
  | "reward-scam"
  | "multilingual"
  | "sensitive-data"
  | "injection"
  | "contact"
  | "behavioral";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Where a piece of knowledge in a finding came from. */
export type FindingSource =
  | "rule_engine"
  | "ml_model"
  | "url_analysis"
  | "external_verification"
  | "entity_extraction";

export interface Finding {
  /** Rule ID, e.g. "PAY-001". For the ML finding this is the model id. */
  id: string;
  title: string;
  category: RuleCategory;
  severity: Severity;
  /** Short human explanation of why this matters. */
  explanation: string;
  /** Exact text fragments that triggered the finding (verbatim evidence). */
  evidence: string[];
  /** Weight contribution in points to the rule score. */
  weight: number;
  source: FindingSource;
}

// ---------------------------------------------------------------------------
// ML layer
// ---------------------------------------------------------------------------

export interface MlPrediction {
  /** Probability that the text is scam-like, 0..1. */
  scamProbability: number;
  /** 0..1 — margin from the decision boundary; low margins → low confidence. */
  confidence: number;
  modelVersion: string;
  /** Top features pushing the prediction toward "scam". */
  topScamTokens: { token: string; logOdds: number }[];
  /** Top features pushing the prediction toward "legitimate". */
  topLegitTokens: { token: string; logOdds: number }[];
}

export interface MlLayerOutput {
  prediction: MlPrediction;
  /** Finding emitted only when the margin is strong enough to report. */
  finding: Finding | null;
}

// ---------------------------------------------------------------------------
// URL analysis
// ---------------------------------------------------------------------------

export type UrlVerdict =
  | "safe_structurally"
  | "suspicious"
  | "dangerous"
  | "unverifiable";

export interface UrlFindingItem {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
}

export interface UrlAnalysisResult {
  url: string;
  urlKind: "ip" | "domain";
  host: string;
  protocol: string;
  isHttps: boolean;
  flags: UrlFindingItem[];
  featureFlags: string[];
  verdict: UrlVerdict;
  /** "rule" = local heuristics only; "external" = a reputation API was used. */
  verification: "rule" | "external";
  note?: string;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreComponent {
  label: string;
  /** Points contributed to the final 0–100 score. Signed — can be negative. */
  points: number;
  /** Raw score before capping, for transparency. */
  raw: number;
  cap: number;
  description: string;
}

export interface ScoreBreakdown {
  finalScore: number;
  components: ScoreComponent[];
  /** Strongest single contributors, derived from |points|. */
  topDrivers: { label: string; points: number }[];
}

export type RiskLevel =
  | "LOW RISK"
  | "MEDIUM RISK"
  | "HIGH RISK"
  | "CRITICAL RISK"
  | "INSUFFICIENT EVIDENCE";

export interface UncertaintyNote {
  code:
    | "short-input"
    | "no-strong-signal"
    | "no-external-verification"
    | "ml-low-margin";
  message: string;
}

export interface RiskAssessment {
  riskLevel: RiskLevel;
  riskScore: number;
  breakdown: ScoreBreakdown;
  uncertaintyNotes: UncertaintyNote[];
  disclaimer: string;
  recommendedAction: string;
}

// ---------------------------------------------------------------------------
// Analysis result
// ---------------------------------------------------------------------------

export interface TextAnalysisResult {
  entities: ExtractedEntity[];
  findings: Finding[];
  ml: MlPrediction;
  urlReports: UrlAnalysisResult[];
  assessment: RiskAssessment;
  summary: string;
}

// ---------------------------------------------------------------------------
// Persistence (Convex) — mirrors src/convex/schema.ts
// ---------------------------------------------------------------------------

export type AnalysisKind = "text" | "url";

export interface StoredAnalysisSummary {
  _id: string;
  kind: AnalysisKind;
  riskLevel: RiskLevel;
  riskScore: number;
  title: string;
  createdAt: number;
}
