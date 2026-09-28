import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  Finding,
  RiskAssessment,
  ScoreBreakdown,
  TextAnalysisResult,
  UrlAnalysisResult,
} from "@/lib/analyzer/types";
import { getModelMetrics } from "@/lib/analyzer/metrics";

const SEVERITY_CLASS: Record<Finding["severity"], string> = {
  critical: "text-risk-critical",
  high: "text-risk-high",
  medium: "text-risk-medium",
  low: "text-muted-foreground",
  info: "text-muted-foreground",
};

const SOURCE_LABEL: Record<Finding["source"], string> = {
  rule_engine: "rule",
  ml_model: "model",
  url_analysis: "url",
  external_verification: "external",
  entity_extraction: "entity",
};

export function FindingsCard({ findings }: { findings: Finding[] }) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">What we found</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {findings.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No scam patterns matched. Absence of signals is not proof of safety.
          </p>
        )}
        {findings.map((f) => (
          <div key={f.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{f.title}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {f.id}
              </Badge>
              <span className={cnSeverity(f.severity)}>
                {f.severity}
              </span>
              <span className="text-[11px] text-muted-foreground">
                · {SOURCE_LABEL[f.source]}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.explanation}</p>
            {f.evidence.length > 0 && (
              <div className="space-y-1.5">
                {f.evidence.map((e, i) => (
                  <p
                    key={i}
                    className="rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs italic leading-relaxed"
                  >
                    “{e}”
                  </p>
                ))}
              </div>
            )}
            <Separator className="opacity-60" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function cnSeverity(s: Finding["severity"]) {
  return `text-[11px] font-medium uppercase tracking-wide ${SEVERITY_CLASS[s]}`;
}

export function ContributionsCard({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">How the score was built</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every point is traceable to a component.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.components.map((c) => {
          const width = Math.min(100, (Math.abs(c.points) / c.cap) * 100);
          return (
            <div key={c.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="tnum text-muted-foreground">
                  {c.points > 0 ? "+" : ""}
                  {c.points} / {c.cap}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${c.points >= 0 ? "bg-foreground/70" : "bg-risk-low"}`}
                  style={{ width: `${Math.max(2, width)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function UrlReportsCard({ reports }: { reports: UrlAnalysisResult[] }) {
  if (reports.length === 0) return null;
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Link analysis</CardTitle>
        <p className="text-xs text-muted-foreground">
          Structural inspection only — no site was visited.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {reports.map((r, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs">
                {r.host}
              </code>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {r.protocol} · {r.verdict.replace(/_/g, " ")}
              </span>
            </div>
            {r.flags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No structural red flags found. This does not verify ownership or safety.
              </p>
            ) : (
              <ul className="space-y-2">
                {r.flags.map((f) => (
                  <li key={f.id} className="text-sm">
                    <span className={cnSeverity(f.severity)}>{f.severity}</span>
                    <span className="ml-2 font-medium">{f.title}</span>
                    <span className="block pl-0 text-xs leading-relaxed text-muted-foreground sm:pl-4">
                      {f.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {r.note && (
              <p className="text-xs italic text-muted-foreground">{r.note}</p>
            )}
            {idx < reports.length - 1 && <Separator className="opacity-60" />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EntitiesCard({ entities }: { entities: TextAnalysisResult["entities"] }) {
  if (entities.length === 0) return null;
  const label: Record<string, string> = {
    url: "Link",
    ip_url: "IP link",
    email: "Email",
    phone: "Phone",
    payment_handle: "Payment handle",
    amount: "Amount",
    language: "Language",
  };
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Detected entities</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {entities.map((e, i) => (
          <Badge
            key={i}
            variant="outline"
            className="max-w-full gap-1.5 font-normal"
            title={e.value}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label[e.kind] ?? e.kind}
            </span>
            <span className="truncate">{e.value}</span>
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}

export function UncertaintyCard({ assessment }: { assessment: RiskAssessment }) {
  if (assessment.uncertaintyNotes.length === 0) return null;
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Uncertainty & limitations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
          {assessment.uncertaintyNotes.map((n, i) => (
            <li key={i}>{n.message}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function MlCard({ result }: { result: TextAnalysisResult }) {
  const metrics = getModelMetrics();
  const p = result.ml;
  const showPrediction = p.modelVersion !== "none" && (p.topScamTokens.length > 0 || p.topLegitTokens.length > 0 || p.confidence >= 0.2);
  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Model prediction</CardTitle>
        <p className="text-xs text-muted-foreground">
          {p.modelVersion} · Naive Bayes · 5-fold CV: accuracy {(metrics.accuracy * 100).toFixed(0)}%, precision {(metrics.precision * 100).toFixed(0)}%, recall {(metrics.recall * 100).toFixed(0)}% (measured on the seed dataset, not claimed on unseen data)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showPrediction ? (
          <p className="text-sm text-muted-foreground">
            The model did not form a confident view on this input; its contribution was reduced (abstention behavior).
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">Scam probability</span>
              <span className="tnum text-muted-foreground">
                {(p.scamProbability * 100).toFixed(0)}% (margin {(p.confidence * 100).toFixed(0)}%)
              </span>
            </div>
            {p.topScamTokens.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.topScamTokens.map((t) => (
                  <Badge key={t.token} variant="outline" className="font-normal text-risk-high">
                    {t.token}
                  </Badge>
                ))}
              </div>
            )}
            {p.topLegitTokens.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.topLegitTokens.map((t) => (
                  <Badge key={t.token} variant="outline" className="font-normal text-risk-low">
                    {t.token}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Highlighted tokens are the words that pushed the prediction in each direction. This is a
              model view, not a definitive cause.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
