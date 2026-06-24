/**
 * `vigiles/linting` — Pillar 1 entry point: the **linting layer** for instruction
 * files. Re-exports the spec builders/types + the public compile entry points
 * under one concern-named import. This is the canonical pillar-1 surface; the
 * spec builders are also at the package root (`vigiles`).
 *
 * Curated (named, not `export *`) so the internal compiler validators, hash
 * helpers, and the linter cross-reference ENGINE stay out of the public surface,
 * the api reports, and the docs site (the CLI imports those from the source).
 */
// The spec authoring builders (claude/enforce/guidance/file/cmd/agent/skill/…).
export * from "./core/spec.js";

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
