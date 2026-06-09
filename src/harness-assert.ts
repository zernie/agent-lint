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

function toolNames(r: HarnessTestResult): string {
  return r.toolCalls.map((c) => c.name).join(", ") || "none";
}

/**
 * Assert the agent invoked a tool whose name matches `name` (string = exact,
 * RegExp = test) — e.g. a skill (`"Skill"`), an MCP tool (`/^mcp__github__/`), or
 * a subagent (`"Task"`). Needs `transcript: true`. The action invariant the
 * skill/MCP/command surfaces are really about.
 */
export function assertToolUsed(
  r: HarnessTestResult,
  name: string | RegExp,
): void {
  if (!r.toolCalls.some((c) => nameMatches(c.name, name))) {
    fail(
      `expected a tool matching ${String(name)} to be used; tools used: [${toolNames(r)}] (did you set transcript:true?)`,
    );
  }
}

/**
 * Assert the agent did NOT invoke any tool matching `name` — the safety negative
 * (e.g. a destructive MCP tool was never called). "File unchanged" can pass by
 * accident; "the tool was never used" is the real invariant. Needs `transcript`.
 */
export function assertToolNotUsed(
  r: HarnessTestResult,
  name: string | RegExp,
): void {
  const hit = r.toolCalls.find((c) => nameMatches(c.name, name));
  if (hit) {
    fail(
      `expected no tool matching ${String(name)} to be used, but ${hit.name} was`,
    );
  }
}

/**
 * Assert the `Skill` tool resolved `skill` (e.g. `"superpowers:test-driven-development"`)
 * without error — the correct skill-activation invariant, vs. grepping the body.
 */
export function assertSkillResolved(r: HarnessTestResult, skill: string): void {
  const call = r.toolCalls.find(
    (c) =>
      c.name === "Skill" && (c.input as { skill?: string })?.skill === skill,
  );
  if (!call) {
    const seen = r.toolCalls
      .filter((c) => c.name === "Skill")
      .map((c) => (c.input as { skill?: string })?.skill ?? "?")
      .join(", ");
    fail(
      `expected the Skill tool to resolve "${skill}"; Skill calls: [${seen || "none"}]`,
    );
  }
  if (call.isError) {
    fail(
      `the Skill "${skill}" was invoked but errored: ${call.resultText.slice(0, 200)}`,
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
  r: HarnessTestResult,
  name: string | RegExp,
  bounds: { min?: number; max?: number; exactly?: number },
): void {
  const n = r.toolCalls.filter((c) => nameMatches(c.name, name)).length;
  const ok =
    (bounds.exactly === undefined || n === bounds.exactly) &&
    (bounds.min === undefined || n >= bounds.min) &&
    (bounds.max === undefined || n <= bounds.max);
  if (!ok) {
    fail(
      `expected count of ${String(name)} to satisfy ${JSON.stringify(bounds)}, got ${String(n)} (tools: [${toolNames(r)}])`,
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
  r: HarnessTestResult,
  names: ReadonlyArray<string | RegExp>,
): void {
  let i = 0;
  for (const c of r.toolCalls) {
    const want = names[i];
    if (want !== undefined && nameMatches(c.name, want)) i++;
  }
  if (i < names.length) {
    fail(
      `expected tools in order [${names.map((n) => String(n)).join(" → ")}]; got [${toolNames(r)}]`,
    );
  }
}

/**
 * The escape hatch: assert any custom invariant over the full list of tool calls
 * the agent made — for rules the helpers above don't express, e.g. "every Edit
 * was preceded by a Read of that file". Needs `transcript`.
 */
export function assertToolCalls(
  r: HarnessTestResult,
  predicate: (calls: readonly ToolCall[]) => boolean,
  message = "tool-call invariant failed",
): void {
  if (!predicate(r.toolCalls)) {
    fail(`${message}; tools used: [${toolNames(r)}]`);
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
