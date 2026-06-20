/**
 * A/B — does applying OUR SPEC to a subagent actually help? (run on your sub)
 *
 * The measurement-authority experiment: take ONE code-reviewer subagent and run
 * the SAME review task two ways, changing only whether vigiles's typed contract
 * is applied. A controlled A/B (the review instruction is identical in both arms;
 * only the contract differs):
 *
 *   - arm `prose` — the reviewer WITHOUT a vigiles spec: a plain prose subagent
 *     that ends with a free-text summary (./reviewer-ab/prose/).
 *   - arm `spec`  — the SAME reviewer WITH our spec: a `result()` typed outcome
 *     (ends with a vigiles:ok/err block) + side-effect separation
 *     (`purity:"pure"` + disallowedTools) (./reviewer-ab/spec/, compiled from a
 *     .spec.ts).
 *
 * The claim being tested: the typed contract makes the outcome DETERMINISTICALLY
 * PARSEABLE (assertAgentOk, no LLM judge) at NO quality cost. So we read three
 * per-arm rates:
 *   1. `subagentRan` — the reviewer dispatched + read the file (both arms; proves
 *      the A/B is fair — the only difference is the contract, not whether it runs).
 *   2. `foundBug`    — it caught the planted defect (QUALITY — must stay ~equal;
 *      if `spec` < `prose` the contract HURT, and that's the finding).
 *   3. `typedOutcome`— the final turn carries a vigiles:ok/err block (only `spec`
 *      can pass — this is the payoff the contract BUYS: a free deterministic test
 *      instead of a model judge).
 *
 * Reading it: spec WINS iff foundBug(spec) ≈ foundBug(prose) AND typedOutcome(spec)
 * ≫ typedOutcome(prose). If foundBug drops on `spec`, the contract is net-negative
 * — exactly the kind of honest result this layer exists to surface.
 *
 *   npx vigiles eval examples/harness/dogfood/reviewer-ab.eval.mjs
 *   VIGILES_TRIALS=5 node examples/harness/dogfood/reviewer-ab.eval.mjs
 *
 * Real model → real cost. Needs the `claude` CLI + model auth + a built dist/.
 * FINDING (2026-06-20, sonnet): the hard part is getting the lead agent to actually
 * DELEGATE — with a soft task it reviews inline (0% dispatch) and the A/B can't see
 * the contract. The task now forces delegation. When the subagent DOES run, only the
 * `spec` arm emits a parseable vigiles:ok/err block (the payoff); the planted bug is
 * caught in both (quality holds). Re-run with VIGILES_TRIALS>=3 for the p-values.
 */
import { measureArms, formatCheckReport, compareCheck } from "../../../dist/eval.js";
import { subagent, tool, output } from "../../../dist/check.js";
import { fileURLToPath } from "node:url";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 3);
const dir = (p) => fileURLToPath(new URL(p, import.meta.url));

const report = await measureArms({
  // A planted, unambiguous defect: `add` subtracts.
  fixture: {
    "app.js":
      "function add(a, b) { return a - b; } // should add\nmodule.exports = { add };\n",
  },
  task:
    "You have a `code-reviewer` subagent. DELEGATE the review of app.js to it " +
    "via the Task tool — do NOT read or review the file yourself. Then report " +
    "exactly what the subagent returned.",
  model: "sonnet",
  trials,
  arms: {
    prose: { pluginDir: dir("./reviewer-ab/prose") },
    spec: { pluginDir: dir("./reviewer-ab/spec") },
  },
  checks: [
    // (1) the subagent actually ran + read the file — fair-A/B guard.
    subagent("code-reviewer", [tool("Read")]),
    // (2) QUALITY — it caught the subtract-instead-of-add bug. Must stay ~equal.
    output(/subtract|a - b|minus|should add|wrong operator/i),
    // (3) PAYOFF — a parseable typed outcome. Only the `spec` arm can pass.
    output(/```vigiles:(ok|err)/),
  ],
});

for (const [name, r] of Object.entries(report.arms)) {
  if (r.n === 0) throw new Error(`arm "${name}": no runs executed`);
  console.log(`\n[arm: ${name}]`);
  console.log(formatCheckReport(r));
}

// The significance read (Welch's t over the per-arm rates), prose = baseline:
//   check 1 = foundBug (QUALITY) — want NOT significantly worse on `spec`.
//   check 2 = typedOutcome (PAYOFF) — want significantly higher on `spec`.
const pOf = (cmp) =>
  cmp && typeof cmp.p === "number" && Number.isFinite(cmp.p)
    ? `p=${cmp.p.toFixed(3)}`
    : "p=n/a (needs variance across ≥2 trials)";
const quality = compareCheck(report, "prose", "spec", 1);
const payoff = compareCheck(report, "prose", "spec", 2);
console.log(`\nquality  (foundBug, spec vs prose):    ${pOf(quality)}`);
console.log(`payoff   (typedOutcome, spec vs prose): ${pOf(payoff)}`);
console.log(
  "\nVerdict: the spec HELPED iff quality did NOT regress (p high / spec≈prose) " +
    "AND payoff is a real win (p low, spec≫prose).",
);
