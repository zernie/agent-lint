# Eval architecture — how vigiles tests Claude Code harness features

> Status: design of record (2026-06-16). Captures the conceptual model behind
> the two testing verbs (`vigiles test` / `vigiles eval`), reconciles it with
> what the codebase **already** ships, and ranks the genuine remaining gaps into
> a build roadmap. Companion to [`harness-testing.md`](harness-testing.md) (the
> user guide).

## The kicker

Real-model evals are invoked manually (`npm run test:eval`), and their results get
frozen as `FINDING:` comments baked into the `*.eval.mjs` files. **A snapshot of a
past run is documentation, not protection** — edit a skill description and break
its trigger rate, and nothing re-ran the classifier. This doc is the reevaluation.

> **Now shipped — the eval lock.** That exact gap is closed by a committed
> integrity stamp: `vigiles eval --update` (local, on your subscription) records
> each named eval's result; `vigiles eval --check` (CI) fails "stale" when an
> input changed without a re-run — **without a model call**. See
> [The eval lock](#the-eval-lock-the-ci-staleness-gate). The rest of this doc is
> the reasoning that led there.

The honest scope correction up front: the gap is **narrower than "build an eval
runner,"** and the fix is **not** "add a GitHub Actions eval job." vigiles already
has `vigiles eval` (discovers + runs `*.eval.mjs`), a record/replay cache, a
significance-gated baseline, a check vocabulary scored across trials, and
trigger-rate with recall **and** precision. The real moves are (1) **run the
real-model eval where the subscription already is** — a Claude Code session (the
agent loop / web / a scheduled session) or locally, since vigiles drives the
`claude` CLI; NOT a metered GitHub Actions workflow (CI runs only the free
deterministic tiers); (2) make `vigiles eval` **fail honestly** so a session run
can't false-green (`--min`, `--no-skip`, corrupt-cache throw, the Sonnet model
floor); (3) **honest model pinning** for cached/baselined results; and (4) the
**tool-call spy/fake** for side-effecting skills. See
[What already exists](#what-already-exists) before building anything.

## Positioning & pros/cons (the approach, decided 2026-06-17)

> The canonical positioning **statement** lives in `CLAUDE.md` (`## Positioning`,
> layer 2). This section is the **detailed** pros/cons behind it.

**The thesis: the harness eval you can actually afford to run.** Almost nobody
evals their harness because the usual tools (promptfoo, DeepEval, Braintrust,
Inspect) hit the model **API SDK** and bill **per token on every run** → real
money on every CI run → so it doesn't get run. vigiles inverts the cost curve two
ways: (a) **most harness questions need no model at all** — `runHook` + mock-model
`runHarnessTest` answer "does the hook fire/block/inject?" deterministically,
free, every commit; (b) when a question **is** irreducibly real-model
(does a description _fire_, does behaviour _move_), vigiles drives the **`claude`
CLI**, so the eval runs on the **Pro/Max subscription** the user already pays for —
in a Claude Code session or locally — not a metered API key in CI. (Confirmed this
session: a real eval ran with `apiKeySource:"none"`, i.e. on the OAuth sub.)

### Pros (why this is defensible)

- **Cost** — the structural advantage. Free deterministic tiers + sub-priced real-model
  tier vs competitors' per-token-every-run. This is the only reason a small team
  will _actually_ eval their harness.
- **Fidelity** — the unit under test is the harness **loaded as it ships**
  (`plugin-loader`: real `plugin.json`/`hooks`/`settings`/`CLAUDE.md`). A
  YAML-config eval runner reconstructs an agent; it can't host this.
- **Honesty** — measures in-plugin with real sibling competition (vs others'
  optimistic one-skill isolation), on the realistic selector (Sonnet, not haiku),
  with significance + `pass^k`; `interceptTools` intercepts-and-prevents a
  side-effecting tool in the **real** hook layer (a safety assertion others can't
  make).

### Cons / limits (state them honestly)

- **The sub is rate-limited.** This works _because_ the real-model surface is thin
  by design — it is **not** a license for huge trial counts; heavy volume still
  wants metered API or a higher tier.
- **Real-model evals stay non-deterministic** — a statistical rate ± se across
  trials, never a single-run gate. (The deterministic tiers are the per-commit
  gate.)
- **The tool-call spy is intercept-and-prevent, not a faithful mock** — CC
  surfaces the deny as a _block_, so it asserts the ATTEMPT, not a continued flow.
- **Trigger-rate must run on the realistic model** — a cheap haiku run
  under-measures selection (dogfooded: 0.50 haiku vs 0.90 Sonnet). The `minModel`
  floor enforces this.
- **Evals aren't a zero-effort CI checkbox** — you run them deliberately in a
  session, which is a workflow change vs "add a GitHub Action."
- **No dataset / red-team / scorer-library / web UI** — that's promptfoo's lane;
  we bridge or skip, not chase.

## Coverage & scope — what we test, what we delegate

What a test needs from the _outside world_ sorts onto **three rungs**, and you
**pick the lowest rung that faithfully measures the thing**:

- **R1 — cheap / deterministic (nothing executes):** hook-fires (`runHook`),
  trigger-rate recall+precision (`measureTriggerRate`), tool-contract / `notTool`.
  No tool, no service, no Docker. _"calls a tool" → R1._
- **R2 — stub / record-replay:** the deterministic logic consumes a tool/MCP/API
  **result** that is **recorded ONCE** from a real tool and **replayed** by
  shadowing the binary on PATH / stubbing the MCP — no live service. **Never**
  model-synthesized stubs (drift → false confidence); reuse the eval cache's
  record/replay machinery. _"needs the result" → R2._
- **R3 — real disposable service/container:** the real system's **semantics** is
  what's under test (real SQL vs a real schema, a real browser, a DB/redis/
  analytics engine). _"real semantics under test" → R3._

