/**
 * Research-only independent benchmark.
 *
 * Training data:
 *   anmolshrivastav/scam-ham-india (primary research dataset) + ScamShield
 *   seed examples oversampled by the selected factor (32).
 *
 * Evaluation data:
 *   ucirvine/sms_spam / plain_text / train
 *
 * The independent dataset is never used for training or tuning.
 * This script compares production v1 with the v1.1 oversampled candidate.
 */

import { computeMetrics, predictText, type ConfusionMatrix } from "../src/lib/analyzer/classifier";
import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { tokenize } from "../src/lib/analyzer/classifier";

const PRIMARY = {
  dataset: "anmolshrivastav/scam-ham-india",
  config: "default",
  split: "train",
};
const SECONDARY = {
  dataset: "ucirvine/sms_spam",
  config: "plain_text",
  split: "train",
};
const ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;
const SEED_OVERSAMPLE_FACTOR = 32;

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

async function fetchPage(
  dataset: string,
  config: string,
  split: string,
  offset: number,
): Promise<{
  revision: string;
  payload: {
    rows: Array<{ row: { text?: unknown; sms?: unknown; label?: unknown } }>;
    num_rows_total?: number;
    partial?: boolean;
  };
}> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("dataset", dataset);
  url.searchParams.set("config", config);
  url.searchParams.set("split", split);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(PAGE_SIZE));

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      const payload = (await response.json()) as {
        rows: Array<{ row: { text?: unknown; sms?: unknown; label?: unknown } }>;
        num_rows_total?: number;
        partial?: boolean;
      };
      const revision = response.headers.get("x-revision") ?? "";
      if (!revision) throw new Error(`Missing x-revision for ${dataset}`);
      return { revision, payload };
    }

    if (
      response.status !== 429 &&
      response.status !== 502 &&
      response.status !== 503 &&
      response.status !== 504
    ) {
      throw new Error(`Dataset HTTP ${response.status} for ${dataset} at offset ${offset}`);
    }

    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const delayMs = Math.max(attempt * 1500, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0);
    await sleep(Math.min(delayMs, 15_000));
  }

  throw new Error(`Dataset server remained unavailable for ${dataset} at offset ${offset}`);
}

async function loadDataset(
  source: { dataset: string; config: string; split: string },
): Promise<{ rows: Row[]; revision: string; rawRows: number; skippedRows: number }> {
  const rows: Row[] = [];
  let expectedTotal = 0;
  let rawRows = 0;
  let skippedRows = 0;
  let revision = "";

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { revision: pageRevision, payload } = await fetchPage(
      source.dataset,
      source.config,
      source.split,
      offset,
    );

    if (payload.partial) throw new Error(`Partial dataset slice for ${source.dataset}`);

    expectedTotal = payload.num_rows_total ?? expectedTotal;

    if (revision && revision !== pageRevision) {
      throw new Error(`Dataset revision changed: ${revision} -> ${pageRevision}`);
    }
    revision = pageRevision;

    for (const entry of payload.rows ?? []) {
      rawRows += 1;

      const text =
        typeof entry.row.text === "string"
          ? entry.row.text.trim()
          : typeof entry.row.sms === "string"
            ? entry.row.sms.trim()
            : "";

      const labelValue = entry.row.label;
      const label =
        labelValue === "spam" || labelValue === 1 || labelValue === "1"
          ? "scam"
          : labelValue === "ham" || labelValue === 0 || labelValue === "0"
            ? "legit"
            : null;

      if (text && label) rows.push({ text, label });
      else skippedRows += 1;
    }

    if (rawRows >= expectedTotal || (payload.rows ?? []).length < PAGE_SIZE) break;
  }

  if (rawRows !== expectedTotal) {
    throw new Error(
      `Fetched ${rawRows} raw rows but ${source.dataset} reports ${expectedTotal}`,
    );
  }

  const deduped = new Map<string, Row>();
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return {
    rows: [...deduped.values()],
    revision,
    rawRows,
    skippedRows,
  };
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

function predict(model: Model, text: string): number {
  let logOdds = Math.log(model.priorScam / Math.max(1e-9, 1 - model.priorScam));

  for (const token of tokenize(text)) {
    const contribution = model.tokenLogOdds.get(token);
    if (contribution !== undefined) logOdds += contribution;
  }

  return 1 / (1 + Math.exp(-logOdds));
}

function evaluate(rows: Row[], scorer: (text: string) => number) {
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

const primary = await loadDataset(PRIMARY);
const secondary = await loadDataset(SECONDARY);

const primaryModel = train(primary.rows);

const candidateTrainingRows = [
  ...primary.rows,
  ...Array.from({ length: SEED_OVERSAMPLE_FACTOR }, () =>
    SEED_DATASET.map((row: LabeledExample) => ({
      text: row.text,
      label: row.label,
    })),
  ).flat(),
];

const candidateModel = train(candidateTrainingRows);

const productionExternal = evaluate(
  secondary.rows,
  (text) => predictText(text).scamProbability,
);

const candidateExternal = evaluate(
  secondary.rows,
  (text) => predict(candidateModel, text),
);

const primarySanity = evaluate(
  primary.rows,
  (text) => predict(primaryModel, text),
);

console.log(JSON.stringify({
  primaryDataset: {
    ...PRIMARY,
    revision: primary.revision,
    rawRows: primary.rawRows,
    skippedRows: primary.skippedRows,
    uniqueUsableRows: primary.rows.length,
  },
  secondaryDataset: {
    ...SECONDARY,
    revision: secondary.revision,
    rawRows: secondary.rawRows,
    skippedRows: secondary.skippedRows,
    uniqueUsableRows: secondary.rows.length,
  },
  candidateTraining: {
    seedOversampleFactor: SEED_OVERSAMPLE_FACTOR,
    trainingRows: candidateTrainingRows.length,
  },
  productionV1OnIndependentDataset: productionExternal,
  v1_1CandidateOnIndependentDataset: candidateExternal,
  primaryDataSanity: primarySanity,
}, null, 2));
