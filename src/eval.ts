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
  readdirSync,
  existsSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

import { resolveHarness } from "./adapters/claude-code/plugin-loader.js";
import { claudeCodeRuntime } from "./adapters/claude-code/runtime.js";
import { ncd } from "./core/proofs.js";
import {
  parseToolCalls,
  parseResultEvent,
  parseHooks,
  parseSubagents,
  type ToolCall,
  type Trace,
} from "./harness-test.js";
import {
  cacheKey,
  readCache,
  writeCache,
  snapshotDir,
  restoreDir,
  hashDir,
  type CacheMode,
} from "./eval-cache.js";
import type { Check, CheckJSON } from "./check.js";
import { welchTTest, type Comparison } from "./stats.js";
import {
  type FakeTool,
  buildFakeToolSettings,
  serializeFakeTools,
  FAKE_TOOLS_ENV,
} from "./tool-fake.js";

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
  /**
   * Tools to intercept for this arm (the tool-call spy). Each {@link FakeTool} is
   * denied its real execution by an auto-wired PreToolUse hook — the model still
   * emits the `tool_use` (so its arguments land in the `Trace` for `toolWith` /
   * `notTool`), but the side effect (a paid API call, a `git push`, a paid
   * subagent) never happens. This makes a real-model eval **side-effect-free and
   * safe** (it does NOT cut the model-call cost); and because CC surfaces the
   * denial as a *blocked* call, it's for asserting the agent's ATTEMPT, not for
   * stubbing a tool to continue a multi-step flow. See `src/tool-fake.ts`.
   */
  readonly fakeTools?: readonly FakeTool[];
  /**
   * Model alias/id for THIS arm, overriding the eval-level `model`. A model
   * comparison IS a harness A/B — `arms: { sonnet: { model: "claude-sonnet-4-6" },
   * opus: { model: "claude-opus-4-8" } }` — so model-as-an-arm answers "does my
   * harness still hold on the cheaper tier / after a model upgrade?" through the
   * same significance machinery, with no separate model-matrix runner. Omit to
   * use the eval-level model. See `docs/eval-architecture.md` (model strategy).
   */
  readonly model?: string;
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
  /** Extra env layered over `process.env` for this run (e.g. `VIGILES_FAKE_TOOLS`). */
  readonly env?: Record<string, string>;
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
    const child = spawn(claudeCodeRuntime.agentBinary, args, {
      cwd: a.cwd,
      env: { ...process.env, ...a.env },
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

// ---------------------------------------------------------------------------
// measure() — the SCORED evaluator (Phase 3 of testing-api-design.md)
// ---------------------------------------------------------------------------

/** A task run N times, scored against a `Trace` check vocabulary. */
export interface MeasureSpec {
  /** Base fixture files written for every run (path → contents). */
  readonly fixture?: Record<string, string>;
  /** `.claude/settings.json` (hooks/permissions) for the run. */
  readonly settings?: unknown;
  /** A real plugin/repo to load (materialized) — see `EvalArm.plugin`. */
  readonly plugin?: string;
  /** A complete plugin dir to install natively (`--plugin-dir`) so skills activate. */
  readonly pluginDir?: string;
  /**
   * Stub each skill BODY in `pluginDir` (frontmatter/trigger surface kept) before
   * the run — for checks about whether a skill FIRES (`skill()`), not what it
   * produces. A selected skill stops at selection instead of running its (often
   * expensive) procedure, so a description/firing run costs a fraction of the
   * tokens. Do NOT combine with `judged`/quality checks: the body is gone, so
   * there's nothing to grade. Requires `pluginDir`. See {@link stubSkillBody}.
   */
  readonly stubSkillBodies?: boolean;
  /** Tools to intercept (the tool-call spy) — see {@link EvalArm.fakeTools}. */
  readonly fakeTools?: readonly FakeTool[];
  /** The task prompt given to the agent. */
  readonly task: string;
  /**
   * The checks to score across the trials. Any check over the run is accepted:
   * `Trace` checks (`tool`/`skill`/`output`/`mcp`/`judged`) and resource checks
   * (`cost`/`latency`/`tokens`, which read the eval-only `usage`) — all fit
   * `Check<RunContext>`.
   */
  readonly checks: readonly Check<RunContext>[];
  /** Trials. Default 5. */
  readonly trials?: number;
  /** Model alias. Default "sonnet" — measure on the model your users run. */
  readonly model?: string;
  /** Tools the agent may use. */
  readonly allowedTools?: readonly string[];
  /** Per-run timeout ms. */
  readonly timeoutMs?: number;
  /** Seconds between runs. */
  readonly spacingSec?: number;
}

/** One check's measured rate across the trials. */
export interface CheckRate {
  readonly check: CheckJSON;
  /** Fraction of trials the check passed (0..1). */
  readonly rate: number;
  /** Standard error of the rate. */
  readonly se: number;
  /** pass^k — 1 iff the check passed on EVERY trial. */
  readonly passK: number;
  /** Trials observed. */
  readonly n: number;
}

export interface CheckReport {
  readonly n: number;
  readonly perCheck: readonly CheckRate[];
}

/**
 * Score a check vocabulary across trials — the scored counterpart to
 * `assertChecks` (strict). Each check yields a `rate ± se` and `pass^k` over `n`
 * runs. Reuses the tested `runEvalWith` aggregation (one arm), so the loop,
 * cache, concurrency, and stats come for free. Exported with an injectable
 * `runner` so the orchestration is unit-testable without a model.
 */
export async function measureWith(
  spec: MeasureSpec,
  runner: AgentRunner,
): Promise<CheckReport> {
  if (spec.stubSkillBodies && !spec.pluginDir)
    throw new Error("measure: `stubSkillBodies` requires `pluginDir`.");
  const stubbed = spec.stubSkillBodies
    ? stubbedPluginDir(spec.pluginDir as string)
    : undefined;
  const pluginDir = stubbed ?? spec.pluginDir;
  try {
    const keyed = spec.checks.map((c, i) => [`c${String(i)}`, c] as const);
    const report = await runEvalWith(
      {
        fixture: spec.fixture,
        arms: {
          run: {
            settings: spec.settings,
            plugin: spec.plugin,
            pluginDir,
            fakeTools: spec.fakeTools,
          },
        },
        task: spec.task,
        trials: spec.trials ?? 5,
        model: spec.model ?? "sonnet",
        allowedTools: spec.allowedTools,
        timeoutMs: spec.timeoutMs,
        spacingSec: spec.spacingSec,
        measure: (ctx) =>
          Object.fromEntries(keyed.map(([k, c]) => [k, c.eval(ctx).pass])),
      },
      runner,
    );
    const arm = report.arms.run;
    return {
      n: arm?.runs ?? 0,
      perCheck: keyed.map(([k, c]) => {
        const s = arm?.stats[k];
        return {
          check: c.toJSON(),
          rate: s?.mean ?? 0,
          se: s?.se ?? 0,
          passK: s?.passK ?? 0,
          n: s?.n ?? 0,
        };
      }),
    };
  } finally {
    if (stubbed) rmSync(stubbed, { recursive: true, force: true });
  }
}

/* v8 ignore start -- real claude subprocess; thin wrapper over measureWith */
/** Score a check vocabulary across trials against the real `claude` CLI. */
export async function measure(spec: MeasureSpec): Promise<CheckReport> {
  return measureWith(spec, spawnAgent);
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// measureArms — checks × A/B arms + significance. Unifies the harness-A/B moat
// (a hook/skill/CLAUDE.md ON vs OFF) with the check vocabulary: score the SAME
// checks per arm, then compare a check's rate across arms with Welch significance
// (reusing stats.ts) so a gap reads as real-or-noise, not a hand-fed delta.
// ---------------------------------------------------------------------------

/** A task scored against checks across NAMED arms (the harness variable on/off). */
export interface ArmsMeasureSpec {
  readonly fixture?: Record<string, string>;
  /** The arms to compare (settings / plugin / pluginDir per arm). */
  readonly arms: Record<string, EvalArm>;
  readonly task: string;
  readonly checks: readonly Check<RunContext>[];
  /**
   * Stub each arm's skill BODIES (frontmatter kept) before the run — the A/B
   * counterpart to {@link MeasureSpec.stubSkillBodies}. For firing comparisons
   * (does description variant A fire more than B?), every arm that sets
   * `pluginDir` is repackaged with bodies stripped so each run stops at
   * selection — a fraction of the tokens. Arms without a `pluginDir` are left
   * untouched. Don't combine with `judged`/quality checks. See {@link stubSkillBody}.
   */
  readonly stubSkillBodies?: boolean;
  readonly trials?: number;
  readonly model?: string;
  readonly allowedTools?: readonly string[];
  readonly timeoutMs?: number;
  readonly spacingSec?: number;
}

/** Per-arm {@link CheckReport}s — `arms[name].perCheck[i]` aligns across arms. */
export interface ArmsCheckReport {
  readonly arms: Record<string, CheckReport>;
}

/** Score checks across arms (injectable runner). Reuses `runEvalWith`. */
export async function measureArmsWith(
  spec: ArmsMeasureSpec,
  runner: AgentRunner,
): Promise<ArmsCheckReport> {
  const keyed = spec.checks.map((c, i) => [`c${String(i)}`, c] as const);
  const { arms: runArms, temps } = spec.stubSkillBodies
    ? stubArmPluginDirs(spec.arms)
    : { arms: spec.arms, temps: [] };
  try {
    const report = await runEvalWith(
      {
        fixture: spec.fixture,
        arms: runArms,
        task: spec.task,
        trials: spec.trials ?? 5,
        model: spec.model ?? "sonnet",
        allowedTools: spec.allowedTools,
        timeoutMs: spec.timeoutMs,
        spacingSec: spec.spacingSec,
        measure: (ctx) =>
          Object.fromEntries(keyed.map(([k, c]) => [k, c.eval(ctx).pass])),
      },
      runner,
    );
    const arms: Record<string, CheckReport> = {};
    for (const [armName, arm] of Object.entries(report.arms)) {
      arms[armName] = {
        n: arm.runs,
        perCheck: keyed.map(([k, c]) => {
          const s = arm.stats[k];
          return {
            check: c.toJSON(),
            rate: s?.mean ?? 0,
            se: s?.se ?? 0,
            passK: s?.passK ?? 0,
            n: s?.n ?? 0,
          };
        }),
      };
    }
    return { arms };
  } finally {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  }
}

/**
 * Repackage every arm that sets a `pluginDir` with its skill bodies stubbed
 * (frontmatter kept), for an A/B firing comparison. Returns the rewritten arms
 * plus the throwaway dirs the caller must remove. Arms without a `pluginDir` pass
 * through unchanged. See {@link stubbedPluginDir}.
 */
function stubArmPluginDirs(arms: Record<string, EvalArm>): {
  arms: Record<string, EvalArm>;
  temps: string[];
} {
  const out: Record<string, EvalArm> = {};
  const temps: string[] = [];
  for (const [name, arm] of Object.entries(arms)) {
    if (arm.pluginDir) {
      const stubbed = stubbedPluginDir(arm.pluginDir);
      temps.push(stubbed);
      out[name] = { ...arm, pluginDir: stubbed };
    } else {
      out[name] = arm;
    }
  }
  return { arms: out, temps };
}

/* v8 ignore start -- real claude subprocess; thin wrapper over measureArmsWith */
/** Score checks across arms against the real `claude` CLI. */
export async function measureArms(
  spec: ArmsMeasureSpec,
): Promise<ArmsCheckReport> {
  return measureArmsWith(spec, spawnAgent);
}
/* v8 ignore stop */

/**
 * Welch significance on one check's rate between two arms (`arm` vs `baseline`),
 * by index in `perCheck`. So "the gated arm resolves the skill significantly more
 * than vanilla" is a p-value, not a vibe. Reuses `welchTTest` from stats.ts.
 */
export function compareCheck(
  report: ArmsCheckReport,
  baseline: string,
  arm: string,
  checkIndex: number,
): Comparison {
  const b = report.arms[baseline]?.perCheck[checkIndex];
  const a = report.arms[arm]?.perCheck[checkIndex];
  if (!a || !b) {
    throw new Error(
      `compareCheck: unknown arm or check index (baseline="${baseline}", arm="${arm}", i=${String(checkIndex)})`,
    );
  }
  return welchTTest(
    { mean: a.rate, se: a.se, n: a.n },
    { mean: b.rate, se: b.se, n: b.n },
  );
}

/** A readable label for a check from its serialized form, e.g. `tool(Bash)`. */
function checkLabel(json: CheckJSON): string {
  const arg = json.name ?? json.id ?? json.event ?? json.path ?? json.matcher;
  if (
    typeof arg === "string" ||
    typeof arg === "number" ||
    typeof arg === "boolean"
  ) {
    return `${json.kind}(${String(arg)})`;
  }
  return json.kind;
}

/** Format a {@link CheckReport}: one line per check with its rate ± se and pass^k. */
export function formatCheckReport(report: CheckReport): string {
  const lines = [`measured ${String(report.n)} run(s):`];
  for (const c of report.perCheck) {
    lines.push(
      `  ${(c.rate * 100).toFixed(0)}% ± ${(c.se * 100).toFixed(0)}%  ${checkLabel(c.check)}` +
        `  (pass^k ${String(c.passK)})`,
    );
  }
  return lines.join("\n");
}

/**
 * The scored gate (Phase 4): throw if any check's measured rate is below `min` —
 * the `measure` counterpart to `assertChecks` (strict). Reads the rate, not a
 * single run, so it never trips on one noisy trial.
 */
export function assertRates(report: CheckReport, opts: { min: number }): void {
  const below = report.perCheck.filter((c) => c.rate < opts.min);
  if (below.length > 0) {
    throw new Error(
      `${String(below.length)} check(s) below the ${(opts.min * 100).toFixed(0)}% min rate:\n` +
        below
          .map(
            (c) =>
              `  ✗ ${checkLabel(c.check)}: ${(c.rate * 100).toFixed(0)}% ± ${(c.se * 100).toFixed(0)}%`,
          )
          .join("\n"),
    );
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialize a {@link CheckReport} to JUnit XML (Phase 4) — each check a
 * `<testcase>`, failing when its rate is below `min`. Because a check is *data*,
 * this falls out for free: CI test reporters, regression baselines, and a
 * promptfoo bridge all consume the same shape.
 */
export function checkReportToJUnit(
  report: CheckReport,
  opts: { min?: number; name?: string } = {},
): string {
  const min = opts.min ?? 0;
  const failures = report.perCheck.filter((c) => c.rate < min).length;
  const cases = report.perCheck
    .map((c) => {
      const name = escapeXml(checkLabel(c.check));
      const body =
        c.rate < min
          ? `\n    <failure message="rate ${(c.rate * 100).toFixed(0)}% below min ${(min * 100).toFixed(0)}% (n=${String(c.n)})"/>\n  `
          : "";
      return `  <testcase classname="vigiles.checks" name="${name}">${body}</testcase>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuite name="${escapeXml(opts.name ?? "vigiles measure")}" tests="${String(report.perCheck.length)}" failures="${String(failures)}">\n` +
    `${cases}\n</testsuite>\n`
  );
}

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
    subagents: parseSubagents(out.stdout),
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
        // Return captured stdout even on a non-zero exit (e.g. `lint` exits 2
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
    env: runArgs.env,
    // A native --plugin-dir install isn't in `files`, so hash its CONTENTS into
    // the key — otherwise editing a skill in it would false-replay.
    pluginDirHash: runArgs.pluginDir ? hashDir(runArgs.pluginDir) : undefined,
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

/**
 * The `vigiles fake-tool-hook` command, as an absolute `node <cli> …` invocation
 * — the eval runs in a throwaway cwd where `npx vigiles` wouldn't resolve, so the
 * auto-wired PreToolUse hook must point at this CLI's own `cli.js` (resolved from
 * `__dirname`, the same way `run-hook.ts`/`sandbox.ts` locate their entries).
 */
const FAKE_TOOL_HOOK_CLI =
  [join(__dirname, "cli.js"), join(__dirname, "..", "dist", "cli.js")].find(
    (p) => existsSync(p),
  ) ?? join(__dirname, "cli.js");
const FAKE_TOOL_HOOK_CMD = `"${process.execPath}" "${FAKE_TOOL_HOOK_CLI}" fake-tool-hook`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

/**
 * A model id is "dated" (honestly pinned) when it ends in an 8-digit date stamp,
 * e.g. `claude-haiku-4-5-20251001`. A floating alias (`haiku`, `sonnet`, or even
 * `claude-sonnet-4-6` with no date) can change underneath you — so a cached or
 * baselined result pinned to it can silently hide model drift. See
 * `docs/eval-architecture.md` (honest model pinning).
 */
export function isDatedModel(model: string): boolean {
  return /\d{8}$/.test(model);
}

/**
 * Capability tier of a model by FAMILY: haiku=1 < sonnet=2 < opus=3 (version is
 * ignored, so `claude-sonnet-4-6` and a dated Sonnet rank equal). An unrecognized
 * family returns `null` — unrankable, so the floor never blocks a model we can't
 * judge (fail-open on ranking). Used by the model floor; aliases and full/dated
 * ids both work.
 */
export function modelTier(id: string): number | null {
  const s = id.toLowerCase();
  if (s.includes("haiku")) return 1;
  if (s.includes("sonnet")) return 2;
  if (s.includes("opus")) return 3;
  return null;
}

/**
 * Is `model` a weaker tier than `floor`? Both must be rankable (see
 * {@link modelTier}); an unrankable model/floor is never "below" (fail-open).
 */
export function belowModelFloor(model: string, floor: string): boolean {
  const m = modelTier(model);
  const f = modelTier(floor);
  return m !== null && f !== null && m < f;
}

/** Warn (once per run) that replaying/recording a cache on a floating alias hides drift. */
function warnFloatingModel(model: string): void {
  const msg =
    `vigiles: eval cache is on but the model "${model}" is a floating alias — ` +
    `a replay can serve a result computed against a since-changed model, hiding ` +
    `drift. Pin a dated id (e.g. ...-20251001) for honest replay.`;
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${msg}`);
  else console.warn(msg);
}

/**
 * Merge the fake-tool PreToolUse hook into an arm's resolved settings (appending
 * to any existing `PreToolUse` list). Returns the settings unchanged when there
 * are no fakes. The fake list itself rides the `VIGILES_FAKE_TOOLS` env, not the
 * settings — see {@link executeTrial}.
 */
function withFakeToolHook(
  settings: unknown,
  fakes: readonly FakeTool[],
): unknown {
  if (fakes.length === 0) return settings;
  const fake = buildFakeToolSettings(fakes, { command: FAKE_TOOL_HOOK_CMD });
  const base = isRecord(settings) ? settings : {};
  const baseHooks = isRecord(base.hooks) ? base.hooks : {};
  const basePre: unknown[] = Array.isArray(baseHooks.PreToolUse)
    ? (baseHooks.PreToolUse as unknown[])
    : [];
  return {
    ...base,
    hooks: {
      ...baseHooks,
      PreToolUse: [...basePre, ...fake.hooks.PreToolUse],
    },
  };
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
    const resolved = resolveHarness({
      plugin: arm.plugin,
      settings: arm.settings,
      files: { ...spec.fixture, ...arm.files },
    });
    const { files } = resolved;
    const fakes = arm.fakeTools ?? [];
    const settings = withFakeToolHook(resolved.settings, fakes);
    const env =
      fakes.length > 0
        ? { [FAKE_TOOLS_ENV]: serializeFakeTools(fakes) }
        : undefined;
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
        // A model comparison is a harness A/B: an arm may override the model.
        model: arm.model ?? cfg.model,
        tools: cfg.tools,
        hasSettings,
        pluginDir: arm.pluginDir,
        timeoutMs: cfg.timeoutMs,
        env,
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
  if (cfg.cache !== "off" && !isDatedModel(cfg.model)) {
    warnFloatingModel(cfg.model);
  }
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
  /**
   * Plugin dir installed natively (`--plugin-dir`) so its skills/commands
   * activate. Provide this OR {@link skillsDir}, not both.
   */
  readonly pluginDir?: string;
  /**
   * A directory of LOOSE skills (`<skillsDir>/<name>/SKILL.md`, e.g. a repo's
   * `.claude/skills`) to trigger-test directly. vigiles packages them into a
   * throwaway `--plugin-dir` for you and removes it afterward — the one-liner
   * for repo-local skills that aren't a published plugin. Provide this OR
   * {@link pluginDir}, not both.
   */
  readonly skillsDir?: string;
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
  /**
   * Co-install these skill sources ALONGSIDE the skill-under-test so it competes
   * for selection as it does in the real harness — the **whole-harness** tier.
   * Each entry is a plugin dir (`skills/` or `.claude/skills/`) or a loose skills
   * dir (`<name>/SKILL.md`); their skills are merged into one install under the
   * under-test plugin's name (the under-test skill wins a name collision, so its
   * `<name>:<skill>` id still matches `fired`).
   *
   * WHY: skill selection is competitive and Claude Code evicts the least-used
   * skill descriptions under a context budget, so an ISOLATED trigger-rate (the
   * default, `installSet` absent/empty) **overstates recall and understates
   * false-positives**. Isolated is the cheap authoring loop; populate the set for
   * a release gate. See `research/isolated-vs-whole-harness-eval.md`.
   */
  readonly installSet?: readonly string[];
  /**
   * Replace each skill's BODY with a no-op stub (keeping its frontmatter — name +
   * description) before running. Trigger-rate is decided by the frontmatter alone
   * (the model selects a skill before its body loads), so stubbing the body can't
   * change what's measured but stops the run from executing an expensive
   * procedure once the skill fires — far cheaper, faster, side-effect-free. All
   * skills' descriptions stay present, so the selection competition is faithful.
   * Default false (off) for now; recommended `true` for trigger evals. See
   * {@link stubSkillBody}.
   */
  readonly stubSkillBodies?: boolean;
  /**
   * Minimum number of prompts each set (relevant + irrelevant) must have. A
   * handful of prompts can't tell a real recall/precision rate from noise, so
   * the run is rejected before it spends a token. Default 10; lower it
   * deliberately for a genuinely narrow skill.
   */
  readonly minPrompts?: number;
  /**
   * Reject the run when two prompts in a set are closer than this in NCD
   * (gzip-based distance, 0..1; 0 = identical) — near-duplicate prompts inflate
   * a rate without testing varied phrasings. Default 0.3 (the rule-dup threshold).
   */
  readonly minDistance?: number;
  /** Trials per prompt. Default 1. */
  readonly trials?: number;
  /**
   * Model alias/id. Default `"sonnet"` — the realistic selector most Claude Code
   * users run. NOT haiku: trigger-rate is a *selection* measurement and haiku is a
   * much weaker selector, so it under-reports recall (dogfooded: a skill scored
   * 0.50 on haiku vs 0.90 on Sonnet). Override for a cheaper-but-pessimistic run.
   */
  readonly model?: string;
  /**
   * Minimum model tier this eval may run on (haiku<sonnet<opus by family). The
   * run **fails** if the resolved `model` is weaker — trigger-rate under-measures
   * selection on a too-weak model, so this stops a cheap model from producing
   * false-negative recall. Default `"sonnet"`; resolves from `minModel` →
   * `VIGILES_MIN_MODEL` env → `"sonnet"`, so a project sets one floor for ALL
   * skills (no per-file annotation). Lower it deliberately for a cheap run.
   */
  readonly minModel?: string;
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
  /**
   * Competitor skills co-installed via {@link TriggerRateSpec.installSet}. `0`
   * (the default) means the skill was measured **ISOLATED** — so `rate` is an
   * UPPER bound on real recall and `falsePositiveRate` a LOWER bound, because
   * selection is competitive (a populated harness can evict or out-compete the
   * description). A non-zero count is the whole-harness measurement.
   */
  readonly competitors: number;
}

/**
 * Package loose `<skillsDir>/<name>/SKILL.md` skills into a throwaway plugin dir
 * that `claude --plugin-dir` accepts — so repo-local skills (e.g. `.claude/skills`)
 * can be trigger-tested without hand-rolling a `plugin.json`. Writes a minimal
 * `.claude-plugin/plugin.json` and copies each `<name>/` (recursively, so
 * `references/` etc. come along) under `skills/<name>/`. Returns the temp plugin
 * dir; the caller removes it (`measureTriggerRate` does). Throws if the directory
 * is missing or holds no `<name>/SKILL.md`.
 */
export function packageSkillsDir(
  skillsDir: string,
  opts: { name?: string; stub?: boolean } = {},
): string {
  const abs = resolve(skillsDir);
  if (!existsSync(abs))
    throw new Error(`skillsDir not found: ${skillsDir} (resolved ${abs})`);
  const root = mkdtempSync(join(tmpdir(), "vigiles-skills-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify(
      { name: opts.name ?? "vigiles-loose-skills", version: "0.0.0" },
      null,
      2,
    ),
  );
  const skillsOut = join(root, "skills");
  mkdirSync(skillsOut, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcSkill = join(abs, entry.name, "SKILL.md");
    if (!existsSync(srcSkill)) continue;
    const destDir = join(skillsOut, entry.name);
    if (opts.stub) {
      // Frontmatter-only: keep the trigger surface (name + description), drop the
      // body so a selected skill stops instead of running its procedure.
      mkdirSync(destDir, { recursive: true });
      writeFileSync(
        join(destDir, "SKILL.md"),
        stubSkillBody(readFileSync(srcSkill, "utf-8")),
      );
    } else {
      cpSync(join(abs, entry.name), destDir, { recursive: true });
    }
    copied++;
  }
  if (copied === 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`No <name>/SKILL.md skills found under ${skillsDir}`);
  }
  return root;
}

/**
 * Rewrite a SKILL.md to keep its YAML frontmatter (the trigger surface — name +
 * description) but replace the body with a no-op stub. Trigger-rate is a property
 * of the frontmatter ONLY: the model picks a skill from its name + description
 * before the body is ever loaded, so the body is causally downstream of selection
 * and irrelevant to whether the skill fires. Stubbing it lets a trigger run stop
 * AT selection instead of executing an expensive multi-step procedure — cheaper,
 * faster, and side-effect-free, without changing what's measured. Pure.
 */
export function stubSkillBody(skillMd: string): string {
  const m = /^(---\n[\s\S]*?\n---\n)/.exec(skillMd);
  const frontmatter = m ? m[1] : "";
  return `${frontmatter}\nThis skill was selected (trigger-test stub). Acknowledge and stop — do not perform any actions.\n`;
}

/** The skills directory inside a plugin (`skills/` or `.claude/skills/`). */
function skillsDirOf(pluginDir: string): string {
  const direct = join(pluginDir, "skills");
  if (existsSync(direct)) return direct;
  return join(pluginDir, ".claude", "skills");
}

/** A plugin's declared name (from `.claude-plugin/plugin.json`), for the skill
 * id the `fired` predicate matches (`<name>:<skill>`). */
function pluginName(pluginDir: string): string | undefined {
  const manifest = join(pluginDir, ".claude-plugin", "plugin.json");
  try {
    return (JSON.parse(readFileSync(manifest, "utf-8")) as { name?: string })
      .name;
  } catch {
    return undefined;
  }
}

/**
 * Build a throwaway plugin dir mirroring `pluginDir`'s skills with their BODIES
 * stripped (frontmatter kept) — the trigger surface a description/firing check
 * needs, without paying to run each skill's procedure. Keeps the original plugin
 * NAME so `<name>:<skill>` ids still match. The caller removes the returned dir.
 * See {@link stubSkillBody} for why the body is irrelevant to selection.
 */
export function stubbedPluginDir(pluginDir: string): string {
  return packageSkillsDir(skillsDirOf(pluginDir), {
    stub: true,
    name: pluginName(pluginDir),
  });
}

// ---------------------------------------------------------------------------
// Prompt-set diversity (deterministic, pre-eval) — a trigger rate is only
// meaningful over ENOUGH and DIFFERENT prompts. Catch a too-small or
// near-duplicate set before spending a single model token. We measure
// "different" with Normalized Compression Distance (gzip) — the SAME engine
// `findSimilarRules` uses for near-duplicate rule detection — not edit
// distance: NCD scores shared structure/redundancy (a templated prompt with one
// word swapped compresses together), which is exactly the lazy-copy-paste set
// we want to reject, and it's the project's house algorithm for "are these two
// texts basically the same".
// ---------------------------------------------------------------------------

/** Normalize for comparison: lowercase, trim, collapse whitespace. */
function normalizePrompt(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Distance between two prompts in ~0..1 (0 = identical, higher = more
 * different) via Normalized Compression Distance over the normalized text.
 * Reuses {@link ncd} from the proof engine.
 */
export function promptDistance(a: string, b: string): number {
  return ncd(normalizePrompt(a), normalizePrompt(b));
}

export interface PromptDiversityIssue {
  readonly kind: "too-few" | "too-similar";
  readonly message: string;
}

/**
 * Deterministically check a prompt set is big and varied enough to measure a
 * trigger rate: at least `minPrompts` entries, and no two closer than
 * `minDistance` in NCD. Pure — no model. `label` names the set in messages.
 */
export function checkPromptDiversity(
  prompts: readonly string[],
  opts: { minPrompts?: number; minDistance?: number; label?: string } = {},
): PromptDiversityIssue[] {
  const minPrompts = opts.minPrompts ?? 10;
  const minDistance = opts.minDistance ?? 0.3;
  const label = opts.label ?? "prompts";
  const issues: PromptDiversityIssue[] = [];
  if (prompts.length < minPrompts) {
    issues.push({
      kind: "too-few",
      message: `${label}: ${String(prompts.length)} prompt(s), need at least ${String(minPrompts)} to measure a rate (set minPrompts to override).`,
    });
  }
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const dist = promptDistance(prompts[i], prompts[j]);
      if (dist < minDistance) {
        issues.push({
          kind: "too-similar",
          message: `${label}: prompts #${String(i + 1)} and #${String(j + 1)} are near-duplicates (NCD ${dist.toFixed(2)} < ${String(minDistance)}) — vary the phrasing:\n    - ${prompts[i]}\n    - ${prompts[j]}`,
        });
      }
    }
  }
  return issues;
}

/** Throw if a prompt set isn't big/varied enough. See {@link checkPromptDiversity}. */
export function assertPromptDiversity(
  prompts: readonly string[],
  opts: { minPrompts?: number; minDistance?: number; label?: string } = {},
): void {
  const issues = checkPromptDiversity(prompts, opts);
  if (issues.length > 0) {
    throw new Error(
      `Prompt set is not eval-ready:\n  ${issues.map((i) => i.message).join("\n  ")}`,
    );
  }
}

/**
 * Resolve the effective `--plugin-dir` for a trigger run: a caller's `pluginDir`
 * as-is, or a throwaway package built from a loose `skillsDir`. Exactly one must
 * be set. `packaged` is present only when vigiles built it, so the caller knows
 * to remove it afterward.
 */
/** The dir holding `<name>/SKILL.md` for a source that may be a plugin (`skills/`
 *  or `.claude/skills/`) or already a loose skills dir. */
function collectSkillsSource(dir: string): string {
  const abs = resolve(dir);
  const pluginSkills = join(abs, "skills");
  if (existsSync(pluginSkills)) return pluginSkills;
  const ccSkills = join(abs, ".claude", "skills");
  if (existsSync(ccSkills)) return ccSkills;
  return abs;
}

/**
 * Copy each `<name>/SKILL.md` skill from `src` into `skillsOut` (stubbing the body
 * when asked); skip a skill whose name is already `present` so the under-test
 * skill wins a collision. Returns how many were newly copied.
 */
function copySkillsInto(
  src: string,
  skillsOut: string,
  stub: boolean,
  present: Set<string>,
): number {
  const abs = resolve(src);
  if (!existsSync(abs))
    throw new Error(`installSet source not found: ${src} (resolved ${abs})`);
  let copied = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory() || present.has(entry.name)) continue;
    const srcSkill = join(abs, entry.name, "SKILL.md");
    if (!existsSync(srcSkill)) continue;
    const destDir = join(skillsOut, entry.name);
    if (stub) {
      mkdirSync(destDir, { recursive: true });
      writeFileSync(
        join(destDir, "SKILL.md"),
        stubSkillBody(readFileSync(srcSkill, "utf-8")),
      );
    } else {
      cpSync(join(abs, entry.name), destDir, { recursive: true });
    }
    present.add(entry.name);
    copied++;
  }
  return copied;
}

