---
# yaml-language-server: $schema=./.vigiles/schema.json
vigiles:
  enforce:
    - rule: "@typescript-eslint/no-floating-promises"
      why: "Await or explicitly void every promise — unhandled rejections crash the process."
    - rule: "@typescript-eslint/no-explicit-any"
      why: "Use unknown and narrow with type guards."
    - rule: eslint/no-console
      why: "Route output through the shared logger."
    - rule: ruff/F401
      why: "No unused imports in the Python tooling."
---

<!--
  Example of vigiles markdown mode, Level 1 (YAML frontmatter).

  This is a plain, hand-written CLAUDE.md — no .spec.ts, no compile step.
  The `vigiles:` frontmatter block above declares enforce rules that
  `vigiles audit CLAUDE.md` verifies against the project's real linter config
  (rule exists + is enabled, typo suggestions, disabled-rule detection).

  The frontmatter must be the very first thing in the file, and the
  yaml-language-server modeline must be the first line inside it. Run
  `npx vigiles generate-schema` once and that modeline gives you rule-name
  autocomplete and red-squiggle-on-typo in VS Code / JetBrains / neovim —
  no TypeScript.

  See docs/markdown-mode.md for the full level ladder.
-->

# Acme Service

A payments service. Keep changes small and well-tested.

## Commands

- `npm run build` — compile to `dist/`
- `npm test` — run the full test suite

## Conventions

Application output goes through `src/logger.ts`, never `console` directly —
the `eslint/no-console` rule in the frontmatter above is verified on every
`vigiles audit`, so this line can't quietly go stale.

Every promise is awaited or explicitly voided. The
`@typescript-eslint/no-floating-promises` rule enforces it mechanically.
