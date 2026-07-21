import { useState } from "react";
import { ArrowRight, Github, ShieldCheck, Terminal } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";
import { deeplink, normalizeSlug, openDeeplink } from "@/lib/deeplink";
import { toast } from "@/lib/toast";
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
  const [fellBack, setFellBack] = useState(false);
  const slug = normalizeSlug(repo);
  const ready = slug !== null;

  function grade(e: React.MouseEvent) {
    e.preventDefault();
    if (slug === null) return;
    openDeeplink(slug, () => {
      // Claude Code never opened (mobile, or no CLI installed). Point the user
      // at the terminal command below — no auto-clipboard write (it triggers a
      // scary "wants to see your clipboard" permission prompt on mobile).
      setFellBack(true);
      toast(
        "Claude Code runs on your computer, not the browser. Run npx vigiles audit in a terminal — the command’s just below.",
      );
    });
  }

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
          onChange={(e) => {
            setRepo(e.target.value);
            setFellBack(false);
          }}
          className="flex-1 rounded-xl border border-border bg-card px-4 py-3.5 text-center font-mono text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-left"
        />
        {ready ? (
          <a
            href={deeplink(slug)}
            onClick={grade}
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

      {/* Fallback notice — shown when the deeplink couldn't open Claude Code. */}
      {fellBack && (
        <p className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-foreground">
          Claude Code isn’t available on this device — it runs on your computer,
          not the browser. Copy{" "}
          <span className="font-mono text-foreground">npx vigiles audit</span>{" "}
          below and run it in your terminal.
        </p>
      )}

      {/* Security reassurance — one line: the deeplink runs in the user's OWN CC. */}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-good" aria-hidden />
        <span>
          Runs in <span className="font-medium text-foreground">your own</span>{" "}
          Claude Code — nothing leaves your machine.
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

      {/* Secondary path — a light pill to the public-repo picker (the RepoPicker). */}
      <div className="mt-4 flex justify-center">
        <a
          href="#try"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Github className="h-4 w-4" aria-hidden />
          Browse my public repos
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
