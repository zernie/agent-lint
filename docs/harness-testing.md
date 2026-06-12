# Testing your Claude Code harness

> **Try it now — paste this into Claude Code, in any repo:**
>
> > Install vigiles and use its **`test-harness`** skill to write and run a
> > harness test for this project. If I didn't say what to test, pick something
> > real from my hooks / skills / settings yourself, choose the cheapest tier
> > that fits, write the test, and run it.
>
> The `test-harness` skill ships in the vigiles plugin. It installs vigiles,
> scans your harness for a real hook or skill to pin down, picks the right tier
> (unit / deterministic / eval), writes the test, and runs it — defaulting to the
> cheapest meaningful test when you don't name one. Prefer the CLI?
> `npx vigiles test` (deterministic, no API key) and `npx vigiles eval` (real
> model) discover and run `*.harness.mjs` / `*.eval.mjs`.

> **Just want to see it?** `npm run demo:plugin` runs vigiles against a real,
> popular third-party plugin (oh-my-claudecode) and narrates, in plain language,
> what it ships, whether a hook works, and what it phones home to — including a
> real finding (it pings the npm registry on every session start, which we
> record and block). See [`examples/plugin-test-demo.mjs`](../examples/plugin-test-demo.mjs).

`Agent = Model + Harness`. Your harness — hooks, settings, skills, CLAUDE.md —
is code, and code should be tested. vigiles gives you four layers, lowest cost
first:

1. **Verify the references** (static, free) — `vigiles audit` checks that the
   linter rules, files, scripts, and symbols your instruction files cite are
   real. See the [main README](../README.md).
2. **Unit-test a hook** (`runHook`, no `claude`) — given this event JSON, does my
   hook block or allow? Milliseconds, no CLI, reaches **every** event.
3. **Deterministic harness tests** (`runHarnessTest`, no API key) — is the hook
   _wired into the assembled machine_ and does it fire there?
4. **Evals** (`runEval`, real model) — does this harness change actually _move
   what the agent does_?

This doc covers layers 2–4. The library is plain async functions returning
data, so it runs in **any** test runner — node:test, vitest, jest, mocha — and
ships a zero-dependency CLI fallback (`vigiles test` / `vigiles eval`).