/**
 * Build a combined plugin: the under-test skills PLUS every `installSet` source's
 * skills, so the skill-under-test competes for selection as in the real harness.
 * Named after the under-test plugin so `<name>:<skill>` ids still match; the
 * under-test skills win a name collision. Returns the dir + `added` = how many
 * installSet skills were merged in (excludes collisions). The report's
 * `competitors` is derived separately from the FULL pool (see `countSkills`), so
 * sibling skills already in the under-test source count too. Caller removes the
 * dir. Pure (filesystem only).
 */
export function packageInstallSet(opts: {
  underTestSrc: string;
  name: string;
  installSet: readonly string[];
  stub: boolean;
}): { dir: string; added: number } {
  const root = mkdtempSync(join(tmpdir(), "vigiles-harness-"));
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: opts.name, version: "0.0.0" }, null, 2),
    );
    const skillsOut = join(root, "skills");
    mkdirSync(skillsOut, { recursive: true });
    const present = new Set<string>();
    const underTest = copySkillsInto(
      opts.underTestSrc,
      skillsOut,
      opts.stub,
      present,
    );
    if (underTest === 0)
      throw new Error(
        `No <name>/SKILL.md skills under the skill-under-test source ${opts.underTestSrc}`,
      );
    let added = 0;
    for (const src of opts.installSet)
      added += copySkillsInto(
        collectSkillsSource(src),
        skillsOut,
        opts.stub,
        present,
      );
    return { dir: root, added };
  } catch (e) {
    rmSync(root, { recursive: true, force: true }); // don't leak the temp dir
    throw e;
  }
}

