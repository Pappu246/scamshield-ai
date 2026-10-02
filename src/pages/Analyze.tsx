import { AppFooter, AppHeader } from "@/components/scamshield/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { MAX_TEXT_LENGTH, MAX_URLS_PER_ANALYSIS } from "@/lib/analyzer/validation";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { Loader2, ScanSearch, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Analyze() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Analyze</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a suspicious message or enter a link. Analyses are saved privately to your account.
        </p>

        <Tabs defaultValue="text" className="mt-8">
          <TabsList className="h-auto bg-transparent p-0">
            <TabsTrigger
              value="text"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <ScanSearch className="size-4" /> Message
            </TabsTrigger>
            <TabsTrigger
              value="url"
              className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <Link2 className="size-4" /> Link
            </TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-6">
            <TextForm />
          </TabsContent>
          <TabsContent value="url" className="mt-6">
            <UrlForm />
          </TabsContent>
        </Tabs>
      </main>
      <AppFooter />
    </div>
  );
}

function TextForm() {
  const [text, setText] = useState("");
  const [urls, setUrls] = useState("");
  const analyze = useMutation(api.analyses.analyze);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const remaining = MAX_TEXT_LENGTH - text.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const urlList = urls
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter(Boolean)
        .slice(0, MAX_URLS_PER_ANALYSIS);
      const { analysisId } = await analyze({ text, urls: urlList.length ? urlList : undefined });
      navigate(`/result/${analysisId}`);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, "Analysis failed."));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="border-border/60 shadow-none">
        <CardContent className="space-y-4 pt-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the suspicious message here — job offer, OTP request, prize message, KYC warning, anything. English, Hindi or Hinglish all work."
            className="min-h-44 resize-y border-border/60 text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Links inside the message are analyzed automatically; optionally add more below.
            </span>
            <span className={remaining < 0 ? "text-destructive" : undefined}>
              {remaining.toLocaleString()} characters left
            </span>
          </div>
          <Input
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Extra URLs to check (optional, space or comma separated)"
            className="border-border/60 text-sm"
          />
        </CardContent>
      </Card>
      <Button type="submit" className="w-full sm:w-auto" disabled={loading || text.trim().length < 3}>
        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScanSearch className="mr-2 size-4" />}
        Analyze message
      </Button>
    </form>
  );
}

function UrlForm() {
  const [url, setUrl] = useState("");
  const analyzeUrl = useMutation(api.analyses.analyzeUrl);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { analysisId } = await analyzeUrl({ url });
      navigate(`/result/${analysisId}`);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, "Analysis failed."));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="border-border/60 shadow-none">
        <CardContent className="space-y-4 pt-6">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/verify-account"
            className="border-border/60 text-sm"
            inputMode="url"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Links are inspected structurally — protocol, domain structure, keywords, encoding — without
            visiting the site. Nothing is fetched, so analysis is safe and instant.
          </p>
        </CardContent>
      </Card>
      <Button type="submit" className="w-full sm:w-auto" disabled={loading || url.trim().length < 3}>
        {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}
        Analyze link
      </Button>
    </form>
  );
}
