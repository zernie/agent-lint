/**
 * Category scoring for `vigiles audit` — the Lighthouse rings.
 *
 * A single structural-health number (the leaderboard's `scoreReport`) ranks
 * plugins, but it hides WHERE a harness is weak. This buckets the SAME
 * deterministic findings into five categories — Truthfulness, Triggering,
 * Structure, Safety, Tested — each a 0–100 ring, as a DIAGNOSTIC breakdown
 * beneath one headline `overall` = `100 − Σ(all graded penalties)` (the SAME
 * summed model as the leaderboard's single health number, via the shared
 * `computeIntegrityScore` — so the two surfaces never disagree). Same detectors,
 * no re-detection (one-detector-no-drift); all deterministic, no execution.
 *
 * SAFETY is fed by the STATIC lethal-trifecta capability check
 * (`lethalTrifectaIssues` → `report.trifectaFindings`): a unit holding all three
 * capability legs is a prompt-injection exfil PATTERN detectable from the tool-SET
 * alone. Safety is an ADVISORY ring — it SHOWS every trifecta unit (hard AND
 * inherits-all) as a heads-up but scores NOTHING into the overall: a trifecta is a
 * capability pattern with no exploit code, not a demonstrated vuln, and official
 * plugins ship it, so grading it would cry wolf. NB the EXECUTING "do your hooks
 * actually block?" disaster-battery is likewise NOT an `audit` ring: running
 * arbitrary hooks safely needs cross-platform confinement that isn't shipped yet,
 * so the battery lives in the `vigiles/testing` API via
 * `guardrail-check`/`assertBlocksDisasters`, where you opt in explicitly.
 *
 * A category that can't be assessed scores `null` (n/a) and is EXCLUDED from the
 * overall — never a false 0. Pure over the `ScanReport`, so it's fully testable.
 */
import {
  gradeFor,
  computeIntegrityScore,
  reportDeductions,
  isEmptyMachine,
  W_MISSING_HOOK,
  W_NO_DESCRIPTION,
  W_DANGLING_REF,
  W_OVERLAP,
  W_NO_CONTRACT,
  type PluginScore,
} from "./leaderboard.js";
import type { ScanReport } from "./scan.js";

export type CategoryKey =
  | "Truthfulness"
  | "Triggering"
  | "Structure"
  | "Safety"
  | "Tested";

export interface CategoryScore {
  readonly key: CategoryKey;
  /** 0–100, or `null` when the category isn't assessable (n/a — excluded from overall). */
  readonly score: number | null;
  /** Relative weight in the overall (equal by default — tune later). */
  readonly weight: number;
  /**
   * Advisory categories are shown but EXCLUDED from the overall grade. An untested
   * surface (or any best-practice gap) is a HARDENING signal, not a broken harness
   * — it must never drag the grade down, so `audit` doesn't read as F on a clean
   * repo that simply hasn't written tests yet. The grade reflects what's BROKEN.
   */
  readonly advisory?: boolean;
  /** Human-readable deductions / notes, worst first; empty when clean. */
  readonly findings: readonly string[];
}

export interface AuditScore {
  /**
   * The headline score — `100 − Σ(all graded penalties)`, clamped to [0,100]
   * (the SAME summed model as the leaderboard's single health number, computed by
   * the shared {@link computeIntegrityScore}, so the two surfaces never disagree).
   * The per-category rings below are a DIAGNOSTIC breakdown, not the headline: a
   * plugin whose only issue is Structure −30 shows Structure 70 in the breakdown
   * AND overall 70 (averaging the rings would dilute that to ~90). 0 when empty.
   */
  readonly overall: number;
  readonly grade: PluginScore["grade"];
  readonly categories: readonly CategoryScore[];
  /** No loadable surface at all — overall 0, every category n/a. */
  readonly empty: boolean;
}

// Per-item penalties are the SHARED leaderboard weights (imported above) so the
// category rings and the single health number can never drift. W_UNTESTED is
// audit-only — untested surfaces are advisory (shown, never scored into overall).
const W_UNTESTED = 3;

/** One deduction: a count, its per-item weight, and the label if non-zero. */
interface Deduction {
  readonly n: number;
  readonly weight: number;
  readonly label: string;
}

/** Resolve the terse "thing(s)" plural placeholder against a count:
 * n===1 drops the "(s)" ("1 tool"); otherwise it becomes "s" ("3 tools"). */
function pluralizeLabel(n: number, label: string): string {
  return label.replace(/\(s\)/g, n === 1 ? "" : "s");
}

/** Apply deductions to a 100 base, clamped to [0,100], collecting non-zero labels. */
function scoreFrom(deductions: readonly Deduction[]): {
  score: number;
  findings: string[];
} {
  let penalty = 0;
  const findings: { n: number; text: string }[] = [];
  for (const d of deductions) {
    if (d.n <= 0) continue;
    penalty += d.n * d.weight;
    findings.push({
      n: d.n,
      text: `${String(d.n)} ${pluralizeLabel(d.n, d.label)}`,
    });
  }
  findings.sort((a, b) => b.n - a.n);
  return {
    score: Math.max(0, 100 - penalty),
    findings: findings.map((f) => f.text),
  };
}

