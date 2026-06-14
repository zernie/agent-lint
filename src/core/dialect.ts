/**
 * HarnessDialect — the format/dialect PORT (see
 * `research/code-adapter-architecture.md`, the format axis).
 *
 * The compiler needs a handful of harness-specific facts to verify and render an
 * instruction file: the built-in tool catalog a subagent may declare, the tools
 * the platform never exposes, the shape of an MCP tool reference, the hook
 * events the harness fires, the instruction-file targets it reads, and the env
 * token expanded to the plugin root. Those used to be hard-coded literals inside
 * `compile.ts`; here they are a single named value behind an interface.
 *
 * Claude Code is the reference dialect today (`claudeCodeDialect`, defined in its
 * adapter at `src/adapters/claude-code/dialect.ts`). A second harness (Codex
 * likely next) is added by defining a sibling `HarnessDialect` — e.g.
 * `src/adapters/codex/dialect.ts` exporting `codexDialect` — and injecting it
 * (`compileAgent(spec, { dialect })`). The compiler reads these from the injected
 * dialect, so the core never hard-codes — nor even defines — one harness's
 * vocabulary: the concrete dialects live in the adapters, only this interface
 * lives in the core. That is the format axis of the hexagonal boundary.
 */
export interface HarnessDialect {
  /** Stable identifier, e.g. "claude-code". */
  readonly name: string;
  /** Built-in tools a subagent may list in its `tools:` contract. */
  readonly builtinAgentTools: readonly string[];
  /** Tools the platform never exposes to a subagent (a listed one is dead). */
  readonly neverAvailableTools: readonly string[];
  /** Matches an MCP tool reference, e.g. `mcp__server__tool`. */
  readonly mcpToolPattern: RegExp;
  /** Hook event names the harness fires. */
  readonly hookEvents: readonly string[];
  /** Instruction-file targets the harness reads (also the h1 heading). */
  readonly instructionTargets: readonly string[];
  /** The env token expanded to the plugin root in hook commands. */
  readonly pluginRootToken: string;
}
