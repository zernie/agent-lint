/**
 * Dialect-drift suite: pure parser units + a GATED read-local freshness check
 * against the INSTALLED @anthropic-ai/claude-code. The gated checks ALARM (fail)
 * when CC's tool/event surface drifts from `claudeCodeDialect` — the deterministic
 * backstop for the hand-maintained catalog. They read the user's own install only
 * (ToS-clean; we never ship their types) and skip LOUDLY when CC isn't installed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACKNOWLEDGED_TOOL_INPUT_TYPES,
  parseToolInputTypes,
  eventsMissingFromBundle,
  findClaudeCodePackage,
  formatDialectDrift,
} from "./dialect-drift.js";
import { claudeCodeDialect } from "./adapters/claude-code/dialect.js";

describe("dialect-drift parsers (pure)", () => {
  it("parses tool-input interface names, sorted + de-duped", () => {
    const dts =
      "export interface BashInput {}\nexport interface AgentInput {}\nexport interface BashInput {}";
    expect(parseToolInputTypes(dts)).toEqual(["Agent", "Bash"]);
  });

  it("ignores non-Input interfaces and other declarations", () => {
    const dts =
      "export interface ToolAnnotations {}\nexport type Foo = string;\nexport interface GrepInput {}";
    expect(parseToolInputTypes(dts)).toEqual(["Grep"]);
  });

  it("flags events absent from a bundle (whole-word)", () => {
    const bundle = '...,"PreToolUse",... x.PostToolUseX ...';
    expect(
      eventsMissingFromBundle(bundle, ["PreToolUse", "PostToolUse"]),
    ).toEqual([
      "PostToolUse", // only appears inside PostToolUseX → not a whole word
    ]);
  });

  it("formatDialectDrift: null when no drift (or no report)", () => {
    expect(formatDialectDrift(null)).toBeNull();
    expect(
      formatDialectDrift({
        installedVersion: "2.1.99",
        validatedVersion: "2.1.42",
        newToolTypes: [],
        removedToolTypes: [],
      }),
    ).toBeNull(); // version differs but tool surface unchanged → no noise
  });

  it("formatDialectDrift: warns with added/removed tools + both versions", () => {
    const msg = formatDialectDrift({
      installedVersion: "2.2.0",
      validatedVersion: "2.1.42",
      newToolTypes: ["NewTool"],
      removedToolTypes: ["Bash"],
    });
    expect(msg).toMatch(/2\.1\.42/);
    expect(msg).toMatch(/2\.2\.0/);
    expect(msg).toMatch(/NewTool/);
    expect(msg).toMatch(/removed: Bash/);
  });
});

describe("dialect freshness vs the INSTALLED claude-code (read-local, ToS-clean)", () => {
  const pkg = findClaudeCodePackage();
  const gate = pkg ? it : it.skip;

  if (!pkg) {
    // Loud skip (no-silent-skips): the alarm only runs where CC is installed.
    it.skip("freshness checks skipped — @anthropic-ai/claude-code not installed", () => {
      /* gated above */
    });
  }

  gate(
    "sdk-tools.d.ts tool-input types still match ACKNOWLEDGED_TOOL_INPUT_TYPES",
    () => {
      if (!pkg) return; // narrows (gated)
      const dts = readFileSync(join(pkg, "sdk-tools.d.ts"), "utf-8");
      const installed = parseToolInputTypes(dts);
      expect(
        installed,
        "Claude Code's tool-input type set changed — re-check claudeCodeDialect.builtinAgentTools and update ACKNOWLEDGED_TOOL_INPUT_TYPES",
      ).toEqual([...ACKNOWLEDGED_TOOL_INPUT_TYPES].sort());
    },
  );

  gate("our hook events still exist in the installed cli.js", () => {
    if (!pkg) return; // narrows (gated)
    const bundle = readFileSync(join(pkg, "cli.js"), "utf-8");
    const missing = eventsMissingFromBundle(
      bundle,
      claudeCodeDialect.hookEvents,
    );
    expect(
      missing,
      "hook event(s) in claudeCodeDialect no longer appear in cli.js — renamed/removed in CC?",
    ).toEqual([]);
  });

  gate("reports the validated CC version (visibility, not asserted)", () => {
    if (!pkg) return; // narrows (gated)
    const { version } = JSON.parse(
      readFileSync(join(pkg, "package.json"), "utf-8"),
    ) as { version: string };
    // eslint-disable-next-line no-console
    console.log(
      `dialect-drift: validated against @anthropic-ai/claude-code ${version}`,
    );
    expect(typeof version).toBe("string");
  });
});
