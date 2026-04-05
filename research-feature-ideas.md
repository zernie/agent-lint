# vigiles Feature Ideas: Programming Techniques as Product Features

Focus: **deterministic, mechanically checkable** features that vigiles provides **to users** of the tool. Each maps a proven programming technique to a real problem in messy production AI-adopting codebases.

---

## 1. Custom Rule Plugin API (Railway-Composable)

**Analog:** Railway-oriented programming + ESLint's plugin system.

**User problem:** Every team has conventions vigiles can't anticipate. "All rules must reference a Jira ticket." "Every section must have examples." No way to add custom checks without forking.

**What vigiles provides:** A plugin API where each rule is a pure function `(parsedRule) → Diagnostic | null`. Rules compose in a pipeline — collect-all mode for IDEs, short-circuit for CI.

```js
// .vigiles/rules/require-jira.mjs
export default {
  name: "require-jira",
  meta: { description: "Every rule must reference a Jira ticket" },
  check(rule, context) {
    if (!/[A-Z]+-\d+/.test(rule.body)) {
      return {
        message: `Rule "${rule.title}" missing Jira reference`,
        line: rule.line,
      };
    }
  },
};
```

```json
{ "plugins": ["./.vigiles/rules/require-jira.mjs"] }
```

**Railway composition:** Rules can't have side effects — they receive parsed data and return diagnostics only. Pipeline ordering is user-controlled. Each step is `Content → Result<ok, Diagnostic[]>`.

---

## 2. Reverse Coverage: Linter → Instruction Mapping

**Analog:** Code coverage reports — but inverted. "Which linter rules lack a corresponding instruction?"

**User problem:** Team has 200 ESLint rules configured. CLAUDE.md explains 5 of them. When an agent trips `no-restricted-imports`, it has no context about _why_ that rule exists — it just blindly fixes. The agent is following rules it doesn't understand.

**What vigiles provides:** A report showing which configured linter rules have corresponding CLAUDE.md entries and which don't.

```
vigiles coverage:

  ESLint: 5 / 47 rules documented (10.6%)

  Documented:
    ✓ no-console          → CLAUDE.md:42 "No console.log in production"
    ✓ no-restricted-imports → CLAUDE.md:48 "Always use barrel file imports"

  Undocumented (top 10 most-triggered):
    ✗ @typescript-eslint/no-explicit-any
    ✗ import/no-cycle
    ✗ react-hooks/exhaustive-deps
    ...

  Ruff: 0 / 12 rules documented (0%)
```

**Why this matters:** This is the inverse of `require-rule-file` (which checks instruction→linter). This checks linter→instruction. Together they form a bidirectional consistency check. The agent doesn't just follow rules — it _understands_ them.

**Implementation:**

- Read linter configs (`.eslintrc`, `ruff.toml`, etc.) to get list of enabled rules
- Cross-reference against `**Enforced by:**` annotations in instruction files
- Report coverage percentage and undocumented rules
- `vigiles coverage` CLI command + `--json` output

---

## 3. Dead Enforcement Detection

**Analog:** Dead code detection / tests marked `skip()` that still count as "covered."

**User problem:** CLAUDE.md says `**Enforced by:** eslint/no-console` but `.eslintrc` has `"no-console": "off"`. The enforcement is a lie. The agent thinks there's a safety net, but nothing actually catches violations. It's like a smoke detector with dead batteries.

**What vigiles provides:** Cross-checks `**Enforced by:**` claims against actual linter configuration to verify the rule is enabled.

```
vigiles validate CLAUDE.md:

  CLAUDE.md:42  Dead enforcement: "no-console" is referenced but disabled in .eslintrc.json
  CLAUDE.md:55  Dead enforcement: "no-restricted-imports" rule not found in ESLint config
```

**Implementation:**

- Extend `require-rule-file` (which already resolves linter rules) to also check if the rule is _enabled_
- ESLint: load flat config, check if rule severity > 0
- Ruff: parse `ruff.toml` / `pyproject.toml` select/ignore lists
- RuboCop: parse `.rubocop.yml` enabled/disabled cops
- New rule: `no-dead-enforcement` (default: "auto" like require-rule-file)

---

## 4. Instruction Snapshot Testing

**Analog:** Jest snapshot testing — lock down expected output, CI alerts on unexpected changes.

