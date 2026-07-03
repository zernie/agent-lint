---
status: active
topic: spec
---

# Composable / modular instruction files — mid-2026 survey

Can you split an agent instruction file (CLAUDE.md / AGENTS.md / rules) into
reusable PARTS and compose/import them? Survey of every major harness, mid-2026.
Relevant to vigiles because the typed spec already models composition
(`preset()`/`extends()` in `spec-api-design.md`, `.ruler`/`rulesync` interop in
`compose.ts`, `shareable-presets.md`) — this maps the native landscape it plugs into.

> Provenance: full sourced survey (2026-07-03) across three angles — harness-native
> mechanisms, third-party tools/startups, and design prior-art + demand signal. The
> sibling capability-governance topic has its own doc (see See also).

## Three orthogonal mechanisms (a harness can have all three)

- **COMPOSITION** — a reusable NAMED fragment imported by reference (`@path/to/file.md`), so one
  fragment is pulled into many parents. The real "module system."
- **LAYERING** — directory-hierarchy merge: files at different scopes (org/user/project/subdir) are
  concatenated/overridden by LOCATION, not an explicit import.
- **GLOB-SCOPING** — a rule file carries a glob in frontmatter and is conditionally ATTACHED only when
  matching files are in play; not spliced into another file's body.

## The landscape

