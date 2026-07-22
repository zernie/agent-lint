import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Wrench,
  GitCompareArrows,
  ChevronRight,
  Copy,
  Check,
  ShieldAlert,
  Lock,
} from "lucide-react";
import type {
  AuditReport,
  CategoryScore,
  Recommendation,
  Verdict,
} from "./schema";
import { Card } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Adoptability } from "./components/Adoptability";
import { Adopt } from "./components/Adopt";
import { RuleInventory } from "./components/RuleInventory";
import { Observations } from "./components/Observations";
import { band, type Band, TEXT, BG, BORDER, BORDER_L } from "./lib/band";
import { cn } from "./lib/utils";

/** The one canonical paste-into-agent prompt — reused by the demo's hint line, edge
 *  states, the locked tease, and the site CTA (one artifact, many surfaces). Short
 *  enough to read before pasting, explicitly READ-ONLY, harness-neutral (works pasted
 *  into Claude Code OR Codex). */
export const AUDIT_PROMPT =
  "Run `npx vigiles audit` in this repo and walk me through the report: " +
  "the overall grade, each category, and the top fixes in order of impact. " +
  "It's a read-only audit — don't change any files.";

/** The audit checks that have a dedicated explainer page at vigiles.sh/checks/<slug>/.
 *  Mirrors the slugs in site/src/checks/checks.ts — a finding whose detector is here
 *  links to its plain-language page. ABSOLUTE url so the link also works from the CLI's
 *  local HTML report (opened as a file://), not just the hosted site. */
const CHECK_PAGE_SLUGS: ReadonlySet<string> = new Set([
  "lethal-trifecta",
  "subagent-tool-contract",
  "mcp-tool-resolves",
  "hook-events",
  "hook-script-exists",
  "description-overlap",
  "skill-frontmatter",
  "subagent-frontmatter",
]);

function checkUrl(slug: string): string {
  return `https://vigiles.sh/checks/${slug}/`;
}

