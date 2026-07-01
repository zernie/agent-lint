/**
 * Eval-cost suite (vitest): the pure cost-transparency engine — snapshot builders
 * from per-run / per-arm / whole-report usage, metered-vs-subscription detection,
 * the session tally, and the formatted block (tokens + API-equivalent $, the loud
 * metered warning vs the ✅ subscription line, the session line). No model, no key.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  totalTokens,
  costFromRun,
  costFromArm,
  costFromEvalReport,
  sumCosts,
  detectBilling,
  recordSessionCost,
  sessionCost,
  resetSessionCost,
  formatCostSummary,
  emitCostSummary,
} from "./eval-cost.js";

const run = {
  costUsd: 0.42,
  durationMs: 1000,
  inputTokens: 2100,
  outputTokens: 1800,
  cacheCreationTokens: 500,
  cacheReadTokens: 80000,
};

const arm = {
  totalCostUsd: 0.42,
  meanCostUsd: 0.14,
  meanDurationMs: 900,
  totalInputTokens: 2100,
  totalOutputTokens: 1800,
  totalCacheCreationTokens: 500,
  totalCacheReadTokens: 80000,
};

describe("cost snapshots", () => {
  it("builds a snapshot from a per-run usage", () => {
    const c = costFromRun(run);
    expect(c.costUsd).toBe(0.42);
    expect(totalTokens(c)).toBe(2100 + 1800 + 500 + 80000);
  });

  it("builds a snapshot from an aggregated arm usage", () => {
    expect(costFromArm(arm).costUsd).toBe(0.42);
    expect(costFromArm(arm).inputTokens).toBe(2100);
  });

  it("sums snapshots (e.g. across A/B arms)", () => {
    const s = sumCosts([costFromRun(run), costFromRun(run)]);
    expect(s.costUsd).toBeCloseTo(0.84);
    expect(s.outputTokens).toBe(3600);
  });

  it("sums a whole EvalReport's arms", () => {
    const report = {
      arms: { baseline: { usage: arm }, skill: { usage: arm } },
    } as unknown as Parameters<typeof costFromEvalReport>[0];
    expect(costFromEvalReport(report).costUsd).toBeCloseTo(0.84);
  });
});

describe("detectBilling", () => {
  it("is metered when a real API key is set", () => {
    expect(detectBilling({ ANTHROPIC_API_KEY: "sk-ant-real" })).toEqual({
      metered: true,
      keyVar: "ANTHROPIC_API_KEY",
    });
    expect(detectBilling({ ANTHROPIC_AUTH_TOKEN: "tok" }).metered).toBe(true);
  });

  it("is NOT metered on the subscription (no key vars, or blank)", () => {
    expect(detectBilling({}).metered).toBe(false);
    expect(detectBilling({ ANTHROPIC_API_KEY: "  " }).metered).toBe(false);
  });
});

describe("session tally", () => {
  beforeEach(() => resetSessionCost());

  it("accumulates across runs", () => {
    expect(sessionCost().costUsd).toBe(0);
    recordSessionCost(costFromRun(run));
    recordSessionCost(costFromRun(run));
    expect(sessionCost().costUsd).toBeCloseTo(0.84);
  });
});

describe("formatCostSummary", () => {
  it("shows tokens + API-equivalent $ and the ✅ subscription line", () => {
    const text = formatCostSummary(costFromRun(run), {
      billing: { metered: false, keyVar: null },
    });
    expect(text).toMatch(/Spent: 84,400 tokens/);
    expect(text).toMatch(/~\$0\.42 API-equivalent/);
    expect(text).toMatch(/your Claude subscription — \$0 metered ✅/);
    expect(text).not.toMatch(/METERED/);
  });

  it("shows a LOUD warning + actionable fix when metered", () => {
    const text = formatCostSummary(costFromRun(run), {
      billing: { metered: true, keyVar: "ANTHROPIC_API_KEY" },
    });
    expect(text).toMatch(
      /⚠ Billed to: METERED API \(ANTHROPIC_API_KEY is set\)/,
    );
    expect(text).toMatch(/unset ANTHROPIC_API_KEY/);
  });

  it("appends the session line only when it exceeds this run", () => {
    const bigger = sumCosts([costFromRun(run), costFromRun(run)]);
    const withSession = formatCostSummary(costFromRun(run), {
      billing: { metered: false, keyVar: null },
      session: bigger,
    });
    expect(withSession).toMatch(/Session so far:/);
    const noSession = formatCostSummary(costFromRun(run), {
      billing: { metered: false, keyVar: null },
      session: costFromRun(run),
    });
    expect(noSession).not.toMatch(/Session so far:/);
  });

  it("formats sub-cent costs with more precision", () => {
    const text = formatCostSummary(
      { ...costFromRun(run), costUsd: 0.004 },
      { billing: { metered: false, keyVar: null } },
    );
    expect(text).toMatch(/\$0\.0040/);
  });
});

describe("emitCostSummary", () => {
  beforeEach(() => resetSessionCost());

  it("records the session and writes to the injected sink", () => {
    const lines: string[] = [];
    const text = emitCostSummary(costFromRun(run), {
      env: {},
      out: (s) => lines.push(s),
    });
    expect(lines).toHaveLength(1);
    expect(text).toMatch(/Spent:/);
    expect(sessionCost().costUsd).toBeCloseTo(0.42);
  });

  it("is a no-op on a zero-cost run", () => {
    const lines: string[] = [];
    const text = emitCostSummary(
      {
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      { env: {}, out: (s) => lines.push(s) },
    );
    expect(text).toBe("");
    expect(lines).toEqual([]);
  });

  it("defaults the sink to console.error", () => {
    const spy: string[] = [];
    const orig = console.error;
    console.error = (s: string): void => void spy.push(s);
    try {
      emitCostSummary(costFromRun(run), { env: {} });
    } finally {
      console.error = orig;
    }
    expect(spy.join("\n")).toMatch(/Spent:/);
  });
});
