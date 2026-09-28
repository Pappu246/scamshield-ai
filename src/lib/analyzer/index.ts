/**
 * ScamShield AI — public analysis API (orchestrator).
 *
 * Single entry point used by the frontend and the Convex backend:
 *
 *   analyzeText(text, urls) → TextAnalysisResult
 *   analyzeUrlOnly(url)     → UrlAnalysisResult
 *
 * Input is treated strictly as DATA:
 *   - text is never interpreted as instructions;
 *   - embedded prompt-injection patterns are flagged by the rule engine
 *     (rule INJ-001) and otherwise ignored;
 *   - no network calls, no shell, no file execution anywhere in the pipeline.
 */

import type {
  ExtractedEntity,
  Finding,
  MlPrediction,
  TextAnalysisResult,
  UrlAnalysisResult,
} from "./types";
import { normalizePipelineInput, normalizeText } from "./normalize";
import { extractEntities } from "./entities";
import { analyzeRules } from "./ruleEngine";
import { predictText, type NaiveBayesPrediction } from "./classifier";
import { analyzeUrl, parseUrl, InvalidUrlError } from "./urlAnalyzer";
import { assess } from "./scoring";
import { validateText, validateUrlList, ValidationError } from "./validation";

export type { NaiveBayesPrediction };

function mlToPrediction(p: NaiveBayesPrediction): MlPrediction {
  return {
    scamProbability: p.scamProbability,
    confidence: p.confidence,
    modelVersion: p.modelVersion,
    topScamTokens: p.topScamTokens,
    topLegitTokens: p.topLegitTokens,
  };
}

/**
 * Full text analysis pipeline:
 * normalize → entities → rules → ML → URL analysis → scoring → explanation.
 */
export function analyzeText(rawText: string, urls?: string[]): TextAnalysisResult {
  validateText(rawText);
  const safeUrls = validateUrlList(urls);

  const normalized = normalizePipelineInput(rawText);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  // Entities from normalized text (Unicode-safe; original preserved by caller).
  const entities: ExtractedEntity[] = extractEntities(normalized);

  // Rule engine (operates on normalized + transliterated text).
  const findings: Finding[] = analyzeRules(rawText);

  // ML layer.
  const prediction = mlToPrediction(predictText(rawText));

  // URLs: the ones found inside the text + user-supplied extra links.
  const textUrls = entities
    .filter((e) => e.kind === "url" || e.kind === "ip_url")
    .map((e) => e.value);
  const allUrls = [...new Set([...textUrls, ...safeUrls])].slice(0, 10);

  const urlReports: UrlAnalysisResult[] = [];
  for (const url of allUrls) {
    try {
      urlReports.push(analyzeUrl(url));
    } catch (err) {
      if (err instanceof InvalidUrlError) {
        // Unparseable link: keep it visible as unverifiable instead of failing.
        urlReports.push({
          url,
          urlKind: "domain",
          host: url,
          protocol: "unknown",
          isHttps: false,
          flags: [
            {
              id: "URL-000",
              title: "Could not parse this link",
              detail: "The link appears malformed. ScamShield analyzed nothing beyond noting it — unable to verify.",
              severity: "low",
            },
          ],
          featureFlags: ["unparseable"],
          verdict: "unverifiable",
          verification: "rule",
          note: "Unable to verify.",
        });
      } else {
        throw err;
      }
    }
  }

  const assessment = assess({ wordCount, findings, ml: prediction, urlReports, entities });

  // Plain-language summary of the strongest evidence.
  const summary = buildSummary(findings, prediction, urlReports, assessment.riskLevel);

  return { entities, findings, ml: prediction, urlReports, assessment, summary };
}

/** Standalone URL analysis (no text). */
export function analyzeUrlOnly(url: string): UrlAnalysisResult {
  return analyzeUrl(url);
}

function buildSummary(
  findings: Finding[],
  ml: MlPrediction,
  urls: UrlAnalysisResult[],
  level: string,
): string {
  if (level === "INSUFFICIENT EVIDENCE") {
    return "Not enough context to reach a conclusion. The message is short and shows no clear scam indicators — add more of the message or check back once you have the full text.";
  }

  const parts: string[] = [];
  const strong = findings.filter((f) => f.weight >= 10);
  if (strong.length > 0) {
    parts.push(
      `${strong.length} strong scam indicator${strong.length === 1 ? "" : "s"} detected`,
    );
  } else if (findings.length > 0) {
    parts.push(`${findings.length} minor indicator${findings.length === 1 ? "" : "s"} detected`);
  }

  const dangerousUrls = urls.filter((u) => u.verdict === "dangerous" || u.verdict === "suspicious");
  if (dangerousUrls.length > 0) {
    parts.push(`${dangerousUrls.length} link${dangerousUrls.length === 1 ? "" : "s"} with suspicious structural features`);
  }

  if (ml.confidence >= 0.3) {
    parts.push(
      ml.scamProbability >= 0.5
        ? `the text classifier leans scam-like (${Math.round(ml.scamProbability * 100)}%)`
        : `the text classifier leans legitimate (${Math.round((1 - ml.scamProbability) * 100)}%)`,
    );
  }

  if (parts.length === 0) {
    return "No significant scam indicators found, but absence of signals is not proof of safety.";
  }
  return `Analysis found ${parts.join(", ")}.`;
}

export { ValidationError };
export { normalizeText };
