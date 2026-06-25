/**
 * Faithful adoption suite — the deterministic markdown → spec converter.
 *
 * The load-bearing claim is ROUND-TRIP fidelity: `compile(adopt(file)) ≈ file`.
 * So beyond the structural unit checks, the `round-trip` block adopts a file,
 * compiles the resulting spec via the REAL `compileClaude`, and asserts the
 * original content is reproduced with no compile errors.
 */
import { describe, it, expect } from "vitest";

import { adoptMarkdown, adoptToSpec } from "./adopt.js";
import { compileClaude } from "./compile.js";

/** Compile an adopted file the way `vigiles init` does, returning the markdown
 *  + errors. Pure (sections-only specs touch no linter/fs). */
function recompile(markdown: string, target = "CLAUDE.md") {
  const spec = adoptToSpec(markdown, target);
  return compileClaude(
    {
      _specType: "claude",
      target: spec.target,
      sections: spec.sections,
      maxSectionLines: spec.maxSectionLines,
      rules: {},
    },
    { specFile: `${target}.spec.ts` },
  );
}

describe("adoptToSpec — structure", () => {
  it("maps a clean h1 + ## file 1:1 to sections (structured tier)", () => {
    const md = `# CLAUDE.md

## Positioning

What this does.

## Commands

- \`npm test\` — run tests
`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    expect(spec.tier).toBe("structured");
    expect(Object.keys(spec.sections)).toEqual(["Positioning", "Commands"]);
    expect(spec.sections["Positioning"]).toBe("What this does.");
    // "Commands" is kept as a faithful prose section (verbatim), NOT routed to
    // the structured commands field — adoption never validates, just reproduces.
    expect(spec.sections["Commands"]).toBe("- `npm test` — run tests");
  });

  it("drops the title h1 (the compiler re-renders it from the filename)", () => {
    const spec = adoptToSpec(
      `# My Project Guide\n\n## A\n\nbody\n`,
      "CLAUDE.md",
    );
    // No "My Project Guide" / "CLAUDE.md" section — the h1 is consumed.
    expect(Object.keys(spec.sections)).toEqual(["A"]);
  });

  it("keeps ### subheadings INSIDE a section body (compiler allows them)", () => {
    const md = `# CLAUDE.md

## Rules

### No console

Use the logger.

### No any

Type it.
`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    expect(Object.keys(spec.sections)).toEqual(["Rules"]);
    expect(spec.sections["Rules"]).toContain("### No console");
    expect(spec.sections["Rules"]).toContain("### No any");
  });

  it("capitalizes a reserved lowercase heading key (no compile clash)", () => {
    const spec = adoptToSpec(`# CLAUDE.md\n\n## rules\n\nx\n`, "CLAUDE.md");
    expect(Object.keys(spec.sections)).toEqual(["Rules"]); // not the reserved "rules"
  });

  it("does NOT split on a ## inside a fenced code block", () => {
    const md = `# CLAUDE.md

## Shell

\`\`\`sh
## not a heading
echo hi
\`\`\`
`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    expect(Object.keys(spec.sections)).toEqual(["Shell"]);
    expect(spec.sections["Shell"]).toContain("## not a heading");
  });

  it("dedupes duplicate headings instead of dropping content", () => {
    const md = `# CLAUDE.md\n\n## Notes\n\nfirst\n\n## Notes\n\nsecond\n`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    expect(Object.keys(spec.sections)).toEqual(["Notes", "Notes (2)"]);
    expect(spec.sections["Notes"]).toBe("first");
    expect(spec.sections["Notes (2)"]).toBe("second");
  });

  it("wraps a heading-less file under a synthesized Overview (raw tier)", () => {
    const spec = adoptToSpec(`Just some prose.\n\nMore prose.\n`, "AGENTS.md");
    expect(spec.tier).toBe("raw");
    expect(Object.keys(spec.sections)).toEqual(["Overview"]);
    expect(spec.sections["Overview"]).toBe("Just some prose.\n\nMore prose.");
  });

  it("routes intro prose under the h1 into Overview (raw tier)", () => {
    const md = `# CLAUDE.md\n\nIntro paragraph.\n\n## Section\n\nbody\n`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    expect(spec.tier).toBe("raw");
    expect(Object.keys(spec.sections)).toEqual(["Overview", "Section"]);
    expect(spec.sections["Overview"]).toBe("Intro paragraph.");
  });

  it("does not drop intro text when a literal ## Overview already exists", () => {
    // Intro prose (→ synthesized Overview) PLUS a real `## Overview` heading must
    // not collide on one key — both contents are preserved (the later wins the
    // key otherwise, silently dropping the intro).
    const md = `# CLAUDE.md\n\nIntro lead-in.\n\n## Overview\n\nReal overview body.\n`;
    const spec = adoptToSpec(md, "CLAUDE.md");
    const values = Object.values(spec.sections).join("\n");
    expect(values).toContain("Intro lead-in.");
    expect(values).toContain("Real overview body.");
    expect(Object.keys(spec.sections).length).toBe(2); // two distinct keys
  });

  it("lifts maxSectionLines above a long faithful section", () => {
    const long = Array.from({ length: 220 }, (_, i) => `line ${i}`).join("\n");
    const spec = adoptToSpec(`# CLAUDE.md\n\n## Big\n\n${long}\n`, "CLAUDE.md");
    expect(spec.maxSectionLines).toBeGreaterThan(220);
  });
});

