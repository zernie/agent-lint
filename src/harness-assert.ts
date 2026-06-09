/**
 * vigiles — runner-agnostic helpers for harness tests / evals.
 *
 * `runHarnessTest` and `runEval` are plain async functions that return data, so
 * they already work inside any runner (node:test, vitest, jest, mocha). These
 * helpers remove the last bit of boilerplate without coupling to a runner:
 *
 *   - `withHarness` — run a harness test and auto-clean the sandbox (try/finally),
 *     so you don't leak temp dirs in `afterEach`.
 *   - plain `assert*` helpers that throw — usable in every runner, including
 *     node:test which has no `expect.extend`.
 *   - `vigilesMatchers` — register with `expect.extend(vigilesMatchers)` for
 *     `expect(...).toHaveCreated(...)` sugar. The signature is identical for
 *     vitest and jest, so the same object supports both.
 */
import {
  runHarnessTest,
  type HarnessTestSpec,
  type HarnessTestResult,
  type ToolCall,
  type Trace,
} from "./harness-test.js";
import type { EvalReport } from "./eval.js";
import type { HookRunResult } from "./run-hook.js";

/**
 * Run a harness test, hand the result to `fn`, and always clean up the sandbox.
 * Returns whatever `fn` returns. Use this instead of calling `cleanup()` by
 * hand — it survives assertion failures.
 */
export async function withHarness<T>(
  spec: HarnessTestSpec,
  fn: (r: HarnessTestResult) => T | Promise<T>,
): Promise<T> {
  const r = await runHarnessTest(spec);
  try {
    return await fn(r);
  } finally {
    r.cleanup();
  }
}

// --- Plain throwing assertions (any runner) --------------------------------

function fail(message: string): never {
  throw new Error(message);
}

/** Assert the sandbox contains `path` (a hook/agent side-effect file). */
export function assertCreated(r: HarnessTestResult, path: string): void {
  if (r.file(path) === null) fail(`expected the run to create ${path}`);
}

/** Assert the sandbox does NOT contain `path` (e.g. a blocked action's output). */
export function assertNotCreated(r: HarnessTestResult, path: string): void {
  if (r.file(path) !== null) fail(`expected the run NOT to create ${path}`);
}

/** Assert the scripted model served at least `n` turns (e.g. a Stop hook forced more). */
export function assertServedTurns(r: HarnessTestResult, n: number): void {
  if (r.turns < n) {
    fail(`expected ≥ ${String(n)} model turns, got ${String(r.turns)}`);
  }
}

/** Assert a `runHook` result blocked (exit 2 / decision:block / permission:deny). */
export function assertHookBlocked(r: HookRunResult): void {
  if (!r.blocked) {
    fail(
      `expected the hook to block, but it allowed (exit ${String(r.exitCode)})`,
    );
  }
}

/** Assert a `runHook` result allowed (did not block). */
export function assertHookAllowed(r: HookRunResult): void {
  if (r.blocked) {
    fail(
      `expected the hook to allow, but it blocked (exit ${String(r.exitCode)}, decision ${String(r.decision)})`,
    );
  }
}

function nameMatches(name: string, pat: string | RegExp): boolean {
  return typeof pat === "string" ? name === pat : pat.test(name);
}

function toolNames(trace: Trace): string {
  return trace.toolCalls.map((c) => c.name).join(", ") || "none";
}

// --- bare predicates over a Trace (the shared vocabulary, no throw) ---------
//
// Pure fns returning a value, so the SAME vocabulary runs in both consumers:
// the throwing `assert*` helpers below wrap them for the testing tier, and an
// eval `measure` reuses them directly as metrics (`measure: (t) => ({ safe:
// !usedTool(t, /merge|delete/) })`). Never one dual-purpose function.

/**
 * Did the agent invoke a tool whose name matches `name` (string = exact,
 * RegExp = test)? The predicate behind `assertToolUsed` / `assertToolNotUsed`.
 */
export function usedTool(trace: Trace, name: string | RegExp): boolean {
  return trace.toolCalls.some((c) => nameMatches(c.name, name));
}

/** How many tools matching `name` the agent invoked. Behind `assertToolCount`. */
export function toolCount(trace: Trace, name: string | RegExp): number {
  return trace.toolCalls.filter((c) => nameMatches(c.name, name)).length;
}

