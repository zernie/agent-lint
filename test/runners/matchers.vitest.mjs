/**
 * Cross-runner constraint: the harness helpers + matchers work under **vitest**.
 *
 * The library is runner-agnostic (plain functions over the CommonJS dist), so
 * the same `vigilesMatchers` object registers via `expect.extend` here exactly
 * as it does under jest (see matchers.jest.cjs). Pure — no model, no claude.
 *
 *   npm run test:vitest
 */
import { test, expect } from "vitest";
import {
  vigilesMatchers,
  improvement,
  assertImproves,
  assertCreated,
  assertNotCreated,
} from "../../dist/harness-assert.js";

expect.extend(vigilesMatchers);

const report = {
  name: "demo",
  trials: 6,
  arms: {
    vanilla: { runs: 6, metrics: { caught: 0 }, stats: {} },
    gated: { runs: 6, metrics: { caught: 0.5 }, stats: {} },
  },
};

const result = {
  exitCode: 0,
  stdout: "",
  stderr: "",
  cwd: "/tmp/x",
  turns: 2,
  file: (p) => (p === "DONE" ? "x" : null),
  cleanup: () => {},
};

test("vigilesMatchers register and work under vitest", () => {
  expect(result).toHaveCreated("DONE");
  expect(result).not.toHaveCreated("MISSING");
  expect(report).toBeatBaseline("vanilla", "gated", "caught");
  expect(report).not.toBeatBaseline("vanilla", "gated", "caught", 0.9);
});

test("plain helpers work under vitest", () => {
  expect(improvement(report, "vanilla", "gated", "caught")).toBe(0.5);
  assertImproves(report, {
    baseline: "vanilla",
    arm: "gated",
    metric: "caught",
  });
  assertCreated(result, "DONE");
  assertNotCreated(result, "MISSING");
});