function truthfulness(r: ScanReport): CategoryScore {
  const missingHooks = r.hooks.filter((h) => h.status === "missing").length;
  const { score, findings } = scoreFrom([
    {
      n: r.danglingRefs.length,
      weight: W_DANGLING_REF,
      label: "broken intra-plugin reference(s)",
    },
    {
      n: missingHooks,
      weight: W_MISSING_HOOK,
      label: "hook script(s) missing (never run)",
    },
  ]);
  return { key: "Truthfulness", score, weight: 1, findings };
}

function triggering(r: ScanReport): CategoryScore {
  const noDesc = r.skills.filter((s) => !s.hasDescription).length;
  const { score, findings } = scoreFrom([
    {
      n: noDesc,
      weight: W_NO_DESCRIPTION,
      label: "skill(s) with no usable description (can't trigger)",
    },
    {
      n: r.descriptionOverlaps.length,
      weight: W_OVERLAP,
      label: "near-identical skill description(s) (wrong one fires)",
    },
  ]);
  return { key: "Triggering", score, weight: 1, findings };
}

function structure(r: ScanReport): CategoryScore {
  const noContract = r.agents.filter((a) => a.tools === null).length;
  const deadTools = r.agents.reduce((n, a) => n + a.toolIssues.length, 0);
  const deadMcpTools = r.agents.reduce((n, a) => n + a.mcpToolIssues.length, 0);
  const deadDisallowed = r.agents.reduce(
    (n, a) => n + a.disallowedToolIssues.length,
    0,
  );
  const { score, findings } = scoreFrom([
    {
      n: deadTools,
      weight: W_DANGLING_REF,
      label: "agent tool(s) that don't exist (typo / never-available)",
    },
    {
      n: deadMcpTools,
      weight: W_DANGLING_REF,
      label: "agent MCP tool(s) whose server isn't declared",
    },
    {
      n: r.hookEventIssues.length,
      weight: W_MISSING_HOOK,
      label: "hook(s) on an unknown event (never fire)",
    },
    {
      n: r.mcpIssues.length,
      weight: W_DANGLING_REF,
      label: "MCP server(s) that can't start (no command/url)",
    },
    {
      n: r.mcpHookIssues.length,
      weight: W_DANGLING_REF,
      label: "mcp_tool hook(s) incomplete / undeclared server",
    },
    {
      n: r.frontmatterIssues.length,
      weight: W_NO_DESCRIPTION,
      label: "surface(s) missing required frontmatter",
    },
    {
      n: r.frontmatterValueIssues.length,
      weight: W_NO_CONTRACT,
      label: "agent(s) with an invalid model/color (silent fallback)",
    },
    {
      n: deadDisallowed,
      weight: W_NO_CONTRACT,
      label: "disallowedTools typo(s) that block nothing",
    },
  ]);
  // inherit-all (no `tools:` line) is ADVISORY, not graded: it's surfaced as a
  // least-privilege NUDGE but never lowers the Structure ring. WHY: omitting the
  // tool contract is a near-universal, legitimate authoring style (a measured OSS
  // sweep of 122 real plugins found 109 whose only finding was this), so grading
  // it would make `audit` cry wolf on idiomatic subagents. See reportDeductions.
  const advisory =
    noContract > 0
      ? [
          `${String(noContract)} agent(s) inherit all tools (no contract) (advisory)`,
        ]
      : [];
  return {
    key: "Structure",
    score,
    weight: 1,
    findings: [...findings, ...advisory],
  };
}

/**
 * SAFETY — fed by the STATIC lethal-trifecta check (`report.trifectaFindings`),
 * an ADVISORY (not-graded) ring. It SHOWS every trifecta unit as a real, useful
 * heads-up — a `"hard"` finding (an explicit contract naming all three capability
 * legs) and a `"advisory"` finding (inherits-all) alike — but scores NOTHING into
 * the overall. WHY not graded: a lethal trifecta is a capability PATTERN with no
 * exploit code, not a demonstrated vulnerability, and official plugins ship it
 * (feature-dev's code-reviewer lists Read + WebFetch + WebSearch), so grading it
 * would drop the cleanest plugins to F on an accepted design pattern (cries wolf).
 *
 * The ring is ALWAYS `score: null` + `advisory: true` — never a false 100 (which
 * would imply "verified safe") nor a false 0 — mirroring how the EXECUTING
 * disaster-battery lives outside the graded rings. It's excluded from the overall
 * by construction (the headline sums {@link reportDeductions}, which no longer
 * carries a trifecta penalty). When there's NO tool-bearing surface at all, the
 * ring says so; when there IS one but no trifecta, findings are simply empty.
 */
