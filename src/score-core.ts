/**
 * Structural-health SCORING core — extracted as a NODE-FREE leaf.
 *
 * The scoring functions (`scoreReport`/`reportDeductions`/`computeIntegrityScore`/
 * `gradeFor` + the penalty weights) are pure: they take a {@link ScanReport} and
 * return numbers/labels, touching no filesystem. They lived in `leaderboard.ts`,
 * but that module ALSO holds the node-only `rankPlugins`/`pluginLabel` (which call
 * `scanPlugin` + `node:fs`), so importing ANY symbol from it eagerly pulled the
 * whole `scan.ts` → `@ast-grep/napi` (a native binary) + `node:fs` chain into the
 * graph — tainting `buildAuditReport` and blocking the in-browser audit engine
 * (`scanFiles` is node-free, but the report BUILDER re-tainted it via
 * audit-score/optimize/audit-verdict → leaderboard → scan).
 *
 * Splitting the pure core out here — exactly like `core/ncd.ts` was extracted from
 * `proofs.ts` to keep `node:crypto` out of the browser graph — lets the report
 * builder import scoring WITHOUT the node-only leaderboard code. `leaderboard.ts`
 * re-exports these for its own consumers (rankPlugins/formatters), so nothing that
 * imported them from `./leaderboard.js` breaks. The `ScanReport` import is
 * TYPE-ONLY (elided at build), so no runtime `scan.ts` dependency enters this leaf.
 * See src/scan-files.ts (BROWSER_ROOT) and research/report-view-and-browser-demo.md.
 */
import type { ScanReport } from "./scan.js";

export interface PluginScore {
  readonly dir: string;
  readonly name: string;
  /** 0–100 structural-health score (100 = no structural issues found). */
  readonly score: number;
  readonly grade: "A" | "B" | "C" | "D" | "F";
  /** Human-readable deductions, worst first. */
  readonly issues: readonly string[];
  readonly report: ScanReport;
}

// Penalty weights — broken-at-runtime costs most, footguns less, nudges least.
// Exported so the category view (audit-score.ts) reuses the SAME weights and the
// two surfaces can never drift on a per-item cost.
export const W_MISSING_HOOK = 15; // a hook script that doesn't exist → never runs
export const W_NO_DESCRIPTION = 10; // a skill with no usable description → can't trigger
export const W_DANGLING_REF = 8; // a referenced intra-plugin file that's missing → broken path
export const W_OVERLAP = 8; // a description collision → the wrong skill fires
export const W_NO_CONTRACT = 5; // generic small-footgun weight (disallowedTools typo, invalid model/color)
export const W_TRIFECTA = 10; // a HARD lethal-trifecta contract (all three legs, explicit) → a prompt-injection exfil path. HALF the old 20: a DING, not a fail — a trifecta is a real risk worth surfacing in the grade, but official plugins ship the pattern by design, so it dents the score (e.g. feature-dev's 3 hard units → −30 → C) without a catastrophic F.
// Two things are advisory, NOT graded penalties (shown, never scored — see scoreReport):
//   - untested surfaces — a hardening gap, not breakage.
//   - an agent that inherits all tools (no `tools:` line) — see reportDeductions for why.
//   - an inherits-all (severity "advisory") trifecta finding — shown by the Safety
//     ring but never scored; only the HARD, explicit all-three-legs finding grades.

/** Map a 0–100 structural-health score to its letter grade (A ≥90 … F <60). */
export function gradeFor(score: number): PluginScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/** One deduction: a count, its per-item weight, and the label if non-zero. */
export interface Deduction {
  readonly n: number;
  readonly weight: number;
  readonly label: string;
}

/**
 * The COMPLETE graded-penalty list a report incurs — the single source of truth
 * BOTH the leaderboard's single health number and the audit's category rings
 * read, so the overall can never drift between the two surfaces. Each entry is a
 * graded penalty; untested surfaces are deliberately ABSENT (they're advisory,
 * surfaced separately, never scored).
 */
