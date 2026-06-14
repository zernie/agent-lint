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

import { parse as parseToml } from "@iarna/toml";

import type { PluginLayout } from "../../core/layout.js";
import { claudeCodeLayout } from "./layout.js";

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

const MAX_SKILL_FILE_BYTES = 256 * 1024;

/** Parse a JSON file, or null on any error (missing / malformed). */
function safeReadJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read and return the `.hooks` field of a JSON file, or undefined on any error. */
function readHooksFile(path: string): unknown {
  return safeReadJson(path)?.hooks;
}

/**
 * Parse the layout's manifest in its declared `settingsFormat` — JSON (Claude
 * Code's plugin.json) or TOML (Codex's `config.toml`). A TOML harness's manifest
 * (hooks, `[mcp_servers]`) would otherwise read as empty through the JSON path.
 * Behaviour-identical to `safeReadJson` when the format is JSON.
 */
function safeReadManifest(
  root: string,
  layout: PluginLayout,
): Record<string, unknown> | null {
  const path = join(root, layout.manifestPath);
  if (layout.settingsFormat === "toml") {
    try {
      return parseToml(readFileSync(path, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return safeReadJson(path);
}

/**
 * Read the `.hooks` field of a settings file in the layout's format — JSON
 * (Claude Code's settings.json) or TOML (Codex's `config.toml` `[hooks]`). A
 * TOML harness's hooks would otherwise be read as zero by the JSON path.
 */
function readSettingsHooks(path: string, format: "json" | "toml"): unknown {
  if (format === "json") return readHooksFile(path);
  try {
    return (parseToml(readFileSync(path, "utf-8")) as Record<string, unknown>)
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
function readHooks(root: string, layout: PluginLayout): unknown {
  // A malformed manifest must not crash the loader — fall through to the
  // other layouts (safeReadManifest returns null on a parse error). Format-aware
  // so a Codex `config.toml` manifest's `[hooks]` is read, not skipped.
  const m = safeReadManifest(root, layout);
  if (m) {
    if (typeof m.hooks === "string") return readHooksFile(join(root, m.hooks));
    if (m.hooks !== undefined) return m.hooks;
  }
  const conventionPath = join(root, layout.hooksConventionPath);
  if (existsSync(conventionPath)) return readHooksFile(conventionPath);

  const settingsPath = join(root, layout.settingsPath);
  if (existsSync(settingsPath))
    return readSettingsHooks(settingsPath, layout.settingsFormat);

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
export function loadPlugin(
  pluginPath: string,
  layout: PluginLayout = claudeCodeLayout,
): LoadedPlugin {
  const root = resolve(pluginPath);
  const hooks = readHooks(root, layout);
  // Expand the plugin-root token to the real absolute path so the actual hook
  // scripts execute — we test the shipped wiring, not a reimplementation.
  const resolvedHooks = hooks
    ? (JSON.parse(
        JSON.stringify(hooks).replaceAll(layout.pluginRootToken, root),
      ) as unknown)
    : undefined;

  const files: Record<string, string> = {};
  const instructions = join(root, layout.instructionFile);
  if (existsSync(instructions)) {
    files[layout.instructionFile] = readFileSync(instructions, "utf-8");
  }
  // Materialize each project-level surface under the materialize root so the
  // assembled context is present in the sandbox (best-effort — headless
  // activation of plugin skills/subagents/commands is not guaranteed; the body
  // is present for the agent to read either way). Counting what we materialize
  // also lets us warn about surfaces the deterministic tier can't drive.
  const counts: Record<string, number> = {};
  for (const surface of layout.surfaceDirs) {
    const dir = join(root, surface);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const tree = readTree(dir, root);
    for (const [rel, content] of Object.entries(tree)) {
      files[join(layout.materializeRoot, rel)] = content;
    }
    counts[surface] = Object.keys(tree).length;
  }

  return {
    settings: resolvedHooks ? { hooks: resolvedHooks } : {},
    files,
    warnings: pluginWarnings(root, counts, resolvedHooks, files, layout),
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
  layout: PluginLayout,
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
  if (hasMcp(root, layout)) {
    warnings.push(
      `plugin declares MCP server(s) (${layout.mcpManifestKey} / ${layout.mcpConfigFile}) — the loader does not wire MCP; bring the server up yourself if your test needs it.`,
    );
  }
  const dangling = danglingRefs(root, layout);
  if (dangling.length) {
    const shown = dangling.slice(0, 5).join(", ");
    const more =
      dangling.length > 5 ? `, … (+${String(dangling.length - 5)})` : "";
    warnings.push(
      `plugin references ${String(dangling.length)} intra-plugin file(s) that don't exist (broken path / partial vendor): ${shown}${more}`,
    );
  }
  if (!hooks && Object.keys(files).length === 0) {
    warnings.push(
      `nothing was loaded (no hooks, CLAUDE.md, skills, agents, or commands) — the deterministic harness would run an effectively empty machine.`,
    );
  }
  return warnings;
}

/** Whether the plugin declares any MCP servers (manifest key or standalone file).
 *  Format-aware: reads the layout's `mcpManifestKey` from a JSON OR TOML manifest,
 *  so Codex's `[mcp_servers]` TOML table is detected, not silently missed. */
function hasMcp(root: string, layout: PluginLayout): boolean {
  if (existsSync(join(root, layout.mcpConfigFile))) return true;
  return safeReadManifest(root, layout)?.[layout.mcpManifestKey] !== undefined;
}

// A plugin-relative path reference to a file under a standard surface dir, with a
// known extension — e.g. a hook script that `cat`s `skills/using-superpowers/SKILL.md`.
const INTRA_REF_EXTS = "md|sh|cmd|mjs|cjs|js|ts|py|rb|txt|json";
function intraRefRe(layout: PluginLayout): RegExp {
  return new RegExp(
    `(?:${layout.intraRefDirs.join("|")})/[A-Za-z0-9._/-]+\\.(?:${INTRA_REF_EXTS})`,
    "g",
  );
}

/**
 * Intra-plugin file references that don't resolve — the partial-vendor / broken-
 * path class (e.g. obra/superpowers' `SessionStart` reads
 * `skills/using-superpowers/SKILL.md`, which a sliced vendor snapshot omits). We
 * scan the plugin's own text files under the surface dirs (hooks scripts
 * included — those aren't materialized into `files`) for root-relative path refs
 * and report the ones missing on disk. A static check that would have caught a
 * bug the dogfood hit twice. Best-effort: a warning, not an error.
 */
function danglingRefs(root: string, layout: PluginLayout): string[] {
  const missing = new Set<string>();
  const seen = new Set<string>();
  const re = intraRefRe(layout);
  for (const surface of layout.intraRefDirs) {
    const dir = join(root, surface);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const content of Object.values(readTree(dir, root))) {
      for (const m of content.matchAll(re)) {
        const ref = m[0];
        if (seen.has(ref)) continue;
        seen.add(ref);
        if (!existsSync(join(root, ref))) missing.add(ref);
      }
    }
  }
  return [...missing];
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
