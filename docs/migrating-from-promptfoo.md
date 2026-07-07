# Migrating skill evals from promptfoo

> The [README](../README.md) has the pitch; this is the how-to. If you already
> A/B skills with promptfoo and the **metered-API bill** is the pain, this maps
> your setup onto vigiles — same questions, run on your **Claude subscription**
> (`$0` beyond the sub), loading your **real Claude Code / Codex harness** as it
> ships.

## Why move

promptfoo is a solid LLM eval runner, but for **Claude Code / Codex skill**
testing it has two structural costs:

- **It bills per token, every run.** The default `anthropic:` provider hits the
  metered API. Complex skills × trials × redteam matrices is how a suite reaches
  four figures a year.
- **It tests a re-assembled agent, not your shipped harness.** A skill's real
  behavior depends on the assembled harness — the real system prompt + your
  `CLAUDE.md`/`AGENTS.md` + skill selection + hooks. A YAML-configured provider
  can't reproduce that, and the #1 skill question — _does the description actually
  fire?_ — isn't something completion-grading reaches.

vigiles runs the same behavioral checks on the subscription you already pay for,
against the harness loaded the way a user installs it. See
[why it's affordable](measuring-skills.md#why-you-can-afford-to-run-it).

## Concept mapping

| promptfoo                                                | vigiles                                               | Notes                                                     |
| -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `providers: [anthropic:messages:claude-…]` (metered API) | `model: "sonnet"` on the sub (`apiKeySource: "none"`) | The cost win — your own `claude` CLI, no metered billing. |
| `prompts:` + `tests[].vars`                              | the `task` (+ `measureTriggerRate` prompt set)        | One prompt or a varied set.                               |
| a `test` with `assert:`                                  | one `measure` run with a `checks:` array              | Each assertion becomes a check.                           |
| baseline vs skill (two providers/configs)                | `measureArms({ arms: { baseline: {}, skill: {…} } })` | The A/B is first-class; the delta is the signal.          |
| "did the skill even get used?"                           | `measureTriggerRate` (recall + precision)             | The CC-specific question promptfoo can't cleanly answer.  |
| a whole skill dir installed                              | `pluginDir: "./skills/my-skill"`                      | Loads the real plugin (skills + hooks) natively.          |

## Assertion mapping

Each promptfoo `assert` entry maps to a vigiles check (from `vigiles/testing`):

| promptfoo `assert.type` | vigiles check                  | Notes                                                                         |
| ----------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `contains`              | `output("substring")`          | A string matcher is a substring test.                                         |
| `icontains`             | `output(/substring/i)`         | Case-insensitive → a regex.                                                   |
| `regex`                 | `output(/pattern/)`            |                                                                               |
| `equals`                | `output(/^exact$/)`            | Anchor the regex.                                                             |
| `llm-rubric`            | `judged("rubric", { min })`    | Model-graded, on the sub. `threshold` → `min`.                                |
| `cost`                  | `cost({ maxUsd })`             | vigiles reads the real `total_cost_usd`.                                      |
| `latency`               | `latency({ maxMs })`           |                                                                               |
| `javascript` / `python` | a custom `measure((ctx) => …)` | Not auto-portable — read `ctx.file()`/`ctx.output` and return `1/0` yourself. |
| `similar` (embeddings)  | —                              | No direct equivalent; use `judged` or a custom check.                         |

ℹ️ vigiles won't silently pretend to convert what it can't. Anything not in the
table above stays a **deliberate manual step**, not a false green — the same
"valid is not true" discipline vigiles applies everywhere.

## Worked example — one test, side by side

**promptfoo** (`promptfooconfig.yaml`, billed per token):

```yaml
providers: [anthropic:messages:claude-sonnet-4]
prompts: ["Summarize {{doc}} in one sentence."]
tests:
  - vars: { doc: "…" }
    assert:
      - type: icontains
        value: "invoice"
      - type: llm-rubric
        value: "A single, accurate one-sentence summary"
        threshold: 0.7
      - type: cost
        threshold: 0.01
```

**vigiles** (`summary.eval.mjs`, on your subscription — see the runnable
[`examples/harness/from-promptfoo.mjs`](../examples/harness/from-promptfoo.mjs)):

```javascript
import { measure, output, judged, cost, assertRates } from "vigiles/testing";

const report = await measure(
  {
    task: "Summarize in.txt in one sentence. Write it to out.txt, then stop.",
    fixture: { "in.txt": "…" },
    model: "sonnet",
  },
  {
    trials: 5,
    checks: [
      output(/invoice/i), // icontains
      judged("A single, accurate one-sentence summary", { min: 0.7 }), // llm-rubric
      cost({ maxUsd: 0.01 }), // cost
    ],
  },
);
assertRates(report, { min: 0.8 }); // each check passes ≥80% of trials
```

To A/B a skill against no-skill, wrap it in `measureArms({ arms: { baseline: {}, skill: { pluginDir: "./skills/my-skill" } } })` and read the per-arm delta.

## What moves cleanly — and what doesn't yet

| Your promptfoo tests…                                  | Status on vigiles                                                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior / output assertions (contains, regex, rubric) | ✅ Move cleanly, on the sub.                                                                                                                                                                              |
| Cost / latency assertions                              | ✅ Move cleanly (real `total_cost_usd`).                                                                                                                                                                  |
| "Does the skill fire?"                                 | ✅ Better — `measureTriggerRate` (recall + precision).                                                                                                                                                    |
| Baseline vs skill A/B                                  | ✅ First-class (`measureArms` + significance).                                                                                                                                                            |
| **Redteam suites**                                     | ⚠️ **Not covered.** vigiles has a safety-hook battery (`assertBlocksDisasters`) and judged adversarial checks, but **no redteam _generator_**. Keep promptfoo (or your own adversarial prompts) for that. |
| Skills with **real side effects** (hit a DB, etc.)     | 🧪 Experimental — the [R3 disposable-service tier](measuring-skills.md#experimental-real-side-effect-testing).                                                                                            |
| `javascript`/`python` assertions                       | ✍️ Manual — port the logic into a custom `measure` callback.                                                                                                                                              |

## See also

- [Measuring skills](measuring-skills.md) — the full A/B method, the metric triple, and the cost model.
- [Testing your harness](harness-testing.md) — the free deterministic tiers under the eval tier.
