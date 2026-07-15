import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Wrench,
  GitCompareArrows,
  ChevronRight,
  Copy,
  Check,
  ShieldAlert,
} from "lucide-react";
import type {
  AuditReport,
  CategoryScore,
  Recommendation,
  Verdict,
} from "@/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Adoptability } from "@/components/Adoptability";
import { Adopt } from "@/components/Adopt";
import { RuleInventory } from "@/components/RuleInventory";
import { Observations } from "@/components/Observations";
import { band, type Band, TEXT, BG, BORDER, BORDER_L } from "@/lib/band";
import { cn } from "@/lib/utils";

/** The last path segment — the audited dir reads as a plugin name, not a path. */
function basename(dir: string): string {
  const parts = dir.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

/** Impact band for a fix: bigger score gain ⇒ hotter. Never green (green =
 * passing only), so a fix card never masquerades as a clean signal. */
function impactBand(points: number): Band {
  if (points >= 8) return "bad";
  if (points >= 3) return "warn";
  return "na";
}

/** Copy a paste-ready agent prompt that applies this fix in the real repo. */
function CopyFix({ r }: { r: Recommendation }) {
  const [copied, setCopied] = useState(false);
  const prompt = `In this repo, ${r.fix}. Context: ${r.rationale} (detector: ${r.detector}).`;
  const copy = (): void => {
    void navigator.clipboard?.writeText(prompt).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={prompt}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:border-foreground"
    >
      {copied ? (
        <Check size={13} className={TEXT.good} />
      ) : (
        <Copy size={13} className="text-muted-foreground" />
      )}
      <span className={cn(copied && TEXT.good)}>
        {copied ? "copied!" : "copy agent prompt"}
      </span>
    </button>
  );
}

/** One ranked fix. `points` is the real re-score gain (`+N pts`); the left border
 * + the badge encode impact, not confidence, so the eye lands on the big wins. */
function FixCard({ r, points }: { r: Recommendation; points: number }) {
  const Icon = r.action === "fix" ? Wrench : GitCompareArrows;
  const accent = impactBand(points);
  return (
    <Card className={cn("border-l-4 p-4", BORDER_L[accent])}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>
          <Icon size={12} className="mr-1" />
          {r.action}
        </Badge>
        <strong>{r.surface}</strong>
        {points > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              TEXT[accent],
            )}
          >
            +{points} pts
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {r.detector}
        </span>
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground">{r.rationale}</div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-good">→ {r.fix}</span>
        <CopyFix r={r} />
      </div>
    </Card>
  );
}

/** A compact category cell — a thin band bar + score, so the five read as one
 * scannable strip rather than five heavy rings competing with the verdict. */
