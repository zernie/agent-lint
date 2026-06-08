/**
 * vigiles — load a real plugin/repo harness for testing.
 *
 * The unit that matters is not a single hook but the *assembled machine*: the
 * hooks, settings, CLAUDE.md, skills, subagents, and commands a plugin/repo
 * actually ships, working together. `loadPlugin` reads that real harness so a
 * `runHarnessTest` / `runEval` runs against what ships — not a hand-retyped
 * subset that can drift. Hooks, CLAUDE.md and skills are exercisable at the
 * deterministic tier; subagents/commands/MCP are materialized but only run under
 * a real model, so `LoadedPlugin.warnings` flags them (no silent empty machine).
 *
 *   runHarnessTest({ plugin: "./", model: scriptModel([...]) });
 *
 * Resolution order for hooks: inline `hooks` in `.claude-plugin/plugin.json`, a
 * `hooks` string path in plugin.json, the `hooks/hooks.json` convention (e.g.
 * obra/superpowers), then a plain repo's `.claude/settings.json`. `${CLAUDE_
 * PLUGIN_ROOT}` in any hook command is expanded to the plugin's absolute path,
 * so the real hook scripts run from where they live (no copying needed). The
 * plugin's CLAUDE.md and skills/ are materialized into the sandbox so the
 * assembled context is present too.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

export interface LoadedPlugin {
  /** A `.claude/settings.json`-shaped object with hooks resolved. */
  readonly settings: { hooks?: unknown };
  /** Files to materialize in the sandbox (CLAUDE.md, skills, agents, commands). */
  readonly files: Record<string, string>;
  /**
   * Surfaces that are present in the plugin but cannot be exercised at the
   * deterministic tier (subagents and slash commands need a real model; MCP
   * servers aren't wired by the loader). Empty when the plugin is fully
   * covered. Surfaced so "load the whole plugin" never silently tests nothing —
   * read it in a test, or just to know what the deterministic run won't reach.
   */
  readonly warnings: readonly string[];
}

interface PluginManifest {
  hooks?: unknown;
  skills?: string;
  mcpServers?: unknown;
}

const MAX_SKILL_FILE_BYTES = 256 * 1024;

/** Read and return the `.hooks` field of a JSON file, or undefined on any error. */
function readHooksFile(path: string): unknown {
  try {
    return (JSON.parse(readFileSync(path, "utf-8")) as { hooks?: unknown })
      .hooks;
  } catch {
    return undefined;
  }
}

/**
 * Read the hooks block, handling the real-world plugin layouts:
 *   1. inline `hooks` object in .claude-plugin/plugin.json,
 *   2. a `hooks` *string* in plugin.json pointing at a hooks JSON file,
 *   3. the `hooks/hooks.json` convention (e.g. obra/superpowers) — auto-discovered,
 *   4. a plain repo's `.claude/settings.json`.
 */
function readHooks(root: string): unknown {
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    if (typeof m.hooks === "string") return readHooksFile(join(root, m.hooks));
    if (m.hooks !== undefined) return m.hooks;
  }
  const conventionPath = join(root, "hooks", "hooks.json");
  if (existsSync(conventionPath)) return readHooksFile(conventionPath);

  const settingsPath = join(root, ".claude", "settings.json");
  if (existsSync(settingsPath)) return readHooksFile(settingsPath);

  return undefined;
}

/** Recursively collect text files under `dir` as `relativePath → contents`. */
function readTree(dir: string, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      Object.assign(out, readTree(full, base));
    } else if (st.isFile() && st.size <= MAX_SKILL_FILE_BYTES) {
      out[relative(base, full)] = readFileSync(full, "utf-8");
    }
  }
  return out;
}

/**
 * Load the real harness at `pluginPath`. Returns the resolved settings (hooks),
 * the files (CLAUDE.md + skills + agents + commands) to write into the test
 * sandbox, and `warnings` for surfaces the deterministic tier can't drive. Merge
 * `settings` with any inline settings and spread `files` into the fixture.
 */