**User problem:** Instruction files change silently. Someone refactors CLAUDE.md, accidentally removes a rule or changes an enforcement annotation. Without structural awareness, PR reviewers just see markdown diffs — easy to miss that a rule was weakened.

**What vigiles provides:** `vigiles snapshot` generates a structured JSON summary of all instruction files. Commit it. CI diffs against it. Any unexpected structural change fails the build.

```json
// .vigiles/snapshot.json (committed)
{
  "CLAUDE.md": {
    "rules": [
      {
        "title": "No console.log in production",
        "enforcement": "enforced",
        "enforcedBy": "eslint/no-console",
        "line": 42
      },
      {
        "title": "Use Tailwind spacing scale",
        "enforcement": "guidance",
        "line": 55
      }
    ],
    "lineCount": 89,
    "enforced": 3,
    "guidance": 2
  }
}
```

```
$ vigiles snapshot --check
Snapshot mismatch:
  - Removed rule: "Use barrel file imports" (was enforced)
  + Added rule: "Use direct imports" (guidance only)
  ~ Changed: "No console.log" enforcement: enforced → guidance

Run `vigiles snapshot --update` to accept changes.
```

**Implementation:**

- `vigiles snapshot` — generate/update snapshot file
- `vigiles snapshot --check` — compare current state against committed snapshot
- Snapshot includes: rules, enforcement status, line numbers, counts
- Integrates with existing `parseClaudeMd` output

---

## 5. Stale Reference Detection

**Analog:** Broken link checkers / unused import warnings / dead code elimination.

**User problem:** Rules reference specific files, packages, and scripts that change over time. "Always use `src/utils/logger.ts`" persists months after `logger.ts` was renamed to `telemetry.ts`. The instruction is actively misleading.

**What vigiles provides:** Validates that file paths, package names, and script references in instruction files actually exist.

```
CLAUDE.md:42  Stale reference: `src/utils/logger.ts` does not exist
CLAUDE.md:55  Stale reference: `npm run typecheck` — no "typecheck" script in package.json
CLAUDE.md:68  Stale reference: package `lodash` not found in package.json
```

**What it checks (all deterministic):**

- File paths in backticks → `fs.existsSync()`
- `npm run <script>` → check `package.json` scripts
- Package names → check manifest files (package.json, requirements.txt, Cargo.toml)
- Command names in hooks → `which` check

---

## 6. `vigiles init` — Scaffold from Existing Linter Config

**Analog:** `eslint --init` / `npm init` / scaffolding generators.

**User problem:** Team has 200 ESLint rules, a Ruff config, and RuboCop setup — but no CLAUDE.md. Writing one from scratch is tedious and error-prone. Most teams never start because the blank page is too daunting.

**What vigiles provides:** Auto-generates a CLAUDE.md skeleton from existing linter configurations, pre-populated with `**Enforced by:**` annotations.

```
$ vigiles init

Detected linters:
  ✓ ESLint (47 rules enabled)
  ✓ Ruff (12 rules enabled)

Detected AI tools:
  ✓ Claude Code (.claude/ directory found)
  ✓ Cursor (.cursor/ directory found)

Generated:
  ✓ CLAUDE.md (47 rules from ESLint, 12 from Ruff)
  ✓ .cursorrules (copied from CLAUDE.md)

$ head CLAUDE.md
# CLAUDE.md

## Rules

### No console.log in production
**Enforced by:** `eslint/no-console`

### No explicit any
**Enforced by:** `@typescript-eslint/no-explicit-any`
...
```

**Implementation:**

- Read linter configs using existing resolver infrastructure
- Generate markdown with proper annotation format
- Group rules by linter/category
- Generate for all detected AI tools

---

## 7. Token Budget Linting

**Analog:** Webpack bundle size budgets / Lighthouse performance budgets.

**User problem:** `max-lines: 500` is crude. A 200-line file with code block examples burns more tokens than a 400-line file of terse rules. Teams have no visibility into what's eating their context window — the scarce resource.

**What vigiles provides:** Actual token counting with per-section breakdown and configurable budgets.

```
CLAUDE.md token budget: 1550 / 2000

  ## Commands        120 tokens  (8%)
  ## Architecture    340 tokens (22%)
  ## Rules           890 tokens (57%)  ← largest
  ## Examples        200 tokens (13%)
```

**Implementation:**

