# Skill as a pipeline — harness-driven control-flow graph with deterministic gates

> Status: design capture (2026-06-07). Output of a multi-step design discussion that
> started from "does a skill even need a spec?" and converged on a concrete model for what
> a skill *should* be. Builds on `research/fp-for-agent-harness.md` (Railway/effects for
> skills), `research/runtime-enforcement.md` (skill contracts + hook policies), and
> `research/skill-authoring-pains.md` (the pains this fixes). Pauses no code — it defines the
> target the implementation should aim at.

## The question that led here

Working through it level by level, the team established:

1. **Edit-time TS proof is dead.** When an agent authors, the loop is "run → read error → fix";
   the compiler-in-the-editor advantage collapses. So a `.spec.ts` is not justified by
   edit-time feedback.
2. **CLAUDE.md = documentation.** Passive context. A typed spec is hard to justify; light
   reference verification (markdown-first) is enough.
3. **SKILL.md = procedure.** Anthropic draws the line itself: create a skill "when a section of
   CLAUDE.md has grown into a *procedure rather than a fact*." A procedure has a runnable,
   verifiable surface — scripts, commands, tools, paths, a result.
4. **But "skills need a spec" ≠ "skills need a `.spec.ts`."** The value is a *verified
   contract*, which runs in markdown-mode on the SKILL.md itself just as well as in a typed
   `skill()`. The asymmetry vs CLAUDE.md is in *policy* (how strict), not *format*.
5. **The real gap is structure + a clear result**, and that is what the model below provides.

## Core model

A skill is one of two things — mirroring vigiles's own `enforce`/`guidance` duality:

```
Skill =
  | Guidance   — pure context/knowledge. No steps, no result, no gates. (the "documentation" skills)
  | Pipeline   — a control-flow graph of Steps connected by deterministic gates, ending in a result gate.
```

A **Pipeline** skill is, in full generality, a **control-flow graph the harness interprets**:
the model executes nodes (probabilistically), the harness owns the edges (deterministically).

```
Step = {
  do:   instructions   // prose; the MODEL performs this (probabilistic)
  gate: Gate           // deterministic check the HARNESS runs after `do`
}

Gate = Cmd(command exit 0) | FileExists/Matches(path) | Rule(linterRule) | Absent(path) | …
       // every gate is a verifiable reference (author-time) AND an executable predicate (run-time)

Edges:
  - linear:     step → (gate passes) → next step
  - failure:    step → (gate fails)  → retry / abort / error track
  - branch:     switch on deterministic state predicate → A or B
  - loop:       back-edge + a termination gate

result: Gate          // the skill's "clear result" — the postcondition that defines DONE
```

**Railway is the linear projection** of this graph (happy path + one failure track). It is the
shape users start with; the general case is a state machine.

## The key insight: the monad lives in the gates, not the steps

The naive Railway framing (`fetchPr(ctx).andThen(loadDiff)…`) treats steps as functions that
execute deterministically. But in a SKILL.md the executor is an **LLM** and the steps are
**prose** — you cannot make the model a pure function. So the monad cannot sit on step
execution. It sits on **verification between steps**:

```
Step : State → Result<State, Failure>
```

The *transition* is done by the model (probabilistic); the **`Result` is decided by a
deterministic gate**. Composition = bind = "advance only if the previous gate passed."
This makes the monad real rather than academic, and honest about the probabilistic executor.

## Railway out, monads in

For the author the surface is just **"a list of steps, each with a check."** No `Result`, no
`bind`, no `andThen`, no monad vocabulary — that machinery is hidden in the runner. The user
writes only the happy path; the failure plumbing is the harness's job. Railway's killer
property — errors and happy path have the same shape — means **"add a step" = "add one
block,"** for both humans and models (the reason it is easier for agents to edit correctly
than nested try/catch).

## Two axes the model moves along

### Axis 1 — enforcement strength (how hard the harness drives execution)

Passive gates are the weak end. There is a spectrum:

1. **Soft (detect).** Whole SKILL.md in context; gates checked after; failures reported. The
   model can still skip. (Weakest.)
2. **Medium (gate-progression).** The model cannot "close" a step until its gate passes — a
   Stop/PostToolUse hook blocks completion and re-injects the step. **Achievable on today's
   Claude Code hooks.**
3. **Hard (interpreter-driven).** The harness reveals steps **one at a time**; the model never
   sees step N+1 until step N's gate passes. The skill stops being "a document the model
   reads" and becomes "a program the harness interprets, calling the model as the per-step
   worker." Strongest — but needs a **runner that controls context** (a thin
   `vigiles run-skill` / subagent loop). Beyond what hooks natively give. **Needs building.**

**Honest boundary:** enforcement handles **control flow** (no skip, no proceeding past a failed
gate) — it does **not** guarantee a step was done *correctly*. The arbiter of correctness is
still the gate. `forcing + gates` = strong; `forcing` alone = sequenced but unverified. Gates
remain mandatory even with hard driving.

