# Subagent spec compilation — research + roadmap

Why vigiles compiles typed subagent definitions (`agents/<name>.md.spec.ts` →
`agents/<name>.md`), what the real format demands, and the layers still ahead.
Companion to `src/spec.ts` (`agent()`), `src/compile.ts` (`compileAgent`), and
`src/agent.test.ts`.

## The thesis: a subagent is a _contract_, not reference material

A **skill** is reference material the model reads when its description activates —
its value is prose + triggering. A **subagent** is a _delegated worker with a
contract_: a dispatch `description`, an allowed-`tools` rail, a `model`, a
system-prompt body, and the rules it must follow. That tool contract + those
rules are a "railway" — a constrained flow — and they are exactly the
compile-time-verifiable surface vigiles owns. So subagents, more than skills,
want spec compilation.

## What the real format demands (Claude Code)

A subagent is markdown + YAML frontmatter; the body becomes the system prompt.
Only `name` + `description` are required. Identity is the `name` field (not the
filename); duplicate names within a scope are silently dropped. Full field set:
`name`, `description`, `tools`, `disallowedTools`, `model`
(`sonnet`/`opus`/`haiku`/`fable`/full-id/`inherit`), `permissionMode`, `maxTurns`,
`skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`,
`color`, `initialPrompt`. (Source: https://code.claude.com/docs/en/sub-agents)

Mechanics that make this a _compiler_ target, not a linter target:

- **`tools` is an allowlist; omitting it inherits ALL tools** (incl. MCP) — the
  #1 documented footgun (a refactor agent with inherited `Bash` ran `git reset`
  and wiped uncommitted work). `disallowedTools` applies first, then `tools`.
- **Some tools are never available to a subagent** regardless of the list:
  `Agent`, `AskUserQuestion`, `EnterPlanMode`/`ExitPlanMode` (unless
  `permissionMode: plan`), `ScheduleWakeup`, `WaitForMcpServers`. Listing one is
  a guaranteed-dead reference only a compiler catches.
- **Dispatch is description-driven** — Claude routes by matching the request
  against each `description`; vague ones cause silent skips or wrong-agent
  invocation. (This is the same trigger-quality problem `measureTriggerRate`
  already measures for skills.)
- **`Agent(x, y)` handoff allowlists** name which subagent _types_ may be spawned
  — cross-checkable against the set of compiled agent names (stale-reference
  detection vigiles already does).
- **Plugin subagents silently ignore `hooks` / `mcpServers` / `permissionMode`**
  for security — a non-obvious correctness check a compiler should flag.

## The differentiator: declared ≠ enforced

The pivotal finding (Claude Code #4740/#21460, claude-agent-sdk-typescript #172): **`tools:` is not a hard runtime
permission boundary.** Permissions are session-wide, not per-agent; a subagent
inherits the parent session's `permissions.deny` and the `tools:` field cannot
grant what the session denies — it filters what's _offered_, but is "functionally
documentation" at runtime. The deterministic layer that actually closes the gap
is a **`PreToolUse` hook** (the canonical read-only-`db-reader` allows `Bash` but
blocks `INSERT`/`UPDATE` via a `PreToolUse` script that `exit 2`s).

This is vigiles' exact "probabilistic compliance vs deterministic constraints"
framing applied to subagents: **compile the typed tool contract into BOTH the
`tools` allowlist (intent) AND a generated `PreToolUse` hook (enforcement), and
verify the two agree.** Nobody else compiles a typed subagent spec to the
manifest while statically resolving tool/MCP/handoff references and wiring the
deterministic rail. (Caveat: these issues' exact semantics are reporter-tested
and may shift across releases — re-verify against the current build before the
enforcement layer leans on them.)

## Prior art on agent contracts (what to steal)

- **OpenAI Agents SDK** — handoffs are tools (`transfer_to_<agent>`); agents
  declare `handoffs=[...]` + an `output_type` schema. → add optional
  `outputSchema` + a statically-resolvable handoff list.
- **LangGraph "agent contract"** — declarative YAML with `role`/`tools`/
  `stateSchema`/`securityConfig` and an explicit **static-vs-runtime split**:
  static = schema validation + cross-reference resolution + required fields;
  runtime = approval interrupts + typed reducers + routing. Adopt that split as
  the feature's spine.
- **Tool-permission enforcement (LangChain/CrewAI/AutoGen) is NOT native** — it's
  a runtime interception layer (wrap the tool, call a policy guard, return the
  block into state). Mirrors the `PreToolUse` model exactly.
- **Static linting of agent manifests barely exists** (AGENTS.md is deliberately
  schema-less; code-first SDKs replace the markdown rather than verify it). This
  is the white space.

## API shape & "generator vs flat flow?" (dogfood finding)

Dogfooded the API against a real OSS subagent — wshobson's `ui-visual-validator`
(`examples/harness/vendor/wshobson-accessibility@.../agents/`). What it actually
is, and what that settles:

- **It's a flat, multi-`##`-section role contract** (10 sections: Purpose, Core
  Principles, Capabilities, Analysis Process, Forbidden Behaviors, …) — prose +
  `###` subsections, **not** an imperative step/gate pipeline.
