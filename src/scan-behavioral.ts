/**
 * `vigiles audit --trigger` — the BEHAVIORAL column of the scan report.
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

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { scanPlugin } from "./scan.js";
import {
  measureTriggerRate,
  claudeEvalDriver,
  runPool,
  runSkillSelectionTrial,
  stubbedPluginDir,
  type TriggerRateReport,
  type EvalDriver,
} from "./eval.js";
import { skillResolved } from "./harness-assert.js";
import { claudeAvailable, type Trace } from "./harness-test.js";
import { loadPlugin } from "./adapters/claude-code/plugin-loader.js";
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

/**
 * Does the plugin declare a SessionStart hook? The STUBBED measurement path rebuilds
 * the plugin to skills-only (`packageSkillsDir`), DROPPING `hooks/` — so a SessionStart
 * hook that primes skill selection (e.g. superpowers' `using-superpowers` gateway
 * injection) is silently lost, and a recall collapse to 0 under stubbing is then a
 * measurement ARTIFACT, not a real miss. Detect it to LABEL honestly (Layer 1) rather
 * than report a misleading 0%. See `research/plugin-selection-collision.md`.
 */
function hasSessionStartHook(dir: string): boolean {
  try {
    const hooks = (
      loadPlugin(dir).settings as { hooks?: Record<string, unknown> }
    ).hooks;
    return hooks !== undefined && Object.keys(hooks).includes("SessionStart");
  } catch {
    return false;
  }
}

const HOOK_PRIMED_NOTE =
  "hook-primed — the stubbed run dropped the plugin's SessionStart hook (which can " +
  "prime skill selection), so 0% recall is likely a measurement artifact; re-run " +
  "against the full plugin install to measure faithfully";

/**
 * Layer-1 honesty: a STUBBED run on a SessionStart-hooked plugin where EVERY measured
 * skill sits at recall 0 is the dropped-hook artifact — not a real result. The
 * all-zero gate keeps a genuine single-skill miss reported as real (if siblings fired,
 * the hook ran or wasn't needed). Applied to both the trigger column and the matrix.
 */
function isStubbedHookArtifact(
  dir: string,
  stub: boolean,
  recalls: readonly number[],
): boolean {
  if (!stub || recalls.length === 0) return false;
  if (!recalls.every((r) => r === 0)) return false;
  return hasSessionStartHook(dir);
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
  return {
    available: true,
    results: relabelTriggerArtifact(dir, probe, results),
  };
}

