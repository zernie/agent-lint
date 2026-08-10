/**
 * Dogfood — the FIELD-MISS trigger set for `test-harness`.
 *
 * Companion to `test-harness.trigger.eval.mjs`. That eval measures the prompts we
 * *imagined* while authoring the description, and scores recall 0.90 on Sonnet.
 * This one measures the prompts that ACTUALLY MISSED in live work.
 *
 * Provenance (2026-08-10, dogfooding vigiles from a sibling repo): an agent with
 * the vigiles plugin available reinvented four things the library already ships —
 * `parseToolCalls`, `snapshotTree`/`diffTrees`, `interceptTools`, and the whole
 * effect-boundary tier. The four prompts below are those four moments, restated
 * as the question the agent was actually holding at the time.
 *
 * The hypothesis this measures: the description enumerates SURFACES
 * ("a hook fires or blocks", "a skill triggers", "injected context lands") but
 * never names the OBSERVATION VOCABULARY — tool boundaries, side effects,
 * interception. So a user who asks about the observation, not the surface, misses.
 *
 * Two matched sets isolate that from a language confound: the misses happened in
 * Russian, but the description is English. If RU and EN score the same, the gap is
 * conceptual (a description fix); if RU scores much lower, it is cross-lingual
 * selection (a different fix entirely).
 *
 *   npx vigiles eval examples/harness/dogfood/test-harness.gaps.trigger.eval.mjs
 *   node examples/harness/dogfood/test-harness.gaps.trigger.eval.mjs 2
 *
 * Real model → real cost. Needs the `claude` CLI + model auth + a built dist/.
 *
 * NOTE ON THE GATE: `minPrompts` is lowered to 4 deliberately. Four prompts cannot
 * separate a rate from noise — this set is not a rate, it is four NAMED CASES we
 * already know occurred. Read it as pass/fail per case, not as a recall estimate.
 */
// vigiles:covers skills/test-harness
import {
  measureTriggerRate,
  formatTriggerRateReport,
} from "../../../dist/eval.js";
import { skillResolved } from "../../../dist/harness-assert.js";
import { fileURLToPath } from "node:url";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 1);

const pluginDir = fileURLToPath(new URL("../../../", import.meta.url));
const skill = "vigiles:test-harness";

/** The four live misses, in the language they were asked in. */
const RU = [
  "как проверить, что скилл не вышел за свои инструменты",
  "как наблюдать побочные эффекты скилла",
  "как перехватить вызов, не дав ему исполниться",
  "как протестировать скилл",
];

/** The same four questions in English — isolates concept-gap from language. */
const EN = [
  "how do I check that a skill did not go outside the tools it declared",
  "how can I observe the side effects a skill produces",
  "how do I intercept a tool call without letting it actually execute",
  "how do I test a skill",
];

const sets = [
  ["RU (as actually asked)", RU],
  ["EN (same questions)", EN],
];

const results = [];
for (const [label, prompts] of sets) {
  const report = await measureTriggerRate({
    pluginDir,
    stubSkillBodies: true,
    minPrompts: 4, // deliberate: named cases, not a rate (see header)
    prompts,
    fired: (t) => skillResolved(t, skill),
    trials,
  });
  console.log(`\n===== ${label} =====`);
  console.log(formatTriggerRateReport(report));
  results.push([label, report]);
}

console.log("\n===== per-prompt verdict =====");
for (const [label, report] of results) {
  console.log(`\n${label}`);
  for (const p of report.perPrompt ?? [])
    console.log(
      `  ${p.rate > 0 ? "FIRED " : "MISSED"}  ${String(p.rate)}  ${p.prompt}`,
    );
}
