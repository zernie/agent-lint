import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The full measurement lives on the author's blog — link out, don't restate.
const ARTICLE = "https://zernie.com/blog/token-savings-wrong-number/";

export function Debunk() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
      <Card className="reveal overflow-hidden">
        <div className="grid grid-cols-1 items-center gap-8 p-8 sm:p-12 lg:grid-cols-2">
          {/* The stat */}
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background/50 p-8 text-center">
            <div className="flex items-baseline gap-3 font-mono">
              <span className="text-3xl font-bold text-muted-foreground line-through decoration-signal/60 sm:text-4xl">
                −75%
              </span>
              <ArrowRight
                className="h-5 w-5 text-muted-foreground"
                aria-hidden
              />
              <span className="text-4xl font-extrabold text-good sm:text-5xl">
                −6%
              </span>
            </div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              claimed savings → measured savings
            </p>
          </div>

          {/* The pitch */}
          <div>
            <Badge className="mb-4">Measured, not claimed</Badge>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              A skill promised to cut your tokens by three quarters.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              On multi-turn coding, your model&apos;s output is{" "}
              <span className="font-semibold text-foreground">
                less than 1% of the tokens you pay for
              </span>
              . Compressing it barely moves the bill. vigiles runs the eval that
              tells claim from reality. promptfoo and DeepEval bill{" "}
              <span className="text-foreground">per token, every run</span>;
              vigiles runs on your own Claude subscription — so you measure on
              every change, not once.
            </p>
            <a
              href={ARTICLE}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-base font-semibold text-accent no-underline transition-colors hover:text-accent/80"
            >
              Read the measurement
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </Card>
    </section>
  );
}
