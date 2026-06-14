/**
 * Type-level constraint: importing `vigiles/jest` makes the matchers type-check
 * on jest's `expect`. Compiled with `tsc --noEmit` (npm run test:types).
 */
import "../../dist/jest.js";
import { expect } from "@jest/globals";
import type { HarnessTestResult } from "../../dist/adapters/claude-code/harness-test.js";
import type { EvalReport } from "../../dist/adapters/claude-code/eval.js";

declare const r: HarnessTestResult;
declare const report: EvalReport;

expect(r).toHaveCreated("DONE");
expect(report).toBeatBaseline("vanilla", "gated", "caught");

// @ts-expect-error path must be a string
expect(r).toHaveCreated(123);
