# Experimental surface — what is not settled yet

**The prefix is the promise, wherever the symbol lives.** An `experimental_` name says a thing is provisional at the call site, without anyone opening this page — and that holds whether it comes from the quarantined `vigiles/experimental` subpath or sits beside stable exports in `vigiles/spec`. This page says what would have to be true to drop each one.

It has not always held. `skill()` once shipped stable-named from `vigiles/spec` while its own guide opened with "`skill()` is experimental" — prose one way, API the other. `npm run experimental:check` now fails CI when a public declaration tagged `@experimental` is not named for it, so the tag and the name cannot drift apart again.

Nothing here is covered by semver. An experimental export may change shape or disappear in a patch release. If that is not acceptable for your repo, do not import it — everything on this page has a non-experimental alternative, named below in each section.

## `experimental_skill` — authoring a `SKILL.md` from a typed spec

The declarative skill builder, and its two helpers `experimental_skill.input()` and `experimental_skill.step()`.

The helpers hang off the builder rather than being exported beside it, and that placement is the point: both are used **only** by skill specs, so making them reachable only through the prefixed name makes the marking structural for the whole family. `cmd`, `file`, `project` and `result` are shared with subagents and stay top-level. Honest limit: `const { input } = experimental_skill` strips the marker inside one file — what the shape guarantees is narrower, that an unmarked name never crosses the package boundary.

**What would have to be true to drop the prefix:** a real skill corpus converted to it (today: two example specs), and a compiled `SKILL.md` shown to load and run as an installed skill — never yet exercised end-to-end. See [`skills.md`](skills.md) §Status for the measured gaps.

**Stable alternative:** hand-written `SKILL.md` with markdown-mode gate markers. Same enforcement, no spec.

## `experimental_emitTool` — a skill emits its result by calling a tool

### The problem it addresses

A typed result (`output:` + `result()`) is valid **only on a forked skill**. `vigiles compile` hard-errors `output-without-fork` on every other one, and that is deliberate: an inline skill is spliced into the conversation, so it has no call→return boundary and therefore no return value to type.

A **tool call needs no return boundary**. The skill does not _return_ the structure — it _emits_ it, mid-conversation, and the call lands in `Trace.toolCalls`. The objection that grounds the exclusion does not apply to this delivery. It is the same `OutputContract`, reached a different way.

```ts
import { experimental_emitTool } from "vigiles/experimental";

const CONTRACT = result(
  // `["CUT", "MERGE", "KEEP"]` is an ENUM — the permitted values travel with the tool
  // definition, so the model sees them even if it skimmed the prose around them.
  { verdict: ["CUT", "MERGE", "KEEP"], count: "number", report: "string" },
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

### How a wrong emission is caught

The reader is **total**: every way an emission can fail to satisfy the contract has its own
branch with its own reason. There is no "it happened to look fine" path.

| what the model did                             | what you get back                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| never called the tool                          | `malformed` — `no \`emit_result\` tool call in the run`                                                                                    |
| called it twice                                | `malformed` — `called 2 times; the contract is exactly once`                                                                               |
| called it with no object argument              | `malformed` — `carried no object argument`                                                                                                 |
| omitted `track` (or sent something else)       | `malformed` — `has no \`track\` of "ok" or "err"`                                                                                          |
| declared a track, sent no payload for it       | `malformed` — `declared track "ok" but carried no \`ok\` object`                                                                           |
| sent a payload that misses or mistypes a field | `malformed` — `ok payload: field "verdict" should be "CUT" \| "MERGE" \| "KEEP"`                                                           |
| **the call itself was denied or errored**      | `malformed` — `errored or was denied; nothing reached the server. Check the tool's permissions and the exact spelling in \`allowedTools\`` |

The last row is worth dwelling on, because until 2026-08-19 it was a **silent success**: the
reader filtered calls by name and never looked at `ToolCall.isError`, so a permission-denied
call carrying a valid payload returned `ok` for an emission the server never received. A
wrong `allowedTools` spelling is the likely cause, not an exotic one — MCP names are
host-mangled (`mcp__plugin_<plugin>_<server>__emit_result` on Claude Code, two segments on
Codex), so getting it wrong is easy.

Two neighbouring collapses are avoided on purpose: a denied call is **not** reported as "no
call" (that sends you to the skill's instructions when the fault is in permissions), and a
retried denial is **not** reported as "called twice" (a true signal under a false name). A
successful call alongside a denied one is one successful emission — the contract was met.

**What none of this catches: whether the emitted result is TRUE.** The channel checks form.
A skill that emits `verdict: "KEEP"` about work it never did is well-formed and wrong, and
no schema can say otherwise. Gating on an emitted verdict was measured and rejected —
self-report disagreed with a judged check in 45–75.8% of runs.

### What is measured, and what is not

**2026-08-13, one skill, sonnet:** 8 runs, 8 emits, all on `ok`, all parsing, none repeated.

