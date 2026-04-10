# Executable Specification Files

Design document for vigiles v2's spec-driven compilation model. The spec is the source of truth. The markdown is a build artifact.

---

## Summary

vigiles v2 introduces `.spec.ts` files — TypeScript source files that compile to instruction files (CLAUDE.md, SKILL.md). TypeScript's type system catches errors at authoring time. vigiles validates everything else at build time. The annotation model from v1 becomes a compile-time guarantee: you can't create a rule without calling `enforce()`, `check()`, or `guidance()`.

---

## Core Concept

```
CLAUDE.md.spec.ts  → compiles to →  CLAUDE.md
SKILL.md.spec.ts   → compiles to →  SKILL.md
```

- `.claude/settings.json` — validated in place (no spec needed)
- `vigiles.config.ts` — optional project-level settings
- Generated files carry a hash comment for tamper detection

---

## Three Rule Types

| Type          | Builder      | What it means                                                     | vigiles responsibility                              |
| ------------- | ------------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| **Delegated** | `enforce()`  | Backed by external linter (ESLint, Ruff, Clippy, Pylint, RuboCop) | Verify rule exists and is enabled in project config |
| **Checked**   | `check()`    | vigiles-owned filesystem assertion (e.g., test file pairing)      | Execute the assertion, fail build on violation      |
| **Guidance**  | `guidance()` | Prose-only, not mechanically enforced                             | Compile to `**Guidance only**` annotation           |

Delegated rules reuse the existing linter cross-referencing engine and extend to additional tools (ast-grep, Dependency Cruiser, Steiger). Checked rules are scoped to filesystem assertions only — vigiles does NOT reimplement architectural linting. Guidance rules are pass-through.

---

## Spec API

### `claude()` — CLAUDE.md spec

```ts
import { claude, enforce, check, guidance, every } from "vigiles/spec";

export default claude({
  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    "npm run fmt": "Format with prettier",
  },

  keyFiles: {
    "src/validate.ts": "Core validation engine",
    "src/cli.ts": "CLI entry point",
    "src/types.ts": "TypeScript type definitions",
  },

  sections: {
    Architecture: `
      TypeScript strict-mode codebase. Core engine in src/validate.ts.
    `,
  },

  rules: {
    "no-console-log-in-production": enforce(
      "eslint/no-console",
      "Use the structured logger which routes to Datadog.",
    ),

    "use-barrel-imports": enforce(
      "eslint/no-restricted-imports",
      "Prevents import path drift during refactoring.",
    ),

    "use-tailwind-spacing": guidance(
      "Use spacing scale values (p-4, m-8) instead of arbitrary values.",
    ),

    "controllers-have-tests": check(
      every("src/**/*.controller.ts").has("{name}.test.ts"),
      "Every controller must have a co-located test file.",
    ),
  },
});
```

Fields:

- `commands` — map of npm scripts/commands to descriptions. Verified against `package.json` at compile time.
- `keyFiles` — map of file paths to descriptions. Verified via `existsSync` at compile time.
- `sections` — map of section names to markdown prose. Pass-through.
- `rules` — map of rule IDs to `enforce()`, `check()`, or `guidance()` calls.

### `skill()` — SKILL.md spec

```ts
import { skill, file, cmd, ref } from "vigiles/spec";

export default skill({
  name: "run-tests",
  description: "Run the project test suite and report results",
  argumentHint: "--filter <pattern>",
  instructions: `
    1. Read ${file("jest.config.ts")} to understand the test setup
    2. Run ${cmd("npm test")} to execute the suite
    3. If tests fail, check ${ref("skills/debug/SKILL.md")} for debugging steps
  `,
});
```

Tagged template helpers:

- `file("path")` — verified file reference, compiles to backtick path. Fails if file doesn't exist.
- `cmd("npm test")` — verified command, compiles to backtick command. Checks `package.json` scripts.
- `ref("skills/other/SKILL.md")` — verified cross-reference. Fails if target doesn't exist.

### Rule builders

```ts
// Delegated — backed by external linter
enforce(linterRule: `${LinterName}/${string}`, why: string)

// Guidance — prose only
guidance(text: string)

// Proven — vigiles executes the check
check(assertion: Assertion, why: string)
```

### Proof assertions (future — ast-grep powered)

```ts
// Every file matching glob has a corresponding file matching pattern
every("src/**/*.controller.ts").has("{name}.test.ts");

// No file matching glob contains the AST pattern
no("src/**/*.ts").matches("console.log($$$)");

// Import boundaries between layers
layers({
  domain: { allow: [] },
  service: { allow: ["domain"] },
  handler: { allow: ["service", "domain"] },
});
```

