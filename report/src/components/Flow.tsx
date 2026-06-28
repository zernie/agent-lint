import { Eye, FilePlus2, Sparkles, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * "How to act on this report" — the four-move flow vigiles puts a markdown plugin
 * through. Orientation for a reader who lands on the report and wonders what the
 * buttons below actually do. Presentational; the per-surface buttons live in
 * <Adopt/>. Detects serve mode (a live token) to say whether buttons run or copy.
 */
function isLive(): boolean {
  return (
    typeof (window as unknown as { __VIGILES_SERVE__?: { token?: string } })
      .__VIGILES_SERVE__?.token === "string"
  );
}

const STEPS = [
  {
    icon: Eye,
    verb: "audit",
    tag: "see",
    line: "This report — what you ship, what's broken, what isn't spec-managed.",
  },
  {
    icon: FilePlus2,
    verb: "init",
    tag: "adopt",
    line: "Turn your markdown into typed specs (faithful, reversible — eject undoes it).",
  },
  {
    icon: Sparkles,
    verb: "strengthen",
    tag: "deepen",
    line: "Optional: upgrade prose guidance into enforced linter rules.",
  },
  {
    icon: ShieldCheck,
    verb: "lint",
    tag: "gate",
    line: "In CI: every path, script, rule & tool contract must resolve.",
  },
];

export function Flow() {
  const live = isLive();
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        How to act on this
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.verb} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon size={15} className="text-muted-foreground" />
                <code className="font-mono">{s.verb}</code>
                <span className="text-xs font-normal text-muted-foreground">
                  — {s.tag}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{s.line}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {live
          ? "This report is live — the buttons below create specs for you (the CLI writes them)."
          : "The buttons below copy the exact command — run it in your terminal and the CLI writes the spec (a static report can’t write files). Run audit --serve for one-click."}
      </p>
    </Card>
  );
}
