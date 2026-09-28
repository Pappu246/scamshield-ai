/**
 * ScamShield AI — rule definitions.
 *
 * Every rule declares: id, category, severity, explanation, weight and the
 * regex patterns that trigger it. Patterns run against normalized text
 * (Devanagari already transliterated to Roman), so English, Hindi and
 * Hinglish messages hit the same rules.
 *
 * Principle: one weak signal never condemns a message. Weights are modest;
 * the scoring engine applies per-category caps (see scoring.ts).
 */

import type { RuleCategory, Severity } from "./types";

export interface RuleDef {
  id: string;
  title: string;
  category: RuleCategory;
  severity: Severity;
  weight: number;
  explanation: string;
  /** All listed patterns must miss for the rule to stay silent. */
  patterns: RegExp[];
}

const m = (...patterns: RegExp[]): RegExp[] => patterns;

export const RULES: RuleDef[] = [
  // ------------------------------------------------------------------
  // Financial / payment
  // ------------------------------------------------------------------
  {
    id: "PAY-001",
    title: "Upfront fee or deposit requested",
    category: "financial",
    severity: "high",
    weight: 22,
    explanation:
      "Asking for money before delivering anything (registration, processing, training or security fees) is the classic advance-fee scam pattern.",
    patterns: m(
      /\b(registration|processing|training|security|activation|documentation|verification|insurance|courier|delivery|gst)\s*(fee|charge|charges|deposit|payment|amount)\b/i,
      /\b(fee|deposit|charge)\b[^.\n]{0,40}\b(₹|rs\.?|inr|\$|€|£)?\s?\d/i,
      /\b(pay|transfer|send|submit|jama|jmao|bhej|deposit|clear)\b[^.\n]{0,60}\b(fee|deposit|advance|amount|paisa|paise|rupaye|money)\b/i,
      /\b(bhejo|bhej do|jama k(a|ar)?(iye|o)?|pay k(a|ar)?(iye|o)?|transfer k(a|ar)?(iye|o)?)\b[^.\n]{0,40}\b(paisa|paise|rupaye|fee|amount)\b/i,
      /\b(fee|deposit|charge)\b[^.\n]{0,40}\b(jama|bhejo|dena|dijiye|karna hai|kar dijiye|jama kijiye|jama karo)\b/i,
    ),
  },
  {
    id: "PAY-002",
    title: "Payment request with an explicit amount",
    category: "financial",
    severity: "medium",
    weight: 12,
    explanation:
      "A specific money amount combined with a request verb is how advance-fee and payment scams are framed.",
    patterns: m(
      /\b(pay|send|transfer|deposit|bhejo|bhej|jama|pay karo|paise bhejo)\b[^.\n]{0,60}(₹|rs\.?|inr|\$|€|£)\s?\d/i,
      /(₹|rs\.?|inr)\s?\d[\d,.]*[^.\n]{0,60}\b(pay|send|transfer|deposit|jama|bhejo|karna|kijiye|karo)\b/i,
      /\b\d{2,7}\s?(k|lakh|crore)\b[^.\n]{0,60}\b(pay|send|transfer|deposit|bhejo|jama)\b/i,
    ),
  },
  {
    id: "PAY-003",
    title: "Wallet / gift-card / crypto payment channel",
    category: "financial",
    severity: "high",
    weight: 20,
    explanation:
      "Legitimate institutions do not collect fees through gift cards, wallets, crypto or person-to-person transfers.",
    patterns: m(
      /\b(google ?pay|gpay|phone ?pe|phonepe|paytm|amazon ?pay|apple ?pay)\b[^.\n]{0,40}\b(pay|send|transfer|karo|kijiye|bhejo|scan)\b/i,
      /\b(gift ?card|google ?play ?card|itunes ?card|steam ?card|usdt|bitcoin|btc|eth|crypto wallet)\b/i,
      /\b(upi|vpa)\b[^.\n]{0,30}\b(pay|send|bhejo|karo|kijiye|id|address)\b/i,
    ),
  },
  {
    id: "PAY-004",
    title: "Refund / cashback bait",
    category: "financial",
    severity: "medium",
    weight: 10,
    explanation:
      "Fake refund and cashback messages are a common lure; they pressure you to 'confirm' details or pay a small 'processing' amount to release a larger sum.",
    patterns: m(
      /\b(refund|cashback|rewards? points?|cash ?prize|lottery|jackpot|winnings?)\b[^.\n]{0,60}\b(claim|receive|transfer|credit|process|released?)\b/i,
      /\b(claim|receive)\b[^.\n]{0,30}\b(refund|cashback|prize|winnings?|amount)\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Credentials / sensitive data
  // ------------------------------------------------------------------
  {
    id: "CRED-001",
    title: "OTP / PIN / password requested",
    category: "credentials",
    severity: "critical",
    weight: 30,
    explanation:
      "No legitimate organization will ever ask for your OTP, PIN or password. This is a credential-harvesting attempt.",
    patterns: m(
      /\b(otp|one[- ]time (password|code)|pin|password|passcode)\b[^.\n]{0,50}\b(send|share|share karo|batao|bhejo|confirm|enter|verify|dijiye|do|bataye)\b/i,
      /\b(send|share|confirm|bhejo|bata|batayen|share karo|dijiye)\b[^.\n]{0,40}\b(otp|pin|password|passcode|cvv)\b/i,
      /\bcvv\b[^.\n]{0,40}\b(send|share|bata|dijiye|confirm)\b/i,
    ),
  },
  {
    id: "CRED-002",
    title: "Bank / card details requested in a message",
    category: "credentials",
    severity: "high",
    weight: 22,
    explanation:
      "Full account, card or internet-banking details belong only inside your bank's official app or website — never in a chat or email reply.",
    patterns: m(
      /\b(bank|account|ac)\s*(details|number|info)\b[^.\n]{0,50}\b(send|share|provide|submit|confirm|bhejo|batao|share karo)\b/i,
      /\b(send|share|provide|submit|confirm|bhejo|batao)\b[^.\n]{0,50}\b(bank|account|ac)\s*(details|number|info)\b/i,
      /\b(card (number|details)|debit card|credit card|ifsc|net ?banking (password|login)|internet banking)\b[^.\n]{0,50}\b(send|share|provide|confirm|batao|bhejo)\b/i,
    ),
  },
  {
    id: "CRED-003",
    title: "Identity documents requested without clear reason",
    category: "sensitive-data",
    severity: "medium",
    weight: 12,
    explanation:
      "Photos of Aadhaar, PAN or passports can be misused for fraudulent loans and SIM registrations. Unsolicited requests are a red flag.",
    patterns: m(
      /\b(aadhaar|adhar|aadhar|pan ?card|passport|voter ?id)\b[^.\n]{0,50}\b(send|share|upload|submit|whatsapp|bhejo)\b/i,
      /\b(send|share|upload|submit|bhejo)\b[^.\n]{0,40}\b(aadhaar|adhar|aadhar|pan ?card|passport)\b[^.\n]{0,20}\b(copy|photo|scan|pdf|pic)\b/i,
    ),
  },
  {
    id: "CRED-004",
    title: "Login verification via link",
    category: "credentials",
    severity: "high",
    weight: 18,
    explanation:
      "'Click here to verify/confirm/login' links are the standard phishing delivery mechanism; the destination is usually a credential-harvesting clone.",
    patterns: m(
      /\b(verify|confirm|validate|login|log ?in|update|reactivate|resume|unlock)\b[^.\n]{0,40}\b(account|identity|kyc|profile|details|wallet)\b[^.\n]{0,40}\b(link|below|here|click)\b/i,
      /\b(click|tap)\b[^.\n]{0,40}\b(verify|confirm|login|update|claim|activate)\b/i,
      /\b(link|click)\b[^.\n]{0,30}\b(verify|confirm|karo|kijiye|activate|update)\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Urgency / pressure
  // ------------------------------------------------------------------
  {
    id: "URG-001",
    title: "Urgency and deadline pressure",
    category: "urgency",
    severity: "medium",
    weight: 12,
    explanation:
      "Manufactured urgency ('within 24 hours', 'last day', 'account will be closed') exists to stop you from thinking or verifying independently.",
    patterns: m(
      /\b(within \d+\s?(hours?|hrs?|minutes?|mins?|days?)|\d+\s?hours? (only|left)|last (day|chance|date|warning)|final (notice|reminder|warning)|expires? (today|tomorrow|in))\b/i,
      /\b(hurry|urgent|urgently|immediately|right now|asap|act now|today only|before (it'?s? )?too late)\b/i,
      /\b(jaldi|turant|foran|abhi (karo|kijiye|bhejo|reply|kijiye)|time (khatam|nahi))\b/i,
      /\b(account|offer|link|slot)\b[^.\n]{0,30}\b(expire|block|close|deactivate|band)\b[^.\n]{0,30}\b(today|tomorrow|soon|24|48|\d+)\b/i,
    ),
  },
  {
    id: "URG-002",
    title: "Threat of account suspension or legal action",
    category: "urgency",
    severity: "high",
    weight: 18,
    explanation:
      "Banks and government agencies do not threaten suspension or police action over chat or email. Such threats are extortion-style pressure.",
    patterns: m(
      /\b(account|card|wallet|sim|number)\b[^.\n]{0,40}(will be|shall be|would be|going to be)?\s?(suspend|blocked|frozen|closed|deactivated|terminated)\b/i,
      /\b(legal action|police|arrest|warrant|fir|court case|cibill|cibil)\b[^.\n]{0,40}\b(file|filed|initiate|started|report)\b/i,
      /\b(kyc)\b[^.\n]{0,40}\b(expired?|suspend|blocked|update (within|by|before))\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Impersonation
  // ------------------------------------------------------------------
  {
    id: "IMP-001",
    title: "Claims to be a bank, government agency or major company",
    category: "impersonation",
    severity: "medium",
    weight: 10,
    explanation:
      "The message claims an official identity. Genuine institutions rarely initiate contact through personal chat apps; verify through their official app, website or branch.",
    patterns: m(
      /\b(sbi|hdfc|icici|axis bank|kotak|pnb|paytm bank|reserve bank|rbi|income tax|gst (dept|department|officer)|cbi|income ?tax (dept|department))\b/i,
      /\b(dear customer|dear (sir|madam)|respected? (sir|madam))\b[^.\n]{0,80}\b(bank|account|kyc|debit|credit|block)\b/i,
    ),
  },
  {
    id: "IMP-002",
    title: "Lotto / KBC-style prize impersonation",
    category: "reward-scam",
    severity: "high",
    weight: 20,
    explanation:
      "The 'you won a lottery/KBC prize' script is one of the most common scams; real lotteries never ask winners to pay a fee to release winnings.",
    patterns: m(
      /\b(kbc|lottery|lucky draw|lucky winner|congratulations.{0,40}(won|winner|selected|prize))\b/i,
      /\b(you have (been )?(won|selected|chosen)|aap (jit|jeet) (gaye|chuke)|aapka (number|naam) (select|choose))\b/i,
      /\b(jio|airtel|vodafone|idea|whatsapp)\b[^.\n]{0,30}\b(lucky draw|lottery|prize|winner)\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Job / internship scams
  // ------------------------------------------------------------------
  {
    id: "JOB-001",
    title: "Pay-first job offer",
    category: "job-scam",
    severity: "critical",
    weight: 28,
    explanation:
      "Genuine employers never charge candidates. A 'registration/training/security fee' to get a job is the defining trait of recruitment fraud.",
    patterns: m(
      /\b(pay|deposit|submit|jama)\b[^.\n]{0,60}\b(first|before|to (get|confirm|book|start|join))\b[^.\n]{0,40}\b(job|internship|offer|selection|interview|joining)\b/i,
      /\b(job|internship|offer letter|selection)\b[^.\n]{0,60}\b(fee|deposit|charge|payment|amount)\b/i,
      /\b(pay first|fee first|paisa (pehle|first)|pehle (paisa|paise|pay))\b/i,
    ),
  },
  {
    id: "JOB-002",
    title: "Guaranteed selection or salary",
    category: "job-scam",
    severity: "high",
    weight: 18,
    explanation:
      "No legitimate recruiter can guarantee selection or a fixed salary before an interview and offer process.",
    patterns: m(
      /\b(guaranteed?|100%)\s?(job|selection|placement|salary|income|offer)\b/i,
      /\b(job|selection|placement|salary|income)\b[^.\n]{0,30}\b(guaranteed?|100% (sure|guaranteed))\b/i,
      /\b(naukri|job)\b[^.\n]{0,30}\b(pakka|guarantee|100 (percent|%))\b/i,
    ),
  },
  {
    id: "JOB-003",
    title: "No interview required",
    category: "job-scam",
    severity: "medium",
    weight: 10,
    explanation:
      "'No interview, direct joining' skips the exact steps real companies use to evaluate candidates — a strong recruitment-scam indicator.",
    patterns: m(
      /\b(no (interview|exam|test|resume)|direct (joining|selection|offer)|without (interview|resume))\b/i,
      /\b(interview (nahi|not) (hoga|required|chahiye)|bina interview)\b/i,
    ),
  },
  {
    id: "JOB-004",
    title: "WhatsApp / Telegram-only recruitment",
    category: "job-scam",
    severity: "medium",
    weight: 10,
    explanation:
      "Recruitment handled entirely over WhatsApp or Telegram with personal numbers is typical of fake HR operations; real companies use official channels.",
    patterns: m(
      /\b(whatsapp|telegram)\b[^.\n]{0,40}\b(interview|hr|recruit|joining|offer|job|chat|number|group)\b/i,
      /\b(job|internship|work)\b[^.\n]{0,30}\b(whatsapp|telegram)\b/i,
    ),
  },
  {
    id: "JOB-005",
    title: "Unrealistic pay for simple work",
    category: "job-scam",
    severity: "medium",
    weight: 12,
    explanation:
      "Very high pay for unskilled part-time tasks (typing, likes, follows) is the hook of task-scam operations.",
    patterns: m(
      /\b(part[- ]?time|home[- ]?based|work from home|typing|data entry)\b[^.\n]{0,60}\b(\d{3,6}\s?(per day|daily|per week|\/day)|₹\s?\d{3,6}|rs\.?\s?\d{3,6})\b/i,
      /\b(earn|income|kamaye|kamai)\b[^.\n]{0,40}\b(\d{3,6})\s?(per day|daily|roz|har roz)\b/i,
    ),
  },
  {
    id: "JOB-006",
    title: "Unsolicited offer with no application context",
    category: "job-scam",
    severity: "low",
    weight: 6,
    explanation:
      "Receiving a job offer you never applied for is itself a warning sign; legitimate offers follow an application you can trace.",
    patterns: m(
      /\b(congratulations|congrats|shortlisted|selected)\b[^.\n]{0,80}\b(job|internship|position|role|offer)\b/i,
      /\b(we (have )?(seen|found) your (resume|profile|cv))\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Scholarship / student scams
  // ------------------------------------------------------------------
  {
    id: "SCH-001",
    title: "Scholarship released on payment",
    category: "scholarship-scam",
    severity: "high",
    weight: 22,
    explanation:
      "Government scholarships are credited directly to your bank account — never released after a payment or 'verification fee'.",
    patterns: m(
      /\b(scholarship|grant|stipend|fellowship)\b[^.\n]{0,60}\b(fee|deposit|charge|payment|pay|jama)\b/i,
      /\b(pay|deposit|fee)\b[^.\n]{0,50}\b(scholarship|grant|stipend)\b/i,
      /\b(scholarship)\b[^.\n]{0,40}\b(release|credit|milega|milegi)\b[^.\n]{0,30}\b(fee|pay|jama|deposit)\b/i,
    ),
  },
  {
    id: "SCH-002",
    title: "Government-scheme impersonation",
    category: "scholarship-scam",
    severity: "medium",
    weight: 12,
    explanation:
      "Messages claiming a government scholarship or scheme should be verified on the official portal (e.g. the National Scholarship Portal) — not through links in the message.",
    patterns: m(
      /\b(government scholarship|govt scholarship|central (scheme|scholarship)|state (scheme|scholarship)|nsp|national scholarship)\b/i,
      /\b(pm (yojana|awas|kisan| scholarship)|yojana)\b[^.\n]{0,40}\b(paisa|amount|benefit|apply|registration)\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Investment scams
  // ------------------------------------------------------------------
  {
    id: "INV-001",
    title: "Guaranteed high investment returns",
    category: "investment-scam",
    severity: "high",
    weight: 22,
    explanation:
      "Guaranteed daily/weekly returns far above market rates are the hallmark of Ponzi-style schemes; real investments always carry risk.",
    patterns: m(
      /\b(guaranteed?|fixed|assured)\b[^.\n]{0,30}\b(return|returns|profit|income|roi)\b/i,
      /\b(\d{1,3}%)\s?(return|profit|daily|per day|weekly)\b/i,
      /\b(earn|kamaye)\b[^.\n]{0,30}\b(daily|per day|roz)\b[^.\n]{0,30}\b(\d{3,6}|₹|rs)\b/i,
    ),
  },
  {
    id: "INV-002",
    title: "Trading / betting 'insider' groups",
    category: "investment-scam",
    severity: "medium",
    weight: 14,
    explanation:
      "Telegram/WhatsApp 'trading tips' groups with guaranteed profit claims are commonly operated by fraud rings ('pump-and-dump' or fake trading apps).",
    patterns: m(
      /\b(trading|forex|stock|crypto|binary|betting|satta)\b[^.\n]{0,40}\b(tips|signals?|group|channel|telegram|vip)\b/i,
      /\b(join)\b[^.\n]{0,30}\b(trading|investment)\b[^.\n]{0,30}\b(group|channel)\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Contact / channel anomalies
  // ------------------------------------------------------------------
  {
    id: "CON-001",
    title: "Personal contact details for 'official' business",
    category: "contact",
    severity: "low",
    weight: 6,
    explanation:
      "Official business conducted over a personal Gmail address or a raw phone number is unusual; institutions use domain email and official lines.",
    patterns: m(
      /\b[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|rediffmail)\.(com|co|in)\b/i,
      /\b(contact|call|whatsapp)\b[^.\n]{0,20}\b(us|me|on)\b[^.\n]{0,10}\b(\+?\d[\d\s-]{8,14})\b/i,
    ),
  },

  // ------------------------------------------------------------------
  // Prompt-injection defense (treated as data, but flagged)
  // ------------------------------------------------------------------
  {
    id: "INJ-001",
    title: "Embedded instructions trying to manipulate the analyzer",
    category: "injection",
    severity: "info",
    weight: 0,
    explanation:
      "This message contains text that looks like instructions aimed at AI systems. ScamShield treats message content strictly as data — these instructions were ignored, but their presence is itself suspicious.",
    patterns: m(
      /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier)\b[^.\n]{0,40}\b(instructions?|prompts?|rules?|messages?)\b/i,
      /\b(system prompt|you are (now|an)|act as|pretend to be|developer mode|jailbreak)\b/i,
    ),
  },
];

/** Human-readable summary phrase for a language detection entity. */
export function languageHint(languageEntityValue: string): string | null {
  if (languageEntityValue.startsWith("Hinglish")) return "Hinglish";
  if (languageEntityValue.startsWith("Mixed")) return "Mixed Hindi-English";
  if (languageEntityValue.startsWith("Hindi")) return "Hindi";
  return null;
}
