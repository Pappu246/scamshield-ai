/**
 * Research-only multilingual smoke benchmark.
 *
 * Evaluates the frozen production model and the generated v1.1 candidate
 * on a small Indian Hindi/Hinglish/English scam-message dataset.
 *
 * The benchmark is evaluation-only: it never changes production code.
 * The source is the public Hugging Face dataset repository; the run validates
 * the exact 120-row CSV schema before scoring and records the source revision.
 */

import {
  computeMetrics,
  predictText,
  tokenize,
  type ConfusionMatrix,
} from "../src/lib/analyzer/classifier";
import { readFileSync } from "node:fs";

const DATASET = "karanverma19/Indian_Multilingual_Scam_Message_Dataset";
const DATASET_REVISION = "7019a60";
const DATASET_URL =
  `https://huggingface.co/datasets/${DATASET}/resolve/${DATASET_REVISION}/ultra_premium_scam_dataset.csv`;
const EXPECTED_ROWS = 120;
const ARTIFACT_PATH = "/tmp/scamshield-v11-candidate-model.json";

type Label = "scam" | "legit";
type Row = { message: string; label: Label; language: string };

type Candidate = {
  priorScam: number;
  classificationThreshold: number;
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

      if (!header) throw new Error("Multilingual dataset is empty.");

      const index = new Map(
        header.map((name, i) => [name.trim().toLowerCase(), i]),
      );
      const messageIndex = index.get("message");
      const labelIndex = index.get("label");
      const languageIndex = index.get("language");

      if (
        messageIndex === undefined ||
        labelIndex === undefined ||
        languageIndex === undefined
      ) {
        throw new Error(
          "Dataset schema is missing message/label/language columns.",
        );
      }

      const rows: Row[] = parsed.flatMap((cells) => {
        const message = (cells[messageIndex] ?? "").trim();
        const rawLabel = (cells[labelIndex] ?? "").trim().toLowerCase();
        const language = (cells[languageIndex] ?? "").trim();

        const label =
          rawLabel === "scam"
            ? "scam"
            : rawLabel === "legit"
              ? "legit"
              : null;

        return message && language && label
          ? [{ message, label, language }]
          : [];
      });

      if (rows.length !== EXPECTED_ROWS) {
        throw new Error(
          `Expected ${EXPECTED_ROWS} usable rows, received ${rows.length}.`,
        );
      }

      const languages = new Set(rows.map((row) => row.language.toLowerCase()));
      for (const family of ["english", "hindi", "hinglish"]) {
        if (![...languages].some((language) => language.includes(family))) {
          throw new Error(
            `Multilingual dataset is missing the ${family} language family.`,
          );
        }
      }

      return rows;
    }

    if (![429, 502, 503, 504].includes(response.status)) {
      throw new Error(
        `Multilingual dataset request failed: HTTP ${response.status}`,
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
    `Multilingual dataset unavailable after retries: HTTP ${lastStatus}`,
  );
}

function candidateProbability(candidate: Candidate, text: string): number {
  // Match the candidate-training tokenizer exactly so Hindi/Hinglish uses the
  // same normalization/transliteration path as production.
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
      { count: subset.length, metrics: evaluate(subset, productionScore, 0.5) },
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
      revision: DATASET_REVISION,
      sourceUrl: DATASET_URL,
      rows: rows.length,
      expectedRows: EXPECTED_ROWS,
      languages,
      candidateModelVersion: "nb-scam-v1.1-external-seed-oversampled",
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
