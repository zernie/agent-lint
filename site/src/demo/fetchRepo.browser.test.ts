import { describe, it, expect } from "vitest";
import {
  isHarnessPath,
  isHarnessMarker,
  collectReferencedPaths,
} from "./fetchRepo";

// Pure-helper guards for the two harness-detection bugs the PR review flagged.
// (These run under the browser-mode project like the rest of site/, but they touch
// no DOM — just the exported pure functions.)

describe("isHarnessPath — top-level surfaces only", () => {
  it("matches a top-level harness dir + root file", () => {
    expect(isHarnessPath("skills/x/SKILL.md")).toBe(true);
    expect(isHarnessPath("hooks/guard.sh")).toBe(true);
    expect(isHarnessPath(".claude/settings.json")).toBe(true);
    expect(isHarnessPath(".claude-plugin/plugin.json")).toBe(true);
    expect(isHarnessPath("CLAUDE.md")).toBe(true);
    expect(isHarnessPath(".mcp.json")).toBe(true);
  });

  it("does NOT match a harness word nested in an ordinary source tree", () => {
    // The bug: `src/hooks/useThing.ts` in a plain React app was treated as a
    // harness → graded an empty machine instead of the no-harness state.
    expect(isHarnessPath("src/hooks/useThing.ts")).toBe(false);
    expect(isHarnessPath("packages/app/skills/index.ts")).toBe(false);
    expect(isHarnessPath("app/commands/run.ts")).toBe(false);
    expect(isHarnessPath("README.md")).toBe(false);
    expect(isHarnessPath("src/agents.ts")).toBe(false);
  });
});

describe("isHarnessMarker — a definitive Claude harness signal", () => {
  it("accepts real markers", () => {
    expect(isHarnessMarker("CLAUDE.md")).toBe(true);
    expect(isHarnessMarker(".mcp.json")).toBe(true);
    expect(isHarnessMarker(".claude/settings.json")).toBe(true);
    expect(isHarnessMarker(".claude-plugin/plugin.json")).toBe(true);
    expect(isHarnessMarker("hooks/hooks.json")).toBe(true);
    expect(isHarnessMarker("skills/deploy/SKILL.md")).toBe(true);
    expect(isHarnessMarker("agents/reviewer.md")).toBe(true);
    expect(isHarnessMarker("commands/ship.md")).toBe(true);
  });

  it("rejects an undeclared top-level hooks/ (git hooks) + ordinary files", () => {
    // The bug: a repo with `hooks/pre-commit.sh` and no Claude declaration was
    // graded instead of shown the no-harness state.
    expect(isHarnessMarker("hooks/pre-commit.sh")).toBe(false);
    expect(isHarnessMarker("hooks/lint.js")).toBe(false);
    expect(isHarnessMarker("skills/README.md")).toBe(false);
    expect(isHarnessMarker("README.md")).toBe(false);
    expect(isHarnessMarker("src/index.js")).toBe(false);
  });
});

describe("collectReferencedPaths — hook scripts outside harness dirs", () => {
  it("catches plugin-root / project-dir token refs (braced + unbraced)", () => {
    const refs = collectReferencedPaths({
      "CLAUDE.md": "run ${CLAUDE_PLUGIN_ROOT}/scripts/guard.sh then done",
      ".claude/settings.json": '"command": "$CLAUDE_PROJECT_DIR/bin/check.py"',
    });
    expect(refs.has("scripts/guard.sh")).toBe(true);
    expect(refs.has("bin/check.py")).toBe(true);
  });

  it("catches RELATIVE dir-qualified script refs (the P1 follow-up)", () => {
    const refs = collectReferencedPaths({
      ".claude/settings.json": '{ "command": "bash scripts/guard.sh" }',
      "hooks/hooks.json": '"command": "./bin/lint.mjs --fix"',
    });
    expect(refs.has("scripts/guard.sh")).toBe(true);
    expect(refs.has("bin/lint.mjs")).toBe(true);
  });

  it("ignores prose and non-script paths", () => {
    const refs = collectReferencedPaths({
      "CLAUDE.md": "See docs/guide.md and the src/ folder for details.",
    });
    expect(refs.size).toBe(0);
  });
});