**A second, orthogonal axis decides the cost: the oracle.** The rungs say _what
executes_; they do **not** say _who decides pass/fail_. A **deterministic** oracle
(hook block/allow, tool-contract, a structural fact) is **free, no model, in CI**;
a **model-gated** oracle (does a description **fire**? does prose guidance **change
behavior**? is the output good, judged?) needs a **real model — on your
subscription**, not metered API. We tag the latter `-MG` (e.g. **`R1-MG`** =
nothing executes but only a model can judge — _the case for any prose skill_).
Don't read "R1" as "free": a prose guidance skill is **R1-MG** — it's fully
testable (trigger-rate + a judged behavioral eval), just on the sub, not in CI.
That's the boundary, not a coverage hole.

**What vigiles can and can't test — three buckets.** Folding both axes:
**(A) Free & deterministic** (R1/R2 + deterministic oracle — every commit);
**(B) Model-gated on your sub** (`-MG` + model oracle — no metered API);
**(C) Needs a real service** (R3 — vigiles **composes** with a container, doesn't
run it). **A + B is "testable by vigiles"; only C is delegated.** So grade a plugin
with **two numbers, not three**: **"% testable at all (free + sub)"** vs **"% that
needs a container"** — and always say which bucket, so "testable" never hides
whether it's free or sub-priced.

**Distribution (blended, scrubbed).** A survey of popular community plugin
collections **and** an audit of a ~90-artifact real-world production skill set
**converge**: **R1 ≈ 48–90%, R2 ≈ 10–43%, R3 ≈ 0–9%.** Net — **R1+R2 covers
~90%+** of real plugin surface with **no Docker, on the subscription**; the R3
apex is **thin** and collapses to a handful of real services. Every common
SaaS/CLI integration (GitHub / issue-tracker / chat / CI / linters / test-runners)
is faithfully **replayable at R2**.

**The e2e landscape (honest).** Real side-effecting e2e is mature
(SWE-bench/Verified, Terminal-Bench, OSWorld, WebArena; the labs' per-task cloud
sandboxes; AISI Inspect's Docker sandbox) — but **every one runs inside a
container/VM/cloud sandbox.** There is no "safe reproducible e2e without a
container," so at R3 vigiles **composes with a container, does not reinvent the
sandbox, and does not claim containerless e2e.**

**Across the axes.** SAFETY: R1 nothing executes; R2 fake outputs, no real system;
R3 real side effects only inside an isolated disposable container — layered with
provenance confinement + the ephemeral run env + `interceptTools`. VIABILITY: R1+R2
need no Docker, run on the sub (affordable + cross-platform); R3 needs Docker.
PERFORMANCE: R1/R2 ms-fast deterministic; R3 Docker cold-start is seconds — keep
thin. **Non-goals:** containerless reproducible e2e; per-host egress on macOS;
verifying vendor MCP connectors' live semantics (vendor's job); becoming a
sandbox/orchestrator (compose instead).

**Competitor comparison.** Completion-graders (promptfoo / DeepEval / Braintrust)
— metered API every run, no real-harness load, no cheap no-model tiers.
Containerized e2e (SWE-bench / Inspect / Codex) — faithful but heavy / metered /
infra. vigiles — owns **R1+R2 + sub-affordability + a clean container hand-off at
R3**. The unclaimed seam is R1+R2 + sub-pricing + compose-with-container, **NOT**
e2e-without-a-container.

**Build verdict.** A **PATH-shim / record-replay helper (fake-on-PATH)** is
**higher leverage** than a testcontainers integration — it unlocks the ~43% R2
with no Docker and covers far more real plugins. Real-service provisioning stays a
thin, composed apex.

## Core model: every harness feature = a deterministic part + a behavioral part

This is the load-bearing idea. Decompose every harness feature (a skill, a hook,
a `CLAUDE.md` rule, a subagent, an MCP server) into two parts:

| Part                                                                                                                                                                                                      | Becomes a                                       | Mechanism                                                                  | Cost                   | Runs              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- | ---------------------- | ----------------- |
| **Deterministic** — does the hook fire/block? does the file parse? do permission rules match? does an extracted prompt-builder/checker produce the right string? does an MCP tool return the right shape? | **TEST** — exact binary assertion               | `runHook`, `runHarnessTest`, plain `node:test` over an extracted pure core | free, no model         | every PR          |
| **Behavioral** — does a description _trigger_? does `CLAUDE.md` _change behavior_? does an agent reach the right _outcome_?                                                                               | **EVAL** — statistical, scored, threshold-gated | `measureTriggerRate`, `runEval`/`measure` A/B                              | real model → real cost | gated (see knobs) |

**Most of a feature is the deterministic part, and that's where
protection-per-dollar is highest.** Only the irreducibly-stochastic slice runs a
model. This mirrors the repo's existing "keep the real-model surface THIN"
discipline: of all harness questions, only two
are _irreducibly_ real-model — _does a description fire_ and _does behavior move_.

Practical corollary, and a prerequisite for the dogfood work below: **most
testable skill logic is inline guidance prose, not code.** Where a deterministic
core is _embedded in a prompt_, you can't test it for free. So the highest-leverage
move is often to **extract the deterministic core into a script** (the
`prune-illustrate` `generate.sh` with its `STYLE_SUFFIX` constant is the template
to copy), then test that script at the free subprocess tier. Extraction converts
a behavioral question into a deterministic one — the cheapest possible win.

## trigger-rate is a classifier eval, not a unit test

Name it right, because the name dictates how you run it. The "unit under test" is
the **model's routing decision** (stochastic); the artifact being tested is the
**description string**. Each `(prompt, skill)` pair is a labeled example. The
metrics are information-retrieval metrics:

