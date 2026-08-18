/**
 * Score-explainer — the deterministic WHY behind a low measured score (C4 of the
 * measurement-authority pivot; the strongest pairing in it).
 *
 * The MEASUREMENT layer finds a behavioral SYMPTOM: "this skill underperforms",
 * "the wrong skill fires", "this agent fails its task". A behavioral symptom alone
 * is not actionable — you can drop the skill, but you don't know WHY it lost. The
 * cross-reference engine (the linting layer) already detects the deterministic
 * CAUSES: two skills with near-identical descriptions can't be told apart by the
 * selector; a never-available / typo'd tool is silently dropped from a subagent; a
 * hook on a misspelled event never fires. This module BRIDGES the two: given the
 * `ScanReport` the linter already computes, it surfaces — per affected surface —
 * the deterministic cause of a behavioral symptom and the one-line fix.
 *
 *   Measurement says   "caveman underperforms"
 *   the explainer says "...BECAUSE its description overlaps `compress` (0.86) —
 *                       differentiate them so the selector can disambiguate."
 *
 * It REUSES the scan findings (one-detector-no-drift) — it never re-detects. So
 * it's pure over a `ScanReport`, free, model-less, and consistent with `vigiles
 * lint`/`scan`. It's the diagnostic the per-repo optimizer (`vigiles optimize`,
 * A2) prints next to each "drop / swap" recommendation. See
 * `research/measurement-authority.md` ("what becomes of the linting", role 2).
 */

import type { ScanReport } from "./scan.js";

/**
 * The behavioral failure a MEASUREMENT would observe — the symptom an explanation
 * accounts for. Discriminated so a consumer can group/filter by symptom and so an
 * explanation can never carry a symptom it has no cause for.
 */
export type BehavioralSymptom =
  | "wrong-skill-fires" // the selector can't disambiguate near-identical descriptions
  | "skill-never-fires" // no usable trigger surface (no/weak/foreign description)
  | "agent-underperforms" // a declared tool is silently dropped (never-available / typo / unresolved MCP)
  | "hook-never-runs" // a hook is registered on a bad event or points at a missing script
  | "subagent-never-dispatches"; // frontmatter missing a required field → won't register

/**
 * How firmly the deterministic finding EXPLAINS the symptom:
 * - `"likely"` — a hard structural dead-end (a missing script can't run, a
 *   never-available tool can't be called); the cause is near-certain.
 * - `"possible"` — a high-precision PROXY for a behavioral risk (a description
 *   overlap / a foreign-script description); deterministic to detect, but whether
 *   it actually moved behaviour is confirmed by the `audit` trigger tier.
 */
export type ExplanationConfidence = "likely" | "possible";

export interface ScoreExplanation {
  /** The affected surface (a skill/agent/hook name or path) the symptom attaches to. */
  readonly surface: string;
  /** What a measurement would SEE. */
  readonly symptom: BehavioralSymptom;
  /** The deterministic finding (the scan/lint detector's own message — no drift). */
  readonly cause: string;
  /** The lint rule that found it, so a reader can open `docs/rules/<detector>.md`. */
  readonly detector: string;
  /** A single, actionable fix. */
  readonly fix: string;
  readonly confidence: ExplanationConfidence;
}

const SYMPTOM_LABEL: Record<BehavioralSymptom, string> = {
  "wrong-skill-fires": "the selector fires the wrong skill",
  "skill-never-fires": "the skill never fires",
  "agent-underperforms": "the subagent loses a declared tool",
  "hook-never-runs": "the hook never runs",
  "subagent-never-dispatches": "the subagent won't register",
};

// 1. Description overlap → the selector can't disambiguate (precision collision).
function overlapExplanations(report: ScanReport): ScoreExplanation[] {
  return report.descriptionOverlaps.map((o) => ({
    surface: `${o.a} ↔ ${o.b}`,
    symptom: "wrong-skill-fires",
    cause: o.message,
    detector: "description-overlap",
    // `o.a`/`o.b` are already display LABELS (quoted name, plus the file path
    // when the caller had one) — a bare name is ambiguous now that both
    // discovery levels are read and the same name can appear twice.
    fix: `Differentiate the descriptions of ${o.a} and ${o.b} (${o.similarity} similar) — the selector picks by description, so near-identical text makes it fire the wrong one.`,
    confidence: "possible",
  }));
}

// 2. Skill with no usable description → nothing for the selector to match on.
function skillExplanations(report: ScanReport): ScoreExplanation[] {
  return report.skills
    .filter((s) => !s.hasDescription)
    .map((s) => ({
      surface: s.name,
      symptom: "skill-never-fires",
      cause: `"${s.name}" has no usable description`,
      detector: "skill-frontmatter",
      fix: `Add a "description:" to "${s.name}" — the selector matches on it; without one the skill has no trigger surface.`,
      confidence: "likely",
    }));
}

