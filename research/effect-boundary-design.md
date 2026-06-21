<!-- vigiles:ignore-file -->

# Effect-boundary design — `effect()` region mark

> Status: SHIPPED (2026-06-20) — this doc designed it and it landed as designed.
> The `effect\`\`` `EffectRegion`builder +`<!-- vigiles:effect -->`compile
markers + the`effect-enter`/`effect-exit`state file + the boundary gate in
both`PreToolUse`rails are all in`main` (mechanism (a) below, fail-closed).
Retained as the design record. The per-call purity FLOOR gate it builds on is
likewise shipped (`decidePurityGate`). See
[`side-effect-separation.md`](side-effect-separation.md) for the full design
rationale; [`roadmap.md`](roadmap.md) for what remains (smaller follow-ons).

---

## 1. Authoring surface

### The minimal primitive: `effect()` as an `InstructionFragment`

`body` on `skill()` / `agent()` already accepts `string | InstructionFragment[]`, where
`InstructionFragment = string | Ref`. The cheapest ship is adding `effect()` as a new
`InstructionFragment` kind:

```ts
// src/core/spec.ts — new variant
export interface EffectRegion {
  readonly _ref: "effect";
  readonly body: InstructionFragment[];
}

export function effect(
  strings: TemplateStringsArray,
  ...values: InstructionFragment[]
): EffectRegion {
  // same interleaving as instructions()
  const body: InstructionFragment[] = [];
  for (let i = 0; i < strings.length; i++) {
    if (strings[i]) body.push(strings[i]);
    if (i < values.length) body.push(values[i]);
  }
  return { _ref: "effect", body };
}
```

Usage in a `skill()` body:

```ts
import { skill, instructions, file, cmd, effect } from "vigiles/spec";

export default skill({
  name: "release",
  description: "Cut a release — bump, changelog, tag, publish",
  purity: "bounded",
  tools: ["Read", "Grep", "Bash", "Write"],
  body: instructions`
    ## Decide (pure)
    Read ${file("package.json")} and ${cmd("git log")} since the last tag.
    Decide the semver bump and draft the changelog **in memory**. Do not write yet.

    ## Apply
    ${effect`
      Side effects are allowed ONLY inside this block:
      - write ${file("CHANGELOG.md")}
      - ${cmd("git tag")} the new version
      - ${cmd("npm publish")}
    `}
  `,
});
```

This is the MINIMAL shippable form. It does NOT block on `doc()`.

### Relationship to the `doc()` item

The P1 `doc\`\`` tagged-template (`lightweight-spec-authoring.md`) is a
**free-standing prose container** — it lets authors write full markdown verbatim with
inline `file()`/`cmd()`holes.`effect()`as an`InstructionFragment`variant is
**independent**: it is an interpolation inside`instructions\`\``or`body: [...]`, not
a top-level container. Both benefit from each other (you can nest `effect()`inside a
future`doc()`the same way), but neither blocks the other.`effect()`ships now;`doc()` ships when the authoring-ergonomics priority lands.

---

## 2. Compile emission

`renderFragment` in `src/core/compile.ts` needs one new branch:

```ts
case "effect": {
  const inner = fragment.body.map(renderFragment).join("");
  return `\n<!-- vigiles:effect -->\n\n${inner.trim()}\n\n<!-- /vigiles:effect -->\n`;
}
```

The compiled SKILL.md looks like:

```text
## Apply

<!-- vigiles:effect -->

Side effects are allowed ONLY inside this block:
- write `CHANGELOG.md`
- `git tag` the new version
- `npm publish`

<!-- /vigiles:effect -->
```

The integrity hash covers the full file including these comments, so a hand-edit to
the boundary is detected. No new hash mechanism needed — it falls out of the existing
`addHash` + `verifyHash` path.

---

## 3. The crux — runtime region tracking

The hardest question. The PreToolUse hook fires **per tool call** — it sees a tool
name + input, nothing about where in the prose the agent "is." There is no cursor, no
per-section event, no CC hook for region entry/exit. Mechanisms, assessed honestly:

### (a) Explicit enter/exit signals via a state file ← RECOMMENDED

The agent emits an explicit "region enter" signal — a dedicated CLI command like
`vigiles effect-enter` / `vigiles effect-exit` — which toggles a state file
`.vigiles/effect-active.json`, mirroring the exact pattern vigiles already uses for
active-unit tracking (`.vigiles/active-agent.json`, `.vigiles/active-skill.json`).

