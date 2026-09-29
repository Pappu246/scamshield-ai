import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelMetrics } from "@/lib/analyzer/metrics";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function About() {
  const m = getModelMetrics();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">About ScamShield AI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          ScamShield AI analyzes suspicious messages and links and explains{" "}
          <span className="text-foreground">why</span> something appears risky. It never claims
          certainty it doesn&apos;t have: when evidence is thin it says{" "}
          <span className="text-foreground">insufficient evidence</span>, and every score is
          broken down into traceable components.
        </p>

        <div className="mt-10 space-y-6">
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">How analysis works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">1. Normalize.</span> Unicode-safe
                cleaning; Hindi (Devanagari) is transliterated and mapped to Hinglish vocabulary so
                the same rules apply across scripts.
              </p>
              <p>
                <span className="font-medium text-foreground">2. Rule engine.</span>{" "}
                Deterministic, hand-audited patterns (payment requests, OTP harvesting, urgency,
                job/scholarship/investment scams, impersonation, embedded prompt-injection) each
                with an id, severity, explanation and weight. One weak signal never condemns a
                message.
              </p>
              <p>
                <span className="font-medium text-foreground">3. ML classifier.</span> A Naive
                Bayes text model trained on a labeled seed dataset, with abstention: when its
                decision margin is small its contribution is reduced rather than trusted.
              </p>
              <p>
                <span className="font-medium text-foreground">4. URL analysis.</span> Structural
                inspection only (HTTPS, IP hosts, subdomain depth, high-abuse TLDs, brand
                impersonation, shorteners, encoding tricks). The site is never visited.
              </p>
              <p>
                <span className="font-medium text-foreground">5. Scoring.</span> Weighted
                components are capped, summed, and shown to you. Strong legitimacy signals pull the
                score down. Thresholds: 30/55/75 for medium/high/critical.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Measured model metrics</CardTitle>
              <p className="text-xs text-muted-foreground">
                Stratified 5-fold cross-validation on the seed dataset, computed at load time. No
                invented numbers; these are the actual measured values.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Accuracy", m.accuracy],
                  ["Precision", m.precision],
                  ["Recall", m.recall],
                  ["F1", m.f1],
                ].map(([label, v]) => (
                  <div key={label as string}>
                    <p className="tnum text-2xl font-semibold tracking-tight">
                      {((v as number) * 100).toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Confusion matrix: TP {m.confusion.tp} · FP {m.confusion.fp} · FN {m.confusion.fn} ·
                TN {m.confusion.tn}. False-positive rate {(m.falsePositiveRate * 100).toFixed(1)}% on
                this small seed dataset. This highlights the current dataset limitation and is not
                representative of real-world performance.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Limitations</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              <ul className="list-disc space-y-1.5 pl-4">
                <li>Links are analyzed structurally only — ownership and live content are not verified.</li>
                <li>The classifier is trained on a small hand-written seed dataset, not real-world corpora.</li>
                <li>Hindi support relies on transliteration and a vocabulary map; coverage is partial.</li>
                <li>Sophisticated or novel scam scripts may evade both rules and the model.</li>
                <li>A low score is not a safety certificate. ScamShield is one input into your judgment, never the final word.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Analyses are stored privately per account. Full raw input is never kept: only a
              truncated preview (2,000 characters for messages, 500 for links) plus the quoted
              evidence fragments needed for transparency. The analysis engine does not make
              third-party reputation or website-content fetching calls during analysis. No
              third-party tracking. Feedback is used for future evaluation only and never
              auto-retrains the model.
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 flex gap-3">
          <Button asChild>
            <Link to="/analyze">Analyze something</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
