/**
 * Research-only threshold calibration experiment for the factor-32
 * external+seed candidate.
 *
 * Candidate training:
 *   anmolshrivastav/scam-ham-india train split + ScamShield seed data
 *   oversampled 32x.
 *
 * Threshold selection is assessed on the frozen seed CV and the primary
 * external held-out split. The UCI SMS collection is a separate benchmark
 * and is not used to choose a threshold.
 */

import {
  computeMetrics,
  type ConfusionMatrix,
  tokenize,
} from "../src/lib/analyzer/classifier";
import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { readFileSync } from "node:fs";

const PRIMARY_DATASET = "anmolshrivastav/scam-ham-india";
const PRIMARY_ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PRIMARY_PAGE_SIZE = 100;
const UCI_FILE = "/tmp/SMSSpamCollection";
const PRIMARY_FACTOR = 32;
const THRESHOLDS = Array.from({ length: 17 }, (_, i) =>
  Number((0.50 + i * 0.025).toFixed(3)),
);

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPrimary(): Promise<{
  rows: Row[];
  revision: string;
}> {
  const rows: Row[] = [];
  let total = 0;
  let rawRows = 0;
  let revision = "";

  for (let offset = 0; ; offset += PRIMARY_PAGE_SIZE) {
    const url = new URL(PRIMARY_ENDPOINT);
    url.searchParams.set("dataset", PRIMARY_DATASET);
    url.searchParams.set("config", "default");
    url.searchParams.set("split", "train");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(PRIMARY_PAGE_SIZE));

    let response: Response | undefined;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const candidate = await fetch(url);

      if (candidate.ok) {
        response = candidate;
        break;
      }

      if (
        candidate.status !== 429 &&
        candidate.status !== 502 &&
        candidate.status !== 503 &&
        candidate.status !== 504
      ) {
        throw new Error(
          `Primary dataset HTTP ${candidate.status} at offset ${offset}`,
        );
      }

      const retryAfter = Number(candidate.headers.get("retry-after") ?? "0");
      const delay = Math.min(
        15_000,
        Math.max(attempt * 1500, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0),
      );
      await sleep(delay);
    }

    if (!response) {
      throw new Error(`Primary dataset unavailable at offset ${offset}`);
    }

    const page = (await response.json()) as {
      rows: Array<{ row: { text?: unknown; label?: unknown } }>;
      num_rows_total?: number;
      partial?: boolean;
    };

    if (page.partial) throw new Error("Primary dataset returned a partial slice.");

    total = page.num_rows_total ?? total;
    const pageRevision = response.headers.get("x-revision") ?? "";
    if (!pageRevision) throw new Error("Primary dataset omitted x-revision.");
    if (revision && revision !== pageRevision) {
      throw new Error(
        `Primary dataset revision changed: ${revision} -> ${pageRevision}`,
      );
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

    if (rawRows >= total || (page.rows ?? []).length < PRIMARY_PAGE_SIZE) break;
  }

  const deduped = new Map<string, Row>();
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return { rows: [...deduped.values()], revision };
}

function loadUci(): Row[] {
  const lines = readFileSync(UCI_FILE, "utf8").split(/\r?\n/);
  const rows: Row[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab <= 0) continue;

    const labelValue = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();
    const label =
      labelValue === "spam"
        ? "scam"
        : labelValue === "ham"
          ? "legit"
          : null;

    if (text && label) rows.push({ text, label });
  }

  if (rows.length !== 5574) {
    throw new Error(`Expected 5574 UCI rows, got ${rows.length}`);
  }

  return rows;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitPrimary(rows: Row[]): { train: Row[]; test: Row[] } {
  const train: Row[] = [];
  const test: Row[] = [];

  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    (hash(key) % 5 === 0 ? test : train).push(row);
  }

  return { train, test };
}

function train(rows: Array<{ text: string; label: "scam" | "legit" }>): Model {
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

function probability(model: Model, text: string): number {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));

  for (const token of tokenize(text)) {
    const contribution = model.tokenLogOdds.get(token);
    if (contribution !== undefined) logOdds += contribution;
  }

  return 1 / (1 + Math.exp(-logOdds));
}

function evaluate(
  rows: Row[],
  model: Model,
  threshold: number,
) {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predictedScam = probability(model, row.text) >= threshold;

    if (row.label === "scam") {
      if (predictedScam) cm.tp += 1;
      else cm.fn += 1;
    } else if (predictedScam) {
      cm.fp += 1;
    } else {
      cm.tn += 1;
    }
  }

  return computeMetrics(cm);
}

function aggregate(metrics: ReturnType<typeof computeMetrics>[]) {
  const cm = metrics.reduce<ConfusionMatrix>(
    (acc, metric) => ({
      tp: acc.tp + metric.confusion.tp,
      fp: acc.fp + metric.confusion.fp,
      fn: acc.fn + metric.confusion.fn,
      tn: acc.tn + metric.confusion.tn,
    }),
    { tp: 0, fp: 0, fn: 0, tn: 0 },
  );

  return computeMetrics(cm);
}

const { rows: primary, revision } = await loadPrimary();
const uci = loadUci();
const { train: primaryTrain, test: primaryHeldOut } = splitPrimary(primary);

const seedScams = SEED_DATASET.filter((row) => row.label === "scam");
const seedLegits = SEED_DATASET.filter((row) => row.label === "legit");

const primaryModel = train([
  ...primaryTrain,
  ...SEED_DATASET.map((row) => ({ text: row.text, label: row.label })),
]);

const thresholdResults = THRESHOLDS.map((threshold) => {
  const seedFolds: ReturnType<typeof computeMetrics>[] = [];

  for (let fold = 0; fold < 5; fold += 1) {
    const seedTrain: LabeledExample[] = [];
    const seedTest: LabeledExample[] = [];

    for (const pool of [seedScams, seedLegits]) {
      pool.forEach((row, index) => {
        if (index % 5 === fold) seedTest.push(row);
        else seedTrain.push(row);
      });
    }

    const foldModel = train([
      ...primaryTrain,
      ...Array.from({ length: PRIMARY_FACTOR }, () =>
        seedTrain.map((row) => ({ text: row.text, label: row.label })),
      ).flat(),
    ]);

    seedFolds.push(evaluate(seedTest, foldModel, threshold));
  }

  return {
    threshold,
    seedCV: aggregate(seedFolds),
    primaryHeldOut: evaluate(primaryHeldOut, primaryModel, threshold),
    uciIndependent: evaluate(uci, primaryModel, threshold),
  };
});

const eligible = thresholdResults
  .filter((entry) => entry.seedCV.recall >= 0.98)
  .sort(
    (a, b) =>
      b.primaryHeldOut.f1 - a.primaryHeldOut.f1 ||
      a.seedCV.falsePositiveRate - b.seedCV.falsePositiveRate,
  );

console.log(
  JSON.stringify(
    {
      primaryDatasetRevision: revision,
      primaryTrainRows: primaryTrain.length,
      primaryHeldOutRows: primaryHeldOut.length,
      uciRows: uci.length,
      selectionRule:
        "seedCV recall >= 0.98, then maximize primary held-out F1, then minimize seed FPR",
      selectedThreshold: eligible[0]?.threshold ?? null,
      selected: eligible[0] ?? null,
      sweep: thresholdResults,
    },
    null,
    2,
  ),
);
