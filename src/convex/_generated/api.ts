/*
 * Convex API reference for checked-in builds.
 *
 * Uses Convex's official anyApi runtime fallback so CI does not depend on a
 * remote CONVEX_DEPLOYMENT just to resolve generated references.
 */
import { anyApi, type AnyApi } from "convex/server";

export const api: AnyApi = anyApi;
export const internal: AnyApi = anyApi;
