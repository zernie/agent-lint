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

The pivotal finding (Claude Code issue #54898): **`tools:` is not a hard runtime
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
deterministic rail. (Caveat: #54898's exact semantics are one reporter's testing
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

## Status & roadmap

**Shipped (the foundation):** `agent()` builder + `compileAgent` — frontmatter
(`name`/`description`/`model`/`tools`), system-prompt body with verified
`file()`/`cmd()`/`symbol()`/`ref()` marks, a `## Rules` section, SHA-256 integrity
hash, tool-contract verification (built-in set + `mcp__server__tool` pattern +
"did you mean", and an error for never-available tools), and `adoptDiff` support.

**Next, prioritized (research-driven):**

1. **Generated `PreToolUse` enforcement hook** — compile the `tools` contract into
   a hook that blocks out-of-contract tools, and assert hook ⇄ allowlist agree.
   _The differentiator; the deterministic rail; answers #54898._
2. **`disallowedTools` + omitted-`tools` warning** — surface the inherit-everything
   footgun (needs a warnings channel on `CompileAgentResult`).
3. **Resolve `Agent(x,y)` handoffs + `skills:`/`mcpServers:` refs** against compiled
   agent/skill/server names — stale-reference detection for the agent graph.
4. **Reuse `measureTriggerRate` for agent dispatch** — does the `description`
   actually fire (and not mis-route)? Agents are a new target for the existing eval.
5. **Plugin-context lint** — error when a plugin-targeted agent uses
   `hooks`/`mcpServers`/`permissionMode` (silently dropped).
6. **Linter cross-ref + CLI discovery** — wire agent specs into `vigiles compile`
   discovery and run the `enforce()` rules through `linters.ts` like CLAUDE.md.
7. **Optional `outputSchema` / `maxTurns` range checks** — the structured-output
   and limit half of the contract (static slice).
8. **Drift detection** — declared vs actually-used tools from session transcripts
   (extends the session-audit pillar; needs runtime data).
