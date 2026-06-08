/* eslint-disable max-params --
   The matcher signatures mirror the runtime vigilesMatchers (positional args). */
/**
 * vigiles — jest integration (opt-in).
 *
 * Importing this entry registers the vigiles matchers AND augments jest's types
 * so `toHaveCreated` / `toBeatBaseline` type-check.
 *
 *   // jest.config.js →  setupFilesAfterEach: ["vigiles/jest"]
 *   // …or at the top of a test file:
 *   import "vigiles/jest";
 *
 *   expect(result).toHaveCreated("DONE");
 *   expect(report).toBeatBaseline("vanilla", "gated", "caught");
 *
 * jest is an optional peer dependency — only jest users load this entry.
 */
import { expect } from "@jest/globals";
import { vigilesMatchers } from "./harness-assert.js";

expect.extend(vigilesMatchers);

declare module "@jest/expect" {
  interface Matchers<R> {
    toHaveCreated(path: string): R;
    toBlock(): R;
    toBeatBaseline(
      baseline: string,
      arm: string,
      metric: string,
      by?: number,
    ): R;
  }
}
