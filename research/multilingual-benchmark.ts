/**
 * Research-only multilingual smoke benchmark.
 *
 * Evaluates the frozen production model and the generated v1.1 candidate
 * on a small Indian Hindi/Hinglish/English scam-message dataset.
 * This is an evaluation-only check; it never changes production code.
 */

import { readFileSync } from "node:fs";
import { predictText, computeMetrics, type ConfusionMatrix } from "../src/lib/analyzer/classifier";

const DATASET_URL =
  "https://huggingface.co/buckets/bhoomee/Indian_Multilingual_Scam_Message_Dataset-bucket/resolve/main/ultra_premium_scam_dataset.csv";
const ARTIFACT_PATH = "/tmp/scamshield-v11-candidate-model.json";

type Label = "scam" | "legit";
type Row = { message: string; label: Label; language: string };
type Candidate = {
  priorScam: number;
  classificationThreshold: number;
  ensembleWeight: number;
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
  const response = await fetch(DATASET_URL);
  if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);
  const csv = await response.text();
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = parsed.shift();
  if (!header) throw new Error("Dataset is empty.");

  const index = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
  const messageIndex = index.get("message");
  const labelIndex = index.get("label");
  const languageIndex = index.get("language");
  if (messageIndex === undefined || labelIndex === undefined || languageIndex === undefined) {
    throw new Error("Dataset schema is missing message/label/language columns.");
  }

  return parsed.flatMap((cells) => {
    const message = (cells[messageIndex] ?? "").trim();
    const rawLabel = (cells[labelIndex] ?? "").trim().toLowerCase();
    const language = (cells[languageIndex] ?? "").trim() || "Unknown";
    if (!message) return [];
    if (rawLabel !== "scam" && rawLabel !== "legit") return [];
    return [{ message, label: rawLabel as Label, language }];
  });
}

function candidateProbability(candidate: Candidate, text: string): number {
  const normalized = text.toLowerCase();
  const tokens = normalized.match(/[a-z]+|\d+/g) ?? [];
  let logOdds = Math.log(candidate.priorScam / Math.max(1e-9, 1 - candidate.priorScam));
  for (const token of tokens) logOdds += candidate.tokenLogOdds[token] ?? 0;
  return 1 / (1 + Math.exp(-logOdds));
}

function evaluate(rows: Row[], score: (row: Row) => number, threshold: number) {
  const matrix: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const row of rows) {
    const predictedScam = score(row) >= threshold;
    if (row.label === "scam") {
      if (predictedScam) matrix.tp += 1;
      else matrix.fn += 1;
    } else if (predictedScam) matrix.fp += 1;
    else matrix.tn += 1;
  }
  return computeMetrics(matrix);
}

const rows = await loadRows();
const candidate = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as Candidate;

const languages = [...new Set(rows.map((row) => row.language))].sort();
const productionByLanguage = Object.fromEntries(
  languages.map((language) => {
    const subset = rows.filter((row) => row.language === language);
    return [language, { count: subset.length, metrics: evaluate(subset, (row) => predictText(row.message).scamProbability, 0.5) }];
  }),
);

const candidateByLanguage = Object.fromEntries(
  languages.map((language) => {
    const subset = rows.filter((row) => row.language === language);
    return [language, { count: subset.length, metrics: evaluate(subset, (row) => {
      const v1 = predictText(row.message).scamProbability;
      const v11 = candidateProbability(candidate, row.message);
      return v1 * (1 - candidate.ensembleWeight) + v11 * candidate.ensembleWeight;
    }, candidate.classificationThreshold) }];
  }),
);

const candidateOverall = evaluate(rows, (row) => {
  const v1 = predictText(row.message).scamProbability;
  const v11 = candidateProbability(candidate, row.message);
  return v1 * (1 - candidate.ensembleWeight) + v11 * candidate.ensembleWeight;
}, candidate.classificationThreshold);

console.log(JSON.stringify({
  dataset: DATASET_URL,
  rows: rows.length,
  languages,
  candidateThreshold: candidate.classificationThreshold,
  candidateEnsembleWeight: candidate.ensembleWeight,
  productionOverall: evaluate(rows, (row) => predictText(row.message).scamProbability, 0.5),
  candidateOverall,
  productionByLanguage,
  candidateByLanguage,
}, null, 2));
