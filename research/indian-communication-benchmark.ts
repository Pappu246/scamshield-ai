/**
 * Research-only independent Indian scam-communication benchmark.
 *
 * This is a larger external evaluation set than the 120-row smoke test.
 * It contains 10,000 labeled Indian communication records. Because the corpus
 * includes call/chat/SMS-style communication, its metrics are reported as an
 * external communication benchmark, not as a direct real-world SMS-fraud
 * accuracy estimate.
 *
 * The data is never used for candidate training or threshold tuning.
 */

import {
  computeMetrics,
  predictText,
  tokenize,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { readFileSync } from "node:fs";

const DATASET = "ysangam/Indian_Cyber_Scam_PhoneCall_Hinglish_Dataset";
const DATASET_REVISION = "c1baf5a";
const DATASET_URL =
  `https://huggingface.co/datasets/${DATASET}/resolve/${DATASET_REVISION}/India_Cyber_Scam_Hinglish_Dataset.csv`;
const EXPECTED_ROWS = 10_000;
const ARTIFACT_PATH = "/tmp/scamshield-v11-candidate-model.json";

type Label = "scam" | "legit";
type Row = { text: string; label: Label; language: string };

type Candidate = {
  modelVersion?: string;
  priorScam: number;
  classificationThreshold: number;
  candidateThreshold?: number;
  ensembleWeight?: number;
  tokenLogOdds: Record<string, number>;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

async function loadRows(): Promise<Row[]> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(DATASET_URL);
    lastStatus = response.status;

    if (response.ok) {
      const csv = await response.text();
      const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
      const header = parsed.shift();

      if (!header) throw new Error("Indian communication dataset is empty.");

      const index = new Map(
        header.map((name, i) => [name.trim().toLowerCase(), i]),
      );
      const textIndex = index.get("text");
      const labelIndex = index.get("label");
      const languageIndex = index.get("language_style");

      if (
        textIndex === undefined ||
        labelIndex === undefined ||
        languageIndex === undefined
      ) {
        throw new Error(
          "Dataset schema is missing text/label/language_style columns.",
        );
      }

      const rows: Row[] = parsed.flatMap((cells) => {
        const text = (cells[textIndex] ?? "").trim();
        const rawLabel = (cells[labelIndex] ?? "").trim();
        const language = (cells[languageIndex] ?? "").trim() || "unknown";

        const label =
          rawLabel === "1" ? "scam" : rawLabel === "0" ? "legit" : null;

        return text && label ? [{ text, label, language }] : [];
      });

      if (rows.length !== EXPECTED_ROWS) {
        throw new Error(
          `Expected ${EXPECTED_ROWS} usable rows, received ${rows.length}.`,
        );
      }

      const scamCount = rows.filter((row) => row.label === "scam").length;
      const legitCount = rows.length - scamCount;
      if (scamCount === 0 || legitCount === 0) {
        throw new Error("Benchmark must contain both scam and legitimate rows.");
      }

      return rows;
    }

    if (![429, 502, 503, 504].includes(response.status)) {
      throw new Error(
        `Indian communication dataset request failed: HTTP ${response.status}`,
      );
    }

    const retryAfter = Number(response.headers.get("retry-after") ?? "");
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(15_000, retryAfter * 1000)
        : attempt * 1500;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `Indian communication dataset unavailable after retries: HTTP ${lastStatus}`,
  );
}

function candidateProbability(candidate: Candidate, text: string): number {
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

const rows = await loadRows();

const candidate = JSON.parse(
  readFileSync(ARTIFACT_PATH, "utf8"),
) as Candidate;

const productionScore = (row: Row) =>
  predictText(row.text).scamProbability;

const candidateScore = (row: Row) =>
  candidateProbability(candidate, row.text);

const candidateThreshold =
  candidate.candidateThreshold ?? candidate.classificationThreshold;

const languages = [...new Set(rows.map((row) => row.language))].sort();

console.log(
  JSON.stringify(
    {
      dataset: DATASET,
      revision: DATASET_REVISION,
      sourceUrl: DATASET_URL,
      rows: rows.length,
      expectedRows: EXPECTED_ROWS,
      languages,
      candidateModelVersion: candidate.modelVersion,
      candidateThreshold,
      candidateEnsembleWeight: candidate.ensembleWeight,
      productionOverall: evaluate(rows, productionScore, 0.5),
      candidateOverall: evaluate(rows, candidateScore, candidateThreshold),
      productionByLanguage: Object.fromEntries(
        languages.map((language) => {
          const subset = rows.filter((row) => row.language === language);
          return [
            language,
            { count: subset.length, metrics: evaluate(subset, productionScore, 0.5) },
          ];
        }),
      ),
      candidateByLanguage: Object.fromEntries(
        languages.map((language) => {
          const subset = rows.filter((row) => row.language === language);
          return [
            language,
            {
              count: subset.length,
              metrics: evaluate(subset, candidateScore, candidateThreshold),
            },
          ];
        }),
      ),
    },
    null,
    2,
  ),
);
