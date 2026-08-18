/**
 * The paid tier is closed while an eval file is being LOADED.
 *
 * ## The failure this removes
 *
 * An eval file used to do its work at the top level:
 *
 *   const report = await measureTriggerRate({ … });   // ← module body
 *
 * In ESM, `import` IS execution, so *reading* such a file spends real money.
 * Measured 2026-08-12 (and reproduced 2026-08-18 with an inert stand-in that
 * writes a marker file instead of spawning): `node -e 'import("./x.eval.mjs")'`
 * ran the whole body and the one guard that exists — `refuseUnderForeignRunner`
 * — stayed SILENT, because under `node -e` there is no `process.argv[1]` at all:
 *
 *   node -e 'import(x)'   argv[1] = undefined  → foreignRunner(…) = null
 *
 * That guard is not broken; it answers a different question ("does somebody
 * else's test runner own this process?"). No process fact distinguishes
 * `node -e 'import(x)'` from a legitimate runner doing `import(x)`, so no
 * argv-shaped guard can close this door without also refusing the correct
 * invocation — the exact failure mode that got `process.env.VITEST` rejected in
 * `foreign-runner.ts`.
 *
 * ## What closes it instead
 *
 * The SHAPE changed: an eval file now DESCRIBES its eval (`defineEval`) and
 * `vigiles eval` runs it. A description cannot spend, so for a conforming file
 * the door is shut by construction and this module is not needed.
 *
 * This module covers the file that is only HALF migrated — a `defineEval` export
 * plus a leftover top-level `measure(…)`. During the import that the eval runner
 * performs, the paid tier refuses. So the usual way anyone runs an eval turns a
 * silent bill into a loud error that names the fix, instead of paying it.
 *
 * ⚠️ HONEST BOUNDARY, stated rather than implied. This is scoped to the runner's
 * own import. `node -e 'import("./half-migrated.eval.mjs")'` still spends,
 * because that file still contains the original defect — the redesign made the
 * defect *avoidable and detectable*, it cannot retroactively fix a file that did
 * not adopt it. The free syntax check is `node --check <file>`, which never
 * executes anything.
 *
 * ## Why the default is OPEN
 *
 * `paid_runEval` and friends are public API; somebody's own script calling them
 * at top level is their business. A gate that defaulted to closed would refuse
 * every correct direct call — again, "a guard that fires on correct input is a
 * guard people delete". So the window is opened by nobody and closed by exactly
 * one caller: `eval-entry.ts`, around its `import()`.
 *
 * Imports NOTHING, so every spawn door (including the adapters) can call it
 * without a cycle — the same reason `foreign-runner.ts` is a leaf.
 */

/** Whether an eval module is being imported by the eval runner right now. */
let loading = false;

/**
 * Open the no-spend window. Called by `eval-entry.ts` immediately before it
 * imports an eval file, and paired with {@link endEvalLoad} in a `finally`.
 */
export function beginEvalLoad(): void {
  loading = true;
}

/** Close the no-spend window: the description is loaded, the runner may spend. */
export function endEvalLoad(): void {
  loading = false;
}

/** Whether the no-spend window is open (exported for tests + the entry). */
export function inEvalLoad(): boolean {
  return loading;
}

/**
 * The refusal message. Separate from the check so a test can assert the WORDS:
 * this fires on a file whose author has not seen the new shape yet, so it has to
 * teach it, not just stop.
 */
export function evalLoadRefusal(what: string): string {
  return (
    `vigiles refused to spawn a model: ${what} while an eval file was being IMPORTED.\n` +
    `  An eval file DESCRIBES its eval; it must not run one at the top level — importing such a\n` +
    `  file spends real money (that is the defect this shape removes).\n` +
    `  Move the runner call into the description, keyed by the runner's own name:\n` +
    `      import { defineEval } from "vigiles";\n` +
    `      export default defineEval({ measureTriggerRate: { …the spec you passed… } });\n` +
    `  and read the report in \`assert(report)\`. See docs/harness-testing.md § Eval files.`
  );
}

/**
 * Refuse to spend model budget while an eval file is being imported.
 *
 * 🔴 CALL THIS AT EVERY REAL-MODEL SPAWN, beside `refuseUnderForeignRunner`, and
 * OUTSIDE any `try` that swallows — `judge` and `deriveAttackReal` both wrap
 * their spawn in `try { … } catch { return fallback }`, so a refusal thrown
 * inside would be downgraded to a score of 0 instead of stopping the run.
 */
export function refuseDuringEvalLoad(what: string): void {
  if (loading) throw new Error(evalLoadRefusal(what));
}
