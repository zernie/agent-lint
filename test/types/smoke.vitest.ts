/**
 * Type-level constraint: importing `vigiles/vitest` makes the matchers
 * type-check on vitest's `expect`. Compiled with `tsc --noEmit` (npm run
 * test:types) — it asserts types, it is not executed.
 */
import "../../dist/vitest.mjs";
import { expect } from "vitest";
import type { HarnessTestResult } from "../../dist/harness-test.js";
import type { EvalReport } from "../../dist/eval.js";

declare const r: HarnessTestResult;
declare const report: EvalReport;

// These must type-check — proving the augmentation applied.
expect(r).toHaveCreated("DONE");
expect(report).toBeatBaseline("vanilla", "gated", "caught");
expect(report).toBeatBaseline("vanilla", "gated", "caught", 0.1);

// And the types are real, not `any`: a wrong arg type is rejected.
// @ts-expect-error path must be a string
expect(r).toHaveCreated(123);
