/* eslint-disable max-params, @typescript-eslint/no-explicit-any --
   The matcher signatures mirror the runtime vigilesMatchers (positional args),
   and `Matchers<T = any>` must match @vitest/expect's generic default to merge. */
/**
 * vigiles — vitest integration (opt-in). ESM, because vitest is ESM-only.
 *
 * Importing this entry registers the vigiles matchers AND augments vitest's
 * types so `toHaveCreated` / `toBeatBaseline` type-check.
 *
 *   // vitest.config.ts →  test: { setupFiles: ["vigiles/vitest"] }
 *   // …or at the top of a test file:
 *   import "vigiles/vitest";
 *
 *   expect(result).toHaveCreated("DONE");
 *   expect(report).toBeatBaseline("vanilla", "gated", "caught");
 *
 * vitest is an optional peer dependency — only vitest users load this entry.
 */
import { expect } from "vitest";
import { vigilesMatchers } from "./harness-assert.js";

expect.extend(vigilesMatchers);

declare module "@vitest/expect" {
  interface Matchers<T = any> {
    toHaveCreated(path: string): T;
    toBlock(): T;
    toBeatBaseline(
      baseline: string,
      arm: string,
      metric: string,
      by?: number,
    ): T;
  }
}
