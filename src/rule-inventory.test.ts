import { describe, it, expect } from "vitest";
import { buildRuleInventory } from "./rule-inventory.js";

describe("buildRuleInventory", () => {
  it("does NOT fire on prose that merely contains bare keywords (the FP guard)", () => {
    // Real-world prose that tripped the raw matcher 107× — token/secret/await/!/
    // console/silently — but contains no rule-name/code-token.
    const prose = [
      "The token-savings article debunks the 65% claim.",
      "Keep the secret safe; the password rotation is manual.",
      "We await the deploy; failures fail silently and the barrel of aria labels grows!",
      "Complexity of the prefix logic is high; the console shows progress.",
    ].join("\n");
    expect(buildRuleInventory(prose, "")).toEqual([]);
  });

  it("does NOT match a rule-name embedded in a longer token", () => {
    // `no-console-x` / `xno-console` must not trip `no-console`.
    const text = "See `no-console-x` and the file `xno-console.md`.";
    expect(buildRuleInventory(text, "")).toEqual([]);
  });

  it("matches rule-name / code-token intents and reports them not-in-config", () => {
    const text =
      "Never use `console.log`. Enforce `no-explicit-any`. Ban `eslint-disable`.";
    const items = buildRuleInventory(text, "");
    const rules = items.map((i) => i.rule).sort();
    expect(rules).toEqual([
      "@typescript-eslint/no-explicit-any",
      "eslint-comments/no-use",
      "no-console",
    ]);
    expect(items.every((i) => i.configState === "not-in-config")).toBe(true);
    expect(items.find((i) => i.rule === "no-console")?.configFix).toContain(
      "no-console",
    );
  });

  it("marks a rule as in-config when its name appears in the config text", () => {
    const text = "No `console.log` in shipped code.";
    const config = 'export default [{ rules: { "no-console": "error" } }];';
    const items = buildRuleInventory(text, config);
    expect(items).toHaveLength(1);
    expect(items[0]?.configState).toBe("in-config");
  });

  it("matches an intent whose keyword contains regex metacharacters (console.log)", () => {
    // `.` must be escaped: `consoleXlog` must NOT match `console.log`.
    expect(buildRuleInventory("call `consoleXlog()` here", "")).toEqual([]);
    expect(buildRuleInventory("no `console.log`", "")).toHaveLength(1);
  });

  it("returns empty for an instruction file with no enforceable rule mentions", () => {
    expect(
      buildRuleInventory("Prefer composition over inheritance. Be kind.", ""),
    ).toEqual([]);
  });

  it("tags each item with its linter", () => {
    const items = buildRuleInventory("no `console.log`", "");
    expect(items).toHaveLength(1);
    expect(items[0]?.linter).toBe("eslint");
  });

  it("honours the linters filter (ESLint intents suppressed for a non-eslint repo)", () => {
    const text = "no `console.log`";
    expect(buildRuleInventory(text, "", { linters: ["eslint"] })).toHaveLength(
      1,
    );
    expect(buildRuleInventory(text, "", { linters: ["ruff"] })).toEqual([]);
  });

  it("treats base and @typescript-eslint/ variants as the same rule in config", () => {
    const items = buildRuleInventory(
      "enforce `no-unused-vars`",
      'rules: { "@typescript-eslint/no-unused-vars": "error" }',
    );
    expect(items[0]?.configState).toBe("in-config");
  });

  it("marks a preset-enabled rule 'preset-maybe' (no false 'unenforced' alarm)", () => {
    const items = buildRuleInventory(
      "ban `no-explicit-any`",
      'extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"]',
    );
    expect(items[0]?.configState).toBe("preset-maybe");
  });

  it("still flags a genuinely-absent non-preset rule as not-in-config", () => {
    const items = buildRuleInventory(
      "require `eqeqeq`",
      'extends: ["eslint:recommended"]',
    );
    expect(items[0]?.configState).toBe("not-in-config");
  });
});
