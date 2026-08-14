# Experimental surface — what is not settled yet

Everything exported from `vigiles/experimental` carries an **`experimental_` prefix on the name itself**, so a call site says it is provisional without anyone opening this page. That is the whole contract of this file: **the prefix is the promise, and this page says what would have to be true to drop it.**

Nothing here is covered by semver. An experimental export may change shape or disappear in a patch release. If that is not acceptable for your repo, do not import it — everything on this page has a non-experimental alternative, named below in each section.

## `experimental_emitTool` — a skill emits its result by calling a tool

### The problem it addresses

A typed result (`output:` + `result()`) is valid **only on a forked skill**. `vigiles compile` hard-errors `output-without-fork` on every other one, and that is deliberate: an inline skill is spliced into the conversation, so it has no call→return boundary and therefore no return value to type.

A **tool call needs no return boundary**. The skill does not _return_ the structure — it _emits_ it, mid-conversation, and the call lands in `Trace.toolCalls`. The objection that grounds the exclusion does not apply to this delivery. It is the same `OutputContract`, reached a different way.

```ts
import { experimental_emitTool } from "vigiles/experimental";

const CONTRACT = result(
  { verdict: "string", count: "number", report: "string" },
  { reason: "string" },
);

const emit = experimental_emitTool(CONTRACT);
//  emit.instruction — paste into the skill body, in place of a prose "report your verdict"
//  emit.tool        — the JSON-Schema tool definition, served from your own MCP server
```

In a test the emission is read back off the trace, not off stdout:

```ts
const v = experimental_assertEmittedOk(trace.toolCalls, CONTRACT);
assert.equal(v.verdict.startsWith("BLOCKED"), true);
assert.ok(v.count > 0); // `count` is a number because the contract said so
```

### What is measured, and what is not

**Measured 2026-08-13** against one real unforked skill on sonnet: **8 runs, 8 emits**, all on the `ok` track, all parsing against the contract, none repeated. Raw arguments and a free re-scorer ship in `examples/experimental-emit/`.

That answers _"does it land at all"_ and says **nothing about the rate**: 8-of-8 bounds the true failure rate at roughly 31%, which is not evidence of reliability.

**Not measured, and each of these could reshape the surface:**

1. **One skill, one model, N=8.** No breadth across skills, models, or task shapes.
2. **Nothing depends on it.** Neither `compileSkill` nor `compileAgent` emits the instruction — you paste `.instruction` and serve `.tool` by hand. There is no compile-time path, so no skill in any corpus is typed by it.
3. **The transport is not part of the contract.** MCP is how the tool reached the model in the measurement; whether a plugin can serve a tool _without_ standing up a process is **untested**, and the answer would change the shape of this API.
4. **Triggering is unmeasured** — whether adding the instruction changes how often the skill fires at all.

### What it does NOT buy — stated because it is the obvious thing to assume

- **It does not enforce the schema.** The runtime does **not** enforce a tool's declared `required` fields — measured, with the raw call captured in the examples directory. A call with missing required fields reaches the server. Validation therefore lands in **your** receiving code, exactly as it would with a fenced block. What the contract buys is a _typed reader_, not a guaranteed writer.
- **It does not remove `Bash` from a skill.** `allowed-tools` is **pre-approval, not restriction**. Dropping `Bash` from the list removes a permission prompt, not the capability.

### To drop the `experimental_` prefix

Breadth across several skills and at least two models; a compile-time path so the instruction is not hand-pasted; and an answer to whether a plugin can serve the tool without a separate process.

### The non-experimental alternative

A **forked** skill (`context: "fork"`) with an `output:` contract, parsed by `parseAgentResult`. It is stable, it is covered by semver, and it is the right answer whenever the skill can afford to run as a subagent.

## See also

- [`compiled-hooks.md`](compiled-hooks.md) — the typed hook vocabulary, including `state()` / `record()`.
- [`spec-format.md`](spec-format.md) — `result()` and the `output:` contract on a forked skill.
- [`testing-api.md`](testing-api.md) — `Trace`, `toolCalls`, and the check vocabulary the assertion above composes with.
