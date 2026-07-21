/**
 * Browser-safe twin of `findUntestedSurfaces` (src/test-coverage.ts) — the same
 * untested-surface detection over an in-memory repo-relative file map instead of
 * a disk walk. `findUntestedSurfaces` globs the filesystem; this reimplements each
 * of its `globSync` calls as an `Object.keys(files).filter(...)` over the map, so
 * `scanFiles` reaches the SAME `untested` count with no disk I/O.
 *
 * Mirrors the disk detector exactly: the skill/agent surface globs (both the plain
 * and the materialize-root form), the hook-script discovery from the
 * manifest/settings/`.local` settings, the test-file globs (harness/eval/test
 * suffixes) with the same ignore set, the `vigiles:ignore-test` exemption, and the
 * colocation + content-reference coverage rules. See the parity test in
 * src/scan-files.test.ts.
 */
import { basename, dirname } from "node:path";

import type { PluginLayout } from "./core/layout.js";
import type { Surface, SurfaceKind } from "./test-coverage.js";

// Mirrors src/test-coverage.ts constants.
const DEFAULT_TEST_SUFFIXES = [
  ".harness.mjs",
  ".eval.mjs",
  ".test.ts",
  ".test.mts",
  ".test.cts",
  ".test.js",
  ".test.mjs",
  ".test.cjs",
] as const;

const IGNORE_MARKER = "vigiles:ignore-test";
const SCRIPT_RE = /[\w./${}@-]+\.(?:sh|mjs|cjs|js|ts|py|rb)/g;

/** Mirror of the DEFAULT_IGNORE globs (root-anchored), as a key predicate. */
function isIgnored(key: string): boolean {
  return /^(?:node_modules|dist|\.vigiles|\.git)\//.test(key);
}

/** Escape a literal path segment for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The two prefixes a surface dir can occupy (plain + materialize-root form). */
function surfacePrefixes(dir: string, materializeRoot: string): string[] {
  if (!dir) return [];
  const matForm = materializeRoot ? `${materializeRoot}/${dir}` : dir;
  return [...new Set([dir, matForm])];
}

/** Keys matching `<prefix>/<leafRe>` for any prefix, deduped + sorted (globSync order). */
function matchSurface(
  files: Record<string, string>,
  prefixes: string[],
  leafRe: string,
): string[] {
  const found = new Set<string>();
  for (const prefix of prefixes) {
    const re = new RegExp(`^${escapeRe(prefix)}/${leafRe}$`);
    for (const key of Object.keys(files)) {
      if (isIgnored(key)) continue;
      if (re.test(key)) found.add(key);
    }
  }
  return [...found].sort();
}

function discoverSkills(
  files: Record<string, string>,
  layout: PluginLayout,
): Surface[] {
  const out: Surface[] = [];
  if (layout.skillDir) {
    const prefixes = surfacePrefixes(layout.skillDir, layout.materializeRoot);
    for (const path of matchSurface(files, prefixes, "[^/]+/SKILL\\.md")) {
      const name = basename(dirname(path));
      const content = files[path];
      out.push({
        kind: "skill",
        path,
        name,
        tokens: [`${layout.skillDir}/${name}`, `:${name}`],
        ignored: content.includes(IGNORE_MARKER),
      });
    }
  }
  // Single-skill-directory target: a bare `SKILL.md` at the repo root.
  if (Object.prototype.hasOwnProperty.call(files, "SKILL.md")) {
    const name = "SKILL"; // browser has no real base dir name (see BROWSER_ROOT).
    const content = files["SKILL.md"];
    out.push({
      kind: "skill",
      path: "SKILL.md",
      name,
      tokens: [`${layout.skillDir}/${name}`, `:${name}`],
      ignored: content.includes(IGNORE_MARKER),
    });
  }
  return out;
}

