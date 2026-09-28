import { cn } from "@/lib/utils";
import { AlertTriangle, CircleAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { RiskLevel } from "@/lib/analyzer/types";

const LEVEL_META: Record<
  RiskLevel,
  { color: string; bg: string; border: string; icon: typeof ShieldCheck; hint: string }
> = {
  "LOW RISK": {
    color: "text-risk-low",
    bg: "bg-risk-low-bg",
    border: "border-risk-low/30",
    icon: ShieldCheck,
    hint: "No significant indicators",
  },
  "MEDIUM RISK": {
    color: "text-risk-medium",
    bg: "bg-risk-medium-bg",
    border: "border-risk-medium/30",
    icon: CircleAlert,
    hint: "Some caution advised",
  },
  "HIGH RISK": {
    color: "text-risk-high",
    bg: "bg-risk-high-bg",
    border: "border-risk-high/30",
    icon: AlertTriangle,
    hint: "Strong caution — verify first",
  },
  "CRITICAL RISK": {
    color: "text-risk-critical",
    bg: "bg-risk-critical-bg",
    border: "border-risk-critical/30",
    icon: AlertTriangle,
    hint: "Likely scam pattern",
  },
  "INSUFFICIENT EVIDENCE": {
    color: "text-risk-unknown",
    bg: "bg-risk-unknown-bg",
    border: "border-risk-unknown/30",
    icon: ShieldQuestion,
    hint: "Not enough information",
  },
};

export function RiskBadge({
  level,
  className,
  showHint = false,
}: {
  level: RiskLevel;
  className?: string;
  showHint?: boolean;
}) {
  const meta = LEVEL_META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        meta.bg,
        meta.color,
        meta.border,
        className,
      )}
    >
      <Icon className="size-3.5" />
      <span>{level}</span>
      {showHint && <span className="font-normal opacity-80">· {meta.hint}</span>}
    </span>
  );
}

export function ScoreMeter({
  score,
  level,
  className,
}: {
  score: number;
  level: RiskLevel;
  className?: string;
}) {
  const meta = LEVEL_META[level];
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="tnum text-4xl font-semibold tracking-tight">
          {score}
          <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700", meta.bg)}
          style={{
            width: `${Math.max(3, score)}%`,
            backgroundColor: `var(--risk-${level === "LOW RISK" ? "low" : level === "MEDIUM RISK" ? "medium" : level === "HIGH RISK" ? "high" : level === "CRITICAL RISK" ? "critical" : "unknown"})`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Calm</span>
        <span>Caution</span>
        <span>Danger</span>
      </div>
    </div>
  );
}

export { LEVEL_META };
