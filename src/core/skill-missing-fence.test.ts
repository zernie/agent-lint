import { describe, expect, it } from "vitest";
import { skillMissingFence } from "./skill-missing-fence.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(...strs: string[]): string {
  return strs.join("\n");
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("skillMissingFence", () => {
  // ── True-positive cases ─────────────────────────────────────────────────

  it("flags a body that starts directly with name: (no fence)", () => {
    const body = lines("name: My Skill", "description: Does things.");
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("name");
    expect(result?.line).toBe(1);
    expect(result?.message).toContain("---");
    expect(result?.message).toContain("name:");
  });

  it("flags description: as the first known key", () => {
    const body = lines("description: A skill that helps.", "tools: Bash");
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("description");
    expect(result?.line).toBe(1);
  });

  it("flags allowed-tools: at column 0", () => {
    const body = "allowed-tools: Read, Write\n";
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("allowed-tools");
  });

  it("flags tools: at column 0", () => {
    const result = skillMissingFence("tools: Bash, Read\nbody here");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("tools");
  });

  it("flags model: at column 0", () => {
    const result = skillMissingFence("model: claude-opus-4-5\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("model");
  });

  it("flags color: at column 0", () => {
    const result = skillMissingFence("color: purple\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("color");
  });

  it("includes a human-readable fix in the message", () => {
    const result = skillMissingFence("name: Demo Skill\n");
    expect(result?.message).toMatch(/never fire/);
    expect(result?.message).toMatch(/---/);
  });

  // ── Leading blank lines / BOM / vigiles comment ──────────────────────────

  it("still flags when leading blank lines precede the unfenced key", () => {
    const body = lines("", "", "name: My Skill", "description: bar");
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("name");
    // The `name:` line is line 3 (1-based)
    expect(result?.line).toBe(3);
  });

  it("still flags after a leading UTF-8 BOM", () => {
    const body = "﻿name: BOM Skill\ndescription: yes";
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("name");
    expect(result?.line).toBe(1);
  });

  it("skips a leading vigiles integrity comment and flags the key below", () => {
    const body = lines(
      "<!-- vigiles:integrity sha256=abc123 -->",
      "name: Skill After Comment",
      "description: yes",
    );
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("name");
    // name: is on line 2
    expect(result?.line).toBe(2);
  });

  it("skips blank lines AND vigiles comment and finds the unfenced key", () => {
    const body = lines(
      "",
      "<!-- vigiles:integrity sha256=abc -->",
      "",
      "description: After blanks and comment",
    );
    const result = skillMissingFence(body);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("description");
    expect(result?.line).toBe(4);
  });

  // ── True-negative cases (no finding / null) ──────────────────────────────

  it("returns null for a properly ---fenced frontmatter block", () => {
    const body = lines(
      "---",
      "name: Properly Fenced",
      "description: This is fine.",
      "---",
      "",
      "## Instructions",
      "Do the thing.",
    );
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a normal markdown SKILL body starting with # heading", () => {
    const body = lines("# My Skill", "", "## Instructions", "Do things.");
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a body starting with prose (no heading, no colon)", () => {
    const body = lines(
      "This skill helps the agent do things efficiently.",
      "",
      "## Steps",
    );
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a body starting with a blockquote >", () => {
    const body = "> Note: this is a quoted line\nname: oops";
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a body starting with a markdown list -", () => {
    const body = "- First step\n- Second step\nname: oops";
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a body starting with a markdown list *", () => {
    const body = "* Item one\n* Item two";
    expect(skillMissingFence(body)).toBeNull();
  });

  // FP-safety: prose lines with a colon that are NOT in the known-key whitelist
  it("returns null for a prose line 'Usage: run the thing' (not a known key)", () => {
    const result = skillMissingFence("Usage: run the thing\nname: ignored");
    expect(result).toBeNull();
  });

  it("returns null for 'Note: something' (not a known key)", () => {
    expect(skillMissingFence("Note: something important")).toBeNull();
  });

  it("returns null for 'Author: Jane Doe' (not a known key)", () => {
    expect(skillMissingFence("Author: Jane Doe\nname: skill")).toBeNull();
  });

  it("returns null for 'Step: do this' (not a known key)", () => {
    expect(skillMissingFence("Step: do this")).toBeNull();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("returns null for an empty string", () => {
    expect(skillMissingFence("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(skillMissingFence("   \n\n\t\n")).toBeNull();
  });

  it("returns null for a body starting with a fenced code block", () => {
    const body = "```bash\nname: inside code block\n```";
    // First line starts with ` so PROSE_START_RE catches it
    expect(skillMissingFence(body)).toBeNull();
  });

  it("returns null for a body starting with an HTML comment (not vigiles)", () => {
    const body = "<!-- This is a regular comment -->\nname: test";
    // `<` triggers the prose guard
    expect(skillMissingFence(body)).toBeNull();
  });

  it("flags version: as a known key", () => {
    const result = skillMissingFence("version: 1.0.0\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("version");
  });

  it("flags disable-model-invocation: as a known key", () => {
    const result = skillMissingFence("disable-model-invocation: true\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("disable-model-invocation");
  });

  it("flags argument-hint: as a known key", () => {
    const result = skillMissingFence("argument-hint: <topic>\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("argument-hint");
  });

  it("flags metadata: as a known key", () => {
    const result = skillMissingFence("metadata:\n  foo: bar\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("metadata");
  });

  it("flags license: as a known key", () => {
    const result = skillMissingFence("license: MIT\n");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("license");
  });
});
