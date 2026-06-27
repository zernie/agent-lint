/**
 * Category-scoring suite (vitest): pure over a hand-built ScanReport (no fs/model)
 * — each finding buckets into the right category, Safety reads the battery (n/a
 * without one), the overall excludes n/a categories, an empty machine is empty,
 * and the formatter renders rings + the overall.
 */
import { describe, it, expect } from "vitest";
import {
  auditScore,
  formatAuditScore,
  type BatterySummary,
} from "./audit-score.js";
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
  it("a clean report scores 100 on every assessable category (Safety n/a, no hooks)", () => {
    const s = auditScore(makeReport());
    expect(cat(s, "Truthfulness")?.score).toBe(100);
    expect(cat(s, "Triggering")?.score).toBe(100);
    expect(cat(s, "Structure")?.score).toBe(100);
    expect(cat(s, "Tested")?.score).toBe(100);
    // Safety is n/a (no battery) → excluded from the overall.
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
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

  it("Safety reads the battery aggregate (blocked/total)", () => {
    const battery: BatterySummary = {
      totalBlocked: 5,
      totalRun: 7,
      hooksSkipped: 0,
    };
    const s = auditScore(makeReport(), battery);
    expect(cat(s, "Safety")?.score).toBe(Math.round((5 / 7) * 100)); // 71
    expect(cat(s, "Safety")?.findings[0]).toMatch(/2\/7 disaster/);
    // Now Safety IS assessable → folded into the overall.
    expect(s.overall).toBeLessThan(100);
  });

  it("a fully-blocking battery scores Safety 100", () => {
    const s = auditScore(makeReport(), {
      totalBlocked: 7,
      totalRun: 7,
      hooksSkipped: 0,
    });
    expect(cat(s, "Safety")?.score).toBe(100);
    expect(s.overall).toBe(100);
  });

  it("a battery where NO hook blocks anything is Safety n/a, not a false 0 (don't cry wolf)", () => {
    // A repo whose only PreToolUse hook isn't a Bash guard (e.g. it gates .md
    // edits) blocks 0/7 — that's not a broken safety guard, it's not one at all.
    const s = auditScore(makeReport(), {
      totalBlocked: 0,
      totalRun: 7,
      hooksSkipped: 0,
    });
    expect(cat(s, "Safety")?.score).toBeNull(); // n/a, NOT 0
    expect(cat(s, "Safety")?.findings[0]).toMatch(/Bash safety guard/);
    // n/a is excluded from the overall, so the grade isn't tanked.
    expect(s.overall).toBe(100);
  });

  it("untested surfaces only dent the Tested category", () => {
    const s = auditScore(makeReport({ untested: 3 }));
    expect(cat(s, "Tested")?.score).toBe(91); // -9
    expect(cat(s, "Structure")?.score).toBe(100);
  });

  it("an empty machine is empty — overall 0, every category n/a", () => {
    const s = auditScore(makeReport({ commands: 0, mcp: false }));
    expect(s.empty).toBe(true);
    expect(s.overall).toBe(0);
    expect(s.categories.every((c) => c.score === null)).toBe(true);
  });
});

describe("formatAuditScore", () => {
  it("renders each category ring + the weighted overall", () => {
    const out = formatAuditScore(auditScore(makeReport()));
    expect(out).toMatch(/Truthfulness/);
    expect(out).toMatch(/Safety/);
    expect(out).toMatch(/n\/a/); // Safety with no hooks
    expect(out).toMatch(/Harness health: A \(100\/100\)/);
  });
});
