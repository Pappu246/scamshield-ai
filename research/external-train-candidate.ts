/**
 * Research-only candidate trainer.
 *
 * Trains a word-level Naive Bayes model on the external Indian
 * spam/scam dataset and evaluates it on:
 *   1) a deterministic held-out slice of that same dataset, and
 *   2) the frozen 85-example ScamShield seed dataset.
 *
 * The production v1 model is never modified by this script.
 */

import {
  computeMetrics,
  predictText,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { SEED_DATASET } from "../src/lib/analyzer/dataset";
import { tokenize } from "../src/lib/analyzer/classifier";

const DATASET = "anmolshrivastav/scam-ham-india";
const CONFIG = "default";
const SPLIT = "train";
const PAGE_SIZE = 100;
const ENDPOINT = "https://datasets-server.huggingface.co/rows";

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

async function loadRows(): Promise<{ rows: Row[]; revision: string; skippedRows: number }> {
  const rows: Row[] = [];
  let expectedTotal = 0;
  let rawRows = 0;
  let skippedRows = 0;
  let revision = "";

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("dataset", DATASET);
    url.searchParams.set("config", CONFIG);
    url.searchParams.set("split", SPLIT);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("length", String(PAGE_SIZE));

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Dataset HTTP ${response.status} at offset ${offset}`);

    const page = (await response.json()) as {
      rows: Array<{ row: { text?: unknown; label?: unknown } }>;
      num_rows_total?: number;
      partial?: boolean;
    };

    if (page.partial) throw new Error("Dataset server returned a partial slice.");

    expectedTotal = page.num_rows_total ?? expectedTotal;
    const pageRevision = response.headers.get("x-revision") ?? "";
    if (!pageRevision) throw new Error("Dataset server omitted x-revision.");
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
      else skippedRows += 1;
    }

    if (rawRows >= expectedTotal || (page.rows ?? []).length < PAGE_SIZE) break;
  }

  if (rawRows !== expectedTotal) {
    throw new Error(`Expected ${expectedTotal} raw rows, fetched ${rawRows}`);
  }

  const deduped = new Map<string, Row>();
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return { rows: [...deduped.values()], revision, skippedRows };
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitRows(rows: Row[]): { train: Row[]; test: Row[] } {
  const train: Row[] = [];
  const test: Row[] = [];

  for (const row of rows) {
    const normalized = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (fnv1a(normalized) % 5 === 0) test.push(row);
    else train.push(row);
  }

  return { train, test };
}

function train(rows: Row[]): Model {
  const scamCounts = new Map<string, number>();
  const legitCounts = new Map<string, number>();
  const vocabulary = new Set<string>();
  let totalScam = 0;
  let totalLegit = 0;

  for (const row of rows) {
    for (const token of tokenize(row.text)) {
      vocabulary.add(token);
      if (row.label === "scam") {
        scamCounts.set(token, (scamCounts.get(token) ?? 0) + 1);
        totalScam += 1;
      } else {
        legitCounts.set(token, (legitCounts.get(token) ?? 0) + 1);
        totalLegit += 1;
      }
    }
  }

  const scamDocs = rows.filter((row) => row.label === "scam").length;
  const legitDocs = rows.filter((row) => row.label === "legit").length;
  const priorScam = scamDocs / Math.max(1, scamDocs + legitDocs);
  const alpha = 1;
  const vocabularySize = vocabulary.size + alpha;
  const tokenLogOdds = new Map<string, number>();

  for (const token of vocabulary) {
    const scam = (scamCounts.get(token) ?? 0) + alpha;
    const legit = (legitCounts.get(token) ?? 0) + alpha;

    tokenLogOdds.set(
      token,
      Math.log(scam / (totalScam + vocabularySize)) -
        Math.log(legit / (totalLegit + vocabularySize)),
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
  rows: Row[],
  scorer: (text: string) => number,
): ReturnType<typeof computeMetrics> {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predictedScam = scorer(row.text) >= 0.5;

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

const { rows, revision, skippedRows } = await loadRows();
const { train: trainRows, test: testRows } = splitRows(rows);
const candidate = train(trainRows);

const candidateHeldOut = evaluate(testRows, (text) => predict(candidate, text));
const productionHeldOut = evaluate(testRows, (text) => predictText(text).scamProbability);
const candidateOnFrozenSeed = evaluate(
  SEED_DATASET,
  (text) => predict(candidate, text),
);

console.log(JSON.stringify({
  dataset: DATASET,
  revision,
  uniqueRows: rows.length,
  skippedRows,
  trainRows: trainRows.length,
  heldOutRows: testRows.length,
  labelCounts: {
    totalScam: rows.filter((row) => row.label === "scam").length,
    totalLegit: rows.filter((row) => row.label === "legit").length,
  },
  productionV1OnSameHeldOut: productionHeldOut,
  externalTrainedCandidateOnHeldOut: candidateHeldOut,
  externalTrainedCandidateOnFrozenSeed: candidateOnFrozenSeed,
}, null, 2));
