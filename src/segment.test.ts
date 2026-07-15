import { describe, it, expect } from "vitest";
import {
  segmentInstructions as segmentInstructionsFull,
  type SegmentedRule,
} from "./segment.js";

// These tests assert on the candidate rules; wrap to the `.segments` array (the
// skipped-bullets tier is covered separately in segment-skip.test.ts).
const segmentInstructions = (
  md: string,
  file?: string,
  skip?: ReadonlySet<number>,
): SegmentedRule[] => segmentInstructionsFull(md, file, skip).segments;

function texts(rules: readonly SegmentedRule[]): string[] {
  return rules.map((r) => r.text);
}

function find(
  rules: readonly SegmentedRule[],
  needle: string,
): SegmentedRule | undefined {
  return rules.find((r) => r.text.toLowerCase().includes(needle.toLowerCase()));
}

/** Every emitted atom's exactQuote must be a verbatim slice of the source. */
function assertProvenanceExact(
  md: string,
  rules: readonly SegmentedRule[],
): void {
  const lines = md.split("\n");
  for (const r of rules) {
    // exactQuote is a real substring of the source
    expect(md.includes(r.exactQuote)).toBe(true);
    // line numbers are 1-based and sane
    expect(r.lineStart).toBeGreaterThanOrEqual(1);
    expect(r.lineEnd).toBeGreaterThanOrEqual(r.lineStart);
    expect(r.lineEnd).toBeLessThanOrEqual(lines.length);
    // exactQuote is contained within the claimed line range
    const rangeText = lines.slice(r.lineStart - 1, r.lineEnd).join("\n");
    expect(rangeText.includes(r.exactQuote.trim())).toBe(true);
  }
}

// ---------------------------------------------------------------------------

const FIXTURE_BULLETS = `# Project rules

## Coding conventions

- Never use \`console.log\`
- No \`any\` types
- Never push directly to main
- Write clear, self-documenting code
- Modules may only import through their index.ts barrel
- This repo uses pnpm
- See the [contributing guide](https://example.com/contrib)
- https://example.com/only-a-link
`;

const FIXTURE_PROSE = `# Style guide

## Guidelines

Always prefer composition over inheritance. This project targets Node 20.
Keep functions small and focused.

## Notes

Some intro paragraph that is not under a rule heading.

## Background

We use a monorepo layout. The build is orchestrated by turbo.
`;

const FIXTURE_COMPOUND = `## Rules

- Never delete a migration file except when it has never shipped to production
- Run the linter; fix all reported errors before committing
- Prefer async iterators
- Configuration lives in \`config/\`

\`\`\`ts
// this code fence must be ignored
const bad = "always never must use avoid";
never.push("to main");
\`\`\`

| do | dont |
| -- | ---- |
| use x | use y |
`;

// ---------------------------------------------------------------------------

describe("segmentInstructions — bulleted rules", () => {
  const rules = segmentInstructions(FIXTURE_BULLETS, "CLAUDE.md");
  const t = texts(rules);

  it("keeps the clear imperative bullets", () => {
    expect(find(rules, "Never use")).toBeTruthy();
    expect(find(rules, "Never push directly to main")).toBeTruthy();
    expect(find(rules, "Write clear, self-documenting code")).toBeTruthy();
    expect(find(rules, "No `any` types")).toBeTruthy();
    expect(find(rules, "Modules may only import")).toBeTruthy();
  });

  it("assigns confidence per the 3-cue gate", () => {
    expect(find(rules, "Never use")?.confidence).toBe("high");
    expect(find(rules, "Never push directly to main")?.confidence).toBe("high");
    expect(find(rules, "Write clear, self-documenting code")?.confidence).toBe(
      "high",
    );
    // fails the 15-char shape floor -> 2/3 medium
    expect(find(rules, "No `any` types")?.confidence).toBe("medium");
    // does not START with an imperative head ("Modules may only ...") -> 2/3 medium
    expect(find(rules, "Modules may only import")?.confidence).toBe("medium");
  });

  it("PRECISION: rejects declarative + link-only non-rules (no garbage atoms)", () => {
    expect(find(rules, "This repo uses pnpm")).toBeUndefined();
    expect(find(rules, "contributing guide")).toBeUndefined();
    expect(t.some((x) => x.includes("example.com/only-a-link"))).toBe(false);
  });

  it("has exact, verbatim provenance for every atom", () => {
    assertProvenanceExact(FIXTURE_BULLETS, rules);
  });

  it("PRECISION: rejects a DESCRIPTION-led architecture sentence, keeps a rule that names code", () => {
    // A code-span-led sentence that DESCRIBES an entity is noise, not a rule
    // (the dogfood's #1 segmenter false positive).
    const drop = segmentInstructions(
      [
        "- `QueryInterpreter` class in `packages/x/query.ts` executes query plans.",
        "- `bar` is the loader module.",
        "- `apps/dotcom/client` handles the frontend behavior.",
      ].join("\n"),
    );
    expect(drop).toHaveLength(0);
    // But a normal imperative rule that MENTIONS code still segments, and a
    // code-led rule with a deontic predicate is NOT mistaken for a description.
    expect(segmentInstructions("- Use `const` instead of `let`.")).toHaveLength(
      1,
    );
    expect(
      segmentInstructions(
        "- Always regenerate the client after changing the schema.",
      ),
    ).toHaveLength(1);
  });
});

