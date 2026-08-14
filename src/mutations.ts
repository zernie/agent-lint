/**
 * `runMutations` — prove a test can FAIL, by breaking the thing it watches.
 *
 * A green test says the checker passed. It does not say the test would notice if the check were
 * deleted: an assertion can be vacuous, a fixture can be wrong in the same direction as the code,
 * and both look exactly like a pass. The only way to tell is to plant a defect and require the
 * test to go red — with the message that NAMES that defect, not merely with something red.
 *
 * ## Why this is in vigiles rather than in a repo's own scripts
 *
 * It arrived as ten hand-written copies of one driver in a dogfooding repo (1799 lines), and the
 * copies had DRIFTED. Counted against the committed versions on 2026-08-14:
 *
 *   - the NO-OP guard (a replacement equal to the original leaves a green test proving nothing)
 *     was in 4 of 10;
 *   - the RETRY (a non-kill re-run once before it is believed) was in 1 of 10;
 *   - the strict rule — killed by its OWN named assertion, not merely by something going red —
 *     was in 1 of 10.
 *
 * Every one of those was written AFTER it caught something, in whichever copy happened to catch
 * it, and never travelled to the other nine. Two copies also named a test file that a refactor had
 * deleted; the runner they used exits 0 on a path matching nothing, so those cases reported
 * SURVIVED on every run for three days. That is the argument for one engine: not less code, but
 * one place where each of those becomes impossible again.
 *
 * ## What this is NOT
 *
 * Not Stryker/mutmut/PIT. Those GENERATE mutants from operators (flip a `<`, drop a `return`) over
 * production code and score a suite by kill ratio. Here the mutations are HAND-AUTHORED and each
 * one names the assertion that must catch it, because the subject is usually not general-purpose
 * code — it is a checker, a hook, an instruction file — where "flip an operator" produces mostly
 * unreachable nonsense and a kill ratio measures nothing. The generated-operator approach is the
 * better tool when it applies; reach for it there.
 *
 * ## The contract, in one sentence
 *
 * Plant one defect, run the test that owns it, and require the test to fail with the message that
 * names it — anything else is reported as a finding, never as a pass.
 *
 * @module
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

import {
  detectNodeCaps,
  interpreterArgs,
} from "./adapters/claude-code/run-scripts.js";

/** One edit: the file, the exact substring to find, and what replaces it. */
export type MutationEdit = readonly [
  file: string,
  find: string,
  replace: string,
];

/** One planted defect and the assertion that must catch it. */
export interface MutationCase {
  /** Short id, printed in the report. */
  readonly name: string;
  /** What the mutation takes away, in words — the column a reader scans. */
  readonly disables: string;
  /**
   * The edits that plant it. A LIST, because some defects are only expressible as more than one:
   * removing a guard AND the vocabulary check that would otherwise throw for an unrelated reason.
   * Every edit must match its `find` EXACTLY ONCE, or the case is reported `not-applied`.
   */
  readonly edits: readonly MutationEdit[];
  /** The test file that must go red. Its absence is refused, loudly, before anything is touched. */
  readonly test: string;
  /** A substring the test's complaint must contain, so a kill by a NEIGHBOUR is not counted. */
  readonly expect: string;
}

/**
 * - `killed` — the test went red AND printed `expect`. The only outcome that counts as proof.
 * - `wrong-assertion` — red, but not with this case's message: two defects share one assertion and
 *   neither is really watched.
 * - `survived` — the test stayed green. The assertion is vacuous, or absent.
 * - `unjudgeable` — the test was ALREADY red before the run, and `expect` never printed, so "red"
 *   carries no information about this mutation. Not a pass and not a failure of the assertion.
 * - `not-applied` — the edit did not land: `find` matched zero or several times, or the
 *   replacement equalled the original.
 */
export type MutationVerdict =
  | "killed"
  | "wrong-assertion"
  | "survived"
  | "unjudgeable"
  | "not-applied";

/** What one case did. */
export interface MutationOutcome {
  readonly name: string;
  readonly disables: string;
  readonly verdict: MutationVerdict;
  /** Human-readable specifics — which file, how many matches, whether a retry was needed. */
  readonly detail: string;
}

