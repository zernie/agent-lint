/**
 * Dogfood — does vigiles's OWN `test-harness` skill trigger (and only then)?
 *
 * We eat our own dog food: point `measureTriggerRate` at the vigiles plugin
 * itself and check the `test-harness` skill's description on the precision-aware
 * axis the AWS skill-eval taught us — it should FIRE on harness-testing requests
 * (recall) and stay QUIET on unrelated coding work (precision). The
 * model-invocable shipped skills (`test-harness`, `strengthen`, `edit-spec`)
 * each get a trigger eval; the user-invoked ones (`migrate-to-spec`,
 * `linter-docs`) can't auto-fire, so triggering doesn't apply — see
 * `src/adapters/claude-code/skills-dogfood.test.ts` for the (free) load gate
 * that covers every shipped skill.
 *
 *   npx vigiles eval examples/harness/dogfood/test-harness.trigger.eval.mjs
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

// The vigiles plugin root (the dir that holds .claude-plugin/), installed
// natively so its skills activate by description the real way.
const pluginDir = fileURLToPath(new URL("../../../", import.meta.url));
const skill = "vigiles:test-harness";

const report = await measureTriggerRate({
  pluginDir,
  // SHOULD fire — harness-testing requests in varied phrasings:
  prompts: [
    "Write a test that my PreToolUse hook blocks `git commit --no-verify`.",
    "Does my SessionStart hook actually inject context into the model? Add a test.",
    "Check that my skill triggers across different prompts.",
  ],
  // should NOT fire — ordinary coding work the skill must not hijack:
  irrelevantPrompts: [
    "Rename the variable `foo` to `bar` in utils.ts.",
    "Add a dark-mode toggle to the settings page.",
    "Why is this regex throwing? Fix it.",
  ],
  fired: (t) => skillResolved(t, skill),
  trials,
});

console.log(formatTriggerRateReport(report));
if (report.n === 0) throw new Error("no runs executed");

// The dogfood bar: fire most of the time on real harness work, rarely on noise.
// Recall (min) AND precision (maxFalsePositive) — the AWS skill-eval lesson.
assertTriggerRate(report, { min: 0.6, maxFalsePositive: 0.34 });
console.log(`\n✓ ${skill}: recall + precision within bounds.`);
