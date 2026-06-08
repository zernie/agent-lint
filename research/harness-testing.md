# Testing the Claude Code harness — design & coverage

> Status: shipped (2026-06-08). The second pillar that came out of this work: a
> library for **testing the harness itself** — hooks, settings, skills,
> instruction files. Unlike reference verification (bounded by undecidability —
> `reference-verification-limits.md`), harness testing has no such ceiling: a
> test/eval _measures reality_, so there is nothing to game. `src/harness-test.ts`,
> `src/mock-model.ts`, `src/eval.ts`.

## Why this is a pillar

`Agent = Model + Harness`. People building on Claude Code ship **hooks, settings,
skills, CLAUDE.md** — and have no way to test them. They run it manually and
eyeball. The recurring move all through `bench/` — _"benchmark whether this
harness change actually helps"_ — **is** the product. It is also the one direction
with no undecidability wall: you are not forcing a judgment, you are observing an
outcome.

## Two tiers

### Deterministic — `runHarnessTest` (no key, no cost, CI-fast)

Real `claude` CLI + your **real** hooks/settings, pointed at a **scripted mock
model** (`mock-model.ts`, via `ANTHROPIC_BASE_URL` + a dummy key). The agent's
turns are fixed, so the outcome is reproducible. The scripted "steps" are the
model's turns — this is their real home (not production enforcement).

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
load the endpoint can return a 1-turn no-op. Route those to the eval tier.

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

## Coverage of real plugins (local corpus assessment)

| Real plugin                          | Hook type                                                  | Coverage                                                                      |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **obra/superpowers**                 | `SessionStart` (run setup cmd)                             | ✅ deterministic, **verified** (model-independent)                            |
| **block-no-verify** (wshobson)       | `PreToolUse` Bash (block `git commit --no-verify`)         | ✅ deterministic in principle; eval tier for reliability                      |
| **protect-mcp**                      | `PreToolUse`/`PostToolUse` `.*` (Cedar policy gate + sign) | ✅ runs the real `npx protect-mcp …` command verbatim; eval for full coverage |
| **review-agent-governance**          | `PreToolUse` policy + approval flag                        | ✅ same — runs the exact command + env                                        |
| **wshobson/agents** — 156 `SKILL.md` | skills (no hooks)                                          | ✅ eval tier — "does the skill produce the right outcome"                     |

Two findings from the pass:

1. **Hooks that shell out to external binaries** (`npx protect-mcp`,
   `run-hook.cmd`) are a first-class fit — the API runs the command + env
   verbatim, so you test the _actual_ hook, not a reimplementation.
2. **The `.*`-matcher policy gate** (gate every tool through a Cedar policy) is a
   common real pattern and maps directly onto the action-gate/refs-hook test shape.

The real-world hook population is overwhelmingly **governance/policy**
(SessionStart / Stop / Bash / `.*`) — exactly what the deterministic tier covers.
The Edit/Write tool-event gap is where the eval tier earns its place.

## The split, stated once

- **Deterministic** = "does my hook _fire / block_ correctly?" — logic, fast, free.
- **Eval** = "does my hook / CLAUDE.md / skill _change what the agent does_?" —
  behaviour, statistical, real cost.

## See also

- `research/benchmarks-runtime-gates.md` — evals in anger (the four findings).
- `research/reference-verification-limits.md` — the other pillar and its ceiling.