| Harness               | Composition (named import)                                                  | Layering (scope hierarchy)                                 | Glob-scoping                                            |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| **Claude Code**       | ✅ `@path`, 4-hop, code-fence aware, home paths                             | ✅ managed/user/project/local + ancestor walk              | ✅ `.claude/rules/*.md` `paths:` frontmatter            |
| **Gemini CLI**        | ✅ `@file.md`, 5-level (configurable), circular-detect, `marked` fence-skip | ✅ hierarchical GEMINI.md, configurable filename           | 🟡 not primary                                          |
| **Continue.dev**      | ✅ hub `uses: owner/item-name` slug import (versioned, registry-style)      | ✅ `.continue/rules/` over global config.yaml              | 🟡 mostly always-on                                     |
| **Cursor**            | 🟡 `@file` mention (unconfirmed auto-splice vs pointer)                     | ✅ nested AGENTS.md precedence                             | ✅ `.mdc` `globs`/`alwaysApply`/`description` (4 modes) |
| **Copilot**           | ❌                                                                          | ✅ flat `copilot-instructions.md` base                     | ✅ `.github/instructions/*.instructions.md` `applyTo:`  |
| **Cline**             | ❌                                                                          | ✅ flat `.clinerules/` all-merged                          | ✅ optional per-file path frontmatter                   |
| **Codex (AGENTS.md)** | ❌ native                                                                   | ✅ nested-dir precedence + `AGENTS.override.md`, 32KiB cap | ❌                                                      |
| **AGENTS.md spec**    | 🟡 **proposed only** (issue #11, open since 2025-08-20)                     | ✅ nearest-file-wins nesting (the only in-spec mechanism)  | ❌                                                      |
| **Zed**               | 🟡 Skill import-by-URL (one-shot copy); "includes" cited but unconfirmed    | ✅ personal < project AGENTS.md (2-tier)                   | ❌                                                      |
| **Windsurf/Devin**    | ❌                                                                          | ✅ flat multi-file, char-capped (6K/12K)                   | ❌                                                      |
| **Aider**             | 🟡 config `read: [f1,f2]` list (flat, no in-body syntax)                    | ❌                                                         | ❌                                                      |

## Key findings

1. **Only Claude Code + Gemini CLI have a true markdown-native recursive `@import`** — near-identical
   designs (literal `@path`, depth cap 4 vs 5, real-parser code-fence skip, "no context savings"
   caveat since import inlines full content). CC additionally layers a 4-tier scope hierarchy +
   `.claude/rules/` glob-scoping + **symlinked rules dirs** for cross-repo reuse.
2. **Continue.dev is the only package-registry-style composition** — `uses: owner/item-name` pulls a
   versioned shareable block from a hub, architecturally closer to npm than to inline `@path`. This is
   the model closest to vigiles's `shareable-presets` idea.
3. **The AGENTS.md standard itself defines NO imports** — only nearest-file-wins nesting. Imports are a
   live, unresolved proposal (agentsmd/agents.md#11, open 2025-08-20) that explicitly cites CC / Cursor
   / Zed / Amp as prior art the spec should catch up to. **This is the gap:** the cross-tool standard
   has no composition primitive, so every tool bolts on its own.
4. **Glob-scoping is the dominant "modularity" pattern** (Cursor/Copilot/Cline/CC's `.claude/rules`) —
   conditional attachment for context-budget management, NOT DRY reuse of prose.
5. Windsurf/Cline = simplest tier (split-and-merge-all). Aider = most manual (user-listed `read:`).

## Why this matters for vigiles

- vigiles already emits the canonical formats these consume (CLAUDE.md/AGENTS.md) and composes with
  Ruler/rulesync rather than fighting them (`compose.ts`, `compose-with-sync-tools` rule). The native
  `@import` (CC/Gemini) and Continue's `uses:` registry are the composition primitives a typed
  `preset()`/`extends()` spec compiles DOWN to.
- The **AGENTS.md-has-no-imports gap** (#3) is the interesting wedge: a typed spec that composes
  reusable parts and compiles to each harness's native mechanism (or to a flat merged file where none
  exists) is exactly the "author once, distribute everywhere" value — and it's un-standardized upstream.
- Verdict alignment: this is a PRODUCT-PHASE thread (composition/authoring ergonomics), parked behind
  the security-report push. Captured, not committed.

## Third-party tools + startups

- **Ruler** (~2.8k★, MIT, active) + **rulesync** (~1.2k★) — CONCAT+FANOUT: whole `.ruler/*.md` files
  concatenated (no includes/partials) and fanned out to 29+ agent formats. No in-file composition.
- **ai-rulez** (Goldziher) — the standout: a real **Includes System** pulling remote rule content over
  HTTP(S)/GitHub raw URLs (SSRF-protected) + merge strategies + 33 builtin preset "domains" — closest to
  true cross-repo TEMPLATING.
- **ai-rulesmith** (solo) — closest to an `eslint-config-airbnb`-style PACKAGE/PRESET model (composable
  "rule atoms" + priority zones), but single-maintainer, no publish ecosystem.
- **Prompt-management SaaS** (Latitude/BAML/PromptLayer/Langfuse/Portkey; Humanloop shut down Sep 2025) —
  solve a DIFFERENT problem (runtime API-call prompts, not repo instruction files) → classified NONE.
- **No VC/YC-funded startup** pitching composable agent instruction files exists — the whole space is
  solo-maintainer OSS. Open RFCs (agentsmd/agents.md #10/#179) show the standards gap is known, unresolved.

## Design prior-art borrow-list (9 domains)

Every mature composition model has three things current CLAUDE.md/AGENTS.md proposals LACK: a **named/
addressable unit** (not a bare path), **real merge semantics** (not last-text-wins), and **versioning/
pinning** across a repo boundary. The ones to steal:

- **ESLint `extends`** — named/versioned installable config packages, positional precedence, consumer wins last.
- **Tailwind extend-vs-replace** — per-field choice: does an override APPEND to a list or REPLACE a scalar.
- **tsconfig `extends`** — shallow "unset inherits, set overrides"; paths resolve relative to the _declaring_ file.
- **Terraform modules / devcontainer Features** — versioned, parameterized, registry-distributed units ("npm
  install for rules" — the model nobody has built).
- **Helm `global.*`** — cross-cutting values that reach every subchart (an org rule every layer inherits).
- **Sass `@use`** — load-once + namespaced (vs CC's `@import` = CSS-`@import`-era: re-inlined, no de-dup, no namespace).
- **Nix modules** — a real type-aware merge algebra with explicit priority + error-on-conflict (the "grown-up" version).

## Demand signal (real, dated)

- **openai/codex#17401** "@include directive for composable AGENTS.md" (Apr 11 2026, open) — the clearest ask:
  _"no modular reuse across projects... developers working across 10+ repos... duplicate content or maintain a
  bloated `~/.codex/AGENTS.md`"_ + _"teams own different concerns... everyone edits one file causing merge
  conflicts and drift."_ Cites CC's `@` syntax as convention pressure.
- Practitioner posts converge independently (citypaul's `SPLIT-CLAUDE-MD-PLAN.md`, "Your CLAUDE.md Is Doing Too
  Much", Nick Tune's "Composable Claude Code System Prompts"). `claudelint`'s `claude-md-size` rule exists.
- **Sharpest unmet need: multi-repo.** Single-repo is solved (CC's hierarchical walk). Across independent repos
  ("10+ / 35 repos, shared conventions"), every account is a BESPOKE workaround (bootstrap repo, "virtual
  monorepo" reader, "repo-of-repos") — nobody ships a registry-distributed, versioned, pull-based shared-rules
  package.
- **The #1 critique to design around:** `@import` reduces AUTHORING mess but NOT context cost — imports still
  inline fully at load ("context rot": ~95%→60% instruction-following as loaded context grows). Anthropic's own
  guidance steers toward SKILLS (conditional/on-match load), not more `@import`s. So composition must reduce what's
  LOADED per task, not just what's authored per file.

## See also

- [spec-api-design](spec-api-design.md) — the `preset()`/`extends()` merge model this maps onto.
- [shareable-presets](shareable-presets.md) — publishable extendable instruction-preset design.
- [sync-tool-compatibility](sync-tool-compatibility.md) — the Ruler/rulesync interop contract.
- [roadmap](roadmap.md) — where product-phase threads slot (behind the report push).