export function loadPlugin(pluginPath: string): LoadedPlugin {
  const root = resolve(pluginPath);
  const hooks = readHooks(root);
  // Expand ${CLAUDE_PLUGIN_ROOT} to the real absolute path so the actual hook
  // scripts execute — we test the shipped wiring, not a reimplementation.
  const resolvedHooks = hooks
    ? (JSON.parse(
        JSON.stringify(hooks).replaceAll("${CLAUDE_PLUGIN_ROOT}", root),
      ) as unknown)
    : undefined;

  const files: Record<string, string> = {};
  const claudeMd = join(root, "CLAUDE.md");
  if (existsSync(claudeMd)) {
    files["CLAUDE.md"] = readFileSync(claudeMd, "utf-8");
  }
  // Materialize each project-level surface under .claude/<surface>/ so the
  // assembled context is present in the sandbox (best-effort — headless
  // activation of plugin skills/subagents/commands is not guaranteed; the body
  // is present for the agent to read either way). Counting what we materialize
  // also lets us warn about surfaces the deterministic tier can't drive.
  const counts: Record<string, number> = {};
  for (const surface of ["skills", "agents", "commands"]) {
    const dir = join(root, surface);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const tree = readTree(dir, root);
    for (const [rel, content] of Object.entries(tree)) {
      files[join(".claude", rel)] = content;
    }
    counts[surface] = Object.keys(tree).length;
  }

  return {
    settings: resolvedHooks ? { hooks: resolvedHooks } : {},
    files,
    warnings: pluginWarnings(root, counts, resolvedHooks, files),
  };
}

/**
 * Flag surfaces present-but-not-deterministically-exercisable. Subagents
 * (`agents/`) and slash commands (`commands/`) are materialized into the sandbox
 * but only run under a real model (Task / slash invocation), so they belong to
 * the eval tier. MCP servers aren't wired by the loader at all. And a plugin
 * that yields neither hooks nor files would otherwise be a silent empty machine.
 */
function pluginWarnings(
  root: string,
  counts: Record<string, number>,
  hooks: unknown,
  files: Record<string, string>,
): string[] {
  const warnings: string[] = [];
  if (counts.agents) {
    warnings.push(
      `plugin defines ${String(counts.agents)} subagent file(s) under agents/ — these run only under a real model; test them at the eval tier (runEval), not the deterministic mock.`,
    );
  }
  if (counts.commands) {
    warnings.push(
      `plugin defines ${String(counts.commands)} slash-command file(s) under commands/ — slash-command invocation needs a real model; test at the eval tier.`,
    );
  }
  if (hasMcp(root)) {
    warnings.push(
      `plugin declares MCP server(s) (mcpServers / .mcp.json) — the loader does not wire MCP; bring the server up yourself if your test needs it.`,
    );
  }
  if (!hooks && Object.keys(files).length === 0) {
    warnings.push(
      `nothing was loaded (no hooks, CLAUDE.md, skills, agents, or commands) — the deterministic harness would run an effectively empty machine.`,
    );
  }
  return warnings;
}

/** Whether the plugin declares any MCP servers (manifest field or .mcp.json). */
function hasMcp(root: string): boolean {
  if (existsSync(join(root, ".mcp.json"))) return true;
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    return m.mcpServers !== undefined;
  } catch {
    return false;
  }
}

type HooksObj = { hooks?: Record<string, unknown[]> };

/**
 * Merge a loaded plugin's settings with inline settings. Inline wins; when both
 * declare hooks, the per-event arrays are concatenated (plugin hooks first), so
 * a test can layer an extra hook on top of the real plugin. Returns `undefined`
 * when neither side has hooks (so the caller skips `--settings`).
 */
function mergeSettings(base: { hooks?: unknown }, override: unknown): unknown {
  const baseHasHooks = base.hooks !== undefined;
  if (override === undefined) return baseHasHooks ? base : undefined;
  if (!baseHasHooks) return override;
  const b = base as HooksObj;
  const o = override as HooksObj;
  const events = new Set([
    ...Object.keys(b.hooks ?? {}),
    ...Object.keys(o.hooks ?? {}),
  ]);
  const hooks: Record<string, unknown[]> = {};
  for (const e of events) {
    hooks[e] = [...(b.hooks?.[e] ?? []), ...(o.hooks?.[e] ?? [])];
  }
  return { ...o, hooks };
}

/**
 * Resolve the effective harness for a test/eval (arm): load the plugin if given,
 * then layer inline settings + files on top. Shared by `runHarnessTest` and
 * `runEval` so both test the assembled machine the same way.
 */
export function resolveHarness(opts: {
  plugin?: string;
  settings?: unknown;
  files?: Record<string, string>;
}): { settings: unknown; files: Record<string, string> } {
  const loaded = opts.plugin
    ? loadPlugin(opts.plugin)
    : { settings: {}, files: {} };
  return {
    files: { ...loaded.files, ...opts.files },
    settings: mergeSettings(loaded.settings, opts.settings),
  };
}
