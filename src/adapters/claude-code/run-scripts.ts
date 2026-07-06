/**
 * vigiles — run harness-test / eval script files via the CLI.
 *
 * `vigiles test` and `vigiles eval` discover `*.harness.*` / `*.eval.*`
 * scripts and run each as a child `node` process, so the two-tier
 * harness-testing API (`src/harness-test.ts`, `src/eval.ts`) works as a CI
 * command, not just `node x.mjs`. Scripts may be authored in **JavaScript**
 * (`.mjs` / `.cjs` / `.js`) **or TypeScript** (`.ts` / `.mts` / `.cts`) — a TS
 * script is run through `tsx` when installed, else Node's built-in type
 * stripping (Node >= 22.6). The scripts import from the built `dist/`, so they
 * also run standalone — the CLI just discovers, runs, and aggregates exit codes.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { globSync } from "glob";

export type ScriptStatus = "pass" | "skip" | "fail";

export interface ScriptRunResult {
  readonly file: string;
  readonly code: number;
  readonly status: ScriptStatus;
}

/**
 * Exit code a harness/eval script uses to report itself SKIPPED (e.g. the
 * deterministic tier when `claude` isn't installed) — the autotools convention.
 * The runner surfaces it as a loud `⊘ SKIPPED` instead of a silent `✓`, and a
 * skip never fails the run. Scripts call `skip()` (vigiles/testing) to emit it.
 */
export const SKIP_EXIT_CODE = 77;

function statusForCode(code: number): ScriptStatus {
  if (code === 0) return "pass";
  if (code === SKIP_EXIT_CODE) return "skip";
  return "fail";
}

/** Filename extensions accepted for harness/eval scripts (JS and TS). */
export const SCRIPT_EXTS = ["mjs", "cjs", "js", "mts", "cts", "ts"] as const;

/** Glob suffix matching every accepted script extension, e.g. `harness`. */
export function scriptGlob(kind: "harness" | "eval"): string {
  return `**/*.${kind}.{${SCRIPT_EXTS.join(",")}}`;
}

const TS_EXT = /\.(?:m|c)?ts$/;

/** Node runtime capabilities that decide how a TypeScript script is run. */
export interface NodeCaps {
  /** `tsx` is installed locally (the preferred, version-agnostic TS loader). */
  readonly tsx: boolean;
  /** Node supports `--experimental-strip-types` (>= 22.6). */
  readonly stripTypes: boolean;
}

/**
 * The `node` argv (after the binary) to run a single script. Plain JS runs
 * directly; a TypeScript script picks `tsx` when available, else Node's native
 * type stripping. Throws a clear, actionable error when neither is available.
 * Pure — exported for testing.
 */
export function interpreterArgs(file: string, caps: NodeCaps): string[] {
  if (!TS_EXT.test(file)) return [file];
  if (caps.tsx) return ["--import", "tsx", file];
  if (caps.stripTypes) return ["--experimental-strip-types", file];
  throw new Error(
    `Cannot run TypeScript test script "${file}": install tsx ` +
      `(npm i -D tsx) or use Node >= 22.6, or author it as a .mjs file.`,
  );
}

/** Detect TS-running capabilities for a project root. */
export function detectNodeCaps(cwd: string): NodeCaps {
  const tsx =
    existsSync(resolve(cwd, "node_modules/tsx/package.json")) ||
    existsSync(resolve(cwd, "node_modules/.bin/tsx"));
  const stripTypes = process.allowedNodeEnvironmentFlags.has(
    "--experimental-strip-types",
  );
  return { tsx, stripTypes };
}

/**
 * Expand the given path/glob patterns into concrete script files. A pattern
 * that is an existing file passes through unchanged; anything else is treated
 * as a glob. Falls back to `defaultGlob` when no patterns are given. Results
 * are deduped and sorted; `node_modules` and `dist` are always ignored.
 */
export function discoverScripts(
  patterns: readonly string[],
  defaultGlob: string,
  cwd: string,
): string[] {
  const globs = patterns.length > 0 ? patterns : [defaultGlob];
  const found = new Set<string>();
  for (const p of globs) {
    if (existsSync(resolve(cwd, p))) {
      found.add(p);
      continue;
    }
    for (const m of globSync(p, {
      cwd,
      ignore: ["node_modules/**", "dist/**"],
    })) {
      found.add(m);
    }
  }
  return [...found].sort();
}

