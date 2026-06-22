/**
 * The per-repo harness optimizer's DETERMINISTIC spine — shipped as the
 * `vigiles scan --fix-plan` lens (NOT its own `optimize` verb: until the measured
 * A/B half lands, an "optimizer" that only re-prints scan's findings doesn't earn
 * a separate command, so it's folded into scan as one more view on the same
 * report; see research/roadmap.md §P2 "reconsider an `optimize` verb").
 *
 * A2 in the measurement-authority pivot is the ADOPTION product: measure a user's
 * own skills/model/rules on their tasks and recommend add/drop/swap with a MEASURED
 * delta. The measured delta is the real-model layer (gated on the Pro/Max
 * subscription, costs tokens); this v0 ships the deterministic HALF — the free
 * pre-filter that runs on every commit with no model.
 *
 * It answers "what should I fix in my harness, and why" using only the cross-ref
 * findings the linter already computes: it reuses `scoreReport` for the headline
 * structural-health score and `explainScore` for the per-surface cause + one-line
 * fix (one-detector-no-drift — it never re-detects). The result is a prioritized,
 * typed action list — the spine the measured A/B (the behavioral delta) stacks on.
 *
 * This is the "linting as a free pre-filter to measurement" thesis made a command:
 * clear the structural dead-ends a model can't help with FIRST (free, certain),
 * THEN spend tokens measuring whether the structurally-clean skills earn their keep.
 *
 * Distinct from `vigiles explain` (which diagnoses ONE underperforming surface a
 * measurement flagged): `optimize` is the whole-repo adoption view — health score +
 * the ranked fix list + the hand-off to the measured layer. Same findings, the
 * optimization framing. See research/measurement-authority.md (A2) + roadmap §P1.
 */
import { scoreReport, gradeFor, type PluginScore } from "./leaderboard.js";
import {
  explainScore,
  type ScoreExplanation,
  type ExplanationConfidence,
} from "./score-explainer.js";
import type { ScanReport } from "./scan.js";

/**
 * The action a recommendation asks for. The deterministic detectors yield two:
 * `"differentiate"` (a description-overlap PAIR — make the two distinct so the
 * selector can disambiguate) and `"fix"` (every other structural dead-end —
 * correct/add/remove the offending bit). The richer add/drop/swap vocabulary
 * belongs to the MEASURED layer, once a behavioral delta ranks the alternatives.
 */
export type OptimizeAction = "fix" | "differentiate";

export interface Recommendation {
  /** The affected surface (a skill/agent/hook name or path, or an `a ↔ b` pair). */
  readonly surface: string;
  readonly action: OptimizeAction;
  /** The deterministic cause (the detector's own message — no drift). */
  readonly rationale: string;
  /** A single, actionable fix. */
  readonly fix: string;
  /** The lint rule that found it (open `docs/rules/<detector>.md`). */
  readonly detector: string;
  readonly confidence: ExplanationConfidence;
}

export interface OptimizeReport {
  readonly dir: string;
  /** Structural-health score 0–100 (the same `scoreReport` the leaderboard uses). */
  readonly score: number;
  readonly grade: PluginScore["grade"];
  /** The free deterministic fixes, `likely` dead-ends first (explainScore's order). */
  readonly recommendations: readonly Recommendation[];
  /**
   * No loadable surface at all (not a plugin, or a broken load) — distinct from a
   * clean-and-loaded harness with zero findings, so the formatter doesn't call an
   * EMPTY machine "clean". Mirrors `scoreReport`'s empty-machine case.
   */
  readonly empty: boolean;
}

function actionFor(e: ScoreExplanation): OptimizeAction {
  return e.symptom === "wrong-skill-fires" ? "differentiate" : "fix";
}

function isEmptyMachine(r: ScanReport): boolean {
  const surfaces =
    r.skills.length + r.agents.length + r.hooks.length + r.commands;
  return surfaces === 0 && !r.mcp;
}

/**
 * Turn a scan report into a prioritized optimization plan: the structural-health
 * score + a typed recommendation per deterministic finding (`likely` dead-ends
 * before `possible` proxies, via explainScore's own ordering). Pure over the report.
 */
export function optimize(report: ScanReport): OptimizeReport {
  const { score } = scoreReport(report);
  const recommendations: Recommendation[] = explainScore(report).map((e) => ({
    surface: e.surface,
    action: actionFor(e),
    rationale: e.cause,
    fix: e.fix,
    detector: e.detector,
    confidence: e.confidence,
  }));
  return {
    dir: report.dir,
    score,
    grade: gradeFor(score),
    recommendations,
    empty: isEmptyMachine(report),
  };
}

const ACTION_LABEL: Record<OptimizeAction, string> = {
  fix: "FIX",
  differentiate: "DIFFERENTIATE",
};

const measureHint = (dir: string): string =>
  `\`vigiles measure ${dir} --prompts=<file>\` — real-model, runs on your subscription`;

/** Render an optimization plan for the CLI. */
export function formatOptimize(rep: OptimizeReport): string {
  const head = `Harness health: ${String(rep.score)}/100 (${rep.grade}) — ${rep.dir}`;
  if (rep.empty) {
    return `${head}\n\nNothing loaded — this isn't a plugin/harness, or the load failed. Point optimize at a dir with a CLAUDE.md/AGENTS.md, skills, agents, or hooks.`;
  }
  if (rep.recommendations.length === 0) {
    return `${head}\n\nNo deterministic fixes found — the structure is clean. Whether your skills actually help is a BEHAVIORAL question; measure it with ${measureHint(rep.dir)}.`;
  }
  const lines: string[] = [
    head,
    "",
    `${String(rep.recommendations.length)} deterministic fix(es) — free, no model. Apply these before measuring:`,
    "",
  ];
  for (const r of rep.recommendations) {
    const mark = r.confidence === "likely" ? "✗" : "⚠";
    lines.push(`${mark} [${ACTION_LABEL[r.action]}] ${r.surface}`);
    lines.push(`    why: ${r.rationale}  [${r.detector}]`);
    lines.push(`    →    ${r.fix}`);
  }
  lines.push(
    "",
    `Then measure the behavioral delta of what's left (does each skill earn its keep?) with ${measureHint(rep.dir)}.`,
  );
  return lines.join("\n");
}
