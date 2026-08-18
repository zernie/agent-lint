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
  /**
   * Subagents dir, holding `<dir>/<name>.md` at ANY depth, e.g. `agents`
   * (`""` = none). The depth rule, and the identifier that depth implies, are
   * stated once in {@link AGENT_FILE_LEAF_RE} and {@link agentSurfaceName} —
   * read those before writing a fourth thing that walks this dir.
   */
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

/**
 * How DEEP a harness reads its {@link PluginLayout.agentDir} — the one statement
 * of that rule, as a RegExp source fragment matching the part of a path AFTER
 * `<agentDir>/`. Anchor-free on purpose, so each caller can bound it its own way
 * (`(?:^|/)agents/` + this + `$` in the scan classifier; `^<prefix>/` + this +
 * `$` in the coverage discoverers).
 *
 * 🔴 IT USED TO SAY `[^/]+`, in THREE independent places, and the vendor
 * documents the opposite. Verbatim from `https://code.claude.com/docs/en/sub-agents`:
 *
 * > Claude Code scans `.claude/agents/` and `~/.claude/agents/` **recursively**,
 * > so you can organize definitions into subfolders such as `agents/review/` or
 * > `agents/research/`.
 *
 * > **Plugin `agents/` directories are also scanned recursively.** Unlike project
 * > and user scopes, a subfolder inside a plugin's `agents/` directory becomes
 * > part of the scoped identifier: a file at `agents/review/security.md` in
 * > plugin `my-plugin` registers as `my-plugin:review:security`.
 *
 * Measured 2026-08-18 on `rsmdt/the-startup` @ `88d447c7`: 16 agent files under
 * `plugins/team/agents/`, 2 read. The plugin was still GRADED — B (80/100) over
 * 12.5% of its subagents — so the number was not merely incomplete, it was
 * flattering. Twelve real malformed-frontmatter defects sat in the unread 87.5%.
 *
 * The three readers are the scan classifier (`makeClassifier`, scan-core.ts) and
 * the two coverage discoverers (`test-coverage.ts`, `test-coverage-files.ts`).
 * They disagreed silently because each spelled the rule itself; they now quote
 * this. A fourth reader that hard-codes a depth is the defect coming back.
 */
export const AGENT_FILE_LEAF_RE = "(?:.+/)?[^/]+\\.md";

/**
 * A subagent's identity, per the same docs paragraph: the path under
 * `<agentDir>/` with `/` → `:` and the `.md` dropped, so plugin
 * `agents/review/security.md` is `review:security` (the scoped identifier minus
 * its plugin prefix, which the scan of a single plugin dir does not know).
 *
 * 🔴 NOT COSMETIC — it is what keeps recursion from introducing a defect of its
 * own. A basename cannot be unique once the dir is read recursively:
 * `agents/a/review.md` and `agents/b/review.md` would both be "review", and the
 * delegation graph keys agents BY NAME (`pathByName`, `delegatesTo`), so one
 * would silently swallow the other's path and neither would delegate to its
 * namesake. A path-derived name is unique by construction, so that collision has
 * nowhere to live. Degenerates to today's basename for a top-level agent, which
 * is why no existing report changes.
 *
 * Returns null when `path` holds no `<agentDir>/` segment (not an agent file).
 */
export function agentSurfaceName(
  path: string,
  agentDir: string,
): string | null {
  if (!agentDir) return null;
  const marker = `${agentDir}/`;
  // The FIRST occurrence sitting at a real path boundary — start-of-path or just
  // after a `/`. Both halves matter and one of them is easy to get wrong:
  // requiring the boundary stops `my-agents/x.md` being read as `agents/x.md`,
  // and CONTINUING the search past a non-boundary hit is what keeps this
  // agreeing with the classifier, whose `(?:^|/)agents/` skips the same way.
  // Taking `indexOf` once and rejecting it would return null for
  // `myagents/x/agents/y.md` — a path the classifier calls an agent — so the two
  // would disagree about the very file they are both looking at.
  let at = -1;
  for (
    let i = path.indexOf(marker);
    i !== -1;
    i = path.indexOf(marker, i + 1)
  ) {
    if (i === 0 || path[i - 1] === "/") {
      at = i;
      break;
    }
  }
  if (at === -1) return null;
  const tail = path.slice(at + marker.length);
  if (tail === "" || !tail.endsWith(".md")) return null;
  return tail.slice(0, -".md".length).split("/").join(":");
}