- **It ships with NO `tools:` line** → inherits every tool (the #1 footgun, in the
  wild). A visual _validator_ that "bases judgments solely on visual evidence"
  shouldn't hold `Edit`/`Write` — yet it does.

So, the answer to "does it need a generator or only flat flow?":

- **Flat flow — yes; a flow/step generator — no.** Real subagents are flat role
  contracts. The `step()`/`gate()` pipeline primitive belongs to **skills**
  (procedures); a subagent's "railway" is a **constraint envelope** (the allowed
  tools it can't leave + the rules), enforced by a hook — not a state machine.
  Reusing skill steps here would model the wrong thing.
- The one _generator_ worth having is authoring-time **tool typing** — a
  `generate-types`-style emit of the real tool catalog (built-ins + the project's
  MCP tools from `.mcp.json`) so `tools:` autocompletes and typos squiggle, the
  same pattern as linter-rule typing. **Optional, not required** (compile already
  catches bad tools); a nice ergonomic upgrade, not a dependency.

The API therefore mirrors `claude()`, not `skill()`: an optional `body` (the
"You are…" intro) + named `sections` (the `##` blocks, verified like any
instruction file) + the `tools` rail + `rules`. The dogfood value-add: the spec
**adds the least-privilege rail the hand-written original omits**, and compile
verifies it — `agent.test.ts` reproduces the real agent's shape with a
`Read/Grep/Glob/Bash` rail (no `Edit`/`Write`) and asserts it compiles clean.

## Empirical survey: do real subagents need an iterator? (no)

Surveyed **~90 real subagents across 9+ repos and several ecosystems** (haiku
agents): wshobson/agents, undeadlist, VoltAgent, 0xfurai, lst97, rshah515, plus
the barkain orchestration plugin. The result saturated — every additional batch
returned zero structural loops. The question: does any subagent encode an
**iterative / loop / state-machine control flow** that flat sections + a tool
contract can't represent — i.e. would we need an iterator/step primitive?

