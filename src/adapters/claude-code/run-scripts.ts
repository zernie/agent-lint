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
import { resolve, join } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { globSync } from "glob";
import {
  CHECK_COUNT_ENV,
  parseCheckReport,
  type SurfaceProbe,
} from "../../check-count.js";

/**
 * The outcome of running one script.
 *
 * `"vacuous"` — the script exited 0 and reported that it made ZERO checks. It
 * neither passed nor failed: nothing was verified. See {@link statusFor}.
 */
export type ScriptStatus = "pass" | "skip" | "fail" | "vacuous";

export interface ScriptRunResult {
  readonly file: string;
  readonly code: number;
  readonly status: ScriptStatus;
  /**
   * How many checks the script reported making, or `undefined` when it reported
   * nothing at all — a script that never imports `vigiles/testing` has no way to
   * report, and that silence is NOT a claim about it. `0` is a claim: the script
   * loaded the library and used none of it.
   */
  readonly checks?: number;
  /**
   * The surfaces this script was seen to exercise — derived by the tiers from the
   * command they ran and the transcripts they got back, never declared by the
   * author (see `coverage-probe.ts`). Feeds `.vigiles/coverage.json`, which lets
   * coverage answer "tested?" by EXECUTION instead of by file name.
   *
   * Absent for a script that reported nothing, and empty for one that reported a
   * count but exercised no identifiable surface — a unit test of a pure helper,
   * say. Neither is a finding.
   */
  readonly surfaces?: readonly SurfaceProbe[];
}

/**
 * Exit code a harness/eval script uses to report itself SKIPPED (e.g. the
 * deterministic tier when `claude` isn't installed) — the autotools convention.
 * The runner surfaces it as a loud `⊘ SKIPPED` instead of a silent `✓`, and a
 * skip never fails the run. Scripts call `skip()` (vigiles/testing) to emit it.
 */
export const SKIP_EXIT_CODE = 77;

/**
 * Classify one script's run from its exit code and its reported check count.
 *
 * 🔴 THE FOURTH STATE, AND WHY. Exit codes answer "did it fail?", never "did it
 * do anything?". Measured 2026-08-08: a file whose whole body is
 * `export default { "never runs": () => assert.equal(1, 2) }` imports fine,
 * exits 0, and printed `✓ … 1 passed` — a false assertion, never called,
 * reported as a pass. A consumer repo hit exactly that and now hand-copies a
 * warning into every new harness header, because the runner could not enforce
 * it: eight harnesses resting on a comment.
 *
 * So a run that ends clean having recorded ZERO checks is `"vacuous"` — its own
 * visible state, not folded into `passed`, the same way a skip is not.
 *
 * NOT A FAILURE, deliberately. Harnesses in the wild predate the counter, and a
 * tool that turned CI red on the release that taught it a new word would be
 * punishing people for upgrading. It is loud and it is not fatal.
 *
 * AND SILENCE IS NOT ZERO. `checks === undefined` means the script never
 * reported — it may not import `vigiles/testing` at all — so it stays a plain
 * `pass`, exactly as before. Only a script that loaded the library and used
 * none of it says zero. This is the `undefined`-vs-`[]` distinction
 * `assertNoWrite` already draws: "nobody looked" must not read as "nothing
 * happened".
 */
export function statusFor(
  code: number,
  checks: number | undefined,
): ScriptStatus {
  if (code === SKIP_EXIT_CODE) return "skip";
  if (code !== 0) return "fail";
  return checks === 0 ? "vacuous" : "pass";
}

/** Filename extensions accepted for harness/eval scripts (JS and TS). */
export const SCRIPT_EXTS = ["mjs", "cjs", "js", "mts", "cts", "ts"] as const;

/** Glob suffix matching every accepted script extension, e.g. `harness`. */
export function scriptGlob(kind: "harness" | "eval"): string {
  return `**/*.${kind}.{${SCRIPT_EXTS.join(",")}}`;
}

const TS_EXT = /\.(?:m|c)?ts$/;

// The capability probe lives in `src/ts-runner-caps.ts` so the SUGGESTER
// (`testFileExt`, harness-agnostic) can ask the same question this runner
// answers. It used to recommend `.ts` from a `tsconfig.json` alone, on a Node 20
// box with no `tsx` — a file `interpreterArgs` then refused to run. Re-exported
// here so every existing importer of `run-scripts.js` is unchanged.
export {
  detectNodeCaps,
  canRunTypeScript,
  type NodeCaps,
} from "../../ts-runner-caps.js";
import { detectNodeCaps } from "../../ts-runner-caps.js";
import type { NodeCaps } from "../../ts-runner-caps.js";