describe("segmentInstructions — prose under a rule-ish heading", () => {
  const rules = segmentInstructions(FIXTURE_PROSE, "CLAUDE.md");

  it("extracts imperative sentences under a rule heading", () => {
    expect(
      find(rules, "Always prefer composition over inheritance"),
    ).toBeTruthy();
    expect(find(rules, "Keep functions small and focused")).toBeTruthy();
  });

  it("PRECISION: rejects declaratives even under a rule heading", () => {
    expect(find(rules, "This project targets Node 20")).toBeUndefined();
  });

  it("PRECISION: ignores prose NOT under a rule-ish heading", () => {
    expect(find(rules, "Some intro paragraph")).toBeUndefined();
    // '## Background' is not rule-ish -> its prose is not a candidate
    expect(find(rules, "monorepo layout")).toBeUndefined();
    expect(find(rules, "orchestrated by turbo")).toBeUndefined();
  });

  it("verbatim provenance", () => {
    assertProvenanceExact(FIXTURE_PROSE, rules);
  });
});

describe("segmentInstructions — atomicity, fences, tables", () => {
  const rules = segmentInstructions(FIXTURE_COMPOUND, "AGENTS.md");
  const t = texts(rules);

  it("does NOT split 'never X except Y' (exception carries polarity)", () => {
    const migration = find(rules, "Never delete a migration file");
    expect(migration).toBeTruthy();
    // stays whole: the 'except' clause is still present in the same atom
    expect(migration?.text.toLowerCase()).toContain("except");
    // and there is no orphaned "when it has never shipped" atom
    expect(t.some((x) => /^when it has never shipped/i.test(x))).toBe(false);
  });

  it("splits a compound bullet only when BOTH halves independently pass", () => {
    // "Run the linter; fix all reported errors before committing"
    const runHalf = find(rules, "Run the linter");
    expect(runHalf).toBeTruthy();
    // the second half ("fix all ...") does NOT start with an imperative head
    // in FORM and would not pass the gate alone => the bullet stays whole.
    expect(runHalf?.text).toMatch(/run the linter/i);
    expect(runHalf?.text.toLowerCase()).toContain("fix all reported errors");
  });

  it("PRECISION: code fence content is never a candidate", () => {
    expect(t.some((x) => x.includes("const bad"))).toBe(false);
    expect(t.some((x) => x.includes("this code fence must be ignored"))).toBe(
      false,
    );
    expect(t.some((x) => x.includes('never.push("to main")'))).toBe(false);
  });

  it("PRECISION: table rows are never candidates", () => {
    expect(t.some((x) => x.includes("dont"))).toBe(false);
    expect(t.some((x) => x.startsWith("use x"))).toBe(false);
  });

  it("verbatim provenance", () => {
    assertProvenanceExact(FIXTURE_COMPOUND, rules);
  });
});

// ---------------------------------------------------------------------------

// Corpus-grounded precision fixes (design: research/rule-compiler-multilang-design.md §2a).
const FIXTURE_CORPUS = `# Agent rules

## Key Files

- \`src/core/linters.ts\` — the cross-referencing engine
- \`npm test\` — build and run all tests

## Commands

- Run \`npm install\` before anything else

## Coding Standards

- **Never** commit secrets
- Always use \`===\` over \`==\`
- ✅ Use \`const\` over \`let\`
- Naming is consistent across modules

## Documentation

Always write docstrings for public functions.
`;

