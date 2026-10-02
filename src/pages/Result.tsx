import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { RiskBadge, ScoreMeter } from "@/components/scamshield/risk";
import {
  ContributionsCard,
  EntitiesCard,
  FindingsCard,
  MlCard,
  UncertaintyCard,
  UrlReportsCard,
} from "@/components/scamshield/result-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isPlausibleConvexId, parseStoredResult } from "@/lib/analyzer/validation";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

export default function Result() {
  const { id } = useParams<{ id: string }>();
  // Convex ids are 32 base32 chars with a trailing checksum; a string that
  // passes a naive length/alphabet check (e.g. "aaaa…") still throws inside
  // the v.id() validator on the server, which crashes this component during
  // render. The stricter check keeps malformed ids from ever subscribing, so
  // they fall through to the not-found state instead.
  const isValidId = isPlausibleConvexId(id);
  const data = useQuery(
    api.analyses.get,
    isValidId ? { id: id as Id<"analyses"> } : "skip",
  );

  // Loading only while a well-formed id query is actually in flight. A
  // malformed id skips the query (data stays undefined) and must fall through
  // to the not-found state instead of spinning on the skeleton forever.
  if (data === undefined) {
    if (!isValidId) return <ResultNotFound />;
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-40 w-full" />
          <Skeleton className="mt-4 h-40 w-full" />
        </main>
      </div>
    );
  }

  // Not found: unknown id, or an analysis owned by another user.
  if (data === null) {
    return <ResultNotFound />;
  }

  // Corrupt persisted JSON must never crash the page — show not-found.
  const result = parseStoredResult(data.resultJson);
  if (result === null) {
    return <ResultNotFound />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Analysis · {new Date(data.createdAt).toLocaleString()}
            </p>
            <h1 className="mt-1 truncate text-lg font-medium text-muted-foreground">
              {data.inputPreview.slice(0, 90)}
              {data.inputPreview.length > 90 ? "…" : ""}
            </h1>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/analyze">New analysis</Link>
          </Button>
        </div>

        {/* Verdict block — leads with score + level */}
        <Card className="mt-6 border-border/60 shadow-none">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <RiskBadge level={result.assessment.riskLevel} showHint />
                <ScoreMeter score={result.assessment.riskScore} level={result.assessment.riskLevel} className="mt-5" />
                <p className="mt-5 text-sm leading-relaxed">{result.summary}</p>
              </div>
              <div className="shrink-0 sm:w-56">
                <div className="rounded-lg border border-border/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Recommended action
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">
                    {result.assessment.recommendedAction}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-6">
          <FindingsCard findings={result.findings} />
          <ContributionsCard breakdown={result.assessment.breakdown} />
          <UrlReportsCard reports={result.urlReports} />
          <MlCard result={result} />
          <EntitiesCard entities={result.entities} />
          <UncertaintyCard assessment={result.assessment} />
        </div>

        <p className="mt-6 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
          {result.assessment.disclaimer}
        </p>

        <FeedbackRow analysisId={data._id} />
      </main>
      <AppFooter />
    </div>
  );
}

function ResultNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-12 text-center">
            <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-4 text-lg font-medium">Analysis not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This analysis doesn&apos;t exist or belongs to another account.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/analyze">Analyze something</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FeedbackRow({ analysisId }: { analysisId: Id<"analyses"> }) {
  const [submitted, setSubmitted] = useState(false);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const submit = useMutation(api.analyses.submitFeedback);

  if (submitted) {
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-risk-low" /> Thanks — feedback is stored for model
        evaluation only and never auto-retrains anything.
      </p>
    );
  }

  return (
    <div className="mt-8 border-t border-border/70 pt-6">
      <p className="text-sm font-medium">Was this assessment helpful and correct?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await submit({ analysisId, verdict: "correct" });
              setSubmitted(true);
            } catch (e) {
              toast.error(friendlyErrorMessage(e, "Could not save feedback."));
            }
          }}
        >
          Correct
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowComment(true)}
        >
          Incorrect
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await submit({ analysisId, verdict: "not_sure" });
              setSubmitted(true);
            } catch (e) {
              toast.error(friendlyErrorMessage(e, "Could not save feedback."));
            }
          }}
        >
          Not sure
        </Button>
      </div>
      {showComment && (
        <div className="mt-4 space-y-2">
          <Textarea
            value={comment}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
            placeholder="What did we get wrong?"
            className="min-h-20 text-sm"
          />
          <Button
            size="sm"
            onClick={async () => {
              try {
                await submit({ analysisId, verdict: "incorrect", comment: comment || undefined });
                setSubmitted(true);
              } catch (e) {
                toast.error(friendlyErrorMessage(e, "Could not save feedback."));
              }
            }}
          >
            Submit
          </Button>
        </div>
      )}
    </div>
  );
}
