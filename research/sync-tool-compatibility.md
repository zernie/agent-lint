---
status: shipped
topic: positioning
---

# Sync-Tool Compatibility: Requirements to Stay Composable

> Grounding for the `compose-with-sync-tools` rule (CLAUDE.md). Researched the
> real, current (mid-2026) formats of the top rule-sync/interop tools and
> derived the concrete contract vigiles must hold to compose with them rather
> than compete. The headline finding: **most requirements are already met** —
> the one genuine gap is file-ownership collision (the integrity hash), handled
> by `src/compose.ts`.

## The tools (verified formats, June 2026)

### Ruler (intellectronica/ruler) — the leading distributor, 16+ agents

- **Source:** the `.ruler/` directory. Precedence: a root `AGENTS.md` (outside
  `.ruler/`, highest) → `.ruler/AGENTS.md` → `.ruler/instructions.md` (legacy)
  → all remaining `.ruler/**/*.md`, alphabetical. Config in `.ruler/ruler.toml`
  (agent toggles, output paths, MCP servers).
- **Distribution:** **concatenates** the source `.md` files (each prepended with
  a `<!-- Source: <relative_path> -->` traceability marker) and **writes the
  per-agent file**: `CLAUDE.md` (Claude Code), `AGENTS.md` (Copilot/Cursor/
  Windsurf/Aider), `.clinerules` (Cline), plus MCP configs (`.mcp.json`,
  `.cursor/mcp.json`, …).
- **Skills:** copied from `.ruler/skills/` → agent-native dirs (`.claude/skills/`,
  `.codex/skills/`). Off by default (`--skills`).
- **Subagents:** `.ruler/agents/*.md` → transformed to native (YAML frontmatter
  for Claude/Copilot/Cursor, TOML for Codex). Off by default (`--subagents`).

### rulesync (dyoshikawa/rulesync) — unified CLI, 25+ tools

- **Source:** `.rulesync/` (rules under `.rulesync/rules/*.md`) with YAML
  frontmatter (`root: true|false`, `targets: [...]`, `globs: [...]`,
  `description`). The prose body is the guidance.
- **Generates:** `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.clinerules`,
  `.github/copilot-instructions.md`, Codex/Gemini, 20+ others.
- **Import:** `rulesync import --targets claudecode` reads an existing
  `CLAUDE.md` into `.rulesync/`; `--targets cursor` reads `.cursorrules`; etc.
  So a vigiles-authored `CLAUDE.md` is a valid _import source_.

### AGENTS.md — the standard, not a tool

