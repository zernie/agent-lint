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
 * Claude Code is the only dialect today (`claudeCodeDialect`, the default). A
 * second harness (Codex likely next) is added by defining a sibling
 * `HarnessDialect` — e.g. `src/adapters/codex/dialect.ts` exporting
 * `codexDialect` — and injecting it (`compileAgent(spec, { dialect })`). The
 * compiler reads these from the dialect, so the core never hard-codes one
 * harness's vocabulary: the format axis of the hexagonal boundary.
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

/**
 * The Claude Code dialect — the reference implementation and the compiler's
 * default. Adding Codex means a sibling object of this shape, not a core edit.
 */
export const claudeCodeDialect: HarnessDialect = {
  name: "claude-code",
  // The tool contract a subagent may declare — the rails it runs on. Anything
  // else must be an MCP tool, else it's a typo / nonexistent tool.
  builtinAgentTools: [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Grep",
    "Glob",
    "WebSearch",
    "WebFetch",
    "NotebookEdit",
    "TodoWrite",
    "Task",
    "Skill",
  ],
  // Tools the platform never exposes to a subagent, whatever the list says — so
  // a subagent listing one is a guaranteed-dead reference only a compiler catches.
  neverAvailableTools: [
    "Agent",
    "AskUserQuestion",
    "EnterPlanMode",
    "ExitPlanMode",
    "ScheduleWakeup",
    "WaitForMcpServers",
  ],
  mcpToolPattern: /^mcp__[a-z0-9_-]+__[a-z0-9_-]+$/i,
  hookEvents: [
    "PreToolUse",
    "PostToolUse",
    "PreSession",
    "PostSession",
    "Notification",
  ],
  instructionTargets: ["CLAUDE.md", "AGENTS.md"],
  pluginRootToken: "${CLAUDE_PLUGIN_ROOT}",
};

/** The dialect used when a compile call doesn't inject one. */
export const defaultDialect: HarnessDialect = claudeCodeDialect;
