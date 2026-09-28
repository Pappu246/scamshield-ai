import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { RiskBadge } from "@/components/scamshield/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { ScanSearch } from "lucide-react";

export default function History() {
  const history = useQuery(api.analyses.listMine, { limit: 100 });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your past analyses, newest first. Only you can see these.
        </p>

        <div className="mt-8 space-y-3">
          {history === undefined &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}

          {history !== undefined && history.length === 0 && (
            <Card className="border-border/60 shadow-none">
              <CardContent className="py-12 text-center">
                <ScanSearch className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-medium">No analyses yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Analyze a message or link and it will show up here.
                </p>
                <Button asChild className="mt-6">
                  <Link to="/analyze">Run your first analysis</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {history?.map((item) => (
            <Link
              key={item._id}
              to={`/result/${item._id}`}
              className="block rounded-lg border border-border/60 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.inputPreview.slice(0, 90)}
                    {item.inputPreview.length > 90 ? "…" : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()} · {item.kind === "url" ? "Link" : "Message"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-sm text-muted-foreground">{item.riskScore}/100</span>
                  <RiskBadge level={item.riskLevel} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
