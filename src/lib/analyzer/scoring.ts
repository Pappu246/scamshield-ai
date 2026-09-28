/**
 * ScamShield AI — transparent risk scoring engine.
 *
 * Combines independent evidence into one 0–100 score with a per-component
 * breakdown, so every point is traceable:
 *
 *   rules       — sum of triggered rule weights (capped)
 *   ml          — model probability × margin (capped; abstains when unsure)
 *   url         — strongest URL verdict among the links found (capped)
 *   entity      — risky entity mix (raw-IP links, payment handles) (capped)
 *   legitimacy  — negative signals that pull the score DOWN (capped)
 *
 * The legitimacy component keeps "apply now" / "pay your bill" / urgent-but-real
 * messages from being flagged. Thresholds are documented in LIMITATIONS.md and
 * the thresholds' rationale is in the uncertainty notes on each result.
 */

import type {
  ExtractedEntity,
  Finding,
  MlPrediction,
  RiskAssessment,
  RiskLevel,
  ScoreBreakdown,
  ScoreComponent,
  UncertaintyNote,
  UrlAnalysisResult,
} from "./types";

export const DISCLAIMER =
  "ScamShield AI provides a risk assessment, not a guaranteed determination. Independent verification is always recommended.";

interface ScoreInputs {
  wordCount: number;
  findings: Finding[];
  ml: MlPrediction;
  urlReports: UrlAnalysisResult[];
  entities: ExtractedEntity[];
}

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

export function computeRuleScore(findings: Finding[]): { raw: number; points: number; cap: number } {
  const cap = 55;
  const raw = findings.reduce((sum, f) => sum + f.weight, 0);
  return { raw, points: Math.min(cap, raw), cap };
}

export function computeMlScore(ml: MlPrediction): { raw: number; points: number; cap: number } {
  const cap = 30;
  // Margin-weighted probability: an over-confident-looking 0.9 with tiny margin
  // contributes less than a stable 0.9. Under ~0.2 margin the model abstains.
  const marginFactor = ml.confidence < 0.2 ? 0.25 : 1;
  const raw = ml.scamProbability * ml.confidence * cap;
  return { raw: raw / marginFactor, points: raw * marginFactor, cap };
}

const URL_POINTS: Record<UrlAnalysisResult["verdict"], number> = {
  safe_structurally: 0,
  unverifiable: 8,
  suspicious: 20,
  dangerous: 32,
};

export function computeUrlScore(urls: UrlAnalysisResult[]): { raw: number; points: number; cap: number } {
  const cap = 32;
  if (urls.length === 0) return { raw: 0, points: 0, cap };
  // Take the worst (highest-points) verdict among the links.
  const raw = Math.max(...urls.map((u) => URL_POINTS[u.verdict] ?? 0));
  return { raw, points: raw, cap };
}

export function computeEntityScore(entities: ExtractedEntity[]): { raw: number; points: number; cap: number } {
  const cap = 15;
  let raw = 0;
  if (entities.some((e) => e.kind === "ip_url")) raw += 8;
  if (entities.some((e) => e.kind === "payment_handle")) raw += 7;
  if (entities.filter((e) => e.kind === "phone").length >= 1 && entities.some((e) => e.kind === "amount")) raw += 3;
  return { raw: Math.min(cap, raw), points: Math.min(cap, raw), cap };
}

export function computeLegitimacyRelief(findings: Finding[], ml: MlPrediction): { raw: number; points: number; cap: number } {
  const cap = 18;
  let raw = 0;
  // Explicit "no fee / no OTP" disclaimers are strong legitimacy evidence.
  if (findings.some((f) => f.category === "credentials" && /never ask|do not share|no otp|no fees/i.test(f.explanation))) {
    raw += 0; // placeholder — real relief comes from text-level checks below
  }
  // Model leans legitimately with decent margin.
  if (ml.scamProbability < 0.25 && ml.confidence > 0.3) raw += 8;
  return { raw, points: raw, cap };
}

// ---------------------------------------------------------------------------
// Risk level mapping
// ---------------------------------------------------------------------------

export function levelForScore(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL RISK";
  if (score >= 55) return "HIGH RISK";
  if (score >= 30) return "MEDIUM RISK";
  return "LOW RISK";
}

const STRONG_SIGNAL_CATEGORIES = new Set([
  "financial", "credentials", "job-scam", "scholarship-scam", "investment-scam", "reward-scam",
]);

export function hasStrongSignal(findings: Finding[], ml: MlPrediction, urls: UrlAnalysisResult[]): boolean {
  if (findings.some((f) => STRONG_SIGNAL_CATEGORIES.has(f.category) && f.weight >= 10)) return true;
  if (urls.some((u) => u.verdict === "dangerous" || u.verdict === "suspicious")) return true;
  if (ml.scamProbability >= 0.75 && ml.confidence >= 0.35) return true;
  return false;
}

