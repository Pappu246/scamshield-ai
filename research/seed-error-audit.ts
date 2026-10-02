/**
 * Research-only error audit for the frozen 85-example seed set.
 *
 * Reimplements the production word-level Naive Bayes training path so each
 * validation example is scored by a model that did not train on that example.
 * Outputs false positives and false negatives with token evidence.
 */

import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { normalizePipelineInput } from "../src/lib/analyzer/normalize";

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","is","are","was","were","be","been",
  "it","this","that","for","on","at","as","by","with","from","your","you","we",
  "our","us","i","me","my","do","does","will","shall","can","could","would",
  "should","he","she","they","them","his","her","its","if","not","no","yes",
  "so","there",
]);

function tokenize(text: string): string[] {
  const normalized = normalizePipelineInput(text);
  const words = normalized.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  return words.filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

function train(examples: LabeledExample[]): Model {
  const scam = new Map<string, number>();
  const legit = new Map<string, number>();
  const vocab = new Set<string>();
  let totalScam = 0;
  let totalLegit = 0;

  for (const example of examples) {
    const target = example.label === "scam" ? scam : legit;
    for (const token of tokenize(example.text)) {
      target.set(token, (target.get(token) ?? 0) + 1);
      vocab.add(token);
      if (example.label === "scam") totalScam += 1;
      else totalLegit += 1;
    }
  }

  const scamDocs = examples.filter((example) => example.label === "scam").length;
  const legitDocs = examples.filter((example) => example.label === "legit").length;
  const priorScam = scamDocs / Math.max(1, scamDocs + legitDocs);
  const alpha = 1;
  const vocabSize = vocab.size + alpha;
  const tokenLogOdds = new Map<string, number>();

  for (const token of vocab) {
    const s = (scam.get(token) ?? 0) + alpha;
    const l = (legit.get(token) ?? 0) + alpha;
    tokenLogOdds.set(
      token,
      Math.log(s / (totalScam + vocabSize)) -
        Math.log(l / (totalLegit + vocabSize)),
    );
  }

  return { priorScam, tokenLogOdds };
}

function predict(model: Model, text: string) {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));
  for (const token of tokenize(text)) {
    const weight = model.tokenLogOdds.get(token);
    if (weight !== undefined) logOdds += weight;
  }
  return 1 / (1 + Math.exp(-logOdds));
}

const falsePositives: Array<{ fold:number; probability:number; text:string; tokens:string[] }> = [];
const falseNegatives: Array<{ fold:number; probability:number; text:string; tokens:string[] }> = [];

const scams = SEED_DATASET.filter((e) => e.label === "scam");
const legits = SEED_DATASET.filter((e) => e.label === "legit");

for (let fold = 0; fold < 5; fold += 1) {
  const trainSet: LabeledExample[] = [];
  const testSet: LabeledExample[] = [];

  for (const pool of [scams, legits]) {
    pool.forEach((example, index) => {
      if (index % 5 === fold) testSet.push(example);
      else trainSet.push(example);
    });
  }

  const model = train(trainSet);

  for (const example of testSet) {
    const probability = predict(model, example.text);
    const predicted = probability >= 0.5;

    if (example.label === "legit" && predicted) {
      falsePositives.push({
        fold,
        probability,
        text: example.text,
        tokens: tokenize(example.text),
      });
    }

    if (example.label === "scam" && !predicted) {
      falseNegatives.push({
        fold,
        probability,
        text: example.text,
        tokens: tokenize(example.text),
      });
    }
  }
}

falsePositives.sort((a, b) => b.probability - a.probability);
falseNegatives.sort((a, b) => a.probability - b.probability);

console.log(JSON.stringify({
  datasetSize: SEED_DATASET.length,
  falsePositiveCount: falsePositives.length,
  falseNegativeCount: falseNegatives.length,
  falsePositives,
  falseNegatives,
}, null, 2));
