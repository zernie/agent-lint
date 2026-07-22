import { Star } from "lucide-react";
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
        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Lighthouse for your
          <br className="hidden sm:block" /> agent harness.
        </h1>

        <p className="mt-5 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Your skills, hooks, and subagents are full of references nothing
          verifies. One command grades what&apos;s silently broken — try any
          public repo right here.
        </p>
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
