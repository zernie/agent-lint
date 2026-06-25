/**
 * scan trigger-suggestion tests — the pure decision that surfaces the real-model
 * `--trigger` tier (prompt a human, hint an agent, or stay silent) and the
 * scaffold for its prompts file.
 */
import { describe, it, expect } from "vitest";
import {
  hasModelAccess,
  decideTriggerSuggestion,
  formatTriggerHint,
  scaffoldTriggerPrompts,
} from "./scan-trigger-suggest.js";

describe("hasModelAccess", () => {
  it("true for a metered API key", () => {
    expect(hasModelAccess({ ANTHROPIC_API_KEY: "sk-x" })).toBe(true);
  });
  it("true inside an authenticated Claude Code session (no key)", () => {
    expect(hasModelAccess({ CLAUDECODE: "1" })).toBe(true);
    expect(hasModelAccess({ CLAUDE_CODE_ENTRYPOINT: "remote" })).toBe(true);
  });
  it("false with nothing set", () => {
    expect(hasModelAccess({})).toBe(false);
    expect(hasModelAccess({ CLAUDECODE: "0" })).toBe(false);
  });
});

describe("decideTriggerSuggestion", () => {
  const base = {
    modelAccess: true,
    isTTY: true,
    triggerableSkills: 2,
    json: false,
    noInteractive: false,
  };

  it("prompts a human at a TTY with model access + skills", () => {
    expect(decideTriggerSuggestion(base)).toBe("prompt");
  });
  it("hints (never prompts) an agent: non-TTY", () => {
    expect(decideTriggerSuggestion({ ...base, isTTY: false })).toBe("hint");
  });
  it("hints under explicit --no-interactive even at a TTY", () => {
    expect(decideTriggerSuggestion({ ...base, noInteractive: true })).toBe(
      "hint",
    );
  });
  it("stays silent for --json (machine output)", () => {
    expect(decideTriggerSuggestion({ ...base, json: true })).toBe("none");
  });
  it("stays silent with no model access", () => {
    expect(decideTriggerSuggestion({ ...base, modelAccess: false })).toBe(
      "none",
    );
  });
  it("stays silent with no triggerable skills", () => {
    expect(decideTriggerSuggestion({ ...base, triggerableSkills: 0 })).toBe(
      "none",
    );
  });
});

describe("formatTriggerHint", () => {
  it("names the count + the runnable command, pluralized", () => {
    const one = formatTriggerHint("./plugin", 1);
    expect(one).toContain("1 model-invocable skill ");
    expect(one).toContain("vigiles scan ./plugin --trigger --prompts=");
    expect(formatTriggerHint("./plugin", 3)).toContain(
      "3 model-invocable skills",
    );
  });
});

describe("scaffoldTriggerPrompts", () => {
  it("emits the real TriggerPromptSet shape (name → {prompts, irrelevant})", () => {
    const json = scaffoldTriggerPrompts(["alpha", "beta"]);
    const parsed = JSON.parse(json) as Record<
      string,
      { prompts: string[]; irrelevant: string[] }
    >;
    expect(Object.keys(parsed)).toEqual(["alpha", "beta"]);
    expect(Array.isArray(parsed.alpha.prompts)).toBe(true);
    expect(parsed.alpha.prompts.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.alpha.irrelevant)).toBe(true);
    // Each entry names its skill so the placeholders are self-documenting.
    expect(parsed.beta.prompts[0]).toContain("beta");
  });
});
