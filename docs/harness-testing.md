# Testing your harness

vigiles's **testing layer** — your hooks, settings, skills, and instruction file
are code, so vigiles tests they do their job: hooks block, skills fire (recall +
precision), the assembled agent does the task without the dangerous thing. The
[README](../README.md) has the 30-second pitch; this is the full guide. For the
linting layer, see [Verifying your instruction files](verifying-instruction-files.md).

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

`Agent = Model + Harness`. Your harness — hooks, settings, skills, the
instruction file — is code, and code should be tested. vigiles gives the harness
**clear levels**, and a test's level is legible three ways at once — its **import
path**, its **file suffix**, and its **CI job** — so you can't accidentally hide a
network e2e test inside the unit gate. Pick the cheapest level that answers your
question:

| Level                | Answers                                                  | Import                | File                    | Runner               | Needs                          |
| -------------------- | -------------------------------------------------------- | --------------------- | ----------------------- | -------------------- | ------------------------------ |
| **refs** _(layer 1)_ | are the rules/files/scripts it cites real?               | —                     | `CLAUDE.md` / specs     | `vigiles lint`       | nothing                        |
| **unit**             | does my hook block/allow this event?                     | `vigiles/unit`        | `*.test.ts`             | vitest `unit`        | nothing                        |
| **integration**      | is it wired into the assembled machine + does it fire?   | `vigiles/integration` | `*.integration.test.ts` | vitest `integration` | harness binary + bwrap, no key |
| **e2e**              | does it really reach / block the network, end-to-end?    | `vigiles/e2e`         | `*.e2e.test.ts`         | vitest `e2e`         | routable sandbox + network     |
| **eval**             | does this change _move what the agent does_, measurably? | `vigiles/testing`     | `*.eval.mjs`            | `vigiles eval`       | a real model (keyed)           |

