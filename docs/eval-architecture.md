# Eval architecture — how vigiles tests Claude Code harness features

> Status: design of record (2026-06-16). Captures the conceptual model behind
> the two testing verbs (`vigiles test` / `vigiles eval`), reconciles it with
> what the codebase **already** ships, and ranks the genuine remaining gaps into
> a build roadmap. Companion to [`harness-testing.md`](harness-testing.md) (the
> user guide), [`research/eval-api-landscape.md`](../research/eval-api-landscape.md)
> (the field + the B→A→C build log), and
> [`research/testing-api-design.md`](../research/testing-api-design.md) (the
> check-vocabulary shape).

## The kicker

Real-model evals never run in CI. They're invoked manually (`npm run test:eval`),
and their results get frozen as `FINDING:` comments baked into the `*.eval.mjs`
files. **A snapshot of a past run is documentation, not protection** — edit a
skill description and break its trigger rate, and CI stays green because nothing
re-ran the classifier. promptfoo et al. run the real model in CI as a gate; we
don't. This doc is the reevaluation.

The honest scope correction up front: the gap is **narrower than "build an eval
runner."** vigiles already has `vigiles eval` (discovers + runs `*.eval.mjs`,
aggregates exit codes), a record/replay cache, a significance-gated committed
baseline, a declarative check vocabulary scored across trials, and trigger-rate
with recall **and** precision. What's missing is (1) a **CI job that runs the
behavioral tier as a gate**, (2) a **cost-appropriate gating policy** so that job
is affordable, (3) **honest model pinning** so a cached/lockfiled result can't
hide drift, and (4) a small set of **new assertion primitives** (chiefly the
tool-call spy/fake) that unlock cheap protection for side-effecting skills. See
[What already exists](#what-already-exists) before building anything.

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
discipline (`research/eval-api-landscape.md`): of all harness questions, only two
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
2. **Gating** — when CI pays to run it:
   `every-PR` | `hash-lockfile` | `nightly/manual`.

The snapshot/hash machinery is **just the `hash-lockfile` value of knob 2** — one
option most features never pick. Concretely:

- a hook is `(exact-assert, every-PR)` — `runHook`, free;
- trigger-rate is `(live + threshold, every-PR)` _if cheap_ (haiku, bodies stubbed);
- an expensive agent eval is `(cassette, hash-lockfile)` plus a nightly live run.

## Match the mechanism to the eval's cost

The single rule that drives every gating decision:

- **Cheap eval** (haiku, body stubbed via `stubSkillBodies`, ~pennies): **just run
  it every PR with a threshold gate.** No snapshot machinery at all. This is the
  `(live + threshold, every-PR)` cell — and vigiles already has the
  significance-gated baseline (`eval-baseline.ts`) that makes "did this PR move the
  number beyond the noise floor?" a real gate, not a bare pass-rate.

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
| Run behavioral scripts (`*.eval.mjs`)                   | `vigiles eval` (`cli.ts` → `run-scripts.ts`)              | aggregates pass/skip/fail by exit code; `--trials=N`. **Not wired into CI yet.**                                                                |
| A/B harness arms + Welch significance                   | `eval.ts` (`runEval`, `measureArms`), `stats.ts`          | the moat — harness loaded _as it ships_                                                                                                         |
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

## The hash-lockfile, concretely — and how it relates to the baseline we already ship

This is the **one new piece of cost machinery** worth building, and it must be
reconciled with the existing `eval-baseline.ts`, not duplicate it.

The lockfile (lockfile semantics, jest ergonomics):

- Per expensive eval: a `.snapshot.json` = `{ inputsHash, model, results, builtAt,
evalApiVersion }`.
- `vigiles eval --check` (CI): recompute the hash from current inputs, compare.
  Match → pass, **no model call**. Mismatch → fail "stale, run `--update`."
  (This is `npm ci`.)
- `vigiles eval --update`: re-run the model, rewrite results + hash. A **human
  reviews the committed diff** — recall dropped? precision dropped? **that diff is
  the quality gate**, like reviewing a lockfile bump or a `cargo-insta` snapshot.

### Reconciliation (important — do not replace the good thing with the cheap thing)

vigiles already answers "did this change regress behavior?" with
`eval-baseline.ts`: it **re-runs the model every time** and fails on a
_significant_ negative delta vs. a committed baseline. That is the
`(live + threshold, every-PR)` mechanism — and for a **cheap** eval it gives
_strictly more protection_ than a hash-lockfile, because it catches model drift on
every PR, not just when inputs change.

The hash-lockfile is **purely a cost concession for expensive evals**: it trades
away per-PR drift detection (you only re-run when inputs change) in exchange for
not paying every PR. That trade is only safe **with the nightly live tier as
backstop** to catch the drift the lockfile is blind to.

So they are two values of knob 2, both wanted, picked by cost — not competitors:

| Eval cost                    | Reproducibility  | Gating                               | Drift caught by        |
| ---------------------------- | ---------------- | ------------------------------------ | ---------------------- |
| cheap (stubbed, haiku)       | live + threshold | every-PR (`assertRates` / baseline)  | the PR gate itself     |
| expensive (opus, multi-turn) | cassette         | hash-lockfile (`--check`/`--update`) | nightly live tier only |

**Do not retrofit cheap evals onto the hash-lockfile** — that would _remove_
protection to save money you don't need to save. The lockfile is for the evals
that genuinely cost $10s+.

## `evalApiVersion` — a hand-bumped behavior epoch (not the CC version)

A monotonic integer **you** own, bumped only when a _harness change on your side_
would shift eval outputs (a CLAUDE.md edit, a hook change, a prompt-builder
change). Like a migration number / `CACHE_VERSION` / a snapshot-format byte. It is
**distinct** from `eval-baseline.ts`'s `BASELINE_VERSION` (that versions the
on-disk _shape_; this versions the _behavior contract_).

