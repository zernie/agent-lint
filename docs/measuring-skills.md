# Measuring skills & plugins — does it actually help?

> The README has the pitch ("Measure — does it actually help, or just cost
> more?"); this is the full guide. vigiles is the only harness tool that can A/B a
> skill, plugin, model, or rule change on **real coding tasks** and tell you
> whether it moved the needle — on your **Claude subscription**, not metered API.

The agentic-coding ecosystem runs on vibes: "65% fewer tokens," "3× faster," "the best skills" — stars and zero measurement. vigiles answers the only question that matters: _does this actually help **my** repo, and at what cost?_

It does that by running the thing under test on both sides of an A/B and reading the result.

## Contents

- [The unit: an A/B on the same real task](#the-unit-an-ab-on-the-same-real-task)
- [The metric triple — bill, target, blast radius](#the-metric-triple--bill-target-blast-radius)
- [Worked example](#worked-example)
- [The ecosystem benchmark — what works vs hype](#the-ecosystem-benchmark--what-works-vs-hype)
- [Why you can afford to run it](#why-you-can-afford-to-run-it)
- [See also](#see-also)

## The unit: an A/B on the same real task

**Every measurement is an A/B on the same task.** One arm has the thing under test (a skill's `SKILL.md`, a whole plugin via `--plugin-dir`, a model, a rule set). The other arm has nothing. The harness is loaded as it ships — the real `claude` CLI, the skill injected exactly as a user installs it.

The signal is the **delta** between arms, not an absolute. Absolutes drift with model and task; deltas are comparable.

This is `runEval` / `measureArms` — arms × trials → mean ± se, with Welch's t-test so a delta only counts if it clears the noise floor (`assertSignificant`). It is **not** a prompt eval: the unit under test is the assembled harness, which a generic YAML-configured eval runner cannot reproduce.

## The metric triple — bill, target, blast radius

**A single headline number is how vendors mislead.** Always measure three:

| Metric               | What it is                                                                                             | Why                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Bill** (`costUsd`) | `total_cost_usd` for the run — already weights cache reads ~0.1× and output 1×.                        | The honest cost. A "saved tokens" claim can't hide behind cheap cache. **This is the number you decide on.** |
| **Target**           | Whatever the thing claims to move — output tokens, latency, tool calls.                                | Verify the claim **on its own terms**.                                                                       |
| **Blast radius**     | Correctness — a deterministic 1/0 a `check(ctx)` returns over the written artifact (not an LLM judge). | A win on the bill or target that **regresses correctness is not a win.** The column a headline never shows.  |

⚠️ On real agentic coding, **output tokens are a single-digit % of the session**. The rest is input and cache from file reads and tool results. So an output-only "% saved" headline overstates the real bill impact by ~10–50×. Measuring the bill separately is mandatory.

## Worked example

```typescript
import { measureArms } from "vigiles/testing";

const report = await measureArms({
  fixture: { "in.txt": "Implement a slug helper." },
  task: "Read in.txt, write slugify() to slug.js, then explain. Stop.",
  arms: {
    baseline: {}, // the task, nothing added
    skill: { files: { "SKILL.md": THE_SKILL } }, // or: { pluginDir: "./some-plugin" }
  },
  measure: (ctx) => ({
    cost: ctx.usage.costUsd, // the bill
    outputTokens: ctx.usage.outputTokens, // the target
    correct: check(ctx), // the blast radius (1/0)
  }),
  trials: 3,
  model: "sonnet",
});
// Read the per-arm delta: lower bill? target moved? correctness intact?
```

Two ways to specify an arm:

- **`files`** — drop a `SKILL.md` or config into the run. The clean A/B-able shape for an injectable skill.
- **`pluginDir`** — load a whole real plugin natively, so its skills and hooks register the real way. Use this for "plugin on vs off."

## The ecosystem benchmark — what works vs hype

**The same engine, pointed at the most-hyped skills and plugins, produces the ecosystem benchmark.** It's a leaderboard of claimed vs measured, leading with the debunks. The engine lives at [`bench/ecosystem/`](../bench/ecosystem/) — a real, SHA-pinned skill manifest A/B'd over [`bench/corpus/coding-tasks.mjs`](../bench/corpus/coding-tasks.mjs), using this exact method.

> Because every run uses a deterministic correctness oracle and a published method, anyone can re-run it on their own subscription and check. The method is the product, not the snapshot.

ℹ️ The per-repo result matters more than the ecosystem mean. A skill that helps one repo can hurt another. Measure on **your** tasks — the ecosystem average may not hold for you.

## Why you can afford to run it

**Every run uses your own `claude` CLI on your Pro/Max subscription** (`apiKeySource: "none"`) — no metered API billing.

|                        | Runs on                 | Cost                            |
| ---------------------- | ----------------------- | ------------------------------- |
| promptfoo, DeepEval, … | metered API SDK         | billed **per token, every run** |
| **vigiles**            | your Claude Pro/Max sub | **$0 extra** beyond your sub    |

That's why vigiles can measure continuously — on every change, not once — while a per-token competitor cannot. Most of vigiles needs no model at all. Only this measurement tier does, and it runs where your subscription already is. See [`docs/eval-architecture.md`](eval-architecture.md) for the cost model.

### What a run reports — and the metered-API warning

A real-model run tells you **exactly what it spent**, so a paid run is never silent:

```text
  Spent: 84,400 tokens (2.1k in · 1.8k out · 80k cache) · ~$0.42 API-equivalent
  Billed to: your Claude subscription — $0 metered ✅
```

- **Tokens + API-equivalent `$`** — `total_cost_usd`, i.e. what the run _would_ cost at metered API rates. On your subscription you pay **$0 beyond the sub**; the `$` is just the yardstick.
- **The billed-to line** — if you have an `ANTHROPIC_API_KEY` set, the run is billed **per token**, and vigiles says so loudly:

```text
  ⚠ Billed to: METERED API (ANTHROPIC_API_KEY is set) — you paid ~$0.42 this run.
     Run it free on your Claude subscription: unset ANTHROPIC_API_KEY, then `claude login`.
```

- **No "% of your plan."** Anthropic doesn't expose a subscription's quota (the real limits are rolling rate windows, not a dollar bucket), so vigiles won't invent a percentage. Tokens + the API-equivalent `$` + how you were billed is the honest, complete picture — plus a running session tally across the runs in one sitting.

The numbers also live on the report (`report.arms[*].usage`), and the `test-harness` skill relays them to you after any run it does on your behalf.

## See also

- [Testing your harness](harness-testing.md) — the deterministic tiers (no model) under this one.
- [Verifying instruction files](verifying-instruction-files.md) — the lint layer, the free pre-filter to measurement.
