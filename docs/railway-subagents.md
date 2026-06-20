# Railway-oriented subagents — typed outcomes you can assert

> The README has the pitch; this is the full guide. A **subagent** is the one
> agent primitive with a real boundary — it runs in its own context and **returns**
> a result to the orchestrator. vigiles lets you type that return as a
> `Result<ok, err>`, so the orchestrator's control flow is **deterministic** and a
> test **asserts** the outcome instead of paying an LLM to judge prose.
>
> Internal design rationale: [`research/railway-subagents.md`](../research/railway-subagents.md).
> Where this fits the testing tiers: [`harness-testing.md`](harness-testing.md).

## Contents

- [Why railway, for subagents](#why-railway-for-subagents)
- [Declare a typed outcome](#declare-a-typed-outcome)
- [What it compiles to](#what-it-compiles-to)
- [Compose flat workers](#compose-flat-workers)
- [Test the outcome deterministically](#test-the-outcome-deterministically)
- [Scope: subagents, not skills](#scope-subagents-not-skills)
- [See also](#see-also)

## Why railway, for subagents

A subagent does probabilistic work, but the orchestrator's question is binary:
**did it succeed, with the right result?** Normally that's a job for an LLM judge —
slow, metered, non-deterministic. A **typed Result contract** turns it into a
deterministic assert:

- The subagent finishes its turn with a typed block — `vigiles:ok` on the success
  track, `vigiles:err` on the error track.
- The orchestrator (or a test) **parses** that block into a discriminated union and
  knows, deterministically, which track it's on.

This is Scott Wlaschin's railway-oriented programming with a subagent as the step:
the agent's **work** stays probabilistic, its **control flow** becomes
deterministic. It also makes invalid states unrepresentable — "succeeded _and_
errored" and "ran past a failure unhandled" can't occur, because the outcome is one
typed value on one track.

## Declare a typed outcome

`result(okShape, errShape)` types the two tracks; attach it to an `agent()` as its
`output`. Field types are `"string" | "number" | "boolean" | "string[]"`.

```ts
import { agent, result, file, instructions } from "vigiles";

export default agent({
  name: "implementer",
  description: "Implement the planned change and report what it touched.",
  tools: ["Read", "Edit", "Bash"],
  output: result(
    { files: "string[]", summary: "string" }, // success — rich detail
    { reason: "string", step: "string" }, // error — structured, not a bare bit
  ),
  body: instructions`
    Implement the change described in the task. When done, finish your turn with
    the vigiles:ok block listing the files you changed; if you cannot, emit
    vigiles:err with the reason. See ${file("docs/spec-format.md")}.
  `,
});
```

## What it compiles to

`vigiles compile` renders the contract into the subagent's system prompt as an
`## Output contract` section — the literal blocks the worker must end its turn with:

````md
## Output contract

Finish your turn with exactly one fenced block — success or error.

On success:

```vigiles:ok
{ "files": string[], "summary": string }
```

On error:

```vigiles:err
{ "reason": string, "step": string }
```
````

The compiled markdown is the single source of truth; the integrity hash covers it,
so a hand-edit is detected.

## Compose flat workers

`railway()` sequences flat subagents into a success track with a bounded error
track — no loop combinator, so it always terminates and every `delegate()` target
is resolved against the real agent specs at compile time.

```ts
import { railway, delegate } from "vigiles";

export default railway({
  name: "ship-pr",
  steps: [
    delegate("planner", "Plan the change"),
    delegate("implementer"),
    delegate("reviewer"),
  ],
  // bounded recovery: retry the failing step via a fixer, finitely
  recover: { step: delegate("fixer"), max: 2 },
  // exhausted failure routes to the error track
  onError: delegate("reporter"),
});
```

The success track flows worker → worker; the first `vigiles:err` short-circuits to
`recover` (up to `max` times), and an exhausted failure routes to `onError`. The
whole thing is a finite tree — termination is readable off the value, the thing an
ultra-plan's generated script can't guarantee. See the runnable dogfood:
[`examples/railway/ship-pr.md.spec.ts`](../examples/railway/ship-pr.md.spec.ts).

## Test the outcome deterministically

This is the payoff: a `result()` contract replaces
`judged(output, "did the worker succeed?")` with a **parse + assert** — no model,
no key.

```ts
import { result } from "vigiles";
import {
  assertAgentOk,
  assertAgentErr,
  assertAgentResult,
} from "vigiles/testing";

const implementer = result(
  { files: "string[]", summary: "string" },
  { reason: "string", step: "string" },
);

// r.output is the subagent's final text (a runHarness turn, a Task sub-trace, or
// recorded output). Assert the OUTCOME, not prose:
const ok = assertAgentOk(r.output, implementer); // throws unless it's a valid ok block
assert.deepEqual(ok.files, ["src/parser.ts"]);

// Rich predicate over either track, still model-free:
assertAgentResult(
  r.output,
  (res) =>
    res.kind === "ok" && res.value.files.some((f) => f.endsWith(".test.ts")),
  implementer,
);
```

A worker that emits the wrong shape, or prose instead of a block, parses as
`malformed` — the honest third track, caught, never a silent pass. The parse is
pure (`text → Result<S, E>`), so most of this runs with **no model and no key**.
Full worked example (Part A pure, Part B a real scripted-mock turn):
[`examples/harness/railway-result.harness.mjs`](../examples/harness/railway-result.harness.mjs).

## Scope: subagents, not skills

Railway/Result is a **subagent** contract by design — not a skill one. A subagent
has a discrete call → isolated context → **return**, and that return is the
parse-point the contract asserts on. A **skill** runs inline in the main
conversation and never "returns" a value, so a typed outcome there is a category
error (for a knowledge skill) or has no parse-point (for a procedural one). The
bridge for a procedural skill that genuinely needs a typed outcome is Anthropic's
`context: fork` — it runs the skill as a forked subagent, at which point the
**subagent** contract applies. That bridge is modelled: a `skill()` may set
`context: "fork"` and carry an `output: result(...)`, and the **same** Output
contract renders. The gate is enforced at compile — an `output` without
`context: "fork"` is an error, because an inline skill has no return to type:

```ts
import { skill, result } from "vigiles";

export default skill({
  name: "review",
  description: "Review a file and return structured findings.",
  context: "fork", // runs as a subagent → has a return boundary
  output: result(
    { defects: "string[]", summary: "string" },
    { reason: "string" },
  ),
  body: "Review the file under review and report defects.",
});
```

The reasoning and citations:
[`research/spec-syntax-and-railway-scope.md`](../research/spec-syntax-and-railway-scope.md).

## See also

- [`harness-testing.md`](harness-testing.md) — the testing tiers; the
  "assert a subagent's typed outcome" section sits in the same family.
- [`spec-format.md`](spec-format.md) — the spec format reference (targets,
  sections, rules, reference helpers).
- [`research/railway-subagents.md`](../research/railway-subagents.md) — the design
  exploration (the Temporal analogy, why sub-Turing).
- [`research/subagent-compilation.md`](../research/subagent-compilation.md) — how
  `agent()` compiles to a Claude Code subagent + the declared-vs-enforced rail.
