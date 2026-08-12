/**
 * Refuse to spend model calls when somebody else's test runner owns this process.
 *
 * ## The failure this removes
 *
 * A vigiles eval spawns `claude` and spends real money. It is meant to run on a
 * schedule, from `vigiles eval`. But an author who names one `foo.test.mjs` — a
 * name vigiles used to CREDIT as coverage — hands it to every default `npx vitest`
 * / `npx jest` run in the repository, because that name matches their default
 * patterns exactly (read out of the installed packages):
 *
 *   vitest  ** /*.{test,spec}.?(c|m)[jt]s?(x)
 *   jest    ** /?(*.)+(spec|test).?([mc])[jt]s?(x)
 *           ** /__tests__/** /*.?([mc])[jt]s?(x)   ← everything in that directory
 *
 * Measured 2026-08-11: a bare project with `.claude/skills/foo/foo.test.mjs` and a
 * plain `npx vitest run` — it executed. "It lives under a dot-directory, nothing
 * else will find it" is false. The bill arrives silently, on every push, in CI.
 *
 * The naming half is fixed elsewhere (those globs no longer count). This is the
 * part that does not depend on anybody obeying a convention: the money cannot be
 * spent from inside a foreign runner, whatever the file is called.
 *
 * ## Why not an environment variable
 *
 * The obvious version is `process.env.VITEST`. It was proposed and rejected: that
 * variable can sit in a `.env` or in a CI environment for unrelated reasons, and
 * then a legitimate scheduled eval refuses to run — a guard that fires on correct
 * input is a guard people delete.
 *
 * `process.argv[1]` is the path node was actually started with, which no stray
 * configuration can forge. Measured, same spike:
 *
 *   under `npx vitest run`   → …/node_modules/vitest/dist/workers/forks.js
 *   under `node foo.eval.mjs`→ …/foo.eval.mjs
 *   under `vigiles eval`     → the script vigiles spawned
 *
 * So the check is a POSITIVE identification of a known runner, not "am I the entry
 * point". Positive is the conservative direction here: an unrecognised wrapper
 * runs (and may cost money) rather than a legitimate run being blocked by a
 * pattern nobody predicted.
 *
 * ## 🔴 `node --test` HAS NO argv SIGNAL AT ALL, and the line that claimed one
 * was dead from the day it was written
 *
 * `["node --test", ["node_modules/.bin/node--test"]]` used to sit in the table
 * below. It was added by analogy with the npx-installed runners and never
 * measured. There is no such binary: Node's test runner is a FLAG on node
 * itself, so nothing under `node_modules/.bin/` can appear in `argv[1]`, and the
 * entry could not fire under any invocation. That is worse than its absence — it
 * READ as coverage while the paid tier stayed reachable from a legacy harness
 * named `*.test.mjs`, a name Node's own default patterns collect.
 *
 * Measured 2026-08-12 (Node 22.22, a fixture printing its own process facts):
 *
 *   node --test foo.test.mjs
 *     argv[1]           = /abs/foo.test.mjs   ← the TEST FILE, no runner in sight
 *     execArgv          = []                  ← the flag is not here either
 *     NODE_TEST_CONTEXT = child-v8            ← the only signal
 *
 *   node --test --experimental-test-isolation=none foo.test.mjs
 *     argv[1]           = foo.test.mjs
 *     execArgv          = ["--test", "--experimental-test-isolation=none"]
 *     NODE_TEST_CONTEXT = undefined           ← in-process: no child, no var
 *
 * The two modes therefore need two different facts, and both are read here.
 *
 * ⚠️ THIS IS NOT THE `process.env.VITEST` IDIOM REJECTED ABOVE, and the
 * difference is the reason it is allowed. `VITEST` is a USER-VISIBLE CONVENTION:
 * a person can put it in a `.env` or a CI job for unrelated reasons, so a guard
 * reading it fires on correct input. `NODE_TEST_CONTEXT` is set by NODE ITSELF in
 * the child it spawns — the internal protocol between runner and test process,
 * which nobody writes into their own environment. Same for `execArgv`: the flag
 * list node was launched with (`--test` is explicitly refused inside
 * `NODE_OPTIONS` — verified — so it cannot arrive from a stray env either). Do
 * not "fix" this back into an argv fragment: for `node --test` an argv signal
 * does not exist, so the choice is these facts or no detection at all.
 *
 * Pure: facts in, a name or null out. No process access, no filesystem.
 */

/** Path fragments that identify a runner owning the process. POSIX-normalised.
 *  Every fragment was MEASURED from a real run of that runner — see the tests. */
const RUNNERS: readonly (readonly [string, readonly string[]])[] = [
  ["vitest", ["node_modules/vitest/", "node_modules/.bin/vitest"]],
  [
    "jest",
    [
      "node_modules/jest/",
      "node_modules/jest-cli/",
      "node_modules/jest-worker/",
      "node_modules/.bin/jest",
    ],
  ],
  ["mocha", ["node_modules/mocha/", "node_modules/.bin/mocha"]],
  ["ava", ["node_modules/ava/", "node_modules/.bin/ava"]],
];

/** The name reported for Node's built-in runner — also the command to blame. */
const NODE_TEST = "node --test";

/**
 * The process facts identifying Node's own test runner, which leaves no trace in
 * `argv[1]`. Passed in rather than read, so the decision stays pure.
 */
export interface NodeTestFacts {
  /** `process.execArgv` — carries `--test` when the runner is IN-PROCESS. */
  readonly execArgv?: readonly string[];
  /** `process.env.NODE_TEST_CONTEXT` — node sets it in the test CHILD it spawns. */
  readonly nodeTestContext?: string | undefined;
}

/**
 * The foreign test runner that started this process, or `null`.
 *
 * `argv1` is `process.argv[1]`; `node` carries the two facts that identify Node's
 * built-in runner (see the header). Both are passed in rather than read, so the
 * decision is a pure function the tests drive with values measured from real runs.
 */
export function foreignRunner(
  argv1: string | undefined,
  node: NodeTestFacts = {},
): string | null {
  // `--test` EXACTLY: `--test-only` / `--test-name-pattern` are ordinary flags a
  // plain `node foo.eval.mjs` may carry, and a prefix match would refuse it.
  if (
    (node.nodeTestContext ?? "") !== "" ||
    (node.execArgv ?? []).includes("--test")
  )
    return NODE_TEST;
  if (!argv1) return null;
  const p = argv1.replaceAll("\\", "/");
  for (const [name, fragments] of RUNNERS)
    if (fragments.some((f) => p.includes(f))) return name;
  return null;
}

/**
 * The refusal message. Separate from the check so a test can assert the WORDS —
 * a guard that stops a run without saying what to do instead is a support ticket.
 */
export function foreignRunnerRefusal(runner: string, what: string): string {
  return (
    `vigiles refused to spawn a model: this process is running under ${runner}.\n` +
    `  ${what} spends real model calls, and a general test runner picking it up ` +
    `would spend them on every push.\n` +
    `  If this file is a vigiles eval, run it with \`vigiles eval\` (or \`node <file>\`) ` +
    `and name it \`<surface>.eval.mjs\` — that name is outside ${runner}'s default patterns.\n` +
    `  If ${runner} is meant to run it, it must not call the real-model tier.`
  );
}
