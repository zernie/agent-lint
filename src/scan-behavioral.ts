/**
 * `vigiles scan --trigger` — the BEHAVIORAL column of the scan report.
 *
 * Structural `scan`/`scanPlugin` is deterministic, no-model, CI-free — and stays
 * that way. This is the opt-in, model-gated column that stacks on top: for each
 * model-invocable skill in a plugin, it measures how reliably the description
 * actually FIRES (recall, + precision when irrelevant prompts are supplied),
 * reusing `measureTriggerRate`. It degrades honestly when the `claude` CLI / auth
 * is absent rather than faking a pass — exactly like the egress column.
 *
 * Prompts are AUTHOR-SUPPLIED (a per-skill JSON map), not model-generated — a
 * path in prose is undecidable, and the deterministic-input discipline is what
 * makes the column trustworthy. See `research/plugin-behavioral-findings.md`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { scanPlugin } from "./scan.js";
import {
  measureTriggerRate,
  claudeEvalDriver,
  type TriggerRateReport,
  type EvalDriver,
} from "./eval.js";
import { skillResolved } from "./harness-assert.js";
import { claudeAvailable, type Trace } from "./harness-test.js";
import { codexEvalDriver, codexSkillFired } from "./adapters/codex/eval.js";
import { codexDriver } from "./adapters/codex/driver.js";

/** Which harness drives the behavioral column (default Claude Code). */
export type ProbeHarness = "claude-code" | "codex";

/** Author-supplied prompt sets for one skill (bare skill name → these). */
export interface SkillPrompts {
  readonly prompts: readonly string[];
  readonly irrelevant?: readonly string[];
}
/** The `--prompts <file>` shape: bare skill name → its prompt sets. */
export type TriggerPromptSet = Record<string, SkillPrompts>;

export interface SkillTriggerResult {
  readonly skill: string;
  /** Whether a model probe actually ran (false = skipped, see `note`). */
  readonly measured: boolean;
  readonly recall?: number;
  readonly precision?: number;
  readonly falsePositiveRate?: number;
  readonly n?: number;
  /** Why it was skipped, or a measurement error. */
  readonly note?: string;
}

export interface BehavioralReport {
  /** False when the `claude` CLI / auth is absent — the column couldn't run. */
  readonly available: boolean;
  readonly results: readonly SkillTriggerResult[];
}

export interface ProbeOptions {
  readonly concurrency?: number;
  readonly model?: string;
  readonly minPrompts?: number;
  readonly minDistance?: number;
  /** Which harness to drive (default `"claude-code"`). */
  readonly harness?: ProbeHarness;
}

/**
 * Per-harness probe wiring: the eval driver (runner+parse), how to build the
 * `fired` predicate for a skill, whether to stub bodies, and an availability
 * gate. Claude detects firing via the `Skill` tool_use (namespaced by the
 * plugin name); Codex has no skill event, so firing is the SKILL.md read
 * (`codexSkillFired`, bare name) — see `research/codex-prototype-findings.md`.
 */
export interface HarnessProbe {
  readonly evalDriver: EvalDriver;
  readonly firedFor: (name: string) => (t: Trace) => boolean;
  readonly stub: boolean;
  readonly available: () => boolean;
}

function buildProbe(dir: string, harness: ProbeHarness): HarnessProbe {
  if (harness === "codex") {
    return {
      evalDriver: codexEvalDriver,
      firedFor: (name) => (t) => codexSkillFired(t, name),
      // Codex stubbing of a non-Claude plugin isn't validated; install the real
      // skills (firing is the SKILL.md read, detected regardless of body).
      stub: false,
      available: () => codexDriver.available(),
    };
  }
  const ns = pluginName(dir);
  return {
    evalDriver: claudeEvalDriver,
    firedFor: (name) => (t) => skillResolved(t, ns ? `${ns}:${name}` : name),
    stub: true,
    available: claudeAvailable,
  };
}

/** Plugin name from `.claude-plugin/plugin.json` (the skill id's namespace). */
function pluginName(dir: string): string | null {
  const p = join(dir, ".claude-plugin", "plugin.json");
  if (!existsSync(p)) return null;
  try {
    return (
      (JSON.parse(readFileSync(p, "utf-8")) as { name?: string }).name ?? null
    );
  } catch {
    return null;
  }
}

