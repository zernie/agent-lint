/**
 * vigiles — run harness-test / eval script files via the CLI.
 *
 * `vigiles test` and `vigiles eval` discover `*.harness.mjs` / `*.eval.mjs`
 * scripts and run each as a child `node` process, so the two-tier
 * harness-testing API (`src/harness-test.ts`, `src/eval.ts`) works as a CI
 * command, not just `node x.mjs`. The scripts stay plain Node modules (they
 * import from the built `dist/`), so they also run standalone — the CLI just
 * discovers, runs, and aggregates exit codes.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { globSync } from "glob";

export interface ScriptRunResult {
  readonly file: string;
  readonly code: number;
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
  const results: ScriptRunResult[] = [];
  for (const file of files) {
    const res = spawnSync("node", [file], {
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