function safety(r: ScanReport): CategoryScore {
  const modelInvocableSkills = r.skills.filter((s) => !s.userInvoked).length;
  const assessable = r.agents.length + modelInvocableSkills;
  if (assessable === 0) {
    return {
      key: "Safety",
      score: null,
      weight: 1,
      advisory: true,
      findings: ["no tool-bearing surface to assess"],
    };
  }
  // Hard (explicit all-three) and advisory (inherits-all) trifecta units are both
  // SHOWN as a heads-up, never graded — a capability pattern isn't broken code.
  const hard = r.trifectaFindings
    .filter((f) => f.finding.severity === "hard")
    .map(
      (f) =>
        `${f.name} holds all three lethal-trifecta legs — a prompt-injection exfil pattern (advisory: capability pattern, not a demonstrated vuln)`,
    );
  const advisory = r.trifectaFindings
    .filter((f) => f.finding.severity === "advisory")
    .map(
      (f) =>
        `${f.name} inherits all tools — maximal trifecta blast radius (advisory)`,
    );
  return {
    key: "Safety",
    score: null,
    weight: 1,
    advisory: true,
    findings: [...hard, ...advisory],
  };
}

function tested(r: ScanReport): CategoryScore {
  const { score, findings } = scoreFrom([
    { n: r.untested, weight: W_UNTESTED, label: "untested surface(s)" },
  ]);
  // ADVISORY: untested surfaces are a hardening gap, not breakage — shown, but
  // excluded from the overall grade (so a clean-but-untested repo isn't graded F).
  return { key: "Tested", score, weight: 1, advisory: true, findings };
}

/**
 * An instruction-only repo (just a CLAUDE.md/AGENTS.md, no plugin surface) is NOT
 * empty — the scan records `instructions` precisely so it isn't graded F/0 "no
 * loadable surface". Only a dir with NO instruction file AND no surface is empty.
 * (The shared `isEmptyMachine` ignores `instructions`; audit additionally treats
 * an instruction file as a surface.)
 */
function isEmptyAudit(r: ScanReport): boolean {
  return isEmptyMachine(r) && !r.instructions;
}

/**
 * Bucket a scan report into the five deterministic Lighthouse categories as a
 * DIAGNOSTIC breakdown, with the headline `overall` = `100 − Σ(all graded
 * penalties)` (the shared summed model — NOT the average of the rings — so it
 * equals the leaderboard's single health number). The advisory Tested ring and
 * any n/a ring are shown but excluded from the headline.
 */
export function auditScore(report: ScanReport): AuditScore {
  if (isEmptyAudit(report)) {
    const categories: CategoryKey[] = [
      "Truthfulness",
      "Triggering",
      "Structure",
      "Safety",
      "Tested",
    ];
    return {
      overall: 0,
      grade: gradeFor(0),
      categories: categories.map((key) => ({
        key,
        score: null,
        weight: 1,
        findings: ["no loadable plugin surface"],
      })),
      empty: true,
    };
  }
  const categories: CategoryScore[] = [
    truthfulness(report),
    triggering(report),
    structure(report),
    safety(report),
    tested(report),
  ];
  // The headline is the SUMMED model (the shared integrity score), NOT the average
  // of the rings — averaging would let a real problem in one category be diluted
  // by clean siblings. The rings above stay a diagnostic breakdown; Tested
  // (advisory) is never summed in (untested surfaces don't drag the grade).
  const { score: overall } = computeIntegrityScore(reportDeductions(report));
  return { overall, grade: gradeFor(overall), categories, empty: false };
}

// A 22-cell bar gauge ("ring" in the terminal; the real rings are the HTML).
const BAR_CELLS = 22;

/** A glyph that signals the band at a glance (green/amber/red, no ANSI needed). */
function bandGlyph(score: number | null): string {
  if (score === null) return "○";
  if (score >= 90) return "●";
  if (score >= 70) return "◑";
  return "✗";
}

function bar(score: number | null): string {
  if (score === null) return "n/a";
  const filled = Math.round((score / 100) * BAR_CELLS);
  return "█".repeat(filled) + "░".repeat(BAR_CELLS - filled);
}

/** Render the category rings (diagnostic) + the summed overall for the terminal. */
export function formatAuditScore(s: AuditScore): string {
  const lines: string[] = ["Harness audit", ""];
  for (const c of s.categories) {
    const glyph = bandGlyph(c.score);
    const label = c.key.padEnd(13);
    const num = (c.score === null ? "n/a" : String(c.score)).padStart(4);
    const tag = c.advisory ? "  · advisory (not graded)" : "";
    lines.push(`  ${glyph} ${label} ${num}  ${bar(c.score)}${tag}`);
    if (c.findings.length > 0) {
      lines.push(`       └ ${c.findings.join("; ")}`);
    }
  }
  lines.push("");
  lines.push(`Harness health: ${s.grade} (${String(s.overall)}/100)`);
  return lines.join("\n");
}
