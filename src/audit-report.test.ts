/**
 * AuditReport contract suite (vitest, no fs/model): buildAuditReport assembles a
 * versioned report from a ScanReport — the upload/CI boundary. Pure (no clock):
 * `generatedAt` is the CLI's job, never the builder's, so the embedded-in-HTML
 * form stays deterministic.
 */
import { describe, it, expect } from "vitest";
import { buildAuditReport, AUDIT_SCHEMA_VERSION } from "./audit-report.js";
import type { ScanReport } from "./scan.js";

function makeReport(over: Partial<ScanReport> = {}): ScanReport {
  return {
    dir: "/x/demo",
    instructions: null,
    skills: [],
    agents: [],
    hooks: [],
    inlineHooks: 0,
    manualHookCount: 0,
    commands: 1,
    mcp: false,
    danglingRefs: [],
    hookEventIssues: [],
    frontmatterIssues: [],
    frontmatterValueIssues: [],
    skillMetaIssues: [],
    mcpIssues: [],
    mcpHookIssues: [],
    descriptionOverlaps: [],
    malformedFrontmatter: [],
    warnings: [],
    untested: 0,
    puritySummary: { pure: 0, bounded: 0, unrestricted: 0 },
    ...over,
  } as ScanReport;
}

describe("buildAuditReport", () => {
  it("stamps a versioned, self-describing meta (no clock in the pure builder)", () => {
    const r = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "9.9.9",
    });
    expect(r.meta.schemaVersion).toBe(AUDIT_SCHEMA_VERSION);
    expect(r.meta.tool).toBe("vigiles");
    expect(r.meta.harness).toBe("claude-code");
    expect(r.meta.vigilesVersion).toBe("9.9.9");
    expect(r.meta.dir).toBe("/x/demo");
    expect(r.meta.generatedAt).toBeUndefined(); // CLI's job, not the builder's
  });

  it("carries the category score + the inventory", () => {
    const r = buildAuditReport(
      makeReport({ untested: 3, commands: 2, mcp: true }),
      { harness: "codex", vigilesVersion: "1.0.0" },
    );
    expect(r.score.categories.length).toBe(5);
    expect(typeof r.score.overall).toBe("number");
    expect(r.inventory).toEqual({
      skills: 0,
      agents: 0,
      hooks: 0,
      commands: 2,
      mcp: true,
      untested: 3,
    });
  });

  it("includes the deterministic recommendations (a typo'd tool → a fix)", () => {
    const report = makeReport({
      agents: [
        {
          name: "rev",
          tools: ["Reed"],
          toolIssues: [{ tool: "Reed", suggestion: "Read" }],
          mcpToolIssues: [],
          disallowedToolIssues: [],
        },
      ] as unknown as ScanReport["agents"],
    });
    const r = buildAuditReport(report, {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.recommendations[0].surface).toBe("rev");
  });

  it("is JSON-serializable round-trip (it IS the wire format)", () => {
    const r = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("Safety is folded in when a battery summary is supplied", () => {
    const withBattery = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
      battery: { totalBlocked: 7, totalRun: 7, hooksSkipped: 0 },
    });
    const safety = withBattery.score.categories.find((c) => c.key === "Safety");
    expect(safety?.score).toBe(100);
  });
});
