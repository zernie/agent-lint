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

/** Context handed to `measure` after a run, to compute that run's metrics. */
export interface RunContext {
  readonly cwd: string;
  readonly exitCode: number;
  readonly stdout: string;
  /** `num_turns` reported by claude, or 0. */
  readonly turns: number;
  /** Contents of a file under the working dir, or null if absent. */
  file(path: string): string | null;
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

interface RunOut {
  code: number;
  stdout: string;
}

function spawnAgent(
  task: string,
  cwd: string,
  model: string,
  tools: readonly string[],
  hasSettings: boolean,
  pluginDir: string | undefined,
  timeoutMs: number,
): Promise<RunOut> {
  return new Promise((resolvePromise) => {
    const args = [
      "-p",
      task,
      "--output-format",
      "json",
      "--model",
      model,
      "--permission-mode",
      "acceptEdits",
      ...(pluginDir !== undefined ? ["--plugin-dir", resolve(pluginDir)] : []),
      ...(hasSettings ? ["--settings", "settings.json"] : []),
      "--allowedTools",
      ...tools,
    ];
    const child = spawn("claude", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 0, stdout });
    });
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function makeContext(cwd: string, out: RunOut): RunContext {
  let turns = 0;
  try {
    turns = (JSON.parse(out.stdout) as { num_turns?: number }).num_turns ?? 0;
  } catch {
    /* non-JSON output */
  }
  return {
    cwd,
    exitCode: out.code,
    stdout: out.stdout,
    turns,
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
    out[k] = { mean, std, se: n > 0 ? std / Math.sqrt(n) : 0, n };
  }
  return out;
}

/**
 * Run the eval: every arm × every trial against the real `claude` CLI, with the
 * metric computed per run and aggregated per arm. Requires `claude` on PATH and
 * working model auth (e.g. `ANTHROPIC_API_KEY`).
 */
export async function runEval<M extends Metrics>(
  spec: EvalSpec<M>,
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
        const out = await spawnAgent(
          spec.task,
          cwd,
          model,
          tools,
          hasSettings,
          arm.pluginDir,
          timeoutMs,
        );
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

/** Format an eval report as a compact table for the console (mean ± se). */
export function formatEvalReport(report: EvalReport): string {
  const lines = [`${report.name} (${String(report.trials)} trials/arm)`];
  for (const [arm, r] of Object.entries(report.arms)) {
    const parts = Object.entries(r.metrics)
      .map(([k, v]) => {
        const se = r.stats[k]?.se ?? 0;
        return se > 0
          ? `${k}=${v.toFixed(2)}±${se.toFixed(2)}`
          : `${k}=${v.toFixed(2)}`;
      })
      .join("  ");
    lines.push(`  ${arm.padEnd(10)} ${parts}`);
  }
  return lines.join("\n");
}