**refs + unit + integration + e2e are deterministic verification** — you assert
pass/fail, they run on every commit. **eval is a different axis: non-deterministic
measurement** — you read a mean ± se across trials, run it occasionally on a keyed
job, and never gate a single run (see [Two layers or three?](#two-layers-or-three-where-eval-sits)).

The import path **is** the capability contract: `vigiles/unit` exposes nothing
that needs a model, bubblewrap, or the network; higher tiers re-export the lower
ones (dependencies point downward only), so an e2e test reuses unit predicates but
a unit test physically can't reach egress. Run any level's CI with one reusable
action — `- uses: zernie/vigiles/.github/actions/harness-tier@main` with
`tier: unit | integration | e2e` (see [Per-level CI](#per-level-ci-the-reusable-action)).

**The design bet is deterministic and cheap.** refs/unit/integration/e2e never
need an API key — they run on every commit for free, and they're where most of
your harness can be pinned down. This is the opposite of eval-only frameworks like
[promptfoo](https://github.com/promptfoo/promptfoo), where every run hits a real
model **by design** (and bills accordingly). The paid real-model **eval** axis is
here too, but you reach for it only when the question genuinely needs a real model
— not to answer "does my hook block this?"

## You select the harness by import; the runners are agnostic

The runners — `runHook`, `runHarnessTest`, `runEval` — are **harness-agnostic**.
You write your tests against the stable surface and pick the harness with one
option, defaulting to Claude Code:

```ts
// Core — harness-agnostic. The stable API you write tests/evals against.
import { runHarnessTest, runEval, runHook } from "vigiles/testing";
import { usedTool, skillResolved, assertHookBlocked } from "vigiles/testing";

await runHarnessTest(spec); // Claude Code (default)
await runHarnessTest(spec, { adapter: codexAdapter }); // a second harness
```

`codexAdapter` and the Codex mock come from `vigiles/codex`, beside
`vigiles/claude-code`. Nothing in `vigiles/testing` changes when the harness
changes; unused adapters tree-shake out. The runners live at the **composition
root** (`src/`), and the agnostic surface **never imports an adapter** — an
`eslint-plugin-boundaries` rule forbids an agnostic barrel from importing
`src/adapters/*`, so "agnostic" is enforced, not just named. The CLI can't take an
import, so it **auto-detects** the harness from the repo. For the full
adapter/import model and the capability matrix, see
[`docs/harnesses.md`](harnesses.md).

### Canonical imports

There is **one canonical entry point per layer** — import from these:

| Layer                    | Canonical import  | What it re-exports                                                                                                                              |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ② Test your harness      | `vigiles/testing` | every tier + check + assertion: `runHook` / `runHarnessTest` / `runEval` / `measure`, the `check` vocabulary, the `assert*` helpers, tool stubs |
| ① Lint instruction files | `vigiles/linting` | the spec builders + the compiler                                                                                                                |

`vigiles/testing` is the **superset** — reach for it first. Two other groups are
deliberate surfaces, not aliases: the **capability-scoped tier barrels**
`vigiles/unit` / `vigiles/integration` / `vigiles/e2e` (the Levels table above —
the import path _is_ the capability contract, so `vigiles/unit` physically can't
reach a model or the network), and `vigiles/spec` (the authoring surface — spec
builders for `.spec.ts` files). CC-specific transport — `scriptModel`, `loadPlugin`,
`resolveHarness`, and the type `LoadedPlugin` — lives in `vigiles/claude-code`, not
`vigiles/testing`. Runner integration is `vigiles/vitest` / `vigiles/jest`; harness
selection is `vigiles/claude-code` / `vigiles/codex` / `vigiles/adapter`.

The **harness-specific** pieces — the mock wire format, the plugin layout, the
sandbox — live in the per-harness guides:

- **[Harness testing — Claude Code](harness-testing-claude-code.md)** — the
  oh-my-claudecode worked walkthrough, `${CLAUDE_PLUGIN_ROOT}` / `hooks.json` /
  `plugin` / `pluginDir` / the `Skill` tool, `scriptModel` + the Anthropic
  Messages mock, the bubblewrap sandbox + egress, the reliable-events list.
- **[Harness testing — Codex](harness-testing-codex.md)** — driving real
  `codex exec` with `{ adapter: codexAdapter }` against the OpenAI **Responses**
  mock (`startCodexMock`), keyless; what maps (`AGENTS.md`, minimal `SKILL.md`)
  and what doesn't (subagents, by design).

## Contents

- [unit: test a hook's logic (`runHook`)](#unit-test-a-hooks-logic-runhook)
- [integration: test the whole machine (`runHarnessTest`)](#integration-test-the-whole-machine-runharnesstest)
- [One Trace, two consumers — predicates and assertions](#one-trace-two-consumers--predicates-and-assertions)
- [Evals — does the change move behaviour?](#evals--does-the-change-move-behaviour)
  - [Significance — is the gap real?](#significance--is-the-gap-real)
  - [Regression gating — did this PR make the harness worse?](#regression-gating--did-this-pr-make-the-harness-worse)
  - [Cost, caching, concurrency](#cost-caching-concurrency)
  - [Trigger rate — does the skill _fire_?](#trigger-rate--does-the-skill-fire)
  - [LLM-as-judge for subjective outcomes](#llm-as-judge-for-subjective-outcomes)
- [Use it in your runner (node:test / vitest / jest)](#use-it-in-your-runner-nodetest--vitest--jest)
- [CLI fallback (no runner, CI-friendly)](#cli-fallback-no-runner-ci-friendly)
- [Per-level CI (the reusable action)](#per-level-ci-the-reusable-action)
- [Two layers or three? (where eval sits)](#two-layers-or-three-where-eval-sits)
- [Coverage](#coverage)
- [Canonical examples](#canonical-examples)
- [What's covered today — surface × tier](#whats-covered-today--surface--tier)
- [How this compares (promptfoo, DeepEval, Braintrust, Inspect)](#how-this-compares-promptfoo-deepeval-braintrust-inspect)
- [Per-harness guides](#per-harness-guides)
- [See also](#see-also)

## unit: test a hook's logic (`runHook`)

A hook is just a process: the harness pipes a JSON event to its stdin and reads
back an exit code (`2` = block) and an optional JSON decision on stdout. `runHook`
exercises exactly that contract — no harness binary, no model — so a hook's logic
is testable in milliseconds, in any runner:

```ts
import { runHook } from "vigiles/unit";
import { assertHookBlocked } from "vigiles/unit";

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
The deterministic tier (next section) drives the common governance events but
can't synthesize every one — the events a mock can't trigger are testable here,
because _you_ hand the hook the event JSON. (Which events the deterministic mock
can drive is harness-specific — see the per-harness guides.)

What it does **not** prove: that the hook is _wired in_ (settings point at it,
plugin-root tokens resolve). That's what the next layer is for — so use both:
unit-test the logic here, then assert it fires in the assembled machine.

**Unit-testing a hook you don't trust?** Mark it `trusted: false` and confinement
is the default — no need to also remember `sandbox: "auto"`. A foreign hook
command runs under bubblewrap (a no-egress namespace with a cleared environment,
so it can't read your API key, while the env _you_ pass in `opts.env` is added
back), and **refuses** rather than running unconfined where no sandbox is
available (Linux + bwrap only):

```ts
runHook(vendoredHookCmd, event, { trusted: false, env: { GUARD: guardPath } });
```

Set `sandbox` explicitly to override the trust-derived default: `"auto"`/`"strict"`
force confinement, and `sandbox: false` opts an untrusted hook back out to a
direct run (you vouch for it, or the outer container is the boundary). The sandbox
is a Claude Code adapter capability — see
[harness-testing-claude-code.md](harness-testing-claude-code.md) and
[`docs/sandboxing.md`](sandboxing.md).

## integration: test the whole machine (`runHarnessTest`)

Right logic ≠ wired in correctly _and_ reaching the model. `runHarnessTest`
spawns the **real** harness binary against a **scripted mock model** — real hooks
fire, model turns are fixed, the outcome is reproducible. No key, no cost. The
unit that matters is the _assembled_ plugin/repo: hooks + settings + the
instruction file + skills working together.

The spec shape is harness-agnostic. You give it some combination of inline
`settings` / `files`, an external `plugin` / `pluginDir`, a `prompt`, the scripted
`model` turns, and `transcript: true` to capture the event stream; you pick the
harness with `{ adapter }` (default Claude Code):

```ts
import { runHarnessTest } from "vigiles/integration";
import { assertHookFired, assertOutputContains } from "vigiles/integration";

const r = await runHarnessTest(
  {
    plugin: "./", // load THIS repo's real hooks + instruction file + skills
    prompt: "refactor the billing module",
    transcript: true,
    model: [{ text: "on it" }], // the scripted model turns
  },
  // { adapter: codexAdapter },  // ← a second harness; omit for Claude Code
);

assertHookFired(r, "UserPromptSubmit"); // it actually fired
assertOutputContains(r, /on it/); // …and the run completed
```

The scripted `model` turns and the mock that serves them are harness-specific:
Claude Code's `scriptModel` renders the Anthropic Messages SSE; Codex drives real
`codex exec` against the OpenAI Responses mock. The plugin layout the loader reads
(`.claude-plugin/plugin.json`, `${CLAUDE_PLUGIN_ROOT}`, `pluginDir` native install
for the `Skill` tool — vs. Codex's `AGENTS.md` + TOML config) is likewise
per-harness. The rich worked examples — loading a real plugin, native skill
install, the safe-by-default sandbox — live in the per-harness guides:
**[Claude Code](harness-testing-claude-code.md)** ·
**[Codex](harness-testing-codex.md)**.

## One Trace, two consumers — predicates and assertions

Both tiers produce one **`Trace`**: the observable record of a run —
`toolCalls`, `hooks` (which fired + its decision), `output` (the final answer),
`modelRequests` (what reached the model), `turns`, and `file(p)`. A
`runHarnessTest` result _is_ a `Trace`, and so is the `ctx` handed to a `runEval`
`measure`. Over that one shape there is one set of **bare predicates** — pure
functions returning a value, with **no `assert` prefix and no throw**:

```ts
import {
  usedTool,
  toolCount,
  skillResolved,
  toolUsedWith,
  outputContains,
  hookFired,
  hookBlocked,
} from "vigiles/testing";

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
`exitCode`, `blocked`, `output`) comes from the CLI's stream events, so a test
asserts a hook _actually_ fired and blocked — no marker file the hook had to
write. Capture it the same way as `toolCalls` (`transcript: true` on the harness
tier; always on at the eval tier). Beyond a single tool you can assert on the
**sequence and budget** of what the agent did:

```ts
assertToolSequence(r, ["Read", "Edit"]); // ordering — Read before Edit
assertToolCount(r, "Write", { max: 1 }); // budget — no runaway writes
assertToolUsedWith(r, "Edit", (i) => i.file_path === "src/billing.ts"); // argument
assertToolCalls(r, (calls) => /* any custom rule over the list */ true);
```

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

## Evals — does the change move behaviour?

There are **two questions** here, and they want **two different oracles** — don't
default to A/B for both:

- **Absolute — "is this exact skill / output any good?"** Most of the time you're
  testing _one_ skill, with no on/off variant to compare against. Score the output
  directly: `measure({ checks: [judged(rubric), …] })` + `assertRates({ min })`.
  This is the oracle promptfoo/DeepEval lead with, and the right default for a
  single skill — there's nothing to A/B against. See the `measure` section below.
- **Relative — "does this change _move_ behaviour vs off?"** When the question is
  the _lift_ a change buys (regression gating, or proving a gap isn't sampling
  noise), run an A/B: `runEval` with `off`/`on` arms + `assertSignificant`. The
  baseline is the point.

The rest of this section covers the **relative** A/B path; the absolute scored path
is `measure` (below). Both run on the same real-model tier.

`runEval` drives the real model N trials × arm and aggregates: **mean** for
numbers, **fraction-true** for booleans, with **std / se** so you can tell a
real gap from noise, plus **pass^k** (τ-bench) — _did the metric succeed on
every trial?_ — the reliability question a non-deterministic harness needs
("worked every time" ≠ "worked on average"). `formatEvalReport` prints
`metric=mean±se pass^k=…`; each `stat` carries `passK`. An arm is a fixture +
settings, or a whole `plugin` / `pluginDir`.

The `measure` ctx is a full `Trace`, so a metric can read the agent's
**actions** (`ctx.toolCalls`) and its **final answer** (`ctx.output`), not just
end-state files — reuse the bare predicates above (`usedTool`, `skillResolved`,
…) to compute them.

```ts
import { runEval, formatEvalReport } from "vigiles/testing";

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
reports usage.) `runEval` arms take `pluginDir` too, so an A/B can be "skill
installed" vs "off" and measure **real** activation (the model triggering the
skill by its description), superseding the older "tell the agent to read a
SKILL.md" trick.

> **Note:** `runEval` is shipped and proven for Claude Code. For Codex it's a
> documented follow-on on the same driver seam, not yet wired — use the
> deterministic `runHarnessTest` tier there. See
> [harness-testing-codex.md](harness-testing-codex.md).

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
} from "vigiles/testing";

assertSignificant(report, {
  baseline: "vanilla",
  arm: "gated",
  metric: "marked",
});
significantlyBeats(report, "vanilla", "gated", "marked"); // the bare predicate

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
arm×metric moves _significantly in the bad direction_ vs. that baseline (the same
Welch test, current vs. baseline):

```ts
import {
  writeBaseline,
  readBaseline,
  assertNoRegression,
  diffToJUnit,
  diffReports,
} from "vigiles/testing";

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
import {
  measureTriggerRate,
  formatTriggerRateReport,
  skillResolved,
  assertTriggerRate,
} from "vigiles/testing";

const report = await measureTriggerRate({
  skillsDir: ".claude/skills", // loose repo skills — auto-packaged (or pluginDir: "./my-plugin")
  stubSkillBodies: true, // measure SELECTION only — stub each body so a run stops
  // when the skill fires instead of executing its whole procedure (much cheaper)
  prompts: ["…≥10 varied tasks the skill should handle…"],
  irrelevantPrompts: ["…≥10 unrelated tasks it should stay quiet on…"], // optional
  fired: (t) => skillResolved(t, "my-plugin:greet"),
  trials: 2,
});
console.log(formatTriggerRateReport(report)); // trigger-rate: 80% (10 runs)
assertTriggerRate(report, { min: 0.8, maxFalsePositive: 0.1 }); // recall + precision
```

`prompts` measures **recall** (does it fire when it should); `irrelevantPrompts`
adds **precision** (`falsePositiveRate` / `precision`), so a too-broad description
that hijacks unrelated work fails too.

Three things make this cheap and honest, all on by choice:

- **`skillsDir`** — point at a loose `.claude/skills` dir and vigiles packages it
  into a throwaway plugin for you (no hand-rolled `plugin.json`). Use `pluginDir`
  for an already-packaged plugin. Exactly one of the two.
- **`stubSkillBodies`** — triggering is decided by a skill's **frontmatter** (name
  - description) _before_ its body loads, so the body is irrelevant to whether it
    fires. Stubbing it (all descriptions stay, so selection stays faithful) lets a
    run stop at selection instead of paying to execute a multi-step procedure.
- **Diversity gate** — before spending a token, `measureTriggerRate` rejects a
  too-small or near-duplicate prompt set (`minPrompts`, default 10; an NCD
  near-duplicate check). A rate over 3 copy-pasted prompts is noise; the gate
  refuses to produce it. Lower `minPrompts` for a genuinely narrow skill.

- **Model — measured on the realistic selector.** `measureTriggerRate` defaults
  to **`"sonnet"`** (the model most Claude Code users run): trigger-rate is a
  _selection_ measurement, and a weaker model under-selects (dogfooded: a skill
  scored 0.50 on haiku vs 0.90 on Sonnet). A **`minModel`** floor (default
  `"sonnet"`) **fails** the run before spending a token if you point it below —
  lower it deliberately for a cheap, pessimistic check. The model lives in the
  spec, not an env override.
- **Context — `fixture`.** Each run defaults to an **empty cwd**, which is
  faithful for opening-move skills ("describe a feature", "debug this") but
  under-measures skills whose trigger is a repo **state** ("in a git repo",
  "dirty tree"). Pass **`fixture: { "path": "contents" }`** to seed that state so
  recall reflects the condition the skill claims to fire on, not a cold start
  (mirrors `MeasureSpec.fixture`). See
  [`research/plugin-behavioral-findings.md`](../research/plugin-behavioral-findings.md).
- **Throughput — `concurrency`.** The prompts × trials grid runs serially by
  default (politest to rate limits); set **`concurrency: N`** to run N in parallel
  and cut wall-clock on a large prompt set or roster sweep (the `spacingSec` pause
  still applies per run).
- **Isolated vs whole-harness.** By default the skill competes against the
  **other skills in the plugin you point at** (honest — selection is competitive).
  Pass **`installSet: [otherPluginsOrSkillDirs]`** to co-install the rest of the
  user's harness for a release-gate measurement; the report's `competitors` count
  tells you how many skills were in the pool (`0` = isolated, an upper bound on
  recall). See [`research/isolated-vs-whole-harness-eval.md`](../research/isolated-vs-whole-harness-eval.md).
- **Comparing models is a harness A/B.** For "does my skill still fire on the
  cheaper tier / after a model upgrade?", set a per-arm `model` in `measureArms` /
  `runEval` (`arms: { sonnet: { model: … }, opus: { model: … } }`) — no separate
  multi-model matrix runner.

> **Probing a whole plugin at once:** `vigiles scan <plugin> --trigger
--prompts=<file.json>` is the batch front-end to `measureTriggerRate` — it
> measures recall/precision for every model-invocable skill in a plugin and prints
> it as the behavioral column of the scan report. See
> [`docs/cli.md`](cli.md#behavioral-column--scan---trigger). Per-skill API control
> (this section) vs whole-plugin one-shot (scan) — same engine.

### LLM-as-judge for subjective outcomes

When the metric isn't a regex, grade with a model inside `measure` (synchronous,
shells out via the harness CLI):

<!-- vigiles:ignore -->

```ts
import { judge } from "vigiles/testing";

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

## Use it in your runner (node:test / vitest / jest)

The testing API is **runner-agnostic**: the throwing `assert*` helpers are plain
functions, so they work as-is in `node:test`, vitest, jest, or any runner — no
adapter, no plugin. `withHarness` auto-cleans the sandbox (try/finally) so a
deterministic test doesn't leak temp dirs:

```ts
import { test } from "node:test"; // or vitest / jest — same code
import { withHarness, assertCreated } from "vigiles/integration";

test("Stop hook forces more work", async () => {
  await withHarness(spec, (r) => assertCreated(r, "DONE"));
});
```

### Checks — one vocabulary, two evaluators

The newest surface is a **declarative check** — data, not a throwing assert:
`tool("Bash")` is an object that knows how to `eval` itself against a `Trace` (or
a hook decision) and `toJSON`. The same check is evaluated two ways, so you write
the assertion once:

```ts
import { tool, skill, output, hookFired, blocked } from "vigiles/testing";
import { assertChecks } from "vigiles/testing";

// STRICT (deterministic tiers): throws, collecting ALL failures with messages.
assertChecks(await runHarness(spec), [tool("Bash"), output(/done/)]);
assertChecks(runHook(cmd, event), [blocked()]);

// SCORED (eval): the SAME checks, as a rate ± se across trials.
import { measure, assertRates, checkReportToJUnit } from "vigiles/testing";
const report = await measure({
  pluginDir: "./my-plugin",
  task: "…",
  checks: [skill("vigiles:test-harness")],
  stubSkillBodies: true, // firing check: stub each body so a selected skill stops
  // at selection instead of running its (expensive) procedure — a fraction of the
  // tokens. Don't combine with judged/quality checks — the body is gone.
  trials: 10,
  model: "sonnet",
});
assertRates(report, { min: 0.8 }); // gate the rate, not one noisy run
writeFileSync("checks.junit.xml", checkReportToJUnit(report, { min: 0.8 }));
```

A check's **failure message is the product** (`expected the agent to use tool
"Bash", but it used [Read, Edit]`), and because it serializes (`toJSON` /
`toJUnit`), CI reports and regression baselines fall out for free. Raw `Trace`
fields (`r.toolCalls`, `r.output`, `r.file()`) stay first-class — checks are for
composition and serialization, not a mandatory wrapper. Under vitest/jest, one
generic matcher covers the whole vocabulary: `expect(r).toPass(tool("Bash"))` /
`toPassAll([...])`, each carrying the check's own message.

**The vocabulary** (from `vigiles/testing`):

| Check                      | Holds when…                                       | Over             |
| -------------------------- | ------------------------------------------------- | ---------------- |
| `tool(name)`               | the agent used that tool                          | Trace            |
| `skill(id)`                | a `Skill` resolved to `id` (no error)             | Trace            |
| `mcp(server, tool)`        | the agent used `mcp__server__tool`                | Trace            |
| `subagent(name, [checks])` | the `Task` subagent ran + passed nested checks    | Trace (nested)   |
| `output(str \| /re/)`      | the final answer contains/matches                 | Trace            |
| `received(str \| /re/)`    | text reached the model (slash-command / injected) | Trace (mock)     |
| `hookFired(event)`         | a hook fired for that event                       | Trace            |
| `turns({ min, max })`      | the agent took N turns (multi-turn)               | Trace            |
| `wrote(path)`              | a file was created                                | Trace            |
| `judged(rubric, { min })`  | a model grades the output ≥ `min` (LLM rubric)    | Trace (eval)     |
| `cost/latency/tokens({…})` | the run stayed under budget                       | run usage (eval) |
| `blocked()` / `allowed()`  | the hook blocked / allowed                        | `runHook` result |

**A/B with significance.** `measureArms({ arms, checks })` scores the same checks
per arm (a hook/skill/CLAUDE.md rule **on vs off**); `compareCheck(report,
baseline, arm, i)` returns a Welch verdict — "the gated arm resolves the skill
significantly more than vanilla" is a p-value, not a vibe. It takes
`stubSkillBodies` too (every arm with a `pluginDir` is repackaged with bodies
stripped), so an A/B **firing** comparison — does description variant A fire more
than B? — is as cheap per-arm as a single `measure`.

**Property-test a hook.** `propertyHook({ seed, mutate, decide, invariants })`
fuzzes a hook's `(event) → decision` over generated events and shrinks any
counterexample — for invariants like "a destructive command is always blocked".

See [`research/testing-api-design.md`](../research/testing-api-design.md) for the
full design.

**vitest / jest matchers.** The `vigilesMatchers` object has an identical contract
in both, so you can register it by hand:

```ts
import { expect } from "vitest"; // or "@jest/globals"
import { vigilesMatchers } from "vigiles/testing";
expect.extend(vigilesMatchers);
```

…or use the **opt-in integration entries**, which register the matchers _and_
add their TypeScript types (so `toHaveCreated` / `toBlock` / `toBeatBaseline`
autocomplete and type-check in a `.test.ts`):

```ts
// vitest.config.ts →  test: { setupFiles: ["vigiles/vitest"] }
// jest.config.js   →  setupFilesAfterEnv: ["vigiles/jest"]
// …or import once at the top of a test file:
import "vigiles/vitest"; // or "vigiles/jest"

expect(r).toHaveCreated("DONE");
expect(r).toBlock();
expect(report).toBeatBaseline("vanilla", "gated", "caught");
```

**Setup, at a glance:**

|                   | vitest                                     | jest                                   |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| Register (config) | `test: { setupFiles: ["vigiles/vitest"] }` | `setupFilesAfterEnv: ["vigiles/jest"]` |
| …or per-file      | `import "vigiles/vitest"`                  | `import "vigiles/jest"`                |
| Manual (no types) | `expect.extend(vigilesMatchers)`           | `expect.extend(vigilesMatchers)`       |

**The matchers** — `toPass` fronts the whole check vocabulary, so reach for it
first; the rest are shorthands.

| Matcher                                  | Asserts                                  | Over             |
| ---------------------------------------- | ---------------------------------------- | ---------------- |
| `expect(r).toPass(check)`                | the check holds (its own message)        | any result       |
| `expect(r).toPassAll([checks])`          | every check holds                        | any result       |
| `expect(r).toHaveCreated(path)`          | a file was created                       | harness result   |
| `expect(r).toBlock()`                    | the hook blocked                         | `runHook` result |
| `expect(report).toBeatBaseline(b, a, m)` | arm `a` beats baseline `b` on metric `m` | eval report      |

So `expect(r).toPass(tool("Bash"))`, `toPass(skill("x:y"))`, `toPass(blocked())`,
`toPass(cost({ maxUsd: 0.05 }))` all work with one matcher and the check's failure
message. node:test / any runner: use `assertChecks(r, [checks])` instead.

vitest and jest are **optional peer dependencies** — only the entry you import
pulls one in. This seam is **tested**: the same `vigilesMatchers` is exercised
under both runners in [`test/runners/`](../test/runners/) (`matchers.vitest.mjs`

- `matchers.jest.cjs`, via `npm run test:vitest` / `npm run test:jest`), and the
  type augmentation is compile-checked in [`test/types/`](../test/types/)
  (`smoke.vitest.ts` + `smoke.jest.ts`, via `npm run test:types`) — all three run
  in CI. jest uses the CommonJS dist natively (no ESM flags); the `vigiles/vitest`
  entry is ESM because vitest is ESM-only.

## CLI fallback (no runner, CI-friendly)

For repos without a test runner, name files `*.harness.mjs` / `*.eval.mjs` and
run them via the CLI, which discovers and runs each, aggregating exit codes:

```bash
vigiles test                 # discover & run *.harness.mjs (skips if no harness CLI)
vigiles eval --trials=6      # discover & run *.eval.mjs (forwards VIGILES_TRIALS)
```

`vigiles test` needs only the harness CLI (no API key) — so it runs the
deterministic tier in CI at zero cost. A skip is **loud** (`⊘ SKIPPED`, tallied
separately), never a silent green; pass `--no-skip` in a job that asserts the
capability is present, so a skipped tier fails. See the repo's `harness` CI job.
Scripts can be authored in JavaScript (`.mjs`/`.cjs`/`.js`) **or** TypeScript
(`.ts`/`.mts`/`.cts`) — discovery runs both (TS via `tsx` if installed, else
Node's native type stripping).

## Per-level CI (the reusable action)

Each level needs different capabilities set up, and that setup is the annoying part
to get right (bubblewrap, the Ubuntu-24.04 userns sysctl, the rootless egress
connector). vigiles ships a **composite action** that encapsulates it — drop it
into any workflow and run a level in one step:

```yaml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zernie/vigiles/.github/actions/harness-tier@main
        with: { tier: unit } # nothing extra to install
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zernie/vigiles/.github/actions/harness-tier@main
        with: { tier: e2e } # sets up bwrap + pasta/slirp4netns + nft for you
```

`tier: integration` adds bubblewrap + the harness CLI (no key); `tier: e2e`
additionally sets up the rootless egress connector. vigiles **dogfoods** this in
its own [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). The action runs
`npm run test:<tier>` (the per-tier vitest projects), so a consumer wires per-level
CI without re-deriving the capability setup. The **eval** axis is separate (a real
model / API key) — run it on a keyed job with `npm run test:eval`, not on every PR.

> **Note (egress on hosted runners):** the e2e egress tests self-skip on
> GitHub-hosted runners where slirp4netns can't attach (they run for real
> locally / on capable runners). Switching the connector to **pasta** is in
> progress — see [`research/egress-sandbox-tooling.md`](../research/egress-sandbox-tooling.md).

## Two layers or three? (where eval sits)

vigiles has **two layers** — (1) verify the references, (2) test the harness —
and **eval stays inside layer 2**, as its non-deterministic top axis. A _layer_
is a distinct concern: "the references are real" vs "the harness behaves." Eval
isn't a third concern — it's the deepest way of answering the **same** layer-2
question ("does the harness behave?"), just with different epistemics: it
**measures** (mean ± se, significance, pass^k) where unit/integration/e2e
**assert** (pass/fail). So in the docs it's drawn as a clearly distinct _axis_
(non-deterministic, keyed, read-don't-gate) — but not a separate layer, because
splitting it would imply eval delivers a different value than "test the harness,"
which it doesn't.

The one future where eval graduates to a third layer: if vigiles builds the
**self-improving harness** (auto-tune skills/hooks by measured evolution — see
[`research/divergent-bets.md`](../research/divergent-bets.md) #7), eval stops being
"a way to test" and becomes "a way to _optimize_" — a genuinely distinct concern
worth its own layer. Until then: two layers, four levels (refs · unit ·
integration · e2e) + the eval axis.

## Coverage

Two different things wear the word "coverage" here. Keep them apart: **your
harness's** test coverage (do your skills/hooks/subagents each have a test?) and
**vigiles's own** code coverage.

### Coverage of your harness surfaces

A harness grows surfaces faster than tests — a new skill, hook, or subagent
lands and nothing tells you it shipped untested. `vigiles lint` closes that gap
with the per-kind [`untested-skill`](rules/untested-skill.md) /
[`untested-agent`](rules/untested-agent.md) / [`untested-hook`](rules/untested-hook.md)
rules: they report any skill, subagent, or hook that has **no test or eval**. A surface counts as
covered when a `*.{harness,eval}.mjs` sits beside it (the colocation convention
the warning suggests) **or** any test — including a `*.test.ts` — references it
by path (`skills/foo`, `hooks/x.sh`) or namespace (`plugin:foo`). It's
warning-by-default (a nudge; set it to `"error"` to fail CI). Every skill, agent,
and hook is held to it — invocation mode doesn't exempt anything; the only opt-out
is an explicit `<!-- vigiles:ignore-test -->` marker on the surface.

Beneath that gate sits a free, model-free **conformance floor**: load your own
plugin and assert every skill resolves with a usable `description` — the surface
the model triggers on, so a skill that won't load can never fire. `loadPlugin`
plus a name/description check needs no harness CLI and no key, so it runs on every
commit, well under the (paid) trigger-rate eval. vigiles dogfoods exactly this
on its own skills in
[`src/skills-dogfood.test.ts`](../src/skills-dogfood.test.ts) — the gate that
caught a real shipped skill missing its frontmatter `name`, and a hook whose
script had drifted out of `${CLAUDE_PLUGIN_ROOT}/hooks/`.

### vigiles's own coverage

The suite runs under **vitest** (`npm test` → `vitest run`); `npm run coverage`
adds V8 coverage and prints per-file line/branch/function %:

```bash
npm run coverage   # vitest run --coverage
```

The deterministic tiers (`runHook`, `runHarnessTest`) and **all the pure eval
orchestration** — the loop (`runEvalWith`), the record/replay cache, usage
aggregation, and the significance stats — are fully unit-tested via an
**injected runner** (canned stream-json, no model). Only the real-subprocess
spawn is excluded from the gate (exercised by `bench/`); everything around it is
covered.

## Canonical examples

- [`examples/harness/hook-unit.harness.mjs`](../examples/harness/hook-unit.harness.mjs) — unit-test a hook's logic with `runHook`, no harness CLI (the cheap base of the pyramid).
- [`examples/harness/policy-gate.harness.mjs`](../examples/harness/policy-gate.harness.mjs) — PreToolUse Bash gate (block-no-verify) + SessionStart setup, deterministic.
- [`examples/harness/plugin-cohesion.harness.mjs`](../examples/harness/plugin-cohesion.harness.mjs) — load a whole plugin and assert multiple hooks fire together.
- **The oh-my-claudecode walkthrough** — one real plugin, every tier (Claude Code): see [harness-testing-claude-code.md](harness-testing-claude-code.md).
- [`examples/harness/real-superpowers.harness.mjs`](../examples/harness/real-superpowers.harness.mjs) — dogfood `loadPlugin` on a real, pinned obra/superpowers snapshot (key-free, offline).
- [`examples/harness/real-wshobson.harness.mjs`](../examples/harness/real-wshobson.harness.mjs) — dogfood `loadPlugin` on a real wshobson/agents sub-plugin (the no-hooks marketplace shape).
- [`examples/harness/skill-outcome.eval.mjs`](../examples/harness/skill-outcome.eval.mjs) — does a skill change the agent's output?
- [`examples/harness/skill-trigger-rate.eval.mjs`](../examples/harness/skill-trigger-rate.eval.mjs) — does a skill's description _fire_ across varied prompts? (`measureTriggerRate`)
- [`bench/evals/refs-hook.eval.mjs`](../bench/evals/refs-hook.eval.mjs) — the refs-hook A/B (benchmark #4).

## What's covered today — surface × tier

The whole harness surface and how far each tier reaches today (Claude Code, the
reference adapter):

| Surface                                                       | Unit / static                    | Integration (no API key)    | Eval (real model) |
| ------------------------------------------------------------- | -------------------------------- | --------------------------- | ----------------- |
| Hooks — Bash / SessionStart / Stop / UserPromptSubmit         | ✅ logic                         | ✅ fires                    | ✅                |
| Hooks — Edit / Write                                          | ✅ logic                         | ✅ fires                    | ✅                |
| Hooks — PreCompact / Notification / SessionEnd / SubagentStop | ✅ logic                         | — (mock can't trigger)      | 🟡                |
| Instruction file (CLAUDE.md / AGENTS.md)                      | ✅ refs                          | 🟡 present, not behaviour   | ✅ behaviour      |
| Skills                                                        | ✅ loads + description · 🟡 refs | ✅ resolves via `pluginDir` | ✅ activation     |
| Subagents (`agents/`)                                         | ✅ tool rail · 🟡 refs           | 🟡 rail not live-armed      | ✅ via Task       |
| Slash commands (`commands/`)                                  | 🟡 refs                          | 🟡 needs prompt capture     | ✅ via `/cmd`     |
| MCP servers                                                   | ✅ tool refs (`vigiles:mcp`)     | 🔴                          | 🔴                |
| settings.json                                                 | 🟡 assert merged                 | ✅ applied                  | ✅                |
| Hook context injection (does it _land_?)                      | — n/a                            | ✅ `trace.modelRequests`    | ✅                |
| Untrusted plugin execution                                    | ✅ confined (`runHook`)          | ✅ confined (bwrap, Linux)  | 🟡 outer sandbox  |

✅ shipped · 🟡 partial · 🔴 gap · — n/a. Full detail + roadmap: [`research/harness-testing-coverage-matrix.md`](../research/harness-testing-coverage-matrix.md).

## How this compares (promptfoo, DeepEval, Braintrust, Inspect)

The eval ecosystem — [promptfoo](https://github.com/promptfoo/promptfoo),
[DeepEval](https://github.com/confident-ai/deepeval),
[Braintrust](https://www.braintrust.dev/),
[Inspect](https://inspect.aisi.org.uk/) — is excellent at what it does, and
vigiles is **not** a competing eval framework. They evaluate a **model/agent on a
dataset**; vigiles tests **the harness** (your hooks / settings / instruction file
/ skills, loaded exactly as they ship) and is built to be **deterministic and
cheap** where those tools are real-model-only. The core difference is cost by
construction: every one of their runs is a real model call by design, while vigiles
answers most harness questions — does this hook block? is it wired in? does the
skill resolve? — with **no model and no API key at all**, paying for a real model
only at the eval tier, only when the question needs one.

| Capability                                                    | vigiles                         | promptfoo         | DeepEval | Braintrust | Inspect          |
| ------------------------------------------------------------- | ------------------------------- | ----------------- | -------- | ---------- | ---------------- |
| Test a hook/skill with **no model, no API key**               | ✅ `runHook` / mock-model       | ✗ real-model only | ✗        | ✗          | ✗                |
| Unit under test = the **harness as it ships** (A/B arms)      | ✅ `plugin-loader`              | partial (matrix)  | ✗        | partial    | partial          |
| Load the **real** plugin.json/hooks/settings/CLAUDE.md        | ✅                              | ✗ SDK from YAML   | ✗        | ✗          | ✗                |
| **Intercept-and-prevent** a tool in the real harness (safety) | ✅ `interceptTools` + `notTool` | ✗ (assert only)   | ✗        | ✗          | ✗                |
| Tool / trajectory + arg assertions                            | ✅ `toolWith`                   | ✅ `trajectory:*` | ✅       | ✅         | ✅               |
| Is an A/B gap real, not noise? (significance / pass^k)        | ✅ Welch + pass^k               | ✗ pass-rate       | ✗        | partial    | partial (epochs) |
| Regression gate vs a committed baseline                       | ✅ `assertNoRegression`         | ✗                 | partial  | ✅✅       | ✅               |
| Run an untrusted harness **confined**                         | ✅ bubblewrap, safe-by-default  | ✗                 | ✗        | ✗          | partial          |
| Dataset / red-team / judge library / web UI                   | ✗ (not our game)                | ✅✅              | ✅✅     | ✅✅       | ✅               |

Short version: **those tools for prompt/model/dataset/agent evals; vigiles for
testing the harness cheaply, safely, and as it actually ships.** The full analysis
(field profiles, the honest scorecard, and why we don't chase parity) is in
[`research/eval-api-landscape.md`](../research/eval-api-landscape.md) and the
promptfoo-specific zoom-in [`research/promptfoo-deep-dive.md`](../research/promptfoo-deep-dive.md).

## Per-harness guides

The runners above are harness-agnostic; the transport (the mock wire format, the
plugin layout, the sandbox) is per-harness. Pick your harness:

- **[Harness testing — Claude Code](harness-testing-claude-code.md)** — the
  default adapter: the oh-my-claudecode worked walkthrough, `${CLAUDE_PLUGIN_ROOT}`
  / `hooks.json` / `plugin` / `pluginDir` / the `Skill` tool, `scriptModel` + the
  Anthropic Messages mock, the bubblewrap sandbox + egress, reliable events.
- **[Harness testing — Codex](harness-testing-codex.md)** — driving real
  `codex exec` with `{ adapter: codexAdapter }` against the OpenAI Responses mock
  (`startCodexMock`), keyless; what maps (`AGENTS.md`, minimal `SKILL.md`) and
  what doesn't (subagents, by design).

## See also

- [`docs/harnesses.md`](harnesses.md) — which harnesses vigiles targets (Claude Code, and Codex via `vigiles/codex`) and how you pick one: import the adapter beside the harness-agnostic `vigiles/testing` core.
- [`docs/sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records (honestly): IO/`rm -rf`, the three network modes (deny-all / `recordEgress` / allowlisted `egress: { allow }`), the tiers and limits.
- [`docs/testing-matrix.md`](testing-matrix.md) — every use case mapped to its test tier + file (and why the CLI examples are `.mjs`).
- [`research/harness-testing.md`](../research/harness-testing.md) — the deterministic + eval design rationale + real-plugin coverage.
- [`research/benchmarks-runtime-gates.md`](../research/benchmarks-runtime-gates.md) — findings from running this harness in anger.
