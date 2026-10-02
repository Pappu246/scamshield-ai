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
import { tokenize } from "../src/lib/analyzer/classifier";
import { readFileSync } from "node:fs";

const CANDIDATE_ARTIFACT = "/tmp/scamshield-v11-candidate-model.json";
const SECONDARY = {
  dataset: "ucirvine/sms_spam",
  config: "plain_text",
  split: "train",
};
const CANDIDATE_ARTIFACT = "/tmp/scamshield-v11-candidate-model.json";
const UCI_FILE = "/tmp/SMSSpamCollection";
const EXPECTED_ROWS = 5574;

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

function loadUciDataset(): { rows: Row[]; rawRows: number; skippedRows: number } {
  const lines = readFileSync(UCI_FILE, "utf8").split(/\r?\n/);
  const rows: Row[] = [];
  let rawRows = 0;
  let skippedRows = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    rawRows += 1;

    const tab = line.indexOf("\t");
    if (tab <= 0) {
      skippedRows += 1;
      continue;
    }

    const labelValue = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();

    const label =
      labelValue === "spam"
        ? "scam"
        : labelValue === "ham"
          ? "legit"
          : null;

    if (text && label) rows.push({ text, label });
    else skippedRows += 1;
  }

  if (rawRows !== EXPECTED_ROWS) {
    throw new Error(
      `UCI SMS benchmark expected ${EXPECTED_ROWS} raw rows, received ${rawRows}`,
    );
  }

  return { rows, rawRows, skippedRows };
}

const { rows: secondary, rawRows, skippedRows } = loadUciDataset();

const candidateArtifact = JSON.parse(readFileSync(CANDIDATE_ARTIFACT, "utf8")) as {
  modelVersion: string;
  seedOversampleFactor: number;
  datasetRevision: string;
  priorScam: number;
  tokenLogOdds: Record<string, number>;
};

const candidateModel: Model = {
  priorScam: candidateArtifact.priorScam,
  tokenLogOdds: new Map(Object.entries(candidateArtifact.tokenLogOdds)),
};

const productionExternal = evaluate(
  secondary,
  (text) => predictText(text).scamProbability,
);

const candidateExternal = evaluate(
  secondary,
  (text) => predict(candidateModel, text),
);

console.log(JSON.stringify({
  dataset: {
    source: "UCI SMS Spam Collection",
    license: "CC BY 4.0",
    rawRows,
    skippedRows,
    usableRows: secondary.length,
  },
  candidateArtifact: {
    modelVersion: candidateArtifact.modelVersion,
    seedOversampleFactor: candidateArtifact.seedOversampleFactor,
    primaryDatasetRevision: candidateArtifact.datasetRevision,
  },
  productionV1OnIndependentDataset: productionExternal,
  v1_1CandidateOnIndependentDataset: candidateExternal,
}, null, 2));
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

const secondary = await loadDataset(SECONDARY);
const candidateArtifact = JSON.parse(readFileSync(CANDIDATE_ARTIFACT, "utf8")) as {
  modelVersion: string;
  seedOversampleFactor: number;
  datasetRevision: string;
  priorScam: number;
  tokenLogOdds: Record<string, number>;
};

const candidateModel: Model = {
  priorScam: candidateArtifact.priorScam,
  tokenLogOdds: new Map(Object.entries(candidateArtifact.tokenLogOdds)),
};

const productionExternal = evaluate(
  secondary.rows,
  (text) => predictText(text).scamProbability,
);

const candidateExternal = evaluate(
  secondary.rows,
  (text) => predict(candidateModel, text),
);

console.log(JSON.stringify({
  candidateArtifact: {
    modelVersion: candidateArtifact.modelVersion,
    seedOversampleFactor: candidateArtifact.seedOversampleFactor,
    primaryDatasetRevision: candidateArtifact.datasetRevision,
  },
  secondaryDataset: {
    ...SECONDARY,
    revision: secondary.revision,
    rawRows: secondary.rawRows,
    skippedRows: secondary.skippedRows,
    uniqueUsableRows: secondary.rows.length,
  },
  productionV1OnIndependentDataset: productionExternal,
  v1_1CandidateOnIndependentDataset: candidateExternal,
}, null, 2));