**The design bet is deterministic and cheap.** Layers 1–3 never call a model or
need an API key — they're meant to run on every commit for free, and they're
where most of your harness can actually be pinned down. This is the opposite of
eval-only frameworks like [promptfoo](https://github.com/promptfoo/promptfoo),
where every run hits a real model **by design** (and bills accordingly). The
paid real-model tier (layer 4) is here too, but you reach for it only when the
question genuinely needs a real model — not to answer "does my hook block this?"

## Contents

- [A worked example: one real plugin, every tier](#a-worked-example-one-real-plugin-every-tier)
  - [Tier 0 — load the assembled machine](#tier-0--load-the-assembled-machine)
  - [Tier 1 — unit-test a hook (`runHook`)](#tier-1--unit-test-a-hook-runhook)
  - [Tier 2 — deterministic: fired _and_ landed (`runHarnessTest`)](#tier-2--deterministic-fired-and-landed-runharnesstest)
  - [Tier 3 — eval: does the skill _trigger_? (`measureTriggerRate`)](#tier-3--eval-does-the-skill-trigger-measuretriggerrate)
- [Unit-test a hook (no `claude`, every event)](#unit-test-a-hook-no-claude-every-event)
- [Test the whole machine, not one hook](#test-the-whole-machine-not-one-hook)
  - [Native install: testing skills (`pluginDir`)](#native-install-testing-skills-plugindir)
- [One Trace, two consumers — predicates and assertions](#one-trace-two-consumers--predicates-and-assertions)
  - [Did the injected context land? (`modelRequests`)](#did-the-injected-context-land-modelrequests)
  - [Dogfooding real third-party plugins (and the sandbox boundary)](#dogfooding-real-third-party-plugins-and-the-sandbox-boundary)
- [Deterministic tests in your runner](#deterministic-tests-in-your-runner)
- [Evals — does the change move behaviour?](#evals--does-the-change-move-behaviour)
  - [Significance — is the gap real?](#significance--is-the-gap-real)
  - [Regression gating — did this PR make the harness worse?](#regression-gating--did-this-pr-make-the-harness-worse)
  - [Cost, caching, concurrency](#cost-caching-concurrency)
  - [Trigger rate — does the skill _fire_?](#trigger-rate--does-the-skill-fire)
  - [LLM-as-judge for subjective outcomes](#llm-as-judge-for-subjective-outcomes)
- [CLI fallback (no runner, CI-friendly)](#cli-fallback-no-runner-ci-friendly)
- [Coverage](#coverage)
- [Canonical examples](#canonical-examples)
- [What's covered today — surface × tier](#whats-covered-today--surface--tier)
- [How this compares to promptfoo](#how-this-compares-to-promptfoo)
- [See also](#see-also)

## A worked example: one real plugin, every tier

Rather than scatter synthetic snippets, this section walks **one real, popular
plugin** up the tiers — unit → deterministic → eval. The plugin is
[**oh-my-claudecode**](https://github.com/Yeachan-Heo/oh-my-claudecode) (MIT,
~36k★), chosen because it ships **all four harness surfaces in one plugin** —
hooks, skills, agents (subagents), and an MCP server — so a single subject can
demonstrate everything. It's vendored as a pinned, offline **slice** under
[`examples/harness/vendor/oh-my-claudecode@deee3a4`](../examples/harness/vendor/oh-my-claudecode@deee3a4)
(see its `SOURCE`); every tier below is a **committed, runnable** file.

### Tier 0 — load the assembled machine

Before testing a hook, load the plugin the way Claude Code assembles it and see
what's actually there. `loadPlugin` parses the manifest + `hooks/hooks.json`,
materializes skills/agents, and flags the surfaces only a real model can drive:

```ts
import { loadPlugin } from "vigiles/plugin-loader";

const p = loadPlugin("examples/harness/vendor/oh-my-claudecode@deee3a4");
// p.settings.hooks → { UserPromptSubmit: [...] }   (hooks surface)
// p.files          → .claude/skills/{ask,verify}/SKILL.md + .claude/agents/*  (skills + agents)
// p.warnings       → "… MCP server(s) …"  +  "… 2 subagent file(s) … test at the eval tier"
```

All four surfaces in one load. This runs model-free in the gate as a conformance
case in [`src/vendor.test.ts`](../src/vendor.test.ts), alongside obra/superpowers
and wshobson/agents.

### Tier 1 — unit-test a hook (`runHook`)

OMC's `keyword-detector` is a `UserPromptSubmit` hook: it scans the prompt for a
"magic keyword" and, on a hit, injects skill-routing `additionalContext`. Hand it
an event and check the decision — no `claude`, no model, milliseconds:

```ts
import { runHook } from "vigiles/run-hook";

const hit = runHook(keywordDetectorCmd, {
  hook_event_name: "UserPromptSubmit",
  prompt: "please ultrawork on this",
});
// hit.json.hookSpecificOutput.additionalContext includes "ULTRAWORK"
// a plain prompt → no additionalContext injected
```

We run this **vendored, audited, pinned** script directly. For a hook you have
_not_ audited, pass `{ trusted: false }` and `runHook` confines it under
bubblewrap (no egress, cleared env). Full file:
[`examples/harness/oh-my-claudecode-unit.harness.mjs`](../examples/harness/oh-my-claudecode-unit.harness.mjs).

### Tier 2 — deterministic: fired _and_ landed (`runHarnessTest`)

Right logic ≠ wired in correctly _and_ reaching the model. Run the real `claude`
against a scripted mock model with the hook wired on `UserPromptSubmit`, then
assert both that it **fired** and that its injected context **landed** in the
model's request (`trace.modelRequests`) — the "fired ≠ landed" check a "did it
run?" test can't make:

```ts
import { runHarnessTest, scriptModel } from "vigiles/harness-test";
import { assertHookFired, assertRequestContains } from "vigiles/harness-assert";

const r = await runHarnessTest({
  settings: {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: keywordDetectorCmd }] },
      ],
    },
  },
  prompt: "please ultrawork on this refactor",
  transcript: true,
  model: scriptModel([{ text: "on it" }]),
});
assertHookFired(r, "UserPromptSubmit"); // fired
assertRequestContains(r, "ULTRAWORK"); // …and landed
```

Wired via inline `settings` (code you authored → trusted → runs direct, no
sandbox). Pointing `pluginDir` at the whole untrusted plugin instead would run it
confined under bubblewrap. Full file:
[`examples/harness/oh-my-claudecode-deterministic.harness.mjs`](../examples/harness/oh-my-claudecode-deterministic.harness.mjs).

### Tier 3 — eval: does the skill _trigger_? (`measureTriggerRate`)

Wiring (Tier 0) proves a skill _resolves_; whether the **real model chooses** it
from its description across varied phrasings is a property only a model can
answer. Install OMC natively (`pluginDir`) and measure how reliably its `verify`
skill fires on prompts about confirming a change works:

```ts
import { measureTriggerRate } from "vigiles/eval";
import { skillResolved } from "vigiles/harness-assert";

const report = await measureTriggerRate({
  pluginDir: "examples/harness/vendor/oh-my-claudecode@deee3a4",
  prompts: [
    "I think the pagination fix is done — can you confirm it actually works?",
    "Before I mark this complete, prove the new endpoint really behaves.",
  ],
  fired: (t) => skillResolved(t, "oh-my-claudecode:verify"),
  trials: 3,
});
```

This is the **one** tier that needs model auth, so — unlike Tiers 0–2 — it's
**not** run in CI. Full file:
[`examples/harness/oh-my-claudecode-eval.eval.mjs`](../examples/harness/oh-my-claudecode-eval.eval.mjs).

The rest of this guide is the per-API reference behind these four tiers.

## Unit-test a hook (no `claude`, every event)

A hook is just a process: Claude Code pipes a JSON event to its stdin and reads
back an exit code (`2` = block) and an optional JSON decision on stdout.
`runHook` exercises exactly that contract — no `claude` binary, no model — so a
hook's logic is testable in milliseconds, in any runner:

```ts
import { runHook } from "vigiles/run-hook";
import { assertHookBlocked } from "vigiles/harness-assert";

const r = runHook(
  '"$GUARD"',
  {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git commit --no-verify" },
  },
  { env: { GUARD: guardPath } },
);

assertHookBlocked(r); // exit 2, decision:"block", or permissionDecision:"deny"
// expect(r).toBlock();   // …or the matcher, under vitest/jest
```

This is the **base of the pyramid** and the only tier that reaches every event.
The deterministic mock (next section) drives SessionStart / Stop /
UserPromptSubmit / Bash **and Edit/Write** PreToolUse|PostToolUse — but **not**
PreCompact, Notification, SessionEnd, or SubagentStop (the mock can't trigger
them). At this tier _you_ hand the hook the event JSON, so all of them are
testable.

What it does **not** prove: that the hook is _wired in_ (settings point at it,
`${CLAUDE_PLUGIN_ROOT}` resolves). That's what the next layer is for — so use
both: unit-test the logic here, then assert it fires in the assembled machine.

**Unit-testing a hook you don't trust?** Mark it `trusted: false` and confinement
is the default — no need to also remember `sandbox: "auto"`. A foreign hook
command runs under bubblewrap (a no-egress namespace with a cleared environment,
so it can't read your `ANTHROPIC_API_KEY`, while the env _you_ pass in `opts.env`
is added back), and **refuses** rather than running unconfined where no sandbox
is available (Linux + bwrap only). This is the same safe-by-default policy as
`runHarnessTest`'s plugin confinement (`src/sandbox.ts`) — there trust follows
`plugin`/`pluginDir` provenance; here you declare it, because the unit tier takes
a raw command string:

```ts
runHook(vendoredHookCmd, event, { trusted: false, env: { GUARD: guardPath } });
```

Set `sandbox` explicitly to override the trust-derived default: `"auto"`/`"strict"`
force confinement, and `sandbox: false` opts an untrusted hook back out to a
direct run (you vouch for it, or the outer container is the boundary).

## Test the whole machine, not one hook

The unit that matters is the _assembled_ plugin/repo: hooks + settings +
CLAUDE.md + skills working together. Point `plugin` at a plugin (or `"./"` for
your repo) and the real harness is loaded from `.claude-plugin/plugin.json` (or
`.claude/settings.json`), with `${CLAUDE_PLUGIN_ROOT}` resolved to the real
scripts, plus its CLAUDE.md and skills:

```ts
import { runHarnessTest, scriptModel } from "vigiles/harness-test";

const r = await runHarnessTest({
  plugin: "./", // load THIS repo's real hooks + CLAUDE.md + skills
  model: scriptModel([
    { tool: "Bash", input: { command: "rm -rf /tmp/x" } }, // gate should block
    { text: "done" },
  ]),
});
```

Inline `settings` / `files` layer on top (per-event hook arrays are
concatenated), so you can add one extra hook over the real plugin. Worked
example: [`examples/harness/plugin-cohesion.harness.mjs`](../examples/harness/plugin-cohesion.harness.mjs).

**Surface coverage.** The loader materializes hooks, CLAUDE.md, skills,
`agents/` (subagents) and `commands/` (slash commands) into the sandbox.
Subagents, slash commands and MCP servers only run under a **real model**, so
they belong to the eval tier — `loadPlugin(...).warnings` lists any such surface
a plugin ships, so "load the whole plugin" never silently tests an empty machine
(e.g. a subagents-only plugin with no hooks):

```ts
import { loadPlugin } from "vigiles/plugin-loader";
const { warnings } = loadPlugin("./some-plugin");
if (warnings.length) console.warn(warnings.join("\n"));
// ⚠ plugin defines 2 subagent file(s) under agents/ — test at the eval tier…
```

### Native install: testing skills (`pluginDir`)

`plugin` materializes a plugin's files into the sandbox — good for hooks and
CLAUDE.md, but those files do **not** register a plugin's _skills_ for the `Skill`
tool. To test skills, install the plugin **natively** with `pluginDir` (passes
`claude --plugin-dir`), so its skills register and a scripted `Skill` tool_use
resolves. Point it at a **complete** plugin (native install resolves the plugin's
internal references). Add `transcript: true` to capture the event stream so you
can assert the skill's body was injected:

```ts
import { assertSkillResolved, assertToolNotUsed } from "vigiles/harness-assert";

const r = await runHarnessTest({
  pluginDir: "./path/to/a/whole/plugin", // installs natively; skills activate
  allowedTools: ["Read", "Edit", "Write", "Bash", "Skill"],
  transcript: true, // populate r.toolCalls
  model: scriptModel([
    { tool: "Skill", input: { skill: "demo:greet" } }, // resolves the skill
    { text: "ok" },
  ]),
});
assertSkillResolved(r, "demo:greet"); // a non-error Skill tool_use by that name
assertToolNotUsed(r, /^mcp__/); // the safety negative: no MCP tool was used
```

**Assert on the agent's _actions_, not stdout.** With `transcript: true`,
`r.toolCalls` is the parsed list of tools the agent invoked (each paired with its
result). The helpers `assertToolUsed(r, name|/regex/)`, `assertToolNotUsed(...)`
(the safety negative — _"the destructive tool was never called"_), and
`assertSkillResolved(r, "plugin:skill")` are correct invariants — unlike
`r.stdout.includes(marker)`, which false-positives on echoes and needs a marker
injected (so it can't test a _real_ plugin). The worked tests in
`src/harness-test.test.ts` assert real **obra/superpowers** and **wshobson/agents**
skills this way — no marker needed. This is the deterministic **wiring** tier
(does the skill resolve); whether the real model _chooses_ a skill is the eval
tier.

Beyond a single tool, you can assert on the **sequence and budget** of what the
agent did:

```ts
assertToolSequence(r, ["Read", "Edit"]); // ordering — Read before Edit
assertToolCount(r, "Write", { max: 1 }); // budget — no runaway writes
assertToolCalls(r, (calls) => /* any custom rule over the list */ true);
```

`assertToolSequence` matches an in-order subsequence (gaps allowed);
`assertToolCount` takes `{ min, max, exactly }`; `assertToolCalls` is the escape
hatch for a custom invariant like _"every Edit was preceded by a Read"_.

You can also assert on a tool's **arguments**, not just its name (DeepEval-style)
— e.g. the `Edit` targeted the right file, not just that _an_ Edit ran:

```ts
import { assertToolUsedWith } from "vigiles/harness-assert";

assertToolUsedWith(
  r,
  "Edit",
  (input) => (input as { file_path?: string }).file_path === "src/billing.ts",
);
```

## One Trace, two consumers — predicates and assertions

Both tiers produce one **`Trace`**: the observable record of a run —
`toolCalls`, `hooks` (which fired + its decision), `output` (the final answer),
`turns`, and `file(p)`. A `runHarnessTest` result _is_ a `Trace`, and so is the
`ctx` handed to a `runEval` `measure`. Over that one shape there is one set of
**bare predicates** — pure functions returning a value, with **no `assert`
prefix and no throw**:

```ts
import {
  usedTool,
  toolCount,
  skillResolved,
  toolUsedWith,
  outputContains,
  hookFired,
  hookBlocked,
} from "vigiles/harness-assert";

usedTool(trace, "Skill"); // boolean
usedTool(trace, /^mcp__github__merge/); // boolean (regex)
toolCount(trace, "Write"); // number
skillResolved(trace, "demo:greet"); // boolean
toolUsedWith(trace, "Edit", (i) => isRightFile(i)); // boolean (tool argument)
outputContains(trace, /done/i); // boolean (the agent's final answer)
hookFired(trace, "PreToolUse:Edit"); // boolean (recorded from the stream)
hookBlocked(trace, "PreToolUse"); // boolean (fired AND exit ≠ 0)
```

`trace.hooks` is **recorded**, not inferred: each `HookFire` (`name`, `event`,
`exitCode`, `blocked`, `output`) comes from the CLI's `hook_response` stream
events, so a test asserts a hook _actually_ fired and blocked — no marker file
the hook had to write. Capture it the same way as `toolCalls` (`transcript:
true` on the harness tier; always on at the eval tier). The throwing form is
`assertHookFired(trace, name, { blocked: true })`; `assertOutputContains(trace,
needle)` does the same for the final answer.

The two consumers stay **separate** — same vocabulary, never one dual-purpose
function:

- **Testing** asserts (pass/fail, every commit, free). Each `assert*` is just a
  predicate wrapped in a throw: `assertToolUsed` is `usedTool` + throw,
  `assertSkillResolved` is `skillResolved` + throw.
- **Eval** measures (mean ± se / pass^k, occasional, paid). A `measure` reuses
  the **bare** predicates directly as metrics:

```ts
measure: (trace) => ({
  usedSkill: skillResolved(trace, "demo:greet"), // bool → fraction-true + pass^k
  safe: !usedTool(trace, /merge|delete/), // bool → fraction-true + pass^k
});
```

A test can then gate on the result three ways: `assertImproves` (the mean gap
beats a threshold), `assertSignificant(report, { baseline, arm, metric })` — a
Welch t-test decides whether the gap clears the noise floor (computed from the
arms' spread, not hand-fed) — or `assertReliable(report, { arm, metric })`, the
metric succeeded on **every** trial (pass^k = 1), the reliability bar for a
non-deterministic harness.

`runEval` arms take `pluginDir` too, so an A/B can be "skill installed" vs "off"
and measure **real** activation (the model triggering the skill by its
description), superseding the older "tell the agent to read a SKILL.md" trick:

```ts
await runEval({
  arms: { off: {}, on: { pluginDir: "/path/to/a/whole/plugin" } },
  task: "…a task the skill should handle…",
  allowedTools: ["Read", "Edit", "Write", "Bash", "Skill"],
  measure: (ctx) => ({
    usedSkill: ctx.sh("grep -c MARKER out.txt") !== "0",
  }),
});
```

### Did the injected context land? (`modelRequests`)

Some hooks exist to add text to the model's context — a `SessionStart` hook that
injects project rules, for example. But a hook can exit `0`, look perfectly
healthy, and still inject **nothing**: it printed the JSON in a shape Claude Code
doesn't read, or it only works on the author's platform. The hook _ran_ — the
context never _landed_.

So don't check that the hook ran. Check what the model actually received.
`trace.modelRequests` is the real request sent to the model (its system prompt
and messages), and `assertRequestContains` asserts your text is in it:

```ts
import { assertRequestContains } from "vigiles/harness-assert";

assertRequestContains(r, "You have superpowers"); // the injected context is really there
```

This is a real bug vigiles caught: `obra/superpowers` puts `additionalContext` at
the **top level** of its hook output, but Claude Code only reads the **nested**
field (`hookSpecificOutput.additionalContext`). The hook fired and exited clean,
so every "did it run?" check passed — yet the context never reached the model.
Only inspecting the request showed it was missing.

### Dogfooding real third-party plugins (and the sandbox boundary)

The loader is exercised against **real, pinned** Claude Code plugins, not just
synthetic look-alikes:
[`real-superpowers.harness.mjs`](../examples/harness/real-superpowers.harness.mjs)
loads obra/superpowers (the `hooks/hooks.json` convention + `${CLAUDE_PLUGIN_ROOT}`
expansion) and
[`real-wshobson.harness.mjs`](../examples/harness/real-wshobson.harness.mjs)
loads a wshobson/agents sub-plugin (the no-hooks subagents+commands+skills shape,
where the whole result is the warnings). Both are **pinned, vendored snapshots**
under [`examples/harness/vendor/`](../examples/harness/vendor) — each carrying the
upstream `LICENSE` and a `SOURCE` file recording repo and commit. There is no
clone at test time, so they run **offline and deterministically**. Refresh
deliberately with [`tools/refresh-vendor.sh`](../tools/refresh-vendor.sh).

**Safe by default — untrusted hooks are confined, not trusted.** A hook is a
real child process: `runHarnessTest` runs the _actual_ hook, not a
reimplementation. Code _you_ authored (inline `settings`/`files`) is trusted and
runs directly. But an external `plugin` / `pluginDir` brings in **third-party
hooks**, and those are confined by default (`sandbox: "auto"`):

- **bubblewrap available** → the run is confined. The mock and `claude` are
  co-launched inside **one network namespace** (`--unshare-all`): loopback is up
  so the in-sandbox mock is reachable, but there is **no external route**, so a
  malicious hook cannot phone home. The filesystem is read-only except the
  throwaway work dir, a fresh empty `$HOME`, and an IO dir.
- **no bubblewrap** → the run **refuses** (throws) rather than executing an
  untrusted hook unconfined. Install `bwrap`, or pass `sandbox: false` to opt out
  if you trust the code / the outer container.

```ts
runHarnessTest({ pluginDir: "./vendor/some-plugin", model }); // auto: confined, or refuses
runHarnessTest({ pluginDir: "./vendor/audited", model, sandbox: false }); // you vouch for it → direct
runHarnessTest({ settings, model, sandbox: "strict" }); // force confinement even for inline
```

The policy lives in [`src/sandbox.ts`](../src/sandbox.ts) (`decideSandbox` is a
pure function — untrusted code never runs unconfined unless you typed
`sandbox: false`), and the end-to-end test proves egress is blocked while the
mock stays reachable. Network egress confinement on a bare laptop comes from the
netns; in CI the ephemeral container is an additional boundary. Subtlety: bwrap
confines filesystem + network here, not a kernel-exploit boundary — for that you
still want the outer container / a microVM.

## Deterministic tests in your runner

`runHarnessTest` spawns the real `claude` CLI against a **scripted mock model**
(`vigiles/mock-model`) — real hooks fire, model turns are fixed, outcome is
reproducible. No key, no cost. `{cwd}` in a hook command is substituted with the
sandbox dir.

```ts
// node:test — works out of the box
import { test } from "node:test";
import assert from "node:assert/strict";
import { withHarness, assertCreated } from "vigiles/harness-assert";

test("Stop hook forces more work", async () => {
  await withHarness(
    {
      settings: {
        hooks: {
          Stop: [
            {
              hooks: [
                { type: "command", command: "test -f {cwd}/DONE || exit 2" },
              ],
            },
          ],
        },
      },
      model: scriptModel([
        { text: "done?" }, // blocked
        { tool: "Bash", input: { command: "touch DONE" } },
        { text: "done" },
      ]),
    },
    (r) => assertCreated(r, "DONE"),
  );
});
```

`withHarness` auto-cleans the sandbox (try/finally) so you don't leak temp dirs.

**vitest / jest** use the exact same code. The `vigilesMatchers` object has an
identical contract in both, so you can register it by hand:

```ts
import { expect } from "vitest"; // or "@jest/globals"
import { vigilesMatchers } from "vigiles/harness-assert";
expect.extend(vigilesMatchers);
```

…or use the **opt-in integration entries**, which register the matchers _and_
add their TypeScript types (so `toHaveCreated` / `toBeatBaseline` autocomplete
and type-check in a `.test.ts`):

```ts
// vitest.config.ts →  test: { setupFiles: ["vigiles/vitest"] }
// jest.config.js   →  setupFilesAfterEnv: ["vigiles/jest"]
// …or import once at the top of a test file:
import "vigiles/vitest"; // or "vigiles/jest"

expect(r).toHaveCreated("DONE");
expect(report).toBeatBaseline("vanilla", "gated", "caught");
```

vitest and jest are **optional peer dependencies** — only the entry you import
pulls one in. The same `vigilesMatchers` is exercised under both runners in
[`test/runners/`](../test/runners/) (`npm run test:vitest` / `npm run test:jest`),
and the type augmentation is compile-checked in
[`test/types/`](../test/types/) (`npm run test:types`) — all three run in CI.
jest uses the CommonJS dist natively (no ESM flags); the `vigiles/vitest` entry
is ESM because vitest is ESM-only.

**Reliable for:** SessionStart, Stop, UserPromptSubmit, and Bash **and
Edit/Write** PreToolUse/PostToolUse — the governance/policy shapes most real
plugins use (`--allowedTools` allowlists the edit tools past the permission
prompt; verified on claude 2.1.169). The events the mock can't trigger —
PreCompact, Notification, SessionEnd, SubagentStop — belong to the `runHook`
unit tier.

## Evals — does the change move behaviour?

`runEval` drives the real model N trials × arm and aggregates: **mean** for
numbers, **fraction-true** for booleans, with **std / se** so you can tell a
real gap from noise, plus **pass^k** (τ-bench) — _did the metric succeed on
every trial?_ — the reliability question a non-deterministic harness needs
("worked every time" ≠ "worked on average"). `formatEvalReport` prints
`metric=mean±se pass^k=…`; each `stat` carries `passK`. An arm is a fixture +
settings, or a whole `plugin`.

The `measure` ctx is a full `Trace`, so a metric can read the agent's
**actions** (`ctx.toolCalls`) and its **final answer** (`ctx.output`), not just
end-state files — reuse the bare predicates above (`usedTool`, `skillResolved`,
…) to compute them.

```ts
import { runEval, formatEvalReport } from "vigiles/eval";

const report = await runEval({
  fixture: { "src/billing.ts": "export function chargeCard() {}" },
  arms: {
    vanilla: {},
    gated: { settings: { hooks: { PostToolUse: [refsHook] } } },
    // whole_plugin: { plugin: "./" },
  },
  task: "Document chargeCard in SKILL.md, referencing it by name.",
  measure: (ctx) => ({
    marked: ctx.sh("grep -c vigiles:symbol SKILL.md") !== "0",
  }),
  trials: 6,
});
console.log(formatEvalReport(report));
// vanilla marked=0.00 pass^k=0   gated marked=0.50±0.20 pass^k=0   ($0.07 · 1.2s/run · 4.1k tok)
```

(The cost/latency/token suffix and a `— $… total` header appear when the run
reports usage; they're silent under the scripted mock.)

### Significance — is the gap real?

`se` gives you the spread; **significance** tells you whether the gap clears it.
`assertSignificant` runs a Welch's t-test over the two arms' summary stats and
throws unless the arm beats the baseline at `alpha` (default 0.05) — the noise
floor is **computed**, not hand-fed via `assertImproves(..., { by })`:

```ts
import {
  assertSignificant,
  significantlyBeats,
  compareArms,
} from "vigiles/harness-assert";

assertSignificant(report, {
  baseline: "vanilla",
  arm: "gated",
  metric: "marked",
});
significantlyBeats(report, "vanilla", "gated", "marked"); // the bare predicate
// or: assertImproves(report, { baseline, arm, metric, significant: true });

const c = compareArms(report, "vanilla", "gated", "marked");
// → { delta, seDelta, t, df, pValue, significant }  (reads mean/se/n, no raw rows)
```

For 0/1 metrics this is the t approximation to the two-proportion test — close at
eval trial counts. An insignificant gap means **raise `trials`** until the noise
floor drops below it.

### Regression gating — did this PR make the harness worse?

Significance compares two _arms_ in one run; **regression gating** compares one
run against a **committed baseline** — "jest snapshots for agent behaviour, with a
real noise floor". Record a baseline once, commit it, then fail CI when any
arm×metric moves _significantly in the bad direction_ vs. that baseline (a bare
pass-rate can't tell a real regression from sampling noise — the same Welch test
can, current vs. baseline):

```ts
import {
  writeBaseline,
  readBaseline,
  assertNoRegression,
  diffToJUnit,
  diffReports,
} from "vigiles/harness-assert";

const report = await runEval({
  /* … */
});

// Record once (commit .vigiles/eval-baseline.json):
writeBaseline(".vigiles/eval-baseline.json", [report]);

// In CI thereafter — throws on a significant regression:
const baseline = readBaseline(".vigiles/eval-baseline.json");
if (baseline) {
  assertNoRegression(report, baseline, { lowerIsBetter: ["cost"] });
  // or emit JUnit for your CI: diffToJUnit(diffReports(baseline, [report]))
}
```

Higher is better by default; list `lowerIsBetter` metrics (cost/latency) to flip
them. A new arm/metric absent from the baseline is skipped (not a regression).
`diffToJUnit` renders one `<testcase>` per metric with a `<failure>` per
regression, so eval regressions show up alongside unit-test failures.

### Cost, caching, concurrency

Every run captures **cost / latency / tokens** from the result event: `ctx.usage`
(`{ costUsd, durationMs, inputTokens, outputTokens }`) is on the `measure` ctx,
`report.arms[a].usage` aggregates per arm, and `report.totalCostUsd` sums the run.
Three knobs make a real-model eval cheap enough to run often:

- `concurrency: N` — run N trials at once (default 1). Rate-limit / overload
  responses back off and retry automatically (`rateLimitRetries`, `retryBackoffMs`).
- `maxCostUsd: N` — stop launching trials once measured cost crosses the cap;
  in-flight trials finish and `report.aborted` is set.
- `cache: "readwrite"` — **record/replay**. Each trial's output _and_ post-run
  filesystem are recorded under `cacheDir`; a matching re-run replays without
  calling the model. The key excludes `measure`, so **editing your metric and
  re-running re-scores for free** — the model is re-called only when a
  model-affecting input (task, files, settings, model, tools) changes.

### Trigger rate — does the skill _fire_?

A skill's value is its description activating on the right task — the #1
skill-authoring pain, and a property only the real model decides (the
deterministic tier proves the _wiring_; this proves the _activation_).
`measureTriggerRate` installs a plugin natively and runs the model over a set of
varied prompts, reporting how often a `Trace` predicate holds:

```ts
import { measureTriggerRate, formatTriggerRateReport } from "vigiles/eval";
import { skillResolved, assertTriggerRate } from "vigiles/harness-assert";

const report = await measureTriggerRate({
  pluginDir: "./my-plugin",
  prompts: ["…varied tasks the skill should handle…"],
  fired: (t) => skillResolved(t, "my-plugin:greet"),
  trials: 2,
});
console.log(formatTriggerRateReport(report)); // trigger-rate: 80% (10 runs)
assertTriggerRate(report, { min: 0.6 }); // gate in CI
```

### LLM-as-judge for subjective outcomes

When the metric isn't a regex, grade with a model inside `measure` (synchronous,
shells out via the `claude` CLI):

<!-- vigiles:ignore -->

```ts
import { judge } from "vigiles/judge";

measure: (ctx) => {
  const v = judge({
    output: ctx.file("PLAN.md") ?? "",
    rubric: "1 if the plan lists concrete, ordered steps; else 0.",
  });
  return { quality: v.score, ok: v.pass };
};
```

This is deliberately thin — for datasets, tracing, and dashboards use a
dedicated eval platform (Braintrust, DeepEval). vigiles owns the harness A/B,
not the judging platform.

## CLI fallback (no runner, CI-friendly)

For repos without a test runner, name files `*.harness.mjs` / `*.eval.mjs` and
run them via the CLI, which discovers and runs each, aggregating exit codes:

```bash
vigiles test                 # discover & run *.harness.mjs (skips if no claude CLI)
vigiles eval --trials=6      # discover & run *.eval.mjs (forwards VIGILES_TRIALS)
```

`vigiles test` needs only the `claude` CLI (no API key) — so it runs the
deterministic tier in CI at zero cost. See the repo's `harness` CI job.

## Coverage

The suite runs under **vitest** (`npm test` → `vitest run`); `npm run coverage`
adds V8 coverage and prints per-file line/branch/function %:

```bash
npm run coverage   # vitest run --coverage
```

The deterministic tiers (`runHook`, `runHarnessTest`) and **all the pure eval
orchestration** — the loop (`runEvalWith`), the record/replay cache, usage
aggregation, and the significance stats — are fully unit-tested via an
**injected runner** (canned stream-json, no model). Only the real-`claude`
subprocess (`spawnAgent`) is excluded from the gate (exercised by `bench/`);
everything around it is covered, so the statement/line/function gate holds at
100%.

## Canonical examples

- [`examples/harness/hook-unit.harness.mjs`](../examples/harness/hook-unit.harness.mjs) — unit-test a hook's logic with `runHook`, no `claude` CLI (the cheap base of the pyramid).
- [`examples/harness/policy-gate.harness.mjs`](../examples/harness/policy-gate.harness.mjs) — PreToolUse Bash gate (block-no-verify) + SessionStart setup, deterministic.
- [`examples/harness/plugin-cohesion.harness.mjs`](../examples/harness/plugin-cohesion.harness.mjs) — load a whole plugin and assert multiple hooks fire together.
- **The oh-my-claudecode walkthrough** — one real plugin, every tier: [`oh-my-claudecode-unit.harness.mjs`](../examples/harness/oh-my-claudecode-unit.harness.mjs) (runHook on a real `keyword-detector` hook) · [`oh-my-claudecode-deterministic.harness.mjs`](../examples/harness/oh-my-claudecode-deterministic.harness.mjs) (fired _and_ landed) · [`oh-my-claudecode-egress.harness.mjs`](../examples/harness/oh-my-claudecode-egress.harness.mjs) (record + block network egress) · [`oh-my-claudecode-eval.eval.mjs`](../examples/harness/oh-my-claudecode-eval.eval.mjs) (skill trigger-rate).
- [`examples/harness/real-superpowers.harness.mjs`](../examples/harness/real-superpowers.harness.mjs) — dogfood `loadPlugin` on a real, pinned obra/superpowers snapshot (key-free, offline).
- [`examples/harness/real-wshobson.harness.mjs`](../examples/harness/real-wshobson.harness.mjs) — dogfood `loadPlugin` on a real wshobson/agents sub-plugin (the no-hooks marketplace shape).
- [`examples/harness/skill-outcome.eval.mjs`](../examples/harness/skill-outcome.eval.mjs) — does a skill change the agent's output?
- [`examples/harness/skill-trigger-rate.eval.mjs`](../examples/harness/skill-trigger-rate.eval.mjs) — does a skill's description _fire_ across varied prompts? (`measureTriggerRate`)
- [`bench/evals/refs-hook.eval.mjs`](../bench/evals/refs-hook.eval.mjs) — the refs-hook A/B (benchmark #4).

## What's covered today — surface × tier

The whole harness surface and how far each tier reaches today:

| Surface                                                       | Unit / static                | Integration (no API key)    | Eval (real model) |
| ------------------------------------------------------------- | ---------------------------- | --------------------------- | ----------------- |
| Hooks — Bash / SessionStart / Stop / UserPromptSubmit         | ✅ logic                     | ✅ fires                    | ✅                |
| Hooks — Edit / Write                                          | ✅ logic                     | ✅ fires                    | ✅                |
| Hooks — PreCompact / Notification / SessionEnd / SubagentStop | ✅ logic                     | — (mock can't trigger)      | 🟡                |
| CLAUDE.md / instructions                                      | ✅ refs                      | 🟡 present, not behaviour   | ✅ behaviour      |
| Skills                                                        | 🟡 refs                      | ✅ resolves via `pluginDir` | ✅ activation     |
| Subagents (`agents/`)                                         | ✅ tool rail · 🟡 refs       | 🟡 rail not live-armed      | ✅ via Task       |
| Slash commands (`commands/`)                                  | 🟡 refs                      | 🟡 needs prompt capture     | ✅ via `/cmd`     |
| MCP servers                                                   | ✅ tool refs (`vigiles:mcp`) | 🔴                          | 🔴                |
| settings.json                                                 | 🟡 assert merged             | ✅ applied                  | ✅                |
| Hook context injection (does it _land_?)                      | — n/a                        | ✅ `trace.modelRequests`    | ✅                |
| Untrusted plugin execution                                    | ✅ confined (`runHook`)      | ✅ confined (bwrap, Linux)  | 🟡 outer sandbox  |

✅ shipped · 🟡 partial · 🔴 gap · — n/a. Full detail + roadmap: [`research/harness-testing-coverage-matrix.md`](../research/harness-testing-coverage-matrix.md).

## How this compares to promptfoo

[promptfoo](https://github.com/promptfoo/promptfoo) is the popular eval runner —
and it's excellent at what it does. vigiles isn't a competing eval framework: it
tests **the harness** (your hooks / settings / CLAUDE.md / skills as they ship),
and it's built to be **deterministic and cheap** where promptfoo is
real-model-only. The core difference is cost by construction: every promptfoo run
is a real model call by design, while vigiles answers most harness questions —
does this hook block? is it wired in? does the skill resolve? — with **no model
and no API key at all**, paying for a real model only at the eval tier, only when
the question needs one.

| Question you're asking                                  | vigiles                               | promptfoo                      |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------ |
| Does my hook block/allow? Is it wired in?               | ✅ **no model, no API key** (Lvl 1–2) | ✗ every run hits a real model  |
| Unit under test                                         | the **harness** (hook/rule/skill A/B) | a **provider/model**           |
| Loads the **real shipped** plugin.json/hooks/CLAUDE.md? | ✅ (`plugin-loader`)                  | ✗ configures the SDK from YAML |
| Is an A/B gap real, not noise? (significance / pass^k)  | ✅ Welch t-test + pass^k              | ✗ pass-rate only               |
| Regression vs a committed baseline                      | ✅ `assertNoRegression`               | ✗                              |
| Run an untrusted harness **confined**                   | ✅ bubblewrap, safe-by-default        | ✗                              |
| Dataset / red-team / assertion library / web UI         | ✗ (not our game)                      | ✅✅ deep, mature              |

Short version: **promptfoo for prompt/model/dataset evals; vigiles for testing
the harness cheaply and safely.** The full analysis (and why we don't chase
parity) is in [`research/promptfoo-deep-dive.md`](../research/promptfoo-deep-dive.md).

## See also

- [`docs/sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records (honestly): IO/`rm -rf`, network deny-all vs `recordEgress`, the tiers and limits.
- [`docs/testing-matrix.md`](testing-matrix.md) — every use case mapped to its test tier + file (and why the CLI examples are `.mjs`).
- [`research/harness-testing.md`](../research/harness-testing.md) — the deterministic + eval design rationale + real-plugin coverage.
- [`research/benchmarks-runtime-gates.md`](../research/benchmarks-runtime-gates.md) — findings from running this harness in anger.