/**
 * Did the `Skill` tool resolve `skill` (e.g. `"superpowers:test-driven-development"`)
 * without error? The skill-activation predicate behind `assertSkillResolved`.
 */
export function skillResolved(trace: Trace, skill: string): boolean {
  const call = trace.toolCalls.find(
    (c) =>
      c.name === "Skill" && (c.input as { skill?: string })?.skill === skill,
  );
  return call !== undefined && !call.isError;
}

/**
 * Did the agent invoke a tool matching `name` whose INPUT satisfies
 * `inputMatcher` — a tool-ARGUMENT predicate (DeepEval-style), e.g. an `Edit`
 * that targeted the right file. The predicate behind `assertToolUsedWith`.
 */
export function toolUsedWith(
  trace: Trace,
  name: string | RegExp,
  inputMatcher: (input: unknown) => boolean,
): boolean {
  return trace.toolCalls.some(
    (c) => nameMatches(c.name, name) && inputMatcher(c.input),
  );
}

/**
 * Does the agent's final answer (`trace.output`) contain `needle` (string =
 * substring, RegExp = test)? The output predicate behind `assertOutputContains`
 * — the DeepEval-style "what did the agent actually say" check.
 */
export function outputContains(trace: Trace, needle: string | RegExp): boolean {
  return typeof needle === "string"
    ? trace.output.includes(needle)
    : needle.test(trace.output);
}

/**
 * Did a hook matching `name` fire? Matches against both the hook label
 * (`"PreToolUse:Edit"`) and the bare event (`"PreToolUse"`), so `/PreToolUse/`
 * or `"PreToolUse:Edit"` both work. The predicate behind `assertHookFired`.
 */
export function hookFired(trace: Trace, name: string | RegExp): boolean {
  return trace.hooks.some(
    (h) => nameMatches(h.name, name) || nameMatches(h.event, name),
  );
}

/** Did a hook matching `name` fire AND block (exit ≠ 0 / outcome "error")? */
export function hookBlocked(trace: Trace, name: string | RegExp): boolean {
  return trace.hooks.some(
    (h) =>
      (nameMatches(h.name, name) || nameMatches(h.event, name)) && h.blocked,
  );
}

/**
 * Assert the agent invoked a tool whose name matches `name` (string = exact,
 * RegExp = test) — e.g. a skill (`"Skill"`), an MCP tool (`/^mcp__github__/`), or
 * a subagent (`"Task"`). Needs `transcript: true`. The action invariant the
 * skill/MCP/command surfaces are really about.
 */
export function assertToolUsed(trace: Trace, name: string | RegExp): void {
  if (!usedTool(trace, name)) {
    fail(
      `expected a tool matching ${String(name)} to be used; tools used: [${toolNames(trace)}] (did you set transcript:true?)`,
    );
  }
}

/**
 * Assert the agent did NOT invoke any tool matching `name` — the safety negative
 * (e.g. a destructive MCP tool was never called). "File unchanged" can pass by
 * accident; "the tool was never used" is the real invariant. Needs `transcript`.
 */
export function assertToolNotUsed(trace: Trace, name: string | RegExp): void {
  if (usedTool(trace, name)) {
    const hit = trace.toolCalls.find((c) => nameMatches(c.name, name));
    fail(
      `expected no tool matching ${String(name)} to be used, but ${hit?.name ?? String(name)} was`,
    );
  }
}

/**
 * Assert the `Skill` tool resolved `skill` (e.g. `"superpowers:test-driven-development"`)
 * without error — the correct skill-activation invariant, vs. grepping the body.
 */
export function assertSkillResolved(trace: Trace, skill: string): void {
  if (skillResolved(trace, skill)) return;
  // skillResolved is false → either no matching Skill call, or it errored.
  // Reconstruct which, for a useful message.
  const call = trace.toolCalls.find(
    (c) =>
      c.name === "Skill" && (c.input as { skill?: string })?.skill === skill,
  );
  if (!call) {
    const seen = trace.toolCalls
      .filter((c) => c.name === "Skill")
      .map((c) => (c.input as { skill?: string })?.skill ?? "?")
      .join(", ");
    fail(
      `expected the Skill tool to resolve "${skill}"; Skill calls: [${seen || "none"}]`,
    );
  }
  fail(
    `the Skill "${skill}" was invoked but errored: ${call.resultText.slice(0, 200)}`,
  );
}

