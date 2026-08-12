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
  declaredSurfaceName,
  evidenceFor,
  hookScriptRefs,
  isEvalScript,
  prepareTest,
  type PreparedTest,
} from "./coverage-evidence.js";

// Mirrors src/test-coverage.ts constants. VALUES are re-declared, never imported
// — test-coverage.ts pulls in node:fs/glob, and this twin must stay browser-safe.
const DEFAULT_TEST_SUFFIXES = [
  ".harness.ts",
  ".harness.mts",
  ".harness.cts",
  ".harness.js",
  ".harness.mjs",
  ".harness.cjs",
  ".eval.ts",
  ".eval.mts",
  ".eval.cts",
  ".eval.js",
  ".eval.mjs",
  ".eval.cjs",
] as const;

const IGNORE_MARKER = "vigiles:ignore-test";

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
  repoName: string,
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
  //
  // 🔴 THIS HARD-CODED THE STRING `"SKILL"` while the disk detector used the
  // DECLARED `name:`. For a single-skill repo declaring `name: foo`, the disk
  // engine counted a top-level `foo.harness.mjs` as colocated coverage and this
  // one — the SAME audit over the same files, just fetched from GitHub — called
  // the skill untested and lowered its Tested score. The parser is now the shared
  // `declaredSurfaceName`, so there is no second copy to fall behind, and the
  // fallback is the repo name the caller supplies, mirroring the disk detector's
  // `basename(basePath)` (a browser has no real base dir — see BROWSER_ROOT).
  if (Object.prototype.hasOwnProperty.call(files, "SKILL.md")) {
    const content = files["SKILL.md"];
    const name = declaredSurfaceName(content) ?? repoName;
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

/**
 * Hook-script paths referenced from a manifest's `hooks` block (file hooks only).
 *
 * 🔴 THIS USED TO BE A SECOND IMPLEMENTATION, and it was the one that stayed
 * broken: it stripped only the PLUGIN token, so a repo whose settings spell a
 * hook as `$CLAUDE_PROJECT_DIR/.claude/hooks/a.sh` yielded ONE hook surface here
 * where the disk detector yielded FOUR. The parsing now lives in
 * `hookScriptRefs` (coverage-evidence.ts) — one implementation, so the next root
 * token cannot be added to one reader and not the other. This wrapper supplies
 * only what is genuinely browser-specific: the manifest text and existence both
 * come from the file map, not a filesystem.
 */
function hookScripts(
  files: Record<string, string>,
  manifest: string,
  layout: PluginLayout,
): string[] {
  return hookScriptRefs(files[manifest], layout, (rel) =>
    Object.prototype.hasOwnProperty.call(files, rel),
  );
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
    for (const s of hookScripts(files, m, layout)) {
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
  /**
   * The audited repo's name — the browser's stand-in for the disk detector's
   * `basename(basePath)`, used only to name a root `SKILL.md` that declares no
   * `name:`. Same value `scanFiles` already threads for the skill inventory.
   */
  repoName: string,
): {
  untested: Surface[];
  decisions: readonly CoverageDecision[];
  harness: CoverageTier;
  evals: CoverageTier;
} {
  const surfaces: Surface[] = [
    ...discoverSkills(files, layout, repoName),
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
      tests.filter((t) => !isEvalScript(basename(t.path))),
    ),
    evals: tierOf(
      considered,
      tests.filter((t) => isEvalScript(basename(t.path))),
    ),
  };
}
