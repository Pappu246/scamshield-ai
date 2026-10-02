/**
 * Research-only ensemble sweep.
 *
 * Combines the frozen v1 word model probability with the v1.1 external+seed
 * candidate probability. No production code is modified.
 *
 * Weight and threshold are selected using the frozen seed CV plus the primary
 * external held-out split; UCI SMS remains an independent benchmark.
 */

import {
  computeMetrics,
  predictText,
  type ConfusionMatrix,
  tokenize,
} from "../src/lib/analyzer/classifier";
import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { readFileSync } from "node:fs";

const PRIMARY_DATASET = "anmolshrivastav/scam-ham-india";
const PRIMARY_ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;
const FACTOR = 32;
const WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];
const UCI_FILE = "/tmp/SMSSpamCollection";

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPrimary(): Promise<{ rows: Row[]; revision: string }> {
  const rows: Row[] = [];
  let expectedTotal = 0;
  let rawRows = 0;
  let revision = "";

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(PRIMARY_ENDPOINT);
    url.searchParams.set("dataset", PRIMARY_DATASET);
    url.searchParams.set("config", "default");
    url.searchParams.set("split", "train");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(PAGE_SIZE));

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
        throw new Error(`Primary dataset HTTP ${candidate.status}`);
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

    expectedTotal = page.num_rows_total ?? expectedTotal;
    const pageRevision = response.headers.get("x-revision") ?? "";
    if (!pageRevision) throw new Error("Primary dataset omitted x-revision.");

    if (revision && revision !== pageRevision) {
      throw new Error(`Primary dataset revision changed: ${revision} -> ${pageRevision}`);
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

function loadUci(): Row[] {
  const rows: Row[] = [];
  for (const line of readFileSync(UCI_FILE, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const tab = line.indexOf("\t");
    if (tab <= 0) continue;

    const value = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();
    const label =
      value === "spam"
        ? "scam"
        : value === "ham"
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

function candidateProbability(model: Model, text: string): number {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));

  for (const token of tokenize(text)) {
    const weight = model.tokenLogOdds.get(token);
    if (weight !== undefined) logOdds += weight;
  }

  return 1 / (1 + Math.exp(-logOdds));
}

function blendedProbability(
  text: string,
  candidate: Model,
  weight: number,
): number {
  const v1 = predictText(text).scamProbability;
  const v11 = candidateProbability(candidate, text);
  return v1 * (1 - weight) + v11 * weight;
}

function evaluate(
  rows: Row[],
  scorer: (text: string) => number,
  threshold: number,
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
const { train: primaryTrain, test: primaryHeldOut } = splitPrimary(primary);
const uci = loadUci();

const scams = SEED_DATASET.filter((row) => row.label === "scam");
const legits = SEED_DATASET.filter((row) => row.label === "legit");

const finalCandidate = train([
  ...primaryTrain,
  ...Array.from({ length: FACTOR }, () =>
    SEED_DATASET.map((row) => ({ text: row.text, label: row.label })),
  ).flat(),
]);

const combinations = [];

for (const weight of WEIGHTS) {
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
        ...primaryTrain,
        ...Array.from({ length: FACTOR }, () =>
          seedTrain.map((row) => ({ text: row.text, label: row.label })),
        ).flat(),
      ]);

      seedFolds.push(
        evaluate(
          seedTest,
          (text) => blendedProbability(text, foldModel, weight),
          threshold,
        ),
      );
    }

    const seedCV = aggregate(seedFolds);
    const primaryHeldOutMetrics = evaluate(
      primaryHeldOut,
      (text) => blendedProbability(text, finalCandidate, weight),
      threshold,
    );

    combinations.push({
      weight,
      threshold,
      seedCV,
      primaryHeldOut: primaryHeldOutMetrics,
    });
  }
}

const eligible = combinations
  .filter((entry) => entry.seedCV.recall >= 0.98)
  .sort(
    (a, b) =>
      b.primaryHeldOut.f1 - a.primaryHeldOut.f1 ||
      a.seedCV.falsePositiveRate - b.seedCV.falsePositiveRate,
  );

const selected = eligible[0] ?? combinations[0];

const independent = evaluate(
  uci,
  (text) => blendedProbability(text, finalCandidate, selected.weight),
  selected.threshold,
);

console.log(
  JSON.stringify(
    {
      primaryDatasetRevision: revision,
      primaryTrainRows: primaryTrain.length,
      primaryHeldOutRows: primaryHeldOut.length,
      seedRows: SEED_DATASET.length,
      uciRows: uci.length,
      selectionRule:
        "seed recall >= 0.98, then maximize primary held-out F1, then minimize seed FPR",
      selected,
      independentUci: independent,
      v1BaselineUci: evaluate(
        uci,
        (text) => predictText(text).scamProbability,
        0.5,
      ),
      allEligible: eligible,
    },
    null,
    2,
  ),
);