describe("segmentInstructions — corpus-grounded precision fixes", () => {
  const rules = segmentInstructions(FIXTURE_CORPUS, "AGENTS.md");
  const t = texts(rules);

  it("INDEX-SMELL: rejects `path` — description index bullets", () => {
    expect(t.some((x) => x.includes("cross-referencing engine"))).toBe(false);
    expect(t.some((x) => x.includes("build and run all tests"))).toBe(false);
  });

  it("ANTI-CONTEXT: rejects imperative bullets under a Commands/Key Files heading", () => {
    // "Run `npm install` …" is imperative + a bullet, but under `## Commands`.
    expect(find(rules, "npm install")).toBeUndefined();
  });

  it("DECORATION: catches shouted / numbered / emoji-bulleted rules", () => {
    expect(find(rules, "Never** commit secrets")?.confidence).toBe("high");
    expect(find(rules, "Always use")?.confidence).toBe("high");
    expect(find(rules, "Use `const` over `let`")?.confidence).toBe("high");
  });

  it("RULE_HEADING word-bound: `## Documentation` is not a rules section", () => {
    // Regression: the old regex matched the substring `do` in "Documentation",
    // so its prose leaked in. Prose under it must NOT be a candidate now.
    expect(
      find(rules, "write docstrings for public functions"),
    ).toBeUndefined();
  });

  it("VERB LEXICON: a copula-only declarative is rejected (no vacuous shape)", () => {
    // "Naming is consistent across modules" — no action verb once copulas left
    // the lexicon, so it fails the shape cue and is dropped.
    expect(find(rules, "Naming is consistent")).toBeUndefined();
  });

  it("verbatim provenance across ordered/emoji/decorated bullets", () => {
    assertProvenanceExact(FIXTURE_CORPUS, rules);
  });
});

describe("segmentInstructions — index/reference entries (extended)", () => {
  it("rejects path→path maps, Label:path pointers, and path-led listings", () => {
    const md = [
      "## Rules",
      "",
      "- Dev server: `src/cli/next-dev.ts` → `src/server/dev/next-dev-server.ts`",
      "- Skill file: `.agents/skills/pr-status-triage/SKILL.md`",
      "- `packages/replay-internal/`, `packages/replay-canvas/` — Session replay",
    ].join("\n");
    const t = texts(segmentInstructions(md));
    expect(t.some((x) => x.includes("next-dev"))).toBe(false);
    expect(t.some((x) => x.includes("Skill file"))).toBe(false);
    expect(t.some((x) => x.includes("replay-internal"))).toBe(false);
  });

  it("PRECISION: a normal rule-naming bullet (prose + (`rule`)) is kept", () => {
    // starts with prose, not a path — the path discriminator (ext/slash) never
    // trips, so this stays a candidate.
    const md =
      "## Rules\n\n- Use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`)";
    expect(find(segmentInstructions(md), "import type")).toBeTruthy();
  });
});

describe("segmentInstructions — RULE-NAME cue", () => {
  it("promotes a rule-naming bullet with NO imperative verb to high", () => {
    // The corpus shape: names the rule in backticks, describes intent, no lexicon
    // verb → would score 'medium' and be dropped without the cue.
    const md =
      "## Code Style\n\n- No floating promises (`@typescript-eslint/no-floating-promises`)";
    const hit = find(segmentInstructions(md), "floating promises");
    expect(hit?.confidence).toBe("high");
  });

  it("PRECISION: a non-rule package kebab in backticks is NOT promoted", () => {
    // `next-test-utils` is a package, not a rule (no rule-ish prefix) — the cue
    // must not fire, so a verb-less declarative bullet stays rejected.
    const md = "## Guidelines\n\n- Coverage comes from `next-test-utils` here";
    expect(find(segmentInstructions(md), "next-test-utils")).toBeUndefined();
  });
});

describe("segmentInstructions — aggregate precision/recall on fixtures", () => {
  it("reports precision hard (=1.0) and recall softly", () => {
    const all = [
      ...segmentInstructions(FIXTURE_BULLETS, "CLAUDE.md"),
      ...segmentInstructions(FIXTURE_PROSE, "CLAUDE.md"),
      ...segmentInstructions(FIXTURE_COMPOUND, "AGENTS.md"),
    ];

    // Ground-truth "garbage" set: anything from these must never appear.
    const garbageSignatures = [
      "This repo uses pnpm",
      "This project targets Node 20",
      "monorepo layout",
      "orchestrated by turbo",
      "Some intro paragraph",
      "contributing guide",
      "only-a-link",
      "const bad",
      "this code fence must be ignored",
      "dont",
    ];
    const emitted = texts(all);
    const garbageEmitted = emitted.filter((x) =>
      garbageSignatures.some((g) => x.toLowerCase().includes(g.toLowerCase())),
    );
    // HARD: precision == 1.0 (zero garbage atoms)
    expect(garbageEmitted).toEqual([]);

    // SOFT: recall — the obvious true rules we expect to catch.
    const expectedTrue = [
      "Never use",
      "Never push directly to main",
      "Write clear, self-documenting code",
      "No `any` types",
      "Modules may only import",
      "Always prefer composition over inheritance",
      "Keep functions small and focused",
      "Never delete a migration file",
      "Run the linter",
      "Prefer async iterators",
    ];
    const caught = expectedTrue.filter((e) => find(all, e));
    const recall = caught.length / expectedTrue.length;
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });
});
