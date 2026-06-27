/**
 * HTML-report suite (vitest, no browser). renderAuditHtmlSimple is the zero-dep
 * inline-CSS fallback — pure + deterministic, so it carries the substring asserts.
 * renderAuditHtml prefers the built React template but falls back to simple when
 * it's absent; both consume the versioned AuditReport and escape untrusted text.
 */
import { describe, it, expect } from "vitest";
import { renderAuditHtml, renderAuditHtmlSimple } from "./audit-html.js";
import type { AuditReport } from "./audit-report.js";

const base: AuditReport = {
  meta: {
    schemaVersion: 1,
    tool: "vigiles",
    vigilesVersion: "1.0.0",
    harness: "claude-code",
    dir: "/x/demo",
  },
  score: {
    overall: 81,
    grade: "B",
    empty: false,
    categories: [
      { key: "Truthfulness", score: 100, weight: 1, findings: [] },
      {
        key: "Safety",
        score: 0,
        weight: 1,
        findings: ["7/7 disaster(s) slip"],
      },
      { key: "Triggering", score: 100, weight: 1, findings: [] },
      { key: "Structure", score: 92, weight: 1, findings: ["1 dead tool"] },
      { key: "Tested", score: null, weight: 1, findings: ["n/a"] },
    ],
  },
  recommendations: [
    {
      surface: "rev",
      action: "fix",
      rationale: "the subagent loses a declared tool",
      fix: 'change the tool "Reed" to "Read"',
      detector: "subagent-tool-contract",
      confidence: "likely",
    },
  ],
  inventory: {
    skills: 2,
    agents: 1,
    hooks: 0,
    commands: 0,
    mcp: false,
    untested: 1,
  },
};

describe("renderAuditHtmlSimple", () => {
  it("is a self-contained document with the overall + grade", () => {
    const html = renderAuditHtmlSimple(base);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<style>");
    expect(html).toContain("Harness health:");
    expect(html).toContain("81/100");
    expect(html).toContain("claude-code");
  });

  it("renders every category + an SVG ring per category (overall + 5)", () => {
    const html = renderAuditHtmlSimple(base);
    for (const c of base.score.categories) expect(html).toContain(c.key);
    expect(html.match(/<svg /g)?.length).toBe(6);
    expect(html).toContain("n/a"); // the Tested category is n/a
  });

  it("renders a fix card with surface, detector, and the one-line fix", () => {
    const html = renderAuditHtmlSimple(base);
    expect(html).toContain("rev");
    expect(html).toContain("subagent-tool-contract");
    expect(html).toContain("Read");
  });

  it("escapes untrusted text from findings/fixes (no raw injection)", () => {
    const html = renderAuditHtmlSimple({
      ...base,
      recommendations: [
        { ...base.recommendations[0], fix: 'use <script>alert("x")</script>' },
      ],
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("an empty machine still renders (overall 0)", () => {
    const html = renderAuditHtmlSimple({
      ...base,
      score: { ...base.score, overall: 0, grade: "F", empty: true },
    });
    expect(html).toContain("0/100");
  });
});

describe("renderAuditHtml (template-or-fallback)", () => {
  it("--simple forces the inline fallback (identical to renderAuditHtmlSimple)", () => {
    expect(renderAuditHtml(base, { simple: true })).toBe(
      renderAuditHtmlSimple(base),
    );
  });

  it("produces a self-contained document either way (template or fallback)", () => {
    const html = renderAuditHtml(base);
    // Whichever path: a single HTML doc that embeds/renders the report data.
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html.length).toBeGreaterThan(500);
  });
});