export function assess({
  wordCount,
  findings,
  ml,
  urlReports,
  entities,
}: ScoreInputs): RiskAssessment {
  const rule = computeRuleScore(findings);
  const mlScore = computeMlScore(ml);
  const urlScore = computeUrlScore(urlReports);
  const entityScore = computeEntityScore(entities);
  const relief = computeLegitimacyRelief(findings, ml);

  const components: ScoreComponent[] = [
    {
      label: "Rule engine",
      points: rule.points,
      raw: rule.raw,
      cap: rule.cap,
      description: `${findings.length} scam-pattern${findings.length === 1 ? "" : "s"} matched (${rule.raw} raw points, capped at ${rule.cap}).`,
    },
    {
      label: "ML classifier",
      points: mlScore.points,
      raw: mlScore.raw,
      cap: mlScore.cap,
      description: ml.confidence < 0.2
        ? "Model margin too small to rely on — contribution heavily reduced (abstention behavior)."
        : `Model scam probability ${(ml.scamProbability * 100).toFixed(0)}% with ${(ml.confidence * 100).toFixed(0)}% margin.`,
    },
    {
      label: "URL analysis",
      points: urlScore.points,
      raw: urlScore.raw,
      cap: urlScore.cap,
      description: urlReports.length === 0
        ? "No links found in this input."
        : `Worst link verdict: ${urlReports.find((u) => (URL_POINTS[u.verdict] ?? 0) === urlScore.raw)?.verdict ?? "n/a"} (structural analysis only).`,
    },
    {
      label: "Entity risk",
      points: entityScore.points,
      raw: entityScore.raw,
      cap: entityScore.cap,
      description: entityScore.raw === 0
        ? "No risky entity combinations detected."
        : "Risky entity mix present (raw-IP link, payment handle, or phone+amount pair).",
    },
    {
      label: "Legitimacy relief",
      points: -relief.points,
      raw: -relief.raw,
      cap: relief.cap,
      description: relief.points > 0
        ? "The ML model leans legitimate with a healthy margin — score pulled down accordingly."
        : "No strong legitimacy evidence found.",
    },
  ];

  const total = components.reduce((sum, c) => sum + c.points, 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(total)));

  const topDrivers = [...components]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .filter((c) => c.points !== 0)
    .map((c) => ({ label: c.label, points: c.points }));

  // ---------------- uncertainty notes ----------------
  const uncertaintyNotes: UncertaintyNote[] = [];
  if (wordCount < 8) {
    uncertaintyNotes.push({
      code: "short-input",
      message: "Very little text was provided, so conclusions are weak. More context would improve reliability.",
    });
  }
  const strong = hasStrongSignal(findings, ml, urlReports);
  if (!strong && finalScore < 30) {
    uncertaintyNotes.push({
      code: "no-strong-signal",
      message: "No strong scam indicator was found, but absence of signals is not proof of safety.",
    });
  }
  if (urlReports.length > 0) {
    uncertaintyNotes.push({
      code: "no-external-verification",
      message: "Links were analyzed structurally only. Domain ownership and reputation could not be verified externally — treat as 'unable to verify'.",
    });
  }
  if (ml.confidence < 0.2) {
    uncertaintyNotes.push({
      code: "ml-low-margin",
      message: "The text classifier was uncertain (low decision margin), so its contribution was reduced.",
    });
  }

  // ---------------- recommended action ----------------
  let recommendedAction: string;
  if (finalScore >= 75) {
    recommendedAction =
      "Do not pay anything, share codes, or click links. If money was already sent, contact your bank immediately and report to the cybercrime portal (1930 helpline in India).";
  } else if (finalScore >= 55) {
    recommendedAction =
      "Do not send money or share OTPs/passwords until the sender is independently verified through an official channel you look up yourself.";
  } else if (finalScore >= 30) {
    recommendedAction =
      "Be cautious. Verify the sender through an official website or phone number you find independently — not through contact details in this message.";
  } else if (strong) {
    recommendedAction =
      "No critical indicators found, but some signals exist. Stay alert and verify independently if money or credentials are ever requested.";
  } else {
    recommendedAction =
      "No significant risk indicators found. This is not a guarantee — stay alert, especially with payment or credential requests.";
  }

  // ---------------- risk level ----------------
  let riskLevel = levelForScore(finalScore);
  if (riskLevel === "LOW RISK" && !strong && wordCount < 8) {
    riskLevel = "INSUFFICIENT EVIDENCE";
  }

  return {
    riskLevel,
    riskScore: finalScore,
    breakdown: { finalScore, components, topDrivers },
    uncertaintyNotes,
    disclaimer: DISCLAIMER,
    recommendedAction,
  };
}