- `every(glob).has(pattern)` — structural file pairing
- `no(glob).matches(astPattern)` — absence proof via AST
- `layers({...})` — import boundary verification

---

## Template Literal Types

TypeScript template literal types provide compile-time safety:

```ts
type LinterName =
  | "eslint"
  | "stylelint"
  | "ruff"
  | "clippy"
  | "pylint"
  | "rubocop";
type LinterRule = `${LinterName}/${string}`;

// Catches typos at authoring time
enforce("eslit/no-console", "...");
//       ^^^^^ Type error: "eslit" is not assignable to LinterName

type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SubagentStop";

type ClaudeTool =
  | "Read"
  | "Write"
  | "Edit"
  | "Bash"
  | "Glob"
  | "Grep"
  | "WebSearch"
  | "WebFetch"
  | "TodoWrite"
  | "NotebookEdit";

// Catches tool name typos in hook matchers
const hook: Hook = {
  event: "PostToolUse",
  matcher: ["Edti"], // Type error
  command: "npx prettier --check .",
};
```

---

## Compilation

`vigiles compile` reads spec files and generates markdown.

### Output format

Generated CLAUDE.md includes:

- Hash comment at top: `<!-- vigiles:sha256:HASH compiled from CLAUDE.md.spec.ts -->`
- `## Commands` section from `commands` map
- `## Key Files` section from `keyFiles` map
- Custom `## {name}` sections from `sections` map
- `## Rules` section with properly annotated rules under `###` headings

Generated SKILL.md includes:

- Hash comment at top
- YAML frontmatter (`name`, `description`, `argument_hint`)
- Instruction body with resolved `file()`, `cmd()`, `ref()` references

### Compile-time checks

| Check                                        | What fails             |
| -------------------------------------------- | ---------------------- |
| `commands` key not in `package.json` scripts | Unknown command        |
| `keyFiles` key doesn't exist on disk         | Stale file reference   |
| `file()` path doesn't exist                  | Broken file reference  |
| `cmd()` script not in `package.json`         | Unknown script         |
| `ref()` target doesn't exist                 | Broken cross-reference |
| `enforce()` rule not found in linter catalog | Unknown linter rule    |
| `enforce()` rule disabled in project config  | Dead enforcement       |
| `check()` assertion fails                    | Proof violation        |
| Compiled output exceeds `max-lines`          | File too long          |

---

## Hash Verification

Generated files carry a SHA-256 hash of their content (excluding the hash line itself).

On `vigiles check`:

1. Read the hash comment from the generated file
2. Recompute hash of content (excluding hash line)
3. If mismatch — file was manually edited after compilation
4. Report: `CLAUDE.md was modified after compilation. Run vigiles compile to regenerate, or vigiles adopt to pull changes back.`

This closes the loop: specs are the source of truth, but manual edits are detected rather than silently lost.

---

## Commands

| Command            | Purpose                                                       | Status  |
| ------------------ | ------------------------------------------------------------- | ------- |
| `vigiles compile`  | spec.ts files to .md files (with hash)                        | Phase 1 |
| `vigiles check`    | Validate everything: specs, hashes, linter cross-refs, proofs | Phase 1 |
| `vigiles adopt`    | Detect manual .md edits, help merge back into spec            | Phase 4 |
| `vigiles discover` | Scan linter configs, report coverage gaps                     | Phase 3 |

Existing v1 commands (`vigiles validate`, `vigiles` with file args) continue to work unchanged.

---

## Integration with Existing Linters

vigiles does NOT replace linters. Three relationships:

1. **Verify** — `enforce("eslint/no-console")` checks that the rule exists and is enabled. This is the existing `require-rule-file` behavior, moved to compile time.
2. **Fill gaps** — `check()` handles properties no single linter can express: cross-file pairing, import boundaries, AST absence across a codebase. Powered by ast-grep.
3. **Recommend** — if a `check()` assertion could be expressed as an existing linter rule, suggest delegating. Example: `no("src/**/*.ts").matches("console.log($$$)")` could be `enforce("eslint/no-console")`.

---

## What Replaces What

| v1 Rule               | v2 Equivalent                                                        | Why                                           |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| `require-annotations` | Type system — can't create rule without `enforce`/`guidance`/`prove` | Compile-time guarantee replaces runtime check |
| `max-lines`           | Build constraint on compiled output                                  | Constrain the artifact, not the source        |
| `require-rule-file`   | `enforce()` verification during compile                              | Same check, earlier in the pipeline           |
| `require-structure`   | Compiler generates correct structure                                 | We control the output format                  |
| `no-broken-links`     | `file()` and `ref()` verified at compile                             | Typed references replace regex scanning       |

