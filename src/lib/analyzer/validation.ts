/**
 * ScamShield AI — input validation.
 *
 * Shared by the Convex backend (Node runtime) and client-side pre-validation.
 */

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
