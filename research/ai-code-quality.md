# AI Code Quality Research

Collected April 2026 during the vigiles v2 design session. This document captures the research, insights, and decisions that shaped vigiles v2's architecture.

---

## The Problem

Natural language instruction files (CLAUDE.md, AGENTS.md, .cursorrules) are the interface between humans and AI coding agents. We spent 50 years building compilers, type systems, and linters to escape ambiguity. Now the most powerful code generation tool communicates via markdown.

### Empirical Data

| Finding                                                                          | Source                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI code produces 1.7x more issues than human code                                | [CodeRabbit report](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report)                                                                            |
| 2.74x more security vulnerabilities in AI code                                   | CodeRabbit report                                                                                                                                                          |
| 3x more readability problems, 2x naming inconsistencies                          | CodeRabbit report                                                                                                                                                          |
| 8x more excessive I/O operations                                                 | CodeRabbit report                                                                                                                                                          |
| LLM-generated instruction files reduce task success by ~3%, increase cost by 20% | [ETH Zurich SRI Lab](https://www.marktechpost.com/2026/02/25/new-eth-zurich-study-proves-your-ai-coding-agents-are-failing-because-your-agents-md-files-are-too-detailed/) |
| Over 50% of instruction file rules are noise                                     | ETH Zurich study                                                                                                                                                           |
| Claude Code commits leak secrets at 3.2% (2x human baseline of ~1.5%)            | [GitGuardian State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/)                                                                 |
| 60% of AI code faults are silent logic failures                                  | [StackOverflow: Bugs with AI agents](https://stackoverflow.blog/2026/01/28/are-bugs-and-incidents-inevitable-with-ai-coding-agents/)                                       |
| Instruction files over ~200-300 lines → compliance drops sharply                 | Multiple sources (lost-in-the-middle effect)                                                                                                                               |

### Columbia DAPLab: 9 Critical Failure Patterns

From analysis of Cline, Claude, Cursor, Replit, and V0 across 15+ applications:

1. Error handling suppression — agents suppress errors to make code run
2. Business logic misunderstanding — pricing rules, constraints not tied in correctly
3. Codebase awareness degradation — failure rates increase with file count
4. Style drift — toward generic defaults for naming, architecture, formatting
5. Deprecated/wrong pattern introduction — statistical inference, not semantic understanding
6. Secret leakage — 2x higher rates with AI-assisted commits
7. Invisible drift accumulation — builds up silently until production failure
8. Review fatigue — 14x projected activity surge overwhelms human review
9. Concurrency/dependency errors — 2x more likely in AI code

---

## The Core Tension

We can't lint natural language. But we CAN lint the claims natural language makes about the world.

- "Use the logger" → unlintable
- `enforce("eslint/no-console", "Use structured logger.")` → falsifiable claim, verified at compile time

### Key Framings

- **Martin Fowler's "Harness Engineering"** (Feb 2026): Design deterministic constraints and feedback loops around AI agents. Not prompting. Not instructing. Constraining.
- **Factory.ai**: "Agents write the code; linters write the law."
- **The pattern**: "LLM proposes, deterministic tool disposes." The CI gate stays deterministic. AI helps write rules, but rules run deterministically.
- **Spotify's Honk system**: 650+ agent-generated PRs merged monthly with strong feedback loops.

Sources: [Martin Fowler](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html), [Factory.ai](https://factory.ai/news/using-linters-to-direct-agents), [Spotify](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3), [StackOverflow: Guidelines for AI](https://stackoverflow.blog/2026/03/26/coding-guidelines-for-ai-agents-and-people-too/)

---

## Ideas Explored

### 10 Initial Ideas (from broad to medium ambition)

1. **Convention Fingerprinting** — AST-analyze codebase, extract convention profiles, validate new code against them. Prior art: NATURALIZE (94% accuracy on naming), similarity-ts, IntelliCode.
2. **Architectural Boundary Enforcement** — Define allowed dependency directions, validate import graph. Prior art: Nx, Sheriff, Dependency Cruiser.
3. **"Guardrails as Tests"** — Lightweight DSL for structural code assertions via AST matching. Prior art: Semgrep, ast-grep.
4. **PR Review Mining** — Cluster repeated review comments, auto-generate instruction entries. TF-IDF + cosine similarity (no LLM needed).
5. **API Hallucination Detector** — Validate API calls against knowledge base via AST. Prior art: [arxiv 2601.19106](https://arxiv.org/html/2601.19106v1) — 100% precision, 87.6% recall.
6. **Convention Compliance Scoring** — Per-PR audit of which instructions are followed. Cross-reference diff against rules.
7. **Deprecation/Migration Fence** — Block deprecated patterns in new code, allow in existing. "allow-existing, block-new" semantic.
8. **Context Sufficiency Validator** — Check instruction files reference real things, aren't vague.
9. **Executable Examples** — Type-check code blocks in instruction files via tsc/py_compile/shellcheck.
10. **Instruction Effectiveness Tracking** — Correlate rules with linter failures and review comments over time.

### 4 Bold Bets

1. **Executable Spec Files** → CHOSEN. TypeScript specs that compile to markdown. The spec IS the source of truth.
2. **Convention Genome** → DEFERRED. Extract conventions from AST, encode as machine-readable genome. Promising but large research project.
3. **Proof-Carrying Code** → REJECTED. Agents produce code + verification receipts. On reflection, this is just ESLint with extra steps.
4. **Type System for Instructions** → ABSORBED into idea 1. Rich typed annotations become TypeScript types in the spec.

---

## Key Design Decisions

### 1. Compile to markdown, don't lint markdown

The TypeScript type system catches errors at authoring time. `enforce()` must be called with a valid `LinterRule` template literal type. `file()` returns a `VerifiedPath` branded type. The compiler validates everything else. Nobody else does this.

### 2. Three rule types: enforce, check, guidance

| Type      | Builder      | Responsibility                                                            |
| --------- | ------------ | ------------------------------------------------------------------------- |
| Delegated | `enforce()`  | External tool (linter, ast-grep, etc.). vigiles verifies it's configured. |
| Checked   | `check()`    | Filesystem assertions only. vigiles owns what no other tool handles.      |
| Guidance  | `guidance()` | Prose. No enforcement pretended.                                          |

**Originally had `prove()` with `no().matches()` and `layers()`.** Killed these — ast-grep, Dependency Cruiser, and Steiger already do architectural linting better. vigiles references their rules via `enforce()` instead of reimplementing them.

### 3. Don't be an architectural linter

Existing tools that already handle this:

| Tool                                                                 | Languages    | What it does                               |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| [ast-grep](https://ast-grep.github.io/)                              | 26 languages | Structural search/lint/rewrite, YAML rules |
| [Steiger](https://github.com/feature-sliced/steiger)                 | JS/TS        | File structure + architecture linting      |
| [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser) | JS/TS        | Import graph validation                    |
| [Sheriff](https://github.com/nicedoc/sheriff)                        | TS           | Module boundary enforcement                |
| Nx `enforce-module-boundaries`                                       | JS/TS        | Layer/tag-based import rules               |
| eslint-plugin-boundaries                                             | JS/TS        | Import boundary rules in ESLint            |

vigiles can reference all of these via `enforce("ast-grep/rule-name")` etc.

### 4. generate-types as second moat

`vigiles generate-types` scans all 6 linter APIs + package.json + filesystem → emits `.d.ts`:

```typescript
// .vigiles/generated.d.ts (auto-generated)
export type EslintRule = "no-console" | "no-unused-vars" | ...;
export type RuffRule = "E501" | "F401" | ...;
export type NpmScript = "build" | "test" | "fmt" | ...;
export type ProjectFile = "src/spec.ts" | "src/compile.ts" | ...;
```

TS compiler proves references valid at authoring time. Like Prisma for databases, tRPC for APIs. Nobody else does this for linter rules.

### 5. Branded types for references

`file()` returns `VerifiedPath`, not `string`. `cmd()` returns `VerifiedCmd`. Distinguishes "went through vigiles verification" from "random string" at the type level.

### 6. Colocated spec files, not god-object config

- `CLAUDE.md.spec.ts` sits next to `CLAUDE.md`
- `SKILL.md.spec.ts` sits next to `SKILL.md`
- Hooks (.claude/settings.json) validated in place — no spec needed
- `vigiles.config.ts` only for project settings (maxRules, maxTokens)

### 7. Token budget on compiled output

`maxTokens` constrains the compiled artifact. The spec can be any length. Estimated via ~4 chars/token heuristic (swappable for real tokenizer).

### 8. SHA-256 hash on compiled output

Detects manual edits. `vigiles adopt` (future) to merge manual changes back into spec.

---

## Technology Choices

| Tool                            | Decision                                  | Rationale                                                   |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| **ast-grep** (`@ast-grep/napi`) | Future dependency for `check()` if needed | 26 languages, Rust-fast, Node.js API                        |
| **Semgrep**                     | REJECTED                                  | Can't embed (OCaml binary), LGPL + restrictive rule license |
| **tree-sitter**                 | Too low-level                             | ast-grep wraps it with better API                           |
| **ESLint v10**                  | Potential output target                   | Inline plugins via flat config                              |
| **Pulumi model**                | Architectural inspiration                 | TS code → declarative output                                |
| **Effect.ts Schema**            | Pattern inspiration                       | Inspectable values = executable + documentable              |

---

## Competitive Landscape

15+ tools in the space across 4 categories. See `research/competitive-landscape.md` for full analysis.

**vigiles moat (v2):**

1. Spec compilation (nobody else)
2. Linter cross-referencing — 6 APIs (nobody else)
3. Type generation from project state (nobody else)
4. Branded reference types
5. SHA-256 integrity hash

---

## What's NOT Worth Building

Based on research, these approaches don't work or are somebody else's job:

- **AI-in-CI for code review** — non-deterministic, can't be a gate. What works: AI writes the rules, deterministic tools run them.
- **Architectural linting** — ast-grep, Steiger, Dependency Cruiser do this better.
- **Markdown formatting** — markdownlint. We generate the markdown, structure is correct by construction.
- **Prose quality validation** — detecting "write clean code" as vague is cute but fragile. Better to just not generate it from specs.
- **Skill testing via LLM execution** — non-deterministic, expensive, side-effect-prone. Skill contracts are unreliable.
- **Per-file code linting** — that's what ESLint/Ruff/Clippy are for.

---

## Future Work

| Feature                     | Status        | Notes                                                                       |
| --------------------------- | ------------- | --------------------------------------------------------------------------- |
| `vigiles discover`          | Not started   | Scan linter configs, report coverage gaps, suggest rules to document        |
| `vigiles adopt`             | Not started   | Detect manual edits via hash, merge changes back into spec                  |
| `vigiles.config.ts` loading | Not started   | Needs jiti or tsx for TS config evaluation                                  |
| Convention Genome           | Research only | Extract conventions from AST, encode as types. High potential, large scope. |
| Real tokenizer              | Not started   | Replace ~4 chars/token heuristic with BPE (tiktoken/gpt-tokenizer)          |
