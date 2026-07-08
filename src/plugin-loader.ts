/**
 * vigiles — harness-agnostic plugin/repo harness loader (composition root).
 *
 * Lives at the app/composition root, NOT in any harness adapter, so every
 * adapter (Claude Code, Codex, OpenCode, …) loads its plugin through the SAME
 * loader by injecting its own `PluginLayout` — no adapter imports a sibling
 * adapter. The unit that matters is not a single hook but the *assembled
 * machine*: the hooks, settings, instruction file, skills, subagents, and
 * commands a plugin/repo actually ships, working together. `loadPlugin` reads
 * that real harness so a `runHarnessTest` / `runEval` runs against what ships —
 * not a hand-retyped subset that can drift. Hooks, instruction file and skills
 * are exercisable at the deterministic tier; subagents/commands/MCP are
 * materialized but only run under a real model, so `LoadedPlugin.warnings` flags
 * them (no silent empty machine).
 *
 *   runHarnessTest({ plugin: "./", model: scriptModel([...]) });
 *
 * Resolution order for hooks: inline `hooks` in the layout's manifest, a `hooks`
 * string path in the manifest, the layout's `hooks` convention path (e.g.
 * obra/superpowers' `hooks/hooks.json`), then a plain repo's settings file.
 * The layout's plugin-root token in any hook command is expanded to the plugin's
 * absolute path, so the real hook scripts run from where they live (no copying
 * needed). The plugin's instruction file and skills/ are materialized into the
 * sandbox so the assembled context is present too.
 *
 * `layout` is REQUIRED here — there is no harness default at the composition
 * root. Each adapter supplies its own (the Claude Code wrapper at
 * `src/adapters/claude-code/plugin-loader.ts` defaults it to `claudeCodeLayout`
 * to preserve `loadPlugin(dir)` ergonomics and the public `vigiles/*` exports).
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, basename } from "node:path";

import { parse as parseToml } from "@iarna/toml";

import { assertNever } from "./core/hash.js";
import type { PluginLayout } from "./core/layout.js";

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
  /**
   * Map from a materialized `files` key to the ABSOLUTE on-disk path it was read
   * from. A surface can be materialized under a canonical key (`.claude/skills/
   * foo/SKILL.md`) while living on disk at a different root (the repo-root
   * `skills/` OR the project-level `.claude/skills/`), so a consumer that needs
   * the real dir (e.g. resolving a skill's bundled resources) must reverse-map
   * through this instead of guessing from the key. Present for every surface file.
   */
  readonly sources: Record<string, string>;
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
  layout: PluginLayout,
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
  const sources: Record<string, string> = {};
  const instructions = join(root, layout.instructionFile);
  if (existsSync(instructions)) {
    files[layout.instructionFile] = readFileSync(instructions, "utf-8");
    sources[layout.instructionFile] = instructions;
  }
  const counts = materializeSurfaces(root, layout, files, sources);

  return {
    settings: resolvedHooks ? { hooks: resolvedHooks } : {},
    files,
    sources,
    warnings: pluginWarnings(root, counts, resolvedHooks, files, layout),
  };
}

/**
 * Materialize every model surface (skills/agents/commands) into `files`, keyed by
 * a canonical `<materializeRoot>/<surface>/…` path, and record each file's real
 * on-disk path in `sources`. Best-effort (headless activation of plugin
 * skills/subagents/commands is not guaranteed; the body is present to read).
 *
 * Each surface is read from ONE of the two locations the layout knows about,
 * primary-first: `<root>/<surface>` (the published-plugin / skills-library shape)
 * when it exists, ELSE — when the layout declares one — the project-level
 * `<root>/<userSurfaceRoot>/<surface>` (the shape a PLAIN Claude Code user has,
 * not a plugin author). Preferring the primary means a plugin author's own local
 * `.claude/skills` dev skills don't pollute the audit of what their plugin
 * actually ships, while a plain user (no repo-root `skills/`) is still read. Plus
 * the single-skill-directory case (`<root>/SKILL.md`), so pointing at one skill
 * dir works. Whichever location is used normalizes to the same canonical key, so
 * the classifier and every downstream detector see one shape regardless of where
 * it lives on disk. Returns the per-surface counts (drives the surface warnings).
 */
/**
 * WHERE a repo's model surfaces (skills/agents/commands) live — PARSED from the
 * repo's shape ONCE (parse-don't-validate) so materialization never re-infers it
 * from a pile of ad-hoc booleans (the tangle that spawned repeated edge-case
 * bugs: empty dir, stray file, hook-only plugin, single-skill target). A tagged
 * union, one variant per real shape; a NEW shape is a new variant the exhaustive
 * `switch` below won't compile without handling — the whole point.
 */
