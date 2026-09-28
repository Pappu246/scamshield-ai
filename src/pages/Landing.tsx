import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { ArrowRight, Link2, ScanSearch, ShieldQuestion, FileWarning } from "lucide-react";

const SAMPLES = [
  {
    icon: ScanSearch,
    label: "Messages",
    desc: "Job offers, OTP requests, prize claims, KYC warnings — paste any suspicious text. English, Hindi, Hinglish.",
    tab: "text",
  },
  {
    icon: Link2,
    label: "Links",
    desc: "Structural inspection of URLs — protocol, domain tricks, impersonation patterns. Nothing is clicked, ever.",
    tab: "url",
  },
  {
    icon: FileWarning,
    label: "Evidence-first results",
    desc: "Every point of the score is traceable: which rule fired, which words pushed the model, which link features looked wrong.",
    tab: null,
  },
  {
    icon: ShieldQuestion,
    label: "Honest uncertainty",
    desc: "When evidence is thin it says insufficient evidence instead of guessing. A low score is never called a guarantee.",
    tab: null,
  },
];

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/70">
          <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="max-w-2xl"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                ScamShield AI
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
                Check before you trust.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Analyze suspicious messages, screenshots and links with AI-powered risk analysis.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 px-6 text-sm">
                  <Link to="/analyze">
                    {isLoading ? "Analyze" : isAuthenticated ? "Analyze message" : "Analyze message"}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-6 text-sm">
                  <Link to="/analyze">Analyze URL</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-6 text-sm">
                  <Link to="/about">How it works</Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Message and link analysis are live. Screenshot analysis arrives in Version&nbsp;2.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Value cards */}
        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2">
            {SAMPLES.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="border-t border-border/70 pt-6"
              >
                <s.icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
                <h3 className="mt-3 text-base font-medium">{s.label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Example verdict strip */}
        <section className="border-y border-border/70 bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
            <div className="grid items-center gap-10 sm:grid-cols-2">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Not just a score — the reasoning behind it.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  ScamShield separates detected facts, rule hits, model predictions and link
                  findings, then shows recommended action. You stay the decision maker.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  {[
                    "Rule engine — audited, deterministic scam patterns",
                    "Naive Bayes classifier with abstention on low margins",
                    "URL structural analysis with no site visits",
                    "Transparent score contributions and uncertainty notes",
                  ].map((li) => (
                    <li key={li} className="flex items-start gap-2.5">
                      <span className="mt-2 h-1 w-4 shrink-0 rounded-full bg-foreground/70" />
                      {li}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Example report (abbreviated)
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Risk score</span>
                    <span className="tnum">72 / 100</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[72%] rounded-full bg-risk-high" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Risk level</span>
                    <span className="text-risk-high">HIGH RISK</span>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <p className="font-medium">What we found</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Upfront payment request</li>
                      <li>Urgency language</li>
                      <li>Link with suspicious structure</li>
                    </ul>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <p className="font-medium">Recommended action</p>
                    <p className="mt-1 text-muted-foreground">
                      Do not send money or share OTPs until the sender is verified through an
                      official channel.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            One quick check before you pay.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            If a message asks for money, codes or documents — run it through ScamShield first.
          </p>
          <Button asChild size="lg" className="mt-8 h-11 px-6">
            <Link to="/analyze">
              Start analyzing <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
