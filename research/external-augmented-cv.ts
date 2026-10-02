/**
 * Research-only augmentation experiment.
 *
 * Trains Naive Bayes on the external dataset plus the in-fold ScamShield
 * seed-training partition, then evaluates on:
 *   - the held-out portion of the external dataset, and
 *   - the held-out seed fold.
 *
 * This prevents us from promoting a model that only memorizes the tiny seed
 * set while measuring whether external data improves generalization.
 */

import { computeMetrics, predictText, type ConfusionMatrix } from "../src/lib/analyzer/classifier";
import { SEED_DATASET, type LabeledExample } from "../src/lib/analyzer/dataset";
import { tokenize } from "../src/lib/analyzer/classifier";

const DATASET = "anmolshrivastav/scam-ham-india";
const ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;

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

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);

    const page = (await response.json()) as {
      rows: Array<{ row: { text?: unknown; label?: unknown } }>;
      num_rows_total?: number;
      partial?: boolean;
    };

    if (page.partial) throw new Error("Dataset viewer returned a partial slice.");

    expectedTotal = page.num_rows_total ?? expectedTotal;
    const pageRevision = response.headers.get("x-revision") ?? "";
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
  const test: Row[] = [];
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    (hash(key) % 5 === 0 ? test : train).push(row);
  }
  return { train, test };
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

function evaluate(rows: Array<{ text: string; label: "scam" | "legit" }>, scorer: (text: string) => number) {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const scam = scorer(row.text) >= 0.5;
    if (row.label === "scam") {
      if (scam) cm.tp += 1;
      else cm.fn += 1;
    } else if (scam) {
      cm.fp += 1;
    } else {
      cm.tn += 1;
    }
  }

  return computeMetrics(cm);
}

const { rows: external, revision } = await loadExternal();
const { train: externalTrain, test: externalTest } = splitExternal(external);

const seedScams = SEED_DATASET.filter((row) => row.label === "scam");
const seedLegits = SEED_DATASET.filter((row) => row.label === "legit");
const seedFoldMetrics = [];

for (let fold = 0; fold < 5; fold += 1) {
  const seedTrain: LabeledExample[] = [];
  const seedTest: LabeledExample[] = [];

  for (const pool of [seedScams, seedLegits]) {
    pool.forEach((row, index) => {
      if (index % 5 === fold) seedTest.push(row);
      else seedTrain.push(row);
    });
  }

  const combinedTrain = [
    ...externalTrain,
    ...seedTrain.map((row) => ({ text: row.text, label: row.label })),
  ];

  const model = train(combinedTrain);
  seedFoldMetrics.push(evaluate(seedTest, (text) => predict(model, text)));
}

const aggregateSeed = seedFoldMetrics.reduce<ConfusionMatrix>(
  (cm, m) => ({
    tp: cm.tp + m.confusion.tp,
    fp: cm.fp + m.confusion.fp,
    fn: cm.fn + m.confusion.fn,
    tn: cm.tn + m.confusion.tn,
  }),
  { tp: 0, fp: 0, fn: 0, tn: 0 },
);

const combinedFinalModel = train([
  ...externalTrain,
  ...SEED_DATASET.map((row) => ({ text: row.text, label: row.label })),
]);

const candidateExternal = evaluate(externalTest, (text) => predict(combinedFinalModel, text));
const productionExternal = evaluate(externalTest, (text) => predictText(text).scamProbability);

console.log(JSON.stringify({
  dataset: DATASET,
  revision,
  externalTrainRows: externalTrain.length,
  externalHeldOutRows: externalTest.length,
  seedRows: SEED_DATASET.length,
  combinedCandidateSeedCV: computeMetrics(aggregateSeed),
  productionSeedCV: {
    accuracy: 0.8705882352941177,
    precision: 0.828125,
    recall: 1,
    f1: 0.905982905982906,
    falsePositiveRate: 0.34375,
  },
  combinedCandidateExternalHeldOut: candidateExternal,
  productionV1ExternalHeldOut: productionExternal,
}, null, 2));
