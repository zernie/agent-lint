import { ArrowRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CommandBlock } from "@/components/CommandBlock";
import auditReport from "@/assets/vigiles-audit.png";

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
        <a
          href={REPO}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Star className="h-3.5 w-3.5" aria-hidden />
          Star on GitHub
        </a>
      </nav>

      {/* Hero content — headline + ONE primary action, then the real product shot. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-10 pt-10 text-center sm:pt-14">
        <Badge variant="accent" className="mb-6">
          <Star className="h-3 w-3" aria-hidden />
          Free &amp; open source
        </Badge>

        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Lighthouse for your
          <br className="hidden sm:block" /> agent harness.
        </h1>

        <p className="mt-5 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Your skills, hooks, and subagents are code now. vigiles grades them —
          and tells you what&apos;s actually broken.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <CommandBlock command="npx vigiles audit" />
          <p className="text-sm text-muted-foreground">
            No install. No config. No account. Runs on your own Claude
            subscription.
          </p>
          <a
            href="#wedge"
            className="group mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
          >
            See what it catches
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>
        </div>
      </div>

      {/* Product shot on the fold — the real audit report (README-parity). */}
      <div className="mx-auto w-full max-w-5xl px-6 pb-20 sm:pb-28">
        <div className="reveal overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <img
            src={auditReport}
            alt="A vigiles audit report for 'my-plugin': a verdict header, a C (77/100) grade, a five-category strip (Truthfulness, Triggering, Structure, Safety, Tested), ranked fix cards with '+N pts' impact badges, and broken-reference findings."
            className="block w-full"
          />
        </div>
        <p className="reveal mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          One command → a verdict, five weighted categories, and every finding
          paired with its one-line fix — a shareable HTML report (plus{" "}
          <span className="font-mono text-foreground">--json</span> for CI).
        </p>
      </div>
    </header>
  );
}