/** What a whole run did. */
export interface MutationReport {
  readonly outcomes: readonly MutationOutcome[];
  /** Cases with verdict `killed`. */
  readonly killed: number;
  /** Test files that were red BEFORE any mutation, so they can testify about nothing. */
  readonly alreadyRed: readonly string[];
  /**
   * Whether every test that was green before the run is green again after it. `false` means the
   * restore failed and the working tree is not what it was — the one outcome worth interrupting for.
   */
  readonly restored: boolean;
}

export interface RunMutationsOptions {
  /** Working directory for the test runs; every path in `edits` and `test` is absolute. */
  readonly cwd: string;
  readonly cases: readonly MutationCase[];
  /**
   * Extra environment for each test run, merged over `process.env`.
   * Use it to hand the test the same variables its normal runner would.
   */
  readonly env?: NodeJS.ProcessEnv;
}

interface RunResult {
  readonly failed: boolean;
  readonly out: string;
}

function runTest(file: string, o: RunMutationsOptions): RunResult {
  const argv = interpreterArgs(file, detectNodeCaps(o.cwd));
  const r = spawnSync("node", argv, {
    cwd: o.cwd,
    encoding: "utf8",
    env: { ...process.env, ...o.env },
  });
  return { failed: r.status !== 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

/**
 * Plant each case's defect, run the test that owns it, restore, and report what happened.
 *
 * ```ts
 * const report = runMutations({
 *   cwd: repoRoot,
 *   cases: [{
 *     name: "year",
 *     disables: "the year comparison",
 *     edits: [[checker, "rec.year !== ourYear", "false"]],
 *     test: harness,
 *     expect: "a wrong year was not reported",
 *   }],
 * });
 * console.log(formatMutationReport(report));
 * process.exit(report.killed === report.outcomes.length && report.restored ? 0 : 1);
 * ```
 *
 * 🔴 THIS REWRITES THE FILES NAMED IN `edits` AND RESTORES THEM. The restore runs in a `finally`
 * AND on SIGINT/SIGTERM, because a run killed midway would otherwise leave a neutered checker on
 * disk — and the next run would then measure an already-broken repo and call it healthy. Commit
 * before running. (Do not reach for `git stash` to clear the tree: the stash is repository-global,
 * so a second agent working in another worktree of the same repo will pop your entries.)
 *
 * @throws if `cases` is empty, or if any named test file does not exist — both BEFORE any file is
 * touched, so the message arrives with a clean working tree.
 */
export function runMutations(o: RunMutationsOptions): MutationReport {
  if (o.cases.length === 0) {
    throw new Error(
      "runMutations: no cases. A mutation run with nothing to run reports success, which is the exact claim this API exists to make impossible.",
    );
  }

  const tests = [...new Set(o.cases.map((c) => c.test))];
  // A test path that resolves to nothing is the defect that hid for three days in the corpus this
  // came from: the runner exits 0 on "no files matched", so every case naming it reported SURVIVED
  // and sent the reader hunting for an assertion that was never reached.
  const missing = tests.filter((t) => !existsSync(t));
  if (missing.length > 0) {
    throw new Error(
      `runMutations: test file(s) do not exist, so no case naming them could ever be judged:\n  ${missing.join("\n  ")}`,
    );
  }

  // Baselined BEFORE anything is touched. Without this, a test that is red on purpose (an open
  // finding it is meant to report) makes every run announce "the restore failed" about a working
  // restore, and makes every case against it look killed.
  const alreadyRed = tests.filter((t) => runTest(t, o).failed);
  const redBefore = new Set(alreadyRed);

  const targets = [...new Set(o.cases.flatMap((c) => c.edits.map(([f]) => f)))];
  const originals = new Map(targets.map((f) => [f, readFileSync(f, "utf8")]));
  const restore = (): void => {
    for (const [f, text] of originals) writeFileSync(f, text);
  };
  const onSignal = (sig: NodeJS.Signals): never => {
    restore();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const outcomes: MutationOutcome[] = [];
  try {
    for (const c of o.cases) {
      const applied = apply(c);
      if (applied) {
        outcomes.push({
          name: c.name,
          disables: c.disables,
          verdict: "not-applied",
          detail: applied,
        });
        restore();
        continue;
      }

      // A non-kill is retried ONCE before it is believed. Observed on a real corpus: a row killed
      // as named came back as a neighbour's assertion in a later full run and reproduced as a clean
      // kill when replayed alone. Reporting a flake as a survivor sends the next reader to rewrite
      // a working assertion, which is worse than one extra run.
      let judged = judge(c, o, redBefore);
      if (judged.verdict !== "killed") {
        const second = judge(c, o, redBefore);
        if (second.verdict === "killed")
          judged = {
            verdict: "killed",
            detail: "killed on retry (the first run was a flake)",
          };
        else judged = second;
      }
      outcomes.push({ name: c.name, disables: c.disables, ...judged });
      restore();
    }
  } finally {
    restore();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  // Only a test that was GREEN before can testify about the restore.
  const restored = tests
    .filter((t) => !redBefore.has(t))
    .every((t) => !runTest(t, o).failed);

  return {
    outcomes,
    killed: outcomes.filter((r) => r.verdict === "killed").length,
    alreadyRed,
    restored,
  };
}

/** Plants one case's edits. Returns a reason string when it could not be planted, else null. */
function apply(c: MutationCase): string | null {
  for (const [file, find, replace] of c.edits) {
    const src = readFileSync(file, "utf8");
    const n = src.split(find).length - 1;
    if (n !== 1) {
      return n === 0
        ? `"find" matched nothing in ${basename(file)} — the source moved under the case`
        : `"find" matched ${String(n)} times in ${basename(file)}; an edit must be unambiguous`;
    }
    const next = src.replace(find, replace);
    // The mutation-that-does-not-mutate, caught against the BYTES rather than the intent: a
    // replacement equal to the original leaves a green test that reads exactly like a kill.
    if (next === src)
      return `the replacement equals the original in ${basename(file)}`;
    writeFileSync(file, next);
  }
  return null;
}

function judge(
  c: MutationCase,
  o: RunMutationsOptions,
  redBefore: ReadonlySet<string>,
): { verdict: MutationVerdict; detail: string } {
  const { failed, out } = runTest(c.test, o);
  if (!failed)
    return {
      verdict: "survived",
      detail: `${basename(c.test)} stayed green with the defect planted`,
    };
  if (out.includes(c.expect))
    return { verdict: "killed", detail: `named by "${c.expect}"` };
  // When the test was ALREADY red, "red" carries no information — but the MESSAGE still does,
  // because a runner that aborts at the first failure never reaches a later assertion. Absent it,
  // the two causes are indistinguishable, and calling it a wrong assertion would be a guess.
  return redBefore.has(c.test)
    ? {
        verdict: "unjudgeable",
        detail: `${basename(c.test)} was red before the run and "${c.expect}" never printed`,
      }
    : {
        verdict: "wrong-assertion",
        detail: `red, but "${c.expect}" never printed — a neighbour's assertion caught it`,
      };
}

/** Render a report the way the CLI-style runners in this package render theirs. */
export function formatMutationReport(report: MutationReport): string {
  const lines: string[] = [];
  if (report.alreadyRed.length > 0) {
    lines.push(
      `ℹ️  already red before any mutation: ${report.alreadyRed.map((t) => basename(t)).join(", ")} — excluded from the restore check; a case naming one is reported unjudgeable.`,
      "",
    );
  }
  const width = Math.max(...report.outcomes.map((r) => r.name.length));
  const mark: Record<MutationVerdict, string> = {
    killed: "✓ killed",
    "wrong-assertion": "🔴 wrong assertion",
    survived: "🔴 SURVIVED",
    unjudgeable: "🔴 unjudgeable",
    "not-applied": "🔴 not applied",
  };
  for (const r of report.outcomes) {
    lines.push(
      `${r.name.padEnd(width)}  ${mark[r.verdict].padEnd(20)} ${r.disables}`,
    );
    if (r.verdict !== "killed")
      lines.push(`${" ".repeat(width + 2)}  ${r.detail}`);
  }
  lines.push("");
  lines.push(
    report.restored
      ? "restored: every test that was green before the run is green again"
      : "🔴 RESTORE FAILED — a test that was green before the run is red now. The working tree is not what it was.",
  );
  const bad = report.outcomes.length - report.killed;
  lines.push(
    bad === 0
      ? `✓ all ${String(report.outcomes.length)} mutations killed, each at its own assertion`
      : `🔴 ${String(bad)} of ${String(report.outcomes.length)} not killed as named: ${report.outcomes
          .filter((r) => r.verdict !== "killed")
          .map((r) => r.name)
          .join(", ")}`,
  );
  return lines.join("\n");
}
