---
name: test-harness
description: Install vigiles and test a Claude Code harness — hooks, skills, settings, CLAUDE.md — by picking the right tier (unit / deterministic / eval) and writing a test that passes. Use when the user wants to check that a hook fires or blocks, that a skill triggers, that injected context lands, or that a harness change moves what the agent does.
---

Test the Claude Code **harness** — the hooks, skills, settings, and CLAUDE.md that
steer an agent — as the assembled machine it ships as. vigiles gives three tiers,
cheapest first; this skill picks the right one, writes the test, and runs it.

The guiding rule: **start at the cheapest tier that can answer the question, and
climb only when it genuinely can't.** Two of the three tiers need no model and no
API key, so they run on every commit for free — reach for the paid real-model
tier only when the question actually requires a real model.

## Step 0 — Pick the tier (the judgment call)

Match what you're testing to the cheapest tier that can answer it:

| What you're testing                                                                                                                    | Tier              | Cost                                             | API                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| "Does this hook block/allow event X?" — pure hook logic, **every** event type (incl. Edit/Write, PreCompact, SessionEnd, SubagentStop) | **Unit**          | free, milliseconds, no `claude`                  | `runHook`                                                                                     |
| "Is the hook actually **wired into** the assembled plugin and does it fire in a real session?"                                         | **Deterministic** | free, no API key (real `claude` + scripted mock) | `runHarnessTest` + `scriptModel`                                                              |
| "Did the injected context (a SessionStart hook, a `/command`) actually **reach the model**?"                                           | **Deterministic** | free, no API key                                 | `runHarnessTest` → `trace.modelRequests` / `assertRequestContains`                            |
| "Does this skill's **description trigger** when it should (recall) **and stay quiet** when it shouldn't (precision)?"                  | **Eval**          | **paid** (real model)                            | `measureTriggerRate` (+ `irrelevantPrompts`) → `assertTriggerRate({ min, maxFalsePositive })` |
| "Does this harness change **move what the agent does**?" (A/B, signal vs noise)                                                        | **Eval**          | **paid** (real model)                            | `runEval` + `assertSignificant`                                                               |

Most harness questions — block/allow, wired-in, context-landed — never need a
model. Only "does the model trigger / behave differently" needs the eval tier.

If the unit and deterministic tiers can both answer it, **prefer unit**: it's
faster and reaches events the deterministic mock can't drive.

## Step 1 — Ensure vigiles is installed

Check whether `vigiles` is a dependency (`package.json`), and install it as a
dev dependency if not:

```bash
npm i -D vigiles    # or: pnpm add -D vigiles / yarn add -D vigiles
```

The deterministic tier additionally needs the `claude` CLI on PATH (no API key):
`npm i -g @anthropic-ai/claude-code`. The eval tier needs model auth. If the
`claude` CLI is missing, you can still write and run **unit**-tier tests.

## Step 2 — Locate the harness surface to test

Find what the project actually ships, in this order:

1. `.claude/settings.json` / `.claude/settings.local.json` — inline `hooks`.
2. `.claude-plugin/plugin.json` — a plugin manifest (`hooks`, `skills`, `agents`, `mcpServers`).
3. `hooks/hooks.json` — the plugin hooks convention (e.g. obra/superpowers).
4. `skills/<name>/SKILL.md`, `agents/<name>.md`, `commands/<name>.md`.

Pick one concrete thing to pin down — a specific `PreToolUse` hook, a specific
`SessionStart` injection, a specific skill.

## Step 3 — Write the test for the chosen tier

**Unit (`runHook`)** — hand a hook a synthesized event, assert the decision:

```ts
import { runHook, assertHookBlocked } from "vigiles/testing";

const r = runHook(hookCommand, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assertHookBlocked(r); // exit 2 / decision:"block" / permissionDecision:"deny"
```

Testing a hook you didn't write (a vendored third-party script)? Mark it
`{ trusted: false }` and it runs confined under bubblewrap by default (read-only
host, cleared env, no network egress). Add `{ recordEgress: true }` to also
**record** what it tries to reach — `r.egress` plus `assertNoEgress(r)` /
`assertEgressOnly(r, [...])` — the supply-chain check for "what does this skill
phone home to / install from?". When the hook's setup needs a _real_ install,
`{ egress: { allow: ["registry.npmjs.org"] } }` lets it reach only that
allowlist (a packet-layer `nft` wall, so a raw socket off-list is dropped too) →
`r.egress` (allowed hosts) + `r.egressDropped`. Be precise about the boundaries:
see
[`docs/sandboxing.md`](../../docs/sandboxing.md) (it blocks destruction and
egress, but does NOT isolate reads of host files, and only under bwrap).

**Deterministic (`runHarnessTest`)** — load the real plugin, drive a scripted
mock model, assert the hook fired (or the context landed):

```ts
import {
  runHarnessTest,
  scriptModel,
  assertHookFired,
  assertRequestContains,
} from "vigiles/testing";

const r = await runHarnessTest({
  pluginDir: "./", // or { settings: { hooks: {...} } }
  transcript: true,
  model: scriptModel([{ text: "ok" }]),
});
assertHookFired(r, "SessionStart");
assertRequestContains(r, "expected injected text"); // did it actually land?
```

**Eval (`runEval`)** — A/B the change on vs off across real-model trials, then
gate on significance, not eyeballing:

```ts
import { runEval, assertSignificant } from "vigiles/testing";

const report = await runEval({
  arms: { off: {}, on: { pluginDir: "./" } },
  task: "…a task the harness change should affect…",
  measure: (ctx) => ({ ok: /* a bare predicate over the trace */ true }),
  trials: 6,
  cache: "readwrite",
});
assertSignificant(report, { baseline: "off", arm: "on", metric: "ok" });
```

## Step 4 — Run it

In a runner (node:test / vitest / jest) the tests are plain async functions. Or
use the zero-setup CLI, which discovers and runs the files:

```bash
npx vigiles test                 # *.harness.{mjs,ts} — unit + deterministic, no API key
npx vigiles eval --trials=6      # *.eval.{mjs,ts} — real model (local / nightly, not CI)
```

Unit-tier `runHook` tests need no `claude` and **always run** — write and run them
even with no `claude` installed. A tier that genuinely can't run reports a loud
`⊘ SKIPPED` (tallied separately, never a fake `✓`); a standalone script emits one
via `skip(reason)` from `vigiles/testing`. A skip passes by default, but in a CI
job that asserts the capability is present, run **`vigiles test --no-skip`** so a
skipped tier fails — a green-with-skips is untested surface. Keep unit +
deterministic tests in CI (free); run evals locally or on a schedule with auth.

## When the user didn't say what to test

Don't ask them to specify — **pick something real and demonstrate.** Scan the
harness surface (Step 2), choose the cheapest meaningful test, write it, run it,
and show the result. Good default picks, in order:

1. A `PreToolUse` hook → **unit-test** that it blocks the thing it's meant to block (and allows a safe sibling).
2. A `SessionStart` hook that injects context → **deterministic** test that the text actually reaches the model (`assertRequestContains`).
3. A skill → **deterministic** test that it resolves via `pluginDir`, then offer the paid `measureTriggerRate` eval as a follow-up.

Then say which tier you used and why, and offer to climb a tier if the cheaper
test can't fully answer their question.

## Reference

The full guide — every tier, testing skills for real, "fired ≠ landed", the
safe-by-default sandbox, the coverage matrix, and how it compares to promptfoo —
is in [`docs/harness-testing.md`](../../docs/harness-testing.md).