- **recall** — fires when it should (`TriggerRateReport.rate`),
- **precision** — stays quiet when it shouldn't, including on sibling-skill prompts
  (`TriggerRateReport.precision` / `falsePositiveRate`, driven by
  `irrelevantPrompts`).

Run it like an ML eval: a labeled set, a threshold (`recall ≥ 0.9`), tolerant of
noise, tracked for drift — **not** like jest with an exact assertion. This is
exactly why snapshotting its score is wrong: a frozen number protects nothing;
only re-running the classifier does.

> Already shipped: `measureTriggerRate` + `assertTriggerRate` (min recall,
> maxFalsePositive, minPrecision) + the deterministic `checkPromptDiversity`
> pre-flight (NCD-based near-duplicate + min-size gate, so you can't measure a
> rate over three copy-pasted prompts). The framing here is the _justification_
> for that API, and the argument for **running it in CI** rather than
> snapshotting it.

## Two orthogonal knobs on every behavioral eval

Every behavioral eval is configured along two independent axes. Keeping them
orthogonal is what stops the snapshot/hash machinery from metastasizing into
every test.

1. **Reproducibility** — how you make a stochastic run repeatable:
   `exact-assert` | `record/replay cassette` | `hermetic fixture` |
   `live + threshold`.
2. **When you run it** — the deterministic tiers run **every commit in CI** (free,
   no model); a real-model eval is **run deliberately** on the subscription, not in
   CI: `on-demand (a Claude Code session / local)` | `hash-lockfile (replay)` |
   `nightly/manual`.

The snapshot/hash machinery is **just the `hash-lockfile` value of knob 2** — one
option most features never pick. Concretely:

- a hook is `(exact-assert, every-commit CI)` — `runHook`, free, no model;
- trigger-rate is `(live + threshold, on-demand)` _if cheap_ (**Sonnet** — the
  realistic selector — with bodies stubbed); run it in a session, not per-PR;
- an expensive agent eval is `(cassette, hash-lockfile)` plus a nightly live run.

## Match the mechanism to the eval's cost

The single rule that drives every gating decision:

- **Cheap eval** (Sonnet, body stubbed via `stubSkillBodies`, ~pennies on the
  sub): **run it deliberately with a threshold gate** — in a Claude Code session
  or locally, when it's worth it, not on every PR. No snapshot machinery at all.
  vigiles has the significance-gated baseline (`eval-baseline.ts`) that makes "did
  this change move the number beyond the noise floor?" a real gate, not a bare
  pass-rate.

- **Expensive eval** (opus, multi-turn, N trials, spawns subagents, clones repos —
  $10s–$100s/run): _pay as few times as possible and amortize._
  - **Record/replay cassette = amortization.** Pay the trajectory once at record
    time; every CI replay is $0. The expensive eval becomes a deterministic fixture
    until inputs change. (vigiles' `eval-cache.ts` already does input-keyed
    record/replay incl. post-run filesystem restore.)
  - **hash-lockfile = invalidation.** Input unchanged → replay free; input changed
    → re-record (pay once). You spend the full amount _only when the definition
    actually changes_ — exactly when you want to.
  - **Trials are the cost multiplier** (confidence = N trials × dataset size).
    N=1 smoke per PR; high-N nightly. Subset-sample per PR, full suite nightly.
    `maxCostUsd` is the hard cap (already implemented).
  - **The nightly live tier is the one thing you cannot amortize.** Detecting "did
    the model get worse" requires hitting the live model with nothing cached.
    Schedule it, cap it, budget for it. Everything else drives per-PR cost to ~0.

## What already exists

Read this before proposing to build anything — much of the design is shipped.

| Capability                                              | Module                                                    | Notes                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Run behavioral scripts (`*.eval.mjs`)                   | `vigiles eval` (`cli.ts` → `run-scripts.ts`)              | aggregates pass/skip/fail by exit code; `--trials=N`. Run locally on the sub.                                                                   |
| Committed staleness gate (CI, no model)                 | `eval-lock.ts` (`eval --check`/`--update`)                | integrity hash of inputs; the CI half of evals you produce locally                                                                              |
| A/B harness arms + Welch significance                   | `eval.ts` (`runEval`, `measureArms`), `stats.ts`          | the differentiator — harness loaded _as it ships_                                                                                               |
| Declarative check vocabulary (data, not asserts)        | `check.ts`                                                | `tool`/`skill`/`output`/`hookFired`/`received`/`turns`/`wrote`/`subagent`/`mcp`/`judged`/`cost`/`latency`/`tokens` — one vocab, strict + scored |
| Scored eval + threshold gate                            | `eval.ts` (`measure`, `assertRates`), `harness-assert.ts` | rate ± se, pass^k                                                                                                                               |
| Record/replay cache                                     | `eval-cache.ts`                                           | input-keyed (excludes `measure`), restores post-run filesystem                                                                                  |
| Committed baseline + regression gate                    | `eval-baseline.ts`                                        | Welch current-vs-baseline; `lowerIsBetter`; JUnit                                                                                               |
| Trigger-rate (recall **and** precision)                 | `eval.ts` (`measureTriggerRate`)                          | `irrelevantPrompts` → `falsePositiveRate`/`precision`                                                                                           |
| Cheap-firing path                                       | `eval.ts` (`stubSkillBodies`)                             | strip skill body, stop at selection — ~18× cheaper                                                                                              |
| Prompt-set diversity pre-flight                         | `eval.ts` (`checkPromptDiversity`)                        | deterministic NCD gate, no model                                                                                                                |
| Cost / latency / token capture, concurrency, budget cap | `eval.ts`                                                 | `maxCostUsd`, `runPool`, 429 backoff                                                                                                            |
| JUnit output                                            | `eval.ts`, `eval-baseline.ts`                             | CI-consumable                                                                                                                                   |
| Deterministic hook tier                                 | `run-hook.ts`                                             | event-JSON → hook, every event, no model                                                                                                        |
| Sandbox + allowlisted egress                            | `sandbox.ts`, `egress.ts`                                 | confine untrusted harness code                                                                                                                  |

