/**
 * Category-scoring suite (vitest): pure over a hand-built ScanReport (no fs/model)
 * — each finding buckets into the right deterministic category, the overall
 * excludes n/a categories, an empty machine is empty (but an instruction-only
 * repo is NOT), and the formatter renders rings + the overall. The four rings are
 * all deterministic; Safety (the executing battery) is not an `audit` ring.
 */
import { describe, it, expect } from "vitest";
import { auditScore, formatAuditScore } from "./audit-score.js";
import type { ScanReport } from "./scan.js";

/** A clean, loaded report; override fields per test. */
function makeReport(over: Partial<ScanReport> = {}): ScanReport {
  return {
    dir: "/x",
    instructions: null,
    skills: [],
    agents: [],
    hooks: [],
    inlineHooks: 0,
    manualHookCount: 0,
    commands: 1, // a surface, so it's not the empty machine
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

const cat = (s: ReturnType<typeof auditScore>, key: string) =>
  s.categories.find((c) => c.key === key);

describe("auditScore", () => {
  it("a clean report scores 100 on every (deterministic) category", () => {
    const s = auditScore(makeReport());
    expect(cat(s, "Truthfulness")?.score).toBe(100);
    expect(cat(s, "Triggering")?.score).toBe(100);
    expect(cat(s, "Structure")?.score).toBe(100);
    expect(cat(s, "Tested")?.score).toBe(100);
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
  });

  it("has four deterministic rings — no Safety ring (the battery isn't an audit check)", () => {
    const keys = auditScore(makeReport()).categories.map((c) => c.key);
    expect(keys).toEqual(["Truthfulness", "Triggering", "Structure", "Tested"]);
  });

  it("buckets a dangling ref into Truthfulness", () => {
    const s = auditScore(makeReport({ danglingRefs: ["hooks/missing.sh"] }));
    expect(cat(s, "Truthfulness")?.score).toBe(92); // -8
    expect(cat(s, "Structure")?.score).toBe(100);
  });

  it("buckets a description overlap + no-description into Triggering", () => {
    const s = auditScore(
      makeReport({
        skills: [
          { name: "a", hasDescription: false, userInvoked: false },
        ] as unknown as ScanReport["skills"],
        descriptionOverlaps: [
          { a: "x", b: "y", ncd: 0.1 },
        ] as unknown as ScanReport["descriptionOverlaps"],
      }),
    );
    // -10 (no-desc) -8 (overlap) = 82
    expect(cat(s, "Triggering")?.score).toBe(82);
    expect(cat(s, "Triggering")?.findings.length).toBe(2);
  });

  it("untested surfaces only dent the Tested category", () => {
    const s = auditScore(makeReport({ untested: 3 }));
    expect(cat(s, "Tested")?.score).toBe(91); // -9
    expect(cat(s, "Structure")?.score).toBe(100);
  });

  it("an empty machine (no surface, no instructions) is empty — overall 0, all n/a", () => {
    const s = auditScore(makeReport({ commands: 0, mcp: false }));
    expect(s.empty).toBe(true);
    expect(s.overall).toBe(0);
    expect(s.categories.every((c) => c.score === null)).toBe(true);
  });

  it("an instruction-only repo is NOT empty (a CLAUDE.md is a loadable surface)", () => {
    // Just a top-level instruction file, no plugin surface — must still score,
    // not be graded F/0 "no loadable surface".
    const s = auditScore(
      makeReport({
        commands: 0,
        mcp: false,
        instructions: {
          file: "CLAUDE.md",
          managed: false,
        } as unknown as ScanReport["instructions"],
      }),
    );
    expect(s.empty).toBe(false);
    expect(s.overall).toBe(100); // nothing broken
  });
});

describe("formatAuditScore", () => {
  it("renders each category ring + the weighted overall", () => {
    const out = formatAuditScore(auditScore(makeReport()));
    expect(out).toMatch(/Truthfulness/);
    expect(out).toMatch(/Structure/);
    expect(out).not.toMatch(/Safety/); // no Safety ring
    expect(out).toMatch(/Harness health: A \(100\/100\)/);
  });
});
