import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AuditWidget } from "@/components/AuditWidget";
import { HeroReport } from "@/components/HeroReport";

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
          Your skills, hooks, and subagents are full of references nothing
          verifies. One command grades what&apos;s silently broken.
        </p>

        <AuditWidget className="mt-8" />
      </div>

      {/* Product shot on the fold — a native slice of the real report (crisp at
          any width, driven by data, so one component serves desktop + mobile). */}
      <div className="mx-auto w-full max-w-3xl px-6 pb-20 sm:pb-28">
        <HeroReport className="reveal shadow-2xl" />
      </div>
    </header>
  );
}
