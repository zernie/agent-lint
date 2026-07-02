---
status: active
topic: spec
---

# Typed contracts for agents — the durable purpose of the spec under measurement

> Status: strategy synthesis (2026-06-19). Under the measurement reframe,
> what is the spec FOR — given markdown wins for authoring a
> CLAUDE.md? Answer: not authoring instruction files, but turning **skills/agents from
> prose-vibes black boxes into typed, contract-bound, side-effect-explicit UNITS that are
> cheap + deterministic to test** — which is exactly what makes the measurement identity
> affordable and rigorous. Railway / Result / monads applied to agents. Companion to
> `shareable-presets.md`, `railway-subagents.md`,
> `fp-for-agent-harness.md`.

## The question

If measurement is the identity and markdown wins for the CLAUDE.md, **do specs still have a
purpose?** Yes — a sharper one than before.

## The answer: specs make skills/agents TESTABLE, which is what measurement runs on

A prose skill/agent is a black box: the only way to know if it worked is to run it and have a
**model judge** the prose output — fuzzy, expensive, non-deterministic. A **typed contract**
turns it into a function you **assert**: `Result<S,E>`, declared side-effects, typed steps.
Deterministic assertion replaces the LLM-judge wherever the output is structured → measurement
becomes **cheap, rigorous, and deterministic where possible.** So the spec is the contract
layer the measurement identity depends on; its center of gravity moves from _author a doc_ to
**contract a unit.**

## Three axes of the typed contract (vigiles has the primitives; they were underweighted)

### 1. Railway / Result / monads for agents (the big one)

- Each agent is `Input → Result<Success, Error>` (the Either monad). `railway()` composes them
  (bind); a failed step short-circuits to a **deterministic error track with bounded recovery.**
- Why it matters: **deterministic control-flow over probabilistic work.** The orchestrator
  _knows_ a step failed (typed `err`) and recovers deterministically, instead of a model vibing
  "did that work?" The agent's WORK stays probabilistic; the agent's CONTROL FLOW becomes
  deterministic.
- Testability: `assertAgentOk/Err/Result` the typed outcome, don't eyeball prose.
- Already shipped: `result()` / `railway()` / `delegate()` + `parseAgentResult` (the
  `vigiles:ok/err` block → discriminated `Result`). Underweighted.
- It's "make illegal states unrepresentable" for control flow: "succeeded-and-errored" and
  "ran past a failure unhandled" become unrepresentable.

### 2. Side-effect boundaries for skills

- A typed skill declares **where it writes/calls** (the side-effect points) + its **output
  contract** + its **steps with gates**.
- Why testable: you know where to **intercept / mock / assert** (the `step()` / `gate()` /
  `input()` primitives + `tool-intercept` / `notTool`). A plain-md skill buries its side effects
  in prose, so the only test is "run it and eyeball."
- The user's exact point: clear outputs + explicit side-effect placement makes a skill **so
  much easier to test than a plain `.md`.**

### 3. Shareable typed templates that carry their proof

- The preset play (`shareable-presets.md`) generalized beyond CLAUDE.md to **SKILL.md and
  agents**: `extends` a base, compiles to the artifact, **bundles its evals.**
- Under measurement: a shared template ships with its **measured effectiveness** ("this agent
  template scores X on the benchmark"). Templates carry **proof**, not just text — the network
  effect is "install the contract _and_ its evidence."

## Where the CLAUDE.md-authoring spec lands (unchanged)

Optional power tier; **markdown-first wins for instruction files** (`lightweight-spec-authoring.md`),
the `doc()`/`dir()` lightweight path stays. The shift is only the center of gravity: the spec's
reason to exist is now **contracts for executable units (skills/agents)**, not authoring a doc.

## The unification — three layers, one machine, each making the next affordable

- **Measurement** = the identity (offense: what makes agents better, measured).
- **Typed contracts** (railway/Result/side-effects) = what make measurement **cheap + rigorous**
  (assert vs LLM-judge) — the substrate that makes the offense affordable.
- **Linting** = the free deterministic pre-filter + diagnostic.

The cost-ladder, top to bottom: **lint (free) gates contracts; contracts (deterministic assert)
gate the expensive model-judge; a model is paid only where the output is irreducibly prose.**
Every typed contract you add converts a model-judged measurement into a free deterministic one.

## Honest read

Like linting, typed contracts are **substrate, not the viral headline.** But they are the
substrate that makes the headline _possible_: you cannot cheaply, rigorously measure
prose-vibes units — you need typed outputs to assert. And there is a real author-facing pitch:
**"write your skill/agent as a typed spec → get a deterministic test for free instead of an
expensive LLM-judge."** That is the skill-testing market (skill-creator / cc-plugin-eval),
done **deterministically and cheaply** — the same defense→offense move, applied to authoring.

## Progressive adoption: the spec as the zero-friction on-ramp to testability

The spec isn't a format you adopt up front — it's a **ramp you climb incrementally, and every
rung makes your tests cheaper.** This is the level ladder pointed at _testability_ instead of
authoring:

1. **Free-form (rung 0).** Keep your existing `.md` skill/agent untouched. vigiles writes a
   starter eval for it — at first the test can only **model-judge** the prose output (works,
   but fuzzy + costs tokens). Zero friction; you adopt nothing.
2. **Add a Result contract (rung 1).** Declare the skill/agent's typed `ok/err` outcome. Now
   the test **asserts** the outcome deterministically — an expensive model-judge becomes a free
   deterministic check.
3. **Declare side-effect boundaries (rung 2).** Mark where it writes/calls. Now the test
   **intercepts and asserts** the effect (did it push? did it write the file?) without a model.
4. **Adopt/raise a template (rung 3).** Swap in a better structure or a stricter check set as
   the unit matures; `extends` a shared template that carries its own evals.

The through-line: **each rung converts more of the test from "model judges the vibe" to "code
asserts the contract"** — cheaper, faster, deterministic. So adoption is _gradual quality_,
not a cliff: you get value at rung 0 (a test exists), and you climb only as far as the unit
deserves. That's the standardrb/TypeScript "any → typed" migration, applied to making
agent units testable.

This is the spec's true product role: **the zero-friction on-ramp into the measurement
identity.** You don't sell "rewrite your CLAUDE.md as a typed spec"; you sell "we'll test your
skill — and the more structure you let us add, the cheaper and sharper the test gets."

## See also

- `spec-api-design.md` — the concrete API design for these contracts (`result()` typed via a
  tagged error union, `doc()` vs structured builders, `extends()` merge, strict-typing borrows).
- `side-effect-separation.md` — enforcing the side-effect boundary deterministically (the mark
  doubles as the safety gate AND the test seam).
- `shareable-presets.md` — the template/distribution axis (generalized to skills/agents here).
- `railway-subagents.md` — the railway design this elevates from a feature to a purpose.
- `fp-for-agent-harness.md` — the Railway/algebraic-effect structure for skills/hooks.
- `harness-state-space.md` — "make illegal states unrepresentable," of which the Result
  contract is the control-flow instance.
