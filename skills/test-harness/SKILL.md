---
name: test-harness
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
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
| "Is this exact skill's **output any good**?" — absolute quality, no on/off baseline (the default for testing one skill)                | **Eval**          | **paid** (real model)                            | `measure({ checks: [judged(rubric)] })` → `assertRates({ min })`                              |
| "Does this harness change **move what the agent does**, _relative_ to off?" — A/B lift, regression, signal vs noise                    | **Eval**          | **paid** (real model)                            | `runEval` (arms) + `assertSignificant`                                                        |

Most harness questions — block/allow, wired-in, context-landed — never need a
model. Only "does the model trigger / behave differently" needs the eval tier.

If the unit and deterministic tiers can both answer it, **prefer unit**: it's
faster and reaches events the deterministic mock can't drive.

## Step 0.5 — Set honest expectations (what's testable, and at what cost)

Be explicit with the user about which bucket each surface falls into — never let
"we'll test it" hide whether that's free, sub-priced, or needs a container. Every
surface sorts into one of three buckets:

- **A — Free & deterministic** (no model, runs in CI on every commit): a hook's
  block/allow decision (`runHook`), a tool-contract / "did NOT call the forbidden
  tool" check, structural facts (`vigiles audit`), and **record-replay** of any tool
  a skill shells out to (record the real result once, replay it via a PATH stub).
- **B — Model-gated, on your subscription** (real model, **no metered API**): does a
  skill's description **fire** (`measureTriggerRate`, recall + precision) **and**
  does its guidance actually **produce good output** (score it directly:
  `measure({ checks: [judged(rubric)] })` + `assertRates` — the absolute oracle;
  use a `runEval` A/B on-vs-off only when you need the _relative_ lift). This is
  the half a **prose / guidance skill** lives in —
  its worth is behavioral, so only a model can judge it. That is **not** "uncovered"
  and **not** free: it's fully testable on the sub. State it that way.
- **C — Needs a real service** (a real browser / DB / redis / a11y runtime): vigiles
  **composes with a container** here; it does not fake real semantics. Name the
  service and hand off — don't pretend a cheap tier substitutes for it.

So a prose-skill library is roughly **~100% testable (some free, most on your sub),
~0% needs-a-container** — not "poorly covered." An accessibility/browser plugin is
the worst case, with a large bucket C. When you report coverage, give **two
numbers**: "% testable at all (free + sub)" vs "% that needs a container", and say
which surfaces are free vs sub-priced. The model-gated half is the **point** of the
eval pillar (affordable on the sub), not a gap — and testing a prose skill's
_behavior_ requires a real model for **everyone** (promptfoo, the SDKs, all of it);
vigiles just does it on your subscription instead of metered API.

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

**Eval — absolute (`measure` + `judged`)** — testing _one_ skill, the usual case:
score its output directly against a rubric. No on/off baseline — this is the
"is it any good?" oracle (what promptfoo/DeepEval lead with), and the right
default when there's nothing to compare against:

```ts
import { measure, judged, skill, assertRates } from "vigiles/testing";

const report = await measure({
  pluginDir: "./",
  task: "…a task the skill should handle…",
  checks: [
    skill("my-plugin:my-skill"), // it fired
    judged("the answer correctly does X and avoids Y"), // …and the output is good
  ],
  trials: 6,
});
assertRates(report, { min: 0.8 }); // each check passes ≥ 80% of trials
```

**Eval — relative (`runEval` + `assertSignificant`)** — when the question is
_lift over no-skill_ (regression, or proving a change isn't noise): A/B the
change on vs off and gate on significance, not eyeballing:

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

### Never hand-roll the runner — it silently eats stderr

Do **not** reach for `execFileSync` / `spawnSync` to drive the thing under test.
The failure is quiet and repeats: `execFileSync` returns **stdout only** on
success, while advisory output — including vigiles's own compiled-hook
`notice()` — is written to **stderr**. A hand-rolled runner therefore reports a
perfectly healthy react hook as **dead**, and an assertion about a warning can
never pass. (Observed three times in one repo, twice after the first fix.)

Every vigiles result already carries **both streams**, so the bug is
unrepresentable:

| Runner           | Result              | Carries                                             |
| ---------------- | ------------------- | --------------------------------------------------- |
| `runHook`        | `HookRunResult`     | `exitCode`, `stdout`, `stderr`, `blocked`           |
| `runHarnessTest` | `HarnessTestResult` | `exitCode`, `stdout`, `stderr`, `cwd` + the `Trace` |

**Testing a plain helper script** (a bash/node/python program that isn't a hook)?
`runHook` is the right tier: it runs any command, pipes it the event JSON on
stdin (a script that ignores stdin simply ignores it), and hands back exit code
plus both streams.

```ts
const r = runHook("bash scripts/check-links.sh", {}, { cwd: repoDir });
assert.equal(r.exitCode, 0);
assert.match(r.stderr, /0 broken links/); // advisory output lives HERE
```

⚠️ One real limit: `r.filesWritten` is recorded only on **confined** runs, so
`assertNoWrite` / `assertWroteOnly` pass **vacuously** after a plain unconfined
run. Pass `{ sandbox: "auto" }` (Linux + bubblewrap) when you actually need to
assert on what the script wrote.

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

### After a real-model run: TELL THE USER WHAT IT SPENT

Whenever you run a real-model eval (`runEval` / `measureArms` / `measureTriggerRate`
/ `measure`), **surface the spend to the user in your reply** — don't let a paid run
be silent. `runEval` prints a cost block to stderr and every report carries `usage`
(`report.arms[*].usage`: `totalCostUsd` + token counts). Relay, in plain words:

- **tokens spent** and the **API-equivalent `$`** (`total_cost_usd` — what it _would_
  cost at metered API rates);
- **how it was billed** — "on your Claude subscription (**$0 metered**)" if you're
  logged in, or a **⚠ warning** if `ANTHROPIC_API_KEY` is set (that run was billed
  **per token** — tell them to unset it and `claude login` to run free).

We do **not** show "% of your subscription" — Anthropic doesn't expose a plan's
quota, so any percentage would be invented. Tokens + API-equivalent `$` + the
billed-to line is the honest, complete picture. Keep the user's cost visible, always.

## Step 5 — Lock the eval so CI stays honest (you do this automatically)

Real-model evals run on the user's subscription — locally, never in CI. So **as
part of writing an eval, you keep its result fresh for them.** Do these two things
without being asked:

1. **Give every eval a `name`.** That's what the lock keys on.
2. **After running it, commit the lock:**

   ```bash
   vigiles eval --update      # records the result → .vigiles/eval-locks/<name>.lock.json
   ```

   Then commit that file. CI runs `vigiles eval --check` (no model) to verify it
   still matches the inputs — so a later edit that forgets to re-eval fails loud
   instead of shipping stale numbers.

**When you later change a skill's description or prompts, re-run `vigiles eval
--update` and commit the updated lock** — the change altered what the eval
measures. (vigiles also nudges you: when a lock exists, a `SKILL.md` edit triggers
a non-blocking reminder.)

Why it's cheap: `--check` only hashes inputs (skill text, prompts, model). A
**threshold** change in the test re-uses the saved numbers (no model); only an
**input** change needs a fresh `--update`. Full mechanics:
[`docs/harness-testing.md`](../../docs/harness-testing.md#keep-eval-results-fresh-in-ci-the-lock).

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
