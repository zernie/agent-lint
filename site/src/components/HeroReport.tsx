import { Copy, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A native, responsive slice of the real audit report — the hero product shot,
 * rendered from data instead of a screenshot. Shows only the top of a report
 * (verdict + category strip + the top fix); the full report lives in the
 * separate `report/` app (and, later, the in-browser demo renders it from JSON).
 * Crisp at any width, so one component serves desktop and mobile.
 */

type Band = "good" | "warn"; // sample never dips to "bad"
const TEXT: Record<Band, string> = { good: "text-good", warn: "text-warn" };
const BG: Record<Band, string> = { good: "bg-good", warn: "bg-warn" };

/** Illustrative sample — mirrors the report app's sample numbers. */
const CATEGORIES: { name: string; score: number; band: Band }[] = [
  { name: "Truthfulness", score: 100, band: "good" },
  { name: "Triggering", score: 92, band: "good" },
  { name: "Structure", score: 92, band: "good" },
  { name: "Safety", score: 80, band: "warn" },
  { name: "Tested", score: 88, band: "warn" },
];

export function HeroReport({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden p-5 sm:p-7", className)}>
      {/* Verdict */}
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-warn text-warn sm:h-20 sm:w-20">
          <span className="text-3xl font-extrabold leading-none sm:text-4xl">
            C
          </span>
          <span className="mt-0.5 text-[10px] font-medium sm:text-xs">
            77/100
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug sm:text-xl">
            Two one-line fixes away from a B.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground sm:text-sm">
            my-plugin · claude-code
          </p>
        </div>
      </div>

      {/* Category strip */}
      <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-5 sm:gap-y-0">
        {CATEGORIES.map((c) => (
          <div key={c.name}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {c.name}
              </span>
              <span className={cn("font-mono text-sm font-bold", TEXT[c.band])}>
                {c.score}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
              <div
                className={cn("h-full rounded-full", BG[c.band])}
                style={{ width: `${c.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Top fix */}
      <div className="mt-6 rounded-xl border border-l-4 border-border border-l-warn bg-background p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Wrench className="h-4 w-4 text-warn" aria-hidden />
          <span className="font-semibold">reviewer</span>
          <span className="font-mono text-xs font-semibold text-warn">
            +4 pts
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <Copy className="h-3 w-3" aria-hidden />
            copy fix
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Unknown tool <span className="font-mono text-foreground">Reed</span> —
          silently dropped, the agent can&apos;t use it.{" "}
          <span className="text-foreground">
            → change the tool to <span className="font-mono">Read</span>.
          </span>
        </p>
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        deterministic · no model · nothing leaves your machine
      </p>
    </Card>
  );
}
