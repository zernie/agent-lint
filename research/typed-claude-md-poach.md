---
status: active
topic: spec
---

# Poaching the app-frameworks for a typed CLAUDE.md — and the moat it gives

> What can vigiles steal from Mastra / Vercel AI SDK / LangGraph / Pydantic AI / Temporal
> to make a **typed CLAUDE.md** (the `.spec.ts`) stronger — and which steals yield a
> **markdown-impossible moat**? Consolidates + extends the scattered notes
> (`feature-ideas.md` §14b, `landscape-mid-2026.md` poach list, `typed-spec-moat.md`,
> `typed-spec-effects-monads.md` M1–M6). These frameworks are a **different market**
> (app-building, not harness-verification — see `landscape-mid-2026.md`); we lift
> mechanics, not strategy.

## The one load-bearing observation (the moat)

Every one of these frameworks types the agent you **assemble in code** — typed tools,
typed step-to-step handoffs, typed structured output, typed state. But the **instructions
themselves are an untyped prose hole**:

- Mastra: `new Agent({ instructions: string, … })`
- Pydantic AI: `Agent(system_prompt=str | fn)`
- Vercel AI SDK / LangGraph: a `system` string / a prompt node.

They type the _scaffolding around_ the prose and leave the prose untyped — because in
their world the instruction is a small constant the developer writes. In the **harness**
world the instruction file IS the product (CLAUDE.md, skills, subagent `.md`, hooks), and
it's authored as markdown by everyone.

**So the moat is exactly the inversion: take their typed-composition machinery and apply
it to the layer they leave as prose — the instruction file / harness.** Two consequences
markdown structurally cannot match:

1. **Compile-time:** a typed `.spec.ts` makes the harness a _program_, so their
   step-handoff / output / effect types apply to CLAUDE.md, where a linter-of-prose can't.
2. **Runtime:** the harness is driven by a **model, not the author**, so the typed
   contract compiles to a markdown artifact a **PreToolUse/Stop hook ENFORCES** at
   loop-time (vigiles's `decidePurityGate`, the agent rail). The in-code frameworks don't
   need this (their code runs in-process); the harness does, and only a typed spec can
   emit the marker the gate reads.

**Verified reinforcement (Pydantic AI, the most type-forward of them, 2026-06 docs):**
even it does **no cross-agent handoff type-check** — "type checking occurs during agent
initialization, not before… there is no auto-derived cross-agent Supplies check; the
programmer must declare both correctly" (it punts deterministic flow to a separate
_Pydantic Graphs_ primitive). vigiles already ships exactly this — `Supplies<>` /
`Handoff<>` / `KnownAgentName<>` cross-reference step N's `ok` against step N+1's `needs`
at `tsc` time, across files. So on the cross-agent-handoff axis vigiles is **ahead of the
app-frameworks themselves**, not just ahead of markdown. (`deps_type` in Pydantic is
"type-checking only, no runtime effect" — confirming bet #3's typed-context idea is a real
mechanic to lift.) Source: pydantic.dev/docs/ai (Agents, Dependencies, Multi-agent).

## Verified sweep (2026-06-22, web — Mastra / LangGraph.js / Pydantic AI)

Three findings, each web-verified against current docs/source, that sharpen the moat —
and keep it honest:

- **Typed step-handoff is real and strong (esp. Mastra) — vigiles is NOT unique on it.**
  Mastra's `.then()` carries `TPrevSchema extends TStepInput` (a tsc error if step N's
  output schema doesn't satisfy step N+1's input) — structurally the **same idea as
  `Supplies<>`**. So don't claim "we type handoffs, they don't." (Source: mastra
  workflow.ts.)
- **But cross-AGENT handoff checking is universally weak/manual/absent.** Mastra
  type-checks _workflow steps_ yet leaves **direct agent-to-agent delegation runtime-typed**;
  LangGraph only narrows a route if you _manually_ annotate the return union (`Command.goto`
  defaults to `string`); Pydantic AI has **"no auto-derived cross-agent Supplies check."**
  The LangGraph researcher's own words: it "does not verify that step N's output _supplies_
  step N+1's _needs_ as a typed cross-step handoff contract." vigiles's
  `Supplies<>`/`Handoff<>`/`KnownAgentName<>` does exactly that, **automatically + across
  files** (the `generate-harness` registry). So the honest edge is FOUR-fold, not "we have
  types": (a) applied to the **prose instruction-file/harness** they leave untyped; (b)
  **cross-file**, over separately-authored `.md` units; (c) **cross-agent**, where even the
  typed frameworks fall back to runtime/manual; (d) compiled to a **runtime-enforced gate**.