/**
 * The `node` argv (after the binary) to run a single script. Plain JS runs
 * directly; a TypeScript script picks `tsx` when available, else Node's native
 * type stripping. Throws a clear, actionable error when neither is available.
 * Pure — exported for testing.
 *
 * 🔴 The disjunction below is `canRunTypeScript` — keep them together. When they
 * drifted, the tool recommended a `.ts` file and then refused to run it.
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
    // 🔴 `dot: true`, because the harness for a Claude Code harness lives in `.claude/`.
    // Without it, `vigiles test` and `vigiles eval` print "no files found" in a repository
    // that has them, and `Tested` then measures visibility rather than coverage — the author
    // reads "you have no tests" when the honest reading is "I looked in the wrong place".
    // Observed 2026-08-07 on a repo with two harnesses under `.claude/`, both invisible; it
    // stayed hidden because that repo's CI happened to pass explicit paths.
    //
    // This codebase already fixed the same defect elsewhere and missed it here:
    // `test-coverage.ts` and `cli.ts` both pass `dot: true` with comments saying why, and
    // `test-coverage.test.ts` records "glob without `dot:true` never found it and the surface
    // looked untested". Coverage learned it; the runner did not.
    for (const m of globSync(p, {
      cwd,
      ignore: ["node_modules/**", "dist/**"],
      dot: true,
    })) {
      found.add(m);
    }
  }
  return [...found].sort();
}

/**
 * What a script left behind, or `undefined` if it left nothing (it never
 * imported `vigiles/testing`, or died before its exit handler). The parse itself
 * lives beside the writer in `check-count.ts` so the two cannot drift; anything
 * malformed is treated as no report — a corrupt scratch file must not invent a
 * verdict.
 */
function readCheckReport(
  path: string,
): { checks: number; surfaces: readonly SurfaceProbe[] } | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return parseCheckReport(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Run each script as `node <file>`, inheriting stdio so the script's own report
 * streams to the console. `env` is merged over `process.env` for every child
 * (e.g. `VIGILES_TRIALS`). Returns the per-file exit codes + check counts.
 *
 * Each child is handed its OWN scratch path in `VIGILES_CHECK_COUNT_ENV`, which
 * `vigiles/testing` writes its check count to on exit — the channel that makes
 * "ran nothing" distinguishable from "ran and passed" (see check-count.ts). It
 * has to be a file: stdio is inherited so the script's report streams live,
 * which leaves no stream to parse.
 *
 * The same channel carries WHICH SURFACES the script exercised, so the caller can
 * record them (`.vigiles/coverage.json`) and coverage can answer "tested?" from
 * execution rather than from a matching file name.
 */
export function runScripts(
  files: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): ScriptRunResult[] {
  const caps = detectNodeCaps(cwd);
  const results: ScriptRunResult[] = [];
  const countDir = mkdtempSync(join(tmpdir(), "vigiles-checks-"));
  try {
    files.forEach((file, i) => {
      let argv: string[];
      try {
        argv = interpreterArgs(file, caps);
      } catch (e) {
        console.error(`✗ ${file}: ${(e as Error).message}`);
        results.push({ file, code: 1, status: "fail" });
        return;
      }
      const countFile = join(countDir, `${String(i)}.count`);
      const res = spawnSync("node", argv, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...env, [CHECK_COUNT_ENV]: countFile },
      });
      const code = res.status ?? 1;
      const report = readCheckReport(countFile);
      results.push({
        file,
        code,
        status: statusFor(code, report?.checks),
        checks: report?.checks,
        ...(report ? { surfaces: report.surfaces } : {}),
      });
    });
  } finally {
    rmSync(countDir, { recursive: true, force: true });
  }
  return results;
}

/**
 * Whether any script FAILED. Neither a skip nor a vacuous run counts: the first
 * declined to run, the second ran and verified nothing, and neither is evidence
 * that anything is broken. Both are visible in the summary instead.
 */
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
  vacuous: "∅",
};

/** One line per file + an explicit pass/skip/vacuous/fail tally. Skips and
 * vacuous runs are SHOWN, never folded into "passed" — a `⊘ SKIPPED` is loud,
 * not a silent green, and so is a file that verified nothing. */
export function formatScriptSummary(
  results: readonly ScriptRunResult[],
): string {
  const lines = results.map((r) => {
    if (r.status === "skip") return `  ⊘ ${r.file} — SKIPPED`;
    if (r.status === "fail") return `  ✗ ${r.file} (exit ${String(r.code)})`;
    if (r.status === "vacuous") {
      return `  ${MARK.vacuous} ${r.file} — 0 CHECKS (it ran clean and verified nothing)`;
    }
    return `  ${MARK.pass} ${r.file}`;
  });
  const n = (s: ScriptStatus): number =>
    results.filter((r) => r.status === s).length;
  const parts = [`${String(n("pass"))} passed`];
  if (n("skip") > 0) parts.push(`${String(n("skip"))} skipped`);
  if (n("vacuous") > 0) parts.push(`${String(n("vacuous"))} with 0 checks`);
  if (n("fail") > 0) parts.push(`${String(n("fail"))} failed`);
  lines.push(`\n${parts.join(", ")}.`);
  // Name the remedy where it's read, once — the usual cause is a file that
  // DEFINES tests and never calls them, and the usual second cause is a harness
  // asserting some other way, which the runner cannot see.
  if (n("vacuous") > 0) {
    lines.push(
      `  ∅ = the file loaded vigiles/testing and used none of it. Either nothing ran ` +
        `(an exported test object nobody calls), or it asserts another way — in which ` +
        `case call recordCheck() from vigiles/testing so those count.`,
    );
  }
  return lines.join("\n");
}
