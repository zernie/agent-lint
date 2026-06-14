/**
 * Dogfood — does vigiles's OWN `generate-logo` skill trigger (and only then)?
 *
 * The second of the two model-invocable vigiles skills (the other is
 * `test-harness`). `generate-logo` is narrow on purpose — it should fire ONLY on
 * a request about the vigiles logo, and a narrow skill's risk is the opposite of
 * a broad one: high precision, but watch recall doesn't collapse. The
 * precision-aware `measureTriggerRate` checks both. The 7 `disable-model-invocation`
 * skills don't auto-trigger and are covered by the free load gate
 * (`src/skills-dogfood.test.ts`).
 *
 *   npx vigiles eval examples/harness/dogfood/generate-logo.trigger.eval.mjs
 *
 * Real model → real cost. Needs the `claude` CLI + model auth + a built dist/.
 * Write-don't-run in a keyless env; runs where a key is.
 */
import {
  measureTriggerRate,
  formatTriggerRateReport,
} from "../../../dist/adapters/claude-code/eval.js";
import {
  skillResolved,
  assertTriggerRate,
} from "../../../dist/harness-assert.js";
import { fileURLToPath } from "node:url";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 1);

const pluginDir = fileURLToPath(new URL("../../../", import.meta.url));
const skill = "vigiles:generate-logo";

const report = await measureTriggerRate({
  pluginDir,
  // SHOULD fire — logo requests, varied phrasings:
  prompts: [
    "Regenerate the vigiles logo with a darker palette.",
    "Make a new logo for vigiles.",
    "Iterate on our project logo — try a flatter style.",
  ],
  // should NOT fire — nearby creative/asset work that is NOT the vigiles logo:
  irrelevantPrompts: [
    "Generate a favicon for my blog.",
    "Write the README hero section.",
    "Add an SVG icon to the toolbar.",
  ],
  fired: (t) => skillResolved(t, skill),
  trials,
});

console.log(formatTriggerRateReport(report));
if (report.n === 0) throw new Error("no runs executed");

// A narrow skill: precision should be high; keep recall honest too.
assertTriggerRate(report, { min: 0.5, maxFalsePositive: 0.34 });
console.log(`\n✓ ${skill}: recall + precision within bounds.`);
