/**
 * Skill-description-budget detector suite (vitest): fires on a bloated
 * description, stays quiet on a concise one, the default budget is generous, the
 * issue carries the real length, results are longest-first, and an empty set
 * yields nothing.
 */
import { describe, it, expect } from "vitest";
import {
  findDescriptionBudgetIssues,
  DEFAULT_DESCRIPTION_BUDGET,
} from "./skill-description-budget.js";

const long = (n: number): string => "x".repeat(n);

describe("findDescriptionBudgetIssues", () => {
  it("flags a description over the budget", () => {
    const issues = findDescriptionBudgetIssues([
      { name: "daily", description: long(700) },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].name).toBe("daily");
    expect(issues[0].length).toBe(700);
    expect(issues[0].budget).toBe(DEFAULT_DESCRIPTION_BUDGET);
    expect(issues[0].message).toMatch(/700-char/);
  });

  it("stays quiet on a concise description", () => {
    expect(
      findDescriptionBudgetIssues([
        { name: "ok", description: "Summarize the changes in this PR. Stop." },
      ]),
    ).toEqual([]);
  });

  it("has a generous default budget (a few sentences pass)", () => {
    expect(DEFAULT_DESCRIPTION_BUDGET).toBeGreaterThanOrEqual(300);
    const threeSentences =
      "Collect work evidence for the period. Filter personal from work and " +
      "dedupe. Render a short standup with attribution.";
    expect(
      findDescriptionBudgetIssues([{ name: "s", description: threeSentences }]),
    ).toEqual([]);
  });

  it("respects an explicit budget and sorts longest-first", () => {
    const issues = findDescriptionBudgetIssues(
      [
        { name: "a", description: long(120) },
        { name: "b", description: long(300) },
        { name: "c", description: long(90) },
      ],
      100,
    );
    expect(issues.map((i) => i.name)).toEqual(["b", "a"]);
  });

  it("counts characters, not UTF-16 code units, and handles empty input", () => {
    expect(findDescriptionBudgetIssues([])).toEqual([]);
    // 400 astral chars are 400 chars (not 800 code units) — under the 500 budget.
    expect(
      findDescriptionBudgetIssues([
        { name: "e", description: "😀".repeat(400) },
      ]),
    ).toEqual([]);
  });
});
