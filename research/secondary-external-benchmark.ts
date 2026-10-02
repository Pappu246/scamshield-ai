/**
 * Research-only independent benchmark.
 *
 * The v1.1 candidate model is produced by the preceding seed-oversampling
 * experiment and saved to /tmp/scamshield-v11-candidate-model.json.
 *
 * Independent evaluation data:
 *   UCI SMS Spam Collection (5,574 English ham/spam SMS).
 *
 * The independent dataset is never used for training or tuning.
 */

import {
  computeMetrics,
  predictText,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { tokenize } from "../src/lib/analyzer/classifier";
import { readFileSync } from "node:fs";

const CANDIDATE_ARTIFACT = "/tmp/scamshield-v11-candidate-model.json";
const UCI_FILE = "/tmp/SMSSpamCollection";
const EXPECTED_ROWS = 5_574;

interface Row {
  text: string;
  label: "scam" | "legit";
}

interface Model {
  priorScam: number;
  tokenLogOdds: Map<string, number>;
}

function loadUciDataset(): {
  rows: Row[];
  rawRows: number;
  skippedRows: number;
} {
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

    const rawLabel = line.slice(0, tab).trim();
    const text = line.slice(tab + 1).trim();

    const label =
      rawLabel === "spam"
        ? "scam"
        : rawLabel === "ham"
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
  threshold = 0.5,
) {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predictedScam = scorer(row.text) >= threshold;

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

const { rows, rawRows, skippedRows } = loadUciDataset();

const candidateArtifact = JSON.parse(
  readFileSync(CANDIDATE_ARTIFACT, "utf8"),
) as {
  modelVersion: string;
  seedOversampleFactor: number;
  datasetRevision: string;
  priorScam: number;
  classificationThreshold: number;
  ensembleWeight?: number;
  tokenLogOdds: Record<string, number>;
};

const candidateModel: Model = {
  priorScam: candidateArtifact.priorScam,
  tokenLogOdds: new Map(Object.entries(candidateArtifact.tokenLogOdds)),
};

const productionV1 = evaluate(
  rows,
  (text) => predictText(text).scamProbability,
  0.5,
);

const ensembleWeight = candidateArtifact.ensembleWeight ?? 1;

const candidateV11 = evaluate(
  rows,
  (text) => predict(candidateModel, text),
  candidateArtifact.candidateThreshold ?? candidateArtifact.classificationThreshold,
);

const ensembleExternal = evaluate(
  rows,
  (text) =>
    predictText(text).scamProbability * (1 - ensembleWeight) +
    predict(candidateModel, text) * ensembleWeight,
  candidateArtifact.classificationThreshold,
);

console.log(
  JSON.stringify(
    {
      dataset: {
        source: "UCI SMS Spam Collection",
        license: "CC BY 4.0",
        rawRows,
        skippedRows,
        usableRows: rows.length,
      },
      candidateArtifact: {
        modelVersion: candidateArtifact.modelVersion,
        seedOversampleFactor: candidateArtifact.seedOversampleFactor,
        primaryDatasetRevision: candidateArtifact.datasetRevision,
        classificationThreshold: candidateArtifact.classificationThreshold,
        ensembleWeight,
      },
      productionV1OnIndependentDataset: productionV1,
      v1_1CandidateOnIndependentDataset: candidateV11,
      v1_1EnsembleOnIndependentDataset: ensembleExternal,
    },
    null,
    2,
  ),
);
