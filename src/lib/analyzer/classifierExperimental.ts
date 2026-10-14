/**
 * ScamShield AI — v1.1 research-only classifier candidate.
 *
 * This file is intentionally NOT wired into the production analyzer.
 * It combines the existing word-level Naive Bayes probability with a
 * character n-gram Naive Bayes probability. The goal is to test whether
 * character features improve robustness to spelling variation and light
 * obfuscation without changing the frozen v1 model.
 */

import {
  computeMetrics,
  type ConfusionMatrix,
  type Metrics,
  predictText,
} from "./classifier";
import { SEED_DATASET, type LabeledExample } from "./dataset";
import { normalizePipelineInput } from "./normalize";

export const EXPERIMENTAL_MODEL_VERSION = "nb-scam-v1.1-char-ensemble";

/** Fixed before evaluation; this is not tuned on the test fold. */
export const CHAR_MODEL_WEIGHT = 0.25;

interface CharNaiveBayesModel {
  priorScam: number;
  gramLogOdds: Map<string, number>;
}

function charNgrams(text: string, minN = 3, maxN = 5): Set<string> {
  const normalized = normalizePipelineInput(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const padded = ` ${normalized} `;
  const grams = new Set<string>();

  for (let n = minN; n <= maxN; n += 1) {
    for (let i = 0; i + n <= padded.length; i += 1) {
      grams.add(padded.slice(i, i + n));
    }
  }

  return grams;
}

function trainCharModel(examples: LabeledExample[]): CharNaiveBayesModel {
  const scam = new Map<string, number>();
  const legit = new Map<string, number>();
  const vocabulary = new Set<string>();
  let scamDocs = 0;
  let legitDocs = 0;

  for (const example of examples) {
    const grams = charNgrams(example.text);
    const target = example.label === "scam" ? scam : legit;

    if (example.label === "scam") scamDocs += 1;
    else legitDocs += 1;

    for (const gram of grams) {
      target.set(gram, (target.get(gram) ?? 0) + 1);
      vocabulary.add(gram);
    }
  }

  const alpha = 1;
  const vocabularySize = vocabulary.size + alpha;
  const priorScam = scamDocs / Math.max(1, scamDocs + legitDocs);
  const gramLogOdds = new Map<string, number>();

  for (const gram of vocabulary) {
    const scamCount = (scam.get(gram) ?? 0) + alpha;
    const legitCount = (legit.get(gram) ?? 0) + alpha;

    gramLogOdds.set(
      gram,
      Math.log(scamCount / (scamDocs + vocabularySize)) -
        Math.log(legitCount / (legitDocs + vocabularySize)),
    );
  }

  return { priorScam, gramLogOdds };
}

function probabilityWithCharModel(
  model: CharNaiveBayesModel,
  text: string,
): number {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));

  for (const gram of charNgrams(text)) {
    const contribution = model.gramLogOdds.get(gram);
    if (contribution !== undefined) logOdds += contribution;
  }

  return 1 / (1 + Math.exp(-logOdds));
}

function predictExperimentalWithModels(
  wordProbability: number,
  charProbability: number,
): number {
  return (
    wordProbability * (1 - CHAR_MODEL_WEIGHT) +
    charProbability * CHAR_MODEL_WEIGHT
  );
}

/**
 * Experimental prediction using the production word model plus the fixed
 * character n-gram ensemble. Not used by the production analyzer in v1.
 */
export function predictTextExperimental(text: string) {
  const word = predictText(text);
  const charProbability = probabilityWithCharModel(charModel, text);
  const scamProbability = predictExperimentalWithModels(
    word.scamProbability,
    charProbability,
  );
  const confidence = Math.min(1, Math.abs(scamProbability - 0.5) / 0.5);

  return {
    ...word,
    scamProbability,
    confidence,
    modelVersion: EXPERIMENTAL_MODEL_VERSION,
  };
}

function trainExperimentalModels(examples: LabeledExample[]) {
  const wordModel = examples;
  return trainCharModel(wordModel);
}

function crossValidateExperimental(k = 5): Metrics {
  const scams = SEED_DATASET.filter((example) => example.label === "scam");
  const legits = SEED_DATASET.filter((example) => example.label === "legit");
  const confusion: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (let fold = 0; fold < k; fold += 1) {
    const trainSet: LabeledExample[] = [];
    const testSet: LabeledExample[] = [];

    for (const pool of [scams, legits]) {
      pool.forEach((example, index) => {
        if (index % k === fold) testSet.push(example);
        else trainSet.push(example);
      });
    }

    const charModel = trainExperimentalModels(trainSet);

    for (const example of testSet) {
      const wordPrediction = trainWordProbability(trainSet, example.text);
      const charPrediction = probabilityWithCharModel(charModel, example.text);
      const probability = predictExperimentalWithModels(
        wordPrediction,
        charPrediction,
      );
      const predictedScam = probability >= 0.5;

      if (example.label === "scam") {
        if (predictedScam) confusion.tp += 1;
        else confusion.fn += 1;
      } else if (predictedScam) {
        confusion.fp += 1;
      } else {
        confusion.tn += 1;
      }
    }
  }

  return computeMetrics(confusion);
}

function trainWordProbability(
  examples: LabeledExample[],
  text: string,
): number {
  const tokenScam = new Map<string, number>();
  const tokenLegit = new Map<string, number>();
  let totalScam = 0;
  let totalLegit = 0;
  const vocabulary = new Set<string>();

  for (const example of examples) {
    const tokens = tokenizeForResearch(example.text);
    const target = example.label === "scam" ? tokenScam : tokenLegit;

    for (const token of tokens) {
      target.set(token, (target.get(token) ?? 0) + 1);
      vocabulary.add(token);
      if (example.label === "scam") totalScam += 1;
      else totalLegit += 1;
    }
  }

  const scamDocs = examples.filter((example) => example.label === "scam").length;
  const legitDocs = examples.filter((example) => example.label === "legit").length;
  const priorScam = scamDocs / Math.max(1, scamDocs + legitDocs);
  const alpha = 1;
  const vocabularySize = vocabulary.size + alpha;
  let logOdds = Math.log(priorScam / Math.max(1e-9, 1 - priorScam));

  for (const token of tokenizeForResearch(text)) {
    if (!vocabulary.has(token)) continue;
    const scamCount = (tokenScam.get(token) ?? 0) + alpha;
    const legitCount = (tokenLegit.get(token) ?? 0) + alpha;
    logOdds +=
      Math.log(scamCount / (totalScam + vocabularySize)) -
      Math.log(legitCount / (totalLegit + vocabularySize));
  }

  return 1 / (1 + Math.exp(-logOdds));
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were",
  "be", "been", "it", "this", "that", "for", "on", "at", "as", "by", "with",
  "from", "your", "you", "we", "our", "us", "i", "me", "my", "do", "does",
  "will", "shall", "can", "could", "would", "should", "he", "she", "they",
  "them", "his", "her", "its", "if", "not", "no", "yes", "so", "there",
]);

function tokenizeForResearch(text: string): string[] {
  const normalized = normalizePipelineInput(text);
  const words = normalized.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  return words.filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

const charModel = trainExperimentalModels(SEED_DATASET);

export const EXPERIMENTAL_MODEL_METRICS = crossValidateExperimental(5);