The compiled SKILL.md instructs the agent:

```text
<!-- vigiles:effect -->

Before using any side-effecting tool, call: `vigiles effect-enter`
After the last side-effecting tool, call: `vigiles effect-exit`

Side effects are allowed ONLY inside this block:
...

<!-- /vigiles:effect -->
```

The PreToolUse hook reads `.vigiles/effect-active.json`; if a unit declares a boundary
and the file is absent (or `false`), it denies side-effecting tools with: _"This tool
is not allowed outside an `effect` boundary. Call `vigiles effect-enter` to enter the
effect region first."_

**Assessment:**

| Property           | Verdict                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| Works in CC today? | Yes — `vigiles effect-enter` is a bash command the model calls               |
| Fail direction     | Fail-CLOSED: a mis-mark can only over-block, never allow unsafely            |
| Determinism        | Full — the state file is written/read by deterministic processes             |
| Precedent          | Exact same pattern as `setActiveAgent` / `setActiveSkill` (already ships)    |
| UX cost            | Model must call two extra commands; the compiled prose instructs it to do so |
| Forgeable?         | Model could call `effect-enter` outside the boundary — addressed below       |

The "forgeable" risk: a model that calls `vigiles effect-enter` outside the intended
boundary widens the allowed window. This is acceptable because: (1) the model calls
`effect-enter` only because the compiled prose instructs it to — if the model
disregards the prose it will also disregard the gate, so the threat model is the same;
(2) the purity FLOOR gate still applies globally (a `pure` unit can't enter any effect
region by design); and (3) the sandbox closes the subprocess hole regardless.

### (b) A wrapper command that brackets the region

A single command like `vigiles run-effects "npm publish && git tag v1.2.3"` executes
the bracketed commands inside an "effect window." The hook auto-allows during the
subprocess lifetime.

**Assessment:** Requires the agent to compose all side-effecting ops into one command
string — not how agents work (they call tools one at a time). Not workable for
multi-step boundaries.

### (c) Inferring region from the tool sequence

Track a turn counter; parse the compiled prose to infer which section the model is in
by counting prose lines between tool calls.

**Assessment:** Unreliable — CC does not expose turn position or prose context to
hooks; tool calls are not serialized to a known section. Non-starter.

### (d) PreCompact / session-state hook approach

Use a PreCompact or Notification hook to reset region state.

**Assessment:** PreCompact fires on context compaction, not on section transition —
this doesn't help with region tracking. Not applicable.

### Verdict

**Mechanism (a) — explicit `effect-enter`/`effect-exit` commands — is the only
cleanly achievable mechanism today.** It is the direct extension of the
active-unit tracking pattern already in production. The failure direction is
fail-closed. The implementation is deterministic and testable via `runHook`.

---

## 4. Sequencing / verdict

| Layer                                                          | Status           | What ships                                              |
| -------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| `effect()` fragment + `InstructionFragment` union              | New (small)      | spec.ts + renderFragment branch in compile.ts           |
| `<!-- vigiles:effect -->` … `<!-- /vigiles:effect -->` markers | New (trivial)    | compile output, integrity hash covers them              |
| `vigiles effect-enter` / `effect-exit` CLI commands            | New (small)      | write `.vigiles/effect-active.json`                     |
| PreToolUse gate reads `effect-active.json`                     | New (small)      | extend `evaluatePreToolUse` + `evaluateSkillPreToolUse` |
| Test seam: `outsideEffect` predicate for `notTool`             | New (small)      | check.ts / harness-assert                               |
| `doc()` tagged-template                                        | Separate P1 item | NOT a dependency                                        |

**Shippable now, honestly labeled:**

> "Effect boundary marked and runtime-enforced via explicit enter/exit signals; the
> gate is deterministic and fail-closed. The `doc\`\`` lightweight authoring surface
> is independent and ships separately."

**Recommended order:**

1. `EffectRegion` fragment + `effect()` builder in `src/core/spec.ts` (30 min)
2. `renderFragment` branch for `"effect"` in `src/core/compile.ts` (10 min)
3. `vigiles effect-enter` / `effect-exit` CLI commands + `.vigiles/effect-active.json`
   state helpers (30 min, mirrors `setActiveAgent`)
4. Extend `evaluatePreToolUse` + `evaluateSkillPreToolUse` to deny side-effecting tools
   when a boundary is declared but `effect-active.json` is absent (20 min)