// 3. Subagent tool-contract dead entries → the tool is silently dropped.
function agentExplanations(report: ScanReport): ScoreExplanation[] {
  const out: ScoreExplanation[] = [];
  for (const a of report.agents) {
    for (const t of a.toolIssues) {
      out.push({
        surface: a.name,
        symptom: "agent-underperforms",
        cause: t.message,
        detector: "subagent-tool-contract",
        fix: t.suggestion
          ? `In "${a.name}", change the tool "${t.tool}" to "${t.suggestion}" — as written it isn't a real tool, so it's dropped and the agent can't use it.`
          : `In "${a.name}", remove or correct the tool "${t.tool}" — it isn't an available tool, so it's silently dropped from the contract.`,
        confidence: "likely",
      });
    }
    for (const m of a.mcpToolIssues) {
      out.push({
        surface: a.name,
        symptom: "agent-underperforms",
        cause: m.message,
        detector: "mcp-tool-resolves",
        fix: `"${a.name}" lists the MCP tool "${m.tool}" but its server "${m.server}" isn't declared in the plugin's mcpServers — declare the server or drop the tool, else the call can't resolve.`,
        confidence: "likely",
      });
    }
  }
  return out;
}

// 4. Hook on an unknown event, or 5. a missing hook script → the hook never runs.
function hookExplanations(report: ScanReport): ScoreExplanation[] {
  const out: ScoreExplanation[] = report.hookEventIssues.map((h) => ({
    surface: h.event,
    symptom: "hook-never-runs",
    cause: h.message,
    detector: "hook-events",
    fix: h.suggestion
      ? `Change the hook event "${h.event}" to "${h.suggestion}" — the harness doesn't define "${h.event}", so the hook never fires.`
      : `Fix the hook event "${h.event}" — the harness doesn't define it, so the hook never fires.`,
    confidence: "likely",
  }));
  for (const h of report.hooks) {
    if (h.status === "missing") {
      out.push({
        surface: h.script,
        symptom: "hook-never-runs",
        cause: `hook script "${h.script}" does not exist on disk`,
        detector: "hook-script-exists",
        fix: `Create "${h.script}" or fix its path — the hook references a script that isn't on disk, so it silently never runs.`,
        confidence: "likely",
      });
    }
  }
  return out;
}

// 6. Subagent frontmatter missing a required field → it won't register at all.
function frontmatterExplanations(report: ScanReport): ScoreExplanation[] {
  return report.frontmatterIssues
    .filter((f) => f.kind === "agent")
    .map((f) => ({
      surface: f.path,
      symptom: "subagent-never-dispatches",
      cause: f.message,
      detector: "subagent-frontmatter",
      fix: `Add the missing ${f.missing.join(" + ")} to "${f.path}" — a subagent without it won't register, so it can never be dispatched.`,
      confidence: "likely",
    }));
}

const confidenceRank = (c: ExplanationConfidence): number =>
  c === "likely" ? 0 : 1;

/**
 * Explain every behavioral symptom the report's deterministic findings account
 * for. Returns one `ScoreExplanation` per finding, `"likely"` causes first (a hard
 * dead-end is more certain than a proxy). Pure over the report.
 */
export function explainScore(report: ScanReport): ScoreExplanation[] {
  return [
    ...overlapExplanations(report),
    ...skillExplanations(report),
    ...agentExplanations(report),
    ...hookExplanations(report),
    ...frontmatterExplanations(report),
    // `likely` before `possible` — surface the certain dead-ends first.
  ].sort((x, y) => confidenceRank(x.confidence) - confidenceRank(y.confidence));
}

/**
 * The explanations that attach to ONE underperforming surface — the call the
 * benchmark/optimizer makes when a measurement flags a single skill/agent. Matches
 * a surface name case-insensitively, including the `"a ↔ b"` overlap pairs (so
 * explaining "caveman" surfaces an overlap with another skill).
 */
export function explainSurface(
  report: ScanReport,
  surface: string,
): ScoreExplanation[] {
  const needle = surface.toLowerCase();
  return explainScore(report).filter((e) =>
    e.surface.toLowerCase().includes(needle),
  );
}

/** Render explanations for a CLI/report — grouped under the symptom, fix called out. */
export function formatExplanations(exps: readonly ScoreExplanation[]): string {
  if (exps.length === 0) {
    return "No deterministic cause found — the cause is likely behavioral (measure with `vigiles measure` / an eval).";
  }
  const lines: string[] = [];
  for (const e of exps) {
    const mark = e.confidence === "likely" ? "✗" : "⚠";
    lines.push(`${mark} ${e.surface} — ${SYMPTOM_LABEL[e.symptom]}`);
    lines.push(`    cause: ${e.cause}  [${e.detector}]`);
    lines.push(`    fix:   ${e.fix}`);
  }
  return lines.join("\n");
}
