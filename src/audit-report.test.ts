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
    expect(r.score.categories.length).toBe(4); // four deterministic rings
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

  it("omits `adoptable` when there are no un-spec'd surfaces", () => {
    const r = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
    });
    expect(r.adoptable).toBeUndefined();
    const r2 = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
      adoptableSurfaces: [],
    });
    expect(r2.adoptable).toBeUndefined();
  });

  it("carries adoptable surfaces + the create-all + per-surface commands", () => {
    const r = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
      adoptableSurfaces: ["skills/foo/SKILL.md", "agents/bar.md"],
    });
    expect(r.adoptable).toBeDefined();
    expect(r.adoptable?.createAllCommand).toBe("npx vigiles init");
    expect(r.adoptable?.surfaces).toEqual([
      {
        path: "skills/foo/SKILL.md",
        command: "npx vigiles init --target=skills/foo/SKILL.md",
      },
      {
        path: "agents/bar.md",
        command: "npx vigiles init --target=agents/bar.md",
      },
    ]);
  });

  it("is JSON-serializable round-trip (it IS the wire format)", () => {
    const r = buildAuditReport(makeReport(), {
      harness: "claude-code",
      vigilesVersion: "1.0.0",
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  // Contract pin — the report app (report/src/schema.ts) mirrors this shape by
  // hand and builds independently, so a field added/removed here without updating
  // the mirror would silently break the report. This pins the wire shape so the
  // change is CAUGHT; when it fails, update report/src/schema.ts too.
  it("pins the AuditReport wire shape (mirror report/src/schema.ts on change)", () => {
    const r = buildAuditReport(
      makeReport({
        agents: [
          {
            name: "a",
            tools: ["X"],
            toolIssues: [{ tool: "X", suggestion: "Y" }],
            mcpToolIssues: [],
            disallowedToolIssues: [],
          },
        ] as unknown as ScanReport["agents"],
      }),
      { harness: "claude-code", vigilesVersion: "1.0.0" },
    );
    expect(Object.keys(r).sort()).toEqual([
      "inventory",
      "meta",
      "recommendations",
      "score",
    ]);
    expect(Object.keys(r.meta).sort()).toEqual([
      "dir",
      "harness",
      "schemaVersion",
      "tool",
      "vigilesVersion",
    ]);
    expect(Object.keys(r.score).sort()).toEqual([
      "categories",
      "empty",
      "grade",
      "overall",
    ]);
    expect(Object.keys(r.score.categories[0]).sort()).toEqual([
      "findings",
      "key",
      "score",
      "weight",
    ]);
    expect(Object.keys(r.recommendations[0]).sort()).toEqual([
      "action",
      "confidence",
      "detector",
      "fix",
      "rationale",
      "surface",
    ]);
    expect(Object.keys(r.inventory).sort()).toEqual([
      "agents",
      "commands",
      "hooks",
      "mcp",
      "skills",
      "untested",
    ]);
  });
});
