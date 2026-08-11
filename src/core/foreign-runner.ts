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
 * Pure: a string in, a name or null out. No process access, no filesystem.
 */

/** Path fragments that identify a runner owning the process. POSIX-normalised. */
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
  ["node --test", ["node_modules/.bin/node--test"]],
];

/**
 * The foreign test runner that started this process, or `null`.
 *
 * `argv1` is `process.argv[1]` — passed in rather than read, so the decision is a
 * pure function the tests can drive with the paths measured from real runs.
 */
export function foreignRunner(argv1: string | undefined): string | null {
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