/**
 * Assert the agent invoked a tool matching `name` whose INPUT satisfies
 * `inputMatcher` — a tool-ARGUMENT invariant (DeepEval-style). Asserts not just
 * *that* a tool ran but *with what args*, e.g. an `Edit` that targeted the right
 * file: `assertToolUsedWith(r, "Edit", (i) => (i as { file_path?: string })
 * .file_path === "src/x.ts")`. Needs `transcript`.
 */
export function assertToolUsedWith(
  trace: Trace,
  name: string | RegExp,
  inputMatcher: (input: unknown) => boolean,
  message?: string,
): void {
  if (!toolUsedWith(trace, name, inputMatcher)) {
    const seen = trace.toolCalls
      .filter((c) => nameMatches(c.name, name))
      .map((c) => JSON.stringify(c.input))
      .join(", ");
    fail(
      message ??
        `expected a ${String(name)} call whose input matches; ${String(name)} inputs: [${seen || "none"}]`,
    );
  }
}

/** Assert the agent's final answer contains `needle` (string substring / RegExp). */
export function assertOutputContains(
  trace: Trace,
  needle: string | RegExp,
): void {
  if (!outputContains(trace, needle)) {
    const shown = trace.output.slice(0, 200) || "(empty)";
    fail(
      `expected the agent's final answer to contain ${String(needle)}; got: ${shown}`,
    );
  }
}

function hookNames(trace: Trace): string {
  return trace.hooks.map((h) => h.name).join(", ") || "none";
}

/**
 * Assert a hook matching `name` fired (and, with `{ blocked: true }`, that it
 * blocked) — the honest hook-firing check, recorded from the run's stream rather
 * than inferred from a marker file the hook had to write. Needs `transcript`.
 */
export function assertHookFired(
  trace: Trace,
  name: string | RegExp,
  opts: { blocked?: boolean } = {},
): void {
  if (!hookFired(trace, name)) {
    fail(
      `expected a hook matching ${String(name)} to fire; hooks fired: [${hookNames(trace)}] (did you set transcript:true?)`,
    );
  }
  if (opts.blocked === true && !hookBlocked(trace, name)) {
    fail(
      `expected a hook matching ${String(name)} to block, but none did; hooks fired: [${hookNames(trace)}]`,
    );
  }
}

// --- sequence / budget invariants over the agent's actions -----------------

/**
 * Assert how many tools matching `name` the agent invoked is within bounds — a
 * budget invariant (e.g. `{ max: 1 }` = "at most one Write", `{ exactly: 0 }` =
 * "never touched it"). Catches runaway loops and wasted work. Needs `transcript`.
 */
export function assertToolCount(
  trace: Trace,
  name: string | RegExp,
  bounds: { min?: number; max?: number; exactly?: number },
): void {
  const n = toolCount(trace, name);
  const ok =
    (bounds.exactly === undefined || n === bounds.exactly) &&
    (bounds.min === undefined || n >= bounds.min) &&
    (bounds.max === undefined || n <= bounds.max);
  if (!ok) {
    fail(
      `expected count of ${String(name)} to satisfy ${JSON.stringify(bounds)}, got ${String(n)} (tools: [${toolNames(trace)}])`,
    );
  }
}

/**
 * Assert the named tools occurred in this order (as a subsequence — gaps allowed)
 * — an ordering invariant. e.g. `["Read", "Edit"]` checks a Read came before an
 * Edit. For a stricter rule (every Edit preceded by a Read), use `assertToolCalls`.
 * Needs `transcript`.
 */
export function assertToolSequence(
  trace: Trace,
  names: ReadonlyArray<string | RegExp>,
): void {
  let i = 0;
  for (const c of trace.toolCalls) {
    const want = names[i];
    if (want !== undefined && nameMatches(c.name, want)) i++;
  }
  if (i < names.length) {
    fail(
      `expected tools in order [${names.map((n) => String(n)).join(" → ")}]; got [${toolNames(trace)}]`,
    );
  }
}

