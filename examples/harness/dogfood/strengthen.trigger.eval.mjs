/**
 * Dogfood — does vigiles's OWN `strengthen` skill trigger (and only then)?
 *
 * `strengthen` became model-invocable so the agent reaches for it on its own
 * (upgrade guidance() → enforce()). This eval is the guard that the sharpened
 * description FIRES on "strengthen my rules" requests (recall) and stays QUIET
 * on ordinary linting/coding work (precision) — the precision-aware axis the
 * AWS skill-eval taught us. Pairs with the free load gate in
 * src/adapters/claude-code/skills-dogfood.test.ts.
 *
 *   npx vigiles eval examples/harness/dogfood/strengthen.trigger.eval.mjs
 *
 * Real model → real cost. Needs the `claude` CLI + model auth + a built dist/.
 * Write-don't-run in a keyless env; this is the artifact that runs where a key is.
 */
import {
  measureTriggerRate,
  formatTriggerRateReport,
} from "../../../dist/eval.js";
import {
  skillResolved,
  assertTriggerRate,
} from "../../../dist/harness-assert.js";
import { fileURLToPath } from "node:url";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 1);

const pluginDir = fileURLToPath(new URL("../../../", import.meta.url));
const skill = "vigiles:strengthen";

const report = await measureTriggerRate({
  pluginDir,
  // SHOULD fire — requests to harden/strengthen vigiles rules:
  prompts: [
    "Strengthen the rules in my CLAUDE.md — upgrade the guidance ones where a linter rule exists.",
    "Can you make my vigiles guidance() rules enforceable by finding matching linter rules?",
    "Harden my spec: which guidance rules could become enforce()?",
  ],
  // should NOT fire — ordinary linting/coding the skill must not hijack:
  irrelevantPrompts: [
    "Fix the ESLint errors in src/app.ts.",
    "Rename the variable `foo` to `bar` in utils.ts.",
    "Add a dark-mode toggle to the settings page.",
  ],
  fired: (t) => skillResolved(t, skill),
  trials,
});

console.log(formatTriggerRateReport(report));
if (report.n === 0) throw new Error("no runs executed");

assertTriggerRate(report, { min: 0.6, maxFalsePositive: 0.34 });
console.log(`\n✓ ${skill}: recall + precision within bounds.`);
