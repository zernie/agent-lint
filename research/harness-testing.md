---
status: shipped
topic: testing
---

# Testing the Claude Code harness — design & coverage

> Status: shipped (2026-06-08, extended 2026-06-09). The second pillar that came
> out of this work: a library for **testing the harness itself** — hooks,
> settings, skills, instruction files. Unlike reference verification (bounded by
> undecidability — `reference-verification-limits.md`), harness testing has no
> such ceiling: a test/eval _measures reality_, so there is nothing to game.
> `src/run-hook.ts`, `src/harness-test.ts`, `src/mock-model.ts`, `src/eval.ts`,
> `src/plugin-loader.ts`.

## Why this is a pillar

`Agent = Model + Harness`. People building on Claude Code ship **hooks, settings,
skills, CLAUDE.md** — and have no way to test them. They run it manually and
eyeball. The recurring move all through `bench/` — _"benchmark whether this
harness change actually helps"_ — **is** the product. It is also the one direction
with no undecidability wall: you are not forcing a judgment, you are observing an
outcome.

## Three tiers, lowest cost first

The tiers form a pyramid: each is cheaper and reaches more of the surface than
the one above it, and each answers a different question.

### Unit — `runHook` (no `claude`, no model, every event)

A hook is just a process: Claude Code pipes a JSON event to its stdin and reads
back an exit code (`2` = block) and an optional JSON decision on stdout.
`runHook` drives exactly that contract — no `claude` binary, no model, no sandbox
— so a hook's _logic_ is testable in milliseconds.

```ts
runHook(guardCommand, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
}).blocked; // true — exit 2 / decision:block / permissionDecision:deny
```

This is the base of the pyramid, and the **only** tier that reaches every event.
The deterministic mock (below) can't trigger Edit/Write tool events
(headless-gated), `PreCompact`, `Notification`, `SessionEnd`, or `SubagentStop`;
here you hand the hook the event JSON yourself, so all of them are testable. What
it does _not_ prove: that the hook is wired into the harness — that's the next
tier. `parseHookOutput` / `decideHook` are pure, so the block/allow policy is
unit-testable with no process at all.

### Deterministic — `runHarnessTest` (no key, no cost, CI-fast)

Real `claude` CLI + your **real** hooks/settings, pointed at a **scripted mock
model** (`mock-model.ts`, via `ANTHROPIC_BASE_URL` + a dummy key). The agent's
turns are fixed, so the outcome is reproducible. The scripted "steps" are the
model's turns — this is their real home (not production enforcement). Where the
unit tier proves logic, this tier proves **wiring**: that settings point at the
hook and it fires inside the assembled machine.

```ts
runHarnessTest({
  files,
  settings,
  model: scriptModel([{ text }, { tool, input }]),
});
```

**Reliable for**: `SessionStart`, `Stop`, `UserPromptSubmit`, and **Bash-tool**
PreToolUse/PostToolUse — the hooks that don't depend on the agent's _edit_ tools.
**Not reliable for**: Edit/Write **tool-event** hooks — the Edit/Write tools are
gated in headless mode and don't fire via the mock, and under heavy nested-CLI
load the endpoint can return a 1-turn no-op. Test those at the unit tier (logic)
or the eval tier (behaviour).

### Eval — `runEval` (real model, statistical)

Define a fixture, **arms** (hook on/off, with/without a CLAUDE.md rule), a task,
and a **metric**; drive the real CLI N trials per arm and aggregate (mean for
numbers, true-fraction for booleans). The generalized form of `bench/run*.sh`.

```ts
runEval({
  fixture,
  arms: { vanilla: {}, gated: { settings } },
  task,
  measure,
  trials,
});
```

Worked reference: `bench/evals/refs-hook.eval.mjs` reproduces benchmark #4 as a
library call — `vanilla caught=0.00` vs `gated marks/caught > 0`.

## Test the assembled machine — the plugin loader