/** Relabel an all-zero-recall stubbed run on a hooked plugin as unmeasured (Layer 1). */
function relabelTriggerArtifact(
  dir: string,
  probe: HarnessProbe,
  results: readonly SkillTriggerResult[],
): SkillTriggerResult[] {
  const recalls = results.filter((r) => r.measured).map((r) => r.recall ?? 0);
  if (!isStubbedHookArtifact(dir, probe.stub, recalls)) return [...results];
  return results.map((r) =>
    r.measured && (r.recall ?? 0) === 0
      ? { skill: r.skill, measured: false, note: HOOK_PRIMED_NOTE }
      : r,
  );
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

// ─── Plugin selection-collision matrix ───────────────────────────────────────
//
// The behavioral CONFIRMATION of the deterministic `description-overlap` proxy
// (src/core/description-overlap.ts). The per-skill trigger-rate column above asks
// each skill in ISOLATION — "does X fire on X's prompts, quiet on X's irrelevant?"
// — so it can't see the failure that actually breaks a multi-skill plugin: one
// skill HIJACKING a SIBLING's prompt. This measures that directly. For each
// model-invocable skill it runs the skill's OWN prompts against the whole installed
// plugin and records WHICH skills fired (whichSkillsFired), building an N×N matrix:
// the diagonal is recall, off-diagonal mass is collision. Claude Code only — Codex
// has no skill-selection event to read. See research/plugin-selection-collision.md.

/** Knobs for the selection-collision measurement. */
export interface SelectionOptions {
  /** Repeats per prompt (default 1). */
  readonly trials?: number;
  /** Selector model — defaults to Sonnet (a weaker model under-selects). */
  readonly model?: string;
  /** Parallel runs across the prompts × trials grid (default 1). */
  readonly concurrency?: number;
  /** Which harness drives it (default `"claude-code"`; others report n/a). */
  readonly harness?: ProbeHarness;
}

/** One run's outcome for the matrix: which of the plugin's OWN skills fired. */
interface SelectionRun {
  readonly intended: string;
  readonly firedBare: readonly string[];
}

export interface SkillSelectionStat {
  readonly skill: string;
  /** Fraction of its own prompts on which it fired (matrix diagonal). */
  readonly recall: number;
  /** Fraction of its own prompts on which a SIBLING skill also/instead fired. */
  readonly collisionRate: number;
  /** Non-errored runs measured for this skill. */
  readonly n: number;
  /** Sibling skills that fired on this skill's prompts, by rate (desc, rate>0). */
  readonly collidesWith: readonly {
    readonly skill: string;
    readonly rate: number;
  }[];
}

export interface SelectionReport {
  /** False when the harness CLI / auth is absent, or the harness has no selector. */
  readonly available: boolean;
  /** Matrix axes — the plugin's model-invocable skill names (bare). */
  readonly skills: readonly string[];
  /** matrix[i][j] = times skill j fired when skill i's prompt was given. */
  readonly matrix: readonly (readonly number[])[];
  readonly perSkill: readonly SkillSelectionStat[];
  /** Plugin-level: fraction of all runs where a non-intended skill fired. */
  readonly collisionRate: number;
  readonly n: number;
  readonly note?: string;
}

/** Map a namespaced skill id (`ns:name`) to its bare name. */
function bareSkillName(id: string): string {
  const i = id.lastIndexOf(":");
  return i >= 0 ? id.slice(i + 1) : id;
}

function emptySelection(skills: readonly string[]): SelectionReport {
  return {
    available: true,
    skills,
    matrix: skills.map(() => []),
    perSkill: [],
    collisionRate: 0,
    n: 0,
  };
}

interface SkillStatInput {
  readonly skill: string;
  readonly i: number;
  readonly skills: readonly string[];
  readonly row: readonly number[];
  readonly n: number;
  readonly collisions: number;
}

function buildSkillStat(a: SkillStatInput): SkillSelectionStat {
  const { skill, i, skills, row, n, collisions } = a;
  const collidesWith = skills
    .map((s, j) => ({ skill: s, rate: n > 0 ? row[j] / n : 0 }))
    .filter((c) => c.skill !== skill && c.rate > 0)
    .sort((x, y) => y.rate - x.rate);
  return {
    skill,
    recall: n > 0 ? row[i] / n : 0,
    collisionRate: n > 0 ? collisions / n : 0,
    n,
    collidesWith,
  };
}

/**
 * Pure aggregation: fold per-run fired-skill sets into the N×N selection matrix +
 * per-skill recall/collision + the plugin-level collision rate. Separated from the
 * model-driving so it's unit-testable with synthetic runs (no model).
 */
export function buildSelectionReport(
  skills: readonly string[],
  runs: readonly SelectionRun[],
): SelectionReport {
  const index = new Map(skills.map((s, i) => [s, i]));
  const n = skills.length;
  const matrix = skills.map(() => new Array<number>(n).fill(0));
  const nBy = new Array<number>(n).fill(0);
  const collisionBy = new Array<number>(n).fill(0);
  let collisionTotal = 0;
  for (const run of runs) {
    const i = index.get(run.intended);
    if (i === undefined) continue;
    nBy[i] += 1;
    let collided = false;
    for (const fb of run.firedBare) {
      const j = index.get(fb);
      if (j === undefined) continue;
      matrix[i][j] += 1;
      if (j !== i) collided = true;
    }
    if (collided) {
      collisionBy[i] += 1;
      collisionTotal += 1;
    }
  }
  const total = nBy.reduce((a, b) => a + b, 0);
  return {
    available: true,
    skills,
    matrix,
    perSkill: skills.map((s, i) =>
      buildSkillStat({
        skill: s,
        i,
        skills,
        row: matrix[i],
        n: nBy[i],
        collisions: collisionBy[i],
      }),
    ),
    collisionRate: total > 0 ? collisionTotal / total : 0,
    n: total,
  };
}

/** Build the prompts × trials work list across every skill that has prompts. */
function selectionJobs(
  candidates: readonly { readonly name: string }[],
  promptSet: TriggerPromptSet,
  trials: number,
): { readonly intended: string; readonly prompt: string }[] {
  return candidates.flatMap((c) => {
    const ps = promptSet[c.name];
    if (!ps || ps.prompts.length === 0) return [];
    return ps.prompts.flatMap((prompt) =>
      Array.from({ length: trials }, () => ({ intended: c.name, prompt })),
    );
  });
}

/** The injectable core (for tests): drive the matrix via a fake/real probe. */
export async function measurePluginSelectionWith(
  dir: string,
  promptSet: TriggerPromptSet,
  probe: HarnessProbe,
  opts: SelectionOptions = {},
): Promise<SelectionReport> {
  const candidates = scanPlugin(dir).skills.filter(
    (s) => !s.userInvoked && s.hasDescription,
  );
  const skills = candidates.map((c) => c.name);
  if (skills.length < 2) {
    return {
      ...emptySelection(skills),
      note: "needs ≥2 model-invocable skills to measure cross-skill collision",
    };
  }
  const own = new Set(skills);
  const jobs = selectionJobs(
    candidates,
    promptSet,
    Math.max(1, opts.trials ?? 1),
  );
  if (jobs.length === 0) {
    return {
      ...emptySelection(skills),
      note: "no prompts supplied for any skill",
    };
  }
  // Selection is decided at the frontmatter (the selector picks BEFORE the body
  // loads), so stub each body to a no-op: the run stops AT selection instead of
  // executing the whole workflow — the same affordability trick trigger-rate uses.
  const pluginDir = probe.stub ? stubbedPluginDir(dir) : dir;
  try {
    const d = probe.evalDriver;
    const outcomes = await runPool(
      jobs,
      Math.max(1, opts.concurrency ?? 1),
      (job) =>
        runSkillSelectionTrial({
          prompt: job.prompt,
          pluginDir,
          runner: d.runner,
          parse: d.parse,
          runError: d.runError,
          model: opts.model ?? "sonnet",
        }),
    );
    const runs: SelectionRun[] = [];
    jobs.forEach((job, k) => {
      if (outcomes[k].errored) return;
      runs.push({
        intended: job.intended,
        firedBare: outcomes[k].fired
          .map(bareSkillName)
          .filter((b) => own.has(b)),
      });
    });
    const report = buildSelectionReport(skills, runs);
    // Layer-1 honesty: an all-zero-recall stubbed run on a hooked plugin is the
    // dropped-hook artifact — flag it instead of presenting a 0%-collision result
    // computed from a plugin that never fired.
    const recalls = report.perSkill.filter((s) => s.n > 0).map((s) => s.recall);
    return isStubbedHookArtifact(dir, probe.stub, recalls)
      ? { ...report, note: HOOK_PRIMED_NOTE }
      : report;
  } finally {
    if (probe.stub) rmSync(pluginDir, { recursive: true, force: true });
  }
}

/**
 * Measure a plugin's cross-skill selection-collision matrix against the real
 * harness (Claude Code only — Codex has no skill-selection event). Needs the
 * `claude` CLI + model auth; degrades to `available: false` otherwise.
 */
export async function measurePluginSelection(
  dir: string,
  promptSet: TriggerPromptSet,
  opts: SelectionOptions = {},
): Promise<SelectionReport> {
  const harness = opts.harness ?? "claude-code";
  if (harness !== "claude-code") {
    return {
      ...emptySelection([]),
      available: false,
      note: `selection-collision is Claude Code only (no skill-selection event on ${harness})`,
    };
  }
  const probe = buildProbe(dir, harness);
  if (!probe.available()) {
    return {
      ...emptySelection([]),
      available: false,
      note: "needs the claude CLI + model auth",
    };
  }
  return measurePluginSelectionWith(dir, promptSet, probe, opts);
}

/** Format the selection-collision matrix as a scan-report section. */
export function formatSelectionReport(r: SelectionReport): string {
  if (!r.available)
    return `Selection-collision: unavailable — ${r.note ?? "n/a"}`;
  if (r.n === 0) return `Selection-collision: ${r.note ?? "not measured"}`;
  const lines = [
    `Selection-collision: ${pct(r.collisionRate)} of ${String(r.n)} runs hit a sibling skill`,
  ];
  if (r.note) lines.push(`  ⓘ ${r.note}`);
  for (const s of r.perSkill) {
    if (s.n === 0) continue;
    const mark = s.collisionRate === 0 ? "✓" : "⚠";
    const top = s.collidesWith[0];
    const tail = top ? ` — top collider: ${top.skill} ${pct(top.rate)}` : "";
    lines.push(
      `  ${mark} ${s.skill} — recall ${pct(s.recall)}, collision ${pct(s.collisionRate)}${tail}`,
    );
  }
  return lines.join("\n");
}
