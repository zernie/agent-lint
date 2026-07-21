import { useMemo, useState } from "react";
import {
  ArrowRight,
  Github,
  Loader2,
  Lock,
  Search,
  Star,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CommandBlock } from "@/components/CommandBlock";
import { deeplink, normalizeSlug, openDeeplink } from "@/lib/deeplink";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** A single public repo as returned by the GitHub REST API (fields we use). */
type Repo = {
  name: string;
  full_name: string;
  stargazers_count: number;
  updated_at: string;
  fork: boolean;
};

/** Discriminated fetch state — no impossible (loading + error) combos. */
type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; repos: Repo[] }
  | { kind: "error"; message: string };

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function RepoPicker() {
  const [username, setUsername] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  async function loadRepos() {
    const user = username.trim();
    if (!user) return;
    setState({ kind: "loading" });
    setSelected(null);
    setFilter("");
    try {
      const res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(
          user,
        )}/repos?per_page=100&sort=updated&type=owner`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (res.status === 404) {
        setState({
          kind: "error",
          message: `No public user “${user}” found. Check the spelling, or enter your repo manually below.`,
        });
        return;
      }
      if (res.status === 403 || res.status === 429) {
        setState({
          kind: "error",
          message:
            "GitHub’s rate limit was hit — type your repo manually below.",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: `GitHub returned an error (${res.status}). Enter your repo manually below.`,
        });
        return;
      }
      const data: unknown = await res.json();
      const repos = (Array.isArray(data) ? (data as Repo[]) : []).sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      setState({ kind: "loaded", repos });
    } catch {
      setState({
        kind: "error",
        message:
          "Couldn’t reach GitHub — check your connection, or enter your repo manually below.",
      });
    }
  }

  const repos = state.kind === "loaded" ? state.repos : [];
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [repos, filter]);

  const manualSlug = normalizeSlug(manual);
  // The active handoff target: an explicit manual entry wins over a list pick.
  const targetSlug = manualSlug ?? selected;

  function handoff(e: React.MouseEvent) {
    e.preventDefault();
    if (targetSlug === null) return;
    openDeeplink(targetSlug, () => {
      toast(
        "Claude Code runs on your computer, not the browser. Run npx vigiles audit in a terminal — the command’s just below.",
      );
    });
  }

  return (
    <section id="try" className="scroll-mt-8 border-t border-border bg-card/30">
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Grade a specific repo.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            One click with Claude Code on your desktop — one command anywhere
            else.
          </p>

          {/* Mobile: the repo picker + deeplink are a DESKTOP flow, so phones get
              the universal command instead of a near-empty card. */}
          <div className="mt-8 flex flex-col items-center gap-2 sm:hidden">
            <CommandBlock command="npx vigiles audit" />
            <p className="text-xs text-muted-foreground">
              Run it inside any repo on your computer.
            </p>
          </div>
        </div>

        {/* Desktop only — the username search, repo list, and one-click deeplink. */}
        <Card className="reveal mt-12 hidden p-6 sm:block sm:p-8">
          {/* Step 1 — username */}
          <label
            htmlFor="gh-username"
            className="block text-sm font-semibold tracking-tight"
          >
            Your GitHub username
          </label>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Github
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="gh-username"
                type="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="octocat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadRepos();
                  }
                }}
                className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadRepos()}
              disabled={!username.trim() || state.kind === "loading"}
              className="inline-flex h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50"
            >
              {state.kind === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading
                </>
              ) : (
                <>
                  Find repos
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          </div>

          {/* Public-only messaging + repo list */}
          {state.kind !== "idle" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold tracking-tight">
                  Your public repos
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden />
                  Public repos only. For a private repo, type owner/name below.
                </span>
              </div>

              <div className="mt-3">
                {state.kind === "loading" && (
                  <ul className="space-y-2" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <li
                        key={i}
                        className="h-11 animate-pulse rounded-lg border border-border bg-muted/30"
                      />
                    ))}
                  </ul>
                )}

                {state.kind === "error" && (
                  <p className="rounded-lg border border-signal/30 bg-signal/[0.06] px-4 py-3 text-sm text-signal">
                    {state.message}
                  </p>
                )}

                {state.kind === "loaded" && repos.length === 0 && (
                  <p className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    No public repos on this account. Enter one manually below.
                  </p>
                )}

                {state.kind === "loaded" && repos.length > 0 && (
                  <>
                    {repos.length > 7 && (
                      <div className="relative mb-2.5">
                        <Search
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <input
                          type="text"
                          aria-label="Filter repositories"
                          placeholder={`Filter ${repos.length} repos…`}
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </div>
                    )}
                    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {shown.map((r) => {
                        const active = selected === r.full_name && !manualSlug;
                        return (
                          <li key={r.full_name}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(r.full_name);
                                setManual("");
                              }}
                              aria-pressed={active}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                                active
                                  ? "border-accent/60 bg-accent/10"
                                  : "border-border bg-background hover:border-accent/40 hover:bg-muted/40",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                                {r.name}
                                {r.fork && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    fork
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                                {r.stargazers_count > 0 && (
                                  <span className="inline-flex items-center gap-1">
                                    <Star className="h-3 w-3" aria-hidden />
                                    {r.stargazers_count}
                                  </span>
                                )}
                                <span>{timeAgo(r.updated_at)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {shown.length === 0 && (
                        <li className="px-3.5 py-2.5 text-sm text-muted-foreground">
                          No repos match &ldquo;{filter}&rdquo;.
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
          {/* Manual repo field (the private / any-repo path) */}
          <div className="mt-6">
            <label
              htmlFor="manual-repo"
              className="block text-sm font-semibold tracking-tight"
            >
              &hellip;or enter any repo{" "}
              <span className="font-normal text-muted-foreground">
                (private too)
              </span>
            </label>
            <input
              id="manual-repo"
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="owner/name"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                if (e.target.value.trim()) setSelected(null);
              }}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {manual.trim() && !manualSlug && (
              <p className="mt-1.5 text-xs text-signal">
                Enter a repo as <span className="font-mono">owner/name</span> or
                a GitHub URL.
              </p>
            )}
          </div>

          {/* Handoff */}
          <div className="mt-7 border-t border-border pt-6">
            {targetSlug ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Ready:{" "}
                  <span className="font-mono text-foreground">
                    {targetSlug}
                  </span>
                </p>

                {/* Desktop: one click opens the user's local Claude Code. */}
                <div className="hidden sm:block">
                  <Button
                    href={deeplink(targetSlug)}
                    onClick={handoff}
                    variant="primary"
                    size="lg"
                    className="mt-3 w-full"
                  >
                    <Terminal className="h-4 w-4" aria-hidden />
                    Audit this repo in Claude Code
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                  <p className="mt-2.5 text-center text-xs text-muted-foreground">
                    Opens your local Claude Code (the repo must be cloned
                    locally) and runs the audit on your subscription.
                  </p>
                </div>

                {/* Mobile: the deeplink can't reach Claude Code — use the command. */}
                <p className="mt-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground sm:hidden">
                  Claude Code runs on a computer, not a phone. On your machine,{" "}
                  <span className="whitespace-nowrap font-mono text-foreground">
                    cd {targetSlug.split("/")[1] ?? targetSlug}
                  </span>{" "}
                  and run the command below.
                </p>
                <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-6">
                  <CommandBlock command="npx vigiles audit" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter a repo above to get your command — plus a one-click Claude
                Code handoff on desktop.
              </p>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
