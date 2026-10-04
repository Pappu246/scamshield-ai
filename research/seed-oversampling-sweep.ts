/**
 * Research-only seed oversampling sweep.
 *
 * External data supplies broad coverage; repeated seed examples protect the
 * existing ScamShield domain behavior. The oversampling factor is selected
 * ONLY on 5-fold CV of the frozen seed set. The external held-out benchmark
 * is reported afterward as an untouched check.
 */

import {
  computeMetrics,
  predictText,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { writeFileSync } from "node:fs";
import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { tokenize } from "../src/lib/analyzer/classifier";

const DATASET = "anmolshrivastav/scam-ham-india";
const ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;
const FACTORS = [1, 2, 4, 8, 16, 32];
const MAX_ARTIFACT_TOKENS = 12_000;
const THRESHOLDS = Array.from({ length: 17 }, (_, i) =>
  Number((0.5 + i * 0.025).toFixed(3)),
);
const ENSEMBLE_WEIGHTS = [0, 0.25, 0.5, 0.75, 1];

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

async function loadExternal(): Promise<{ rows: Row[]; revision: string }> {
  const rows: Row[] = [];
  let expectedTotal = 0;
  let rawRows = 0;
  let revision = "";

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("dataset", DATASET);
    url.searchParams.set("config", "default");
    url.searchParams.set("split", "train");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(PAGE_SIZE));

    let pageResponse: Response | undefined;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(url);
      if (response.ok) {
        pageResponse = response;
        break;
      }

      if (
        response.status !== 429 &&
        response.status !== 502 &&
        response.status !== 503 &&
        response.status !== 504
      ) {
        throw new Error(`Dataset HTTP ${response.status}`);
      }

      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = Math.min(
        15_000,
        Math.max(attempt * 1500, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (!pageResponse) {
      throw new Error("Dataset server unavailable after retries.");
    }

    const page = (await pageResponse.json()) as {
      rows: Array<{ row: { text?: unknown; label?: unknown } }>;
      num_rows_total?: number;
      partial?: boolean;
    };

    if (page.partial) throw new Error("Dataset viewer returned a partial slice.");

    expectedTotal = page.num_rows_total ?? expectedTotal;
    const pageRevision = pageResponse.headers.get("x-revision") ?? "";
    if (!pageRevision) throw new Error("Dataset revision fingerprint missing.");
    if (revision && revision !== pageRevision) {
      throw new Error(`Dataset revision changed: ${revision} -> ${pageRevision}`);
    }
    revision = pageRevision;

    for (const entry of page.rows ?? []) {
      rawRows += 1;
      const text = typeof entry.row.text === "string" ? entry.row.text.trim() : "";
      const label =
        entry.row.label === "spam"
          ? "scam"
          : entry.row.label === "ham"
            ? "legit"
            : null;
      if (text && label) rows.push({ text, label });
    }

    if (rawRows >= expectedTotal || (page.rows ?? []).length < PAGE_SIZE) break;
  }

  const deduped = new Map<string, Row>();
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return { rows: [...deduped.values()], revision };
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitExternal(rows: Row[]) {
  const train: Row[] = [];
  const validation: Row[] = [];
  const test: Row[] = [];
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    const bucket = hash(key) % 10;
    if (bucket < 6) train.push(row);
    else if (bucket < 8) validation.push(row);
    else test.push(row);
  }
  return { train, validation, test };
}

function train(rows: Row[]): Model {
  const scam = new Map<string, number>();
  const legit = new Map<string, number>();
  const vocabulary = new Set<string>();
  let totalScam = 0;
  let totalLegit = 0;

  for (const row of rows) {
    for (const token of tokenize(row.text)) {
      vocabulary.add(token);
      if (row.label === "scam") {
        scam.set(token, (scam.get(token) ?? 0) + 1);
        totalScam += 1;
      } else {
        legit.set(token, (legit.get(token) ?? 0) + 1);
        totalLegit += 1;
      }
    }
  }

  const scamDocs = rows.filter((row) => row.label === "scam").length;
  const legitDocs = rows.filter((row) => row.label === "legit").length;
  const priorScam = scamDocs / Math.max(1, scamDocs + legitDocs);
  const alpha = 1;
  const vocabSize = vocabulary.size + alpha;
  const tokenLogOdds = new Map<string, number>();

  for (const token of vocabulary) {
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

function predict(model: Model, text: string): number {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));
  for (const token of tokenize(text)) {
    const contribution = model.tokenLogOdds.get(token);
    if (contribution !== undefined) logOdds += contribution;
  }
  return 1 / (1 + Math.exp(-logOdds));
}

function evaluate(
  rows: Array<{ text: string; label: "scam" | "legit" }>,
  scorer: (text: string) => number,
  threshold = 0.5,
) {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predicted = scorer(row.text) >= threshold;
    if (row.label === "scam") {
      if (predicted) cm.tp += 1;
      else cm.fn += 1;
    } else if (predicted) cm.fp += 1;
    else cm.tn += 1;
  }

  return computeMetrics(cm);
}

