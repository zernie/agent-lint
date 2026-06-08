/**
 * Cross-runner constraint: the harness helpers + matchers work under **jest**.
 *
 * Same `vigilesMatchers` object as the vitest test — proving the integration is
 * genuinely runner-agnostic. The dist is CommonJS, so jest requires it natively
 * (no ESM flags, no babel — see jest.config.cjs `transform: {}`). Pure — no
 * model, no claude.
 *
 *   npm run test:jest
 */
const {
  vigilesMatchers,
  improvement,
  assertImproves,
  assertCreated,
  assertNotCreated,
} = require("../../dist/harness-assert.js");

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

test("vigilesMatchers register and work under jest", () => {
  expect(result).toHaveCreated("DONE");
  expect(result).not.toHaveCreated("MISSING");
  expect(report).toBeatBaseline("vanilla", "gated", "caught");
  expect(report).not.toBeatBaseline("vanilla", "gated", "caught", 0.9);
});

test("plain helpers work under jest", () => {
  expect(improvement(report, "vanilla", "gated", "caught")).toBe(0.5);
  assertImproves(report, {
    baseline: "vanilla",
    arm: "gated",
    metric: "caught",
  });
  assertCreated(result, "DONE");
  assertNotCreated(result, "MISSING");
});
