import { useState } from "react";
import { ArrowRight, ShieldCheck, Terminal } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";
import { deeplink, normalizeSlug } from "@/lib/deeplink";
import { cn } from "@/lib/utils";

/**
 * The merged audit CTA: one widget, two entry points to the SAME audit.
 * - Primary: type `owner/repo` → a Claude Code deeplink that runs vigiles on
 *   the user's own machine + subscription (the "grade my repo" wow).
 * - Fallback: `npx vigiles audit`, always visible, for anyone without Claude
 *   Code (or on the web, where the deeplink can't fire).
 * The richer "browse my public repos by username" flow lives in the RepoPicker
 * section (#try) — this links down to it rather than duplicating it.
 */
export function AuditWidget({ className }: { className?: string }) {
  const [repo, setRepo] = useState("");
  const slug = normalizeSlug(repo);
  const ready = slug !== null;

  return (
    <div className={cn("w-full max-w-xl", className)}>
      {/* Primary — repo → Claude Code deeplink */}
      <form
        className="flex flex-col gap-2.5 sm:flex-row"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Your GitHub repo (owner/name)"
          placeholder="owner/repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-card px-4 py-3.5 text-center font-mono text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-left"
        />
        {ready ? (
          <a
            href={deeplink(slug)}
            className="inline-flex h-[50px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground no-underline transition-colors hover:bg-accent/90"
          >
            <Terminal className="h-4 w-4" aria-hidden />
            Grade it
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-[50px] cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground opacity-50"
          >
            <Terminal className="h-4 w-4" aria-hidden />
            Grade it
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </form>

      {/* Security reassurance — the deeplink runs in the user's OWN Claude Code. */}
      <p className="mt-3 flex items-start justify-center gap-2 text-left text-sm text-muted-foreground">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-good"
          aria-hidden
        />
        <span>
          Runs in <span className="font-medium text-foreground">your own</span>{" "}
          Claude Code — your machine, your subscription.{" "}
          <span className="text-foreground/70">
            Nothing is uploaded; no server ever sees your code.
          </span>
        </span>
      </p>

      {/* Fallback — the universal copy-command, always visible */}
      <div className="mt-5 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden h-px w-8 bg-border sm:block" aria-hidden />
          <span>or run it in any terminal</span>
          <span className="hidden h-px w-8 bg-border sm:block" aria-hidden />
        </div>
        <CommandBlock command="npx vigiles audit" />
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <span className="font-mono text-foreground/80">audit</span> runs
        anywhere and auto-detects Claude Code or Codex.{" "}
        <a
          href="#try"
          className="whitespace-nowrap font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
        >
          browse my repos →
        </a>
      </p>
    </div>
  );
}