- **Zod-schema = one decl → type + validator is universal** (Mastra `createTool`,
  LangGraph `tool`, Vercel `tool`, Pydantic models). Confirms bet #2 (Zod-`result()`) lifts
  a proven, ubiquitous mechanic — not an exotic one.
- **The whole-harness REGISTRY is unique to vigiles** (the strongest verified point). The
  durable-workflow sweep (Inngest/Temporal/Cloudflare/Trigger.dev): all type a handoff
  **one call site at a time** (Trigger's `triggerAndWait` infers the callee's return; the
  rest are plain local-variable inference). **None emit a repo-scale typed registry** that
  one `tsc --noEmit` cross-checks across EVERY inter-agent edge at once. vigiles's
  `generate-harness.ts` does exactly that — the **TanStack `routeTree.gen.ts` analogy is
  exact** (the researcher's words). So the moat isn't per-edge `Supplies<>` (Mastra ~matches
  that on workflow steps); it's the **whole-harness program**.
- **Nobody types the tool-PERMISSION / capability surface at compile time** (Vercel's
  `activeTools` is a runtime filter, not a contract; no typed cross-step memory). That's the
  exact gap vigiles's typed purity + the effect-row (bet #1) fill — reinforces the headline.

## Poach matrix — framework pattern → typed-CLAUDE.md analog → status → moat

| Framework pattern (who)                                                                                                                      | What its TYPE proves                                                                         | vigiles typed-CLAUDE.md analog                                                                                                                                                                                                    | Status                                                                 | Moat?                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| **Typed step→step handoff** — Mastra `.then()` chains step `inputSchema`/`outputSchema`; LangGraph state channels                            | step N output type ⊇ step N+1 input (compile error otherwise)                                | `pipe(producer, pipeStep(agent, needs({…})))` + `Supplies<>` / cross-file `Handoff<>`                                                                                                                                             | **SHIPPED**                                                            | ✅ validates the moat     |
| **Typed structured output** — Vercel `generateObject<S>`, Pydantic `output_type`, Mastra `output:`                                           | the agent's final answer conforms to schema S                                                | `result()` → `vigiles:ok/err` blocks + `assertAgentOk`                                                                                                                                                                            | **SHIPPED** (hand-parsed)                                              | ✅                        |
| **Zod/Pydantic schema = type + validator from ONE decl**                                                                                     | one schema gives compile type AND runtime parse                                              | **Zod-based `result()`**: one schema → compile type + `assertAgentOk`=`safeParse` + the JSON-Schema `generate-schema` emits                                                                                                       | **PROPOSED** (`feature-ideas` §14b)                                    | ✅ single-source contract |
| **Typed effects / durable state** — LangGraph typed state + reducers; Temporal deterministic workflow; algebraic-effect rows                 | the data/effects accumulated ACROSS steps are typed                                          | **M1 effect-row + cross-step accumulation** → `capability-diff` rich form ("this PR opened a cross-step exfil path")                                                                                                              | **PARTIAL** (lattice shipped; row UNBUILT)                             | ✅✅ **headline**         |
| **Typed dependency injection** — Pydantic AI `RunContext[Deps]` (agent declares typed INPUTS it needs)                                       | the agent can't run without typed deps D; provider must supply D                             | a subagent's typed **context/needs contract** — "requires `{repo, ticketId:number}`" checked across the `.md` handoff                                                                                                             | **PARTIAL** (`needs()` = field presence; typed-deps object is **NEW**) | ✅ new poach              |
| **Typed conditional routing** — Mastra `.branch([[pred, step]])`                                                                             | branch predicate is type-checked against the step's output shape                             | a typed branch edge over a `result()` shape (beyond today's `recover`/`onError` err-track)                                                                                                                                        | **NEW** (none today)                                                   | ⚠️ niche                  |
| **Typed evals/scorers** — Mastra `evals`/scorers as typed metric fns                                                                         | a scorer is typed over the agent's output type                                               | a `check`/`judged()` typed against the `result()` schema fields                                                                                                                                                                   | **PARTIAL** (`check` vocab shipped; schema-typed checks new)           | ◯ small                   |
| **Agent-as-tool / typed handoff** — Mastra agents-as-tools, OpenAI Agents SDK handoffs                                                       | a delegated agent call is typed                                                              | `delegate()` / `KnownAgentName<>` (dangling-delegate = tsc error)                                                                                                                                                                 | **SHIPPED**                                                            | ✅                        |
| **Typed tool I/O schemas** — Mastra/Vercel `inputSchema` on every tool                                                                       | tool args validated against schema                                                           | CC built-in tools have FIXED schemas; the live analog is **MCP tool arg schemas** from `tools/list` (ties to `scan --verify-mcp`)                                                                                                 | **PARTIAL** (name-level shipped; arg-level NEW)                        | ◯ incremental             |
| **Typed UNHANDLED-ERROR surface** — Effect-TS `Effect<A,E,R>` tracks every error variant across a `pipe`; final `E=never` proves all handled | a step that can fail with `E` piped into a handler that doesn't catch `E` is a compile error | the railway err-track (`result().err` + `recover`/`onError`) is the shape; **exhaustive-err-handling across the railway is NEW** — prove every upstream `err` variant is handled downstream (the err-side mirror of `Supplies<>`) | **NEW**                                                                | ✅ strong, novel          |

