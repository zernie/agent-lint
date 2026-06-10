/**
 * vigiles — Claude Code harness *evals*.
 *
 * Measure whether a harness change actually changes agent behaviour. Define a
 * fixture, a set of **arms** (e.g. a hook on vs off, with/without a CLAUDE.md
 * rule), a task prompt, and a **metric**; `runEval` drives the real `claude` CLI
 * N trials per arm and aggregates. This is the generalized form of the
 * benchmark harness under `bench/` — the empirical half of testing your harness.
 *
 *   const report = await runEval({
 *     fixture: { "src/billing.ts": "export function chargeCard(){}" },
 *     arms: {
 *       vanilla: {},
 *       gated:  { settings: { hooks: { PostToolUse: [refsHook] } } },
 *     },
 *     task: "document chargeCard in SKILL.md, referencing it by name",
 *     measure: (ctx) => ({ marked: ctx.sh("grep -c vigiles:symbol SKILL.md") > 0 }),
 *     trials: 6,
 *   });
 *
 * Real model → real cost + statistical, not deterministic. For fast, free,
 * deterministic checks of hook *logic*, see `harness-test.ts`.
 */
import { spawn, execSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

import { resolveHarness } from "./plugin-loader.js";
import {
  parseToolCalls,
  parseResultEvent,
  parseHooks,
  type ToolCall,
  type Trace,
} from "./harness-test.js";

/** One arm of the comparison: fixture overrides + settings (hooks) for this arm. */
export interface EvalArm {
  /** Files written on top of the base fixture for this arm. */
  readonly files?: Record<string, string>;
  /** `.claude/settings.json` (hooks/permissions) for this arm; omit for none. */
  readonly settings?: unknown;
  /**
   * Path to a real plugin/repo to load for this arm (hooks + CLAUDE.md +
   * skills). Lets an arm be "the whole plugin on" vs "off". See
   * src/plugin-loader.ts.
   */
  readonly plugin?: string;
  /**
   * Path to a plugin dir to install NATIVELY (`claude --plugin-dir`) for this
   * arm, so its skills/commands/agents activate the real way — the real model
   * can trigger a skill by its description (vs. `plugin`, which materializes a
   * file subset that does not register skills). Point at a COMPLETE plugin. Lets
   * an arm be "skill installed" vs "off" to measure real activation.
   */
  readonly pluginDir?: string;
}

/**
 * Context handed to `measure` after a run, to compute that run's metrics. It is
 * a `Trace` (so the bare predicates `usedTool` / `skillResolved` / `toolCount` /
 * `toolUsedWith` from `harness-assert.ts` run over it, the same as over a
 * `runHarnessTest` result) plus the eval-only `sh` end-state probe.
 */
export interface RunContext extends Trace {
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  /** `num_turns` reported by claude, or 0. */
  readonly turns: number;
  /** The tools the agent invoked, each paired with its result (parsed from the stream). */
  readonly toolCalls: readonly ToolCall[];
  /** Run a shell command in the working dir; returns trimmed stdout ("" on error). */
  sh(command: string): string;
}

export type Metrics = Record<string, number | boolean>;

export interface EvalSpec<M extends Metrics> {
  readonly name?: string;
  /** Base fixture files (path → contents), written fresh for every run. */
  readonly fixture?: Record<string, string>;
  /** The arms to compare, by name. */
  readonly arms: Record<string, EvalArm>;
  /** The task prompt given to the agent. */
  readonly task: string;
  /** Compute this run's metrics from its outcome. */
  readonly measure: (ctx: RunContext) => M;
  /** Trials per arm. Default 5. */
  readonly trials?: number;
  /** Model alias. Default "haiku". */
  readonly model?: string;
  /** Tools the agent may use. Default: Read Edit Write Bash. */
  readonly allowedTools?: readonly string[];
  /** Per-run timeout ms. Default 240000. */
  readonly timeoutMs?: number;
  /** Seconds to wait between runs (avoid rate-limit bursts). Default 4. */
  readonly spacingSec?: number;
}

/** Per-metric summary statistics across an arm's runs. */
export interface MetricStat {
  /** Mean (numbers) / fraction-true (booleans). */
  readonly mean: number;
  /** Sample standard deviation (0 when n < 2). */
  readonly std: number;
  /** Standard error of the mean (std / √n). */
  readonly se: number;
  /** Number of runs the metric was observed in. */
  readonly n: number;
  /**
   * pass^k (τ-bench): 1 if the metric succeeded on EVERY trial, else 0. The
   * reliability question a non-deterministic harness needs — "worked every time"
   * is not "worked on average". A trial counts as a success when its value is
   * truthy (booleans true, counts > 0), so model your metric as success/fail.
   */
  readonly passK: number;
}

export interface ArmReport {
  readonly runs: number;
  /** Aggregated metrics: mean for numbers, fraction-true (0..1) for booleans. */
  readonly metrics: Record<string, number>;
  /** Per-metric mean / std / se / n, so an A/B gap can be read for significance. */
  readonly stats: Record<string, MetricStat>;
}

export interface EvalReport {
  readonly name: string;
  readonly trials: number;
  readonly arms: Record<string, ArmReport>;
}

function writeFiles(cwd: string, files: Record<string, string>): void {
  for (const [p, content] of Object.entries(files)) {
    const full = resolve(cwd, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** The raw output of one trial: the agent's exit code + captured stdout stream. */
export interface RunOut {
  code: number;
  stdout: string;
}

/** The per-trial arguments handed to an {@link AgentRunner}. */
export interface AgentRunArgs {
  readonly task: string;
  readonly cwd: string;
  readonly model: string;
  readonly tools: readonly string[];
  readonly hasSettings: boolean;
  readonly pluginDir: string | undefined;
  readonly timeoutMs: number;
}

/**
 * Runs one trial and returns its raw output. The default ({@link spawnAgent})
 * drives the real `claude` CLI; `runEvalWith` takes one explicitly, so the eval
 * orchestration is testable without a model (pass a fake returning canned
 * stream-json) and a custom runtime can be plugged in.
 */
export type AgentRunner = (args: AgentRunArgs) => Promise<RunOut>;

/* v8 ignore start -- real claude subprocess; exercised by bench/, not the unit gate */
function spawnAgent(a: AgentRunArgs): Promise<RunOut> {
  return new Promise((resolvePromise) => {
    const args = [
      "-p",
      a.task,
      // stream-json (+ --verbose, required with -p) so the per-turn tool_use
      // events survive into `ctx.toolCalls` — the unified Trace, same as the
      // harness tier. The terminal `result` event still carries num_turns/output.
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      a.model,
      "--permission-mode",
      "acceptEdits",
      ...(a.pluginDir !== undefined
        ? ["--plugin-dir", resolve(a.pluginDir)]
        : []),
      ...(a.hasSettings ? ["--settings", "settings.json"] : []),
      "--allowedTools",
      ...a.tools,
    ];
    const child = spawn("claude", args, {
      cwd: a.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), a.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 0, stdout });
    });
  });
}

/**
 * Run the eval: every arm × every trial against the real `claude` CLI, with the
 * metric computed per run and aggregated per arm. Requires `claude` on PATH and
 * working model auth (e.g. `ANTHROPIC_API_KEY`). Thin wrapper over
 * {@link runEvalWith} with the real agent runner.
 */
export async function runEval<M extends Metrics>(
  spec: EvalSpec<M>,
): Promise<EvalReport> {
  return runEvalWith(spec, spawnAgent);
}
/* v8 ignore stop */

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function makeContext(cwd: string, out: RunOut): RunContext {
  const result = parseResultEvent(out.stdout);
  const turns = typeof result?.num_turns === "number" ? result.num_turns : 0;
  const output = typeof result?.result === "string" ? result.result : "";
  return {
    cwd,
    exitCode: out.code,
    stdout: out.stdout,
    turns,
    toolCalls: parseToolCalls(out.stdout),
    hooks: parseHooks(out.stdout),
    output,
    // The eval tier drives the real API (no mock between claude and the model),
    // so the requests can't be captured here — modelRequests is harness-tier only.
    modelRequests: [],
    file: (p) => {
      const f = resolve(cwd, p);
      return existsSync(f) ? readFileSync(f, "utf-8") : null;
    },
    sh: (command) => {
      try {
        return execSync(command, {
          cwd,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch (e) {
        // Return captured stdout even on a non-zero exit (e.g. `audit` exits 2
        // but still prints its findings), rather than swallowing it.
        const out = (e as { stdout?: string }).stdout;
        return typeof out === "string" ? out.trim() : "";
      }
    },
  };
}

/** Coerce a metric value to a number (booleans → 0/1), or null if absent. */
function numeric(v: number | boolean | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

/** Aggregate per-run metrics: mean for numbers, fraction-true (0..1) for booleans. */
export function aggregate(rows: readonly Metrics[]): Record<string, number> {
  const stats = aggregateStats(rows);
  const out: Record<string, number> = {};
  for (const [k, s] of Object.entries(stats)) out[k] = s.mean;
  return out;
}

/**
 * Aggregate per-run metrics with spread: mean, sample std, standard error, and
 * n. The se/std let you judge whether an A/B gap between arms is real or noise —
 * a difference smaller than the combined se is not yet significant.
 */
export function aggregateStats(
  rows: readonly Metrics[],
): Record<string, MetricStat> {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const out: Record<string, MetricStat> = {};
  for (const k of keys) {
    const values: number[] = [];
    for (const r of rows) {
      const v = numeric(r[k]);
      if (v !== null) values.push(v);
    }
    const n = values.length;
    const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
    const std =
      n > 1
        ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
        : 0;
    const passK = n > 0 && values.every((v) => v > 0) ? 1 : 0;
    out[k] = { mean, std, se: n > 0 ? std / Math.sqrt(n) : 0, n, passK };
  }
  return out;
}

/**
 * The eval orchestration — every arm × trial via `runner`, metric computed per
 * run and aggregated per arm. Exported with an injectable `runner` so the loop,
 * `measure` context, and aggregation are unit-testable without spawning a model
 * (pass a fake returning canned stream-json). `runEval` is this with the real
 * agent runner.
 */
export async function runEvalWith<M extends Metrics>(
  spec: EvalSpec<M>,
  runner: AgentRunner,
): Promise<EvalReport> {
  const trials = spec.trials ?? 5;
  const model = spec.model ?? "haiku";
  const tools = spec.allowedTools ?? ["Read", "Edit", "Write", "Bash"];
  const timeoutMs = spec.timeoutMs ?? 240000;
  const spacing = (spec.spacingSec ?? 4) * 1000;

  const arms: Record<string, ArmReport> = {};
  for (const [armName, arm] of Object.entries(spec.arms)) {
    const rows: Metrics[] = [];
    for (let t = 0; t < trials; t++) {
      const cwd = mkdtempSync(join(tmpdir(), "vigiles-eval-"));
      try {
        const { files, settings } = resolveHarness({
          plugin: arm.plugin,
          settings: arm.settings,
          files: { ...spec.fixture, ...arm.files },
        });
        writeFiles(cwd, files);
        const hasSettings = settings !== undefined;
        if (hasSettings) {
          writeFileSync(
            join(cwd, "settings.json"),
            JSON.stringify(settings, null, 2).replaceAll("{cwd}", cwd),
          );
        }
        const out = await runner({
          task: spec.task,
          cwd,
          model,
          tools,
          hasSettings,
          pluginDir: arm.pluginDir,
          timeoutMs,
        });
        rows.push(spec.measure(makeContext(cwd, out)));
      } finally {
        rmSync(cwd, { recursive: true, force: true });
        await sleep(spacing);
      }
    }
    arms[armName] = {
      runs: rows.length,
      metrics: aggregate(rows),
      stats: aggregateStats(rows),
    };
  }
  return { name: spec.name ?? "eval", trials, arms };
}

/** Render one metric: `name=mean±se pass^k=…` (se/pass^k shown when measured). */
function formatMetric(
  name: string,
  mean: number,
  stat: MetricStat | undefined,
): string {
  const base =
    stat && stat.se > 0
      ? `${name}=${mean.toFixed(2)}±${stat.se.toFixed(2)}`
      : `${name}=${mean.toFixed(2)}`;
  return stat && stat.n > 0 ? `${base} pass^k=${String(stat.passK)}` : base;
}

/** Format an eval report as a compact table for the console (mean ± se, pass^k). */
export function formatEvalReport(report: EvalReport): string {
  const lines = [`${report.name} (${String(report.trials)} trials/arm)`];
  for (const [arm, r] of Object.entries(report.arms)) {
    const parts = Object.entries(r.metrics)
      .map(([k, v]) => formatMetric(k, v, r.stats[k]))
      .join("  ");
    lines.push(`  ${arm.padEnd(10)} ${parts}`);
  }
  return lines.join("\n");
}

// --- trigger-rate: does a skill/behaviour actually FIRE across varied prompts ---

/**
 * Measure how reliably a skill/behaviour *triggers*. A skill's value is its
 * description firing on the right task — the #1 documented skill-authoring pain —
 * and that's a property of the real model, not the wiring (which the
 * deterministic tier already proves). Install the plugin natively (`pluginDir`),
 * give a set of varied `prompts`, and a `fired` predicate over the run's `Trace`
 * (reuse the bare predicates, e.g. `(t) => skillResolved(t, "x:y")`).
 */
export interface TriggerRateSpec {
  /** Plugin dir installed natively (`--plugin-dir`) so its skills/commands activate. */
  readonly pluginDir: string;
  /** The varied prompts to test the trigger against. */
  readonly prompts: readonly string[];
  /** Did the behaviour fire on this run? e.g. `(t) => skillResolved(t, "x:y")`. */
  readonly fired: (trace: Trace) => boolean;
  /** Trials per prompt. Default 1. */
  readonly trials?: number;
  /** Model alias. Default "haiku". */
  readonly model?: string;
  /** Tools the agent may use. Default: Read Edit Write Bash Skill. */
  readonly allowedTools?: readonly string[];
  /** Per-run timeout ms. Default 240000. */
  readonly timeoutMs?: number;
  /** Seconds to wait between runs (avoid rate-limit bursts). Default 4. */
  readonly spacingSec?: number;
}

/** Per-prompt trigger result: how many of its trials fired. */
export interface PromptTriggerStat {
  readonly prompt: string;
  readonly fired: number;
  readonly trials: number;
  /** `fired / trials` (0 when no trials). */
  readonly rate: number;
}

export interface TriggerRateReport {
  /** Overall fraction of runs in which the behaviour fired (0..1). */
  readonly rate: number;
  /** Total runs (prompts × trials). */
  readonly n: number;
  readonly perPrompt: readonly PromptTriggerStat[];
}

/**
 * Trigger-rate orchestration — every prompt × trial via `runner`, the `fired`
 * predicate evaluated per run and aggregated into an overall + per-prompt rate.
 * Exported with an injectable `runner` so the loop is unit-testable without a
 * model; `measureTriggerRate` is this with the real agent runner.
 */
export async function measureTriggerRateWith(
  spec: TriggerRateSpec,
  runner: AgentRunner,
): Promise<TriggerRateReport> {
  const trials = spec.trials ?? 1;
  const model = spec.model ?? "haiku";
  const tools = spec.allowedTools ?? ["Read", "Edit", "Write", "Bash", "Skill"];
  const timeoutMs = spec.timeoutMs ?? 240000;
  const spacing = (spec.spacingSec ?? 4) * 1000;

  const perPrompt: PromptTriggerStat[] = [];
  let firedTotal = 0;
  let n = 0;
  for (const prompt of spec.prompts) {
    let fired = 0;
    for (let t = 0; t < trials; t++) {
      const cwd = mkdtempSync(join(tmpdir(), "vigiles-trigger-"));
      try {
        const out = await runner({
          task: prompt,
          cwd,
          model,
          tools,
          hasSettings: false,
          pluginDir: spec.pluginDir,
          timeoutMs,
        });
        if (spec.fired(makeContext(cwd, out))) fired++;
      } finally {
        rmSync(cwd, { recursive: true, force: true });
        await sleep(spacing);
      }
    }
    perPrompt.push({
      prompt,
      fired,
      trials,
      rate: trials > 0 ? fired / trials : 0,
    });
    firedTotal += fired;
    n += trials;
  }
  return { rate: n > 0 ? firedTotal / n : 0, n, perPrompt };
}

/* v8 ignore start -- real claude subprocess; thin wrapper over measureTriggerRateWith */
/**
 * Measure a skill/behaviour's real trigger rate across prompts × trials against
 * the real `claude` CLI. Requires `claude` + model auth.
 */
export async function measureTriggerRate(
  spec: TriggerRateSpec,
): Promise<TriggerRateReport> {
  return measureTriggerRateWith(spec, spawnAgent);
}
/* v8 ignore stop */

/** Format a trigger-rate report: overall %, then each prompt's rate. */
export function formatTriggerRateReport(report: TriggerRateReport): string {
  const pct = (report.rate * 100).toFixed(0);
  const lines = [`trigger-rate: ${pct}% (${String(report.n)} runs)`];
  for (const p of report.perPrompt) {
    lines.push(`  ${p.rate.toFixed(2)}  ${p.prompt.slice(0, 60)}`);
  }
  return lines.join("\n");
}