type SurfaceSource =
  | { readonly kind: "single-skill"; readonly skillName: string } // `<root>/SKILL.md` — the target IS one skill
  | { readonly kind: "root" } // plugin / library / any root-surface content — read `<root>/<surface>`
  | { readonly kind: "user"; readonly sub: string } // plain user repo — read `<root>/<sub>/<surface>`
  | { readonly kind: "none" }; // nothing loadable anywhere

/**
 * A surface holds a LOADABLE file — a `<name>/SKILL.md` for skills, a `.md` for
 * agents/commands. A stray non-surface file (`skills/README.md`, `.gitkeep`) does
 * NOT count, else it would mark the root populated and shadow a plain user's real
 * `.claude/skills`.
 */
function surfaceHasLoadable(
  layout: PluginLayout,
  surface: string,
  tree: Record<string, string>,
): boolean {
  const keys = Object.keys(tree);
  return surface === layout.skillDir
    ? keys.some((k) => basename(k) === "SKILL.md")
    : keys.some((k) => k.endsWith(".md"));
}

/**
 * Classify the repo shape from disk, with EXPLICIT precedence:
 *  1. a `<root>/SKILL.md` → the target IS one skill dir (single-skill).
 *  2. any root-surface with LOADABLE content, OR a plugin manifest / hooks
 *     convention → read the ROOT surfaces. A plugin ships from its manifest even
 *     with no root surface dirs, so its dev `.claude/…` is never a fallback.
 *  3. else, if the layout declares a user-surface root → a plain user repo.
 *  4. else → nothing loadable.
 * Pure over the pre-read `rootTrees` + a few existence checks — one place to test.
 */
function classifySurfaceSource(
  root: string,
  layout: PluginLayout,
  rootTrees: ReadonlyMap<string, Record<string, string>>,
): SurfaceSource {
  if (layout.skillDir && existsSync(join(root, "SKILL.md"))) {
    return { kind: "single-skill", skillName: basename(root) };
  }
  const rootHasLoadable = layout.surfaceDirs.some((s) =>
    surfaceHasLoadable(layout, s, rootTrees.get(s) ?? {}),
  );
  const isPluginShaped =
    existsSync(join(root, layout.manifestPath)) ||
    existsSync(join(root, layout.hooksConventionPath));
  if (rootHasLoadable || isPluginShaped) return { kind: "root" };
  if (layout.userSurfaceRoot !== undefined) {
    return { kind: "user", sub: layout.userSurfaceRoot };
  }
  return { kind: "none" };
}