The unit that matters in practice is not one hook but the _assembled_ plugin: the
hooks, CLAUDE.md, skills, subagents, and commands a plugin ships, working
together. `src/plugin-loader.ts` reads that real harness — handling every
real-world layout (inline `plugin.json` hooks, a `hooks` string path, the
`hooks/hooks.json` convention, a plain repo's `.claude/settings.json`) and
expanding `${CLAUDE_PLUGIN_ROOT}` to the real scripts — so a test/eval runs
against **what ships**, not a retyped subset that drifts.

It also returns `warnings`: surfaces the deterministic tier can't drive. That
matters because a plugin can be all subagents and slash commands with **no
hooks** — and a "load the whole plugin" test against such a plugin would
otherwise pass having exercised _nothing_. Dogfooding the loader on the
wshobson/agents marketplace caught exactly this: `tdd-workflows` ships two
subagents and four commands with zero hooks, so the loader now materializes those
surfaces and flags them for the eval tier rather than silently loading an empty
machine.

## Coverage of real plugins (local corpus assessment)

| Real plugin                          | Surface                                                    | Coverage                                                                      |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **obra/superpowers**                 | `SessionStart` (run setup cmd) + 40 skills                 | ✅ deterministic, **verified** (model-independent)                            |
| **block-no-verify** (wshobson)       | `PreToolUse` Bash (block `git commit --no-verify`)         | ✅ unit tier verifies the guard logic directly; deterministic for wiring      |
| **protect-mcp**                      | `PreToolUse`/`PostToolUse` `.*` (Cedar policy gate + sign) | ✅ runs the real `npx protect-mcp …` command verbatim; eval for full coverage |
| **review-agent-governance**          | `PreToolUse` policy + approval flag                        | ✅ same — runs the exact command + env                                        |
| **wshobson/agents** — subagents      | `agents/` + `commands/` (often no hooks)                   | ⚠ materialized + flagged by `loadPlugin().warnings`; eval tier for behaviour  |
| **wshobson/agents** — 156 `SKILL.md` | skills (no hooks)                                          | ✅ eval tier — "does the skill produce the right outcome"                     |

This started as a manual corpus read; two rows are now **runnable, committed
dogfood** against pinned snapshots of the real upstreams (offline, key-free):
[`real-superpowers.harness.mjs`](../examples/harness/real-superpowers.harness.mjs)
(obra/superpowers `hooks/hooks.json` + `${CLAUDE_PLUGIN_ROOT}` expansion) and
[`real-wshobson.harness.mjs`](../examples/harness/real-wshobson.harness.mjs) (a
wshobson/agents sub-plugin, the no-hooks shape). Both verify the loader by
**parsing** the real harness; the side-effectful `SessionStart` setup hook is
asserted-wired, not executed — executing untrusted third-party hooks needs a real
sandbox (the CI container, or an opt-in bwrap/Docker boundary), which `loadPlugin`
deliberately does not provide. See `docs/harness-testing.md` § _Dogfooding real
third-party plugins_.

Findings from the pass:

1. **Hooks that shell out to external binaries** (`npx protect-mcp`,
   `run-hook.cmd`) are a first-class fit — the API runs the command + env
   verbatim, so you test the _actual_ hook, not a reimplementation.
2. **The `.*`-matcher policy gate** (gate every tool through a Cedar policy) is a
   common real pattern and maps directly onto the action-gate/refs-hook test shape.
3. **Subagents and slash commands are the dominant surface** across the
   wshobson/agents marketplace, and neither runs without a real model — so the
   loader's job is to materialize + flag them, and the eval tier is where they're
   actually exercised. The unit tier, conversely, closes the Edit/Write +
   every-event gap that the deterministic tier can't reach.

The real-world _hook_ population is overwhelmingly **governance/policy**
(SessionStart / Stop / Bash / `.*`) — exactly what the deterministic tier covers;
the unit tier covers the rest of the events, and the eval tier covers behaviour
and the agents/commands surfaces.

## The split, stated once

- **Unit** (`runHook`) = "given this event, does my hook _block / allow_?" —
  logic, no `claude`, every event.
- **Deterministic** (`runHarnessTest`) = "is my hook _wired in_ and does it fire
  in the assembled machine?" — wiring, fast, free.
- **Eval** (`runEval`) = "does my hook / CLAUDE.md / skill / subagent _change what
  the agent does_?" — behaviour, statistical, real cost.

## Why the import path IS the capability contract

A test's level is legible three ways at once — its **import path**, its **file
suffix**, and its **CI job** — so you can't accidentally hide a network e2e test
inside the unit gate. The import path is load-bearing: `vigiles/unit` exposes
nothing that needs a model, bubblewrap, or the network; higher tiers re-export the
lower ones (dependencies point downward only), so an e2e test reuses unit
predicates but a unit test _physically can't_ reach egress.

This is enforced, not just named. The runners live at the **composition root**
(`src/`), and the agnostic surface never imports an adapter — an
`eslint-plugin-boundaries` rule forbids an agnostic barrel from importing
`src/adapters/*`. The five tiers map to imports:

| Level       | Import                | File                    | Runner               | Needs                          |
| ----------- | --------------------- | ----------------------- | -------------------- | ------------------------------ |
| refs        | —                     | `CLAUDE.md` / specs     | `vigiles lint`       | nothing                        |
| unit        | `vigiles/unit`        | `*.test.ts`             | vitest `unit`        | nothing                        |
| integration | `vigiles/integration` | `*.integration.test.ts` | vitest `integration` | harness binary + bwrap, no key |
| e2e         | `vigiles/e2e`         | `*.e2e.test.ts`         | vitest `e2e`         | routable sandbox + network     |
| eval        | `vigiles/testing`     | `*.eval.mjs`            | `vigiles eval`       | a real model (keyed)           |

## Two layers or three? (where eval sits)

vigiles has **two layers** — (1) verify the references, (2) test the harness — and
**eval stays inside layer 2**, as its non-deterministic top axis. A _layer_ is a
distinct concern: "the references are real" vs "the harness behaves." Eval isn't a
third concern — it's the deepest way of answering the **same** layer-2 question
("does the harness behave?"), just with different epistemics: it **measures**
(mean ± se, significance, pass^k) where unit/integration/e2e **assert** (pass/fail).
So it's drawn as a distinct _axis_ (non-deterministic, keyed, read-don't-gate) —
but not a separate layer, because splitting it would imply eval delivers a
different value than "test the harness," which it doesn't.

The one future where eval graduates to a third layer: if vigiles builds the
**self-improving harness** (auto-tune skills/hooks by measured evolution — see
`research/divergent-bets.md` #7), eval stops being "a way to test" and becomes "a
way to _optimize_" — a genuinely distinct concern worth its own layer. Until then:
two layers, four levels (refs · unit · integration · e2e) + the eval axis.

## See also

- `research/harness-testing-coverage-matrix.md` — the whole potential testing
  surface (unit / integration / e2e + sandboxing), shipped vs. should-build.
- `research/benchmarks-runtime-gates.md` — evals in anger (the four findings).
- `research/reference-verification-limits.md` — the other pillar and its ceiling.
- `research/eval-api-landscape.md` — the eval-API field summarized and scored
  against our eval API, with the B→A→C roadmap to make it world-class.
- `docs/harness-testing.md` / `docs/testing-matrix.md` — the user-facing guide and
  the use-case × tier matrix.
