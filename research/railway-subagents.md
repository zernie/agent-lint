# Railway-style subagents — verified orchestration over flat workers

Design exploration. Builds on `research/subagent-compilation.md` (the flat
`agent()` compiler + the empirical "no iterator inside a subagent" verdict).
Where that doc answers "what is one subagent," this asks: how do we express a
_flow_ over many — a railway — without reinventing a workflow engine?

## What changed in 2026 (two inputs)

- **Plan-as-code ("ultra plan" / dynamic workflows).** Anthropic's dynamic-
  workflow approach has the orchestrator _generate a JavaScript orchestration
  script on the fly_ and run it: the plan is code, the model writes the loop, the
  subagents do the work. Powerful — but the generated script is **ephemeral and
  unverified**: it names subagents/tools/files nothing has checked, and it's
  regenerated per task, so it can't be reviewed, pinned, or regression-tested.
  _(Exact shape pending verification — see Status.)_
- **Nested subagents (Claude Code, experimental, depth ≤ ~5 — user-reported).**
  Claude Code now reportedly lets a subagent spawn its _own_ subagents up to a
  small max depth. This turns delegation from flat (orchestrator → workers) into a
  real **tree**, which (a) makes a typed handoff graph worth verifying — depth
  bound, cycles, dangling targets — and (b) introduces a runaway-spawn failure
  mode a compile-time guard can catch. The design is **robust to the exact cap**:
  whatever the platform max (1 or 5), the compiler verifies depth ≤ max. _(Cap +
  flag still to verify against the Claude Code docs — see Status; do NOT confuse
  this with the Developer Platform "Managed Agents" API, a different product.)_

## Reframe: a railway is a _verified orchestration layer_, not an iterator

The survey settled that flow never lives inside a subagent `.md` (0 / ~100). So a
"railway" is the **orchestrator** (a command / workflow) over flat workers, plus
the **deterministic rails** (gates, tool limits, depth caps) enforced by hooks.
The vigiles play is to be the **typed, verified, compiled** counterpart to
ultra-plan's ad-hoc script: spec is source of truth → compile to the harness's
native primitives (a command `.md` the orchestrator reads + `PreToolUse` / `Stop`
/ validation hooks + a JSON state schema) → every reference checked at compile
time → the whole railway regression-testable with `runEval` (does it reach the
goal, reliably — pass^k?).

## The Temporal analogy (the user's framing)

Temporal: you write a **workflow in normal code** under a determinism constraint;
side-effecting steps are **activities**; the engine owns state, retries, replay.
Map it:

| Temporal                          | Railway-subagent equivalent                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Workflow (deterministic code)     | `workflow()` spec — the railway; deterministic control flow                    |
| Activity (side-effecting)         | `delegate(agent, task)` — a subagent dispatch via `Task` (the model does work) |
| Child workflow                    | a nested subagent spawn (depth ≤ cap)                                          |
| Signal / wait                     | a `gate()` — a deterministic check that must pass to advance                   |
| Durable state + replay            | the JSON state file + `Stop`-hook re-entry; replay via the eval record/replay  |
| "No non-determinism in workflows" | "the railway is deterministic; the _thinking_ is the activity (the model)"     |

The crux Temporal gets right and we should steal: **a hard line between the
deterministic orchestration and the non-deterministic work.** The railway routes;
the model works inside each delegated activity. That is railway-oriented +
Temporal, and it is exactly vigiles' "deterministic constraints vs probabilistic
compliance" split.

## Options (the design space)

Three commitment levels, mirroring the existing adoption ladder.

**1 — Marks (manual, Level 0).** Author the orchestrator in a command/agent `.md`
and annotate it with marks `vigiles lint` verifies (and optionally compiles to
hooks):

    <!-- vigiles:delegate code-reviewer -->     # target subagent must exist
    <!-- vigiles:gate "npm test" -->            # deterministic advance gate
    <!-- vigiles:depth 3 -->                     # spawn-depth cap (≤ platform max)

- _Pros:_ zero new files, gradual, works on the hand-written orchestrators that
  dominate today. _Cons:_ untyped; flow stays prose-driven; marks verify
  references, not the control structure.

**2 — TypeScript spec compilation (Level 2) — the recommended core.** A typed
`workflow()` spec built from a _limited API exported by vigiles_ (the Temporal-
shaped surface) that compiles to the native artifacts:

    // workflows/ship.workflow.ts
    export default workflow({
      name: "ship",
      state: { /* typed state schema */ },
      steps: [
        delegate("planner", "draft a plan"),
        gate(cmd("npm test")),                    // must pass to advance
        parallel([                                 // a wave
          delegate("code-reviewer", "review the diff"),
          delegate("security-auditor", "scan for vulns"),
        ]),
        retry(delegate("fixer", "address findings"), { max: 3 }),
      ],
    });

Compiles to **(a)** the orchestrator command `.md` (what the agent reads),
**(b)** enforcing hooks (a `PreToolUse` tool-rail per delegated agent, `Stop`-hook
gates, a validation hook for depth / cycles / DAG), **(c)** a JSON state schema.
Source of truth is the spec; `delegate` targets, `gate` commands, `tools`, and the
spawn depth are all **verified at compile time** — the thing ultra-plan's
generated script can't be. _Pros:_ typed + verified + pinned + regression-
testable; reuses compile, marks, hook-emission, eval. _Cons:_ new surface; and
the `steps`/`parallel`/`retry` primitives are exactly the flow vocab the survey
said subagents don't need — but they belong **here**, at the orchestration layer,
not inside an agent.

