/**
 * Skill bundled-resource resolution detector suite (vitest): a SKILL.md body's
 * local file references resolve, with the FP-safe skip list (URLs, absolute
 * paths, `../` escapes, bare words, `$VAR` tokens) deliberately not flagged.
 * IO is an injected fake existsSync — no real filesystem.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

import {
  skillResourceIssues,
  type SkillResourceFinding,
} from "./skill-resources.js";

const SKILL_DIR = "/plugin/skills/my-skill";

/** A fake existsSync that returns true only for the given relative paths. */
function existsOnly(...present: string[]): (p: string) => boolean {
  const set = new Set(present.map((rel) => resolve(SKILL_DIR, rel)));
  return (p) => set.has(p);
}

function run(body: string, exists: (p: string) => boolean): SkillResourceFinding[] {
  return skillResourceIssues(body, SKILL_DIR, { existsSync: exists });
}

describe("skillResourceIssues", () => {
  it("does not flag a markdown link to an existing scripts/ file", () => {
    const body = "See [the runner](scripts/run.sh) for setup.";
    expect(run(body, existsOnly("scripts/run.sh"))).toEqual([]);
  });

  it("flags a markdown link to a missing references/ file", () => {
    const body = "Read [the API](references/api.md) before editing.";
    const found = run(body, existsOnly()); // nothing exists
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      ref: "references/api.md",
      resolved: "references/api.md",
      kind: "link",
      line: 1,
    });
  });

  it("resolves a ./-prefixed relative link", () => {
    const body = "Run [setup](./scripts/setup.py).";
    expect(run(body, existsOnly("scripts/setup.py"))).toEqual([]);
    expect(run(body, existsOnly())).toHaveLength(1);
  });

  it("skips a URL link", () => {
    const body =
      "See [the docs](https://example.com/api.md) and [http](http://x.io/y.sh).";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips an absolute path link", () => {
    const body = "Load [config](/etc/vigiles/config.json).";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips a ../ escape out of the skill dir", () => {
    const body =
      "See [sibling](../other-skill/scripts/run.sh) and [up](../shared.md).";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips a bare anchor / fragment-only link", () => {
    const body = "Jump to [section](#usage).";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("flags an inline `scripts/x.sh` mention that is missing", () => {
    const body = "First run `scripts/setup.sh` to install deps.";
    const found = run(body, existsOnly());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      ref: "scripts/setup.sh",
      kind: "path",
      line: 1,
    });
  });

  it("does not flag an existing inline bundle path", () => {
    const body = "Run `assets/template.json` through the generator.";
    expect(run(body, existsOnly("assets/template.json"))).toEqual([]);
  });

  it("skips a bare word inline mention (no extension, no bundle prefix)", () => {
    const body = "Use the `runHook` helper and the `scripts` directory.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips a generic inline path with no bundle-dir prefix", () => {
    // `src/foo.ts` is an API/prose mention, not a standard bundled resource.
    const body = "The logic lives in `src/foo.ts` and `config.json`.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips a ${VAR}/$VAR token", () => {
    const body =
      "Run [hook](${CLAUDE_PLUGIN_ROOT}/scripts/x.sh) or `$HOME/scripts/y.sh`.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips references inside fenced code blocks (illustrative examples)", () => {
    const body = [
      "Here is an example:",
      "```sh",
      "cat scripts/example.sh",
      "[link](references/sample.md)",
      "```",
      "End.",
    ].join("\n");
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("de-dupes the same missing file referenced multiple times", () => {
    const body = [
      "Run `scripts/run.sh` now.",
      "Later, re-run `scripts/run.sh`.",
    ].join("\n");
    expect(run(body, existsOnly())).toHaveLength(1);
  });

  it("reports multiple distinct missing resources with correct lines", () => {
    const body = [
      "Read [api](references/api.md).", // line 1 — missing
      "It exists: [ok](scripts/ok.sh).", // line 2 — present
      "Run `assets/seed.json`.", // line 3 — missing
    ].join("\n");
    const found = run(body, existsOnly("scripts/ok.sh"));
    expect(found.map((f) => f.resolved).sort()).toEqual([
      "assets/seed.json",
      "references/api.md",
    ]);
    expect(found.find((f) => f.resolved === "references/api.md")?.line).toBe(1);
    expect(found.find((f) => f.resolved === "assets/seed.json")?.line).toBe(3);
  });

  it("resolves a link target carrying a #fragment", () => {
    const body = "See [auth](references/api.md#auth).";
    expect(run(body, existsOnly("references/api.md"))).toEqual([]);
    expect(run(body, existsOnly())[0]?.resolved).toBe("references/api.md");
  });
});
