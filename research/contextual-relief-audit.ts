/**
 * Research-only contextual legitimacy relief audit.
 *
 * Does NOT change production scoring. It takes the existing v1 analysis result
 * and tests a bounded, evidence-based legitimacy relief layer against the
 * frozen seed corpus.
 *
 * The signals are deliberately conservative:
 * - explicit "no fee/no OTP/no payment" statements
 * - ordinary operational context (shipping, rent/landlord, class/assignment,
 *   birthday, department portal, cash-on-delivery)
 * - explicit official-source wording
 *
 * The candidate relief is capped and never overrides a strong URL/rule signal.
 */

import { analyzeText } from "../src/lib/analyzer/index";
import { levelForScore } from "../src/lib/analyzer/scoring";
import { SEED_DATASET } from "../src/lib/analyzer/dataset";

interface Signal {
  code: string;
  points: number;
  evidence: string[];
}

function detectSignals(text: string): Signal[] {
  const normalized = text.toLowerCase();
  const signals: Signal[] = [];

  const explicitNegations = [
    /\bno\s+(?:payment|payments|fee|fees|charges?|cost)\b/gi,
    /\bno\s+otp\b/gi,
    /\b(?:no|never)\s+(?:required|charged|asked)\b/gi,
    /\bnot\s+(?:required|charged)\b/gi,
  ];

  const negationEvidence = explicitNegations.flatMap((pattern) =>
    [...normalized.matchAll(pattern)].map((match) => match[0]),
  );
  if (negationEvidence.length > 0) {
    signals.push({
      code: "explicit-no-payment-or-credential",
      points: 8,
      evidence: [...new Set(negationEvidence)],
    });
  }

  const routinePatterns: Array<[string, RegExp, number]> = [
    ["routine-shipping", /\b(?:already\s+)?shipped\b|\btracking\b|\btrack\s+it\b/gi, 3],
    ["cash-on-delivery", /\bcash\s+on\s+delivery\b/gi, 2],
    ["landlord-rent", /\blandlord\b|\brent\b|\bas\s+per\s+agreement\b/gi, 4],
    ["academic-routine", /\bclass\s+online\b|\bdepartment\s+portal\b|\bassignment\s+pdf\b|\bzoom\s+link\b/gi, 4],
    ["social-routine", /\bhappy\s+birthday\b|\bnamaste\s+ji\b/gi, 3],
    ["official-source", /\bofficial\s+(?:site|website|portal)\b/gi, 2],
  ];

  for (const [code, pattern, points] of routinePatterns) {
    const evidence = [...normalized.matchAll(pattern)].map((match) => match[0]);
    if (evidence.length > 0) signals.push({ code, points, evidence });
  }

  return signals;
}

function candidateScore(text: string) {
  const baseline = analyzeText(text);
  const signals = detectSignals(text);
  const strongRule = baseline.findings.some((finding) => finding.weight >= 10);
  const dangerousUrl = baseline.urlReports.some(
    (url) => url.verdict === "dangerous",
  );

  let relief = signals.reduce((sum, signal) => sum + signal.points, 0);
  if (strongRule || dangerousUrl) relief = Math.min(relief, 4);
  relief = Math.min(relief, 12);

  const score = Math.max(0, baseline.assessment.riskScore - relief);

  return {
    baselineScore: baseline.assessment.riskScore,
    baselineLevel: baseline.assessment.riskLevel,
    candidateScore: score,
    candidateLevel: levelForScore(score),
    relief,
    signals,
    strongRule,
    dangerousUrl,
  };
}

const falsePositiveCandidates = SEED_DATASET.filter((example) => {
  const result = analyzeText(example.text);
  return example.label === "legit" && result.ml.scamProbability >= 0.5;
});

const beforeLevels = new Map<string, number>();
const afterLevels = new Map<string, number>();

for (const example of SEED_DATASET) {
  if (example.label !== "legit") continue;

  const result = candidateScore(example.text);
  beforeLevels.set(result.baselineLevel, (beforeLevels.get(result.baselineLevel) ?? 0) + 1);
  afterLevels.set(result.candidateLevel, (afterLevels.get(result.candidateLevel) ?? 0) + 1);
}

console.log(
  JSON.stringify(
    {
      datasetSize: SEED_DATASET.length,
      legitMlFalsePositiveCount: falsePositiveCandidates.length,
      baselineLevelCountsOnLegit: Object.fromEntries(beforeLevels),
      candidateLevelCountsOnLegit: Object.fromEntries(afterLevels),
      audits: falsePositiveCandidates.map((example) => ({
        text: example.text,
        ...candidateScore(example.text),
      })),
    },
    null,
    2,
  ),
);