## Ranked moat bets (filtered by: deterministic + markdown-impossible + don't-cry-wolf)

1. **Effect-row + cross-step accumulation (M1)** — the headline. Poaches LangGraph typed
   state + Temporal durability + algebraic effects, applied to the harness. It's the
   engine `capability-diff #2` needs to turn "gained Bash" into "opened a net→fs-write
   exfil path across steps." The whole PL/formal-methods toolbox on the harness; markdown
   has no state to type. Already the roadmap M1 item — this poach **confirms + frames** it.
2. **Zod-based `result()`** — collapses contract→type→validator→JSON-Schema to one source
   (`feature-ideas §14b`). Bounded, strengthens an existing surface, removes a hand-rolled
   parser. The cleanest near-term lift.
3. **Typed context/needs contract** (poach Pydantic `RunContext[Deps]`) — today `needs()`
   checks field PRESENCE across a handoff; the richer steal is a typed **deps object** a
   subagent declares it requires, so "this agent needs a field the orchestrator never
   supplies" is a compile error AND the runtime can validate/inject it. The genuinely
   **new** idea here; gate it behind don't-cry-wolf (only flag a provably-unsatisfiable
   need, like the existing `Supplies<>`).

4. **Exhaustive error-track handling across the railway** (poach Effect-TS's `Effect<A,E,R>`
   — it tracks the full UNHANDLED-error surface across a `pipe`, and `E=never` PROVES every
   error is handled). vigiles already has the err-track shape (`result().err` + `recover`/
   `onError`); the new check is the **err-side mirror of `Supplies<>`**: prove at `tsc` time
   that every upstream `err` variant is handled by some downstream `recover`/`onError`, else
   a compile error. Novel, strong, and markdown-impossible — but scope after M1 (the railway
   err-edges are the noted follow-up to the linear-success-track composition already shipped).

Deprioritize: typed branch routing (niche — most harness flows are linear/railway), and
schema-typed evals (small win over the shipped `check` vocab).

## The honest filter applied

Per the analogical-transfer + don't-cry-wolf rules: a poach earns a place only if it
yields a **deterministic, high-signal compile/lint/gate check on the harness** that
shrinks its state-space. The three ranked bets do (compile errors / a measured capability
diff). The rest are either already shipped (validating the moat) or incremental. The
frameworks prove the typed-composition _mechanics_ are sound and mature — vigiles's
defensibility is **where** it points them: the prose harness they all leave untyped, with
a runtime gate they don't need.

## See also

- `research/typed-spec-moat.md` — the moat synthesis + build order (M1–M6).
- `research/typed-spec-effects-monads.md` — M1 effect-row (the headline) in depth.
- `research/feature-ideas.md` §14b — Zod-`result()` (bet #2 above).
- `research/landscape-mid-2026.md` — why these are a different market (poach, don't fear).
