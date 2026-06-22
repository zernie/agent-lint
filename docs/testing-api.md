# Testing API reference

The complete surface behind [Testing your harness](harness-testing.md) — every
predicate, assertion, check, matcher, and option. The guide has the task-first
how-to; this is the reference you reach for when you need the exact name or knob.

## Contents

- [The `Trace` model](#the-trace-model)
- [Predicates](#predicates)
- [Assertions](#assertions)
- [The `check` vocabulary](#the-check-vocabulary)
- [vitest / jest matchers](#vitest--jest-matchers)
- [`measureTriggerRate` options](#measuretriggerrate-options)
- [`runEval`, `measure`, `measureArms`](#runeval-measure-measurearms)
- [Significance &amp; regression gating](#significance--regression-gating)
- [Imports &amp; harness selection](#imports--harness-selection)

## The `Trace` model

Every tier produces one **`Trace`**: the observable record of a run. A
`runHarnessTest` result _is_ a `Trace`, and so is the `ctx` handed to a `runEval`
`measure`. Its fields:

| Field           | What it holds                                                      |
| --------------- | ------------------------------------------------------------------ |
| `toolCalls`     | every tool the agent invoked (name + input)                        |
| `hooks`         | each `HookFire` — `name`, `event`, `exitCode`, `blocked`, `output` |
| `output`        | the agent's final answer                                           |
| `modelRequests` | what actually reached the model (did injected context land?)       |
| `turns`         | number of agent turns                                              |
| `file(p)`       | read a file from the post-run filesystem                           |
| `sh(cmd)`       | run a shell command against the post-run filesystem (eval ctx)     |
| `usage`         | `{ costUsd, durationMs, inputTokens, outputTokens }` (eval)        |

`trace.hooks` is **recorded**, not inferred: each `HookFire` comes from the CLI's
stream events, so a test asserts a hook _actually_ fired and blocked — no marker
file the hook had to write. Capture it with `transcript: true` on the harness tier
(always on at the eval tier).

## Predicates

Pure functions over a `Trace` — **no `assert` prefix, no throw**. Use them in a
`measure` as metrics, or wherever you want a boolean.

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
outputContains(trace, /done/i); // boolean (the final answer)
hookFired(trace, "PreToolUse:Edit"); // boolean (recorded from the stream)
hookBlocked(trace, "PreToolUse"); // boolean (fired AND exit ≠ 0)
```

## Assertions

Each `assert*` is a predicate wrapped in a throw (`assertToolUsed` is `usedTool`
then throw; `assertSkillResolved` is `skillResolved` then throw). They're plain
functions, so they work in `node:test`, vitest, jest, or any runner. Beyond a
single tool you can assert on sequence and budget:

```ts
assertToolSequence(r, ["Read", "Edit"]); // ordering — Read before Edit
assertToolCount(r, "Write", { max: 1 }); // budget — no runaway writes
assertToolUsedWith(r, "Edit", (i) => i.file_path === "src/billing.ts"); // argument
assertToolCalls(r, (calls) => /* any custom rule over the list */ true);

assertHookBlocked(r); // exit 2 / decision:"block" / permissionDecision:"deny"
assertHookFired(r, "UserPromptSubmit");
assertOutputContains(r, /on it/);
assertCreated(r, "DONE"); // a file was created
```

`withHarness(spec, fn)` wraps a deterministic run with try/finally cleanup so a
test doesn't leak temp dirs.

### Test a compiled hook in-process (no subprocess)

A [compiled hook](compiled-hooks.md) (a `vigiles/hook` program) has a **pure**
decision, so you can test it without spawning the CLI at all — pass the hook's
default export and a raw event:

```ts
import {
  assertHookDenies,
  assertHookAllows,
  runHookProgram,
} from "vigiles/unit";
import guard from "./safe-bash-guard.mjs";

assertHookDenies(guard, {
  tool_name: "Bash",
  tool_input: { command: "git push -f" },
});
assertHookAllows(guard, {
  tool_name: "Bash",
  tool_input: { command: "git status" },
});

// the raw primitive: a normalized, role-dispatched outcome
runHookProgram(guard, event); // → { kind: "decision" | "injection" | "reaction", … }
```

`assertHookBlocked` / `assertHookAllowed` (above) are the sibling assertions over
a `runHook` **result** (the hook run as a real subprocess); `assertHookDenies` /
`assertHookAllows` evaluate the typed program **directly** — cheaper, and they
work for inject/react hooks too via `runHookProgram`.

### Assert a subagent's typed outcome

For the railway/result subagent contract, `assertAgentOk` / `assertAgentErr` /
`assertAgentResult` test a subagent's outcome via `parseAgentResult` — a
**deterministic assert that replaces an LLM judge**. A subagent with a `result()`
contract ends its turn with a `vigiles:ok` / `vigiles:err` block; these helpers
parse it and validate it against the declared shape:

```ts
import { result } from "vigiles";
import {
  assertAgentOk,
  assertAgentErr,
  assertAgentResult,
} from "vigiles/testing";

const contract = result(
  { files: "string[]", summary: "string" }, // the ok track
  { reason: "string", step: "string" }, // the err track
);

const value = assertAgentOk(r.output, contract); // returns the validated `value`
const error = assertAgentErr(r.output, contract); // returns the validated `error`

// The general predicate form, for rich detail:
assertAgentResult(
  r.output,
  (res) => res.kind === "ok" && res.value.files.length > 0,
  contract,
);
```

Pass the `contract` and a wrong/missing field fails the assertion; omit it and any
well-formed JSON block is accepted. Output that isn't a valid block is `malformed`
(throws) — never a silent pass. Worked example:
[`railway-result.harness.mjs`](../examples/harness/railway-result.harness.mjs).

## The `check` vocabulary

A **check** is data, not a throwing assert: `tool("Bash")` is an object that knows
how to `eval` itself against a `Trace` (or a hook decision) and `toJSON`. The same
check is evaluated two ways — write the assertion once:

```ts
import {
  tool,
  skill,
  output,
  hookFired,
  blocked,
  assertChecks,
} from "vigiles/testing";

// STRICT (deterministic tiers): throws, collecting ALL failures with messages.
assertChecks(await runHarness(spec), [tool("Bash"), output(/done/)]);
assertChecks(runHook(cmd, event), [blocked()]);

// SCORED (eval): the SAME checks, as a rate ± se across trials.
import { measure, assertRates, checkReportToJUnit } from "vigiles/testing";
const report = await measure({
  pluginDir: "./my-plugin",
  task: "…",
  checks: [skill("vigiles:test-harness")],
  stubSkillBodies: true, // firing check: stub bodies → a fraction of the tokens
  trials: 10,
  model: "sonnet",
});
assertRates(report, { min: 0.8 }); // gate the rate, not one noisy run
writeFileSync("checks.junit.xml", checkReportToJUnit(report, { min: 0.8 }));
```

A check's **failure message is the product** (`expected the agent to use tool
"Bash", but it used [Read, Edit]`), and because it serializes, CI reports and
regression baselines fall out for free.

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

`measureArms({ arms, checks })` scores the same checks per arm (a hook/skill/rule
**on vs off**); `compareCheck(report, baseline, arm, i)` returns a Welch verdict.
It takes `stubSkillBodies` too. `propertyHook({ seed, mutate, decide, invariants })`
fuzzes a hook's `(event) → decision` and shrinks any counterexample. See
[`research/testing-api-design.md`](../research/testing-api-design.md) for the full
design.

## vitest / jest matchers

The testing API is runner-agnostic; these are an optional convenience. Register by
hand:

```ts
import { expect } from "vitest"; // or "@jest/globals"
import { vigilesMatchers } from "vigiles/testing";
expect.extend(vigilesMatchers);
```

…or use the **opt-in integration entries**, which register the matchers _and_ add
their TypeScript types:

```ts
// vitest.config.ts →  test: { setupFiles: ["vigiles/vitest"] }
// jest.config.js   →  setupFilesAfterEnv: ["vigiles/jest"]
import "vigiles/vitest"; // …or import once at the top of a test file
```

|                   | vitest                                     | jest                                   |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| Register (config) | `test: { setupFiles: ["vigiles/vitest"] }` | `setupFilesAfterEnv: ["vigiles/jest"]` |
| …or per-file      | `import "vigiles/vitest"`                  | `import "vigiles/jest"`                |
| Manual (no types) | `expect.extend(vigilesMatchers)`           | `expect.extend(vigilesMatchers)`       |

`toPass` fronts the whole check vocabulary, so reach for it first; the rest are
shorthands.

| Matcher                                  | Asserts                                  | Over             |
| ---------------------------------------- | ---------------------------------------- | ---------------- |
| `expect(r).toPass(check)`                | the check holds (its own message)        | any result       |
| `expect(r).toPassAll([checks])`          | every check holds                        | any result       |
| `expect(r).toHaveCreated(path)`          | a file was created                       | harness result   |
| `expect(r).toBlock()`                    | the hook blocked                         | `runHook` result |
| `expect(report).toBeatBaseline(b, a, m)` | arm `a` beats baseline `b` on metric `m` | eval report      |

So `toPass(tool("Bash"))`, `toPass(skill("x:y"))`, `toPass(blocked())`,
`toPass(cost({ maxUsd: 0.05 }))` all work with one matcher. vitest and jest are
**optional peer dependencies** — only the entry you import pulls one in; the seam
is tested under both runners in [`test/runners/`](../test/runners/).

## `measureTriggerRate` options

```ts
const report = await measureTriggerRate({
  skillsDir: ".claude/skills", // loose skills — auto-packaged. XOR pluginDir.
  pluginDir: "./my-plugin", //    already-packaged plugin. XOR skillsDir.
  prompts: [...], //              recall set (≥ minPrompts, NCD-diverse)
  irrelevantPrompts: [...], //    precision set (→ falsePositiveRate / precision)
  fired: (t) => skillResolved(t, "my-plugin:greet"),
  stubSkillBodies: true, //       stop at SELECTION (frontmatter decides firing)
  fixture: { "path": "contents" }, // seed repo STATE a skill triggers on
  installSet: [otherPluginsOrDirs], // co-install the rest of the harness (release gate)
  trials: 2,
  concurrency: 4, //              parallelize the prompts × trials grid
  minModel: "sonnet", //          fail before spending a token if pointed below
  minPrompts: 10, //              diversity-gate floor
});
assertTriggerRate(report, { min: 0.8, maxFalsePositive: 0.1 });
```

- **`skillsDir` vs `pluginDir`** — exactly one. `skillsDir` packages a loose
  `.claude/skills` into a throwaway plugin for you.
- **`stubSkillBodies`** — triggering is decided by frontmatter _before_ the body
  loads, so stubbing the body (descriptions kept) lets a run stop at selection
  instead of executing a multi-step procedure. Don't combine with judged/quality
  checks — the body is gone.
- **Diversity gate** — `minPrompts` (default 10) + an NCD near-duplicate check
  rejects a too-small / copy-pasted prompt set before spending a token.
- **Model** — defaults to `"sonnet"` (the realistic selector; a weaker model
  under-selects — dogfooded 0.50 on haiku vs 0.90 on sonnet). The `minModel` floor
  fails a too-weak run up front. Model lives in the spec, not an env override.
- **`fixture`** — each run defaults to an empty cwd (faithful for opening-move
  skills); pass `fixture` to seed the repo state a skill claims to fire on. See
  [`research/plugin-behavioral-findings.md`](../research/plugin-behavioral-findings.md).
- **`installSet`** — by default the skill competes against the other skills in the
  plugin you point at (honest — selection is competitive); `installSet` co-installs
  the rest of the user's harness for a release-gate measurement. `report.competitors`
  is the pool size (`0` = isolated, an upper bound on recall). See
  [`research/isolated-vs-whole-harness-eval.md`](../research/isolated-vs-whole-harness-eval.md).
- **Comparing models** is a harness A/B — set a per-arm `model` in `measureArms` /
  `runEval`, no separate matrix runner.

## `runEval`, `measure`, `measureArms`

`runEval` drives the real model N trials × arm and aggregates: **mean** for
numbers, **fraction-true** for booleans, with **std / se** and **pass^k** (did the
metric succeed on _every_ trial? — the reliability question "worked every time" ≠
"worked on average"). An arm is a fixture + settings, or a whole `plugin` /
`pluginDir`.

The `measure` ctx is a full `Trace`, so a metric reads the agent's **actions**
(`ctx.toolCalls`), its **final answer** (`ctx.output`), and the **filesystem**
(`ctx.file`, `ctx.sh`) — reuse the bare predicates to compute them.

**Two questions, two oracles** — don't default to A/B for both:

- **Absolute — "is this exact skill / output any good?"** Testing _one_ skill with
  no on/off variant: score it directly with `measure({ checks: [judged(rubric)] })`
  - `assertRates({ min })`. The oracle promptfoo/DeepEval lead with.
- **Relative — "does this change _move_ behaviour vs off?"** The lift a change buys
  (regression gating, proving a gap isn't noise): `runEval` with `off`/`on` arms +
  `assertSignificant`.

**Cost / caching / concurrency:**

- `concurrency: N` — run N trials at once (default 1). Rate-limit responses back
  off and retry automatically (`rateLimitRetries`, `retryBackoffMs`).
- `maxCostUsd: N` — stop launching once measured cost crosses the cap; in-flight
  trials finish and `report.aborted` is set.
- `cache: "readwrite"` — **record/replay**. Each trial's output _and_ post-run
  filesystem are recorded; a matching re-run replays without calling the model. The
  key excludes `measure`, so **editing your metric and re-running re-scores for
  free** — the model is re-called only when a model-affecting input changes.

`report.arms[a].usage` aggregates per arm; `report.totalCostUsd` sums the run.

**LLM-as-judge** — grade with a model inside `measure` (synchronous, shells out via
the harness CLI):

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

Deliberately thin — for datasets, tracing, and dashboards use a dedicated eval
platform (Braintrust, DeepEval). vigiles owns the harness A/B, not the judging
platform.

## Significance &amp; regression gating

**Significance.** `se` gives the spread; `assertSignificant` runs a Welch's t-test
over two arms' summary stats and throws unless the arm beats the baseline at
`alpha` (default 0.05) — the noise floor is **computed**, not hand-fed:

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
significantlyBeats(report, "vanilla", "gated", "marked"); // bare predicate
const c = compareArms(report, "vanilla", "gated", "marked");
// → { delta, seDelta, t, df, pValue, significant }  (reads mean/se/n, no raw rows)
```

For 0/1 metrics this is the t approximation to the two-proportion test — close at
eval trial counts. An insignificant gap means **raise `trials`** until the noise
floor drops below it. `assertReliable(report, { arm, metric })` is the stricter
bar: the metric succeeded on **every** trial (pass^k = 1).

**Regression gating** compares one run against a **committed baseline** — "jest
snapshots for agent behaviour, with a real noise floor":

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
  // or emit JUnit: diffToJUnit(diffReports(baseline, [report]))
}
```

Higher is better by default; list `lowerIsBetter` metrics (cost/latency) to flip
them. A new arm/metric absent from the baseline is skipped (not a regression).

## Imports &amp; harness selection

**One canonical entry point per layer** — import from these:

| Layer                  | Canonical import  | What it re-exports                                                       |
| ---------------------- | ----------------- | ------------------------------------------------------------------------ |
| Test your harness      | `vigiles/testing` | every tier + check + assertion + matcher + tool stubs (the **superset**) |
| Lint instruction files | `vigiles/linting` | the spec builders + the compiler                                         |

`vigiles/testing` is the superset — reach for it first. The other entry points are
deliberate surfaces, not aliases:

- **Capability-scoped tier barrels** — `vigiles/unit` / `vigiles/integration` /
  `vigiles/e2e`: the import path _is_ the capability contract, so `vigiles/unit`
  physically can't reach a model or the network (a higher tier re-exports the lower
  ones; dependencies point downward only).
- **Authoring** — `vigiles/spec`: the spec builders for `.spec.ts` files.
- **CC-specific transport** — `scriptModel`, `loadPlugin`, `resolveHarness`,
  `LoadedPlugin` live in `vigiles/claude-code`, not `vigiles/testing`.
- **Runner integration** — `vigiles/vitest` / `vigiles/jest`.
- **Harness selection** — `vigiles/claude-code` / `vigiles/codex` / `vigiles/adapter`.

**Selecting a harness.** The runners (`runHook`, `runHarnessTest`, `runEval`) are
harness-agnostic; pick the harness with one option, defaulting to Claude Code:

```ts
import { runHarnessTest } from "vigiles/testing";

await runHarnessTest(spec); // Claude Code (default)
await runHarnessTest(spec, { adapter: codexAdapter }); // a second harness
```

`codexAdapter` comes from `vigiles/codex`. Nothing in `vigiles/testing` changes
when the harness changes; unused adapters tree-shake out. The CLI can't take an
import, so it **auto-detects** the harness from the repo. For the full
adapter/import model and the capability matrix, see
[`docs/harnesses.md`](harnesses.md).

## See also

- [Testing your harness](harness-testing.md) — the task-first how-to guide.
- [`docs/harnesses.md`](harnesses.md) — harness selection + the capability matrix.
- [`research/testing-api-design.md`](../research/testing-api-design.md) — the design behind the check vocabulary.