### Axis 2 — control-flow complexity (linear → tree/graph)

Real procedures branch ("if language is TS do X, else ask the user") and loop ("for each
failing test, fix it"). So a skill is a **graph**, not a list. Prose expresses graphs terribly —
"if X go to step 3" is GOTO spaghetti: unreadable *and* unverifiable. Structure/types, by
contrast, make reachability, branch-exhaustiveness, and loop-termination checkable.

## The payoff: control-flow complexity is the markdown ↔ spec boundary

This finally gives a **non-arbitrary** answer to "does a skill need a spec":

> **Linear skill (Railway) → markdown checklist. Branching/looping skill → structured graph (spec).**

A spec is needed **not by "commitment level" but by control-flow complexity.** A linear skill
gets `vigiles:gate` markers in markdown, zero TypeScript. The moment branching/looping appears
that prose cannot safely express, you graduate to a structured graph (frontmatter data or a
typed `skill()`), because the graph **must** be verifiable. Linear → no spec. Branching → spec.

## Two representations of the same contract

**Markdown tier** (no monads visible — a checklist; a direct extension of the
`vigiles:file`/`vigiles:cmd` inline markers already in flight):

```markdown
---
name: ship-pr
description: Run checks and open a PR
vigiles:
  result: "npm test"          # the railway terminus
---

## Step 1: Lint
…prose for the model…
<!-- vigiles:gate "npm run lint" -->

## Step 2: Tests
…prose…
<!-- vigiles:gate "npm test" -->
```

**Typed tier** (monad behind the builder; flat API, no `andThen` exposed):

```ts
skill("ship-pr",
  step("Lint",  { gate: cmd("npm run lint") }),
  step("Tests", { gate: cmd("npm test") }),
  { result: cmd("npm test") },
)
```

Kleisli composition (`review >=> fix >=> push`) and typed step I/O are where the typed tier is
genuinely stronger — the compiler statically checks the workflow graph (output of one step
matches input of the next). For the linear/markdown majority the contract is schema-validated
frontmatter; no TS required.

## Where it's enforced (both already half-designed in sibling docs)

- **Author-time (`vigiles compile`/`audit`):** gates *reference real things* (`cmd` exists,
  `file` resolves, rule enabled) **and** the shape is complete (every step has a gate; there is
  a result gate; the graph is reachable/terminating). This is the existing cross-referencing
  engine + a structural check.
- **Run-time (harness via generated hooks — see `runtime-enforcement.md`):** gates *execute*
  between steps. A failed gate diverts to the Railway error track ("step N gate failed:
  `<gate>`, fix and retry"). The "which skill is active" gap is bridged by the skill writing
  `.vigiles/active-contract.json` at start.

## Honest limits

1. **Ungated steps are probabilistic gaps.** "Write a good summary" has no deterministic gate;
   such steps are `guidance` *within* the pipeline and must be **declared as such**, so
   reliability is visible (gated = reliable, ungated = best-effort) rather than assumed.
2. **Forcing trades flexibility for reliability.** Hard driving makes a skill rigid/slower — the
   model can't take a sensible shortcut. Likely a per-skill or per-step `forced` vs `advisory`
   option.
3. **Interpreter-driven driving needs a runner** controlling context — beyond current hooks; on
   Codex/others it degrades to author-time checks + a final result gate the agent runs manually.
4. **Graphs add authoring weight** — justified only for genuinely branching skills; ~80% are
   linear and stay markdown.
5. **Enforcement is defense-in-depth, not a jail** (per `runtime-enforcement.md`): hooks run in
   the agent's context; the contract is a contract, not a sandbox.

## MVP → full

1. **Result gate (MVP, tiny).** A skill declares one `result`/`verify` gate. Author-time: it
   references something real. Run-time: the harness runs it at the end → deterministic "done."
   Even with a fully prose body this gives a skill a *clear result*. Huge value for one field;
   directly kills the silent-execution-failure pain (`skill-authoring-pains.md`).
2. **Step gates.** Per-step checkpoints + short-circuit (Railway, soft → medium enforcement).
   Reuses the `vigiles:gate` marker on top of the in-flight inline/frontmatter parser.
3. **Graph + typed pipeline.** Branches/loops as structured data; typed `skill()` with Kleisli
   composition and graph verification (reachability/termination); the `vigiles run-skill`
   interpreter for hard driving. The strict optional tier.

Orthogonal axis: the **effect contract** (`reads`/`writes`/`may` from `runtime-enforcement.md`
and `fp-for-agent-harness.md`) — "what the skill is allowed to touch" — is separate from "what
it does" (steps) and "what proves it done" (result gate).

## Open questions

1. `result`-gate-first MVP vs steps+gates first — which ships first?
2. Marker syntax for gates/branches in markdown that stays a readable checklist.
3. How much of the interpreter (`vigiles run-skill`) is worth building vs leaning on hooks?
4. Does the headline become "verify (and drive) your skills"?
5. Policy: `require-skill-spec` graduates a skill to structured form once it branches?
