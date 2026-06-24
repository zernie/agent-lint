# Measuring skills & plugins — does it actually help?

> The README has the pitch ("Measure — does it actually help, or just cost
> more?"); this is the full guide. vigiles is the only harness tool that can A/B a
> skill, plugin, model, or rule change on **real coding tasks** and tell you
> whether it moved the needle — on your **Claude subscription**, not metered API.

The agentic-coding ecosystem is hype-driven and unmeasured: "65% fewer tokens,"
"3× faster," "the best skills" — stars and vibes, **zero measurement**. vigiles
answers the only question that matters — _does this actually help **my** repo, and
at what cost?_ — by running the thing under test on both sides of an A/B and
reading the result.

## Contents

- [The unit: an A/B on the same real task](#the-unit-an-ab-on-the-same-real-task)
- [The metric triple — bill, target, blast radius](#the-metric-triple--bill-target-blast-radius)
- [Worked example](#worked-example)
- [The ecosystem benchmark — what works vs hype](#the-ecosystem-benchmark--what-works-vs-hype)
- [Why you can afford to run it](#why-you-can-afford-to-run-it)
- [See also](#see-also)

## The unit: an A/B on the same real task

Every measurement is an **A/B on the SAME task**: one arm with the thing under test
(a skill's `SKILL.md`, a whole plugin via `--plugin-dir`, a model, a rule set), one
arm without. The harness is loaded **as it ships** — the real `claude` CLI, the
skill injected exactly as a user installs it. The signal is the **delta** between
arms, not an absolute (absolutes drift with model and task; deltas are comparable).

This is `runEval` / `measureArms` — arms × trials → mean ± se, with Welch's t-test
so a delta only counts if it clears the noise floor (`assertSignificant`). It is
**not** a prompt eval: the unit under test is the assembled harness, which a
generic YAML-configured eval runner cannot reproduce.

## The metric triple — bill, target, blast radius

A single headline number is how vendors mislead. Measure **three**, always:

| Metric               | What it is                                                                                             | Why                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Bill** (`costUsd`) | `total_cost_usd` for the run — already weights cache reads ~0.1× and output 1×.                        | The honest cost. A "saved tokens" claim can't hide behind cheap cache. **This is the number you decide on.** |
| **Target**           | Whatever the thing claims to move — output tokens, latency, tool calls.                                | Verify the claim **on its own terms**.                                                                       |
| **Blast radius**     | Correctness — a deterministic 1/0 a `check(ctx)` returns over the written artifact (not an LLM judge). | A win on the bill or target that **regresses correctness is not a win.** The column a headline never shows.  |

The load-bearing fact: on real agentic coding, **output tokens are a single-digit
% of the session** (the rest is input + cache from file reads and tool results). So
an output-only "% saved" headline overstates the real bill impact by ~10–50×.
Measuring the bill separately is mandatory.

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

An arm is either **`files`** (drop a `SKILL.md` / config into the run — the clean
A/B-able shape for an injectable skill) or **`pluginDir`** (load a whole real
plugin natively, so its skills/hooks register the real way — "plugin on vs off").

## The ecosystem benchmark — what works vs hype

The same engine, pointed at a set of the most-hyped skills/plugins over a shared
neutral task corpus, produces the **ecosystem benchmark**: a leaderboard of claimed
vs measured, leading with the debunks. The engine lives at
[`bench/ecosystem/`](../bench/ecosystem/) — a real, SHA-pinned skill manifest A/B'd
over [`bench/corpus/coding-tasks.mjs`](../bench/corpus/coding-tasks.mjs), reusing
this exact method.

> Because every run is a deterministic correctness oracle + a published method,
> anyone can re-run it on their own subscription and check. The method is the
> product, not the snapshot.

The per-repo corollary matters more than the ecosystem mean: a skill that helps on
one repo can hurt on another, so measure on **your** tasks — the ecosystem average
may not hold for you.

## Why you can afford to run it

Every run is your own `claude` CLI on your **Pro/Max subscription**
(`apiKeySource: "none"`) — no metered API billing.

|                        | Runs on                 | Cost                            |
| ---------------------- | ----------------------- | ------------------------------- |
| promptfoo, DeepEval, … | metered API SDK         | billed **per token, every run** |
| **vigiles**            | your Claude Pro/Max sub | **$0 extra** beyond your sub    |

That's the structural reason vigiles can measure continuously — on every change,
not once — while a per-token competitor cannot. Most of vigiles needs no model at
all; only this measurement tier does, and it runs where your subscription already
is. See [`docs/eval-architecture.md`](eval-architecture.md) for the cost model.

## See also

- [Testing your harness](harness-testing.md) — the deterministic tiers (no model) under this one.
- [Verifying instruction files](verifying-instruction-files.md) — the lint layer, the free pre-filter to measurement.
