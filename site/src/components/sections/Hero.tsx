import { ArrowRight, Github, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandBlock } from "@/components/CommandBlock";

const REPO = "https://github.com/zernie/vigiles";

export function Hero() {
  return (
    <header className="hero-glow relative overflow-hidden">
      {/* Top nav */}
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
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <Github className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </nav>

      {/* Hero content */}
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pb-24 pt-14 text-center sm:pt-20">
        <Badge variant="accent" className="mb-6">
          <Star className="h-3 w-3" aria-hidden />
          Free &amp; open source
        </Badge>

        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Lighthouse for your
          <br className="hidden sm:block" /> agent harness.
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Your skills, hooks, and subagents are code now. vigiles grades them —
          and tells you what&apos;s actually broken.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4">
          <CommandBlock command="npx vigiles audit" />
          <p className="text-sm text-muted-foreground">
            No install. No config. No account. Runs on your own Claude
            subscription.
          </p>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href={REPO} size="lg" variant="primary">
            <Github className="h-4 w-4" aria-hidden />
            Star on GitHub
          </Button>
          <Button href="#wedge" size="lg" variant="outline">
            See what it catches
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
