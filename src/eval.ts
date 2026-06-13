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
import {
  cacheKey,
  readCache,
  writeCache,
  snapshotDir,
  restoreDir,
  type CacheMode,
} from "./eval-cache.js";

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

/** Per-run resource use, parsed from the terminal `result` event (0 when absent). */
export interface EvalUsage {
  /** `total_cost_usd` reported by claude. */
  readonly costUsd: number;
  /** Wall-clock `duration_ms` of the run. */
  readonly durationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Context handed to `measure` after a run, to compute that run's metrics. It is
 * a `Trace` (so the bare predicates `usedTool` / `skillResolved` / `toolCount` /
 * `toolUsedWith` from `harness-assert.ts` run over it, the same as over a
 * `runHarnessTest` result) plus the eval-only `sh` end-state probe and `usage`.
 */
export interface RunContext extends Trace {
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  /** `num_turns` reported by claude, or 0. */
  readonly turns: number;
  /** The tools the agent invoked, each paired with its result (parsed from the stream). */
  readonly toolCalls: readonly ToolCall[];
  /** Cost / latency / tokens for this run (use as metrics, e.g. `{ cost: ctx.usage.costUsd }`). */
  readonly usage: EvalUsage;
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
  /**
   * Record/replay cache mode. Default `"off"` (always re-sample). `"readwrite"`
   * records each trial (output + post-run files) and replays it on a matching
   * re-run — so editing `measure` re-scores for free; the model is re-called only
   * when a model-affecting input changes. `"read"` replays but never records.
   * The cache key excludes `measure`, so changing your metric still hits.
   */
  readonly cache?: CacheMode;
  /** Where cache records live. Default `.vigiles/eval-cache` under cwd. */
  readonly cacheDir?: string;
  /**
   * How many trials to run at once (across all arms × trials). Default 1 (fully
   * sequential — the safe, no-surprise default). Raise it to cut wall-clock time;
   * rate-limit bursts are absorbed by the retry/backoff below.
   */
  readonly concurrency?: number;
  /**
   * Abort the run once measured cost reaches this many USD. In-flight trials
   * finish; remaining ones are skipped and `report.aborted` is set. Needs the
   * model to report `total_cost_usd` (the eval tier does).
   */
  readonly maxCostUsd?: number;
  /** Retries on a detected rate-limit/overload before giving up. Default 3. */
  readonly rateLimitRetries?: number;
  /** Base backoff ms (doubled each retry). Default 1000. */
  readonly retryBackoffMs?: number;
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

/** Aggregated cost / latency / tokens across an arm's runs. */
export interface ArmUsage {
  readonly totalCostUsd: number;
  readonly meanCostUsd: number;
  readonly meanDurationMs: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
}

export interface ArmReport {
  readonly runs: number;
  /** Aggregated metrics: mean for numbers, fraction-true (0..1) for booleans. */
  readonly metrics: Record<string, number>;
  /** Per-metric mean / std / se / n, so an A/B gap can be read for significance. */
  readonly stats: Record<string, MetricStat>;
  /** Cost / latency / token totals + means for this arm. */
  readonly usage: ArmUsage;
}

export interface EvalReport {
  readonly name: string;
  readonly trials: number;
  readonly arms: Record<string, ArmReport>;
  /** Total measured cost across every arm × trial (0 when usage wasn't reported). */
  readonly totalCostUsd: number;
  /** True if a `maxCostUsd` budget cap stopped the run before all trials ran. */
  readonly aborted: boolean;
}

function writeFiles(cwd: string, files: Record<string, string>): void {
  for (const [p, content] of Object.entries(files)) {
    const full = resolve(cwd, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** The raw output of one trial: the agent's exit code + captured streams. */
export interface RunOut {
  code: number;
  stdout: string;
  /** Captured stderr, when the runner provides it (used for rate-limit detection). */
  stderr?: string;
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
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), a.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 0, stdout, stderr });
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

/** Pull cost / latency / tokens out of a parsed `result` event (0 when absent). */
function usageFrom(result: Record<string, unknown> | null): EvalUsage {
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const usage = (result?.usage ?? {}) as Record<string, unknown>;
  return {
    costUsd: num(result?.total_cost_usd),
    durationMs: num(result?.duration_ms),
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
  };
}

/** Parse per-run cost/latency/tokens from a stream — pure, model-free. */
export function parseUsage(stdout: string): EvalUsage {
  return usageFrom(parseResultEvent(stdout));
}

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
    usage: usageFrom(result),
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

/** Aggregate per-run usage into an arm's cost / latency / token totals + means. */
export function aggregateUsage(usages: readonly EvalUsage[]): ArmUsage {
  const n = usages.length;
  const sum = (f: (u: EvalUsage) => number): number =>
    usages.reduce((a, u) => a + f(u), 0);
  const totalCostUsd = sum((u) => u.costUsd);
  return {
    totalCostUsd,
    meanCostUsd: n > 0 ? totalCostUsd / n : 0,
    meanDurationMs: n > 0 ? sum((u) => u.durationMs) / n : 0,
    totalInputTokens: sum((u) => u.inputTokens),
    totalOutputTokens: sum((u) => u.outputTokens),
  };
}

/** Resolved per-run settings shared across an eval's trials. */
interface RunConfig {
  readonly model: string;
  readonly tools: readonly string[];
  readonly timeoutMs: number;
  readonly cache: CacheMode;
  readonly cacheDir: string;
}

/**
 * Run one trial through the cache: on a hit, restore the recorded post-run
 * filesystem into `cwd` and return the recorded output (no model call); on a
 * miss, run the agent and (in `readwrite`) record output + cwd snapshot. The
 * cache key excludes `measure`, so editing the metric still replays.
 */
async function runWithCache(
  runArgs: AgentRunArgs,
  keyParts: {
    files: Record<string, string>;
    settings: unknown;
    trialIndex: number;
  },
  runner: AgentRunner,
  cfg: RunConfig,
): Promise<RunOut> {
  if (cfg.cache === "off") return runner(runArgs);
  const key = cacheKey({
    task: runArgs.task,
    model: runArgs.model,
    tools: runArgs.tools,
    files: keyParts.files,
    settings: keyParts.settings,
    trialIndex: keyParts.trialIndex,
  });
  const hit = readCache(cfg.cacheDir, key);
  if (hit) {
    restoreDir(runArgs.cwd, hit.files);
    return hit.out;
  }
  const out = await runner(runArgs);
  if (cfg.cache === "readwrite") {
    writeCache(cfg.cacheDir, key, { out, files: snapshotDir(runArgs.cwd) });
  }
  return out;
}

/** Execute one trial in a fresh sandbox; returns its metric row + usage. */
async function executeTrial<M extends Metrics>(
  spec: EvalSpec<M>,
  arm: EvalArm,
  trialIndex: number,
  runner: AgentRunner,
  cfg: RunConfig,
): Promise<{ row: M; usage: EvalUsage }> {
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
    const out = await runWithCache(
      {
        task: spec.task,
        cwd,
        model: cfg.model,
        tools: cfg.tools,
        hasSettings,
        pluginDir: arm.pluginDir,
        timeoutMs: cfg.timeoutMs,
      },
      { files, settings, trialIndex },
      runner,
      cfg,
    );
    const ctx = makeContext(cwd, out);
    return { row: spec.measure(ctx), usage: ctx.usage };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// A signal in the captured streams that the model call was rate-limited /
// overloaded — worth a backoff + retry rather than counting as a real sample.
const RATE_LIMIT_RE = /rate.?limit|\b429\b|overloaded|too many requests/i;

/** Whether a run's captured output looks like a rate-limit / overload. Pure. */
export function isRateLimited(out: RunOut): boolean {
  return RATE_LIMIT_RE.test(`${out.stderr ?? ""}\n${out.stdout}`);
}

/** Call `runner`, retrying with exponential backoff while it looks rate-limited. */
async function runWithRetry(
  runArgs: AgentRunArgs,
  runner: AgentRunner,
  retries: number,
  baseMs: number,
): Promise<RunOut> {
  for (let attempt = 0; ; attempt++) {
    const out = await runner(runArgs);
    if (!isRateLimited(out) || attempt >= retries) return out;
    await sleep(baseMs * 2 ** attempt);
  }
}

/** Map `worker` over `items` with at most `concurrency` in flight, order preserved. */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const drain = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const item = items[i];
      if (i >= items.length || item === undefined) return;
      results[i] = await worker(item);
    }
  };
  const workers = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workers }, drain));
  return results;
}

