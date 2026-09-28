import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";

const NAV = [
  { to: "/analyze", label: "Analyze" },
  { to: "/history", label: "History" },
  { to: "/about", label: "About" },
];

export function AppHeader({ authenticated }: { authenticated?: boolean }) {
  const { isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const signedIn = authenticated ?? (!isLoading && isAuthenticated);

  return (
    <header className="border-b border-border/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <ShieldCheck className="size-5" strokeWidth={1.75} />
          <span className="text-sm font-semibold tracking-tight">
            ScamShield&nbsp;AI
          </span>
        </Link>

        {signedIn ? (
          <div className="flex items-center gap-1 sm:gap-2">
            <nav className="flex items-center">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                      isActive && "text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/about">About</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth?returnTo=%2Fanalyze">Sign in</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>ScamShield AI — risk assessment, not a guarantee.</p>
        <p>Verify independently. When in doubt, don&apos;t pay.</p>
      </div>
    </footer>
  );
}
