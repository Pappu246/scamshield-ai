/**
 * Research-only multilingual smoke benchmark.
 *
 * Evaluates the frozen production model and the generated v1.1 candidate
 * on a small Indian Hindi/Hinglish/English scam-message dataset.
 *
 * The benchmark is evaluation-only: it never changes production code.
 * The dataset is loaded through Hugging Face's dataset-server API rather than
 * a raw bucket URL so the workflow uses a stable, machine-readable endpoint
 * and can record the served revision fingerprint.
 */

import {
  computeMetrics,
  predictText,
  tokenize,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { readFileSync } from "node:fs";

const DATASET = "karanverma19/Indian_Multilingual_Scam_Message_Dataset";
const CONFIG = "default";
const SPLIT = "train";
const PAGE_SIZE = 100;
const EXPECTED_ROWS = 120;
const ENDPOINT = "https://datasets-server.huggingface.co/rows";
const ARTIFACT_PATH = "/tmp/scamshield-v11-candidate-model.json";

type Label = "scam" | "legit";
type Row = { message: string; label: Label; language: string };

type Candidate = {
  priorScam: number;
  classificationThreshold: number;
  ensembleWeight?: number;
  tokenLogOdds: Record<string, number>;
};

async function fetchPage(offset: number) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("dataset", DATASET);
  url.searchParams.set("config", CONFIG);
  url.searchParams.set("split", SPLIT);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(PAGE_SIZE));

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url);

    if (response.ok) {
      const payload = (await response.json()) as {
        rows: Array<{
          row: {
            message?: unknown;
            label?: unknown;
            language?: unknown;
          };
        }>;
        num_rows_total?: number;
        partial?: boolean;
      };

      if (payload.partial) {
        throw new Error("Hugging Face returned a partial dataset slice.");
      }

      return {
        revision: response.headers.get("x-revision"),
        payload,
      };
    }

    if (![502, 503, 504].includes(response.status)) {
      throw new Error(
        `Dataset request failed: HTTP ${response.status} at offset ${offset}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  throw new Error(`Dataset server unavailable at offset ${offset} after retries`);
}

async function loadRows(): Promise<{
  rows: Row[];
  revision: string;
  rawRows: number;
}> {
  const rows: Row[] = [];
  let expectedTotal: number | undefined;
  let datasetRevision: string | undefined;
  let rawRows = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { revision, payload } = await fetchPage(offset);

    if (!revision) {
      throw new Error("Dataset server did not provide an x-revision fingerprint.");
    }

    if (datasetRevision && datasetRevision !== revision) {
      throw new Error(
        `Dataset revision changed mid-run: ${datasetRevision} -> ${revision}`,
      );
    }
    datasetRevision ??= revision;

    expectedTotal ??= payload.num_rows_total;

    for (const entry of payload.rows ?? []) {
      rawRows += 1;

      const message =
        typeof entry.row.message === "string" ? entry.row.message.trim() : "";
      const rawLabel =
        typeof entry.row.label === "string"
          ? entry.row.label.trim().toLowerCase()
          : "";
      const language =
        typeof entry.row.language === "string"
          ? entry.row.language.trim()
          : "";

      const label =
        rawLabel === "scam"
          ? "scam"
          : rawLabel === "legit"
            ? "legit"
            : null;

      if (message && language && label) {
        rows.push({ message, label, language });
      }
    }

    if (
      rawRows >= (expectedTotal ?? 0) ||
      (payload.rows ?? []).length < PAGE_SIZE
    ) {
      break;
    }
  }

  if (!datasetRevision) {
    throw new Error("No dataset revision was observed.");
  }

  if (expectedTotal !== EXPECTED_ROWS) {
    throw new Error(
      `Expected ${EXPECTED_ROWS} rows from ${DATASET}; dataset-server reports ${expectedTotal ?? "unknown"}.`,
    );
  }

  if (rawRows !== expectedTotal) {
    throw new Error(
      `Fetched ${rawRows} raw rows but dataset reports ${expectedTotal} total rows.`,
    );
  }

  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(
      `Expected ${EXPECTED_ROWS} usable multilingual rows, received ${rows.length}.`,
    );
  }

  const languages = new Set(rows.map((row) => row.language.toLowerCase()));
  const requiredFamilies = ["english", "hindi", "hinglish"];
  const missingFamilies = requiredFamilies.filter(
    (family) => ![...languages].some((language) => language.includes(family)),
  );

  if (missingFamilies.length > 0) {
    throw new Error(
      `Multilingual smoke dataset is missing language families: ${missingFamilies.join(", ")}`,
    );
  }

  return {
    rows,
    revision: datasetRevision,
    rawRows,
  };
}

function candidateProbability(candidate: Candidate, text: string): number {
  // The candidate artifact was trained with the production tokenizer, so use
  // exactly the same normalization/tokenization path here. This is essential
  // for Hindi/Hinglish normalization parity.
  let logOdds = Math.log(
    candidate.priorScam / Math.max(1e-9, 1 - candidate.priorScam),
  );

  for (const token of tokenize(text)) {
    logOdds += candidate.tokenLogOdds[token] ?? 0;
  }

  return 1 / (1 + Math.exp(-logOdds));
}

function evaluate(
  rows: Row[],
  score: (row: Row) => number,
  threshold: number,
) {
  const matrix: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };

  for (const row of rows) {
    const predictedScam = score(row) >= threshold;

    if (row.label === "scam") {
      if (predictedScam) matrix.tp += 1;
      else matrix.fn += 1;
    } else if (predictedScam) {
      matrix.fp += 1;
    } else {
      matrix.tn += 1;
    }
  }

  return computeMetrics(matrix);
}

const { rows, revision, rawRows } = await loadRows();

const candidate = JSON.parse(
  readFileSync(ARTIFACT_PATH, "utf8"),
) as Candidate;

const languages = [...new Set(rows.map((row) => row.language))].sort();

const productionScore = (row: Row) =>
  predictText(row.message).scamProbability;

const candidateScore = (row: Row) => {
  const v1 = predictText(row.message).scamProbability;
  const v11 = candidateProbability(candidate, row.message);
  const weight = candidate.ensembleWeight ?? 1;
  return v1 * (1 - weight) + v11 * weight;
};

const productionOverall = evaluate(rows, productionScore, 0.5);
const candidateOverall = evaluate(
  rows,
  candidateScore,
  candidate.classificationThreshold,
);

const productionByLanguage = Object.fromEntries(
  languages.map((language) => {
    const subset = rows.filter((row) => row.language === language);
    return [
      language,
      {
        count: subset.length,
        metrics: evaluate(subset, productionScore, 0.5),
      },
    ];
  }),
);

const candidateByLanguage = Object.fromEntries(
  languages.map((language) => {
    const subset = rows.filter((row) => row.language === language);
    return [
      language,
      {
        count: subset.length,
        metrics: evaluate(
          subset,
          candidateScore,
          candidate.classificationThreshold,
        ),
      },
    ];
  }),
);

console.log(
  JSON.stringify(
    {
      dataset: DATASET,
      config: CONFIG,
      split: SPLIT,
      revision,
      rawRows,
      rows: rows.length,
      expectedRows: EXPECTED_ROWS,
      languages,
      candidateModelVersion:
        "nb-scam-v1.1-external-seed-oversampled",
      candidateThreshold: candidate.classificationThreshold,
      candidateEnsembleWeight: candidate.ensembleWeight,
      productionOverall,
      candidateOverall,
      productionByLanguage,
      candidateByLanguage,
    },
    null,
    2,
  ),
);
