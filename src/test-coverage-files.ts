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
 * declaration + colocation + content-reference coverage rules. See the parity
 * test in src/scan-files.test.ts.
 *
 * The part that DECIDES coverage is not mirrored — it is imported from
 * `coverage-evidence.ts` (pure, browser-safe), so the twins cannot drift on the
 * one thing whose divergence would change a grade.
 *
 * 🔴 THE ONE TIER THIS TWIN CANNOT HAVE, stated rather than left to be inferred:
 * the disk detector answers "tested?" from EXECUTION first — `.vigiles/coverage.json`,
 * written by `vigiles test` / `vigiles eval` (see `coverage-artifact.ts`). This
 * engine scans a file map fetched from GitHub. There is no filesystem, no runner,
 * and nothing here ever ran a test, so a run record is not merely absent — it is
 * not a thing that can exist in this environment. The honest answer is therefore
 * "no runs", which is exactly what the disk detector reports for a repo with no
 * artifact, so the two agree by construction: `countEvidence` returns
 * `executed: 0` here and the parity gate (src/scan-files.test.ts) holds without
 * a special case. Faking an artifact — say, from a committed JSON in the map —
 * would report a measurement nobody in this process made.
 */
import { basename, dirname } from "./posix-path.js";

import type { PluginLayout } from "./core/layout.js";
import type {
  CoverageDecision,
  CoverageTier,
  Surface,
  SurfaceKind,
} from "./test-coverage.js";
import {
  evidenceFor,
  prepareTest,
  type PreparedTest,
} from "./coverage-evidence.js";

// Mirrors src/test-coverage.ts constants. VALUES are re-declared, never imported
// — test-coverage.ts pulls in node:fs/glob, and this twin must stay browser-safe.
const EVAL_SUFFIX = ".eval.mjs";

const DEFAULT_TEST_SUFFIXES = [
  ".harness.mjs",
  EVAL_SUFFIX,
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

function discoverTests(files: Record<string, string>): PreparedTest[] {
  const out: PreparedTest[] = [];
  for (const path of Object.keys(files)) {
    if (isIgnored(path)) continue;
    if (DEFAULT_TEST_SUFFIXES.some((s) => path.endsWith(s))) {
      out.push(prepareTest(path));
    }
  }
  return out;
}

/** Mirror of test-coverage.ts `isColocated` — named after the surface, beside it. */
function isColocated(surface: Surface, testPath: string): boolean {
  if (!basename(testPath).startsWith(`${surface.name}.`)) return false;
  return dirname(testPath) === dirname(surface.path);
}

/** Mirror of test-coverage.ts `coverageOf` — strongest evidence across tests. */
function coverageOf(
  surface: Surface,
  tests: readonly PreparedTest[],
): CoverageDecision | null {
  let best: CoverageDecision | null = null;
  for (const t of tests) {
    if (t.path === surface.path) continue;
    const ev = evidenceFor(surface, t, isColocated(surface, t.path));
    if (!ev) continue;
    if (!best) best = { surface, evidence: ev, by: t.path };
  }
  return best;
}

/** Mirror of test-coverage.ts `tierOf` — one tier's covered/untested split. */
function tierOf(
  considered: readonly Surface[],
  tests: readonly PreparedTest[],
): CoverageTier {
  const covered: Surface[] = [];
  const untested: Surface[] = [];
  const decisions: CoverageDecision[] = [];
  for (const s of considered) {
    const decision = coverageOf(s, tests);
    if (decision) {
      covered.push(s);
      decisions.push(decision);
    } else {
      untested.push(s);
    }
  }
  return { covered, untested, decisions };
}

/**
 * The untested harness surfaces (skills / agents / hooks) in a file map — the
 * browser-safe twin of `findUntestedSurfaces`, returning the union `untested` list
 * plus the same per-tier split (`scanFiles` needs the counts). Same coverage rules
 * as the disk detector; the tier split is by suffix, exactly as on disk.
 */
export function findUntestedSurfacesInFiles(
  files: Record<string, string>,
  layout: PluginLayout,
): {
  untested: Surface[];
  decisions: readonly CoverageDecision[];
  harness: CoverageTier;
  evals: CoverageTier;
} {
  const surfaces: Surface[] = [
    ...discoverSkills(files, layout),
    ...discoverAgents(files, layout),
    ...discoverHooks(files, layout),
  ];
  const considered = surfaces.filter((s) => !s.ignored);
  const tests = discoverTests(files);
  const union = tierOf(considered, tests);
  return {
    untested: [...union.untested],
    decisions: union.decisions,
    harness: tierOf(
      considered,
      tests.filter((t) => !t.path.endsWith(EVAL_SUFFIX)),
    ),
    evals: tierOf(
      considered,
      tests.filter((t) => t.path.endsWith(EVAL_SUFFIX)),
    ),
  };
}