5. `runHook` unit test: boundary declared, tool denied outside; allowed inside (free
   tier, no model, in CI)
6. `notTool(run, "Write", { outsideEffect: true })` check predicate (optional polish)
7. `doc()` ships independently when the authoring-ergonomics priority lands

**Not blocked on `doc()`.** The full walkthrough in `end-to-end-walkthrough.md`
shows the `doc\`\`` shape — that is a proposed API illustration, not a dependency.

---

## 5. Related: typed `sh\`\``/`cmd\`\`` builder

A tagged-template builder for shell commands that classifies the command at **author
time** by reusing `mvdan-sh` (already a dep) + `classifyBashCommand`
(`src/core/bash-effects.ts`):

```ts
// proposed — not a dependency of the boundary design
const publish = sh`npm publish --tag ${ref(version)}`;
// => classified "side-effecting" at spec compilation, not just runtime
```

**What this buys:** pushes the read-only/side-effecting decision to edit time for
AUTHORED commands (guard/gate/cmd spec fields), complementing the runtime gate which
handles MODEL-GENERATED commands. A `sh\`\``in a`guard()`or`cmd()`that's
read-only could be emitted without`<!-- vigiles:effect -->` wrapping.

**Honest caveat:** authored Bash in spec files is the MINORITY surface — `guard()`
commands and `cmd()` refs appear a handful of times per spec, whereas the model
generates dozens of tool calls per session. The runtime gate covers the majority; this
covers a thin slice of the authoring surface. It is an Explore-tier nicety, not a
keystone.

**Implementation notes:**

- Parse: `mvdan-sh` AST (already used by `classifyBashCommand`) — reuse it
- Safe interpolation: branded `VerifiedRef` holes; build our own quoting rather than
  pulling `shell-quote` (our holes are typed branded refs, not arbitrary values)
- Register `ClassifiedCmd` as a new `InstructionFragment` kind → `renderFragment`
  emits the command string; the classifier result can emit a compile warning when a
  side-effecting command appears outside an `effect()` block

This is worth building alongside `effect()` IF the spec already contains authored
commands that need this classification — otherwise park it for the `doc()` pass.

---

## See also

- [`side-effect-separation.md`](side-effect-separation.md) — the gate + sandbox +
  auto-marker design; the "model proposes, deterministic enforces" framing; the double
  payoff (safety gate + test seam from one mark).
- [`end-to-end-walkthrough.md`](end-to-end-walkthrough.md) — the `release` skill
  walkthrough showing the full `effect\`\`` shape and runtime gate trace.
- [`roadmap.md`](roadmap.md) — priority context; this doc is the design for the
  "Effect-surface: the runtime half" Now item.
- [`lightweight-spec-authoring.md`](lightweight-spec-authoring.md) — the `doc()`
  primitive this does NOT depend on; ships independently.
- `src/core/effects.ts` — `decidePurityGate`, the shipped per-call floor gate.
- `src/adapters/claude-code/agent-runtime.ts` — `evaluatePreToolUse`,
  `setActiveAgent` / `readActiveAgent` — the pattern `effect-enter`/`effect-exit` mirrors.
- `src/tool-intercept.ts` — the boundary-as-test-seam; `notTool` / `interceptTools`.

## SUPERSEDED — mechanism (a) is wrong; bind the region to harness events (2026-06-20)

> A dogfood (3 shipped workflow skills → `research/spec-syntax-and-railway-scope.md`)
> plus a prior-art sweep overturned §3's "mechanism (a) recommended" verdict. Recorded
> here so the design doc tracks reality.

