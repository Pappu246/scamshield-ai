import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { RiskBadge } from "@/components/scamshield/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { Link2, ScanSearch, ShieldCheck } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const stats = useQuery(api.analyses.stats);
  const recent = useQuery(api.analyses.listMine, { limit: 5 });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Overview
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Welcome{user?.name ? `, ${user.name}` : ""}
        </h1>

        {/* Stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60 shadow-none">
            <CardContent className="pt-6">
              <p className="tnum text-3xl font-semibold tracking-tight">
                {stats?.total ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Analyses performed</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-none">
            <CardContent className="pt-6">
              <p className="tnum text-3xl font-semibold tracking-tight">
                {stats?.highRisk ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">High / critical detections</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-none">
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold tracking-tight">
                <ShieldCheck className="size-7 text-risk-low" strokeWidth={1.75} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Assessments are private to your account
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            to="/analyze"
            className="rounded-lg border border-border/60 p-6 transition-colors hover:bg-muted/40"
          >
            <ScanSearch className="size-5 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="mt-3 text-base font-medium">Analyze a message</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste suspicious text — job offers, OTP requests, prize messages. English, Hindi or
              Hinglish.
            </p>
          </Link>
          <Link
            to="/analyze"
            className="rounded-lg border border-border/60 p-6 transition-colors hover:bg-muted/40"
          >
            <Link2 className="size-5 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="mt-3 text-base font-medium">Analyze a link</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Structural URL inspection — no site visits, safe and instant.
            </p>
          </Link>
        </div>

        {/* Recent activity */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Recent activity</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">View all</Link>
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {recent !== undefined && recent.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing yet — run your first analysis to see it here.
              </p>
            )}
            {recent?.map((item) => (
              <Link
                key={item._id}
                to={`/result/${item._id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-4 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 truncate text-sm">
                  {item.inputPreview.slice(0, 70)}
                  {item.inputPreview.length > 70 ? "…" : ""}
                </span>
                <RiskBadge level={item.riskLevel} />
              </Link>
            ))}
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