- Vendor minimal BPE tokenizer (cl100k_base, ~100KB pure JS, no API calls)
- New rule: `token-budget` with configurable limit
- Section-level breakdown keyed off `##` headers
- `--token-report` CLI flag for report-only mode

---

## 8. Skill Coloring: Side-Effect Classification

**Analog:** Function coloring (async/sync, `&`/`&mut`, IO monad). "What color is your function?"

**User problem:** Teams write skills and hooks but can't mechanically distinguish "safe to auto-run" from "touches production." A hook called "validate" could secretly `curl` an external API. Without coloring, every skill is equally opaque.

**What vigiles provides:** Validates that skills declare their side-effect level, and that the declaration matches the skill body.

```markdown
<!-- In SKILL.md -->

**Side effects:** none
```

vigiles scans for tool references and command patterns:

- `Read`, `Grep`, `Glob` → `none`
- `Write`, `Edit` → `local-fs`
- `curl`, `git push`, `deploy` → `network`

Mismatch = lint error: `Skill "audit" declares "none" but references Write tool`

---

## 9. Hook Validation (Contract Testing)

**Analog:** Contract testing / executable specification / CI pipeline linting.

**User problem:** PostToolUse hooks in `.claude/settings.json` are opaque shell strings. They reference nonexistent scripts, use invalid matchers, or silently fail. Nobody discovers the breakage until an agent session goes wrong.

**What vigiles provides:** Validates hook commands, matchers, and file references.

```
.claude/settings.json:
  Hook[0] ✗ Command references `validate.mjs` which does not exist
  Hook[1] ✗ Matcher "Edit|Writ" — did you mean "Edit|Write"? (no known tool matches "Writ")
  Hook[2] ✓ `npx prettier --check .` — command valid
```

**Checks:**

- Command target exists (file or binary on PATH)
- Matcher regex is valid and matches known tool names
- File references in commands resolve
- Hook ordering (formatter before linter = wasted work)

---

## 10. Instruction Diff Reviews (Migration Safety)

**Analog:** Database migration safety checks / API breaking change detection / semver.

**User problem:** Someone removes `**Enforced by:**` in a PR. No CI catches the regression. The rule silently becomes unenforced — the instruction equivalent of `DROP CONSTRAINT` with no migration review.

**What vigiles provides:** A `diff` command that structurally compares instruction files between versions and classifies changes.

```
vigiles diff base..head:

  ✓ added      "Validate API responses" (enforced by zod/schema)
  ⚠ weakened   "No console.log" — was enforced, now guidance-only
  ⚠ removed    "Use barrel imports"
  ✗ added      "New rule" — missing enforcement annotation
```

**Classifications:** `added` ✓, `strengthened` ✓, `weakened` ⚠, `removed` ⚠, `added-unenforced` ✗

**Implementation:**

- `vigiles diff <base-file> <head-file>` CLI
- GitHub Action mode: auto-fetch base, post PR comment
- Suppress with `<!-- vigiles: intentional-weakening -->`

---

## 11. Instruction File Dependency Graph

**Analog:** Module dependency graph / build system DAG / broken link checker.

**User problem:** Root CLAUDE.md says "See `src/api/CLAUDE.md` for API conventions." That file was deleted last sprint. Or: two files reference each other cyclically, creating ambiguity about which takes precedence.

**What vigiles provides:** Maps cross-references between instruction files, validates targets exist, detects cycles.

```
vigiles graph:
  CLAUDE.md → src/api/CLAUDE.md ✓
  CLAUDE.md → src/ui/CLAUDE.md  ✗ (file not found)
  src/api/CLAUDE.md → CLAUDE.md  (cycle detected ⚠)
```

---

## 12. Annotation Typo Detection

**Analog:** TypeScript strict mode / config key spell-check.

**User problem:** `**Enforced By:**` (wrong case), `**Enforce by:**` (wrong word), `**Guidance:**` (missing "only") — these silently fail to be recognized. The rule looks annotated to humans, but vigiles doesn't match it, producing confusing false positives.

**What vigiles provides:** Catches near-miss annotations via Levenshtein distance and suggests fixes.

```
CLAUDE.md:15  Near-miss: "**Enforced By:**" → did you mean "**Enforced by:**"?
CLAUDE.md:28  Near-miss: "**Guidance:**" → did you mean "**Guidance only**"?
```

