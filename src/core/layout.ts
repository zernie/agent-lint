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
   * Project-level dir under which an END-USER (not a plugin author) keeps the
   * same surfaces, e.g. `.claude` → `.claude/skills`, `.claude/agents`. When set,
   * the loader reads each surface from BOTH `<root>/<surface>` (the plugin /
   * skills-library shape) AND `<root>/<userSurfaceRoot>/<surface>` (the shape a
   * plain Claude Code user has), normalizing to the same materialized key. Most
   * Claude Code users are NOT publishing a plugin — their skills live here, so
   * without this the loader would see an empty machine for a normal repo.
   * Undefined ⇒ only the primary location is read (backwards-compatible).
   */
  readonly userSurfaceRoot?: string;
  // Where each model surface lives, by KIND — repo-relative dir names so the
  // scan/lint surface classifiers and the subagent-rule globs are layout-driven,
  // not hard-coded to Claude Code's `skills`/`agents`/`commands`. A harness that
  // names them differently (OpenCode's `.opencode/agent`, Codex's `prompts`)
  // declares its own, so adding a harness needs no change to the classifiers. A
  // harness without a surface still names a dir (it's simply never matched — the
  // subagent rules gate on `capabilities.subagents`).
  /** Skills dir, holding the nested `<dir>/<name>/SKILL.md`, e.g. `skills`. */
  readonly skillDir: string;
  /** Subagents dir, holding flat `<dir>/<name>.md`, e.g. `agents` (`""` = none). */
  readonly agentDir: string;
  /** Slash-commands dir, holding flat `<dir>/<name>.md`, e.g. `commands`. */
  readonly commandDir: string;
  /** Dir the surfaces are materialized under, e.g. `.claude`. */
  readonly materializeRoot: string;
  /** Env token expanded to the plugin's absolute root in hook commands. */
  readonly pluginRootToken: string;
  /**
   * Tokens that root a path at the PROJECT being scanned, braced form
   * (`${CLAUDE_PROJECT_DIR}`); the unbraced spelling is derived. Optional — a
   * harness with no such variable omits it.
   *
   * 🔴 SEPARATE FROM {@link pluginRootToken}, and its absence made a whole
   * surface kind invisible. `hookScripts` stripped only the plugin token, so a
   * project's own `"$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh"` — Claude Code's
   * DOCUMENTED spelling for a project hook, because hooks do not run with a
   * stable cwd — failed `existsSync` and was dropped. MEASURED on a real
   * consumer repo: `audit` listed sixteen hooks and the SURFACE list held zero.
   */
  readonly projectRootTokens?: readonly string[];
  /** Standalone MCP config file, e.g. `.mcp.json`. */
  readonly mcpConfigFile: string;
  /** Manifest key declaring MCP servers, e.g. `mcpServers`. */
  readonly mcpManifestKey: string;
  /** Dirs scanned for dangling intra-plugin file references. */
  readonly intraRefDirs: readonly string[];
}
