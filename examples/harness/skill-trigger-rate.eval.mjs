/**
 * Canonical example — a skill *trigger-rate* eval (`measureTriggerRate`).
 *
 * A skill's value is its description firing on the right task — the #1 documented
 * skill-authoring pain. Wiring (does the Skill tool resolve it) is the
 * deterministic tier's job; whether the *real model chooses* the skill across
 * varied phrasings is a property only the model can answer. `measureTriggerRate`
 * installs a plugin natively (`pluginDir`), runs a set of prompts, and reports
 * how reliably your `fired` predicate holds.
 *
 *   npx vigiles eval examples/harness/skill-trigger-rate.eval.mjs
 *   node examples/harness/skill-trigger-rate.eval.mjs 2     # trials per prompt
 *
 * Real model → real cost. Needs the `claude` CLI + model auth and a built dist/.
 * External users import from the package: `from "vigiles/eval"`.
 */
import {
  measureTriggerRate,
  formatTriggerRateReport,
} from "../../dist/eval.js";
import { skillResolved } from "../../dist/harness-assert.js";
import { fileURLToPath } from "node:url";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 1);

// A real, pinned vendored plugin (no clone at test time). Its TDD skill should
// activate when a task is about writing/changing code with tests.
const pluginDir = fileURLToPath(
  new URL("./vendor/superpowers@6fd4507", import.meta.url),
);
const skill = "superpowers:test-driven-development";

const report = await measureTriggerRate({
  pluginDir,
  prompts: [
    "Add an `isEven(n)` function to utils.js — write it test-first.",
    "Implement a stack class in stack.js. Use TDD.",
    "Fix the off-by-one in paginate(); add a regression test first.",
  ],
  // reuse a bare predicate: did the model activate the skill (no error)?
  fired: (t) => skillResolved(t, skill),
  trials,
});

console.log(formatTriggerRateReport(report));

// A trigger-rate eval is a measurement, not a hard gate by default — but you can
// gate in CI with assertTriggerRate(report, { min: 0.6 }) from vigiles/harness-assert.
if (report.n === 0) {
  throw new Error("no runs executed");
}
console.log(`\n✓ measured ${report.n} run(s).`);
