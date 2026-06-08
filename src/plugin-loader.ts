/**
 * vigiles — load a real plugin/repo harness for testing.
 *
 * The unit that matters is not a single hook but the *assembled machine*: the
 * hooks, settings, CLAUDE.md, and skills a plugin/repo actually ships, working
 * together. `loadPlugin` reads that real harness so a `runHarnessTest` /
 * `runEval` runs against what ships — not a hand-retyped subset that can drift.
 *
 *   runHarnessTest({ plugin: "./", model: scriptModel([...]) });
 *
 * Resolution order for hooks: `<plugin>/.claude-plugin/plugin.json` (the plugin
 * manifest), else `<plugin>/.claude/settings.json` (a plain repo). `${CLAUDE_
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
  /** Files to materialize in the sandbox (CLAUDE.md, skills). */
  readonly files: Record<string, string>;
}

interface PluginManifest {
  hooks?: unknown;
  skills?: string;
}

const MAX_SKILL_FILE_BYTES = 256 * 1024;

/** Read the hooks block from a plugin manifest or a repo's settings.json. */
function readHooks(root: string): unknown {
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    return m.hooks;
  }
  const settingsPath = join(root, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const s = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      hooks?: unknown;
    };
    return s.hooks;
  }
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
 * Load the real harness at `pluginPath`. Returns the resolved settings (hooks)
 * and the files (CLAUDE.md + skills) to write into the test sandbox. Merge
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
  // Skills are materialized under the project-level skills dir (best-effort —
  // headless plugin-skill activation is not guaranteed; the body is present for
  // the agent to read either way).
  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    for (const [rel, content] of Object.entries(readTree(skillsDir, root))) {
      files[join(".claude", rel)] = content;
    }
  }

  return {
    settings: resolvedHooks ? { hooks: resolvedHooks } : {},
    files,
  };
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