/** One unit of work: a single trial of a single arm. */
interface Unit {
  readonly armName: string;
  readonly arm: EvalArm;
  readonly trialIndex: number;
}

/** Flatten arms × trials into a single work list (so concurrency spans both). */
function buildUnits(arms: Record<string, EvalArm>, trials: number): Unit[] {
  const units: Unit[] = [];
  for (const [armName, arm] of Object.entries(arms)) {
    for (let t = 0; t < trials; t++)
      units.push({ armName, arm, trialIndex: t });
  }
  return units;
}

type DoneResult<M extends Metrics> = {
  readonly armName: string;
  readonly skipped: false;
  readonly row: M;
  readonly usage: EvalUsage;
};
type UnitResult<M extends Metrics> =
  | DoneResult<M>
  | { readonly armName: string; readonly skipped: true };

/** Group completed (non-skipped) unit results by arm and aggregate each. */
function aggregateArms<M extends Metrics>(
  armNames: readonly string[],
  results: readonly UnitResult<M>[],
): { arms: Record<string, ArmReport>; totalCostUsd: number } {
  const arms: Record<string, ArmReport> = {};
  let totalCostUsd = 0;
  for (const armName of armNames) {
    const done = results.filter(
      (r): r is DoneResult<M> => !r.skipped && r.armName === armName,
    );
    const rows = done.map((d) => d.row);
    const usage = aggregateUsage(done.map((d) => d.usage));
    totalCostUsd += usage.totalCostUsd;
    arms[armName] = {
      runs: rows.length,
      metrics: aggregate(rows),
      stats: aggregateStats(rows),
      usage,
    };
  }
  return { arms, totalCostUsd };
}