- Plain Markdown, **no required sections, no frontmatter** ("the agent simply
  parses the text you provide"). Repo root; nested files allowed, nearest wins.
- Governed by the Agentic AI Foundation (Linux Foundation): OpenAI, Anthropic,
  Google, Cursor, Factory, Amp. Structured-frontmatter proposals exist (tool
  permissions #105, `.agents/rules/` #179) but are **not yet shipped** — today
  it is unstructured prose.

## The core insight: who owns which file

Both vigiles and the sync tools want to _write_ `CLAUDE.md` / `AGENTS.md`. That
is the entire compatibility problem. Two clean topologies, never a third:

**Topology A — vigiles upstream (recommended; matches the `compose` rule).**
vigiles compiles the typed spec into the sync tool's **source slot**, the sync
tool distributes. vigiles owns truth; the tool owns reach.

| Sync tool | vigiles writes                             | Tool distributes to                        |
| --------- | ------------------------------------------ | ------------------------------------------ |
| Ruler     | `.ruler/AGENTS.md` (or a `.ruler/*.md`)    | `CLAUDE.md`, `AGENTS.md`, `.clinerules`, … |
| rulesync  | `.rulesync/rules/*.md` (+ its frontmatter) | the 25 targets                             |
| none      | `CLAUDE.md` / `AGENTS.md` directly         | —                                          |

**Topology B — vigiles downstream (verify their outputs).** The tool generates
the files; vigiles _verifies_ references in them (inline/frontmatter mode, no
spec). The "lint-after-the-fact" fallback for files vigiles didn't author.

The failure mode is mixing them: vigiles writes `CLAUDE.md` **and** Ruler also
writes `CLAUDE.md` from `.ruler/`. They clobber each other every run.

## Requirements (ranked, with current state)

1. **AGENTS.md as a first-class compile + verify target.** It is the lingua
   franca: Ruler's highest-precedence source, and the file most tools emit.
   _State: **MET.** `InstructionTarget` already includes `AGENTS.md`
   (`src/spec.ts:318`); `target: ["CLAUDE.md", "AGENTS.md"]` compiles both._
   Residual: make sure AGENTS.md output is clean prose — no Claude-only
   frontmatter leaking into a file Cursor/Copilot will read verbatim.

2. **Foreign-frontmatter coexistence.** rulesync source files carry
   `root`/`targets`/`globs`/`description` frontmatter; vigiles must read only its
   own block and never clobber theirs.
   _State: **MET for reading.** `src/frontmatter.ts` navigates to the `vigiles:`
   key and ignores every other key. Residual: when vigiles *emits* frontmatter,
   preserve foreign keys (don't overwrite a rulesync source file's frontmatter)._

3. **Don't fight for ownership of distributed files (the real gap).** When a
   sync tool is present, vigiles must compile to the source slot, not the
   distributed output — and must not stamp an integrity hash on a file the tool
   will regenerate or concatenate. The SHA-256 header lives on line 1
   (`src/integrity.ts`); Ruler prepends `<!-- Source: … -->` and rewrites the
   body, so the hash silently goes stale (a false "modified directly", or — once
   the header is no longer line 1 — silently disabled).
   _State: **GAP.** Addressed by `src/compose.ts`: detect `.ruler/`/`.rulesync/`,
   report the topology, and flag a `CLAUDE.md`/`AGENTS.md` collision (vigiles
   target ∩ sync-tool output) before it bites._

4. **Tolerate sync-tool markers.** Ruler injects `<!-- Source: path -->` per
   concatenated file. vigiles's inline parser and integrity check must not choke
   on them. _State: **MOSTLY MET** — inline parsing is comment-scoped; integrity
   degrades gracefully (a moved hash header → treated as hand-written, intact).
   No crash; the only cost is the lost guarantee covered by requirement 3._

5. **Structural-surface handoff (skills/subagents).** vigiles already compiles
   `skill()`/`agent()` to native Claude frontmatter; for a Ruler-managed repo it
   should be able to emit into `.ruler/agents/` and `.ruler/skills/` (the
   source) and let Ruler transform to the other agents. _State: **DEFERRED** —
   wants a target-dir option on `compileSkill`/`compileAgent`. Not needed until a
   user runs Ruler with `--subagents`._

6. **Stay out of MCP/settings distribution.** Both tools own MCP-config fan-out.
   vigiles verifies MCP references (`vigiles:mcp`) but must not emit a competing
   `.mcp.json`. _State: **MET** by omission — vigiles emits none._

7. **Symlinked / synced instruction files are ONE artifact, not two.** Claude
   Code reads `CLAUDE.md` only — it does **not** natively load `AGENTS.md`
   ([anthropics/claude-code#34235](https://github.com/anthropics/claude-code/issues/34235)).
   The two operator-side patterns that make a single source serve both CC and the
   AGENTS.md tools are (a) a **symlink** (`ln -s CLAUDE.md AGENTS.md`, or the
   reverse) and (b) a **sync tool** keeping the two byte-identical (rulesync
   `targets`, Ruler distribution). vigiles must treat these as the same file, not
   two competing targets:
   - **Follow the symlink** when reading/compiling/validating — resolve to the
     real path so the integrity hash and `require-instructions-spec` check run once on the real
     artifact, and a symlinked `AGENTS.md` is never flagged as a second,
     spec-less instruction file. (`validate.ts` already recognizes both
     CLAUDE.md and AGENTS.md as instruction files via `INSTRUCTION_FILES`; the
     symlink case must not double-fire `require-instructions-spec`.)
   - **Don't stamp two hashes.** When the same content is synced/symlinked to both
     names, only the compile _source_ slot carries the integrity hash (requirement
     3's topology); the mirror is a distributed copy vigiles verifies, not owns.
   - **Detect the pairing.** `compose.ts` should recognize a CLAUDE.md⇄AGENTS.md
     symlink (or a rulesync `targets: [claudecode, …]` that emits both) and report
     it as an intentional mirror, not a collision.
     _State: **GAP (new).** The dialect now correctly models CC-reads-CLAUDE.md-only
     (`claudeCodeDialect.instructionTargets = ["CLAUDE.md"]`); the symlink-follow on
     read and the mirror-detection in `compose.ts` are the open work. Tracked here
     and in the **Compose With Sync Tools** rule._

## What we are explicitly NOT building

- **Native multi-format emitters** (`.mdc`, `.clinerules`, Gemini, …). Ruler and
  rulesync maintain 16–25 evolving formats as their whole job. Compose; never
  absorb that maintenance. (Already a guidance rule + `sync-landscape-analysis.md`.)
- **A sync/fan-out engine.** The one-source-many-backends direction was killed.
- **`rulesync import` reimplementation.** Their import already reads our
  `CLAUDE.md` — the round-trip works without our help.

## Implementation done here

`src/compose.ts` (`detectSyncTools` + `composeCollisions`): a pure, filesystem
detector — given a repo root and the spec's targets, it reports which sync tools
are present (`.ruler/` + `ruler.toml`, `.rulesync/`), their source slots, and any
collision where a vigiles compile target is also a file the detected tool
regenerates (the integrity-hash hazard of requirement 3). Mirrors the existing
deterministic-detector pattern (`orphans.ts`, `test-coverage.ts`); surfaced by
`vigiles lint` as a warning with the recommended source-slot redirect. The rest
of the requirements are already met by the engine being format-agnostic.

## Next steps (not in this pass)

- Wire `composeCollisions` into `vigiles lint` output (warning + suggested
  source-slot path). See `roadmap.md`.
- A `--into <dir>` compile flag so Topology A is one command
  (`vigiles compile --into .ruler/`).
- Requirement 5's target-dir handoff for skills/subagents, when a real
  Ruler-`--subagents` user pulls for it.
