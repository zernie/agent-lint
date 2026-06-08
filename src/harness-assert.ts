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
} from "./harness-test.js";
import type { EvalReport } from "./eval.js";

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
