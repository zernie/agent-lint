/**
 * The Claude Code dialect (format axis) — this adapter's `HarnessDialect`. The
 * canonical value lives in `src/core/dialect.ts` because it is the compiler's
 * default (the core needs a default without importing an adapter); it is
 * re-exported here so the adapter surface (`vigiles/claude-code`) owns its
 * dialect symmetrically. A second harness DEFINES its own dialect in its adapter
 * (e.g. `src/adapters/codex/dialect.ts` exporting `codexDialect`) and injects it
 * via `compileAgent(spec, { dialect })`.
 */
export { claudeCodeDialect } from "../../core/dialect.js";
export type { HarnessDialect } from "../../core/dialect.js";