/**
 * The escape hatch: assert any custom invariant over the full list of tool calls
 * the agent made — for rules the helpers above don't express, e.g. "every Edit
 * was preceded by a Read of that file". Needs `transcript`.
 */
export function assertToolCalls(
  trace: Trace,
  predicate: (calls: readonly ToolCall[]) => boolean,
  message = "tool-call invariant failed",
): void {
  if (!predicate(trace.toolCalls)) {
    fail(`${message}; tools used: [${toolNames(trace)}]`);
  }
}

/**
 * Did `arm` succeed on EVERY trial for `metric` — τ-bench pass^k = 1? The
 * reliability predicate over an eval report (vs. `improvement`, which reads the
 * mean gap). Reads `report.arms[arm].stats[metric].passK`.
 */
export function reliable(
  report: EvalReport,
  arm: string,
  metric: string,
): boolean {
  return report.arms[arm]?.stats[metric]?.passK === 1;
}

/**
 * Assert `arm` passed `metric` on every trial (pass^k = 1) — the reliability
 * gate for a non-deterministic harness ("worked every time", not "on average").
 */
export function assertReliable(
  report: EvalReport,
  opts: { arm: string; metric: string },
): void {
  if (!reliable(report, opts.arm, opts.metric)) {
    const pk = report.arms[opts.arm]?.stats[opts.metric]?.passK;
    fail(
      `expected ${opts.arm} to pass ${opts.metric} on every trial (pass^k=1), got pass^k=${String(pk ?? "n/a")}`,
    );
  }
}

/** The gap on `metric` between two arms (arm − baseline). */
export function improvement(
  report: EvalReport,
  baseline: string,
  arm: string,
  metric: string,
): number {
  const a = report.arms[arm]?.metrics[metric] ?? 0;
  const b = report.arms[baseline]?.metrics[metric] ?? 0;
  return a - b;
}

/**
 * Assert `arm` beats `baseline` on `metric` by more than `by`. With `by` left at
 * 0 this just asserts a positive gap; pass the combined se to demand the gap
 * clear the noise floor.
 */
export function assertImproves(
  report: EvalReport,
  opts: { baseline: string; arm: string; metric: string; by?: number },
): void {
  const by = opts.by ?? 0;
  const delta = improvement(report, opts.baseline, opts.arm, opts.metric);
  if (delta <= by) {
    fail(
      `expected ${opts.arm} to beat ${opts.baseline} on ${opts.metric} by > ${String(by)}, got ${delta.toFixed(3)}`,
    );
  }
}

// --- jest / vitest matchers (expect.extend) --------------------------------

interface MatcherOutput {
  pass: boolean;
  message: () => string;
}

/**
 * Custom matchers compatible with both vitest and jest. Register once:
 *
 *   import { expect } from "vitest"; // or "@jest/globals"
 *   import { vigilesMatchers } from "vigiles/harness-assert";
 *   expect.extend(vigilesMatchers);
 *
 *   expect(result).toHaveCreated("RESULT");
 *   expect(report).toBeatBaseline("vanilla", "gated", "caught");
 */
export const vigilesMatchers = {
  toHaveCreated(received: HarnessTestResult, path: string): MatcherOutput {
    const pass = received.file(path) !== null;
    return {
      pass,
      message: () => `expected the run ${pass ? "not " : ""}to create ${path}`,
    };
  },
  toBlock(received: HookRunResult): MatcherOutput {
    const pass = received.blocked;
    return {
      pass,
      message: () =>
        `expected the hook ${pass ? "not " : ""}to block (exit ${String(received.exitCode)}, decision ${String(received.decision)})`,
    };
  },
  // eslint-disable-next-line max-params -- jest/vitest matchers take positional args
  toBeatBaseline(
    received: EvalReport,
    baseline: string,
    arm: string,
    metric: string,
    by = 0,
  ): MatcherOutput {
    const delta = improvement(received, baseline, arm, metric);
    const pass = delta > by;
    return {
      pass,
      message: () =>
        `expected ${arm} ${pass ? "not " : ""}to beat ${baseline} on ${metric} by > ${String(by)} (got ${delta.toFixed(3)})`,
    };
  },
};
