import { useState } from "react";
import { Report, type AuditReport } from "@vigiles/report-view";
import { CommandBlock } from "@/components/CommandBlock";
import { cn } from "@/lib/utils";

// Real audit reports, computed by the actual `vigiles audit` on real published
// plugins and baked at build time. They render through the SAME @vigiles/report-view
// component the CLI uses — so this IS the real artifact, not a screenshot or mock.
// (PR 3 wires live in-browser compute for any repo you type; today these are the
// featured set.)
import ohMy from "@/demo/reports/oh-my-claudecode.json";
import superpowers from "@/demo/reports/superpowers.json";
import wshobson from "@/demo/reports/wshobson-accessibility.json";
import madappgang from "@/demo/reports/madappgang-frontend.json";

type Featured = {
  slug: string;
  label: string;
  report: AuditReport;
};

// madappgang first — it's the one with a real finding + fix (a B "one fix from an
// A"), the sharpest demonstration. The rest are clean A's (real plugins usually are).
const FEATURED: Featured[] = [
  {
    slug: "madappgang/frontend",
    label: "madappgang/frontend",
    report: madappgang as unknown as AuditReport,
  },
  {
    slug: "oh-my-claudecode",
    label: "oh-my-claudecode",
    report: ohMy as unknown as AuditReport,
  },
  {
    slug: "obra/superpowers",
    label: "obra/superpowers",
    report: superpowers as unknown as AuditReport,
  },
  {
    slug: "wshobson/agents",
    label: "wshobson/agents",
    report: wshobson as unknown as AuditReport,
  },
];

export function DemoAudit() {
  const [active, setActive] = useState(0);
  const current = FEATURED[active];

  return (
    <section
      id="try"
      className="scroll-mt-20 border-t border-border bg-card/30"
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A real grade, for a real repo.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            The same report{" "}
            <span className="font-mono text-foreground">vigiles audit</span>{" "}
            prints — deterministic, model-free. Pick a published plugin:
          </p>
        </div>

        {/* Repo chips — switch the rendered report. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {FEATURED.map((f, i) => (
            <button
              key={f.slug}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors",
                i === active
                  ? "border-accent/60 bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* The real report, rendered through @vigiles/report-view. */}
        <div className="reveal mt-8 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border bg-card/40 px-5 py-2.5 font-mono text-xs text-muted-foreground">
            $ vigiles audit {current.slug}
          </div>
          <div className="max-h-[36rem] overflow-y-auto p-5 sm:p-7">
            <Report data={current.report} />
          </div>
        </div>

        {/* The command — run it on your own repo. */}
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-base text-muted-foreground">
            Now grade yours — one command, nothing uploaded:
          </p>
          <CommandBlock command="npx vigiles audit" />
        </div>
      </div>
    </section>
  );
}