**3 — Temporal-like deterministic driver (north star, heaviest).** The same
`workflow()` API, but vigiles also _drives_ it: a thin deterministic runner over
Claude Code's native `Task` + `Stop`-hook + state-file primitives, so the railway
is **durable across turns and replayable** — and `runEval` can score a whole
workflow (reliability of the railway, not one prompt). _Pros:_ the full Temporal
benefit (durable, replayable, evaluable orchestration). _Cons:_ it's a runtime —
the risk of reinventing a workflow engine. **Boundary: do not build an engine;
delegate execution to the harness.** vigiles owns the typed spec + verify +
emit-to-native-hooks + the record/replay it already has; the loop is the
`Stop`-hook + state pattern that already ships (`skill-hook` / `vigiles:result`).

## Why this fits vigiles (reuse, not new pillars)

- `agent()` already compiles the flat workers; `workflow()` compiles the railway
  over them — same compiler, marks, hash.
- The enforcement hook (the queued differentiator) is the shared primitive: a
  `PreToolUse` rail per delegated agent + a `Stop` gate per `gate()` — and we
  already emit `Stop` gates (`skill-hook`, `research/runtime-enforcement.md`).
- The eval tier already does pass^k / significance — point it at a workflow to
  measure railway reliability; the record/replay cache _is_ Temporal-style replay.
- Depth / cycle / dangling-target checks on the spawn graph are the same stale-
  reference detection vigiles does for files/rules — newly load-bearing because
  nested subagents are now real.

## Recommendation

Layer them like the adoption ladder: **(1) marks** as the on-ramp for today's
hand-written orchestrators; **(2) `workflow()` compilation** as the core
deliverable (typed, verified plan-as-code — the direct, differentiated answer to
ultra-plan); **(3) the deterministic driver** as the north star, built thin over
the harness, only once (2) has users. The agent `PreToolUse` enforcement hook —
the shared rail both (2) and (3) emit — is **already shipped**
(`src/agent-runtime.ts`, `vigiles agent-hook`; see `research/subagent-compilation.md`),
so a `workflow()` only needs to point per-delegate rails at it.

## Status: prototype shipped (Option 2, the static half)

The typed `workflow()` direction now has a concrete prototype — railway-oriented
programming with a subagent as the step:

- **`result(ok, err)`** (`src/spec.ts`) — a subagent's typed Result contract,
  rich on both tracks; compiles into a `## Output contract` section telling the
  worker to end with a `vigiles:ok` / `vigiles:err` block.
- **`parseAgentResult`** (`src/agent-result.ts`) — pure `text → Result<S,E>` (ok |
  err | malformed), validated against the contract shape. The shared primitive.
- **`railway({ steps, onError, recover })` + `delegate()`** (`src/spec.ts`) — the
  sub-Turing composer: a finite step list + bounded recovery, **no loop
  combinator**, so termination is structural. **`compileRailway`/`validateRailway`**
  (`src/compile.ts`) emit the orchestrator command and resolve every delegate
  target against the known agent set (stale-ref), reject an empty railway, and
  require `recover.max ≥ 1`.
- **`assertAgentOk` / `assertAgentErr` / `assertAgentResult`** (`src/harness-assert.ts`)
  — the testing-framework payoff: assert a subagent's outcome the way you assert a
  hook decision, reusing `parseAgentResult`.

What's deliberately deferred (the runtime half): vigiles emits + verifies, it does
not _drive_ the railway (that'd be Option 3, the engine). And the runtime
enforcement of "did the worker actually emit a valid result block?" awaits
confirmation of what a `SubagentStop` hook can see — see the open question below.

## Open questions

- **Verification (partial — and a product caveat).** Plan-as-code is **confirmed
  for Claude Code**: earlier in-session research found `code.claude.com/docs/en/
workflows` ("Orchestrate subagents at scale with dynamic workflows" — _a
  workflow is a JavaScript script that orchestrates subagents_). The name "ultra
  plan" itself is unconfirmed — treat it as that dynamic-workflows feature. The
  nested-subagent claim is **not yet verified**: an automated check came back
  inconclusive because it examined the **Developer Platform "Managed Agents" API**
  (`platform.claude.com` — coordinator + roster, depth-1, max 20 agents), which is
  a _different product_ from Claude Code CLI subagents (`code.claude.com`). So
  neither confirm nor refute it from that source — re-verify against the Claude
  Code docs/changelog specifically. The design doesn't hinge on the number.
- Does the harness expose enough to _deterministically drive_ a workflow (read a
  subagent's result between turns), or is Option 3 limited to `Stop`-hook gating?
- Is `workflow()` a third spec target, or a mode of a future `command()`
  compilation (since real flow lives in commands)? Leaning: a `command()` target,
  with `workflow()` as its structured form.

## See also

- `research/subagent-compilation.md` — the flat `agent()` compiler + the "no
  iterator in a subagent" survey this builds on.
- `research/runtime-enforcement.md` — the hook-emission / Stop-gate prior art.
- `research/eval-api-landscape.md` — the eval tier that would score a railway.