Also optionally enforces `**Why:**` explanations: `{ "requireWhy": true }`

---

## Summary

| #   | Feature                | Programming Analog                   | User Problem Solved                                       |
| --- | ---------------------- | ------------------------------------ | --------------------------------------------------------- |
| 1   | **Plugin API**         | Railway composition / ESLint plugins | Can't add custom checks without forking                   |
| 2   | **Reverse Coverage**   | Code coverage (inverted)             | Agent follows 200 rules it doesn't understand             |
| 3   | **Dead Enforcement**   | Dead code / skipped tests            | "Enforced by X" but X is disabled in config               |
| 4   | **Snapshot Testing**   | Jest snapshots                       | Structural instruction changes slip through PRs           |
| 5   | **Stale References**   | Broken link checker                  | Rules reference deleted files/packages                    |
| 6   | **`init` Scaffolding** | `eslint --init` / generators         | Blank page problem — no one writes CLAUDE.md from scratch |
| 7   | **Token Budgets**      | Bundle size budgets                  | No visibility into context window cost                    |
| 8   | **Skill Coloring**     | Function coloring (pure/impure)      | Can't tell if a skill is safe to auto-run                 |
| 9   | **Hook Validation**    | Contract testing                     | Hooks break silently at runtime                           |
| 10  | **Instruction Diffs**  | Migration safety                     | Enforcement removed in PRs, nobody notices                |
| 11  | **Dependency Graph**   | Build DAG / import graph             | Cross-references to deleted instruction files             |
| 12  | **Typo Detection**     | Type checking / strict mode          | Near-miss annotations silently ignored                    |

---

## Research: Code Clone Detection & Deterministic Similarity Techniques

