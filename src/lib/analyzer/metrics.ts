/**
 * Client-safe access to measured model metrics. The classifier trains at
 * import time (fast, ~70 examples), so importing it on the client is fine and
 * guarantees the metrics shown in the UI are the real computed values.
 */

export {
  MODEL_METRICS,
  MODEL_VERSION,
  DATASET_SIZE,
  computeMetrics,
  crossValidate,
  tokenize,
} from "./classifier";
export { DATASET_STATS } from "./dataset";

import { MODEL_METRICS } from "./classifier";

/** Convenience accessor used by UI components. */
export function getModelMetrics() {
  return MODEL_METRICS;
}