Mechanism (a) — the **model** calls `effect-enter`/`effect-exit` — is a category error:
**a deterministic gate keyed on probabilistic model compliance, fail-closed, so a single
missed call BREAKS the unit.** §3's "forgeable?" row hand-waved this; the dogfood proved
it. Every mature system that confines "effect X may happen only here" delimits the region
**structurally** (a scope the runtime/compiler owns) and **never** by an in-band signal
the actor emits: object-capabilities (confine by NOT passing the capability into a scope,
not by the code announcing it), [Sandlock](https://multikernel.io/2026/03/25/sandlock-mcp-per-tool-sandboxing/)
per-tool sandboxing ("declared per tool, enforced at call time **without explicit agent
signaling**"), Microsoft [Fides/IFC](https://arxiv.org/pdf/2505.23643) ("enforcement
**independent of model behavior**, derived from the tool-call graph"), and lexical effect
handlers / `runST` monadic regions (the _enclosing_ structure licenses the effect, never
the scoped code). A model emitting `effect-enter` is **ambient authority re-introduced
through a forgeable self-declared flag** — the anti-pattern ocap exists to remove.

**The fix (ranked):**

1. **Subagents — make the region structural via harness events (FOLLOW-ON).** A
   subagent IS the region (isolated context, call→return = the `runST`/lexical scope).
   **CORRECTION:** the research agent assumed a Claude Code **`SubagentStart`** hook — it
   does NOT exist (CC's verified `dialect.hookEvents` has `SubagentStop` but no Start;
   the agent conflated Codex, which has both). So for CC the deterministic, harness-emitted
   bracket is **`PreToolUse` with `tool_name === "Task"`** (dispatch begins, parent context)
   → open the window + `setActiveAgent`, and **`SubagentStop`** → clear + close. This still
   deletes the model-facing signal AND closes the "which subagent is active is still
   model-invoked" open problem. Whole-subagent-is-the-region is the simplest semantics;
   finer boundaries become a **two-subagent split** (a `pure` planner returning a
   `result()` plan → a `bounded`/`unrestricted` executor — Plan-Then-Execute, reusing
   shipped `result()`/`delegate()`/`railway()`). **✅ SHIPPED (2026-06-20):** the agent-hook
   now brackets the subagent's active window on the events CC has — `PreToolUse(tool=Task)`
   OPENS it (`decideTaskDispatch`/`resolveDispatchedAgent` resolve `tool_input.subagent_type`
   → the `agents/<name>.md` under cwd or `$CLAUDE_PLUGIN_ROOT`, fail-open on an unknown agent;
   the Task dispatch itself is the parent's action, allowed) and `SubagentStop` CLOSES it
   (clear active-agent + effect). The tool-contract rail + purity floor + effect window now
   fire **without a model call** (`agent-start`/`effect-enter`/`exit` stay as manual
   fallbacks); a consumer registers `agent-hook` on BOTH `PreToolUse` and `SubagentStop`.
   Remaining: the whole-subagent window collapses the in-body `effect()` sub-region into the
   declared floor (a subagent with `effect()` + no `purity` is unrestricted-while-active,
   bounded only by its tool contract) — finer phase separation is the two-subagent split, and
   retiring the `effect-enter`/`exit` CLI + the compiler-injected prose is the cleanup follow-on.
2. **Skills — drop the position `effect()`; keep the per-call purity floor. ✅ SHIPPED
   (2026-06-20).** A default skill is spliced into the main conversation: no return, no
   per-section event, no structural bracket. `compileSkill` now **errors** on `effect()` in
   a skill body (`effect-in-skill`, a category gate mirroring `output-without-fork`), and
   `evaluateSkillPreToolUse` no longer reads `effect-active.json` — the shipped
   `decidePurityGate` (the capability gate, needs NO enter/exit) holds on every call. A
   workflow skill that must mutate uses `context: fork` (shipped) → becomes a subagent →
   routes through path 1. "Skills can't have a deterministic effect region" becomes
   "promote it to a fork when it needs one."
3. **Taint/IFC (lethal-trifecta) is a SEPARATE future feature**, not an `effect()` fix —
   labels flow through the tool graph (deterministic), not model declarations. Park it.

**Migration:** the follow-on (path 1) retires the model-facing `vigiles
effect-enter`/`effect-exit` CLI + the compiler-injected "call effect-enter before a
side-effecting tool" prose (that prose IS the contradiction), keeping
`effect-region.ts`'s state file only as an INTERNAL mechanism written by the
`PreToolUse(Task)`/`SubagentStop` hooks. This pass keeps those CLI commands for the AGENT
rail as the interim (skills no longer reach them — `effect()` is a compile error there).
Positioning (DONE): "purity floors are deterministic; effect regions are a **subagent**
primitive" — never "purity/effect gates your skills" (README + CLAUDE.md keyFiles
corrected). Full prior-art set + the Plan-Then-Execute pattern:
[securing LLM agents (arXiv 2506.08837)](https://arxiv.org/pdf/2506.08837), Koka/Unison
abilities, [Monadic Regions](https://www.cs.cornell.edu/people/fluet/research/rgn-monad/SPACE04/space04.pdf),
[Claude Code hooks](https://code.claude.com/docs/en/hooks).