- **Iterative _syntax_ in the agent file: 0 / ~90.** None encode a
  while/for/repeat-until or a state machine _as structure_. (One collection used
  iterative _language_ — "iterate", "Analysis → Implementation" — in ~64% of
  agents, but that's prose, not control flow: 0% iterative syntax.)
- **Numbered "Process / Approach / Workflow" lists** (≈30–95% of agents) are
  **advisory prose** — a markdown numbered list, fully representable as a section.
  Prose, by design: the model adapts/skips/reorders, it's not an automaton.
- **The only loop-like cases are ORCHESTRATORS** (`team-lead`,
  `fullstack-qa-orchestrator`, `architect-reviewer`) — and in every one the loop
  is **prose mediated by the `Task` tool**, not a construct the markdown encodes.
  _Looping lives in the runtime (Task + model judgment, or a slash command), never
  in the subagent definition._ That is the decisive finding.
- **The clincher** — the most sophisticated orchestrator found,
  `barkain/claude-code-workflow-orchestration`, implements a genuine **DAG / wave
  scheduler** (dependency analysis, parallel waves, file-conflict resolution,
  concurrency cap). All of that control flow lives in a \*_slash command
  (`commands/delegate.md`) + Python validation hooks (`validate*task_graph*_.py`)
  - JSON state files** — *not in any subagent `.md`*. The subagents it dispatches
    are still flat workers. So even where real, structured orchestration exists, the
    flow is a **command + hooks + state\** machine, and the subagent stays a flat
    role-contract. If vigiles ever compiles orchestration flow, that's a *command\*
    target (body + enforcing hooks — vigiles' `guard()` model), never the agent spec.
- **Official Anthropic plugins say the same.** In the Ralph loop, iteration is a
  **`stop-hook.sh` + state file** that checks a counter, blocks exit, and re-feeds
  the prompt — the loop is _session-level_, the `.md` only stores state. The
  PR-review-toolkit ships 6 **flat role skills**; their parallelism is the main
  agent's reasoning, not declared. The architectural reason is fundamental:
  markdown is declarative + stateless; a loop is imperative + stateful (counter,
  conditional exit, re-invocation), so it can _only_ live in a hook or a script.
  That's the same compile-to-hooks model vigiles already owns — reinforcing that
  the value is **emitting hooks** (PreToolUse for the tool rail; Stop for a loop),
  not inventing iterator types.
- **Handoff/delegation to other named agents (category D): ≈12–15%** — a
  _reference list_, statically resolvable against compiled agent names. This, not
  an iterator, is the real orchestrator need.
- **Formal output schema: ≈0%** — all use markdown templates, not schemas, so a
  typed `outputSchema` is speculative; defer.
- **Tool-declaration rate is ecosystem-dependent** — wshobson specialists mostly
  inherit-all (the footgun), undeadlist declared `tools:` 25/25 — so the
  omitted-`tools` warning is worth shipping but isn't a universal problem.

**Verdict: ship the flat model; do NOT add an iterator/step/flow primitive** — it
would be a solution seeking a problem (0 / ~90). The architectural reason is
clean: a **skill** is a deterministic subroutine, so a `gate()` per step makes
sense; an **agent** is an autonomous worker, so _whether to loop or retry is the
model's decision at runtime_, not the spec's — a structural gate would over-
constrain the autonomy that's the point of a subagent. A **typed iterator/flow
primitive does not exist anywhere** in the ecosystem (community or the official
SDK); the official strategy is explicit — _a workflow is a JavaScript script you
write; the plan lives in code, agents do the thinking._ Even a typed
**handoff/`Agent(x,y)`** field is only weakly supported: delegation graphs are
linear or star and usually decided dynamically by the model, so prose + the
`Task`/`Agent` allowlist already covers them — keep handoff resolution on the
_maybe_ list, not the build list. Real orchestration flow lives in
commands+hooks+state, a separate compile target. Output schemas are declared (as
prose templates) in ~0–32% depending on collection — also a _maybe_, not now.

Confidence ≈90%. Caveats: tool-declaration rate swings hard by ecosystem
(wshobson specialists inherit-all = footgun; community collections declared
`tools:` ~100%), so the omitted-`tools` warning matters but isn't universal; the
orchestrator slice is the thinnest — re-survey if/when the handoff field is built.
If 5+ agents ever need real flow, that's an `OrchestrationSpec`, not a retrofit of
`AgentSpec`.

## Status & roadmap

**Shipped (the foundation):** `agent()` builder + `compileAgent` — frontmatter
(`name`/`description`/`model`/`tools`), system-prompt body with verified
`file()`/`cmd()`/`symbol()`/`ref()` marks, a `## Rules` section, SHA-256 integrity
hash, tool-contract verification (built-in set + `mcp__server__tool` pattern +
"did you mean", and an error for never-available tools), and `adoptDiff` support.

**Shipped (the differentiator):** the **`PreToolUse` enforcement hook**
(`src/agent-runtime.ts`, `vigiles agent-hook`). The compiled `.md` frontmatter
`tools:` is the single source of truth: `parseAgentTools` reads it back, the
PreToolUse hook blocks (exit 2 + the contract fed to the model) any tool outside
it for the active subagent, and `decidePreToolUse` is the pure allow/deny.
`.vigiles/active-agent.json` records the dispatched agent (Claude Code doesn't
surface it), mirroring the skill `Stop`-hook (`src/skill-runtime.ts`). The
declared list and the enforced rail are compiled from the same source, so they
**agree by construction** — proved by a round-trip test (compile → parse the
frontmatter the hook reads → it equals the declared `tools` and allows exactly
those). Proven deterministically at the `runHook` unit tier against the real
built CLI process: a tool-event hook is reached cheaply there, where driving a
live tool call against a scripted mock is flaky (so the e2e defers to it).

For orchestration _over_ subagents (the railway), see
`research/railway-subagents.md` — verified plan-as-code, the Temporal analogy, and
the marks / `workflow()`-spec / deterministic-driver options.

**Next, prioritized (research-driven):**

1. **`disallowedTools` + omitted-`tools` warning** — surface the inherit-everything
   footgun (needs a warnings channel on `CompileAgentResult`). The compiler errors
   on a bad tool but is silent on the far more common case: no `tools:` line at
   all (inherit everything). The runtime rail already honors this (no contract →
   no restriction), so the gap is purely an authoring-time nudge.
2. **Resolve `Agent(x,y)` handoffs + `skills:`/`mcpServers:` refs** against compiled
   agent/skill/server names — stale-reference detection for the agent graph.
3. **Reuse `measureTriggerRate` for agent dispatch** — does the `description`
   actually fire (and not mis-route)? Agents are a new target for the existing eval.
4. **Plugin-context lint** — error when a plugin-targeted agent uses
   `hooks`/`mcpServers`/`permissionMode` (silently dropped).
5. **Linter cross-ref + CLI discovery** — wire agent specs into `vigiles compile`
   discovery and run the `enforce()` rules through `linters.ts` like CLAUDE.md.
6. **Optional `outputSchema` / `maxTurns` range checks** — the structured-output
   and limit half of the contract (static slice).
7. **Drift detection** — declared vs actually-used tools from session transcripts
   (extends the session-audit pillar; needs runtime data).