/**
 * The eval orchestration — every arm × trial via `runner`, run through the cache
 * and a rate-limit retry, with at most `concurrency` in flight and an optional
 * `maxCostUsd` budget cap; metric + usage computed per run and aggregated per
 * arm. Exported with an injectable `runner` so the loop, `measure` context,
 * caching, pooling, and aggregation are unit-testable without spawning a model
 * (pass a fake returning canned stream-json). `runEval` is this with the real
 * agent runner.
 */
export async function runEvalWith<M extends Metrics>(
  spec: EvalSpec<M>,
  runner: AgentRunner,
): Promise<EvalReport> {
  const trials = spec.trials ?? 5;
  const spacing = (spec.spacingSec ?? 4) * 1000;
  const concurrency = spec.concurrency ?? 1;
  const retries = spec.rateLimitRetries ?? 3;
  const backoffMs = spec.retryBackoffMs ?? 1000;
  const cfg: RunConfig = {
    model: spec.model ?? "haiku",
    tools: spec.allowedTools ?? ["Read", "Edit", "Write", "Bash"],
    timeoutMs: spec.timeoutMs ?? 240000,
    cache: spec.cache ?? "off",
    cacheDir: spec.cacheDir ?? resolve(process.cwd(), ".vigiles", "eval-cache"),
  };
  const retrying: AgentRunner = (a) =>
    runWithRetry(a, runner, retries, backoffMs);

  const units = buildUnits(spec.arms, trials);
  let spent = 0;
  let aborted = false;
  const worker = async (unit: Unit): Promise<UnitResult<M>> => {
    if (aborted) return { armName: unit.armName, skipped: true };
    const { row, usage } = await executeTrial(
      spec,
      unit.arm,
      unit.trialIndex,
      retrying,
      cfg,
    );
    spent += usage.costUsd;
    if (spec.maxCostUsd !== undefined && spent >= spec.maxCostUsd) {
      aborted = true;
    }
    if (spacing > 0) await sleep(spacing);
    return { armName: unit.armName, skipped: false, row, usage };
  };

  const results = await runPool(units, concurrency, worker);
  const { arms, totalCostUsd } = aggregateArms<M>(
    Object.keys(spec.arms),
    results,
  );
  return { name: spec.name ?? "eval", trials, arms, totalCostUsd, aborted };
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

/** Compact tokens like `3.4k`; whole numbers under 1000 stay as-is. */
function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** A `($0.0123 · 1.2s/run · 3.4k tok)` suffix, or "" when no usage was reported. */
function formatUsage(u: ArmUsage): string {
  if (u.totalCostUsd === 0 && u.totalInputTokens + u.totalOutputTokens === 0) {
    return "";
  }
  const tok = fmtTokens(u.totalInputTokens + u.totalOutputTokens);
  return `  ($${u.totalCostUsd.toFixed(4)} · ${(u.meanDurationMs / 1000).toFixed(1)}s/run · ${tok} tok)`;
}

/** Format an eval report as a compact table for the console (mean ± se, pass^k). */
export function formatEvalReport(report: EvalReport): string {
  const header =
    report.totalCostUsd > 0
      ? `${report.name} (${String(report.trials)} trials/arm) — $${report.totalCostUsd.toFixed(4)} total`
      : `${report.name} (${String(report.trials)} trials/arm)`;
  const lines = [header];
  for (const [arm, r] of Object.entries(report.arms)) {
    const parts = Object.entries(r.metrics)
      .map(([k, v]) => formatMetric(k, v, r.stats[k]))
      .join("  ");
    lines.push(`  ${arm.padEnd(10)} ${parts}${formatUsage(r.usage)}`);
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
  /**
   * Optional *irrelevant* prompts the skill should **not** fire on — the
   * precision side of triggering. Firing on these is a false positive (a skill
   * whose description is too broad and hijacks unrelated work). When given, the
   * report adds {@link TriggerRateReport.falsePositiveRate} and
   * {@link TriggerRateReport.precision}; `prompts` alone measures recall only.
   */
  readonly irrelevantPrompts?: readonly string[];
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
  /** Overall fraction of relevant runs in which the behaviour fired (recall, 0..1). */
  readonly rate: number;
  /** Total relevant runs (prompts × trials). */
  readonly n: number;
  readonly perPrompt: readonly PromptTriggerStat[];
  /**
   * Fraction of *irrelevant* runs that wrongly fired (lower is better). Present
   * only when {@link TriggerRateSpec.irrelevantPrompts} was given.
   */
  readonly falsePositiveRate?: number;
  /**
   * `relevantFired / (relevantFired + irrelevantFired)` — of all firings, the
   * share on the right prompts. Present only when irrelevant prompts were given
   * AND something fired (undefined when nothing fired at all). Pairs with `rate`
   * (recall) to catch a skill that fires on everything _or_ nothing.
   */
  readonly precision?: number;
  /** Per-prompt stats for the irrelevant set. Present with irrelevant prompts. */
  readonly perIrrelevant?: readonly PromptTriggerStat[];
}

/** The per-run knobs a trigger set shares (everything but the prompt list). */
interface TriggerRunConfig {
  readonly trials: number;
  readonly model: string;
  readonly tools: readonly string[];
  readonly timeoutMs: number;
  readonly spacing: number;
  readonly pluginDir: string;
  readonly fired: (trace: Trace) => boolean;
}

/** Run one prompt set × trials through `runner`, aggregating fired counts. */
async function runTriggerSet(
  prompts: readonly string[],
  cfg: TriggerRunConfig,
  runner: AgentRunner,
): Promise<{ perPrompt: PromptTriggerStat[]; fired: number; n: number }> {
  const perPrompt: PromptTriggerStat[] = [];
  let firedTotal = 0;
  let n = 0;
  for (const prompt of prompts) {
    let fired = 0;
    for (let t = 0; t < cfg.trials; t++) {
      const cwd = mkdtempSync(join(tmpdir(), "vigiles-trigger-"));
      try {
        const out = await runner({
          task: prompt,
          cwd,
          model: cfg.model,
          tools: cfg.tools,
          hasSettings: false,
          pluginDir: cfg.pluginDir,
          timeoutMs: cfg.timeoutMs,
        });
        if (cfg.fired(makeContext(cwd, out))) fired++;
      } finally {
        rmSync(cwd, { recursive: true, force: true });
        await sleep(cfg.spacing);
      }
    }
    perPrompt.push({
      prompt,
      fired,
      trials: cfg.trials,
      rate: cfg.trials > 0 ? fired / cfg.trials : 0,
    });
    firedTotal += fired;
    n += cfg.trials;
  }
  return { perPrompt, fired: firedTotal, n };
}

/**
 * Trigger-rate orchestration — every prompt × trial via `runner`, the `fired`
 * predicate evaluated per run and aggregated into an overall + per-prompt rate.
 * With `irrelevantPrompts`, also runs the precision side (firing there is a false
 * positive) and adds `falsePositiveRate` + `precision`. Exported with an
 * injectable `runner` so the loop is unit-testable without a model;
 * `measureTriggerRate` is this with the real agent runner.
 */
export async function measureTriggerRateWith(
  spec: TriggerRateSpec,
  runner: AgentRunner,
): Promise<TriggerRateReport> {
  const cfg: TriggerRunConfig = {
    trials: spec.trials ?? 1,
    model: spec.model ?? "haiku",
    tools: spec.allowedTools ?? ["Read", "Edit", "Write", "Bash", "Skill"],
    timeoutMs: spec.timeoutMs ?? 240000,
    spacing: (spec.spacingSec ?? 4) * 1000,
    pluginDir: spec.pluginDir,
    fired: spec.fired,
  };

  const relevant = await runTriggerSet(spec.prompts, cfg, runner);
  const base: TriggerRateReport = {
    rate: relevant.n > 0 ? relevant.fired / relevant.n : 0,
    n: relevant.n,
    perPrompt: relevant.perPrompt,
  };
  if ((spec.irrelevantPrompts?.length ?? 0) === 0) return base;

  const irrelevant = await runTriggerSet(
    spec.irrelevantPrompts ?? [],
    cfg,
    runner,
  );
  const fires = relevant.fired + irrelevant.fired;
  return {
    ...base,
    falsePositiveRate: irrelevant.n > 0 ? irrelevant.fired / irrelevant.n : 0,
    precision: fires > 0 ? relevant.fired / fires : undefined,
    perIrrelevant: irrelevant.perPrompt,
  };
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
  if (report.falsePositiveRate !== undefined) {
    const fpr = (report.falsePositiveRate * 100).toFixed(0);
    const prec =
      report.precision === undefined
        ? "n/a"
        : `${(report.precision * 100).toFixed(0)}%`;
    lines.push(`false-positive: ${fpr}%  precision: ${prec}`);
    for (const p of report.perIrrelevant ?? []) {
      lines.push(
        `  ${p.rate.toFixed(2)}  [irrelevant] ${p.prompt.slice(0, 48)}`,
      );
    }
  }
  return lines.join("\n");
}
