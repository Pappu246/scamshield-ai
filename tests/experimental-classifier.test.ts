import { describe, expect, it } from "vitest";
import {
  CHAR_MODEL_WEIGHT,
  EXPERIMENTAL_MODEL_METRICS,
  EXPERIMENTAL_MODEL_VERSION,
  predictTextExperimental,
} from "../src/lib/analyzer/classifierExperimental";

describe("experimental v1.1 character ensemble", () => {
  it("uses a fixed secondary character-model weight", () => {
    expect(CHAR_MODEL_WEIGHT).toBe(0.25);
  });

  it("returns a valid probability and the experimental model version", () => {
    const prediction = predictTextExperimental(
      "Your KYC expires today. Pay Rs 1999 immediately.",
    );

    expect(prediction.modelVersion).toBe(EXPERIMENTAL_MODEL_VERSION);
    expect(prediction.scamProbability).toBeGreaterThanOrEqual(0);
    expect(prediction.scamProbability).toBeLessThanOrEqual(1);
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
  });

  it("reports deterministic cross-validation metrics", () => {
    expect(EXPERIMENTAL_MODEL_METRICS.confusion.tp).toBeGreaterThanOrEqual(0);
    expect(EXPERIMENTAL_MODEL_METRICS.confusion.fp).toBeGreaterThanOrEqual(0);
    expect(EXPERIMENTAL_MODEL_METRICS.confusion.fn).toBeGreaterThanOrEqual(0);
    expect(EXPERIMENTAL_MODEL_METRICS.confusion.tn).toBeGreaterThanOrEqual(0);
  });
});
