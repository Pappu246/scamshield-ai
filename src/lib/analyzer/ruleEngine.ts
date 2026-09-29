/**
 * ScamShield AI — rule engine.
 *
 * Runs the structured rules (rules.ts) over normalized text, extracts verbatim
 * evidence fragments for each hit, and produces Finding objects for the
 * scoring engine.
 */

import type { Finding, RuleCategory } from "./types";
import { RULES, type RuleDef } from "./rules";
import { normalizePipelineInput } from "./normalize";

/** Maximum evidence fragment length kept per match. */
const MAX_EVIDENCE_LEN = 120;

export interface RuleHit {
  rule: RuleDef;
  evidence: string[];
}

/** Find all rule hits with verbatim evidence. */
export function runRuleEngine(rawText: string): RuleHit[] {
  const normalized = normalizePipelineInput(rawText);
  const hits: RuleHit[] = [];

  for (const rule of RULES) {
    const evidence: string[] = [];
    for (const pattern of rule.patterns) {
      const re = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
      );
      let match: RegExpExecArray | null;
      while ((match = re.exec(normalized)) !== null) {
        if (match[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        evidence.push(match[0].slice(0, MAX_EVIDENCE_LEN));
        if (evidence.length >= 3) break;
        if (re.lastIndex === match.index) re.lastIndex++;
      }
      if (evidence.length >= 3) break;
    }
    if (evidence.length > 0) hits.push({ rule, evidence });
  }

  return hits;
}

const SEVERITY_ORDER: Record<RuleCategory, number> = {
  financial: 1,
  credentials: 1,
  urgency: 2,
  impersonation: 2,
  "job-scam": 1,
  "scholarship-scam": 1,
  "investment-scam": 1,
  "reward-scam": 2,
  multilingual: 3,
  "sensitive-data": 2,
  injection: 4,
  contact: 3,
  behavioral: 3,
};

/** Findings sorted by severity for display. */
export function ruleHitsToFindings(hits: RuleHit[]): Finding[] {
  return hits.map(({ rule, evidence }) => ({
    id: rule.id,
    title: rule.title,
    category: rule.category,
    severity: rule.severity,
    explanation: rule.explanation,
    evidence,
    weight: rule.weight,
    source: "rule_engine" as const,
  }));
}

/** All rule-engine findings for a text, ordered by severity. */
export function analyzeRules(rawText: string): Finding[] {
  const findings = ruleHitsToFindings(runRuleEngine(rawText));
  return findings.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.category] ?? 9;
    const sb = SEVERITY_ORDER[b.category] ?? 9;
    if (sa !== sb) return sa - sb;
    return b.weight - a.weight;
  });
}
