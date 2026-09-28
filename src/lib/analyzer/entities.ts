/**
 * Entity extraction for ScamShield AI.
 *
 * Pure regex/NLP extraction over normalized text. Multibyte safe — all
 * extraction works on plain JS strings, never char-code arithmetic.
 */

import type { ExtractedEntity } from "./types";

// ---------------------------------------------------------------------------
// URL / IP extraction
// ---------------------------------------------------------------------------

const URL_RE =
  /(?:https?:\/\/|www\.)[a-z0-9-._~%]+(?::\d{2,5})?(?:\/[^\s"'<>]*)?/gi;

// Bare domains inside prose: "paytm-secure.xyz pe click karo" — require a
// plausible TLD so we don't extract ordinary words.
const BARE_DOMAIN_RE =
  /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|in|co|io|xyz|top|club|online|site|link|info|biz|app|dev|me|us|uk|ru|cn|tk|ml|ga|cf|gq|icu|vip|shop|store|live|rest|surf|bar|monster)\b/gi;

const IPV4_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

// ---------------------------------------------------------------------------
// Contact / payment entities
// ---------------------------------------------------------------------------

const EMAIL_RE =
  /\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi;

/** E.164-ish international numbers, then Indian/10-digit patterns.
 * Lookarounds (not \b) prevent substring matches inside longer digit runs
 * such as order/transaction ids. */
const PHONE_RE =
  /(?<!\d)(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){10}(?!\d)|(?<!\d)(?:0|\+91)[\s-]?\d{10}(?!\d)/g;

const UPI_RE = /\b[a-z0-9][a-z0-9._-]{1,40}@(?:upi|ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|axl)\b/gi;

const AMOUNT_RE =
  /(?:₹|rs\.?|inr|usd|\$|€|£)\s?\d[\d,.]*(?:\s?(?:k|lakh|lac|crore|cr))?\b|\b\d[\d,]*(?:,\d{2,3})*(?:\.\d{1,2})?\s?(?:k|lakh|lac|crore|cr)\b/gi;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function extractUrls(text: string): string[] {
  const urls = text.match(URL_RE) ?? [];
  const bare = text.match(BARE_DOMAIN_RE) ?? [];
  // Bare domains that are already part of a captured URL are dropped.
  const inUrls = new Set(urls.map((u) => u.replace(/^https?:\/\//, "").split("/")[0].toLowerCase()));
  const extraBare = bare.filter((d) => !inUrls.has(d.toLowerCase()));
  return dedupe([...urls, ...extraBare]);
}

export function extractEmails(text: string): string[] {
  return dedupe(text.match(EMAIL_RE) ?? []);
}

export function extractPhones(text: string): string[] {
  return dedupe((text.match(PHONE_RE) ?? []).map((p) => p.trim())).filter(
    (p) => p.replace(/\D/g, "").length >= 10 && p.replace(/\D/g, "").length <= 13,
  );
}

export function extractUpiHandles(text: string): string[] {
  return dedupe(text.match(UPI_RE) ?? []);
}

export function extractAmounts(text: string): string[] {
  return dedupe(text.match(AMOUNT_RE) ?? []);
}

/** Main entry point: all entities for the pipeline. */
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const url of extractUrls(text)) {
    const isIp = /^\d{1,3}(\.\d{1,3}){3}/.test(
      url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
    );
    let host = url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[:/?]/)[0]
      .toLowerCase();
    if (isIp) host = host.split("/")[0];
    entities.push({
      kind: isIp ? "ip_url" : "url",
      value: url,
      host,
    });
  }

  for (const ip of text.match(IPV4_RE) ?? []) {
    // IPs mentioned in prose that weren't part of a URL still matter.
    if (!entities.some((e) => e.value.includes(ip))) {
      entities.push({ kind: "ip_url", value: ip, host: ip });
    }
  }

  for (const email of extractEmails(text)) {
    entities.push({ kind: "email", value: email });
  }

  for (const phone of extractPhones(text)) {
    entities.push({ kind: "phone", value: phone });
  }

  for (const upi of extractUpiHandles(text)) {
    entities.push({ kind: "payment_handle", value: upi });
  }

  for (const amount of extractAmounts(text)) {
    entities.push({ kind: "amount", value: amount });
  }

  // Script detection (multilingual support surface for the UI).
  const devanagari = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  if (devanagari > 3 && latin > 3) {
    entities.push({ kind: "language", value: "Mixed Hindi-English (Hinglish / Devanagari + Latin)" });
  } else if (devanagari > 3) {
    entities.push({ kind: "language", value: "Hindi (Devanagari)" });
  } else if (latin > 3 && /\b(hai|karo|kijiye|kya|nahi|nahin|aap|aapka|sir|madam|jaldi|paisa|paise|bhejo|kar)\b/i.test(text)) {
    entities.push({ kind: "language", value: "Hinglish (Roman-script Hindi + English)" });
  }

  return entities;
}
