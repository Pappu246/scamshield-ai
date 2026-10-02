/**
 * Research-only external benchmark for ScamShield's text classifiers.
 *
 * Source:
 *   anmolshrivastav/scam-ham-india
 *   Apache-2.0, train split, 2,272 rows at the time of writing.
 *
 * The dataset is labeled ham/spam. "spam" is mapped to the research label
 * "scam" only for binary metric compatibility; the result must be interpreted
 * as an external spam/scam benchmark, not as a real-world fraud accuracy claim.
 *
 * This script never runs in the production app. It fetches fixed-size pages from
 * the Hugging Face dataset viewer API, records the served dataset revision, and
 * refuses to silently evaluate a partial dataset.
 */

import {
  computeMetrics,
  MODEL_METRICS,
  predictText,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import {
  EXPERIMENTAL_MODEL_METRICS,
  predictTextExperimental,
} from "../src/lib/analyzer/classifierExperimental";

const DATASET = "anmolshrivastav/scam-ham-india";
const CONFIG = "default";
const SPLIT = "train";
const PAGE_SIZE = 100;
const ENDPOINT = "https://datasets-server.huggingface.co/rows";

interface BenchmarkRow {
  text: string;
  label: "scam" | "legit";
}

async function fetchPage(offset: number) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("dataset", DATASET);
  url.searchParams.set("config", CONFIG);
  url.searchParams.set("split", SPLIT);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(PAGE_SIZE));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Dataset request failed: HTTP ${response.status} at offset ${offset}`);
  }

  const revision = response.headers.get("x-revision");
  const payload = (await response.json()) as {
    rows: Array<{ row: { text?: unknown; label?: unknown } }>;
    num_rows_total?: number;
    partial?: boolean;
  };

  if (payload.partial) {
    throw new Error("Hugging Face returned a partial dataset slice; refusing to score it.");
  }

  return { revision, payload };
}

async function loadDataset(): Promise<{ rows: BenchmarkRow[]; revision: string }> {
  const rows: BenchmarkRow[] = [];
  let expectedTotal: number | undefined;
  let datasetRevision: string | undefined;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { revision, payload } = await fetchPage(offset);

    if (revision) {
      if (datasetRevision && datasetRevision !== revision) {
        throw new Error(
          `Dataset revision changed mid-run: ${datasetRevision} -> ${revision}`,
        );
      }
      datasetRevision ??= revision;
    }

    expectedTotal ??= payload.num_rows_total;

    for (const entry of payload.rows ?? []) {
      const text = typeof entry.row.text === "string" ? entry.row.text.trim() : "";
      const label =
        entry.row.label === "spam"
          ? "scam"
          : entry.row.label === "ham"
            ? "legit"
            : null;

      if (text && label) rows.push({ text, label });
    }

    if (rows.length >= (expectedTotal ?? 0) || (payload.rows ?? []).length < PAGE_SIZE) {
      break;
    }
  }

  if (!datasetRevision) {
    throw new Error("Dataset server did not provide an x-revision fingerprint.");
  }

  if (expectedTotal !== undefined && rows.length < expectedTotal) {
    throw new Error(
      `Fetched ${rows.length} labeled rows but dataset reports ${expectedTotal} total rows.`,
    );
  }

  const deduped = new Map<string, BenchmarkRow>();
  for (const row of rows) {
    const key = row.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return { rows: [...deduped.values()], revision: datasetRevision };
}

function evaluate(
  rows: BenchmarkRow[],
  predictor: (text: string) => { scamProbability: number },
): ReturnType<typeof computeMetrics> {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predictedScam = predictor(row.text).scamProbability >= 0.5;

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

function fmt(value: number) {
  return value.toFixed(4);
}

const { rows, revision } = await loadDataset();
const externalV1 = evaluate(rows, predictText);
const externalV11 = evaluate(rows, predictTextExperimental);

const scamCount = rows.filter((row) => row.label === "scam").length;
const legitCount = rows.filter((row) => row.label === "legit").length;

console.log(JSON.stringify({
  dataset: DATASET,
  config: CONFIG,
  split: SPLIT,
  revision,
  rows: rows.length,
  labelCounts: { scam: scamCount, legit: legitCount },
  productionSeedCV: {
    accuracy: MODEL_METRICS.accuracy,
    precision: MODEL_METRICS.precision,
    recall: MODEL_METRICS.recall,
    f1: MODEL_METRICS.f1,
    falsePositiveRate: MODEL_METRICS.falsePositiveRate,
  },
  experimentalSeedCV: {
    accuracy: EXPERIMENTAL_MODEL_METRICS.accuracy,
    precision: EXPERIMENTAL_MODEL_METRICS.precision,
    recall: EXPERIMENTAL_MODEL_METRICS.recall,
    f1: EXPERIMENTAL_MODEL_METRICS.f1,
    falsePositiveRate: EXPERIMENTAL_MODEL_METRICS.falsePositiveRate,
  },
  externalSpamScamBenchmark: {
    productionV1: externalV1,
    experimentalV11: externalV11,
  },
}, null, 2));

console.log(
  `\nExternal benchmark revision=${revision} rows=${rows.length} ` +
  `scam/spam=${scamCount} legit/ham=${legitCount}`,
);
console.log(
  `v1 external:    acc=${fmt(externalV1.accuracy)} precision=${fmt(externalV1.precision)} ` +
  `recall=${fmt(externalV1.recall)} f1=${fmt(externalV1.f1)} fpr=${fmt(externalV1.falsePositiveRate)}`,
);
console.log(
  `v1.1 candidate: acc=${fmt(externalV11.accuracy)} precision=${fmt(externalV11.precision)} ` +
  `recall=${fmt(externalV11.recall)} f1=${fmt(externalV11.f1)} fpr=${fmt(externalV11.falsePositiveRate)}`,
);