v1 validation remains available for projects that don't adopt specs. No breaking changes.

---

## Migration from v1

- `vigiles init --from-claude-md` parses an existing CLAUDE.md and generates a `.spec.ts` file
  - `**Enforced by:** eslint/X` lines become `enforce("eslint/X", "...")`
  - `**Guidance only**` lines become `guidance("...")`
  - Commands, key files, and sections are extracted into the appropriate fields
- Existing `.vigilesrc.json` still works — v1 validation is unchanged
- Specs are opt-in — adoption is incremental, not a flag day

---

## Implementation Strategy

### Phase 1: Foundation

- Type definitions for spec system (`claude()`, `skill()`, `enforce()`, `guidance()`, `check()`)
- Builder functions with TypeScript template literal types
- Compiler: spec to markdown with hash
- `vigiles compile` and `vigiles check` commands
- `vigiles init --from-claude-md` migration tool

### Phase 2: Proofs

- ast-grep integration via `@ast-grep/napi`
- `every(glob).has(pattern)` — filesystem assertions
- `no(glob).matches(astPattern)` — AST pattern absence
- `layers({...})` — import graph analysis

### Phase 3: Discovery

- `vigiles discover` — scan linter configs, report coverage gaps
- Suggest undocumented rules that agents trip on frequently
- Reverse coverage: which enabled linter rules have no corresponding spec entry

### Phase 4: Adopt

- `vigiles adopt` — detect manual edits via hash mismatch
- Diff analysis to suggest spec updates
- Interactive merge workflow

---

## Technology Choices

| Choice                               | Why                                                                           | Alternatives considered                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **ast-grep** (`@ast-grep/napi`)      | 26 languages, Rust-fast, Node.js API, pattern syntax is readable              | tree-sitter raw (too low-level), Semgrep (can't embed, restrictive license) |
| **TypeScript specs** (not YAML/JSON) | Full type system, template literal types, IDE autocomplete, conditional logic | YAML (no type safety), JSON (no comments, no logic)                         |
| **SHA-256 hash**                     | Fast, built into Node.js crypto, collision-resistant                          | MD5 (deprecated), content-addressed CAS (overengineered)                    |
| **Compile-to-markdown**              | Agents read markdown natively, no runtime dependency on vigiles               | Custom binary format (agents can't read), JSON (poor agent UX)              |

### Future considerations

- **ESLint v10 inline plugins** — potential target for generating ESLint rules from `check()` assertions
- **TypeSpec emitter pattern** — one source, multiple outputs (CLAUDE.md + .cursorrules + AGENTS.md from single spec)
- **Pulumi model** — TypeScript as the authoring language for declarative output is a proven pattern

---

## Research Sources

| Source                                                     | Key insight                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| AST hallucination detection (arxiv 2601.19106)             | ast-grep achieves 100% precision, 87.6% recall for detecting AST-inconsistent code |
| Factory.ai: "Agents write the code; linters write the law" | Linters direct agents, not the reverse. vigiles is the bridge                      |
| Martin Fowler: "Harness Engineering" (Feb 2026)            | The harness (hooks, rules, CI) is as important as the agent itself                 |
| ETH Zurich: LLM-generated instruction files                | Reduce success by 3%, increase cost by 20%. Over 50% of rules were noise           |
| Spotify Honk                                               | 650+ agent PRs/month with strong feedback loops. Linter enforcement is critical    |
| CodeRabbit                                                 | AI-generated code has 1.7x more issues than human code. More enforcement, not less |
| TypeSpec emitter pattern                                   | One source of truth, multiple output formats. Proven at Azure scale                |
| Pulumi                                                     | TypeScript to declarative output. Developer ergonomics matter                      |

---

## Open Questions

1. **Spec file discovery** — should `vigiles compile` scan for `*.spec.ts` recursively, or require explicit listing in `vigiles.config.ts`?
2. **Proof caching** — ast-grep scans can be expensive. Cache proof results and invalidate on file change? Or always re-run?
3. **Multi-file specs** — can one spec import from another? Shared rule sets across teams?
4. **Watch mode** — `vigiles compile --watch` for development? Or rely on editor save hooks?
5. **Error recovery** — if one `enforce()` rule is unknown, should the whole compile fail or emit a warning annotation?
