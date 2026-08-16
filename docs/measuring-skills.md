# Measuring skills & plugins — does it actually help?

> The README has the pitch (the only way to put a real number on cost); this is
> the full guide. vigiles is the only harness tool that can A/B a
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
- [Experimental: real side-effect testing](#experimental-real-side-effect-testing)
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
import { paid_runEval } from "vigiles/eval";

const report = await paid_runEval({
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

> `runEval` takes a **`measure(ctx)` callback** that returns any numeric metrics (used above). Its sibling `measureArms` instead scores a **declarative `checks` array** (`output`/`judged`/`cost`/…) — reach for that when your A/B is a set of pass/fail assertions rather than custom numbers.

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

That's why vigiles can measure continuously — on every change, not once — while a per-token competitor cannot. Most of vigiles needs no model at all. Only this measurement tier does, and it runs where your subscription already is.

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

The numbers also live on the report — `report.usage` for a single run (`measure`, `measureTriggerRate`) or `report.arms[*].usage` per arm (`runEval`, `measureArms`) — and the `test-harness` skill relays them to you after any run it does on your behalf.

## Experimental: real side-effect testing

> ⚠️ **Experimental & unstable.** Import from `vigiles/experimental`. This surface is **not** covered by the [stability guarantee](../STABILITY.md) — it may change shape or be removed without a major-version bump. Don't build a production workflow on it yet.

The tiers above cover a skill's **output** and its **side-effect safety** — did it call / not call a tool, write / not write a file — with no container. What they don't yet do turnkey is let a skill **actually perform a side effect against a real service and verify the resulting state**: apply a migration to a real Postgres, then check the row landed.

That's this tier. vigiles **composes with a throwaway container** rather than reinventing a sandbox: a `ServiceSpec` declares a disposable service, it's started fresh, and it's force-removed on teardown.

### ⚠️ Safety — read this before running R3

R3 runs your skill **for real**, and a skill is model-driven — the model picks the actions, so it can do anything the run environment allows. vigiles gives you a **throwaway container and deletes it afterwards. That is the only isolation it provides.** It does **not** stop a skill from touching other systems your environment leaves reachable. **Treat an R3 run like running an untrusted script — the safety is on the environment you run it in, not on vigiles.**

| Do                                                                                                                                                                    | Don't                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run it in a **disposable environment** — a CI job, a throwaway container/VM, or a dev box with no production access.                                                  | **Run it against production**, or in a shell where `DATABASE_URL` / `AWS_*` / `~/.ssh` point at real systems — a model that finds a real credential may use it. |
| Point the task at the **disposable service's connection string only**.                                                                                                | Assume vigiles sandboxes the filesystem or network here — it provisions and disposes the **container**, nothing more.                                           |
| **Scrub real credentials** from the run — pair it with the eval tier's `ephemeralEnv` (throwaway HOME + cleared env) so there are no prod keys for the model to find. | Rely on the `endpoints` as a network wall — that's a **future** hardening, not applied yet.                                                                     |

- ✅ **Guaranteed:** the service is created fresh and force-removed on teardown, even on failure.
- ❌ **Not guaranteed (yet):** filesystem/network confinement of the skill. Until the egress wall lands (skill reaches only the model + the service), **an isolated run environment is doing that job, and you must provide it.** If you can't isolate the environment, don't run R3 yet.

### Using it

`experimental_withServices` starts the services, runs your block, and disposes them even on failure:

```typescript
import {
  experimental_withServices,
  experimental_dockerRuntime,
} from "vigiles/experimental";
import { paid_runEval } from "vigiles/eval";

await experimental_withServices(
  {
    db: {
      image: "postgres:16",
      env: { POSTGRES_PASSWORD: "test", POSTGRES_DB: "app" },
      port: 5432,
      ready: { exec: "pg_isready -U postgres -h 127.0.0.1 -d app" }, // real server only
      // inline SQL — the seed runs INSIDE the container, so it can't reach a
      // schema.sql on your host (nothing mounts it). Keep the seed self-contained.
      seed: "psql -U postgres -d app -c 'create table users (id int)'",
    },
  },
  experimental_dockerRuntime,
  async (svc) => {
    // runEval — it takes a measure(ctx) callback + supports ephemeralEnv
    return paid_runEval({
      // migration.sql must be in the run FIXTURE for the agent to read it —
      // a bare filename in the task doesn't materialize the file.
      fixture: { "migration.sql": "ALTER TABLE users ADD COLUMN age int;" },
      // single arm — a baseline arm would share this DB and leave `age` behind,
      // crediting the skill for free (per-arm reset is a later increment).
      arms: { skill: { pluginDir: "./skills/migrator" } },
      // full connection string incl. password — ephemeralEnv leaves no PGPASSWORD
      task: `Apply migration.sql to postgresql://postgres:test@${svc.endpoints[0]}/app . Stop.`,
      ephemeralEnv: true, // ⬅ recommended — scrub real creds from the run
      measure: () => ({
        // verify the REAL resulting DB state — R3's whole point
        migrated: /(^|\n)age(\n|$)/.test(
          svc.handles.db.exec(
            "psql -U postgres -d app -tAc \"select column_name from information_schema.columns where table_name='users'\"",
          ).stdout,
        )
          ? 1
          : 0,
      }),
      // trials: 1 — per-RUN container lifecycle; a persistent side effect would
      // make later trials pass for free until per-trial reset exists.
      trials: 1,
      model: "sonnet",
    });
  },
);
```

Runnable versions: [`side-effect-r3.mjs`](../examples/harness/side-effect-r3.mjs) (the primitive) and [`measure-with-service.mjs`](../examples/harness/measure-with-service.mjs) (the `runEval` composition above).

**What ships today vs later.** Today: the types, the `ContainerRuntime` port, `experimental_startServices` / `experimental_withServices`, and a Docker backend — all under `vigiles/experimental`. Deferred: a first-class `services` option on `measureArms` (+ `ctx.service(name)`), **per-trial** reset (today the container lives for the whole run — make your task self-contained or use `trials: 1`), and the egress wall. Requires Docker (Linux-first), stays an explicit opt-in, and is **never** part of `vigiles audit` — `audit` stays side-effect-free.

## See also

- [Migrating from promptfoo](migrating-from-promptfoo.md) — move your existing skill evals onto the subscription, check by check.
- [Testing your harness](harness-testing.md) — the deterministic tiers (no model) under this one.
- [Verifying instruction files](verifying-instruction-files.md) — the lint layer, the free pre-filter to measurement.
