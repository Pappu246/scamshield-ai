/**
 * ScamShield AI — URL structural analyzer.
 *
 * v1 deliberately performs ZERO network fetching: the URL is parsed and
 * inspected structurally only. This removes the whole SSRF attack surface
 * (no requests to internal ranges, no redirects to follow, no content to
 * download). When no external reputation source is available the report says
 * so explicitly ("Unable to verify") instead of pretending knowledge.
 */

import type { Severity, UrlAnalysisResult, UrlFindingItem, UrlVerdict } from "./types";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const MAX_URL_LENGTH = 2048;

export interface ParsedUrl {
  url: string;
  protocol: string;
  host: string;
  urlKind: "ip" | "domain";
  labels: string[]; // host split by "."
  isHttps: boolean;
  path: string;
  query: string;
}

export class InvalidUrlError extends Error {}

/** Parse and strictly validate a user-supplied URL. Throws InvalidUrlError. */
export function parseUrl(input: string): ParsedUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError("URL is empty.");
  if (trimmed.length > MAX_URL_LENGTH) throw new InvalidUrlError("URL is too long.");

  // Reject control characters / whitespace inside the URL.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) {
    throw new InvalidUrlError("URL contains invalid characters.");
  }

  // Only http(s) schemes are analyzable; also blocks javascript:, data:, file:, etc.
  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`; // bare domain — analyze as if web address
  }
  if (!/^https?:\/\//i.test(candidate)) {
    throw new InvalidUrlError("Only http and https URLs are supported.");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidUrlError("This does not look like a valid URL.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) throw new InvalidUrlError("URL has no hostname.");

  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
  if (!isIpV4 && labels.length < 2) {
    throw new InvalidUrlError("URL hostname is not a valid domain.");
  }
  for (const label of labels) {
    if (!/^[a-z0-9-]+$/.test(label)) {
      // Allows punycode (xn--…) but blocks spaces, slashes and weird bytes.
      throw new InvalidUrlError("URL hostname contains invalid characters.");
    }
  }

  return {
    url: parsed.toString(),
    protocol: parsed.protocol.replace(":", ""),
    host,
    urlKind: isIpV4 ? "ip" : "domain",
    labels,
    isHttps: parsed.protocol === "https:",
    path: parsed.pathname,
    query: parsed.search,
  };
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

const HIGH_RISK_TLDS = new Set([
  "tk", "ml", "ga", "cf", "gq", // free/f abuse-prone
  "top", "xyz", "club", "online", "site", "icu", "vip", "buzz", "monster",
  "rest", "surf", "bar", "cyou", "sbs", "cam", "quest", "zip", "mov",
]);

const BRANDS = [
  "sbi", "hdfc", "icici", "axis", "kotak", "paytm", "phonepe", "googlepay",
  "amazon", "flipkart", "facebook", "instagram", "whatsapp", "linkedin",
  "microsoft", "apple", "gmail", "outlook", "yahoo", "paypal", "upi", "sbibank",
  "hdfcbank", "icicibank",
];

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "is.gd", "cutt.ly", "rb.gy",
  "shorturl.at", "ow.ly", "buff.ly", "rebrand.ly", "tiny.cc", "bit.do",
  "v.gd", "clck.ru", "s.id", "lnkd.in", "t.ly", "shrtco.de",
]);

const SUSPICIOUS_PATH_KEYWORDS = [
  "login", "verify", "secure", "account", "update", "confirm", "signin",
  "billing", "invoice", "payment", "wallet", "kyc", "otp", "reset",
];

const SUSPICIOUS_URL_KEYWORDS = [
  ...SUSPICIOUS_PATH_KEYWORDS,
  "gift", "prize", "winner", "bonus", "refund", "offer", "free", "earn",
  "cashback", "lottery", "claim", "reward",
];

function flag(id: string, title: string, severity: Severity, detail: string): UrlFindingItem {
  return { id, title, detail, severity };
}

interface FeatureResult {
  flags: UrlFindingItem[];
  featureFlags: string[];
}

function analyzeFeatures(u: ParsedUrl): FeatureResult {
  const flags: UrlFindingItem[] = [];
  const featureFlags: string[] = [];

  // HTTPS
  if (!u.isHttps) {
    featureFlags.push("no_https");
    flags.push(
      flag("URL-001", "No HTTPS encryption", "medium",
        "Traffic to this address is not encrypted, and any 'secure' claim in a plain-http link is inherently suspect."),
    );
  }

  // Raw IP host
  if (u.urlKind === "ip") {
    featureFlags.push("ip_host");
    flags.push(
      flag("URL-002", "Raw IP address instead of a domain", "high",
        "Legitimate consumer services use named domains. Raw IP links are commonly used by throwaway scam infrastructure."),
    );
  }

  // Subdomain depth
  const tld = u.labels[u.labels.length - 1];
  const registrable = u.labels.slice(-2).join(".");
  const subdomainCount = u.labels.length - 2;
  if (u.urlKind === "domain" && subdomainCount >= 3) {
    featureFlags.push("excessive_subdomains");
    flags.push(
      flag("URL-003", `${subdomainCount} subdomain levels`, "medium",
        `Host "${u.host}" stacks ${subdomainCount} subdomains before "${registrable}". Deep subdomain chains are a classic spoofing trick.`),
    );
  }

  // High-risk TLD
  if (u.urlKind === "domain" && HIGH_RISK_TLDS.has(tld)) {
    featureFlags.push("high_risk_tld");
    flags.push(
      flag("URL-004", `High-abuse TLD ".${tld}"`, "medium",
        `The ".${tld}" domain space is cheap/free to register and is heavily used in phishing campaigns.`),
    );
  }

  // Length
  if (u.url.length > 100) {
    featureFlags.push("long_url");
    flags.push(
      flag("URL-005", "Unusually long URL", "low",
        `${u.url.length} characters. Excess length is often used to hide the real destination domain.`),
    );
  }

  // Encoded characters
  const encoded = (u.url.match(/%[0-9a-fA-F]{2}/g) ?? []).length;
  if (encoded >= 2) {
    featureFlags.push("encoded_characters");
    flags.push(
      flag("URL-006", "Multiple URL-encoded characters", "low",
        `${encoded} percent-encoded sequences. Encoding can disguise keywords and redirect destinations.`),
    );
  }

  // Punycode / homoglyph host
  if (u.labels.some((l) => l.startsWith("xn--"))) {
    featureFlags.push("punycode_host");
    flags.push(
      flag("URL-007", "Punycode (internationalized) hostname", "high",
        "The host uses xn-- encoding, which can render look-alike characters (homoglyphs) to imitate a trusted brand."),
    );
  }

  // Brand impersonation: brand name appears but domain is NOT the brand's own registrable domain.
  const legitimateBrandDomains: Record<string, string> = {
    sbi: "sbi.co.in", hdfc: "hdfcbank.com", hdfcbank: "hdfcbank.com",
    icici: "icicibank.com", icicibank: "icicibank.com", axis: "axisbank.com",
    kotak: "kotak.com", paytm: "paytm.com", phonepe: "phonepe.com",
    amazon: "amazon.com", flipkart: "flipkart.com", facebook: "facebook.com",
    instagram: "instagram.com", whatsapp: "whatsapp.com", linkedin: "linkedin.com",
    microsoft: "microsoft.com", apple: "apple.com", gmail: "gmail.com",
    googlepay: "pay.google.com", paypal: "paypal.com", upi: "npci.org.in",
  };
  if (u.urlKind === "domain") {
    for (const brand of BRANDS) {
      if (u.host.includes(brand)) {
        const legitDomain = legitimateBrandDomains[brand];
        const isLegit = legitDomain
          ? u.host === legitDomain || u.host.endsWith(`.${legitDomain}`)
          : true;
        if (!isLegit) {
          featureFlags.push("brand_in_domain");
          flags.push(
            flag("URL-008", `Brand name "${brand}" inside an unofficial domain`, "high",
              `The domain contains the brand name "${brand}" but is not the company's official domain — a hallmark of brand-impersonation links.`),
          );
          break;
        }
      }
    }
  }

  // Shortener
  if (SHORTENERS.has(registrable)) {
    featureFlags.push("url_shortener");
    flags.push(
      flag("URL-009", "Shortened URL", "medium",
        `Shorteners like ${registrable} hide the true destination. ScamShield cannot see where this link actually leads.`),
    );
  }

  // Suspicious keywords in URL
  const lower = u.url.toLowerCase();
  const foundKeywords = SUSPICIOUS_URL_KEYWORDS.filter(
    (k) => lower.includes(k) && !SHORTENERS.has(registrable),
  );
  if (foundKeywords.length >= 2) {
    featureFlags.push("suspicious_keywords");
    flags.push(
      flag("URL-010", "Phishing keywords embedded in the URL", "medium",
        `Found: ${foundKeywords.slice(0, 4).join(", ")}. Credential pages often advertise their own purpose in the path.`),
    );
  }

  // Excessive query parameters
  const params = u.query ? new URLSearchParams(u.query).size : 0;
  if (params >= 8) {
    featureFlags.push("excessive_query_params");
    flags.push(
      flag("URL-011", `${params} query parameters`, "low",
        "Parameter stuffing is used both for tracking and to make the true destination harder to read."),
    );
  }

  // Credentials in URL (user:pass@host)
  if (u.url.includes("@") && /https?:\/\/[^/@]+@/.test(u.url)) {
    featureFlags.push("userinfo_trick");
    flags.push(
      flag("URL-012", "Userinfo '@' trick in URL", "high",
        "Text before the '@' is ignored by browsers — everything before it is a decoy and the real host comes after."),
    );
  }

  return { flags, featureFlags };
}

// ---------------------------------------------------------------------------
// Verdict + public API
// ---------------------------------------------------------------------------

const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 40, high: 25, medium: 12, low: 5, info: 0,
};

function computeVerdict(flags: UrlFindingItem[]): UrlVerdict {
  let points = flags.reduce((sum, f) => sum + SEVERITY_POINTS[f.severity], 0);
  if (points >= 35) return "dangerous";
  if (points >= 15) return "suspicious";
  if (flags.length === 0) return "safe_structurally";
  return "suspicious";
}

export function analyzeUrl(input: string): UrlAnalysisResult {
  const u = parseUrl(input);
  const { flags, featureFlags } = analyzeFeatures(u);
  return {
    url: u.url,
    urlKind: u.urlKind,
    host: u.host,
    protocol: u.protocol,
    isHttps: u.isHttps,
    flags,
    featureFlags,
    verdict: computeVerdict(flags),
    verification: "rule",
    note: "Structural analysis only. No external reputation source was queried; nothing here proves the site is safe or unsafe. Unable to verify ownership.",
  };
}