/** Shared per-run inputs, so `probeSkill` stays a small (ctx, name, prompts) call. */
interface ProbeCtx {
  readonly dir: string;
  readonly opts: ProbeOptions;
  readonly probe: HarnessProbe;
}

/** Probe one skill via the harness probe's eval driver → result, never throwing. */
async function probeSkill(
  ctx: ProbeCtx,
  name: string,
  ps: SkillPrompts,
): Promise<SkillTriggerResult> {
  try {
    const r: TriggerRateReport = await measureTriggerRate(
      {
        pluginDir: ctx.dir,
        stubSkillBodies: ctx.probe.stub,
        prompts: ps.prompts,
        irrelevantPrompts: ps.irrelevant,
        minPrompts: ctx.opts.minPrompts,
        minDistance: ctx.opts.minDistance,
        model: ctx.opts.model,
        concurrency: ctx.opts.concurrency,
        fired: ctx.probe.firedFor(name),
      },
      { evalDriver: ctx.probe.evalDriver },
    );
    return {
      skill: name,
      measured: true,
      recall: r.rate,
      precision: r.precision,
      falsePositiveRate: r.falsePositiveRate,
      n: r.n,
    };
  } catch (e) {
    // A thin/near-duplicate prompt set (diversity gate) or a model-floor reject
    // shouldn't crash the whole scan — surface it per skill.
    return {
      skill: name,
      measured: false,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

/** The injectable core (for tests): probe every model-invocable skill that has prompts. */
export async function probePluginTriggersWith(
  dir: string,
  promptSet: TriggerPromptSet,
  probe: HarnessProbe,
  opts: ProbeOptions = {},
): Promise<BehavioralReport> {
  const ctx: ProbeCtx = { dir, opts, probe };
  // Only model-invocable, describable skills can auto-trigger; user-invoked and
  // description-less ones can't, so they're not behavioral candidates.
  const candidates = scanPlugin(dir).skills.filter(
    (s) => !s.userInvoked && s.hasDescription,
  );
  const results: SkillTriggerResult[] = [];
  for (const s of candidates) {
    const ps = promptSet[s.name];
    if (!ps || ps.prompts.length === 0) {
      results.push({
        skill: s.name,
        measured: false,
        note: "no prompts supplied",
      });
      continue;
    }
    results.push(await probeSkill(ctx, s.name, ps));
  }
  return { available: true, results };
}

/**
 * Probe a plugin's skills against the real harness (default Claude Code; Codex via
 * `opts.harness`). Needs that harness's binary + auth; degrades to
 * `available: false` otherwise.
 */
export async function probePluginTriggers(
  dir: string,
  promptSet: TriggerPromptSet,
  opts: ProbeOptions = {},
): Promise<BehavioralReport> {
  const probe = buildProbe(dir, opts.harness ?? "claude-code");
  if (!probe.available()) return { available: false, results: [] };
  return probePluginTriggersWith(dir, promptSet, probe, opts);
}

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/** Format the behavioral column as a scan-report section. */
export function formatBehavioralReport(b: BehavioralReport): string {
  if (!b.available) {
    return "Behavioral (trigger-rate): unavailable — needs the harness CLI + model auth";
  }
  if (b.results.length === 0) {
    return "Behavioral (trigger-rate): no model-invocable skills to probe";
  }
  const lines = ["Behavioral (trigger-rate):"];
  for (const r of b.results) {
    if (!r.measured) {
      lines.push(`  · ${r.skill} — unmeasured (${r.note ?? "skipped"})`);
      continue;
    }
    const extra: string[] = [];
    if (r.precision !== undefined) extra.push(`precision ${pct(r.precision)}`);
    if (r.falsePositiveRate !== undefined)
      extra.push(`fp ${pct(r.falsePositiveRate)}`);
    extra.push(`${String(r.n ?? 0)} runs`);
    const mark = (r.recall ?? 0) >= 0.6 ? "✓" : "⚠";
    lines.push(
      `  ${mark} ${r.skill} — recall ${pct(r.recall ?? 0)} (${extra.join(", ")})`,
    );
  }
  return lines.join("\n");
}
