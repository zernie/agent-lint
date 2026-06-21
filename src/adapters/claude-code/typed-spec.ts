/**
 * Typed Claude Code authoring surface — the compile-time half of the purity
 * contract, bound to the Claude Code tool vocabulary.
 *
 * The core `agent()` / `skill()` builders (`vigiles/spec`) are generic over a
 * tool `ToolVocabulary` that DEFAULTS to fully-open (`string` at every purity
 * level), so they accept any tools — backwards-compatible, harness-agnostic.
 * This module re-binds them to the CONCRETE Claude Code vocabulary derived from
 * `claudeCodeDialect`, so authoring a spec with an invalid `purity`×`tools`
 * combination is a `tsc` error at EDIT TIME, before any vigiles command runs:
 *
 *   import { agent } from "vigiles/claude-code";
 *
 *   agent({ purity: "pure", tools: ["Read", "Bash"] });
 *   //                                       ^^^^^^ tsc error — Bash side-effecting
 *
 *   agent({ purity: "bounded", tools: ["Read", "Bash", "Write"] }); // OK
 *   agent({ purity: "bounded", tools: ["mcp__x__y"] });
 *   //                                  ^^^^^^^^^^^ tsc error — MCP not decidable
 *
 *   agent({ tools: ["anything", "mcp__x__y"] }); // no purity → open, OK
 *
 * This is a STRICT ADDITION to the runtime/compile checks: `purityViolations`
 * (`vigiles compile`) and `decidePurityGate` (the PreToolUse gate) are unchanged
 * and remain the universal backstop. In particular the command-level decision a
 * `bounded` unit makes for `Bash` (read-only command allowed, mutating denied)
 * is the RUNTIME gate's job — the type only admits the `Bash` TOOL at `bounded`.
 *
 * The CC literal tool names live ONLY in this adapter (and the dialect it reads
 * from), never in core — the hexagonal boundary that keeps the domain
 * harness-agnostic.
 */
import {
  agent as coreAgent,
  skill as coreSkill,
  type AgentSpec,
  type AgentSpecInput,
  type SkillSpec,
  type SkillSpecInput,
  type AuthoredPurity,
  type ToolVocabulary,
} from "../../core/spec.js";
import type {
  ClaudeCodeReadOnlyTool,
  ClaudeCodeBoundedTool,
} from "./dialect.js";

/**
 * The Claude Code tool vocabulary, split by the purity floor that admits each
 * tool (mirrors the runtime ladder in `core/effects.ts`):
 * - `readOnly`: tools a `pure` unit may declare (Read/Grep/Glob/LS).
 * - `bounded`:  read-only ∪ Write/Edit/MultiEdit/NotebookEdit ∪ `Bash`.
 */
export interface ClaudeCodeToolVocabulary extends ToolVocabulary {
  readonly readOnly: ClaudeCodeReadOnlyTool;
  readonly bounded: ClaudeCodeBoundedTool;
}

/**
 * Define a Claude Code subagent with the purity floor enforced AT COMPILE TIME
 * against the Claude Code tool catalog. Identical to the core `agent()` at
 * runtime (it IS the core builder); the only difference is the typed `tools`
 * constraint. `P` is inferred from the literal `purity` field.
 */
export function agent<const P extends AuthoredPurity | undefined = undefined>(
  spec: AgentSpecInput<P, ClaudeCodeToolVocabulary>,
): AgentSpec {
  return coreAgent<P, ClaudeCodeToolVocabulary>(spec);
}

/**
 * Define a Claude Code skill with the purity floor enforced AT COMPILE TIME
 * against the Claude Code tool catalog. Identical to the core `skill()` at
 * runtime; the typed `tools` constraint is the only difference.
 */
export function skill<const P extends AuthoredPurity | undefined = undefined>(
  spec: SkillSpecInput<P, ClaudeCodeToolVocabulary>,
): SkillSpec {
  return coreSkill<P, ClaudeCodeToolVocabulary>(spec);
}
