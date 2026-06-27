import {
  AlertTriangle,
  CheckCircle2,
  Wrench,
  GitCompareArrows,
} from "lucide-react";
import type { AuditReport, CategoryScore, Recommendation } from "@/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ring } from "@/components/Ring";
import { Adoptability } from "@/components/Adoptability";
import { band, TEXT, BG, BORDER_L } from "@/lib/band";
import { cn } from "@/lib/utils";

function CategoryCard({ c }: { c: CategoryScore }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-5 text-center">
      <Ring score={c.score} />
      <div>
        <div className="text-sm font-semibold">{c.key}</div>
        <div className="mt-1 min-h-8 text-xs text-muted-foreground">
          {c.findings.length > 0 ? (
            c.findings.join("; ")
          ) : (
            <span className="inline-flex items-center gap-1 text-good">
              <CheckCircle2 size={12} /> clean
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function FixCard({ r }: { r: Recommendation }) {
  const Icon = r.action === "fix" ? Wrench : GitCompareArrows;
  const accent = r.confidence === "likely" ? "bad" : "warn";
  return (
    <Card className={cn("border-l-4 p-4", BORDER_L[accent])}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>
          <Icon size={12} className="mr-1" />
          {r.action}
        </Badge>
        <strong>{r.surface}</strong>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {r.detector}
        </span>
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{r.rationale}</div>
      <div className="mt-1 text-sm text-good">→ {r.fix}</div>
    </Card>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-2xl font-bold">{n}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </Card>
  );
}

export function Report({ data }: { data: AuditReport }) {
  const { score, recommendations, inventory, meta, adoptability } = data;
  const overall = score.empty ? null : score.overall;
  const b = band(overall);
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-10">
      <Card className="flex items-center gap-7 p-7">
        <Ring score={overall} size={128} stroke={11} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Harness audit</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {meta.dir} · {meta.harness}
          </div>
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm font-semibold",
              TEXT[b],
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", BG[b])} />
            Harness health: {score.grade} ({score.overall}/100)
          </div>
        </div>
      </Card>

      <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Categories
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {score.categories.map((c) => (
          <CategoryCard key={c.key} c={c} />
        ))}
      </div>

      <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {recommendations.length > 0
          ? `Fixes (${recommendations.length})`
          : "Fixes"}
      </h2>
      {recommendations.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {recommendations.map((r, i) => (
            <FixCard key={i} r={r} />
          ))}
        </div>
      ) : (
        <Card className="flex items-center gap-2 p-4 text-sm text-good">
          <CheckCircle2 size={16} /> No deterministic fixes — the structure is
          clean.
        </Card>
      )}

      {adoptability && (
        <>
          <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Adoptability
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            What vigiles would catch in your repo — machine-verifiable
            references in your instruction file checked against your actual
            config.
          </p>
          <Adoptability data={adoptability} />
        </>
      )}

      <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        What it ships
      </h2>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        <Stat n={inventory.skills} label="skills" />
        <Stat n={inventory.agents} label="agents" />
        <Stat n={inventory.hooks} label="hooks" />
        <Stat n={inventory.commands} label="commands" />
        <Stat n={inventory.mcp ? "yes" : "no"} label="MCP" />
        <Stat n={inventory.untested} label="untested" />
      </div>

      <footer className="mt-12 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <AlertTriangle size={12} /> Generated by vigiles — we run your harness,
        not just read it.
      </footer>
    </div>
  );
}
