# Harness testing — Claude Code specifics

The [harness-testing guide](harness-testing.md) is the harness-agnostic core: the
levels, the `Trace` model, the runners, evals. This page is the **Claude Code
adapter** — the rich worked examples and the Claude-Code-only transport: the
plugin layout (`${CLAUDE_PLUGIN_ROOT}`, `hooks/hooks.json`, `plugin` / `pluginDir`,
the `Skill` tool), the scriptable Anthropic Messages mock (`scriptModel`), and the
safe-by-default bubblewrap sandbox + egress.

Imports here come from the adapter surface `vigiles/claude-code` (CC-specific
transport: `scriptModel`, `loadPlugin`, `resolveHarness`); the runners and
assertions come from the agnostic `vigiles/testing` (or the tier barrels
`vigiles/unit` / `vigiles/integration` / `vigiles/e2e`). Claude Code is the
**default** adapter — `runHarnessTest(spec)` with no `{ adapter }` drives it.

## Contents

- [A worked example: one real plugin, every tier](#a-worked-example-one-real-plugin-every-tier)
  - [Tier 0 — load the assembled machine](#tier-0--load-the-assembled-machine)
  - [Tier 1 — unit-test a hook (`runHook`)](#tier-1--unit-test-a-hook-runhook)
  - [Tier 2 — deterministic: fired _and_ landed (`runHarnessTest`)](#tier-2--deterministic-fired-and-landed-runharnesstest)
  - [Tier 3 — eval: does the skill _trigger_? (`measureTriggerRate`)](#tier-3--eval-does-the-skill-trigger-measuretriggerrate)
- [Test the whole machine (`plugin`)](#test-the-whole-machine-plugin)
  - [Native install: testing skills (`pluginDir`)](#native-install-testing-skills-plugindir)
- [The scripted Anthropic Messages mock (`scriptModel`)](#the-scripted-anthropic-messages-mock-scriptmodel)
- [Did the injected context land? (`modelRequests`)](#did-the-injected-context-land-modelrequests)
- [Reliable events in the deterministic tier](#reliable-events-in-the-deterministic-tier)
- [Dogfooding real third-party plugins (and the sandbox boundary)](#dogfooding-real-third-party-plugins-and-the-sandbox-boundary)
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
import { loadPlugin } from "vigiles/claude-code";

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
import { runHook } from "vigiles/testing";

const hit = runHook(keywordDetectorCmd, {
  hook_event_name: "UserPromptSubmit",
  prompt: "please ultrawork on this",
});
// hit.json.hookSpecificOutput.additionalContext includes "ULTRAWORK"
// a plain prompt → no additionalContext injected
```

We run this **vendored, audited, pinned** script directly. For a hook you have
_not_ linted, pass `{ trusted: false }` and `runHook` confines it under
bubblewrap (no egress, cleared env). Full file:
[`examples/harness/oh-my-claudecode-unit.harness.mjs`](../examples/harness/oh-my-claudecode-unit.harness.mjs).

`runHook` is harness-agnostic at the API level (it's in `vigiles/testing` /
`vigiles/unit`), but its event shape and the bubblewrap confinement are
Claude-Code-specific. See
[`vigiles/unit`](harness-testing.md#unit-test-a-hooks-logic-runhook) for the
agnostic contract.

### Tier 2 — deterministic: fired _and_ landed (`runHarnessTest`)

Right logic ≠ wired in correctly _and_ reaching the model. Run the real `claude`
against a scripted mock model with the hook wired on `UserPromptSubmit`, then
assert both that it **fired** and that its injected context **landed** in the
model's request (`trace.modelRequests`) — the "fired ≠ landed" check a "did it
run?" test can't make:

```ts
import {
  runHarnessTest,
  assertHookFired,
  assertRequestContains,
} from "vigiles/testing";
import { scriptModel } from "vigiles/claude-code";

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
import { measureTriggerRate, skillResolved } from "vigiles/testing";

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

## Test the whole machine (`plugin`)

The unit that matters is the _assembled_ plugin/repo: hooks + settings +
CLAUDE.md + skills working together. Point `plugin` at a plugin (or `"./"` for
your repo) and the real harness is loaded from `.claude-plugin/plugin.json` (or
`.claude/settings.json`), with `${CLAUDE_PLUGIN_ROOT}` resolved to the real
scripts, plus its CLAUDE.md and skills:

```ts
import { runHarnessTest } from "vigiles/testing";
import { scriptModel } from "vigiles/claude-code";

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
import { loadPlugin } from "vigiles/claude-code";
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
import { assertSkillResolved, assertToolNotUsed } from "vigiles/testing";

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

The action/sequence/argument assertions over `r.toolCalls` (`assertToolSequence`,
`assertToolCount`, `assertToolUsedWith`, `assertToolCalls`) are harness-agnostic —
see the [`Trace` model](harness-testing.md#one-trace-two-consumers--predicates-and-assertions)
in the core guide.

## The scripted Anthropic Messages mock (`scriptModel`)

`runHarnessTest` spawns the real `claude` CLI against a **scripted mock model**
(`scriptModel` from `vigiles/claude-code`) — real hooks fire, model turns are fixed, outcome is
reproducible. No key, no cost. `claude` is pointed at the in-process mock via
`ANTHROPIC_BASE_URL` + a dummy `ANTHROPIC_API_KEY` (the mock ignores auth);
`{cwd}` in a hook command is substituted with the sandbox dir.

`scriptModel([...])` builds the turn script: each entry is either a text turn
(`{ text }`) or a scripted tool call (`{ tool, input }`). The mock serves them in
order and renders the Anthropic Messages SSE shape `claude` expects.

```ts
import { test } from "node:test";
import { withHarness, assertCreated, scriptModel } from "vigiles/testing";

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
`scriptModel` and the mock are Claude-Code-specific (a different harness scripts a
different wire format — Codex uses the OpenAI **Responses** mock, see
[harness-testing-codex.md](harness-testing-codex.md)).

## Did the injected context land? (`modelRequests`)

Some hooks exist to add text to the model's context — a `SessionStart` hook that
injects project rules, for example. But a hook can exit `0`, look perfectly
healthy, and still inject **nothing**: it printed the JSON in a shape Claude Code
doesn't read, or it only works on the author's platform. The hook _ran_ — the
context never _landed_.

So don't check that the hook ran. Check what the model actually received.
`trace.modelRequests` is the real request sent to the model (its system prompt
and messages), captured by the scripted mock, and `assertRequestContains` asserts
your text is in it:

```ts
import { assertRequestContains } from "vigiles/testing";

assertRequestContains(r, "You have superpowers"); // the injected context is really there
```

This is a real bug vigiles caught: `obra/superpowers` puts `additionalContext` at
the **top level** of its hook output, but Claude Code only reads the **nested**
field (`hookSpecificOutput.additionalContext`). The hook fired and exited clean,
so every "did it run?" check passed — yet the context never reached the model.
Only inspecting the request showed it was missing.

`modelRequests` is **harness-tier only** — the mock sees the requests, so it's
populated by `runHarnessTest`; the eval tier drives the real API, so its
`modelRequests` is always empty.

## Reliable events in the deterministic tier

The deterministic mock drives **SessionStart, Stop, UserPromptSubmit, and Bash
**and Edit/Write** PreToolUse/PostToolUse** — the governance/policy shapes most
real plugins use (`--allowedTools` allowlists the edit tools past the permission
prompt; verified on claude 2.1.169). The events the mock can't trigger —
**PreCompact, Notification, SessionEnd, SubagentStop** — belong to the `runHook`
unit tier, where you hand the hook the event JSON yourself so all of them are
testable.

## Dogfooding real third-party plugins (and the sandbox boundary)

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
runHarnessTest({ pluginDir: "./vendor/linted", model, sandbox: false }); // you vouch for it → direct
runHarnessTest({ settings, model, sandbox: "strict" }); // force confinement even for inline
```

The policy lives in [`src/sandbox.ts`](../src/sandbox.ts) (`decideSandbox` is a
pure function — untrusted code never runs unconfined unless you typed
`sandbox: false`), and the end-to-end test proves egress is blocked while the
mock stays reachable. Network egress confinement on a bare laptop comes from the
netns; in CI the ephemeral container is an additional boundary. Subtlety: bwrap
confines filesystem + network here, not a kernel-exploit boundary — for that you
still want the outer container / a microVM.

**Confined execution is Claude Code only.** The bubblewrap sandbox + egress path
is part of the Claude Code adapter; requesting confinement for another harness
throws. Drive another harness with `sandbox: false` (you audited the code, or the
outer container is the boundary). The full sandbox story — what it isolates vs
records, the three network modes (deny-all / `recordEgress` / allowlisted
`egress: { allow }`), and the limits — is in [`docs/sandboxing.md`](sandboxing.md).

## See also

- [`docs/harness-testing.md`](harness-testing.md) — the harness-agnostic core: levels, the `Trace` model, the runners, evals, vitest/jest, CLI, CI.
- [`docs/harness-testing-codex.md`](harness-testing-codex.md) — the Codex parallel (`codexAdapter` + the Responses mock against real `codex exec`).
- [`docs/harnesses.md`](harnesses.md) — the adapter/import model + the capability matrix.
- [`docs/sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records, the three network modes, tiers and limits.
- [`research/harness-testing.md`](../research/harness-testing.md) — the deterministic + eval design rationale + real-plugin coverage.