export function reportDeductions(r: ScanReport): Deduction[] {
  const missingHooks = r.hooks.filter((h) => h.status === "missing").length;
  const noDesc = r.skills.filter((s) => !s.hasDescription).length;
  const deadTools = r.agents.reduce((n, a) => n + a.toolIssues.length, 0);
  const deadMcpTools = r.agents.reduce((n, a) => n + a.mcpToolIssues.length, 0);
  const deadDisallowed = r.agents.reduce(
    (n, a) => n + a.disallowedToolIssues.length,
    0,
  );
  // HARD lethal-trifecta findings only — an EXPLICIT contract naming all three
  // legs (a prompt-injection exfil path). Graded at W_TRIFECTA=10 (HALF the old
  // 20): a DING that surfaces a real risk in the grade without a catastrophic F
  // for an accepted design pattern official plugins ship. Advisory (inherits-all)
  // trifecta findings are surfaced but NEVER graded (aligned with the inherits-all
  // stance), so they're excluded here.
  const hardTrifecta = r.trifectaFindings.filter(
    (f) => f.finding.severity === "hard",
  ).length;

  return [
    {
      n: hardTrifecta,
      weight: W_TRIFECTA,
      label:
        "unit(s) holding all three lethal-trifecta legs (prompt-injection exfil path)",
    },
    {
      n: missingHooks,
      weight: W_MISSING_HOOK,
      label: "hook script(s) MISSING",
    },
    {
      n: r.hookEventIssues.length,
      weight: W_MISSING_HOOK,
      label: "hook(s) on an unknown event (never fire)",
    },
    {
      n: noDesc,
      weight: W_NO_DESCRIPTION,
      label: "skill(s) with no usable description",
    },
    {
      n: r.descriptionOverlaps.length,
      weight: W_OVERLAP,
      label: "near-identical skill description(s) (wrong one fires)",
    },
    {
      n: r.danglingRefs.length,
      weight: W_DANGLING_REF,
      label: "broken intra-plugin reference(s)",
    },
    {
      n: deadTools,
      weight: W_DANGLING_REF,
      label: "unavailable agent tool(s) (typo / never-available)",
    },
    {
      n: deadMcpTools,
      weight: W_DANGLING_REF,
      label: "agent MCP tool(s) whose server isn't declared (can't resolve)",
    },
    {
      n: deadDisallowed,
      weight: W_NO_CONTRACT,
      label: "agent disallowedTools typo(s) that block nothing",
    },
    // NB: an agent that inherits all tools (no `tools:` line) is ADVISORY, not a
    // graded penalty — it's surfaced by scoreReport / the Structure ring but never
    // drags the score. WHY: omitting the `tools:` line is a near-universal,
    // legitimate authoring style (a measured OSS sweep of 122 real plugins found
    // 109 whose ONLY finding was this), so penalizing it makes the grade cry wolf
    // on idiomatic subagents. A health score should mean "something is BROKEN", and
    // a broad-by-default tool surface is a hardening/least-privilege NUDGE, not
    // breakage. The count is re-derived where the advisory note is built.
    {
      n: r.frontmatterIssues.length,
      weight: W_NO_DESCRIPTION,
      label: "surface(s) missing required frontmatter (name/description)",
    },
    {
      n: r.frontmatterValueIssues.length,
      weight: W_NO_CONTRACT,
      label: "agent(s) with an invalid model/color (typo → silent fallback)",
    },
    {
      n: r.mcpIssues.length,
      weight: W_DANGLING_REF,
      label: "MCP server(s) that can't start (no command/url)",
    },
    {
      n: r.mcpHookIssues.length,
      weight: W_DANGLING_REF,
      label: "mcp_tool hook(s) incomplete / targeting an undeclared server",
    },
    {
      n: r.skillResourceIssues.length,
      weight: W_DANGLING_REF,
      label: "skill bundled-resource ref(s) that don't resolve on disk",
    },
    {
      n: r.skillFenceIssues.length,
      weight: W_NO_DESCRIPTION,
      label: "invisible skill(s) (frontmatter with no opening `---` fence)",
    },
    {
      n: r.pluginLayoutIssues.length,
      weight: W_NO_DESCRIPTION,
      label: "functional dir(s) misplaced inside `.claude-plugin/` (invisible)",
    },
    {
      n: r.hookBlockFindings.length,
      weight: W_MISSING_HOOK,
      label: "hook(s) that look like they block but silently don't",
    },
    {
      n: r.hookMatcherFindings.length,
      weight: W_MISSING_HOOK,
      label: "hook matcher(s) that never fire (typo / wrong MCP form)",
    },
    // NB: delegationTrifecta (like the advisory per-unit/inherits-all trifecta) is a
    // ⚠ RISK, surfaced but NOT graded — only the HARD per-unit trifecta above scores.
    // NB: untested surfaces are NOT a penalty — an untested surface is a hardening
    // gap, not breakage, so it never drags the health score (it's appended as an
    // advisory note below). The score ranks what's BROKEN.
  ];
}

