/**
 * ScamShield AI — text classifier (multinomial Naive Bayes).
 *
 * Trained at module load on the seed dataset in dataset.ts. Evaluation metrics
 * are MEASURED via stratified 5-fold cross-validation at load time — they are
 * computed, never invented, and are surfaced in the UI.
 *
 * The interface (predict + explainable token weights) is deliberately simple
 * so a stronger transformer-based model can replace it later.
 */

import { SEED_DATASET, type LabeledExample } from "./dataset";
import { normalizePipelineInput } from "./normalize";

export const MODEL_VERSION = "nb-scam-v1";

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were",
  "be", "been", "it", "this", "that", "for", "on", "at", "as", "by", "with",
  "from", "your", "you", "we", "our", "us", "i", "me", "my", "do", "does",
  "will", "shall", "can", "could", "would", "should", "he", "she", "they",
  "them", "his", "her", "its", "if", "not", "no", "yes", "so", "there",
]);

/** Punctuation- and Unicode-aware tokenizer. */
export function tokenize(text: string): string[] {
  const normalized = normalizePipelineInput(text);
  const words = normalized.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  return words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface NaiveBayesModel {
  priorScam: number;
  tokenLogOdds: Map<string, number>; // log P(t|scam) - log P(t|legit), Laplace-smoothed
  vocabSize: number;
  totalScam: number;
  totalLegit: number;
}

function trainModel(examples: LabeledExample[]): NaiveBayesModel {
  const tokenScam = new Map<string, number>();
  const tokenLegit = new Map<string, number>();
  let totalScam = 0;
  let totalLegit = 0;
  const vocab = new Set<string>();

  for (const ex of examples) {
    const tokens = tokenize(ex.text);
    const target = ex.label === "scam" ? tokenScam : tokenLegit;
    for (const t of tokens) {
      target.set(t, (target.get(t) ?? 0) + 1);
      vocab.add(t);
      if (ex.label === "scam") totalScam++;
      else totalLegit++;
    }
  }

  const nScam = examples.filter((e) => e.label === "scam").length;
  const nLegit = examples.filter((e) => e.label === "legit").length;
  const priorScam = nScam / Math.max(1, nScam + nLegit);

  const alpha = 1; // Laplace smoothing
  const tokenLogOdds = new Map<string, number>();
  const vSize = vocab.size + alpha;

  for (const t of vocab) {
    const s = (tokenScam.get(t) ?? 0) + alpha;
    const l = (tokenLegit.get(t) ?? 0) + alpha;
    tokenLogOdds.set(
      t,
      Math.log(s / (totalScam + vSize)) - Math.log(l / (totalLegit + vSize)),
    );
  }

  return { priorScam, tokenLogOdds, vocabSize: vocab.size, totalScam, totalLegit };
}

// ---------------------------------------------------------------------------
// Inference + explanation
// ---------------------------------------------------------------------------

export interface NaiveBayesPrediction {
  scamProbability: number;
  confidence: number; // margin from the 0.5 decision boundary, 0..1
  modelVersion: string;
  topScamTokens: { token: string; logOdds: number }[];
  topLegitTokens: { token: string; logOdds: number }[];
}

/** Predict with the model trained on the full seed dataset. */
export function predictText(text: string): NaiveBayesPrediction {
  const tokens = tokenize(text);
  // log P(scam|x) - log P(legit|x), from prior + summed token log-odds
  let logOddsSum = Math.log(model.priorScam / (1 - model.priorScam));
  // Aggregate by token: repeated words contribute repeatedly to the score, and
  // the explanation must show one entry per distinct token with the summed
  // log-odds (also keeps the UI's per-token keys unique).
  const aggregated = new Map<string, number>();

  for (const t of tokens) {
    const lo = model.tokenLogOdds.get(t);
    if (lo !== undefined) {
      logOddsSum += lo;
      aggregated.set(t, (aggregated.get(t) ?? 0) + lo);
    }
  }

  const contributions = Array.from(aggregated, ([token, logOdds]) => ({ token, logOdds }));
  const scamProbability = 1 / (1 + Math.exp(-logOddsSum));

  contributions.sort((a, b) => b.logOdds - a.logOdds);
  const topScamTokens = contributions.filter((c) => c.logOdds > 0).slice(0, 5);
  const topLegitTokens = contributions
    .filter((c) => c.logOdds < 0)
    .slice(-5)
    .reverse();

  // Margin: distance from decision boundary, normalized to 0..1.
  const margin = Math.min(1, Math.abs(scamProbability - 0.5) / 0.5);

  return {
    scamProbability,
    confidence: margin,
    modelVersion: MODEL_VERSION,
    topScamTokens,
    topLegitTokens,
  };
}

// ---------------------------------------------------------------------------
// Evaluation: stratified 5-fold cross-validation (measured at load time)
// ---------------------------------------------------------------------------

export interface ConfusionMatrix {
  tp: number; // scam predicted scam
  fp: number; // legit predicted scam (false alarm)
  fn: number; // scam predicted legit (missed scam)
  tn: number; // legit predicted legit
}

export interface Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  specificity: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  confusion: ConfusionMatrix;
}

export function computeMetrics(cm: ConfusionMatrix): Metrics {
  const { tp, fp, fn, tn } = cm;
  const total = tp + fp + fn + tn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  return {
    accuracy,
    precision,
    recall,
    f1,
    specificity,
    falsePositiveRate: 1 - specificity,
    falseNegativeRate: fn + tp > 0 ? fn / (fn + tp) : 0,
    confusion: cm,
  };
}

function predictWith(model: NaiveBayesModel, text: string): number {
  let logOddsSum = Math.log(model.priorScam / (1 - model.priorScam));
  for (const t of tokenize(text)) {
    const lo = model.tokenLogOdds.get(t);
    if (lo !== undefined) logOddsSum += lo;
  }
  return 1 / (1 + Math.exp(-logOddsSum));
}

/** Stratified k-fold CV over the seed dataset; deterministic (stable fold assignment). */
export function crossValidate(k = 5): Metrics {
  const scams = SEED_DATASET.filter((e) => e.label === "scam");
  const legits = SEED_DATASET.filter((e) => e.label === "legit");
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (let fold = 0; fold < k; fold++) {
    const trainSet: LabeledExample[] = [];
    const testSet: LabeledExample[] = [];
    for (const pool of [scams, legits]) {
      pool.forEach((ex, i) => {
        if (i % k === fold) testSet.push(ex);
        else trainSet.push(ex);
      });
    }
    const m = trainModel(trainSet);
    for (const ex of testSet) {
      const p = predictWith(m, ex.text);
      const predictedScam = p >= 0.5;
      if (ex.label === "scam") {
        if (predictedScam) cm.tp++;
        else cm.fn++;
      } else {
        if (predictedScam) cm.fp++;
        else cm.tn++;
      }
    }
  }

  return computeMetrics(cm);
}

// ---------------------------------------------------------------------------
// Model singleton (trained once on the full dataset)
// ---------------------------------------------------------------------------

const model: NaiveBayesModel = trainModel(SEED_DATASET);
export const MODEL_METRICS: Metrics = crossValidate(5);
export const DATASET_SIZE = SEED_DATASET.length;