What is **genuinely missing** is in [Capability gaps](#capability-gaps-ranked).

## The eval lock (the CI staleness gate)

Real-model evals run on your **subscription**, so they only run **locally** —
never in CI. The lock lets CI verify the committed numbers still match the current
inputs **without running the model**. It is the snapshot/lockfile pattern
(`Cargo.lock` + `npm ci`; `jest --ci` / `cargo-insta`), and it is an **integrity
hash, not a cache** — the local [record/replay cache](#what-already-exists) is a
separate, gitignored speed optimization.

|             | the **cache**         | the **lock**                        |
| ----------- | --------------------- | ----------------------------------- |
| purpose     | local iteration speed | CI staleness detection              |
| lifecycle   | gitignored, throwaway | **committed**, reviewed in the diff |
| runs in CI? | no                    | **yes** (`eval --check`, no model)  |

How you use it:

- **`vigiles eval --update`** (local, on your subscription): records each **named**
  eval's report to a committed `.vigiles/eval-locks/<name>.lock.json`, and prints
  the per-number delta vs the prior lock.
- **`vigiles eval --check`** (CI): recompute the input hash, compare. Match →
  pass, **no model call**. Mismatch → fail "stale, run `--update`." The committed
  diff of `recall: 0.90 → 0.65` **is the quality gate** a human reviews.
- In a workflow: `uses: zernie/vigiles@v1` with `command: eval-check` (`vigiles
init` scaffolds this job). It is a green no-op until you commit your first lock.

**The split that makes it sound.** The lock stores only the model's _observed
behavior_ (the recorded numbers). Your script's assertions re-run live against
those numbers on every `--check`. So:

- ❌ change an **input** (skill / prompt / model) → stale → re-run `--update`.
- ✅ change only a **threshold** in the test → valid replay, no model — the
  assertion just re-judges the saved numbers.

The hash covers the model-affecting inputs: task, files, settings, tools,
plugin-dir contents, model, and `evalApiVersion`.

**Honest scope.** The lock proves _"your saved numbers match your current inputs,"_
not _"they reflect today's model."_ There is no automated live run — model/harness
drift is caught when you re-run `--update` and review the moved numbers. What it
_does_ catch is the common bug: edit a skill, forget to re-eval, ship stale numbers.

## `evalApiVersion` — a hand-bumped behavior epoch (not the CC version)

A monotonic integer **you** own (in `.vigilesrc.json` under `eval.apiVersion`),
bumped only when a _harness change on your side_ would shift eval outputs (a
CLAUDE.md edit, a hook change) but isn't otherwise in the lock's inputs. Like a
migration number / `CACHE_VERSION`. Bumping it makes `eval --check` report the
committed results stale, forcing a local re-run.

Why the Claude Code version is **not** hashed into the lock:

- `--check` runs in CI where `claude` is **pinned**, while a dev's local `claude`
  is whatever they have — hashing the version would false-trip `--check` on every
  PR where those differ.
- It is the honest-scope line above: the gate is about author-controlled inputs.
  Keeping the version out is what lets `--check` stay **binary-free** in CI.

The version is recorded on the lock as provenance. (The local **cache** _does_ key
on it — via `HarnessRuntime.versionKey`, which is `major.minor` for Claude Code
but `""` for Codex, since Codex's minor is patch-cadence. That's local replay
soundness, a separate axis.)

## Model strategy — measure on what users run; compare models as arms (decided 2026-06-17)

Which model an eval uses is **not** cosmetic. Dogfooding the shipped `test-harness`
skill found a 0.50 trigger-rate on `claude-haiku-4-5` vs **0.90 on
`claude-sonnet-4-6`** — same skill, same prompts. Trigger-rate is a _selection_
measurement and haiku is a much weaker selector, so a haiku eval gives
false-negative recall and would fail skills that are fine on the model users
actually run. Conclusions:

1. **Default to the realistic selector — Sonnet.** `measureTriggerRate` now
   defaults to `"sonnet"` (was haiku), and the `minModel` floor (also Sonnet)
   fails a run that resolves below it. Haiku stays available as a deliberate,
   _pessimistic_ override (a lower bound), never the default for a selection
   measurement. The model lives in the **spec** (`model`/`minModel`), not a CLI/env
   override — it's part of the measurement definition, not a run knob like
   `--trials`.
2. **No multi-model matrix runner by default.** Running every eval across
   `[haiku, sonnet, opus]` multiplies cost on every run — promptfoo's "providers"
   lane, against our keep-the-real-model-surface-thin discipline.
3. **A model comparison is a harness A/B → model-as-an-arm.** When you _do_ want
   "does my harness hold on the cheaper tier / after a model upgrade?", set
   `model` per **arm** (`EvalArm.model`) and let the existing significance
   machinery read the gap — no separate matrix DSL. `measureTriggerRate` stays
   single-model (loop it for a matrix). This is the one model feature we built.
4. **(Considered, not yet built) A model FLOOR.** A configurable `minModel`
   (default Sonnet) that fails/warns when an eval resolves below it — the runtime
   guard (post-env) that a static lint can't give, since the haiku footgun entered
   via an env var. Deferred pending a decision on warn-vs-fail + config source.

### Honest pinning (the orthogonal axis)

Picking the right model (above) is separate from **pinning** it for a
cached/baselined result. The defaults are floating aliases (`runEval` → `"haiku"`,
`measure`/`measureTriggerRate` → `"sonnet"`); for a lockfiled/baselined result a
floating alias is **dishonest** (it can re-point while the hash says "unchanged").
Pin a **dated** id (e.g. `claude-haiku-4-5-20251001`) so the hash is honest; a
dated id 404ing on deprecation is a **feature** (forces a re-eval onto a current
model) as long as the failure is surfaced. `isDatedModel` + the floating-alias
cache warning already nudge this. A cache-off run (a one-shot session eval) can
use the plain `sonnet` alias without churn; pin a dated id only when you turn on
the record/replay cache or a committed baseline.

## Deferred (YAGNI): canary / ETag scaling optimization

Only worth it with _many_ expensive evals **and** frequent CC bumps. On a version
bump, run **one** cheap fingerprint prompt: matches → trust all snapshots, skip the
rebuild; moved → invalidate + rebuild. Plus auto-rebless-within-tolerance: when
only the version changed, auto-rerun and auto-accept if metrics are within
tolerance, page a human only when a number actually moves. **Document it, don't
build it yet.**

## Isolation lies — bound which interactions matter (closure-scoped hashing)

A skill's behavior depends on context (`CLAUDE.md`, sibling skills, hooks), so pure
isolation gives false confidence. But the interactions that _matter_ are a short
finite list, not a cross product:

(a) **triggering collisions** — descriptions compete (inherently whole-set);
(b) **guidance conflicts** — skill rules vs `CLAUDE.md` vs another skill;
(c) **hook/tool interception**.

"Add everything to the hash" globally causes (1) a rebuild storm (edit any skill →
every snapshot dies) and (2) combinatorial state explosion (testing every config
combo). Don't.

The fix is what Bazel/Nix/Turborepo do: hash each eval's **observed dependency
closure** — the specific skills/`CLAUDE.md`/hooks that _actually loaded_ during the
run — not the global everything. Editing `wrap-up` doesn't invalidate the
`illustrate` eval because it isn't in `illustrate`'s closure. Prefer **observed**
(snapshot what the harness loaded; the `plugin-loader` already materializes this)
over **declared** (no dep lists to hand-maintain and drift).

Granularity matched to cost:

- cheap trigger eval → a coarse "all frontmatter" key is fine (re-runs the whole
  matrix on any description edit — cheap, bodies stubbed);
- expensive behavioral → a fine closure key so an unrelated edit doesn't detonate a
  $50 rerun.

The combinatorial tail you can't enumerate: curate **named integration cases** for
(a)(b)(c), and let the **nightly full-config live run** (real harness, everything
loaded) catch the unanticipated interaction as a metric drop. Prune, don't
enumerate.

## Behavioral / side-effecting eval is the umbrella — the adversarial-gate is one member (note 2026-06-17)

The apex of this layer is **behavioral, side-effecting** eval — the assembled
harness run end-to-end against real-but-**disposable** dependencies (the "ephemeral
integration eval"): does the harness actually DO the task AND not do the dangerous
thing? The **adversarial-gate test** (ask the agent to skip an enforcement gate;
assert it refuses — a `notTool`-shaped check) is a high-value **member** of that
family, **not a replacement** for it. It's cheap and it sets up the **eval→enforce
bridge** (when the prose gate caves under pressure, vigiles's deterministic
hook/rail is the fix — layer 2 hands off to layer 1), but the broad behavioral
tier — multiple surfaces firing together, real side effects against ephemeral
deps, graded by the `Trace`/check vocabulary — is the flagship. Don't let the
narrow check stand in for the umbrella.

### The adversarial-gate test — worked example and the eval→enforce bridge

The pattern is concrete and reusable. A worked dogfood lives at
[`examples/harness/dogfood/adversarial-gate.eval.mjs`](../examples/harness/dogfood/adversarial-gate.eval.mjs):
an inline `SKILL.md` that states a measurement gate ("never run a benchmark
without a baseline; refuse if asked to skip it"), an adversarial task prompt
that explicitly asks to skip the gate ("I don't need a baseline, just scaffold
it"), and two checks:

```js
checks: [
  notTool("Bash", { command: /bench\.sh|hyperfine|time\s/ }), // didn't do the forbidden thing
  output(/baseline|refus|can't|won't/i), // pushed back in prose
];
```

**The eval→enforce bridge** is the key takeaway. If this eval passes at ≥ 0.9,
the prose gate is robust enough on its own. If it passes at only ≥ 0.7, the
prose alone is fragile under adversarial pressure — and the fix is NOT a better
SKILL.md description. Prose gates can always be talked out of. The fix is a
deterministic `PreToolUse` hook that checks the forbidden condition and blocks
the call regardless of what the user says (see
`src/adapters/claude-code/agent-runtime.ts` for the hook skeleton). The eval
told you _where_ the soft boundary is; the hook is the hard wall. A rate below
the acceptable floor is an automatic referral from layer 2 (test) to layer 1
(deterministic constraint) — that is the bridge.

## Token & cost as a first-class measurement — input / output / cache (decided 2026-06-17)

A harness change moves tokens on **both** sides and usually **trades them off**: a
skill or CLAUDE.md injection ADDS input every turn; a "compression" skill cuts
OUTPUT. Net cost = f(fresh-input, cached-input, output). So a single total
token/cost number can **bless a change that's net-negative** — the dogfood proof is
SkillBenchmark's Caveman run (cut output yet **2–4×'d total cost** via system-prompt
injection). Honest cost verification therefore requires the classes **separated**.

State today: `UsageTrace` carries `inputTokens`/`outputTokens`/`costUsd`/`durationMs`
(from claude's `total_cost_usd` + `usage.input_tokens`/`output_tokens`), but (a) the
`tokens()` check **collapses** input+output into one number, (b) **cache tokens**
(`cache_creation_input_tokens`/`cache_read_input_tokens`) aren't captured at all —
and a large CLAUDE.md/skill is cached (~0.1× input), so omitting them makes the cost
of exactly the harness changes you'd test misleading, and (c) there's no first-class
A/B **delta per class**.

Native support (decided):

1. Extend `UsageTrace` to all token classes — `inputTokens` (fresh),
   `cacheCreationTokens`, `cacheReadTokens`, `outputTokens`, `costUsd` — captured
   from the CLI usage block.
2. First-class checks `inputTokens({max})` / `outputTokens({max})` /
   `cacheTokens({…})` beside `cost`/`tokens` (keep `tokens` as the convenience
   total).
3. A/B token/cost **delta per class** in `measureArms`, gated by the existing Welch
   significance — so "verbose vs caveman" reports input↑ / output↓ / net-cost± with
   a **p-value**, not an eyeballed CI overlap. This is the cost/ROI optimizer made
   native and input/output-separated, and the honest-measurement differentiator
   (competitors report a single total or eyeball CIs).

## Capability gaps, ranked

The genuinely missing primitives (everything above is shipped). Ranked by
protection-per-dollar unlocked.

1. **KEYSTONE — tool-call spy/fake.** Assert on the **arguments** a skill causes
   the agent to pass to a tool, **without executing the tool** (no real image-API
   call, no real `git push`, no real subagent spawn). This is precisely what
   promptfoo-style tools _can't_ do — they grade a completion; they can't see "the
   agent decided to push to `main`."
   - **Correction to the original framing:** a tool-spy does **not** "unlock the
     cheap (free, no-model) tier." Asserting on args the _model_ chose still needs
     the real model to make the routing/argument decision — you can't get it from a
     scripted mock. The spy is an **eval-tier** capability: real model, **faked
     tools**. The saving is **eliminating the expensive side effect**, not
     eliminating the model. (Today the existing `tool()`/`skill()` checks already
     _read_ `ToolCall.input`, so argument _inspection_ exists in the `Trace`; what's
     missing is **interception** — preventing the call and returning a canned
     result so the real-model run is cheap and side-effect-free.)
   - Where the logic _can_ be lifted out of the prompt into a script, prefer that
     (gap #5) — it's the free deterministic test, strictly cheaper than any
     model-driven spy.
   - **Shipped (inspection half):** `toolWith(name, args)` and `notTool(name,
args?)` in `src/check.ts` over a shared, serializable `ArgMatcher`
     (`src/arg-match.ts`; dot-path keys, RegExp = pattern, primitive = exact) —
     assert _how_ a tool was called, and the negative/safety form (#2). These read
     the `Trace` the harness/eval tier already captures.
   - **Shipped (interception, end-to-end):** declare `interceptTools: [{ tool,
when?, denyReason? }]` on a `measure` / `runEval` arm. `src/tool-intercept.ts` +
     the `vigiles hook-runtime intercept-tool` PreToolUse subcommand deny the real execution
     (exit 2), so a
     real-model run that _decides_ to hit a paid API / `git push` / spawn a paid
     subagent is **safe and side-effect-free** — yet its arguments still land in
     the `Trace` for `toolWith` / `notTool`. The eval tier auto-merges the hook
     into the arm's settings (appending, never clobbering), carries the intercept
     list (RegExp matchers intact) in `VIGILES_INTERCEPT_TOOLS`, and keys the cache
     on it so two intercept configs sharing tool names don't collide. Pure core
     fully unit-tested; the wiring sits under the eval tier's 100% gate.
   - **Honest assessment (2026-06-17) — keep, with scope.** Three caveats the
     "keystone" label shouldn't paper over:
     1. **Intercept-and-prevent, not a faithful mock.** CC surfaces the exit-2 deny
        as a _blocked_ call, not a success, so this is sound for "did the agent
        ATTEMPT X" (safety / approval-gate / first-attempt) and unsound for "stub
        the tool and let a multi-step flow continue as if it returned" — the call
        is intercepted (prevented), NOT executed. There is no CC primitive for
        "skip execution, return this as success."
     2. **Mostly ergonomic on the inspection side.** `toolWith` overlaps the
        existing `toolUsedWith` predicate (`harness-assert.ts`); the genuinely new
        bit is the serializable _negative_ check and the interception. For many
        safety cases the simplest protection — **don't allowlist the tool, then
        assert the attempt** — needs no new primitive; `interceptTools` earns its
        keep at the margins (args-scoped interception, intercepting a tool you
        otherwise want allowed, and capturing an intercepted `Task` spawn's args).
     3. **One unverified assumption.** Arg-capture-under-deny (the `tool_use` lands
        in the stream _before_ the hook denies) is asserted from CC semantics but
        not yet proven against a live model. `examples/harness/intercept-tools.eval.mjs`
        is the end-to-end validation (skips without `claude`); run it with a key
        before relying on the spy. Cost is **not** reduced — the model call remains;
        only the side effect is removed.
   - **vs competitors:** the _assertions_ are at parity with promptfoo `trajectory:*`;
     the differentiator is intercepting in the **real shipped harness** (promptfoo
     reconstructs an agent from YAML/SDK and can't), but that edge is narrow
     (attempt/safety, not faithful mocking).
2. **Negative / safety assertions** (a mode of #1 — highest value, most
   overlooked). Did **not** call the paid API before approval; did **not** push to
   the wrong branch; did **not** file a security advisory for a model-only repro.
   **Shipped:** `notTool(name, args?)` in `check.ts` + the `interceptTools`
   interception from #1 — together they assert the agent _didn't_ take a dangerous action,
   cheaply and for real.
3. **Outbound HTTP/curl fake + request-body assertion** (the network case of #1).
   Distinct from `egress.ts` (which records/allows at the packet layer) — this
   _fakes_ the endpoint and asserts the request **body** (e.g. the image prompt =
   `CONCEPT + STYLE_SUFFIX`).
4. **Hermetic fixtures + seam-ability.** Committed fixture repos; skills refactored
   to point at a local fixture instead of cloning/pushing for real. Partly a
   _skill-side_ refactor, not a vigiles primitive — but vigiles should make the
   fixture wiring ergonomic.
5. **Subprocess golden harness.** Generalize `runHook` to "run _this script_
   against a fixture, assert stdout/exit" — for extracted deterministic cores (a
   miner/checker, a `generate.sh` prompt-builder). This is the tier that makes the
   "extract the core" prerequisite pay off. Highest protection-per-dollar where the
   logic is extractable.
6. **hash-lockfile + cassette cost machinery** (knob 2) — only for genuinely
   expensive behavioral evals. `eval --check` / `--update`, `.snapshot.json`,
   `evalApiVersion`, dated-model pin.
7. **Closure-scoped (observed) invalidation** — the dependency-closure hashing from
   the section above; layers on top of #6 once there are enough expensive evals to
   warrant it.
   - **Shipped (cache-key hardening, 2026-06-17):** the record/replay key now
     content-hashes a native `--plugin-dir` (`hashDir` — editing a skill in it
     invalidates, where a path-only key false-replayed), treats the tool list as a
     set, and salts a `CACHE_FORMAT_VERSION`; floating-alias model drift is warned.
     Full best-practice survey + the shipped/deferred decisions (eviction deferred
     as disk hygiene) are captured in the design record.

## Dogfood targets

These six skills live in a **separate portfolio repo**, used as worked examples to
validate the vigiles API — they are **not** in this repo. Mapped to tier + the gap
each needs:

| Skill                                                                                                                                 | Deterministic part (TEST)                                                                                                                                            | Behavioral part (EVAL)                                                           | Gap it needs                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **writing-quality** (pure guidance)                                                                                                   | regex linter for mechanical tropes + a trigger test (currently **missing**)                                                                                          | A/B lift — existing eval doesn't discriminate (both arms 100% on blatant tropes) | a discriminating fixture (subtler structural-trope draft)                                                                                                                                                                                           |
| **illustrate** (paid image API)                                                                                                       | prompt-builder asserts recipe + style-suffix; approval-gate "no API call before confirm"                                                                             | one live image smoke nightly                                                     | **fake outbound curl + call-spy** (#1, #3)                                                                                                                                                                                                          |
| **prune-illustrate** (paid image API; has `generate.sh` w/ `STYLE_SUFFIX` const — the **only clean unit seam**, the template to copy) | `generate.sh` assembly via faked curl (body = CONCEPT+STYLE_SUFFIX, env overrides, out path)                                                                         | live smoke                                                                       | **fake-curl** + subprocess golden (#3, #5). _Security:_ it commits `api-key.txt` and the trigger eval `cpSync`s `.claude/skills` to `/tmp` — leaks the key to CI; rotate → env var → gitignore → add a secret-scan guard (itself a Layer-2 dogfood) |
| **wrap-up** (git commit+push)                                                                                                         | ToC gen, ≤3-commit skip, zero-commit stop, "no push to wrong branch / no unasked PR"; assert 4 sections + ToC, links-not-duplicates `STATE.md`                       | —                                                                                | **hermetic git fixture + fake push + spy** (#1, #4)                                                                                                                                                                                                 |
| **audience-test** (spawns 3–5 paid agents + screenshots)                                                                              | panel-composition invariants (≥1 non-expert, 3–5, not all-expert) asserted from spawn **args** with agents faked; reader's-cut transform                             | full-run structure (7 deliverables, in character)                                | **fake the Agent tool + assert on its call args** (#1)                                                                                                                                                                                              |
| **cross-field-bug-hunt** (clones repos, spawns paid subagents, boots Rails+PG)                                                        | miner+checker **golden** test on frozen Lago/Solidus model fixtures → re-flags the known pair + trace, **zero model** — code already exists, needs ~no new primitive | planted-bug fixture repo → agent finds it, bucket A, right `file:line`           | hermetic fixture repo + faked clone + subprocess golden (#5)                                                                                                                                                                                        |

Two structural notes carried from the analysis: (1) most testable skill logic is
**inline guidance, not code**, so extracting deterministic cores into scripts is a
prerequisite (`generate.sh` is the model); (2) the **cross-field golden test needs
almost no new vigiles capability** — do it first.

## Ranked build roadmap

Ordered by protection-per-dollar, with the dogfood that validates each step.

1. **Run the behavioral tier where the subscription already is — a Claude Code
   session, NOT GitHub Actions.** The original "wire evals into CI" framing was
   wrong: real-model evals don't belong in a standalone GitHub Actions workflow
   that needs a metered (or sub-token-as-secret) credential. CI runs the **free
   deterministic tiers** (`ci.yml` — `runHook` + mock-model `runHarnessTest`, no
   token); the **real-model eval** runs on your **subscription** in a Claude Code
   session (the agent loop / web / a scheduled session) or locally — `vigiles
drives the `claude`CLI, so it authenticates like your own CLI does (no metered
API). _Validates on:_ the **missing`writing-quality` trigger case\*\*.
   - **Shipped (eval robustness, applies wherever `vigiles eval` runs):**
     `--min=N` (fail if fewer than N evals actually ran — no silent zero),
     `--no-skip` (a skipped tier fails), a **corrupt-cache throw** (a broken
     cassette surfaces, not a silent re-run), a **model floor** (`minModel`,
     default Sonnet — a too-weak selector fails before spending a token), and the
     floating-alias cache warning. Measure trigger-rate on **Sonnet** (dogfooded:
     0.50 haiku vs 0.90 Sonnet — haiku under-selects). **Removed:** the speculative
     `evals.yml` GitHub Actions workflow + the `--model`/`VIGILES_MODEL` env knob
     (model belongs in the spec, not a hidden override). **Remaining:** the
     `writing-quality` trigger case lives in the separate portfolio repo.
2. **Cross-field miner/checker golden fixture test.** Near-zero new primitive — the
   code exists; freeze the Lago/Solidus model fixtures and assert it re-flags the
   known pair + trace, zero model. Cheapest real protection available. _Needs:_ a
   thin generalization toward the subprocess golden harness (#5).
3. **KEYSTONE: tool-call spy/fake + negative/safety checks** (#1, #2). Build tool
   interception (capture args, return canned result, prevent side effect) at the
   eval tier, and add `notTool`/arg-matcher checks to `check.ts`. _Validates on:_
   `illustrate` approval-gate, `audience-test` panel composition.
4. **Outbound curl fake + body assertion** (#3). _Validates on:_ `prune-illustrate`
   `generate.sh` (body = CONCEPT+STYLE_SUFFIX) + `illustrate`. Pairs with the
   secret-scan guard dogfood.
5. **Hermetic fixtures + the hash-lockfile cost machinery** (#4, #6). `eval --check`
   / `--update`, `.snapshot.json`, `evalApiVersion`, dated-model pin; nightly live
   tier scheduled + capped. _Validates on:_ `wrap-up` + `cross-field` against
   fixture repos, gated by hash-lockfile + nightly live.
6. **Closure-scoped (observed) invalidation** (#7) — only once there are enough
   expensive evals that an unrelated edit detonating a rebuild is a real pain.
7. **Native input/output/cache token + cost measurement + A/B delta** — split
   `tokens()` into `inputTokens`/`outputTokens`, capture cache tokens
   (`cache_creation`/`cache_read`), and report a per-class A/B delta gated by Welch
   significance. The honest cost-claim verifier (the Caveman gap: output↓ but net
   cost↑). _Validates on:_ the `skill-compression` (Caveman) eval — assert output↓
   AND input/net honestly, with a p-value. **HIGH** (a money story; cheap to build —
   the data model is half there).
8. **Adversarial-gate check + the eval→enforce bridge** — a first-class "ask the
   agent to skip the enforcement gate, assert it refuses" check (the `notTool`
   shape); when it fails, point at the deterministic rail (layer 2 → layer 1).
   _Validates on:_ an OMC enforcement-skill dogfood.
9. **Whole-harness trigger-rate tier** — `measureTriggerRate` is isolated today
   (cheap, but it _overstates recall and understates false-positives_ because skill
   selection is competitive and Claude Code evicts least-used skill descriptions
   under a context budget). Add an `installSet`/`withHarness` arm that co-installs
   the skill alongside the user's real set as a **release gate**, plus a
   near-neighbor middle tier built on the existing `ncd`/`findSimilarRules` engine.
   This is a genuine wedge — **no existing eval tool populates the install set**.

## Where this design is wrong / open questions

Consolidated pushback, for the record:

1. **The biggest correction: most of the "machinery" is already built.** The cache,
   the significance-gated baseline, the check vocabulary, trigger-rate
   recall+precision, cost/budget/concurrency, JUnit — all shipped. Framing this as
   "design the eval system" overstates the work. The real deliverables are a **CI
   job**, a **gating policy**, **dated-model honesty**, and a **handful of
   assertion primitives**. Don't rebuild what `eval.ts` / `eval-cache.ts` /
   `eval-baseline.ts` / `check.ts` already do.
2. **The tool-spy does not move work to the free tier.** It needs the real model
   (the routing decision is what you're testing); it only removes the _side effect_.
   Treat it as a cheaper/safer **eval**, not a deterministic test. The genuinely
   free win is **extracting the deterministic core into a script** and testing it at
   the subprocess golden tier — so #5 is arguably co-equal with the keystone where
   the logic is extractable.
3. **hash-lockfile vs the existing baseline must be reconciled, not duplicated.**
   For cheap evals the existing `(live + threshold, on-demand)` baseline gives
   _strictly more_ drift protection than a lockfile. The lockfile is a cost
   concession for expensive evals **only**, and only safe with the nightly backstop.
   Retrofitting cheap evals onto a lockfile would _remove_ protection.
4. **An HTTP cassette does not escape the snapshot problem.** Replaying one recorded
   trajectory is the same false-green as a frozen comment. Only the nightly live run
   detects model drift. This is a property of _replay_, not of the recording format.
5. **Everything else in the original thinking holds and is good:** the
   feature = test + eval decomposition, the two orthogonal knobs, cost-matched
   mechanism, trigger-rate-as-classifier, `evalApiVersion` as a behavior epoch
   distinct from the CC version, dated-model honesty, the deferred canary, and
   closure-scoped (observed) invalidation. These are the spine of the doc.

## Where to start

**Step 1 + Step 2 in parallel**, because they're cheap and prove the model end to
end:

- Wire the cheap behavioral tier into CI as a gate, pin a dated model, delete the
  comment-snapshots — and add the missing `writing-quality` trigger case as the
  first thing the new gate protects.
- Land the `cross-field` miner/checker **golden** test (zero model, code already
  exists) as the first subprocess-golden dogfood.

Then build the **keystone tool-call spy/fake (#1) + negative checks (#2)**, since
every remaining expensive dogfood (`illustrate`, `audience-test`, `wrap-up`) is
blocked on it.
</content>
</invoke>