/** True when a report has no loadable plugin surface at all (the empty machine). */
export function isEmptyMachine(r: ScanReport): boolean {
  const surfaces =
    r.skills.length +
    r.agents.length +
    r.hooks.length +
    r.inlineHooks +
    r.commands;
  return surfaces === 0 && !r.mcp;
}

/**
 * THE shared integrity score — `100 − Σ(all graded penalties)`, clamped to
 * [0,100]. Both the leaderboard's single health number AND the audit's headline
 * overall read this, so the two can never disagree (the summed model is the
 * honest one — averaging rings would dilute a real problem). Returns the score
 * plus the per-item deductions so callers render their own issue/finding lists.
 */
export function computeIntegrityScore(deductions: readonly Deduction[]): {
  score: number;
  penalty: number;
} {
  let penalty = 0;
  for (const d of deductions) {
    if (d.n <= 0) continue;
    penalty += d.n * d.weight;
  }
  return { score: Math.max(0, 100 - penalty), penalty };
}

/** Resolve the terse "thing(s)" plural placeholder against a count:
 * n===1 drops the "(s)" ("1 tool"); otherwise it becomes "s" ("3 tools").
 * (Kept local — audit-score.ts has its own copy to avoid a circular import.) */
function pluralizeLabel(n: number, label: string): string {
  return label.replace(/\(s\)/g, n === 1 ? "" : "s");
}

/** Deterministic structural-health score for one scanned plugin. */
export function scoreReport(r: ScanReport): {
  score: number;
  issues: string[];
} {
  // An empty/unloadable machine isn't healthy — it's a non-plugin or a broken
  // load. A command-only or MCP-only plugin (commands/*.md or .mcp.json with no
  // skills/agents/hooks) IS a legitimate plugin, though — Anthropic ships
  // command-only plugins in its own marketplace — so it must NOT score 0.
  const surfaces =
    r.skills.length + r.agents.length + r.hooks.length + r.commands;
  if (surfaces === 0 && !r.mcp) {
    return { score: 0, issues: ["no loadable plugin surface"] };
  }

  const deductions = reportDeductions(r);
  const { score } = computeIntegrityScore(deductions);

  const issues: string[] = [];
  for (const d of deductions) {
    if (d.n === 0) continue;
    issues.push(`${String(d.n)} ${pluralizeLabel(d.n, d.label)}`);
  }
  // Sort issues by cost (worst first) so the report leads with what matters.
  issues.sort((a, b) => Number(b.split(" ")[0]) - Number(a.split(" ")[0]));
  // Advisory notes are surfaced for visibility but DON'T affect the score, so they
  // come AFTER the real (score-affecting) issues:
  //   - inherit-all (no tool contract): a least-privilege NUDGE, not breakage —
  //     see reportDeductions for the full rationale.
  //   - untested surfaces: a hardening gap, not breakage.
  const noContract = r.agents.filter((a) => a.tools === null).length;
  if (noContract > 0) {
    issues.push(
      `${String(noContract)} ${pluralizeLabel(noContract, "agent(s) inherit all tools (no contract) (advisory)")}`,
    );
  }
  if (r.untested > 0) {
    issues.push(
      `${String(r.untested)} ${pluralizeLabel(r.untested, "untested surface(s) (advisory)")}`,
    );
  }
  return { score, issues };
}
