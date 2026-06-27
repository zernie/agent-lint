/**
 * HTML-report suite (vitest, no browser): renderAuditHtml is pure — it emits a
 * self-contained document with the overall + category rings, the fix cards, the
 * inventory, and it ESCAPES untrusted text (a finding/fix from a scanned plugin).
 */
import { describe, it, expect } from "vitest";
import { renderAuditHtml, type AuditHtmlInput } from "./audit-html.js";
import type { AuditScore } from "./audit-score.js";
import type { Recommendation } from "./optimize.js";

const score: AuditScore = {
  overall: 81,
  grade: "B",
  empty: false,
  categories: [
    { key: "Truthfulness", score: 100, weight: 1, findings: [] },
    { key: "Safety", score: 0, weight: 1, findings: ["7/7 disaster(s) slip"] },
    { key: "Triggering", score: 100, weight: 1, findings: [] },
    { key: "Structure", score: 92, weight: 1, findings: ["1 dead tool"] },
    { key: "Tested", score: null, weight: 1, findings: ["n/a"] },
  ],
};

const recs: Recommendation[] = [
  {
    surface: "rev",
    action: "fix",
    rationale: "the subagent loses a declared tool",
    fix: 'change the tool "Reed" to "Read"',
    detector: "subagent-tool-contract",
    confidence: "likely",
  },
];

const base: AuditHtmlInput = {
  dir: "/x/demo",
  harness: "claude-code",
  score,
  recommendations: recs,
  inventory: {
    skills: 2,
    agents: 1,
    hooks: 0,
    commands: 0,
    mcp: false,
    untested: 1,
  },
};

describe("renderAuditHtml", () => {
  it("is a self-contained document with the overall + grade", () => {
    const html = renderAuditHtml(base);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<style>"); // inline CSS, zero deps
    expect(html).toContain("Harness health:");
    expect(html).toContain("81/100");
    expect(html).toContain("claude-code");
  });

  it("renders every category name + an SVG ring per category", () => {
    const html = renderAuditHtml(base);
    for (const c of score.categories) expect(html).toContain(c.key);
    // overall + 5 categories = 6 rings.
    expect(html.match(/<svg /g)?.length).toBe(6);
    expect(html).toContain("n/a"); // the Tested category is n/a
  });

  it("renders a fix card with surface, detector, and the one-line fix", () => {
    const html = renderAuditHtml(base);
    expect(html).toContain("rev");
    expect(html).toContain("subagent-tool-contract");
    expect(html).toContain("Read");
  });

  it("escapes untrusted text from findings/fixes (no raw injection)", () => {
    const html = renderAuditHtml({
      ...base,
      recommendations: [{ ...recs[0], fix: 'use <script>alert("x")</script>' }],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("an empty machine still renders (overall 0, grey ring)", () => {
    const html = renderAuditHtml({
      ...base,
      score: { ...score, overall: 0, grade: "F", empty: true },
    });
    expect(html).toContain("0/100");
  });
});
