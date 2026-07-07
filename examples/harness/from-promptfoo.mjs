/**
 * The vigiles equivalent of a promptfoo skill test — run on your Claude
 * subscription instead of the metered API. See docs/migrating-from-promptfoo.md.
 *
 * The promptfoo test this mirrors:
 *
 *   providers: [anthropic:messages:claude-sonnet-4]     # metered API, billed/token
 *   prompts:   ["Summarize {{doc}} in one sentence."]
 *   tests:
 *     - vars: { doc: "…" }
 *       assert:
 *         - { type: icontains,  value: "invoice" }
 *         - { type: llm-rubric, value: "A single, accurate one-sentence summary", threshold: 0.7 }
 *         - { type: cost,       threshold: 0.01 }
 *
 * Each assert becomes a vigiles check; the provider becomes `model` on the sub.
 *
 *   npx vigiles eval examples/harness/from-promptfoo.mjs   # needs claude + model auth
 *
 * Real model → real work (but $0 beyond your subscription, apiKeySource "none").
 * External users import from the package: `from "vigiles/testing"`.
 */
import {
  measure,
  output,
  judged,
  cost,
  assertRates,
} from "../../dist/testing.js";

const report = await measure(
  {
    name: "summary: one accurate sentence, mentions the invoice, cheap",
    fixture: {
      "in.txt":
        "Invoice #4102 from Acme totals $980, due 2026-08-01, net-30 terms.",
    },
    task: "Summarize in.txt in ONE sentence. Write it to out.txt, then stop.",
    model: "sonnet",
  },
  {
    trials: 5,
    checks: [
      output(/invoice/i), // promptfoo: icontains "invoice"
      judged("A single, accurate one-sentence summary", { min: 0.7 }), // promptfoo: llm-rubric
      cost({ maxUsd: 0.01 }), // promptfoo: cost threshold
    ],
  },
);

// promptfoo passes/fails a run; vigiles reports a RATE ± se across trials.
// assertRates gates each check's pass-rate (the scored equivalent of `assert`).
assertRates(report, { min: 0.8 });
