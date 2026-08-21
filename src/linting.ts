/**
 * `vigiles/linting` — Pillar 1 entry point: the **linting layer** for instruction
 * files. The spec builders/types that describe a CLAUDE.md, a SKILL.md or an
 * agent, plus the public compile entry points, under one concern-named import.
 *
 * Curated (named, not `export *`) so the internal compiler validators, hash
 * helpers, and the linter cross-reference ENGINE stay out of the public surface,
 * the api reports, and the docs site (the CLI imports those from the source).
 *
 * 🔴 THAT SENTENCE USED TO BE FALSE, and so did the one after it (fixed
 * 2026-08-21). The file claimed to be curated while `export * from
 * "./core/spec.js"` sat one line below it, and it claimed "the spec builders are
 * also at the package root (`vigiles`)" — measured against `vigiles.api.md`: 191
 * exports there and zero matches for `claude`, `agent`, `enforce` or `result`.
 * The builders' second door is `vigiles/spec`, not the root. Both claims read as
 * documentation of a decision and were descriptions of the opposite one; a
 * header nobody re-reads is where an `export *` hides best.
 *
 * WHAT THE CURATION DROPS (28 symbols, measured — nothing in this repo imported
 * any of them from here; every in-repo user takes them from `vigiles/spec`, and
 * the one live consumer of this subpath in the docs takes `compileAgent`): the
 * typed-COMPOSITION family — `experimental_pipe`/`_pipeStep`/`_start`/
 * `_andThen`/`_needs`, `Pipeline`, `PipeStep`, `Supplies`, `Handoff`,
 * `NeedsContract`, `OkOf`, `TypedAgentSpec`, `TypedOutcome`, `Shape`,
 * `OutputFieldType` and the `result()` builder. Those verify HANDOFFS between
 * workers; they compile to nothing and lint nothing, so they are not pillar 1.
 *
 * ⚠️ The cut is not a clean slice along that line, and pretending otherwise
 * would strand a signature: the `result()` FUNCTION leaves, but the
 * `OutputContract` TYPE stays, because `compileAgent`/`compileSkill` name it in
 * their own types. A consumer who needs to BUILD one imports `vigiles/spec`.
 */

// --- the spec authoring builders: rules, refs, prose, and the three spec kinds ---
export {
  // instruction files
  instructionFile,
  prose,
  experimental_effect,
  // rules
  enforce,
  guidance,
  guard,
  // verified references
  file,
  cmd,
  symbol,
  ref,
  dir,
  glob,
  project,
  // the other two spec kinds + how a railway wires them
  experimental_skill,
  experimental_agent,
  railway,
  delegate,
  // ─── ОКНО АЛИАСА (один мажор) — see core/spec.ts for why a window is not
  // politeness here. Kept on THIS door too: a consumer importing `claude` from
  // `vigiles/linting` never saw `vigiles/spec`, so the window over there does
  // not cover them.
  /** @deprecated Renamed to `instructionFile`. Removed one major AFTER the one that introduces it. */
  claude,
  /** @deprecated Renamed to `prose`. Removed one major AFTER the one that introduces it. */
  instructions,
  /** @deprecated Renamed to `experimental_agent`. Removed one major AFTER the one that introduces it. */
  agent,
} from "./core/spec.js";

export {
  BUILTIN_LINTERS,
  type BuiltinLinter,
  type LinterRule,
  type VigilesRef,
  type EnforcementRef,
  type KnownLinterRules,
  type KnownProjectFiles,
  type KnownNpmScripts,
  type KnownAgentName,
  type StrictLinterRule,
  type StrictFile,
  type StrictCmd,
  type ToolVocabulary,
  type OpenToolVocabulary,
  type AllowedAt,
  type AuthoredPurity,
  type EnforceRule,
  type GuidanceRule,
  type GuardRule,
  type Rule,
  type VerifiedPath,
  type VerifiedCmd,
  type VerifiedRef,
  type VerifiedDir,
  type VerifiedGlob,
  type FileRef,
  type CmdRef,
  type SkillRef,
  type SymbolRef,
  type DirRef,
  type GlobRef,
  type Ref,
  type EffectRegion,
  type InstructionFragment,
  type InstructionTarget,
  type ClaudeSpec,
  type Gate,
  type RoleGate,
  type ProjectRole,
  type SkillInput,
  type SkillStep,
  type SkillSpec,
  type SkillSpecInput,
  type AgentSpec,
  type AgentSpecInput,
  type Railway,
  type RailwayStep,
  // Pinned by compileAgent/compileSkill's own signatures — see the ⚠️ above.
  type OutputContract,
} from "./core/spec.js";

// Compile: only the public entry points + their option/result types.
export {
  compileClaude,
  compileSkill,
  compileAgent,
  compileRailway,
  CompileError,
} from "./core/compile.js";
export type {
  CompileClaudeOptions,
  CompileClaudeResult,
  CompileSkillResult,
  CompileAgentResult,
  CompileRailwayOptions,
  CompileRailwayResult,
} from "./core/compile.js";

// core/linters is the cross-reference ENGINE (checkLinterRule/editDistance/…),
// consumed by compile — not part of the public authoring surface.
