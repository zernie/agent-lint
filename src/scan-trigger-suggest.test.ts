/**
 * audit model-tier (trigger-rate) decision tests — the pure `decideMeasure` that
 * makes the model-gated measurement run-by-default-when-capable (Lighthouse:
 * run what you can, degrade loudly) instead of a buried opt-in, plus the loud
 * "not measured" notes and the prompts scaffold.
 */
import { describe, it, expect } from "vitest";
import {
  hasModelAccess,
  isMeteredAccess,
  decideMeasure,
  formatMeasureSkip,
  scaffoldTriggerPrompts,
  type MeasureEnv,
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

describe("isMeteredAccess", () => {
  it("metered iff a paid API key is set (subscription is not metered)", () => {
    expect(isMeteredAccess({ ANTHROPIC_API_KEY: "sk-x" })).toBe(true);
    expect(isMeteredAccess({ CLAUDECODE: "1" })).toBe(false);
    expect(isMeteredAccess({})).toBe(false);
  });
});

describe("decideMeasure", () => {
  // The default: an interactive human on a subscription with skills to measure.
  const base: MeasureEnv = {
    modelAccess: true,
    metered: false,
    isTTY: true,
    triggerableSkills: 2,
    json: false,
    forceMeasure: false,
    noMeasure: false,
    noInteractive: false,
  };

  it("ASKS (default-yes) an interactive human on a subscription — run-what-you-can", () => {
    expect(decideMeasure(base)).toEqual({ kind: "ask" });
  });

  it("RUNS without asking when a sticky yes is remembered", () => {
    expect(decideMeasure({ ...base, remembered: true })).toEqual({
      kind: "run",
    });
  });

  it("skips 'remembered-no' when a sticky no is remembered", () => {
    expect(decideMeasure({ ...base, remembered: false })).toEqual({
      kind: "skip",
      reason: "remembered-no",
    });
  });

  it("--measure FORCES a run, even non-interactive / under --json / metered", () => {
    expect(
      decideMeasure({
        ...base,
        forceMeasure: true,
        isTTY: false,
        json: true,
        metered: true,
        noInteractive: true,
      }),
    ).toEqual({ kind: "run" });
  });

  it("--measure with no model can't run → skip 'no-model'", () => {
    expect(
      decideMeasure({ ...base, forceMeasure: true, modelAccess: false }),
    ).toEqual({ kind: "skip", reason: "no-model" });
  });

  it("--fast forces it OFF (beats everything but no-skills)", () => {
    expect(decideMeasure({ ...base, noMeasure: true })).toEqual({
      kind: "skip",
      reason: "fast",
    });
  });

  it("no skills → skip 'no-skills' (nothing to measure)", () => {
    expect(decideMeasure({ ...base, triggerableSkills: 0 })).toEqual({
      kind: "skip",
      reason: "no-skills",
    });
  });

  it("no model → skip 'no-model'", () => {
    expect(decideMeasure({ ...base, modelAccess: false })).toEqual({
      kind: "skip",
      reason: "no-model",
    });
  });

  it("a metered API key is NEVER auto-run → skip 'metered' (--measure to force)", () => {
    expect(decideMeasure({ ...base, metered: true })).toEqual({
      kind: "skip",
      reason: "metered",
    });
  });

  it("--json (no --measure) → skip 'json' (machine output, never hang/spend)", () => {
    expect(decideMeasure({ ...base, json: true })).toEqual({
      kind: "skip",
      reason: "json",
    });
  });

  it("non-interactive (agent/CI) → skip 'non-interactive', never ask", () => {
    expect(decideMeasure({ ...base, isTTY: false })).toEqual({
      kind: "skip",
      reason: "non-interactive",
    });
    expect(decideMeasure({ ...base, noInteractive: true })).toEqual({
      kind: "skip",
      reason: "non-interactive",
    });
  });
});

describe("formatMeasureSkip", () => {
  it("no-skills / json → no note (not a gap / machine output)", () => {
    expect(formatMeasureSkip("no-skills", "./p", 2)).toBeNull();
    expect(formatMeasureSkip("json", "./p", 2)).toBeNull();
  });

  it("every printed note points at the --measure escape", () => {
    for (const reason of [
      "fast",
      "no-model",
      "metered",
      "remembered-no",
      "non-interactive",
    ] as const) {
      const note = formatMeasureSkip(reason, "./plugin", 3);
      expect(note).toContain("Triggering not measured");
    }
    expect(formatMeasureSkip("no-model", "./plugin", 3)).toContain(
      "vigiles audit ./plugin --measure",
    );
  });

  it("the non-interactive note pluralizes the skill count", () => {
    expect(formatMeasureSkip("non-interactive", "./p", 1)).toContain(
      "1 model-invocable skill ",
    );
    expect(formatMeasureSkip("non-interactive", "./p", 3)).toContain(
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