/** The under-test skills source + plugin name (the namespace `fired` matches). */
function underTestSource(spec: TriggerRateSpec): { src: string; name: string } {
  if (spec.skillsDir)
    return { src: spec.skillsDir, name: "vigiles-loose-skills" };
  if (spec.pluginDir)
    return {
      src: skillsDirOf(spec.pluginDir),
      name: pluginName(spec.pluginDir) ?? "vigiles-loose-skills",
    };
  throw new Error("measureTriggerRate: provide `pluginDir` or `skillsDir`.");
}

/** Number of `<name>/SKILL.md` skills installed in a plugin — the selection pool. */
function countSkills(pluginDir: string): number {
  const dir = skillsDirOf(pluginDir);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true }))
    if (e.isDirectory() && existsSync(join(dir, e.name, "SKILL.md"))) n++;
  return n;
}

function resolveTriggerPluginDir(spec: TriggerRateSpec): {
  pluginDir: string;
  packaged?: string;
  competitors: number;
} {
  if (spec.pluginDir && spec.skillsDir)
    throw new Error(
      "measureTriggerRate: set `pluginDir` OR `skillsDir`, not both.",
    );
  const stub = spec.stubSkillBodies ?? false;
  const installSet = spec.installSet ?? [];
  let pluginDir: string;
  let packaged: string | undefined;
  if (installSet.length > 0) {
    // Whole-harness tier: merge the under-test skills with the install set so
    // selection is competitive (the realistic, differentiated measurement).
    const { src, name } = underTestSource(spec);
    ({ dir: pluginDir } = packageInstallSet({
      underTestSrc: src,
      name,
      installSet,
      stub,
    }));
    packaged = pluginDir;
  } else if (spec.skillsDir) {
    packaged = packageSkillsDir(spec.skillsDir, { stub });
    pluginDir = packaged;
  } else if (spec.pluginDir) {
    // Stub a real plugin: build a minimal plugin from its skills/ with bodies
    // stripped — keep the original plugin NAME so `<name>:<skill>` still matches.
    packaged = stub ? stubbedPluginDir(spec.pluginDir) : undefined;
    pluginDir = packaged ?? spec.pluginDir;
  } else {
    throw new Error("measureTriggerRate: provide `pluginDir` or `skillsDir`.");
  }
  // `competitors` is the REAL selection pressure: every OTHER skill installed in
  // the resolved plugin (siblings already in the source + any installSet), not
  // just the installSet delta — so a multi-skill plugin is never mislabeled
  // "isolated". `max(0, …)` guards a 0-skill pool.
  return {
    pluginDir,
    packaged,
    competitors: Math.max(0, countSkills(pluginDir) - 1),
  };
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
  // Deterministic gate FIRST — reject a too-small / near-duplicate prompt set
  // before spending a token (and before packaging a skillsDir).
  const diversity = {
    minPrompts: spec.minPrompts,
    minDistance: spec.minDistance,
  };
  assertPromptDiversity(spec.prompts, { ...diversity, label: "prompts" });
  if (spec.irrelevantPrompts && spec.irrelevantPrompts.length > 0) {
    assertPromptDiversity(spec.irrelevantPrompts, {
      ...diversity,
      label: "irrelevantPrompts",
    });
  }

  // Model floor (default Sonnet): trigger-rate under-measures selection on a
  // weaker model, so FAIL before spending a token rather than report a
  // false-negative recall. One project-wide knob (VIGILES_MIN_MODEL) covers every
  // skill; lower `minModel` deliberately for a cheap run. Catches the env-var case
  // a static lint can't see.
  const model = spec.model ?? "sonnet";
  const minModel = spec.minModel ?? process.env.VIGILES_MIN_MODEL ?? "sonnet";
  if (belowModelFloor(model, minModel))
    throw new Error(
      `measureTriggerRate: model "${model}" is below the minimum "${minModel}" — ` +
        "trigger-rate under-measures selection on a weaker model (raise the model, " +
        "or lower `minModel` / VIGILES_MIN_MODEL for a deliberately cheap run).",
    );

  const { pluginDir, packaged, competitors } = resolveTriggerPluginDir(spec);
  const cfg: TriggerRunConfig = {
    trials: spec.trials ?? 1,
    // Sonnet, not haiku: trigger-rate is a selection measurement and haiku
    // under-selects, producing false-negative recall (see TriggerRateSpec.model).
    model,
    tools: spec.allowedTools ?? ["Read", "Edit", "Write", "Bash", "Skill"],
    timeoutMs: spec.timeoutMs ?? 240000,
    spacing: (spec.spacingSec ?? 4) * 1000,
    pluginDir,
    fired: spec.fired,
  };

  try {
    const relevant = await runTriggerSet(spec.prompts, cfg, runner);
    const base: TriggerRateReport = {
      rate: relevant.n > 0 ? relevant.fired / relevant.n : 0,
      n: relevant.n,
      perPrompt: relevant.perPrompt,
      competitors,
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
  } finally {
    // Remove the throwaway plugin dir we built from a loose `skillsDir`.
    if (packaged) rmSync(packaged, { recursive: true, force: true });
  }
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
  // Honest labelling: an isolated run measures the skill alone, with no competing
  // skills to evict or out-compete its description — so recall is an UPPER bound
  // and false-positive a LOWER bound. Say so, or point at the whole-harness count.
  lines.push(
    report.competitors > 0
      ? `whole-harness: measured against ${String(report.competitors)} competing skill(s)`
      : "isolated: no competing skills — recall is an upper bound, false-positive a lower bound (populate `installSet` for a release-gate measurement)",
  );
  return lines.join("\n");
}
