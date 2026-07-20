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

function run(
  body: string,
  exists: (p: string) => boolean,
): SkillResourceFinding[] {
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

  it("does NOT flag illustrative inline bundle paths on a teaching skill (cry-wolf regression)", () => {
    // The prose patterns from the official `skill-development` skill: bundle
    // paths mentioned as EXAMPLES of what a skill could ship, not files it uses.
    // None of these carry a use-directive, and most carry an illustrative cue —
    // flagging them graded a clean skill an F. All must stay silent.
    const body = [
      "2. A `scripts/rotate_pdf.py` script would be helpful to store in the skill",
      "2. A `references/schema.md` file documenting the table schemas would be helpful",
      "**Example**: `scripts/rotate_pdf.py` for PDF rotation tasks",
      "**Examples**: `references/finance.md` for financial schemas, `references/mnda.md` for the NDA template",
      "**Examples**: `assets/logo.png` for brand assets, `assets/slides.pptx`, `assets/font.ttf` for typography",
      "- Detailed patterns → `references/patterns.md`",
      "- **`references/patterns.md`** - Common patterns",
      "`references/patterns.md` for detailed hook patterns to avoid bloating SKILL.md",
    ].join("\n");
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips an inline bundle path with a use-directive but an illustrative cue", () => {
    // Even WITH a use-directive, an explicit illustrative cue means the path is
    // a demonstration, not a real reference — the negative gate wins.
    const body = "For example, run `scripts/demo.sh` to see how it works.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips an inline bundle path with no use-directive (bare mention)", () => {
    // A path stated as a fact with no imperative to act on it is undecidable
    // prose — biased toward precision, we don't flag it.
    const body = "The schema lives at `references/schema.md` in the repo.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("STILL flags a missing inline bundle path the skill is told to use (true positive)", () => {
    // The genuine dead-ref: an imperative directing the agent at a missing file.
    const body =
      "First read `references/setup.md`, then run `scripts/install.sh`.";
    const found = run(body, existsOnly());
    expect(found.map((f) => f.resolved).sort()).toEqual([
      "references/setup.md",
      "scripts/install.sh",
    ]);
  });

  it("STILL flags a missing bundled resource behind a markdown link (unchanged)", () => {
    // Markdown links are a high-confidence reference regardless of prose — a
    // link to a missing bundled file always fires (the direction we must keep).
    const body = "For example, see [the schema](references/schema.md).";
    const found = run(body, existsOnly());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      resolved: "references/schema.md",
      kind: "link",
    });
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

  it("skips a glob pattern (not a concrete file) — P1-3", () => {
    // `references/*.md` is a directory convention, not a literal path. Both the
    // inline-span and markdown-link forms must be skipped, never "missing".
    const body = [
      "All refs live under `references/*.md`.",
      "See [the cards](references/*.md) for the list.",
    ].join("\n");
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips angle-bracket + brace template placeholders — P1-3", () => {
    const body = [
      "Each linter has `references/linter-cards/{trivial,contextual}/<linter>.md`.",
      "Tests live at `scripts/tests/test_assert_<target>_x.py`.",
    ].join("\n");
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("skips a `~/`-rooted home/global ref (external to the repo) — P1-5", () => {
    const body =
      "Route via [docs](~/.claude/docs/foo.md) and `~/.claude/rules/bar.md`.";
    expect(run(body, existsOnly())).toEqual([]);
  });

  it("checks a bundled ref with a ?query suffix (not skipped as a glob) — P1-3", () => {
    // `references/schema.json?raw=1` is a real bundled file with a query suffix;
    // the `?` must NOT trigger the glob-skip — the file is still resolved/flagged.
    const body = "See [schema](references/schema.json?raw=1) for the shape.";
    // missing under the skill dir → flagged (resolves to the stripped path)
    const flagged = run(body, existsOnly());
    expect(flagged).toHaveLength(1);
    expect(flagged[0].resolved).toBe("references/schema.json");
    // present → resolves, not flagged
    expect(run(body, existsOnly("references/schema.json"))).toEqual([]);
  });

  it("resolves a declared shared-dir ref against the repo root — P1-4 (opt-in)", () => {
    // `scripts/promptfoo/x.py` lives at the REPO ROOT, not beside the SKILL.md —
    // the shared-tree shape. Only when `scripts` is a DECLARED shared dir does it
    // resolve against the repo root; without that opt-in it's still "missing".
    const REPO_ROOT = "/plugin";
    const body = "Run `scripts/promptfoo/baseline_leak_scan.py` to check.";
    const existsAtRepoRoot = (p: string): boolean =>
      p === resolve(REPO_ROOT, "scripts/promptfoo/baseline_leak_scan.py");
    // default (no sharedDirs) → unchanged, flagged missing
    expect(run(body, existsAtRepoRoot)).toHaveLength(1);
    // opt-in: `scripts` declared shared → resolves against repo root, not flagged
    expect(
      skillResourceIssues(body, SKILL_DIR, {
        existsSync: existsAtRepoRoot,
        repoRoot: REPO_ROOT,
        sharedDirs: ["scripts", "references"],
      }),
    ).toEqual([]);
  });

  it("does NOT mask a ref outside a declared shared dir — P1-4 safety", () => {
    // Even with `scripts` shared, a ref under a DIFFERENT top dir (`references/`)
    // that only exists at the repo root stays flagged — the opt-in can't silently
    // suppress a genuinely-missing bundled resource outside the declared dirs.
    const REPO_ROOT = "/plugin";
    const body = "See `references/api.md`.";
    const existsAtRepoRoot = (p: string): boolean =>
      p === resolve(REPO_ROOT, "references/api.md");
    expect(
      skillResourceIssues(body, SKILL_DIR, {
        existsSync: existsAtRepoRoot,
        repoRoot: REPO_ROOT,
        sharedDirs: ["scripts"], // references NOT declared shared
      }),
    ).toHaveLength(1);
  });
});