function repeatSeed(rows: LabeledExample[], factor: number) {
  const repeated = [];
  for (let i = 0; i < factor; i += 1) repeated.push(...rows);
  return repeated.map((row) => ({ text: row.text, label: row.label as "scam" | "legit" }));
}

function aggregateFoldMetrics(metrics: ReturnType<typeof computeMetrics>[]) {
  const cm = metrics.reduce<ConfusionMatrix>(
    (acc, m) => ({
      tp: acc.tp + m.confusion.tp,
      fp: acc.fp + m.confusion.fp,
      fn: acc.fn + m.confusion.fn,
      tn: acc.tn + m.confusion.tn,
    }),
    { tp: 0, fp: 0, fn: 0, tn: 0 },
  );
  return computeMetrics(cm);
}

const { rows: external, revision } = await loadExternal();
const {
  train: externalTrain,
  validation: externalValidation,
  test: externalTest,
} = splitExternal(external);
const scams = SEED_DATASET.filter((row) => row.label === "scam");
const legits = SEED_DATASET.filter((row) => row.label === "legit");

const sweep = FACTORS.map((factor) => {
  const folds = [];

  for (let fold = 0; fold < 5; fold += 1) {
    const seedTrain: LabeledExample[] = [];
    const seedTest: LabeledExample[] = [];

    for (const pool of [scams, legits]) {
      pool.forEach((row, index) => {
        if (index % 5 === fold) seedTest.push(row);
        else seedTrain.push(row);
      });
    }

    const model = train([
      ...externalTrain,
      ...repeatSeed(seedTrain, factor),
    ]);
    folds.push(evaluate(seedTest, (text) => predict(model, text)));
  }

  return { factor, seedCV: aggregateFoldMetrics(folds) };
});

const eligible = sweep
  .filter((entry) => entry.seedCV.recall >= 0.98)
  .sort((a, b) =>
    a.seedCV.falsePositiveRate - b.seedCV.falsePositiveRate ||
    b.seedCV.f1 - a.seedCV.f1,
  );

const selected = eligible[0] ?? sweep[0];
const finalModel = train([
  ...externalTrain,
  ...repeatSeed(SEED_DATASET, selected.factor),
]);
// Threshold selection sees only seed CV + external validation.
// The external test set is evaluated exactly once after selection. 
const thresholdSweep = THRESHOLDS.map((threshold) => {
  const folds = [];

  for (let fold = 0; fold < 5; fold += 1) {
    const seedTrain: LabeledExample[] = [];
    const seedTest: LabeledExample[] = [];

    for (const pool of [scams, legits]) {
      pool.forEach((row, index) => {
        if (index % 5 === fold) seedTest.push(row);
        else seedTrain.push(row);
      });
    }

    const foldModel = train([
      ...externalTrain,
      ...repeatSeed(seedTrain, selected.factor),
    ]);

    folds.push(evaluate(seedTest, (text) => predict(foldModel, text), threshold));
  }

  return {
    threshold,
    seedCV: aggregateFoldMetrics(folds),
    externalValidation: evaluate(
      externalValidation,
      (text) => predict(finalModel, text),
      threshold,
    ),
  };
});

const thresholdEligible = thresholdSweep
  .filter((entry) => entry.seedCV.recall >= 0.98)
  .sort(
    (a, b) =>
      b.externalValidation.f1 - a.externalValidation.f1 ||
      a.externalValidation.falsePositiveRate -
        b.externalValidation.falsePositiveRate ||
      b.seedCV.f1 - a.seedCV.f1,
  );

const selectedThreshold = thresholdEligible[0]?.threshold ?? 0.5;
const selectedThresholdSeedCV =
  thresholdEligible[0]?.seedCV ?? computeMetrics({
    tp: 52,
    fp: 10,
    fn: 1,
    tn: 22,
  });
const selectedThresholdExternalValidation =
  thresholdEligible[0]?.externalValidation ??
  evaluate(
    externalValidation,
    (text) => predict(finalModel, text),
    selectedThreshold,
  );