/**
 * Run each script as `node <file>`, inheriting stdio so the script's own report
 * streams to the console. `env` is merged over `process.env` for every child
 * (e.g. `VIGILES_TRIALS`). Returns the per-file exit codes.
 */
export function runScripts(
  files: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): ScriptRunResult[] {
  const caps = detectNodeCaps(cwd);
  const results: ScriptRunResult[] = [];
  for (const file of files) {
    let argv: string[];
    try {
      argv = interpreterArgs(file, caps);
    } catch (e) {
      console.error(`✗ ${file}: ${(e as Error).message}`);
      results.push({ file, code: 1, status: "fail" });
      continue;
    }
    const res = spawnSync("node", argv, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    const code = res.status ?? 1;
    results.push({ file, code, status: statusForCode(code) });
  }
  return results;
}

/** Whether any script FAILED (a skip is not a failure). */
export function anyFailed(results: readonly ScriptRunResult[]): boolean {
  return results.some((r) => r.status === "fail");
}

/**
 * What a `test`/`eval` invocation should do about actually RUNNING the discovered
 * scripts:
 * - `run`     — proceed.
 * - `confirm` — interactive human, no explicit intent: ask before firing `count`.
 * - `refuse`  — headless, no explicit intent: don't silently fire the whole tree.
 */
export type RunScriptsDecision =
  | { readonly kind: "run" }
  | { readonly kind: "confirm"; readonly count: number }
  | { readonly kind: "refuse"; readonly count: number };

export interface RunScriptsEnv {
  /** `test` is free/deterministic → always runs. `eval` spends model quota. */
  readonly kind: "test" | "eval";
  /** The user named explicit target files/globs (positional args) — clear intent. */
  readonly explicitTargets: boolean;
  /** How many script files the discovery matched. */
  readonly matchedCount: number;
  /** A human at a terminal who can answer + wait. */
  readonly isTTY: boolean;
  /** `--all` — opt in to running the whole discovered set without a prompt. */
  readonly all: boolean;
  /** `--yes` / `--no-interactive` — agent/CI mode: never prompt. */
  readonly yes: boolean;
}

/**
 * Consent gate for a bare (no-target) `vigiles eval`. `eval` runs the REAL model
 * on your subscription, and a no-target run discovers every `*.eval.*` over the
 * whole tree — so a repo with many evals fires them all and spends quota. Mirrors
 * `audit`'s read-vs-run consent (`decideExecute`): a paid, side-effecting verb
 * never fans out over an unbounded glob without either an explicit target, an
 * `--all` opt-in, or an interactive yes. `test` is free + deterministic, so it
 * always runs. Total + pure, first match wins; the IO (prompt/refuse) lives in the
 * CLI.
 */
export function decideRunScripts(o: RunScriptsEnv): RunScriptsDecision {
  if (o.kind === "test") return { kind: "run" };
  if (o.explicitTargets) return { kind: "run" };
  if (o.all || o.yes) return { kind: "run" };
  // A bounded no-target run (0 = no-op, 1 = a single obviously-intended eval) is
  // not the footgun; the footgun is fanning out over the whole tree.
  if (o.matchedCount <= 1) return { kind: "run" };
  if (!o.isTTY) return { kind: "refuse", count: o.matchedCount };
  return { kind: "confirm", count: o.matchedCount };
}

const MARK: Record<ScriptStatus, string> = {
  pass: "✓",
  skip: "⊘",
  fail: "✗",
};

/** One line per file + an explicit pass/skip/fail tally. Skips are SHOWN, never
 * folded into "passed" — a `⊘ SKIPPED` is loud, not a silent green. */
export function formatScriptSummary(
  results: readonly ScriptRunResult[],
): string {
  const lines = results.map((r) => {
    if (r.status === "skip") return `  ⊘ ${r.file} — SKIPPED`;
    if (r.status === "fail") return `  ✗ ${r.file} (exit ${String(r.code)})`;
    return `  ${MARK.pass} ${r.file}`;
  });
  const n = (s: ScriptStatus): number =>
    results.filter((r) => r.status === s).length;
  const parts = [`${String(n("pass"))} passed`];
  if (n("skip") > 0) parts.push(`${String(n("skip"))} skipped`);
  if (n("fail") > 0) parts.push(`${String(n("fail"))} failed`);
  lines.push(`\n${parts.join(", ")}.`);
  return lines.join("\n");
}
