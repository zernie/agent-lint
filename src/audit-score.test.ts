/**
 * Category-scoring suite (vitest): pure over a hand-built ScanReport (no fs/model)
 * — each finding buckets into the right deterministic category, the overall
 * excludes n/a categories, an empty machine is empty (but an instruction-only
 * repo is NOT), and the formatter renders rings + the overall. The five rings are
 * all deterministic; Safety is an ADVISORY (not-graded) ring fed by the STATIC
 * lethal-trifecta check — it SHOWS trifecta units but never scores them into the
 * overall (a capability pattern isn't a demonstrated vuln).
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
    descriptionBudgetIssues: [],
    trifectaFindings: [],
    skillResourceIssues: [],
    skillFenceIssues: [],
    pluginLayoutIssues: [],
    delegationTrifecta: [],
    hookBlockFindings: [],
    hookMatcherFindings: [],
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
    // No tool-bearing surface (no agents, no model-invocable skills) → Safety n/a.
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
  });

  it("has five deterministic rings — Safety fed by the static lethal-trifecta check", () => {
    const keys = auditScore(makeReport()).categories.map((c) => c.key);
    expect(keys).toEqual([
      "Truthfulness",
      "Triggering",
      "Structure",
      "Safety",
      "Tested",
    ]);
  });

  it("buckets a dangling ref into Truthfulness; overall is the summed score", () => {
    const s = auditScore(makeReport({ danglingRefs: ["hooks/missing.sh"] }));
    expect(cat(s, "Truthfulness")?.score).toBe(92); // -8, ring
    expect(cat(s, "Structure")?.score).toBe(100);
    // headline = 100 - Σ penalties = 92 (NOT the average of the rings), so the
    // single dangling ref shows up undiluted in the overall.
    expect(s.overall).toBe(92);
  });

  it("buckets a description overlap + no-description into Triggering; overall summed", () => {
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
    // -10 (no-desc) -8 (overlap) = 82, in the ring AND the headline overall.
    expect(cat(s, "Triggering")?.score).toBe(82);
    expect(cat(s, "Triggering")?.findings.length).toBe(2);
    expect(s.overall).toBe(82);
  });

  it("the headline overall is SUMMED across categories, not the ring average", () => {
    // A plugin whose only issues are in Structure (six agents each referencing a
    // tool that doesn't exist, −8 apiece = −48) shows Structure 52 in the breakdown
    // AND overall 52 — averaging the four rings would dilute that to ~88 and hide
    // the real broken-contract problem.
    const agent = {
      name: "a",
      path: "p",
      tools: ["Ghost"],
      toolIssues: [{ tool: "Ghost", suggestion: "Glob" }],
      mcpToolIssues: [],
      disallowedToolIssues: [],
      purity: "unrestricted" as const,
      effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
    };
    const s = auditScore(
      makeReport({
        agents: Array.from(
          { length: 6 },
          () => agent,
        ) as unknown as ScanReport["agents"],
      }),
    );
    expect(cat(s, "Structure")?.score).toBe(52); // -6*8
    expect(cat(s, "Truthfulness")?.score).toBe(100);
    expect(cat(s, "Triggering")?.score).toBe(100);
    expect(s.overall).toBe(52); // summed, NOT averaged to ~88
    expect(s.grade).toBe("F");
  });

  it("inherit-all (no tool contract) is ADVISORY — shown on Structure, never graded", () => {
    // Decision (2026-06-28): omitting the `tools:` line is a near-universal,
    // legitimate authoring style (an OSS sweep of 122 real plugins found 109 whose
    // ONLY finding was this), so it must not drag the grade — a least-privilege
    // NUDGE, not breakage. See reportDeductions / scoreReport for the rationale.
    const agent = {
      name: "a",
      path: "p",
      tools: null,
      toolIssues: [],
      mcpToolIssues: [],
      disallowedToolIssues: [],
      purity: "unrestricted" as const,
      effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
    };
    const s = auditScore(
      makeReport({
        agents: Array.from(
          { length: 6 },
          () => agent,
        ) as unknown as ScanReport["agents"],
      }),
    );
    // Structure stays clean (not graded) but the note is still surfaced.
    expect(cat(s, "Structure")?.score).toBe(100);
    expect(
      cat(s, "Structure")?.findings.some(
        (f) => f.includes("inherit all tools") && f.includes("advisory"),
      ),
    ).toBe(true);
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
  });

  it("untested surfaces are ADVISORY — shown on Tested, but never drag the grade", () => {
    const s = auditScore(makeReport({ untested: 3 }));
    expect(cat(s, "Tested")?.score).toBe(91); // -9, shown
    expect(cat(s, "Tested")?.advisory).toBe(true);
    expect(cat(s, "Structure")?.score).toBe(100);
    // the overall ignores the advisory Tested ring — a clean-but-untested repo is A
    expect(s.overall).toBe(100);
    expect(s.grade).toBe("A");
  });

  it("Safety is an advisory (not-graded) ring — never a false 100 — when a surface has no trifecta", () => {
    const s = auditScore(
      makeReport({
        agents: [
          {
            name: "a",
            path: "p",
            tools: ["Read"],
            toolIssues: [],
            mcpToolIssues: [],
            disallowedToolIssues: [],
            trifecta: null,
          },
        ] as unknown as ScanReport["agents"],
      }),
    );
    // Advisory, not graded — score is n/a (null), not a false 100 that would imply
    // "verified safe". A clean-but-trifecta-free repo still scores 100 overall.
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(cat(s, "Safety")?.advisory).toBe(true);
    expect(cat(s, "Safety")?.findings).toEqual([]);
    expect(s.overall).toBe(100);
  });

  it("a HARD trifecta finding is SHOWN on Safety but NOT graded (advisory) — overall unchanged", () => {
    const s = auditScore(
      makeReport({
        agents: [
          {
            name: "exfil-bot",
            path: "agents/exfil-bot.md",
            tools: ["Bash", "WebFetch"],
            toolIssues: [],
            mcpToolIssues: [],
            disallowedToolIssues: [],
            trifecta: { severity: "hard" },
          },
        ] as unknown as ScanReport["agents"],
        trifectaFindings: [
          {
            path: "agents/exfil-bot.md",
            kind: "subagent",
            name: "exfil-bot",
            finding: { severity: "hard" },
          },
        ] as unknown as ScanReport["trifectaFindings"],
      }),
    );
    // The unit is SHOWN (a heads-up), the ring is advisory/not-graded (score n/a),
    // and the overall is NOT dropped — a capability pattern isn't a demonstrated vuln.
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(cat(s, "Safety")?.advisory).toBe(true);
    expect(cat(s, "Safety")?.findings.length).toBe(1);
    expect(
      cat(s, "Safety")?.findings.some(
        (f) =>
          f.includes("exfil-bot") && f.includes("three lethal-trifecta legs"),
      ),
    ).toBe(true);
    expect(s.overall).toBe(100); // NOT graded down
    expect(s.grade).toBe("A");
  });

  it("an ADVISORY (inherits-all) trifecta is SHOWN on Safety but NOT graded", () => {
    const s = auditScore(
      makeReport({
        agents: [
          {
            name: "broad",
            path: "agents/broad.md",
            tools: null, // inherits all
            toolIssues: [],
            mcpToolIssues: [],
            disallowedToolIssues: [],
            trifecta: { severity: "advisory" },
          },
        ] as unknown as ScanReport["agents"],
        trifectaFindings: [
          {
            path: "agents/broad.md",
            kind: "subagent",
            name: "broad",
            finding: { severity: "advisory" },
          },
        ] as unknown as ScanReport["trifectaFindings"],
      }),
    );
    expect(cat(s, "Safety")?.score).toBeNull(); // advisory ring, not graded
    expect(cat(s, "Safety")?.advisory).toBe(true);
    expect(
      cat(s, "Safety")?.findings.some(
        (f) => f.includes("inherits all tools") && f.includes("advisory"),
      ),
    ).toBe(true);
    expect(s.overall).toBe(100);
  });

  it("Safety is n/a (no assessable surface) when there's no agent / model-invocable skill", () => {
    // A user-invoked skill carries no model-driven trifecta risk → not assessable.
    const s = auditScore(
      makeReport({
        skills: [
          {
            name: "u",
            hasDescription: true,
            userInvoked: true,
            trifecta: null,
          },
        ] as unknown as ScanReport["skills"],
      }),
    );
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(cat(s, "Safety")?.advisory).toBe(true);
    expect(cat(s, "Safety")?.findings).toEqual([
      "no tool-bearing surface to assess",
    ]);
  });

  it("a model-invocable skill IS an assessable Safety surface (advisory, clean → no findings)", () => {
    const s = auditScore(
      makeReport({
        skills: [
          {
            name: "m",
            hasDescription: true,
            userInvoked: false,
            trifecta: null,
          },
        ] as unknown as ScanReport["skills"],
      }),
    );
    expect(cat(s, "Safety")?.score).toBeNull();
    expect(cat(s, "Safety")?.advisory).toBe(true);
    expect(cat(s, "Safety")?.findings).toEqual([]);
  });

  it("an empty machine (no surface, no instructions) is empty — overall 0, all n/a", () => {
    const s = auditScore(makeReport({ commands: 0, mcp: false }));
    expect(s.empty).toBe(true);
    expect(s.overall).toBe(0);
    expect(s.categories.every((c) => c.score === null)).toBe(true);
    // Safety is included in the empty-machine null list (5 categories, all n/a).
    expect(s.categories.map((c) => c.key)).toContain("Safety");
    expect(s.categories.length).toBe(5);
  });

  it("an inline-hook-only harness is NOT empty (inline hooks are a real surface)", () => {
    // A harness that defines only inline hook commands (no script file, no skills
    // /agents/commands/mcp) has a real loadable hook surface — it must score, not
    // be graded F/0. Regression: `inlineHooks` was excluded from the surface count.
    const s = auditScore(
      makeReport({ commands: 0, mcp: false, inlineHooks: 2 }),
    );
    expect(s.empty).toBe(false);
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
    expect(out).toMatch(/Safety/); // Safety IS a ring (static lethal-trifecta)
    expect(out).toMatch(/Harness health: A \(100\/100\)/);
  });
});