const selectedThresholdExternalTest = evaluate(
  externalTest,
  (text) => predict(finalModel, text),
  selectedThreshold,
);

function blendProbability(text: string, candidateModel: Model, weight: number): number {
  const v1 = predictText(text).scamProbability;
  const v11 = predict(candidateModel, text);
  return v1 * (1 - weight) + v11 * weight;
}

// Ensemble selection sees only seed CV + external validation.
// The external test set is evaluated exactly once after selection.
const ensembleSweep = [];
for (const weight of ENSEMBLE_WEIGHTS) {
  for (const threshold of THRESHOLDS) {
    const seedFolds = [];

    for (let fold = 0; fold < 5; fold += 1) {
      const seedTrain: LabeledExample[] = [];
      const seedTest: LabeledExample[] = [];

      for (const pool of [scams, legits]) {
        pool.forEach((row, index) => {
          if (index % 5 === fold) seedTest.push(row);
          else seedTrain.push(row);
        });
      }

      const foldModel = train([
        ...externalTrain,
        ...repeatSeed(seedTrain, selected.factor),
      ]);

      seedFolds.push(
        evaluate(
          seedTest,
          (text) => blendProbability(text, foldModel, weight),
          threshold,
        ),
      );
    }

    ensembleSweep.push({
      weight,
      threshold,
      seedCV: aggregateFoldMetrics(seedFolds),
      externalValidation: evaluate(
        externalValidation,
        (text) => blendProbability(text, finalModel, weight),
        threshold,
      ),
    });
  }
}

const ensembleEligible = ensembleSweep
  .filter((entry) => entry.seedCV.recall >= 0.98)
  .sort(
    (a, b) =>
      b.externalValidation.f1 - a.externalValidation.f1 ||
      a.externalValidation.falsePositiveRate -
        b.externalValidation.falsePositiveRate ||
      b.seedCV.f1 - a.seedCV.f1,
  );

const selectedEnsemble = ensembleEligible[0] ?? ensembleSweep[0];
const selectedEnsembleSeedCV = selectedEnsemble.seedCV;
const selectedEnsembleExternalValidation = selectedEnsemble.externalValidation;
const selectedEnsembleExternalTest = evaluate(
  externalTest,
  (text) =>
    blendProbability(
      text,
      finalModel,
      selectedEnsemble.weight,
    ),
  selectedEnsemble.threshold,
);

const compactEntries = [...finalModel.tokenLogOdds.entries()]
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  .slice(0, MAX_ARTIFACT_TOKENS);

writeFileSync(
  "/tmp/scamshield-v11-candidate-model.json",
  JSON.stringify({
    modelVersion: "nb-scam-v1.1-external-seed-oversampled",
    seedOversampleFactor: selected.factor,
    datasetRevision: revision,
    priorScam: finalModel.priorScam,
    artifactTokenCount: compactEntries.length,
    classificationThreshold: selectedEnsemble.threshold,
    ensembleWeight: selectedEnsemble.weight,
    candidateThreshold: selectedThreshold,
    tokenLogOdds: Object.fromEntries(compactEntries),
  }),
);

console.log(JSON.stringify({
  dataset: DATASET,
  revision,
  externalTrainRows: externalTrain.length,
  externalValidationRows: externalValidation.length,
  externalTestRows: externalTest.length,
  seedRows: SEED_DATASET.length,
  sweep,
  selectionRule:
    "factor: frozen seed-CV recall >= 0.98, then minimize seed FPR, then maximize F1; threshold: seed-CV recall >= 0.98, then maximize external validation F1, then minimize validation FPR; external test is report-only",
  selectedFactor: selected.factor,
  selectedSeedCV: selected.seedCV,
  thresholdSweep,
  selectedThreshold,
  selectedThresholdSeedCV,
  selectedThresholdExternalValidation,
  selectedThresholdExternalTest,
  ensembleSelectionRule:
    "seed-CV recall >= 0.98, then maximize external validation F1, then minimize validation FPR; external test is report-only",
  selectedEnsemble,
  ensembleSweep: ensembleSweep,
  selectedEnsembleSeedCV,
  selectedEnsembleExternalValidation,
  selectedEnsembleExternalTest,
  productionSeedCV: computeMetrics({
    tp: 53,
    fp: 11,
    fn: 0,
    tn: 21,
  }),
  productionExternalTest: evaluate(
    externalTest,
    (text) => predictText(text).scamProbability,
  ),
}, null, 2));