Why not hash the real Claude Code version into the key:

- CC ships ~daily (hundreds of npm versions in ~16 months; a patch most days).
  Hashing the full version = a guaranteed daily rebuild of every snapshot.
- semver versions the **interface**, not the agent's **behavior** — skill
  triggering can shift on a patch with no major bump.

So no external version is a valid cache key. Keep three honest signals instead:

1. your own **`evalApiVersion`** for harness-side changes,
2. a **dated model id** for model behavior (below),
3. the **nightly live tier** for the drift no version number announces.

(A configurable `major.minor`-only CC key is fine but only tunes the
precision/recall of the key; the canary below is what truly escapes it.)

## Pin a dated model id

Today the defaults are floating aliases (`runEval` → `"haiku"`, `measure` →
`"sonnet"`). For a lockfiled/baselined result that is **dishonest**: the alias can
re-point to a new model while the hash says "unchanged" — a false-green hidden
behind green. Pin a **dated** id (e.g. `claude-haiku-4-5-20251001`) so the hash is
honest. A dated id 404ing on deprecation is a **feature** — it forces a re-eval
onto a current model — as long as the failure is surfaced clearly ("model X
deprecated, re-eval on a current model"). This is a small, concrete, high-value
change to the eval defaults/config.

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

## Reuse vs reinvent (corrected for what's already built)

The instinct "don't rebuild promptfoo" is right. First, a constraint correction:
the binding rule is **no required SaaS**, _not_ zero dependencies. A local library
(Apache/MIT) that runs in-process and needs no hosted account is fair game; the
core stays lean and optional integrations are peer deps (the `vitest`/`jest` seams
already work this way). So neither Polly.js nor promptfoo is excluded _for being a
dep_ — the case against each has to stand on its own merits, and it does:

- **Record/replay (Polly.js / nock-back):** vigiles **already has** an input-keyed
  record/replay cache (`eval-cache.ts`) with filesystem restore, so a second
  recording layer is redundant — but the deciding reason is deeper: an HTTP-level
  cassette would _not_ solve the core CI problem. Replaying a recorded run freezes
  **one** trajectory, which is the same false-green risk as a comment snapshot,
  regardless of recording format. The only true protection is re-running live
  (nightly tier). **Don't add Polly** — not because it's a dep, but because the
  missing layer is _when to invalidate_ (hash-lockfile), not _how to record_.
- **promptfoo as a grader engine:** vigiles **deliberately PUNTED** promptfoo
  interop (`eval-api-landscape.md`, Phase E). promptfoo is MIT and runs locally, so
  "no-SaaS" does **not** rule it out — the punt is **strategic**: don't chase
  eval-framework parity. The durable edge is cost + safety (the cheap no-model
  tiers + sandboxing), promptfoo is real-model-only and expensive, and the thin
  graders we need (precision/recall, a `judge.ts` rubric) already exist. Reverse
  only on real inbound demand — and if so, as an **optional bridge**, not a core dep.

Where borrowing _is_ still right:

- **Client + agent loop:** the `claude` CLI you already drive (`AgentRunner`).
- **precision/recall/F1:** ~20 lines, already in-tree — keep it in-tree (trivial,
  not worth a dep), but adding a dep here was never the objection.
- **Graders:** `judge.ts` (LLM rubric) exists; deepen only if a dogfood needs it.

Reality check on the norm: most LLM-eval shops **don't gate per-PR at all** — they
run nightly + threshold + dashboard, and per-PR only cheap deterministic checks.
The hash-lockfile is cleverer than the norm; reach for it **only** where eval cost
forces you to.

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
2. **Negative / safety assertions** (a mode of #1 — highest value, most
   overlooked). Did **not** call the paid API before approval; did **not** push to
   the wrong branch; did **not** file a security advisory for a model-only repro.
   Needs a `notTool(name, argsMatcher?)` check in `check.ts` plus the interception
   from #1. The vocabulary today has no negative check.
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

## Dogfood targets

These six skills live in a **separate portfolio repo**, used as worked examples to
validate the vigiles API — they are **not** in this repo. Mapped to tier + the gap
each needs:

| Skill                                                                                                                                 | Deterministic part (TEST)                                                                                                                                            | Behavioral part (EVAL)                                                           | Gap it needs                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **writing-quality** (pure guidance)                                                                                                   | regex linter for mechanical tropes + a trigger test (currently **missing**)                                                                                          | A/B lift — existing eval doesn't discriminate (both arms 100% on blatant tropes) | a discriminating fixture (subtler structural-trope draft)                                                                                                                                                                                            |
| **illustrate** (paid image API)                                                                                                       | prompt-builder asserts recipe + style-suffix; approval-gate "no API call before confirm"                                                                             | one live image smoke nightly                                                     | **fake outbound curl + call-spy** (#1, #3)                                                                                                                                                                                                           |
| **prune-illustrate** (paid image API; has `generate.sh` w/ `STYLE_SUFFIX` const — the **only clean unit seam**, the template to copy) | `generate.sh` assembly via faked curl (body = CONCEPT+STYLE_SUFFIX, env overrides, out path)                                                                         | live smoke                                                                       | **fake-curl** + subprocess golden (#3, #5). _Security:_ it commits `api-key.txt` and the trigger eval `cpSync`s `.claude/skills` to `/tmp` — leaks the key to CI; rotate → env var → gitignore → add a secret-scan guard (itself a Pillar-2 dogfood) |
| **wrap-up** (git commit+push)                                                                                                         | ToC gen, ≤3-commit skip, zero-commit stop, "no push to wrong branch / no unasked PR"; assert 4 sections + ToC, links-not-duplicates `STATE.md`                       | —                                                                                | **hermetic git fixture + fake push + spy** (#1, #4)                                                                                                                                                                                                  |
| **audience-test** (spawns 3–5 paid agents + screenshots)                                                                              | panel-composition invariants (≥1 non-expert, 3–5, not all-expert) asserted from spawn **args** with agents faked; reader's-cut transform                             | full-run structure (7 deliverables, in character)                                | **fake the Agent tool + assert on its call args** (#1)                                                                                                                                                                                               |
| **cross-field-bug-hunt** (clones repos, spawns paid subagents, boots Rails+PG)                                                        | miner+checker **golden** test on frozen Lago/Solidus model fixtures → re-flags the known pair + trace, **zero model** — code already exists, needs ~no new primitive | planted-bug fixture repo → agent finds it, bucket A, right `file:line`           | hermetic fixture repo + faked clone + subprocess golden (#5)                                                                                                                                                                                         |

Two structural notes carried from the analysis: (1) most testable skill logic is
**inline guidance, not code**, so extracting deterministic cores into scripts is a
prerequisite (`generate.sh` is the model); (2) the **cross-field golden test needs
almost no new vigiles capability** — do it first.

## Ranked build roadmap

Ordered by protection-per-dollar, with the dogfood that validates each step.

1. **CI wiring + cheap-tier gate (do first, smallest, highest leverage).** Add a CI
   job that runs the _cheap_ behavioral tier (`measureTriggerRate` + `measure` with
   `stubSkillBodies`, haiku) as a **gate** with `assertRates`/`assertTriggerRate`,
   and stop snapshotting scores in comments. This is mostly a workflow + a dated
   `--model` default; it directly kills the kicker for the cheap evals. _Validates
   on:_ the **missing `writing-quality` trigger case** (add it, gate it).
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
   For cheap evals the existing `(live + threshold, every-PR)` baseline gives
   _strictly more_ drift protection than a lockfile. The lockfile is a cost
   concession for expensive evals **only**, and only safe with the nightly backstop.
   Retrofitting cheap evals onto a lockfile would _remove_ protection.
4. **Polly.js / promptfoo borrow-suggestions are stale — but not on dep grounds.**
   The binding constraint is _no required SaaS_, not zero-dep, so a local library
   is allowed. The real reasons to drop them: the cache already exists and an HTTP
   cassette doesn't escape the snapshot trap (Polly); and promptfoo (MIT, local)
   was punted _strategically_ — don't chase eval-framework parity; the edge is the
   cheap/safe tiers. If promptfoo ever returns, it's an optional bridge, not a core
   dep. Dropped from the roadmap either way.
5. **An HTTP cassette does not escape the snapshot problem.** Replaying one recorded
   trajectory is the same false-green as a frozen comment. Only the nightly live run
   detects model drift. This is a property of _replay_, not of the recording format.
6. **Everything else in the original thinking holds and is good:** the
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
