/**
 * Plugin health leaderboard — rank many plugins by the deterministic structural
 * signals `scan` already computes (research/divergent-bets.md #9, the engine).
 *
 * This is the no-model half: a defensible health score from concrete facts
 * (missing hook scripts, skills that can't trigger, agents with no tool
 * contract, untested surfaces). It deliberately does NOT score on the loader's
 * free-text warnings — those include doc-mention false positives (see
 * src/scan.ts), and a ranking that penalizes a prose mention would be unfair.
 * The behavioural columns (real trigger-rate, observed egress, safety) need a
 * model and stack on top later; this part runs anywhere in CI for free.
 */

import { basename } from "node:path";

import { scanPlugin, type ScanReport } from "./scan.js";

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
const W_MISSING_HOOK = 15; // a hook script that doesn't exist → never runs
const W_NO_DESCRIPTION = 10; // a skill with no usable description → can't trigger
const W_DANGLING_REF = 8; // a referenced intra-plugin file that's missing → broken path
const W_NO_CONTRACT = 5; // an agent with no `tools:` line → inherits everything
const W_UNTESTED = 3; // a surface with no test/eval → warning-tier

function gradeFor(score: number): PluginScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
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

  const missingHooks = r.hooks.filter((h) => h.status === "missing").length;
  const noDesc = r.skills.filter((s) => !s.hasDescription).length;
  const noContract = r.agents.filter((a) => a.tools === null).length;
  const deadTools = r.agents.reduce((n, a) => n + a.toolIssues.length, 0);
  const deadMcpTools = r.agents.reduce((n, a) => n + a.mcpToolIssues.length, 0);
  const deadDisallowed = r.agents.reduce(
    (n, a) => n + a.disallowedToolIssues.length,
    0,
  );
  const deadHookEvents = r.hookEventIssues.length;
  const badFrontmatter = r.frontmatterIssues.length;
  const badFrontmatterValues = r.frontmatterValueIssues.length;
  const badMcp = r.mcpIssues.length;
  const badMcpHooks = r.mcpHookIssues.length;

  const deductions: { n: number; weight: number; label: string }[] = [
    {
      n: missingHooks,
      weight: W_MISSING_HOOK,
      label: "hook script(s) MISSING",
    },
    {
      n: deadHookEvents,
      weight: W_MISSING_HOOK,
      label: "hook(s) on an unknown event (never fire)",
    },
    {
      n: noDesc,
      weight: W_NO_DESCRIPTION,
      label: "skill(s) with no usable description",
    },
    {
      n: r.danglingRefs.length,
      weight: W_DANGLING_REF,
      label: "broken intra-plugin reference(s)",
    },
    {
      n: deadTools,
      weight: W_DANGLING_REF,
      label: "agent tool(s) that don't exist (typo / never-available)",
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
    {
      n: noContract,
      weight: W_NO_CONTRACT,
      label: "agent(s) inherit all tools (no contract)",
    },
    {
      n: badFrontmatter,
      weight: W_NO_DESCRIPTION,
      label: "surface(s) missing required frontmatter (name/description)",
    },
    {
      n: badFrontmatterValues,
      weight: W_NO_CONTRACT,
      label: "agent(s) with an invalid model/color (typo → silent fallback)",
    },
    {
      n: badMcp,
      weight: W_DANGLING_REF,
      label: "MCP server(s) that can't start (no command/url)",
    },
    {
      n: badMcpHooks,
      weight: W_DANGLING_REF,
      label: "mcp_tool hook(s) incomplete / targeting an undeclared server",
    },
    { n: r.untested, weight: W_UNTESTED, label: "untested surface(s)" },
  ];

  let penalty = 0;
  const issues: string[] = [];
  for (const d of deductions) {
    if (d.n === 0) continue;
    penalty += d.n * d.weight;
    issues.push(`${String(d.n)} ${d.label}`);
  }
  // Sort issues by cost (worst first) so the report leads with what matters.
  issues.sort((a, b) => Number(b.split(" ")[0]) - Number(a.split(" ")[0]));
  return { score: Math.max(0, 100 - penalty), issues };
}

/** Scan + score each directory, ranked best-first (ties broken by name). */
export function rankPlugins(dirs: readonly string[]): PluginScore[] {
  const scored = dirs.map((dir) => {
    const report = scanPlugin(dir);
    const { score, issues } = scoreReport(report);
    return {
      dir,
      name: basename(dir) || dir,
      score,
      grade: gradeFor(score),
      issues,
      report,
    };
  });
  return scored.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}

/** Format a ranked leaderboard as human-readable text. */
export function formatLeaderboard(scores: readonly PluginScore[]): string {
  const out: string[] = [
    `Plugin health leaderboard (${String(scores.length)} scanned)`,
    "",
    "  #   score  grade  plugin",
  ];
  scores.forEach((s, i) => {
    const rank = String(i + 1).padStart(2);
    const score = String(s.score).padStart(3);
    const issue = s.issues.length > 0 ? ` — ${s.issues.join("; ")}` : "";
    out.push(`  ${rank}  ${score}    ${s.grade}      ${s.name}${issue}`);
  });
  out.push(
    "",
    "Structural health only (no model). Weights: missing hook -15, no-description",
    "skill -10, broken intra-plugin ref -8, agent-without-tool-contract -5,",
    "untested surface -3.",
  );
  return out.join("\n");
}