**2026-08-14, breadth — five real skills, two models:** on sonnet **15 emissions from 15
runs**, across bodies of 97 and 354 lines, two insertion modes, and two natural languages.
On haiku a **zero appears**: `cold-read-diff` emitted on 1 run of 3 — and not because the
channel dropped anything. The skill stopped on its third turn without reaching its own first
step, so there was nothing to emit. That distinction is why **the pooled number is not
printed**: across both models it would read as 19/21 ≈ 90% while containing a skill at 33%.

**2026-08-19, serving:** a plugin-bundled MCP server registers (`√ Connected`), the model
called it, and the payload reached the server — confirmed by the server's own log, not only
by the transcript. So question 3 below is answered.

**Still not measured, and each could reshape the surface:**

1. **The rate.** 15-of-15 on one model is not a reliability claim; the design calls for ≥30
   runs and ≥2 models before the number means anything.
2. **Nothing depends on it yet.** Neither `compileSkill` nor `compileAgent` emits the
   instruction — you paste `.instruction` and serve `.tool` by hand.
3. **Triggering** — whether adding the instruction changes how often the skill fires at all.
   Deliberately skipped, with the reasoning written down rather than the number guessed.
4. **A COMPILED `SKILL.md` has never been observed loading as an installed skill.** The
   `vigiles:sha256:` header pushes frontmatter off line 1. The neighbouring surface (a
   compiled subagent) was measured working, a skill was not — so the compile-time path is
   theory until that first end-to-end run.

### What it does NOT buy — stated because it is the obvious thing to assume

- **It does not enforce the schema.** The runtime does **not** enforce a tool's declared `required` fields — measured, with the raw call captured in the examples directory. A call with missing required fields reaches the server. Validation therefore lands in **your** receiving code, exactly as it would with a fenced block. What the contract buys is a _typed reader_, not a guaranteed writer.
- **It does not remove `Bash` from a skill.** `allowed-tools` is **pre-approval, not restriction**. Dropping `Bash` from the list removes a permission prompt, not the capability.

### To drop the `experimental_` prefix

Three conditions, one of them now met:

- ~~an answer to whether a plugin can serve the tool without a separate process~~ — **answered
  2026-08-19**. It can serve the tool; "without a process" turns out not to exist for anything
  in the shipped CLI (hooks are processes too), so the question was retired rather than passed.
- **Breadth** — partly: five skills, two models, but on a subset. Needs ≥30 runs.
- **A compile-time path** so the instruction is not hand-pasted. Not started; the design is
  locked and its first gate is the end-to-end run in point 4 above.

### The non-experimental alternative

A **forked** skill (`context: "fork"`) with an `output:` contract, parsed by `parseAgentResult`. It is stable, it is covered by semver, and it is the right answer whenever the skill can afford to run as a subagent.

## `experimental_define*` — authoring a hook as a typed program

The six entry points of the compiled-hook vocabulary: `experimental_defineHook`,
`experimental_defineFileGate`, `experimental_definePromptGate`,
`experimental_defineStopGate`, `experimental_defineInject`,
`experimental_defineReact`. The full guide is [`compiled-hooks.md`](compiled-hooks.md).

Only the entry points carry the prefix, and that placement is the whole point:
every other name in `vigiles/hook` — `allow`, `deny`, `tool`, `pathView`,
`commandView`, `state`, `record`, `notice`, `run` — is reachable ONLY from inside
a `define*` call. Prefixing the chokepoint makes the marking structural for the
whole vocabulary; prefixing thirty names could not, because nothing would stop
the thirty-first from shipping unmarked. Same reasoning as
`experimental_skill.input()` above, applied to a larger surface.

**Why it is not settled, stated as gaps rather than as a disclaimer:**

- The vocabulary grew a whole new axis in one release. Runtime-owned named state
  (`record`/`state`) landed 2026-08-12 to close a measured hole — seven advisory
  hooks in the dogfood repo were still hand-written shell for one uniform reason,
  every one of them both read and wrote a stamp file, and throttling was
  inexpressible. An API that gained a dimension that recently has not been
  pressure-tested by anyone but its author.
- 🔴 **Testing a hook that uses named state is archaeology today.** The runtime
  derives the store's path from the hook's own location and validates the key
  charset, so a test that wants to seed "this fact was recorded four days ago"
  must reconstruct a private path. The dogfood repo does exactly that, hard-coded,
  and it broke when the facts were renamed. There is no supported seeding API
  beside `runHook`. Until there is, a consumer testing a throttle is depending on
  internals.
- `vigiles compile` is not idempotent — it appends a duplicate wiring block that
  has to be removed by hand.
- Two consumers total, both belonging to the author.

**What would have to be true to drop the prefix:** a supported way to seed and
read named state in a test; an idempotent `compile`; and at least one consumer
who did not write the API.

**Stable alternative:** a hand-written shell hook wired in `settings.json`. The
events and the protocol are the harness's, not ours — nothing about them is
experimental. What you give up is the typed vocabulary and everything it makes
unrepresentable.

## See also

- [`compiled-hooks.md`](compiled-hooks.md) — the typed hook vocabulary, including `state()` / `record()`.
- [`spec-format.md`](spec-format.md) — `result()` and the `output:` contract on a forked skill.
- [`testing-api.md`](testing-api.md) — `Trace`, `toolCalls`, and the check vocabulary the assertion above composes with.
