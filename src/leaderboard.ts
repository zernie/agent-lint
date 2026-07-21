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

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { scanPlugin } from "./scan.js";
// The pure, node-free scoring core lives in ./score-core.js (extracted so the
// in-browser audit's report builder can import scoring WITHOUT this module's
// node-only scanPlugin/pluginLabel → scan.ts → @ast-grep/napi chain). Re-exported
// here so every existing `from "./leaderboard.js"` consumer keeps working.
import { type PluginScore, gradeFor, scoreReport } from "./score-core.js";
export {
  type PluginScore,
  type Deduction,
  W_MISSING_HOOK,
  W_NO_DESCRIPTION,
  W_DANGLING_REF,
  W_OVERLAP,
  W_NO_CONTRACT,
  W_TRIFECTA,
  gradeFor,
  reportDeductions,
  isEmptyMachine,
  computeIntegrityScore,
  scoreReport,
} from "./score-core.js";

/** The plugin's declared name (`.claude-plugin/plugin.json`), for a real label in
 * the ranking instead of a SHA-pinned dir basename. Falls back to the basename. */
function pluginLabel(dir: string): string {
  const p = join(dir, ".claude-plugin", "plugin.json");
  if (existsSync(p)) {
    try {
      const name = (JSON.parse(readFileSync(p, "utf-8")) as { name?: string })
        .name;
      if (typeof name === "string" && name.length > 0) return name;
    } catch {
      // fall through to the basename
    }
  }
  return basename(dir) || dir;
}

/** Scan + score each directory, ranked best-first (ties broken by name). */
export function rankPlugins(dirs: readonly string[]): PluginScore[] {
  const scored = dirs.map((dir) => {
    const report = scanPlugin(dir);
    const { score, issues } = scoreReport(report);
    return {
      dir,
      name: pluginLabel(dir),
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
    "Structural health only (no model). Weights: missing hook -15, hard lethal-",
    "trifecta unit -10, no-description skill -10, broken intra-plugin ref -8, dead",
    "tool/MCP ref -8. Inherit-all subagents, inherits-all trifecta and untested",
    "surfaces are advisory — shown, not scored.",
  );
  return out.join("\n");
}

const LEADERBOARD_METHOD =
  "_Structural health only (deterministic, no model): missing hook −15, hard " +
  "lethal-trifecta unit −10, no-description skill −10, broken intra-plugin / dead-tool ref −8. " +
  "Inherit-all subagents, inherits-all trifecta and untested surfaces are advisory " +
  "(shown, not scored). Behavioural columns (trigger-rate, collisions, egress) stack on top._";

/**
 * Format a ranked leaderboard as a Markdown table — the PUBLISHABLE form (a README,
 * a gist, the leaderboard site). Shows the top 2 deductions per plugin; the full
 * breakdown is in `--json`. Sibling of the plain-text {@link formatLeaderboard}.
 */
export function formatLeaderboardMarkdown(
  scores: readonly PluginScore[],
): string {
  const lines = [
    `### Plugin health leaderboard (${String(scores.length)} scanned)`,
    "",
    "| # | grade | score | plugin | top issues |",
    "| --: | :--: | --: | :-- | :-- |",
  ];
  scores.forEach((s, i) => {
    const issues =
      s.issues.length > 0 ? s.issues.slice(0, 2).join("; ") : "— clean";
    lines.push(
      `| ${String(i + 1)} | ${s.grade} | ${String(s.score)} | \`${s.name}\` | ${issues} |`,
    );
  });
  lines.push("", LEADERBOARD_METHOD);
  return lines.join("\n");
}
