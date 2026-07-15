import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeRules, type RuleRouting } from "./rule-routing.js";

/**
 * REAL-OSS routing dogfood — runs the deterministic rule router over VERBATIM
 * `AGENTS.md` files vendored from MIT-licensed Python projects
 * (test/dogfood/instruction-files/, see PROVENANCE.md), so CI catches a
 * regression against real-world content, not just synthetic fixtures.
 *
 * Assertions are stable INVARIANTS (a real docstring rule routes to pylint, no
 * cross-language false positive in a pure-Python doc, the hard lane is
 * populated) — never brittle exact counts — so router improvements don't break
 * them, but a real routing regression does.
 */
function route(file: string): RuleRouting {
  const text = readFileSync(
    resolve(process.cwd(), "test/dogfood/instruction-files", file),
    "utf-8",
  );
  return routeRules(text, file);
}

const CASES = [
  "langchain.AGENTS.md",
  "browser-use.AGENTS.md",
  "mcp-python-sdk.AGENTS.md",
];

describe("real-OSS routing dogfood (vendored Python AGENTS.md)", () => {
  for (const file of CASES) {
    describe(file, () => {
      const r = route(file);
      const reuse = r.rules.filter((x) => x.category === "reuse");

      it("routes its documented docstring rule to pylint:missing-function-docstring", () => {
        expect(
          reuse.some(
            (x) =>
              x.linter === "pylint" && x.rule === "missing-function-docstring",
          ),
          `${file} should route a docstring rule to pylint`,
        ).toBe(true);
      });

      it("has NO cross-language false positive (a pure-Python doc → only Python linters)", () => {
        // Python docs may route to pylint OR ruff (both Python); the FP that
        // matters is a Python norm mis-attributed to a JS/other linter.
        const PY = new Set(["pylint", "ruff"]);
        const wrong = reuse.filter((x) => !PY.has(x.linter ?? ""));
        expect(
          wrong.map((x) => `${x.linter}:${x.rule} ← ${x.text}`),
          "unexpected non-Python reuse in a Python doc",
        ).toEqual([]);
      });

      it("populates the 'hard to codify' lane (real docs are mostly project-specific)", () => {
        expect(r.counts.unrouted, `${file} hard lane`).toBeGreaterThan(0);
      });

      it("every reuse hit uses a supported linter and every rule is honestly categorized", () => {
        const KNOWN = new Set(["eslint", "pylint", "ruff", "clippy"]);
        for (const x of reuse) expect(KNOWN.has(x.linter ?? "")).toBe(true);
        const CATS = new Set(["reuse", "hook", "meta", "semantic", "unrouted"]);
        for (const x of r.rules) expect(CATS.has(x.category)).toBe(true);
      });

      it("does NOT mis-attribute a Python doc to clippy (Rust linter)", () => {
        // The clippy keywords are Rust-unambiguous; a pure-Python doc must never
        // route to clippy (the cross-language FP the routing invariant forbids).
        expect(reuse.some((x) => x.linter === "clippy")).toBe(false);
      });
    });
  }
});

describe("Clippy (Rust) routing — the codex/ghostty 0%→ win (backlog #3)", () => {
  // Grounded in the real codex AGENTS.md prose. A Rust rulebook that names these
  // norms must now route to clippy instead of the 0% it got when clippy was
  // unmapped.
  // One norm per bullet — the router is first-match (one rule per bullet), so a
  // combined "avoid panic!, unreachable!, .unwrap()" bullet yields ONE rule, not
  // three; separate bullets exercise each mapping.
  const rust = [
    "# Rust conventions",
    "- Avoid `.unwrap()` in library code.",
    "- Never use `panic!`.",
    "- Do not use `unreachable!`.",
    "- No `dbg!` in committed code.",
    "- Make `match` exhaustive; avoid wildcard arms.",
  ].join("\n");
  const reuse = routeRules(rust, "AGENTS.md").rules.filter(
    (x) => x.category === "reuse",
  );

  it("routes each Rust norm to its clippy restriction lint (all clippy, no mis-linter)", () => {
    const rules = new Set(reuse.map((x) => x.rule));
    expect(reuse.every((x) => x.linter === "clippy")).toBe(true);
    expect(rules.has("clippy::unwrap_used")).toBe(true);
    expect(rules.has("clippy::panic")).toBe(true);
    expect(rules.has("clippy::unreachable")).toBe(true);
    expect(rules.has("clippy::dbg_macro")).toBe(true);
    expect(rules.has("clippy::wildcard_enum_match_arm")).toBe(true);
  });
});
