/**
 * Category scoring for `vigiles audit` — the Lighthouse rings.
 *
 * A single structural-health number (the leaderboard's `scoreReport`) ranks
 * plugins, but it hides WHERE a harness is weak. This buckets the SAME
 * deterministic findings into five categories — Truthfulness, Safety,
 * Triggering, Structure, Tested — each a 0–100 ring, with a weighted overall.
 * Same detectors, no re-detection (one-detector-no-drift); the only NEW input is
 * the safety battery's aggregate (Safety), fed in by the runner since it
 * executes hooks.
 *
 * A category that can't be assessed (e.g. Safety when the harness ships no
 * hooks) scores `null` (n/a) and is EXCLUDED from the overall — never a false
 * 0. Pure over the `ScanReport` (+ optional battery), so it's fully testable.
 */
import { gradeFor, type PluginScore } from "./leaderboard.js";
import type { ScanReport } from "./scan.js";

export type CategoryKey =
  | "Truthfulness"
  | "Safety"
  | "Triggering"
  | "Structure"
  | "Tested";

export interface CategoryScore {
  readonly key: CategoryKey;
  /** 0–100, or `null` when the category isn't assessable (n/a — excluded from overall). */
  readonly score: number | null;
  /** Relative weight in the overall (equal by default — tune later). */
  readonly weight: number;
  /** Human-readable deductions / notes, worst first; empty when clean. */
  readonly findings: readonly string[];
}

export interface AuditScore {
  /** Weighted average over the ASSESSABLE categories (n/a excluded). 0 when empty. */
  readonly overall: number;
  readonly grade: PluginScore["grade"];
  readonly categories: readonly CategoryScore[];
  /** No loadable surface at all — overall 0, every category n/a. */
  readonly empty: boolean;
}

/** The safety battery's aggregate (the Safety category's input, fed from the runner). */
export interface BatterySummary {
  readonly totalBlocked: number;
  readonly totalRun: number;
  /** Hooks that couldn't be tested (foreign + no sandbox) — a coverage gap, not a fail. */
  readonly hooksSkipped: number;
}

// Per-item penalties — mirror the leaderboard's weights so the category view and
// the single health number stay consistent (broken-at-runtime costs most).
const W_MISSING_HOOK = 15;
const W_NO_DESCRIPTION = 10;
const W_DANGLING_REF = 8;
const W_OVERLAP = 8; // a description collision → the wrong skill fires
const W_NO_CONTRACT = 5;
const W_UNTESTED = 3;

/** One deduction: a count, its per-item weight, and the label if non-zero. */
interface Deduction {
  readonly n: number;
  readonly weight: number;
  readonly label: string;
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
    findings.push({ n: d.n, text: `${String(d.n)} ${d.label}` });
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

function safety(battery: BatterySummary | undefined): CategoryScore {
  // Safety is the battery: it's only assessable if a hook was actually tested.
  if (!battery || battery.totalRun === 0) {
    const note =
      battery && battery.hooksSkipped > 0
        ? `${String(battery.hooksSkipped)} hook(s) not tested (no sandbox)`
        : "no safety hooks to test";
    return { key: "Safety", score: null, weight: 1, findings: [note] };
  }
  // If NOT ONE hook blocked ANY disaster, we have no evidence the harness even
  // SHIPS a Bash safety guard — every PreToolUse hook may be a non-Bash gate
  // (our own pre-edit.sh blocks .md edits, not `rm -rf`). Scoring that 0 would be
  // a cry-wolf (a false red that tanks the grade). Report n/a instead; a hook
  // that's MEANT to block proves it via assertBlocksDisasters (declared intent).
  if (battery.totalBlocked === 0) {
    return {
      key: "Safety",
      score: null,
      weight: 1,
      findings: [
        "no hook blocked any disaster — none appears to be a Bash safety guard (n/a, not a fail)",
      ],
    };
  }
  const score = Math.round((battery.totalBlocked / battery.totalRun) * 100);
  const findings: string[] = [];
  const slipping = battery.totalRun - battery.totalBlocked;
  if (slipping > 0) {
    findings.push(
      `${String(slipping)}/${String(battery.totalRun)} disaster(s) slip through your hooks`,
    );
  }
  if (battery.hooksSkipped > 0) {
    findings.push(
      `${String(battery.hooksSkipped)} hook(s) not tested (no sandbox)`,
    );
  }
  return { key: "Safety", score, weight: 1, findings };
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
    {
      n: noContract,
      weight: W_NO_CONTRACT,
      label: "agent(s) inherit all tools (no contract)",
    },
  ]);
  return { key: "Structure", score, weight: 1, findings };
}

function tested(r: ScanReport): CategoryScore {
  const { score, findings } = scoreFrom([
    { n: r.untested, weight: W_UNTESTED, label: "untested surface(s)" },
  ]);
  return { key: "Tested", score, weight: 1, findings };
}

function isEmptyMachine(r: ScanReport): boolean {
  const surfaces =
    r.skills.length + r.agents.length + r.hooks.length + r.commands;
  return surfaces === 0 && !r.mcp;
}

/**
 * Bucket a scan report (+ the optional safety-battery aggregate) into the five
 * Lighthouse categories with a weighted overall. n/a categories are excluded
 * from the overall, never scored 0.
 */
export function auditScore(
  report: ScanReport,
  battery?: BatterySummary,
): AuditScore {
  if (isEmptyMachine(report)) {
    const categories: CategoryKey[] = [
      "Truthfulness",
      "Safety",
      "Triggering",
      "Structure",
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
    safety(battery),
    triggering(report),
    structure(report),
    tested(report),
  ];
  const assessable = categories.filter(
    (c): c is CategoryScore & { score: number } => c.score !== null,
  );
  const totalWeight = assessable.reduce((s, c) => s + c.weight, 0);
  const overall =
    totalWeight === 0
      ? 0
      : Math.round(
          assessable.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight,
        );
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

/** Render the category rings + the weighted overall for the terminal. */
export function formatAuditScore(s: AuditScore): string {
  const lines: string[] = ["Harness audit", ""];
  for (const c of s.categories) {
    const glyph = bandGlyph(c.score);
    const label = c.key.padEnd(13);
    const num = (c.score === null ? "n/a" : String(c.score)).padStart(4);
    lines.push(`  ${glyph} ${label} ${num}  ${bar(c.score)}`);
    if (c.findings.length > 0) {
      lines.push(`       └ ${c.findings.join("; ")}`);
    }
  }
  lines.push("");
  lines.push(`Harness health: ${s.grade} (${String(s.overall)}/100)`);
  return lines.join("\n");
}
