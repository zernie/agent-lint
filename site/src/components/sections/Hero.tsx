import { Star } from "lucide-react";
import { BUILTIN_LINTERS } from "@engine/spec";
import { DemoAudit } from "@/components/sections/DemoAudit";

const REPO = "https://github.com/zernie/vigiles";

export function Hero() {
  return (
    <header className="hero-glow relative overflow-hidden">
      {/* Top nav — logo + a single quiet star pill (the only GitHub CTA up top). */}
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-2.5 no-underline">
          <img
            src="./logo.png"
            alt=""
            className="h-8 w-8 rounded-md"
            width={32}
            height={32}
          />
          <span className="text-lg font-semibold tracking-tight">vigiles</span>
        </a>
        <div className="flex items-center gap-5">
          <a
            href="#try"
            className="hidden text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground sm:inline"
          >
            Grade a repo
          </a>
          {/* The docs are a directory away and used to be unreachable from the
              top of the page — a visitor who wanted detail had to guess. */}
          <a
            href="#docs"
            className="hidden text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground sm:inline"
          >
            Docs
          </a>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Star className="h-3.5 w-3.5" aria-hidden />
            Star on GitHub
          </a>
        </div>
      </nav>

      {/* Hero content — headline + ONE primary action, then the real product shot. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-10 pt-14 text-center sm:pt-20">
        {/* The headline names the FELT problem, not the tool's verbs. It used
            to read "Audit, test and measure your agent harness" — accurate, and
            a stranger could not tell from it whether this was about their
            CLAUDE.md or about model evals. The pain sentence that used to open
            the paragraph is the headline now; the verbs live one screen down in
            the verb map, where a reader who has decided to care will read them. */}
        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          {/* Two block spans, not a <br>: the setup and the punchline break at
              EVERY width. A responsive <br> collapsed them onto one line on a
              phone, where "…every PR. Nobody reviews…" reads as one run-on. */}
          <span className="block text-muted-foreground">
            You review every PR.
          </span>
          <span className="block">Nobody reviews your CLAUDE.md.</span>
        </h1>

        {/* Three facts, one sentence each: what it checks, what it proved, and
            how little work adopting it is. Every number here is measured — the
            2-of-7 / 7-of-7 contrast is the disaster battery below. */}
        <p className="mt-5 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Nothing checks that the tools, events, files and rules your skills and
          hooks name actually exist. One command grades what&apos;s broken — and
          proves your guard: a widely-copied safety hook blocks 2 of 7
          disasters, the compiled rewrite blocks 7. Then say &ldquo;test my
          skills&rdquo; and the agent writes the test.
        </p>

        {/* The "is this for me?" strip. It answers the three questions a
            stranger asks in the first ten seconds — which harness, which
            language, what licence — and used to be the last sentence of the
            SECOND section, where nobody deciding whether to keep reading ever
            got to it. */}
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          {[
            "Claude Code · Codex",
            // Derived, never typed: the count is whatever the engine ships, so
            // adding a linter can't leave a stale number on the first screen.
            `Any language · ${String(BUILTIN_LINTERS.length)} linter catalogs`,
            "MIT",
          ].map((fact) => (
            <li
              key={fact}
              className="rounded-full border border-border px-3 py-1"
            >
              {fact}
            </li>
          ))}
        </ul>
      </div>

      {/* Product shot on the fold — the LIVE demo (combobox + real grading), not a
          static sample. Its default view is an instant baked featured grade, so the
          first paint has no spinner; type a repo to grade your own. */}
      <div className="mx-auto w-full max-w-3xl pb-20 sm:pb-28">
        <DemoAudit variant="hero" />
      </div>
    </header>
  );
}