function CategoryCell({ c }: { c: CategoryScore }) {
  const b: Band = c.advisory ? "na" : band(c.score);
  const pct = c.score === null ? 0 : Math.max(0, Math.min(100, c.score));
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{c.key}</span>
        <span className={cn("text-sm font-bold", TEXT[b])}>
          {c.advisory ? "—" : c.score === null ? "n/a" : c.score}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", BG[b])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="h-8 overflow-hidden text-[11px] leading-tight text-muted-foreground">
        {c.advisory ? (
          <span className="text-na">advisory — not graded</span>
        ) : c.findings.length > 0 ? (
          <span className="line-clamp-2">
            {c.findings[0]}
            {c.findings.length > 1 && (
              <span className="text-foreground">
                {" "}
                · +{c.findings.length - 1} more
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-good">
            <CheckCircle2 size={11} /> clean
          </span>
        )}
      </div>
    </Card>
  );
}

/** The verdict-led hero: the grade + score as one badge, the re-scored verdict
 * sentence as the headline, the plugin name + harness, and the trust line. */
function VerdictHeader({
  verdict,
  overall,
  dir,
  harness,
}: {
  verdict: Verdict;
  overall: number | null;
  dir: string;
  harness: string;
}) {
  const b = band(overall);
  return (
    <Card className="flex flex-col gap-5 p-7 sm:flex-row sm:items-center">
      <div
        className={cn(
          "flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-2xl border-2",
          BORDER[b],
        )}
      >
        <span className={cn("text-5xl font-black leading-none", TEXT[b])}>
          {verdict.grade}
        </span>
        <span className="mt-1 text-sm font-medium text-muted-foreground">
          {overall === null ? "—" : `${overall}/100`}
        </span>
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
          {verdict.sentence}
        </h1>
        <div className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{basename(dir)}</span> ·{" "}
          {harness}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          deterministic · no model · nothing leaves your machine
        </div>
      </div>
    </Card>
  );
}

export function Report({ data }: { data: AuditReport }) {
  const {
    score,
    verdict,
    recommendations,
    inventory,
    meta,
    adoptability,
    adoptable,
    observations,
    rulesInventory,
    ruleRouting,
  } = data;
  const overall = score.empty ? null : score.overall;

  useEffect(() => {
    document.title =
      overall === null
        ? `vigiles — ${basename(meta.dir)}`
        : `vigiles — ${score.grade} (${overall}) · ${basename(meta.dir)}`;
  }, [overall, score.grade, meta.dir]);

  // Points map, index-aligned to recommendations; rank fixes by real impact.
  const pointsFor = (i: number): number =>
    verdict.perRecommendation.find((p) => p.index === i)?.pointsIfFixed ?? 0;
  const rankedFixes = recommendations
    .map((r, i) => ({ r, points: pointsFor(i) }))
    .sort((a, b) => b.points - a.points);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-10">
      <VerdictHeader
        verdict={verdict}
        overall={overall}
        dir={meta.dir}
        harness={meta.harness}
      />

      <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Categories
      </h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {score.categories.map((c) => (
          <CategoryCell key={c.key} c={c} />
        ))}
      </div>

      <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {recommendations.length > 0 ? "Do these first" : "Fixes"}
      </h2>
      {rankedFixes.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rankedFixes.map(({ r, points }, i) => (
            <FixCard key={i} r={r} points={points} />
          ))}
        </div>
      ) : (
        <Card className="flex items-center gap-2 p-4 text-sm text-good">
          <CheckCircle2 size={16} /> No deterministic fixes — the structure is
          clean.
        </Card>
      )}

      {/* Safety findings have no auto-fix (the lethal-trifecta exfil path is a
          design call, not a typo) — so they never appear as a ranked +N-pts card.
          Surface them here as review items so the report's most severe finding
          isn't buried in 11px category-strip text. */}
      {(() => {
        const safety = score.categories.find((c) => c.key === "Safety");
        if (!safety || safety.advisory || safety.findings.length === 0)
          return null;
        return (
          <>
            <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Review — no auto-fix
            </h2>
            <div className="flex flex-col gap-2.5">
              {safety.findings.map((f, i) => (
                <Card key={i} className={cn("border-l-4 p-4", BORDER_L.bad)}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>
                      <ShieldAlert size={12} className="mr-1" />
                      safety
                    </Badge>
                    <span className="text-muted-foreground">{f}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      your call — no deterministic fix
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        );
      })()}

      {adoptability && (
        <>
          <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Broken references
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Machine-verifiable references in your instruction file — files,
            scripts, symbols — checked against your actual repo and config.
            These don't resolve.
          </p>
          <Adoptability data={adoptability} />
        </>
      )}

      {observations && observations.total > 0 && (
        <>
          <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Flight recorder
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            What your harness actually did in real sessions — read off the local
            <code className="mx-1 font-mono">.vigiles/runs.jsonl</code> ledger.
          </p>
          <Observations data={observations} />
        </>
      )}

      {/* The rule map — EXPERIMENTAL + demoted below the deterministic sections.
          Detection is a heuristic, precision-first filter (it misses some rules),
          so it sits low and is badged experimental so a reader doesn't read it as
          a settled finding like the reference/hook checks above. */}
      {((rulesInventory && rulesInventory.length > 0) ||
        (ruleRouting &&
          (ruleRouting.segmented > 0 ||
            (ruleRouting.possible?.length ?? 0) > 0 ||
            (ruleRouting.skipped?.length ?? 0) > 0))) && (
        <>
          <h2 className="mb-3 mt-9 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your rules → enforced
            <Badge className="border-warn text-warn">experimental</Badge>
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Prose rules in your instruction file that map to an off-the-shelf
            lint rule — and whether it's actually enforced. Detection is a
            heuristic, precision-first preview: it won't catch every rule.
          </p>
          <RuleInventory data={rulesInventory ?? []} routing={ruleRouting} />
        </>
      )}

      {/* "What it ships" — demoted to a single meta line: it's context, not a
          finding, so it no longer competes with the verdict + fixes for the eye. */}
      <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-widest">Ships</span>
        <span>{inventory.skills} skills</span>
        <span>{inventory.agents} agents</span>
        <span>{inventory.hooks} hooks</span>
        <span>{inventory.commands} commands</span>
        <span>MCP {inventory.mcp ? "yes" : "no"}</span>
        {inventory.untested > 0 && (
          <span className={TEXT.warn}>{inventory.untested} untested</span>
        )}
      </div>

      {/* Optional, folded, last on purpose: spec-adoption is a hardening upsell,
          not a failure — surfacing "N surfaces not yet managed" high up reads as
          a nag to a first-time reader. Collapsed by default. */}
      {adoptable && adoptable.surfaces.length > 0 && (
        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
            <ChevronRight
              size={13}
              className="transition-transform group-open:rotate-90"
            />
            Optional — turn {adoptable.surfaces.length} surface
            {adoptable.surfaces.length > 1 ? "s" : ""} into typed specs
          </summary>
          <p className="mb-3 mt-3 text-xs text-muted-foreground">
            Hardening, not a fix: make vigiles verify these surfaces' references
            — fully, or one at a time. Skip it until you want CI to gate them.
          </p>
          <Adopt data={adoptable} />
        </details>
      )}

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        Generated by vigiles — we run your harness, not just read it.
      </footer>
    </div>
  );
}
