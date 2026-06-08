# Testing your Claude Code harness

`Agent = Model + Harness`. Your harness — hooks, settings, skills, CLAUDE.md —
is code, and code should be tested. vigiles gives you three layers, lowest cost
first:

1. **Verify the references** (static, free) — `vigiles audit` checks that the
   linter rules, files, scripts, and symbols your instruction files cite are
   real. See the [main README](../README.md).
2. **Deterministic harness tests** (`runHarnessTest`, no API key) — does my hook
   _fire / block_ correctly?
3. **Evals** (`runEval`, real model) — does this harness change actually _move
   what the agent does_?

This doc covers layers 2–3. The library is plain async functions returning
data, so it runs in **any** test runner — node:test, vitest, jest, mocha — and
ships a zero-dependency CLI fallback (`vigiles test` / `vigiles eval`).

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
// jest.config.js   →  setupFilesAfterEach: ["vigiles/jest"]
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

**Reliable for:** SessionStart, Stop, UserPromptSubmit, and Bash
PreToolUse/PostToolUse — the governance/policy shapes most real plugins use.
**Not** for Edit/Write tool-event hooks (headless-gated — drive file actions via
Bash, or test those at the eval tier).

## Evals — does the change move behaviour?

`runEval` drives the real model N trials × arm and aggregates: **mean** for
numbers, **fraction-true** for booleans, with **std / se** so you can tell a
real gap from noise (`formatEvalReport` prints `metric=mean±se`). An arm is a
fixture + settings, or a whole `plugin`.

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
console.log(formatEvalReport(report)); // vanilla marked=0.00  gated marked=0.50±0.20
```

A difference smaller than the combined `se` of the two arms is not yet
significant — raise `trials`.

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

## Canonical examples

- [`examples/harness/policy-gate.harness.mjs`](../examples/harness/policy-gate.harness.mjs) — PreToolUse Bash gate (block-no-verify) + SessionStart setup, deterministic.
- [`examples/harness/plugin-cohesion.harness.mjs`](../examples/harness/plugin-cohesion.harness.mjs) — load a whole plugin and assert multiple hooks fire together.
- [`examples/harness/skill-outcome.eval.mjs`](../examples/harness/skill-outcome.eval.mjs) — does a skill change the agent's output?
- [`bench/evals/refs-hook.eval.mjs`](../bench/evals/refs-hook.eval.mjs) — the refs-hook A/B (benchmark #4).

## See also

- [`research/harness-testing.md`](../research/harness-testing.md) — the two-tier design + real-plugin coverage.
- [`research/benchmarks-runtime-gates.md`](../research/benchmarks-runtime-gates.md) — findings from running this harness in anger.