describe("adoptMarkdown — generated source", () => {
  it("emits a target line only for a non-CLAUDE.md target", () => {
    expect(
      adoptMarkdown(`# CLAUDE.md\n\n## A\n\nx\n`, "CLAUDE.md").source,
    ).not.toContain("target:");
    expect(
      adoptMarkdown(`# AGENTS.md\n\n## A\n\nx\n`, "AGENTS.md").source,
    ).toContain('target: "AGENTS.md"');
  });

  it("imports claude, emits empty rules, and never infers a rule", () => {
    const { source } = adoptMarkdown(`# CLAUDE.md\n\n## A\n\nx\n`, "CLAUDE.md");
    expect(source).toContain('import { claude } from "vigiles/spec"');
    expect(source).toContain("rules: {},");
    // No rule is INFERRED — only `claude` is imported (no enforce/guidance import).
    expect(source).not.toContain("import { claude, ");
    expect(source).not.toContain('"vigiles/spec";\nimport');
  });

  it("escapes backticks and ${} so the generated template literal is valid", () => {
    const md = "# CLAUDE.md\n\n## Cmds\n\nRun `npm test` and `${X}` now.\n";
    const { source } = adoptMarkdown(md, "CLAUDE.md");
    expect(source).toContain("\\`npm test\\`");
    expect(source).toContain("\\${X}");
  });
});

describe("round-trip — compile(adopt(file)) ≈ file", () => {
  it("reproduces a clean structured file with no compile errors", () => {
    const md = `# CLAUDE.md

## Positioning

What this project does and why.

## Architecture

- \`src/index.ts\` — entry point

## Rules

### No console

Use the structured logger, not console.log.
`;
    const out = recompile(md);
    expect(out.errors).toEqual([]);
    expect(out.markdown).toContain("## Positioning");
    expect(out.markdown).toContain("What this project does and why.");
    expect(out.markdown).toContain("### No console");
    expect(out.markdown).toContain(
      "Use the structured logger, not console.log.",
    );
    // The canonical h1 is the filename (below the integrity header).
    expect(out.markdown).toContain("\n# CLAUDE.md\n");
  });

  it("preserves backtick-heavy content verbatim through the round-trip", () => {
    const md =
      "# CLAUDE.md\n\n## Commands\n\n- `npm run build` — compile\n- `npm test` — test\n";
    const out = recompile(md);
    expect(out.errors).toEqual([]);
    expect(out.markdown).toContain("- `npm run build` — compile");
    expect(out.markdown).toContain("- `npm test` — test");
  });

  it("reproduces a raw-tier (heading-less) file under Overview, no errors", () => {
    const out = recompile(
      "Plain agent instructions.\n\nDo the thing.\n",
      "AGENTS.md",
    );
    expect(out.errors).toEqual([]);
    expect(out.markdown).toContain("## Overview");
    expect(out.markdown).toContain("Plain agent instructions.");
    expect(out.markdown).toContain("Do the thing.");
  });
});