/** Render a check slug as a link to its explainer page when one exists, else plain. */
function CheckLink({
  slug,
  children,
  className,
}: {
  slug: string;
  children: ReactNode;
  className?: string;
}) {
  if (!CHECK_PAGE_SLUGS.has(slug))
    return <span className={className}>{children}</span>;
  return (
    <a
      href={checkUrl(slug)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "underline decoration-dotted underline-offset-2",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** The last path segment — the audited dir reads as a plugin name, not a path. */
function basename(dir: string): string {
  const parts = dir.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

/**
 * The Safety findings to surface as red "Review — no auto-fix" cards — the HARD
 * lethal-trifecta findings only. Two kinds are deliberately excluded so a report
 * that isn't actually failing on safety never shows a red defect card:
 *   - a `null` score → the "no tool-bearing surface to assess" n/a note (an
 *     instructions-only repo), NOT a trifecta finding;
 *   - an `(advisory)`-suffixed finding → the inherits-all note, which the scorer
 *     appends WITHOUT reducing the score (a broad-by-default A/100 repo), so it must
 *     not read as a hard defect.
 * The scorer flattens hard + advisory findings into one string array (no per-finding
 * severity in the wire shape), so the stable `(advisory)` suffix is the only signal.
 * One home so the summary + full paths can't diverge.
 */
function safetyReviewFindings(
  categories: readonly CategoryScore[],
): readonly string[] {
  const safety = categories.find((c) => c.key === "Safety");
  if (!safety || safety.advisory || safety.score === null) return [];
  return safety.findings.filter((f) => !f.endsWith("(advisory)"));
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
    <div
      className={cn(
        "rounded-xl border border-l-4 border-border/40 bg-card/30 p-5",
        BORDER_L[accent],
      )}
    >
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
        <CheckLink
          slug={r.detector}
          className="ml-auto hidden font-mono text-xs text-muted-foreground hover:text-foreground sm:inline"
        >
          {r.detector}
        </CheckLink>
      </div>
      <div className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        {r.rationale}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm leading-relaxed text-good">→ {r.fix}</span>
        <CopyFix r={r} />
      </div>
    </div>
  );
}

/** A safety review item — no auto-fix (a lethal-trifecta exfil path is a design
 * call, not a typo), so it's shown as a review card, never a ranked +N-pts fix. */
function SafetyCard({ finding }: { finding: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 border-border/40 bg-card/30 p-5",
        BORDER_L.bad,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>
          <ShieldAlert size={12} className="mr-1" />
          safety
        </Badge>
        <span className="leading-relaxed text-muted-foreground">
          {finding}{" "}
          <CheckLink
            slug="lethal-trifecta"
            className="text-muted-foreground hover:text-foreground"
          >
            what&apos;s this?
          </CheckLink>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          your call — no deterministic fix
        </span>
      </div>
    </div>
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

/** A borderless category row (summary variant) — label + score + a findings COUNT +
 * a thin band bar. Type and space, not a bordered box, so the five read as one clean
 * strip; full-width at 390px (grid-cols-1) fixes the mobile 2-up cramping. */
function CategoryRow({ c }: { c: CategoryScore }) {
  const b: Band = c.advisory ? "na" : band(c.score);
  const pct = c.score === null ? 0 : Math.max(0, Math.min(100, c.score));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {c.key}
        </span>
        <span className={cn("font-mono text-sm font-bold", TEXT[b])}>
          {c.advisory ? "—" : c.score === null ? "n/a" : c.score}
          {!c.advisory && c.findings.length > 0 && (
            <span className="ml-1.5 font-sans text-[11px] font-medium text-muted-foreground">
              · {c.findings.length}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", BG[b])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** The locked model-gated tease (summary variant): the deterministic rings show real
 * numbers; the ONE thing a browser can't do — measure whether skills actually fire —
 * is present but veiled, with a click-to-copy "run locally to unlock" prompt. Blurred
 * numbers are `··` placeholders, never fabricated digits. Replaces the AGradeNote +
 * the lock-row box (net fewer elements) while adding the curiosity gap. */
function LockedTease({ onUnlock }: { onUnlock?: () => void }) {
  const [copied, setCopied] = useState(false);
  const unlock = (): void => {
    onUnlock?.();
    void navigator.clipboard?.writeText(AUDIT_PROMPT).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => undefined,
    );
  };
  // Blurred stand-in rows — decorative (aria-hidden), sized to read as REAL per-skill
  // trigger data behind the veil so the reader wants the actual numbers.
  const ghostRows = [
    { w: "w-1/3", bar: "w-[92%]" },
    { w: "w-1/2", bar: "w-[46%]" },
    { w: "w-2/5", bar: "w-[78%]" },
  ];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50">
      <div className="select-none px-5 py-4 opacity-50 blur-[3px]" aria-hidden>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Trigger rate — per skill
          </span>
          <span className={cn("font-mono text-sm font-bold", TEXT.good)}>
            ·· % recall · ·· % precision
          </span>
        </div>
        <div className="mt-3 space-y-2.5">
          {ghostRows.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={cn("h-2 rounded bg-muted-foreground/50", r.w)} />
              <span className="h-1 flex-1 rounded-full bg-border">
                <span
                  className={cn("block h-full rounded-full", BG.good, r.bar)}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={unlock}
        title={AUDIT_PROMPT}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/50 px-5 text-center"
      >
        {copied ? (
          <span
            className={cn(
              "flex items-center gap-2 text-xs font-medium",
              TEXT.good,
            )}
          >
            <Check size={13} aria-hidden className="shrink-0" />
            Prompt copied — paste into Claude Code or Codex
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lock size={13} aria-hidden className="shrink-0" />
              Which of your skills actually fire?
            </span>
            <span className="text-xs text-muted-foreground">
              Measure recall + precision on a real model — free on your Claude
              subscription. Copy the prompt to run it locally.
            </span>
          </>
        )}
      </button>
    </div>
  );
}

/** The verdict-led hero: the grade + score as one badge, the re-scored verdict
 * sentence as the headline, the plugin name + harness, and the trust line. */
function VerdictHeader({
  verdict,
  overall,
  dir,
  harness,
  compact = false,
  subline,
}: {
  verdict: Verdict;
  overall: number | null;
  dir: string;
  harness: string;
  /** Summary variant: no Card border, smaller grade box, no separate trust line
   *  (the section subhead already says "deterministic, model-free"). */
  compact?: boolean;
  /** Extra identity context (e.g. the merged "ships" counts) appended to the name
   *  line — context belongs with identity, not as its own section band. */
  subline?: ReactNode;
}) {
  const b = band(overall);
  const box = compact
    ? "h-20 w-20 rounded-xl text-4xl"
    : "h-28 w-28 rounded-2xl text-5xl";
  const inner = (
    <>
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center border-2",
          box,
          BORDER[b],
        )}
      >
        <span className={cn("font-black leading-none", TEXT[b])}>
          {verdict.grade}
        </span>
        <span className="mt-1 text-xs font-medium text-muted-foreground">
          {overall === null ? "—" : `${overall}/100`}
        </span>
      </div>
      <div className="min-w-0">
        <h1
          className={cn(
            "font-bold leading-snug tracking-tight",
            compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
          )}
        >
          {verdict.sentence}
        </h1>
        <div className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{basename(dir)}</span> ·{" "}
          {harness}
          {subline}
        </div>
        {!compact && (
          <div className="mt-1 text-xs text-muted-foreground">
            deterministic · no model · nothing leaves your machine
          </div>
        )}
      </div>
    </>
  );
  return compact ? (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      {inner}
    </div>
  ) : (
    <Card className="flex flex-col gap-5 p-7 sm:flex-row sm:items-center">
      {inner}
    </Card>
  );
}

/** A "+ N more" fold for a list already showing its most important items. */
function MoreFold({ n, children }: { n: number; children: ReactNode }) {
  if (n <= 0) return null;
  return (
    <details className="group mt-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ChevronRight
          size={13}
          className="transition-transform group-open:rotate-90"
        />
        + {n} more
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5">{children}</div>
    </details>
  );
}

const SECTION_H =
  "mb-4 mt-12 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70";

export function Report({
  data,
  showFooter = true,
  variant = "full",
  onUnlock,
}: {
  data: AuditReport;
  /** The "Generated by vigiles" footer. On by default (the standalone HTML report's
   *  only attribution); the in-page demo turns it off — the page already brands. */
  showFooter?: boolean;
  /** `"summary"` is the decluttered in-demo variant: compact header, borderless
   *  category strip (1-col mobile), top-3 fixes folded, the model-gated tease, and
   *  none of the standalone-only sections. `"full"` (default) is unchanged. */
  variant?: "full" | "summary";
  /** Summary only: click handler for the locked tease. Defaults to copying the
   *  canonical agent prompt; the demo overrides to add a toast. */
  onUnlock?: () => void;
}) {
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

  const safetyFindings = safetyReviewFindings(score.categories);

  if (variant === "summary") {
    const unlock =
      onUnlock ??
      (() => void navigator.clipboard?.writeText(AUDIT_PROMPT).catch(() => {}));
    const ships = [
      inventory.skills && `${inventory.skills} skills`,
      inventory.agents && `${inventory.agents} agents`,
      inventory.hooks && `${inventory.hooks} hooks`,
      inventory.commands && `${inventory.commands} commands`,
    ].filter(Boolean) as string[];
    const top = rankedFixes.slice(0, 3);
    const rest = rankedFixes.slice(3);
    return (
      <div>
        <VerdictHeader
          compact
          verdict={verdict}
          overall={overall}
          dir={meta.dir}
          harness={meta.harness}
          subline={
            <>
              {ships.map((s) => (
                <span key={s}> · {s}</span>
              ))}
              {inventory.untested > 0 && (
                <span className={TEXT.warn}>
                  {" "}
                  · {inventory.untested} untested
                </span>
              )}
            </>
          }
        />

        <h2 className={SECTION_H}>Categories</h2>
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          {score.categories.map((c) => (
            <CategoryRow key={c.key} c={c} />
          ))}
        </div>

        <div className="mt-7">
          <LockedTease onUnlock={unlock} />
        </div>

        <h2 className={SECTION_H}>
          {recommendations.length > 0 ? "Do these first" : "Fixes"}
        </h2>
        {top.length > 0 ? (
          <>
            <div className="flex flex-col gap-2.5">
              {top.map(({ r, points }, i) => (
                <FixCard key={i} r={r} points={points} />
              ))}
            </div>
            <MoreFold n={rest.length}>
              {rest.map(({ r, points }, i) => (
                <FixCard key={i} r={r} points={points} />
              ))}
            </MoreFold>
          </>
        ) : (
          <Card className="flex items-center gap-2 p-4 text-sm text-good">
            <CheckCircle2 size={16} /> No deterministic fixes — the structure is
            clean.
          </Card>
        )}

        {safetyFindings.length > 0 && (
          <>
            <h2 className={SECTION_H}>Review — no auto-fix</h2>
            <div className="flex flex-col gap-2.5">
              {safetyFindings.slice(0, 2).map((f, i) => (
                <SafetyCard key={i} finding={f} />
              ))}
            </div>
            <MoreFold n={safetyFindings.length - 2}>
              {safetyFindings.slice(2).map((f, i) => (
                <SafetyCard key={i} finding={f} />
              ))}
            </MoreFold>
          </>
        )}
      </div>
    );
  }

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
        const findings = safetyReviewFindings(score.categories);
        if (findings.length === 0) return null;
        return (
          <>
            <h2 className="mb-3 mt-9 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Review — no auto-fix
            </h2>
            <div className="flex flex-col gap-2.5">
              {findings.map((f, i) => (
                <SafetyCard key={i} finding={f} />
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

      {showFooter && (
        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Generated by vigiles — we run your harness, not just read it.
        </footer>
      )}
    </div>
  );
}
