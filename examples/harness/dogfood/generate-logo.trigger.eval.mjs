/**
 * Dogfood — does vigiles's OWN `generate-logo` skill trigger (and only then)?
 *
 * `generate-logo` is an INTERNAL, contributor-only dev skill (it lives under
 * `dev/skills/`, not the shipped consumer plugin), but it stays a useful narrow
 * model-invocable dogfood: it should fire ONLY on a request about the vigiles
 * logo, and a narrow skill's risk is the opposite of a broad one — high
 * precision, but watch recall doesn't collapse. The precision-aware
 * `measureTriggerRate` checks both. The shipped user-invoked skills don't
 * auto-trigger and are covered by the free load gate (`src/skills-dogfood.test.ts`).
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

// generate-logo is an INTERNAL dev skill (not in the shipped plugin), so load it
// from the contributor-only `dev/` plugin, not the repo root.
const pluginDir = fileURLToPath(new URL("../../../dev/", import.meta.url));
const skill = "vigiles-dev:generate-logo";

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
