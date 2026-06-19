/**
 * PluginLayout — the plugin/repo LAYOUT port (hexagonal format axis, the
 * filesystem half). A harness's plugin layout is where its instruction file,
 * skills, subagents, commands, hooks and settings live on disk, plus the env
 * token expanded to the plugin root. The loader (`loadPlugin`) reads those from
 * this descriptor instead of hard-coding Claude Code's `.claude-plugin/` /
 * `.claude/` conventions, so a second harness (Codex) supplies its own
 * `PluginLayout` and reuses the same loader.
 *
 * Paths are repo-relative (POSIX-style, `join`-friendly). The Claude Code
 * implementation is `claudeCodeLayout` in `src/adapters/claude-code/layout.ts`.
 */
export interface PluginLayout {
  /** Stable identifier, e.g. "claude-code". */
  readonly name: string;
  /** Plugin manifest, e.g. `.claude-plugin/plugin.json`. */
  readonly manifestPath: string;
  /** Convention path for a standalone hooks file, e.g. `hooks/hooks.json`. */
  readonly hooksConventionPath: string;
  /** Repo settings carrying hooks, e.g. `.claude/settings.json` or `.codex/config.toml`. */
  readonly settingsPath: string;
  /**
   * How the settings file is encoded — `"json"` (Claude Code's settings.json) or
   * `"toml"` (Codex's `config.toml` `[hooks]`). The loader dispatches a parser on
   * it, so a TOML-configured harness's hooks aren't silently read as zero.
   */
  readonly settingsFormat: "json" | "toml";
  /** Top-level instruction file, e.g. `CLAUDE.md`. */
  readonly instructionFile: string;
  /** Surface dirs materialized into the sandbox, e.g. skills/agents/commands. */
  readonly surfaceDirs: readonly string[];
  /**
   * Where each model surface lives, by KIND — repo-relative dir names so the
   * scan/lint surface classifiers and the subagent-rule globs are layout-driven,
   * not hard-coded to Claude Code's `skills`/`agents`/`commands`. A harness that
   * names them differently (OpenCode's `.opencode/agent`, Codex's `prompts`)
   * declares its own, so adding a harness needs no change to the classifiers.
   * `skillDir` holds the nested `<dir>/<name>/SKILL.md`; `agentDir`/`commandDir`
   * hold flat `<dir>/<name>.md`. A harness without a surface still names a dir
   * (it's simply never matched — the subagent rules gate on
   * `capabilities.subagents`).
   */
  readonly skillDir: string;
  readonly agentDir: string;
  readonly commandDir: string;
  /** Dir the surfaces are materialized under, e.g. `.claude`. */
  readonly materializeRoot: string;
  /** Env token expanded to the plugin's absolute root in hook commands. */
  readonly pluginRootToken: string;
  /** Standalone MCP config file, e.g. `.mcp.json`. */
  readonly mcpConfigFile: string;
  /** Manifest key declaring MCP servers, e.g. `mcpServers`. */
  readonly mcpManifestKey: string;
  /** Dirs scanned for dangling intra-plugin file references. */
  readonly intraRefDirs: readonly string[];
}