Collected April 2026 during investigation of [this Mastodon thread](https://neuromatch.social/@jonny/116328694967192899) about LLM code inconsistency — the same task implemented 3 different ways (set membership, regex, string methods).

### Clone Type Taxonomy

| Type       | What it catches                              | Deterministic?                       | Example                           |
| ---------- | -------------------------------------------- | ------------------------------------ | --------------------------------- |
| **Type-1** | Exact clones (modulo whitespace/comments)    | Yes                                  | Copy-paste with reformatting      |
| **Type-2** | Renamed identifiers/literals                 | Yes                                  | Same logic, different var names   |
| **Type-3** | Near-miss (added/deleted statements)         | Yes (with fixed threshold)           | Structural modifications          |
| **Type-4** | Semantically equivalent, textually different | **No** (undecidable, Rice's theorem) | `set.has(x)` vs `/regex/.test(x)` |

Type-4 is the core complaint from the post. It's provably undecidable in the general case.

### Practical Tools

#### Token-Based (Type-1/2) — Fast, CI-ready

- **[PMD CPD](https://pmd.github.io/pmd/pmd_userdocs_cpd.html)** — Token stream matching, 31 languages. GitLab CI integration, Maven plugin. More comprehensive than jscpd for 3+ duplications.
- **[jscpd](https://github.com/kucherenko/jscpd)** — Rabin-Karp hash fingerprinting, 150+ languages. ~1.4s for 100 files. npm package, Codacy/GitHub Actions integration.
- **[SourcererCC](https://arxiv.org/abs/1512.06448)** — Token-based inverted index. Scales to 250 MLOC on 12GB RAM, 86% precision. Research tool, not CI-native. Twice as fast as CCFinderX at largest input sizes.

#### AST Tree Edit Distance (Type-3) — Promising

- **[similarity-ts](https://github.com/mizchi/similarity)** — Rust-based, uses Bloom filter + APTED tree edit distance. Built specifically for detecting LLM-generated structural duplicates. <1s for 60K LOC. ~50x speedup from Bloom filter (5x) + multithreading (4x) combined. TypeScript/JS only.
- **[APTED](https://github.com/DatabaseGroup/apted)** — State-of-the-art optimal tree edit distance. O(n²) worst case. Requires pre-filtering for practical use (n functions = n(n-1)/2 comparisons).
- **[tree-sitter](https://tree-sitter.github.io/tree-sitter/)** — GLR parser used by similarity-ts and academic tools for AST generation across languages.

#### PDG / Graph-Based (Type-3/4) — Academic

- **CCGraph** (ASE 2020) — PDG + approximate graph matching. Catches non-contiguous clones but graph isomorphism is NP-complete.
- **Scorpio** — PDG subgraph isomorphism. Academic prototype.
- **[HideNoSeek](https://github.com/aurore54f/hidenoseek)** — Static data flow analysis for JS syntactic clones.

#### Locality-Sensitive Hashing

Hash code features into buckets where similar items collide. Probabilistic but tunable false-positive rate. Used as pre-filter in tools like SourcererCC.

### Key Insight

For CI today: jscpd/PMD CPD for copy-paste (seconds), similarity-ts for structural near-misses (sub-second, JS/TS only), custom lint rules for known patterns. Type-4 detection (semantically identical, textually different) remains unsolved in production.

### Markdown Structure Validation Tools

- **[mdschema](https://github.com/jackchuka/mdschema)** — Declarative YAML schema for markdown structure. Go binary with npm wrapper. Supports required/optional sections, regex heading patterns, nested children, count constraints, frontmatter validation, word counts, code block requirements, link validation. **Integrated into vigiles as `require-structure` rule.**
- **[markdown-validator](https://github.com/mattbriggs/markdown-validator)** — Declarative rules for Hugo/DocFX-style markdown.
- **[markdownlint](https://github.com/DavidAnson/markdownlint)** — Formatting rules (no skipped levels, consistent lists) but not structural schemas.
- **[Vale](https://vale.sh)** — Prose linter with YAML rule collections. Focuses on writing style, not document structure.

### AI in CI Research

The "LLM reviews PRs in CI" approach hasn't worked due to non-determinism. What works:

- **Semgrep** — AI helps _write_ custom rules, but rules run deterministically.
- **SonarQube** — Added LLM explanations of findings, detection stays rule-based.
- **[Factory.ai](https://factory.ai/news/using-linters-to-direct-agents)** — Linters direct agents, not the reverse.
- **Hybrid SAST + LLM post-processing** — 91% false positive reduction vs standalone Semgrep.

Pattern: **LLM proposes, deterministic tool disposes.** The CI gate stays deterministic.

---

## Competitive Landscape (April 2026)

15+ tools now exist in the AI agent instruction file space. Categorized below.

### Category 1: Linters / Validators (Direct Competitors)

| Tool | Focus | Key Differentiator |
|------|-------|-------------------|
| **[AgentLinter](https://github.com/seojoonkim/agentlinter)** | Content quality scoring for CLAUDE.md/AGENTS.md | A-F grading, security checks, token efficiency, vagueness detection. 30+ rules. Exports to Cursor/Copilot/Gemini formats |
| **[cclint (carlrannaberg)](https://github.com/carlrannaberg/cclint)** | Claude Code project structure | Validates entire `.claude/` directory: agent definitions, slash commands, settings.json hooks. Zod-based custom schemas |
| **[cclint (felixgeelhaar)](https://github.com/felixgeelhaar/cclint)** | CLAUDE.md best-practice validation | Independent tool with same name. TypeScript-based |
| **[claudelint](https://github.com/pdugan20/claudelint)** | Full Claude Code ecosystem | Broadest scope: CLAUDE.md + skills + settings + hooks + MCP servers + plugins. Circular reference detection. Auto-fix. Available as Claude Code plugin |
| **[cursor-doctor](https://github.com/nedcodes-ok/cursor-doctor)** | Cursor `.mdc` rule files | 100+ checks, 34 auto-fixers. A-F grading. 48 conflict-pattern checks across files. Glob pattern validation. Team drift detection. "82% of 50 real projects had broken rules" |
| **[claude-rules-doctor](https://github.com/nulone/claude-rules-doctor)** | `.claude/rules/` glob validity | Narrow: detects dead rules where `paths:` globs match no files |

### Category 2: Staleness / Drift Detection

| Tool | Focus | Key Differentiator |
|------|-------|-------------------|
| **[agents-lint](https://github.com/giacomo/agents-lint)** | Stale references in AGENTS.md | Most novel competitor. Verifies file paths exist, `npm run` scripts exist in package.json (with monorepo support), packages in manifests, flags deprecated packages (moment, request, tslint). Zero deps |

### Category 3: Rule Sync / Portability

| Tool | Focus |
|------|-------|
| **[Ruler](https://github.com/intellectronica/ruler)** | Single source of truth → auto-distributes to agent configs |
| **[rulesync](https://github.com/dyoshikawa/rulesync)** | Unified rule management CLI, 10+ AI tools |
| **[rule-porter](https://github.com/nedcodes-ok/rule-porter)** | Bidirectional format conversion between Cursor/Windsurf/CLAUDE.md/AGENTS.md/Copilot |
| **[block/ai-rules](https://github.com/block/ai-rules)** | Enterprise multi-agent rule management (by Block/Square) |
| **[vibe-cli](https://github.com/jinjos/vibe-cli)** | Unifies rules across Claude/Cursor/Copilot/Gemini |

### Category 4: Runtime Policy Engines (Adjacent)

| Tool | Focus |
|------|-------|
| **[Agent RuleZ](https://github.com/SpillwaveSolutions/agent_rulez)** | YAML policy engine for Claude Code hooks. Rust binary, sub-10ms, blocks dangerous ops |
| **[Vectimus](https://github.com/vectimus/vectimus)** | Cedar-based policy engine. 78 policies, sub-5ms, signed audit receipts, maps to OWASP/SOC2/NIST |
| **[Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit)** | Runtime governance infra. Sub-0.1ms per action. Framework-agnostic |

### vigiles Moat Analysis

**What we have that nobody else does:**
- `require-rule-file` — cross-references `**Enforced by:**` annotations against actual linter APIs (ESLint builtinRules, Stylelint rules, Ruff CLI, Clippy, Pylint, RuboCop). Checks both rule existence AND config-enabled status
- The annotation model itself — forcing every rule to declare enforcement mechanism or explicitly mark as guidance-only

**Gaps relative to competitors:**
- Staleness detection (agents-lint): file paths, scripts, packages
- Auto-fix: cursor-doctor (34 fixers), claudelint
- Conflict detection across files: cursor-doctor (48 patterns)
- `.claude/rules/` glob validation: claude-rules-doctor
- Hook/MCP/plugin validation: claudelint, cclint
- Scoring/grading (A-F): AgentLinter, cursor-doctor

**Strategic filter for new rules:** Only build rules that require knowing something mdschema can't know (filesystem state, linter configs, content semantics). Structural checks (heading hierarchy, required sections, max depth) belong in mdschema schemas, not vigiles rules.

---

## New Rule Ideas (Filtered for Moat)

### Tier 1: Moat-deepening (requires linter integration layer)

**`no-redundant-rules`** — Detect rules that restate what linters already enforce. If CLAUDE.md says "no console.log" and `eslint/no-console` is enabled in config, the rule is wasting tokens. Requires reading linter config (our moat).

**`suggest-enforcement`** — For `**Guidance only**` rules, scan installed linters and suggest matching rules. "This could be enforced by `eslint/no-restricted-imports` — consider upgrading." Requires linter rule catalogs (our moat).

### Tier 2: Content semantics (can't be done by mdschema)

**`annotation-typo-detection`** — Catch near-miss annotations via Levenshtein distance: `**Enforced By:**` (wrong case), `**Enforce by:**` (wrong word), `**Guidance:**` (missing "only"). ~20 lines, zero false positives. No other tool does this.

**`no-stale-file-refs`** — Extend `no-broken-links` from markdown links to backtick-wrapped file paths (`` `src/utils/logger.ts` ``). Filesystem check that mdschema can't do.

**`no-stale-scripts`** — Detect `npm run foo` references where script doesn't exist in package.json. Cross-file check. agents-lint does this but only for AGENTS.md.

**`no-stale-packages`** — Rules mentioning packages not in package.json / requirements.txt / Cargo.toml.

### Tier 3: Quality signals (content-level, not structural)

**`require-why`** — Every rule should have `**Why:**` rationale. Purely structural content check. Configurable.

**`no-todo-in-rules`** — Flag TODO/FIXME/HACK inside rule bodies. Unfinished rules shouldn't ship.

**`no-empty-rules`** — Rule marker followed immediately by another marker with no body.

**`no-duplicate-rules`** — Identical rule titles in same file. Pure string comparison.

### Tier 4: Cross-file (multi-agent)

**`cross-file-consistency`** — Same rule title with different enforcement across CLAUDE.md / .cursorrules / AGENTS.md. Catches drift when teams update one file and forget others.

### Not building (belongs in mdschema schemas)

- `heading-hierarchy` → `no_skip_levels: true` in schema
- `require-sections` → `children:` in schema
- `max-depth` → `max_depth: N` in schema
- `require-frontmatter` → `frontmatter:` in schema

### Not building (other tools' niche, not our moat)

- Full `.claude/` ecosystem validation → claudelint, cclint
- Hook/MCP/plugin checks → claudelint
- `.claude/rules/` glob validation → claude-rules-doctor
- A-F scoring/grading → different UX model, not a rule
- Auto-fix → useful but doesn't deepen the moat

---

## Real-World Pain Points (Research, April 2026)

Problems people actually report with AI instruction files, with citations:

### 1. File Too Long / Rules Ignored (HIGH FREQUENCY)
CLAUDE.md over ~200-300 lines → compliance drops sharply. ETH Zurich study: LLM-generated instruction files caused -3% task success, +20% cost. Over 50% of rules were noise.
- Sources: [HumanLayer](https://www.humanlayer.dev/blog/stop-claude-from-ignoring-your-claude-md), [DEV.to](https://dev.to/minatoplanb/i-wrote-200-lines-of-rules-for-claude-code-it-ignored-them-all-4639), [DEV.to](https://dev.to/alexefimenko/i-analyzed-a-lot-of-ai-agent-rules-files-most-are-making-your-agent-worse-2fl)

### 2. Vague / Unenforceable Directives (HIGH FREQUENCY)
"Write clean code," "Follow best practices" — infinite interpretations, zero behavioral change.
- Sources: [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md), [UX Planet](https://uxplanet.org/claude-md-best-practices-1ef4f861ce7c)

### 3. Stale / Broken File References (HIGH FREQUENCY)
Instruction files reference paths moved, renamed, or deleted. One audit found 59 broken references.
- Sources: [Packmind](https://packmind.com/evaluate-context-ai-coding-agent/), [agents-lint](https://giacomo.github.io/agents-lint/)

### 4. Contradictory Rules Across Files (MEDIUM FREQUENCY)
Root CLAUDE.md says "Use Prettier," subdirectory says "Use Biome." Agent picks one at random.
- Sources: [Cursor Forum](https://forum.cursor.com/t/issues-with-cursorrules-not-being-consistently-followed/59264)

### 5. Rules That Belong in Tooling (MEDIUM FREQUENCY)
"Don't use var" should be an ESLint rule, not a CLAUDE.md instruction. ~80% compliance via instruction vs 100% via linter.
- Sources: [Spotify Engineering](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3), [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### 6. "Lost in the Middle" Effect (RESEARCH-BACKED)
LLMs exhibit primacy/recency bias — rules buried in the middle of long files get deprioritized.
- Sources: [Context Windows - Goose Blog](https://block.github.io/goose/blog/2025/08/18/understanding-context-windows/), [Martin Fowler](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)

### 7. Missing Essential Sections (MEDIUM FREQUENCY)
GitHub analysis of 2,500+ AGENTS.md files: common omissions = executable commands, testing instructions, project structure, code style, git workflow.
- Sources: [GitHub Blog](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/), [AGENTS.md](https://agents.md/)

---

## Transferable Concepts from Other Linters

| Source Tool | Concept | vigiles Application |
|-------------|---------|-------------------|
| **hadolint** (Dockerfile) | Version pinning — flag vague refs that rot | `no-vague-enforcement`: flag `**Enforced by:** linter` without specific rule name |
| **actionlint** (GitHub Actions) | Reference validation — actions/jobs must exist | Already have `require-rule-file`. Extend to script/package refs |
| **commitlint** | Structural template enforcement | `require-why` (rationale), `rule-title-format` (consistent imperative titles) |
| **ShellCheck** | Portability warnings — bash-isms in sh scripts | `no-tool-specific-rules`: flag rules using tools only one agent has when project uses multiple agents |
| **Clippy** (Rust) | Severity tiers (correctness/suspicious/style/pedantic) | Could tier vigiles rules by impact, but current pass/fail model is simpler |
| **Pylint** (`R0801`) | Duplicate code detection | `no-duplicate-rules` across instruction files |
| **ESLint** (`no-shadow`) | Scope shadowing — inner var hides outer | `no-shadow-rules`: subdirectory CLAUDE.md redefines root rule with different enforcement |
| **Danger.js** | PR meta-checks — is it too big? changelog updated? | `instruction-file-hygiene`: was CLAUDE.md updated when architecture changed? |
