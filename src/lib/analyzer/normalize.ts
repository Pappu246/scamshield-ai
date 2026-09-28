/**
 * Unicode-safe text normalization for ScamShield AI.
 *
 * Handles English, Hindi (Devanagari) and Hinglish (Roman-script Hindi).
 * Devanagari text is transliterated to a Roman approximation so the same
 * keyword lists match across scripts.
 */

const ZERO_WIDTH = /[\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/g;

/** Collapse whitespace, strip zero-width chars, unify quotes/dashes. */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/**
 * Word-level map of common Devanagari scam/payment vocabulary to the Hinglish
 * forms the rule patterns expect. Applied after transliteration so Hindi
 * messages hit the same rules as Roman-script Hinglish ones.
 */
const DEV_WORD_MAP: [RegExp, string][] = [
  [/\brgistreshn|rjistreshn|rajistreshn|registreshn\b/g, "registration"],
  [/\bphees|phej|fees\b/g, "fee"],
  [/\bjmaa|jma|jamaa\b/g, "jama"],
  [/\bkeejie|kijiye|kejie\b/g, "kijiye"],
  [/\bnaulare|naukaree|naukree|naukari\b/g, "naukri"],
  [/\boffer letter\b/g, "offer letter"],
  [/\bmnies|paise|paisa\b/g, "paise"],
  [/\bpehale|pehle|phale\b/g, "pehle"],
  [/\bbheje|bhejen|bhejo\b/g, "bhejo"],
  [/\botap|otp\b/g, "otp"],
  [/\bbnk|baank|bank\b/g, "bank"],
  [/\bkyc\b/g, "kyc"],
  [/\bjit|jeet|jita\b/g, "jeet"],
  [/\bchun|chuna|chune\b/g, "chune"],
  [/\blucky draw\b/g, "lucky draw"],
  [/\blottry|lotery|lottry\b/g, "lottery"],
  [/\bscholarship\b/g, "scholarship"],
];
const DEV_MAP: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai",
  "ओ": "o", "औ": "au", "अं": "an", "अः": "ah",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "़": "", "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai",
  "ो": "o", "ौ": "au", "ं": "n", "ः": "h", "ँ": "n", "्": "",
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7",
  "८": "8", "९": "9",
  "।": ".", "॥": ".",
  "ऋ": "ri", "ॢ": "l",
};

/**
 * Transliterate Devanagari to a Roman approximation. Non-Devanagari chars
 * (including Latin, emoji, CJK) pass through unchanged.
 */
export function transliterateDevanagari(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch in DEV_MAP) out += DEV_MAP[ch];
    else out += ch;
  }
  return out;
}

/** Apply the Devanagari scam-vocabulary word map (transliteration → Hinglish). */
export function applyDevWordMap(text: string): string {
  let out = text;
  for (const [pattern, replacement] of DEV_WORD_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Full pipeline input normalization: NFC + zero-width stripping + Devanagari
 * transliteration + vocabulary mapping. The original input is preserved
 * separately as evidence.
 */
export function normalizePipelineInput(raw: string): string {
  return applyDevWordMap(transliterateDevanagari(normalizeText(raw)));
}