function discoverAgents(
  files: Record<string, string>,
  layout: PluginLayout,
): Surface[] {
  const out: Surface[] = [];
  if (!layout.agentDir) return out;
  const prefixes = surfacePrefixes(layout.agentDir, layout.materializeRoot);
  for (const path of matchSurface(files, prefixes, "[^/]+\\.md")) {
    if (path.endsWith(".spec.ts")) continue;
    const content = files[path];
    const name = basename(path, ".md");
    const dir = dirname(path);
    out.push({
      kind: "agent",
      path,
      name,
      tokens: [`${dir}/${name}`],
      ignored: content.includes(IGNORE_MARKER),
    });
  }
  return out;
}

/** Hook-script paths referenced from a manifest's `hooks` block (file hooks only). */
function hookScripts(
  files: Record<string, string>,
  manifest: string,
  pluginRootToken: string,
): string[] {
  const text = files[manifest];
  if (text === undefined) return [];
  let hooks: unknown;
  try {
    hooks = (JSON.parse(text) as { hooks?: unknown }).hooks;
  } catch {
    return [];
  }
  if (hooks === undefined) return [];
  const raw = JSON.stringify(hooks);
  const unbraced = pluginRootToken.replace(/^\$\{(.+)\}$/, "$$$1");
  const scripts = new Set<string>();
  for (const m of raw.matchAll(SCRIPT_RE)) {
    const rel = m[0]
      .replaceAll(pluginRootToken, "")
      .replaceAll(unbraced, "")
      .replace(/^\/+/, "")
      .replace(/^\.\//, "");
    if (Object.prototype.hasOwnProperty.call(files, rel)) scripts.add(rel);
  }
  return [...scripts];
}

function discoverHooks(
  files: Record<string, string>,
  layout: PluginLayout,
): Surface[] {
  const scripts = new Set<string>();
  const localSettings = layout.settingsPath.replace(/(\.[^./]+)$/, ".local$1");
  const manifests = [
    ...new Set([layout.manifestPath, layout.settingsPath, localSettings]),
  ];
  for (const m of manifests) {
    for (const s of hookScripts(files, m, layout.pluginRootToken)) {
      scripts.add(s);
    }
  }
  return [...scripts].sort().map((path) => ({
    kind: "hook" as SurfaceKind,
    path,
    name: basename(path).replace(/\.[^.]+$/, ""),
    tokens: [path],
    ignored: false,
  }));
}

interface TestFile {
  readonly path: string;
  readonly content: string;
}

function discoverTests(files: Record<string, string>): TestFile[] {
  const out: TestFile[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (isIgnored(path)) continue;
    if (DEFAULT_TEST_SUFFIXES.some((s) => path.endsWith(s))) {
      out.push({ path, content });
    }
  }
  return out;
}

/** Mirror of test-coverage.ts `isColocated`. */
function isColocated(surface: Surface, testPath: string): boolean {
  if (surface.kind === "skill") {
    const dir = dirname(surface.path);
    return dir === "."
      ? dirname(testPath) === "."
      : testPath.startsWith(`${dir}/`);
  }
  return (
    dirname(testPath) === dirname(surface.path) &&
    basename(testPath).startsWith(`${surface.name}.`)
  );
}

function isCovered(surface: Surface, tests: readonly TestFile[]): boolean {
  for (const t of tests) {
    if (t.path === surface.path) continue;
    if (isColocated(surface, t.path)) return true;
    if (surface.tokens.some((tok) => t.content.includes(tok))) return true;
  }
  return false;
}

/**
 * The untested harness surfaces (skills / agents / hooks) in a file map — the
 * browser-safe twin of `findUntestedSurfaces`, returning only the `untested` list
 * (`scanFiles` needs the count). Same coverage rules as the disk detector.
 */
export function findUntestedSurfacesInFiles(
  files: Record<string, string>,
  layout: PluginLayout,
): { untested: Surface[] } {
  const surfaces: Surface[] = [
    ...discoverSkills(files, layout),
    ...discoverAgents(files, layout),
    ...discoverHooks(files, layout),
  ];
  const considered = surfaces.filter((s) => !s.ignored);
  const tests = discoverTests(files);
  const untested = considered.filter((s) => !isCovered(s, tests));
  return { untested };
}
