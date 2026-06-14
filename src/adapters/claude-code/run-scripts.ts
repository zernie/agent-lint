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

export interface ScriptRunResult {
  readonly file: string;
  readonly code: number;
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
      results.push({ file, code: 1 });
      continue;
    }
    const res = spawnSync("node", argv, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    results.push({ file, code: res.status ?? 1 });
  }
  return results;
}

/** Format a one-line-per-file run summary with a pass/fail tally. */
export function formatScriptSummary(
  results: readonly ScriptRunResult[],
): string {
  const lines = results.map(
    (r) =>
      `  ${r.code === 0 ? "✓" : "✗"} ${r.file}` +
      (r.code === 0 ? "" : ` (exit ${String(r.code)})`),
  );
  const failed = results.filter((r) => r.code !== 0).length;
  lines.push(
    failed === 0
      ? `\n${String(results.length)} passed.`
      : `\n${String(failed)}/${String(results.length)} failed.`,
  );
  return lines.join("\n");
}
