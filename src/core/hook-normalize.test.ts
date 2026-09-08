/**
 * Hook-normalize suite (vitest): flattens the CC nested shape, reads the Codex flat shape, carries matcher null when absent, drops empty/non-string commands + non-object entries, returns [] for non-object/array/null (never throws); hookEventNames object-keys vs [] for an array
 */
import { describe, it, expect } from "vitest";
import { normalizeHooks, hookEventNames } from "./hook-normalize.js";

describe("normalizeHooks", () => {
  it("flattens the Claude Code nested shape", () => {
    const raw = {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ command: "guard.sh" }, { command: "audit.sh" }],
        },
      ],
    };
    expect(normalizeHooks(raw)).toEqual([
      {
        event: "PreToolUse",
        matcher: "Bash",
        command: "guard.sh",
        condition: null,
      },
      {
        event: "PreToolUse",
        matcher: "Bash",
        command: "audit.sh",
        condition: null,
      },
    ]);
  });

  it("reads the Codex flat shape (no `hooks` array → entry is the command holder)", () => {
    // Codex TOML `[[hooks.SessionStart]] command="setup.sh"` loads flat.
    const raw = { SessionStart: [{ command: "setup.sh" }] };
    expect(normalizeHooks(raw)).toEqual([
      {
        event: "SessionStart",
        matcher: null,
        command: "setup.sh",
        condition: null,
      },
    ]);
  });

  it("carries the matcher as null when the entry declares none", () => {
    const raw = { Stop: [{ hooks: [{ command: "x.sh" }] }] };
    expect(normalizeHooks(raw)).toEqual([
      { event: "Stop", matcher: null, command: "x.sh", condition: null },
    ]);
  });

  it("drops empty/non-string commands and non-object entries", () => {
    const raw = {
      PreToolUse: [
        { hooks: [{ command: "" }, { command: 42 }, { command: "ok.sh" }] },
        "garbage",
        { hooks: ["nope", { nope: true }] },
      ],
    };
    expect(normalizeHooks(raw)).toEqual([
      { event: "PreToolUse", matcher: null, command: "ok.sh", condition: null },
    ]);
  });

  it("returns [] for non-object / array / null input (never throws)", () => {
    expect(normalizeHooks(null)).toEqual([]);
    expect(normalizeHooks(undefined)).toEqual([]);
    expect(normalizeHooks([{ command: "x" }])).toEqual([]);
    expect(normalizeHooks("hooks")).toEqual([]);
    expect(normalizeHooks({ PreToolUse: "not-an-array" })).toEqual([]);
  });
});

describe("hookEventNames", () => {
  it("returns the object keys for the object-keyed shape", () => {
    expect(hookEventNames({ PreToolUse: [], SessionStart: [] }).sort()).toEqual(
      ["PreToolUse", "SessionStart"],
    );
  });

  it("returns [] for an array (a non-CC custom format we don't interpret)", () => {
    expect(hookEventNames([{ event: "tool-use" }])).toEqual([]);
    expect(hookEventNames(null)).toEqual([]);
  });
});