function materializeSurfaces(
  root: string,
  layout: PluginLayout,
  files: Record<string, string>,
  sources: Record<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const isDir = (p: string): boolean =>
    existsSync(p) && statSync(p).isDirectory();
  // Read each ROOT-level surface tree once (keys relative to the surface dir).
  const rootTrees = new Map<string, Record<string, string>>();
  for (const surface of layout.surfaceDirs) {
    const dir = join(root, surface);
    if (isDir(dir)) rootTrees.set(surface, readTree(dir, dir));
  }
  const add = (key: string, content: string, onDisk: string): void => {
    files[key] = content;
    sources[key] = onDisk;
  };

  const source = classifySurfaceSource(root, layout, rootTrees);
  switch (source.kind) {
    case "single-skill": {
      // Materialize the WHOLE skill dir under the canonical skills key, so its
      // bundled resources (scripts/references/assets) ship too, not just SKILL.md.
      const tree = readTree(root, root);
      for (const [rel, content] of Object.entries(tree)) {
        add(
          join(layout.materializeRoot, layout.skillDir, source.skillName, rel),
          content,
          join(root, rel),
        );
      }
      counts[layout.skillDir] = Object.keys(tree).length;
      break;
    }
    case "root":
    case "user": {
      const base = source.kind === "user" ? join(root, source.sub) : root;
      for (const surface of layout.surfaceDirs) {
        const dir = join(base, surface);
        // Root surfaces were pre-read; user surfaces are read fresh here.
        const tree =
          source.kind === "root"
            ? (rootTrees.get(surface) ?? {})
            : isDir(dir)
              ? readTree(dir, dir)
              : {};
        for (const [rel, content] of Object.entries(tree)) {
          add(join(layout.materializeRoot, surface, rel), content, join(dir, rel));
        }
        counts[surface] = Object.keys(tree).length;
      }
      break;
    }
    case "none":
      break;
    default:
      assertNever(source);
  }
  return counts;
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

// Shell vars that root a path OUTSIDE the plugin (the user's project / home), so
// a `surface/…` after one is NOT a plugin-root ref. Anything else ($ROOT,
// $PLUGIN_ROOT, ${CLAUDE_PLUGIN_ROOT}, …) is taken as the plugin root.
const NON_PLUGIN_VARS = new Set([
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_PROJECT",
  "HOME",
  "PWD",
  "OLDPWD",
]);

/**
 * Is a surface-dir match at `idx` actually rooted at the PLUGIN (so checkable
 * under `root`), vs nested under a literal dir or a project/home var? A match
 * preceded by a literal segment (`.claude/hooks/…` — a PROJECT path, the
 * gmickel/flow-next false positive) or a project var (`$CLAUDE_PROJECT_DIR/…`)
 * is NOT a plugin ref. A bare ref (`cat skills/…`) or one after a plugin-root
 * var (`${PLUGIN_ROOT}/skills/…`, obra/superpowers) IS.
 */
function isPluginRooted(content: string, idx: number): boolean {
  if (idx === 0 || content[idx - 1] !== "/") return true; // bare / after quote-space
  // The path component immediately before the separating slash.
  const seg = /([^\s"'`(=:/]*)$/.exec(content.slice(0, idx - 1))?.[1] ?? "";
  const varName = /^\$\{?(\w+)\}?$/.exec(seg)?.[1];
  if (varName !== undefined) return !NON_PLUGIN_VARS.has(varName); // a var root
  return false; // a literal dir segment → nested, not a plugin-root ref
}

// Documentation files (skill bodies, command docs, reference notes) are PROSE —
// a `skills/foo/SKILL.md` path inside them is almost always an example, a
// template placeholder (`wc -w skills/path/SKILL.md`), or a "❌ Bad" sample, not
// a real file operation. Scanning them produced near-100% false positives across
// real plugins (wshobson/agents, obra/superpowers), so we skip them as SOURCES.
// A path in an executable hook/helper script (incl. extensionless ones like
// obra/superpowers' `hooks/session-start`) IS a real file op — those we scan.
const DOC_SOURCE_RE = /\.(?:md|markdown|mdx|txt|rst)$/i;

/**
 * Intra-plugin file references that don't resolve — the partial-vendor / broken-
 * path class (e.g. obra/superpowers' `hooks/session-start` reads
 * `skills/using-superpowers/SKILL.md`, which a sliced vendor snapshot omits). We
 * scan the plugin's own EXECUTABLE files under the surface dirs (hook/helper
 * scripts — those aren't materialized into `files`) for root-relative path refs
 * and report the ones missing on disk. Documentation sources are deliberately
 * excluded (see `DOC_SOURCE_RE`) — a path in prose is undecidably ref-or-example,
 * the same heuristic-scanning anti-pattern reference verification rejects. A
 * static check that would have caught a bug the dogfood hit twice. Best-effort:
 * a warning, not an error.
 */
/** Path refs in `content` (matched by `re`) that don't resolve under `root`. */
function missingRefsIn(content: string, re: RegExp, root: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(re)) {
    if (m.index !== undefined && !isPluginRooted(content, m.index)) continue;
    if (!existsSync(join(root, m[0]))) out.push(m[0]);
  }
  return out;
}

/** The plugin's executable (non-prose) source files under the surface dirs. */
function executableSources(
  root: string,
  layout: PluginLayout,
): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const surface of layout.intraRefDirs) {
    const dir = join(root, surface);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const [path, content] of Object.entries(readTree(dir, root))) {
      if (!DOC_SOURCE_RE.test(path)) sources[path] = content; // skip prose
    }
  }
  return sources;
}

export function danglingRefs(root: string, layout: PluginLayout): string[] {
  const re = intraRefRe(layout);
  const missing = new Set<string>();
  for (const content of Object.values(executableSources(root, layout))) {
    for (const ref of missingRefsIn(content, re, root)) missing.add(ref);
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
 * `runEval` so both test the assembled machine the same way. `layout` is
 * REQUIRED (no harness default at the composition root) — the Claude Code
 * wrapper supplies `claudeCodeLayout` to preserve `resolveHarness(opts)`.
 */
export function resolveHarness(
  opts: {
    plugin?: string;
    settings?: unknown;
    files?: Record<string, string>;
  },
  layout: PluginLayout,
): { settings: unknown; files: Record<string, string> } {
  const loaded = opts.plugin
    ? loadPlugin(opts.plugin, layout)
    : { settings: {}, files: {} };
  return {
    files: { ...loaded.files, ...opts.files },
    settings: mergeSettings(loaded.settings, opts.settings),
  };
}
