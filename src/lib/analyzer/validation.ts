/**
 * ScamShield AI — input validation.
 *
 * Shared by the Convex backend (Node runtime) and client-side pre-validation.
 */

import type { TextAnalysisResult } from "./types";

export const MAX_TEXT_LENGTH = 10_000;
export const MIN_TEXT_LENGTH = 3;
export const MAX_URLS_PER_ANALYSIS = 5;
export const MAX_URL_LENGTH = 2048;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateText(text: string): void {
  if (typeof text !== "string") throw new ValidationError("Text must be a string.");
  if (text.trim().length < MIN_TEXT_LENGTH) {
    throw new ValidationError(`Message must be at least ${MIN_TEXT_LENGTH} characters.`);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new ValidationError(`Message exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit.`);
  }
}

export function validateUrlInput(url: string): void {
  if (typeof url !== "string") throw new ValidationError("URL must be a string.");
  if (url.trim().length < 3) throw new ValidationError("URL is too short.");
  if (url.length > MAX_URL_LENGTH) {
    throw new ValidationError(`URL exceeds the ${MAX_URL_LENGTH} character limit.`);
  }
}

export function validateUrlList(urls: string[] | undefined): string[] {
  if (!urls) return [];
  if (!Array.isArray(urls) || urls.length > MAX_URLS_PER_ANALYSIS) {
    throw new ValidationError(`At most ${MAX_URLS_PER_ANALYSIS} URLs can be analyzed at once.`);
  }
  for (const u of urls) validateUrlInput(u);
  return urls;
}

/** Truncate stored content so raw user input is not kept longer than needed. */
export function truncateForStorage(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Convex document id validation (synchronous, client-safe)
// ---------------------------------------------------------------------------
// Convex ids are NOT arbitrary 32-char base32 strings: they decode (Crockford
// Base32) into VInt(table) ++ 16-byte internal id ++ a 2-byte Fletcher16
// checksum footer, and the backend's `v.id(...)` validator rejects anything
// whose checksum does not match. A well-formed-looking string like 32 × "a"
// therefore throws ArgumentValidationError on the server — and since the
// React client subscribes during render, that exception surfaces as a page
// crash, not a graceful "not found". This validator re-implements the exact
// decode + checksum (per get-convex/convex-backend `crates/value/src/
// id_v6.rs` and `base32.rs`, verified against ids produced by a live
// deployment) so the UI can reject malformed ids before subscribing.
//
// Residual limitation (accepted): a string that decodes as a *valid id of a
// different table* still passes here — the table-name mapping is not known
// client-side. Such input cannot arise from typos or casual garbage; it only
// occurs when someone deliberately fabricates a checksummed id, and even then
// the deployment is unaffected (the query simply errors for that user).
const CONVEX_ID_LENGTH = 32;
// Crockford Base32, lowercase only — Convex's decode table maps exactly these
// 32 characters (digits first, then a–z minus i, l, o, u) and is not
// permissive about case or omitted-letter substitutions.
const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const CONVEX_ID_BYTES = 20; // VInt(table) + 16-byte id + 2-byte footer
const FOOTER_LEN = 2;

function crockfordValue(char: string): number {
  return CROCKFORD_ALPHABET.indexOf(char);
}

function fletcher16(buf: Uint8Array): number {
  let c0 = 0;
  let c1 = 0;
  for (const byte of buf) {
    c0 = (c0 + byte) & 0xff;
    c1 = (c1 + c0) & 0xff;
  }
  return (c1 << 8) | c0;
}

/**
 * Exact synchronous check that a string is a well-formed Convex document id:
 * correct length, Crockford Base32 alphabet, and a Fletcher16 footer that
 * matches the id payload. Anything the backend's `v.id(...)` validator would
 * reject for structural reasons returns false, letting the UI fall back to
 * its not-found state instead of throwing during a live query.
 */
export function isPlausibleConvexId(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== CONVEX_ID_LENGTH) return false;

  const id = value.toLowerCase();
  // Decode 32 base32 chars (160 bits) into 20 big-endian bytes.
  const bytes = new Uint8Array(CONVEX_ID_BYTES);
  let acc = 0n;
  for (const ch of id) {
    const v = crockfordValue(ch);
    if (v < 0) return false;
    acc = (acc << 5n) | BigInt(v);
  }
  for (let i = 0; i < CONVEX_ID_BYTES; i++) {
    bytes[i] = Number((acc >> BigInt((CONVEX_ID_BYTES - 1 - i) * 8)) & 0xffn);
  }

  // Footer = fletcher16(payload) ^ version(0), stored little-endian.
  const payload = bytes.subarray(0, CONVEX_ID_BYTES - FOOTER_LEN);
  const expected = (bytes[CONVEX_ID_BYTES - 1] << 8) | bytes[CONVEX_ID_BYTES - 2];
  return fletcher16(payload) === expected;
}

/**
 * Parse a persisted analysis result defensively: a corrupt or incomplete row
 * must never crash the result page. Returns null unless the JSON decodes into
 * something carrying the structural fields the UI relies on.
 */
export function parseStoredResult(json: string): TextAnalysisResult | null {
  try {
    const parsed = JSON.parse(json) as Partial<TextAnalysisResult> | null;
    if (parsed === null || typeof parsed !== "object") return null;
    if (!parsed.assessment || !parsed.assessment.breakdown) return null;
    if (!parsed.ml || !Array.isArray(parsed.entities)) return null;
    if (!Array.isArray(parsed.findings) || !Array.isArray(parsed.urlReports)) return null;
    return parsed as TextAnalysisResult;
  } catch {
    return null;
  }
}
