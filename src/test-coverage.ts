/**
 * Untested-surface detection: the third gap detector, alongside orphan-docs.
 *
 * Stale-ref detection catches specs pointing at files that vanished.
 * Orphan-docs catches docs nothing references. This catches harness *surfaces*
 * — skills, subagents, and hooks — that ship without a test or eval. A surface
 * with no test is a probabilistic-compliance gap hiding in the deterministic
 * layer: nothing measures whether it still does what it claims.
 *
 * Two detectors decide "tested", OR'd, so a test placed ANYWHERE counts:
 *   1. colocation — a `*.{harness,eval}.mjs` next to the surface (the zero-config
 *      convention the warning suggests): `skills/foo/*.eval.mjs`,
 *      `agents/bar.harness.mjs`, `hooks/pre-edit.harness.mjs`.
 *   2. content-reference — any discovered test (incl. `*.test.ts`) that names the
 *      surface by PATH (`skills/foo`, `hooks/pre-edit.sh`) or NAMESPACE
 *      (`vigiles:foo`). Not bare-name — too fuzzy.
 *
 * Warning-by-default (a nudge, not a gate). EVERY skill, agent, and hook is held
 * to the requirement — invocation mode does NOT exempt anything (a command-only
 * skill still DOES something when invoked, and that behaviour is worth a test).
 * The only opt-out is explicit: a `vigiles:ignore-test` marker in the surface
 * file, which is reported as `exempt` so the skip is visible, never silent.
 *
 * TWO TIERS, discovered SEPARATELY — a harness and an eval are not the same thing
 * and collapsing them at discovery makes the difference unrecoverable downstream:
 *
 *   | | harness (`*.harness.mjs`, `*.test.*`) | eval (`*.eval.mjs`) |
 *   |---|---|---|
 *   | cost    | free                          | paid model calls    |
 *   | cadence | every push                    | scheduled           |
 *   | answers | "does this gate still catch what it claims?" | "does this skill FIRE at all?" |
 *
 * So a repo with complete deterministic coverage and no evals is a DIFFERENT
 * position from a repo with neither, and "add a test/eval" spans three orders of
 * magnitude in cost without saying which. {@link UntestedReport} therefore carries
 * a per-tier {@link CoverageTier} alongside the (unchanged) union fields.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { globSync } from "glob";
import type { PluginLayout } from "./core/layout.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";

/**
 * The two on-disk locations a surface dir can occupy: the plugin-root form
 * (`skills/…`) and the materialized form (`.claude/skills/…`) — derived from the
 * layout so a non-Claude-Code harness (its own `materializeRoot` / surface dir)
 * is discovered without hard-coding `.claude`. An empty `dir` (a harness lacking
 * the surface, e.g. Codex subagents) yields no globs.
 */
function surfaceGlobs(
  dir: string,
  leaf: string,
  materializeRoot: string,
): string[] {
  if (!dir) return [];
  const matForm = materializeRoot ? `${materializeRoot}/${dir}` : dir;
  return [...new Set([`${dir}/${leaf}`, `${matForm}/${leaf}`])];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurfaceKind = "skill" | "agent" | "hook";

export interface Surface {
  readonly kind: SurfaceKind;
  /** Repo-relative path to the surface file (SKILL.md / agent .md / hook script). */
  readonly path: string;
  /** Stable name: skill dir, agent basename, or hook script basename. */
  readonly name: string;
  /** Substrings a test may reference to "cover" this surface (path / namespace). */
  readonly tokens: readonly string[];
  /** Explicitly opted out of the test requirement via `vigiles:ignore-test`. */
  readonly ignored: boolean;
}

/** One tier's split of the considered surfaces — covered by THAT tier, or not. */
export interface CoverageTier {
  readonly covered: readonly Surface[];
  readonly untested: readonly Surface[];
}

export interface UntestedReport {
  /** Total surfaces considered (after exemptions). */
  readonly total: number;
  /** Covered by EITHER tier — the union, unchanged (a test anywhere counts). */
  readonly covered: readonly Surface[];
  /** Covered by NEITHER tier — the union, unchanged. */
  readonly untested: readonly Surface[];
  /** Surfaces explicitly opted out via `vigiles:ignore-test`. */
  readonly exempt: number;
  /**
   * DETERMINISTIC coverage only — `*.harness.mjs` and `*.test.*`. Free,
   * millisecond, every-push. Answers "does this gate still catch what it claims?"
   */
  readonly harness: CoverageTier;
  /**
   * REAL-MODEL coverage only — `*.eval.mjs`. Paid, minutes, scheduled. Answers
   * the one question the deterministic tier cannot: "does this skill FIRE at all?"
   */
  readonly evals: CoverageTier;
}

export interface TestCoverageOptions {
  /** Repository root. Defaults to `process.cwd()`. */
  readonly basePath?: string;
  /** Scan skills under `skills/` and `.claude/skills/`. Default true. */
  readonly skills?: boolean;
  /** Scan subagents under `agents/` and `.claude/agents/`. Default true. */
  readonly agents?: boolean;
  /** Scan hook scripts referenced from plugin.json / settings.json. Default true. */
  readonly hooks?: boolean;
  /** Globs of test files that count as coverage. */
  readonly testGlobs?: readonly string[];
  /** Extra ignore globs (added to node_modules/dist/.git/.vigiles). */
  readonly exclude?: readonly string[];
  /**
   * Harness layout — where skills/agents live, the plugin-root token, the
   * manifest/settings paths. Defaults to Claude Code; a non-CC adapter passes its
   * own so the surface globs and hook-token expansion aren't hard-coded.
   */
  readonly layout?: PluginLayout;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** The REAL-MODEL tier's suffix — the one file kind that costs money to run. */
const EVAL_SUFFIX = ".eval.mjs";

const DEFAULT_TEST_GLOBS = [
  "**/*.harness.mjs",
  `**/*${EVAL_SUFFIX}`,
  "**/*.test.ts",
  "**/*.test.mts",
  "**/*.test.cts",
  "**/*.test.js",
  "**/*.test.mjs",
  "**/*.test.cjs",
] as const;

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  ".vigiles/**",
  ".git/**",
] as const;

const IGNORE_MARKER = "vigiles:ignore-test";

const SCRIPT_RE = /[\w./${}@-]+\.(?:sh|mjs|cjs|js|ts|py|rb)/g;

function read(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function discoverSkills(
  basePath: string,
  ignore: string[],
  layout: PluginLayout,
): Surface[] {
  const out: Surface[] = [];
  const found = globSync(
    surfaceGlobs(layout.skillDir, "*/SKILL.md", layout.materializeRoot),
    { cwd: basePath, ignore },
  );
  for (const path of found.sort()) {
    const name = basename(dirname(path));
    const content = read(join(basePath, path));
    out.push({
      kind: "skill",
      path,
      name,
      tokens: [`${layout.skillDir}/${name}`, `:${name}`],
      ignored: content.includes(IGNORE_MARKER),
    });
  }
  // Single-skill-directory target: a bare `SKILL.md` AT the base (the dir you
  // pointed lint/audit at). The globs above only match `<skillDir>/*/SKILL.md`
  // NESTED under the base, so without this the untested-skill check would silently
  // vanish for exactly the single-skill target that scoping now supports.
  const rootSkill = join(basePath, "SKILL.md");
  if (existsSync(rootSkill)) {
    const name = basename(basePath);
    const content = read(rootSkill);
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
  basePath: string,
  ignore: string[],
  layout: PluginLayout,
): Surface[] {
  const out: Surface[] = [];
  const found = globSync(
    surfaceGlobs(layout.agentDir, "*.md", layout.materializeRoot),
    { cwd: basePath, ignore },
  );
  for (const path of found.sort()) {
    if (path.endsWith(".spec.ts")) continue;
    const content = read(join(basePath, path));
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
  basePath: string,
  manifest: string,
  pluginRootToken: string,
): string[] {
  if (!existsSync(join(basePath, manifest))) return [];
  let hooks: unknown;
  try {
    hooks = (JSON.parse(read(join(basePath, manifest))) as { hooks?: unknown })
      .hooks;
  } catch {
    return [];
  }
  if (hooks === undefined) return [];
  const text = JSON.stringify(hooks);
  // "${CLAUDE_PLUGIN_ROOT}" → unbraced "$CLAUDE_PLUGIN_ROOT" — strip the harness's
  // own token (both forms) so the path is checkable relative to the plugin root.
  const unbraced = pluginRootToken.replace(/^\$\{(.+)\}$/, "$$$1");
  const scripts = new Set<string>();
  for (const m of text.matchAll(SCRIPT_RE)) {
    const rel = m[0]
      .replaceAll(pluginRootToken, "")
      .replaceAll(unbraced, "")
      .replace(/^\/+/, "")
      .replace(/^\.\//, "");
    if (existsSync(join(basePath, rel))) scripts.add(rel);
  }
  return [...scripts];
}

function discoverHooks(basePath: string, layout: PluginLayout): Surface[] {
  const scripts = new Set<string>();
  // The harness's manifest + settings (and a `.local` settings sibling, a CC
  // convention that's harmless to probe elsewhere).
  const localSettings = layout.settingsPath.replace(/(\.[^./]+)$/, ".local$1");
  const manifests = [
    ...new Set([layout.manifestPath, layout.settingsPath, localSettings]),
  ];
  for (const m of manifests) {
    for (const s of hookScripts(basePath, m, layout.pluginRootToken))
      scripts.add(s);
  }
  return [...scripts].sort().map((path) => ({
    kind: "hook" as const,
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

function discoverTests(
  basePath: string,
  globs: readonly string[],
  ignore: string[],
): TestFile[] {
  // `dot: true` so a colocated test under a DOT directory is found — most
  // loose skills live in `.claude/skills/<name>/`, so the eval the warning
  // suggests (`.claude/skills/<name>/<name>.eval.mjs`) is itself dot-pathed.
  // Without this, a globstar (`**/*.eval.mjs`) silently skips it while the
  // skill (matched by the explicit-dot `.claude/skills/*/SKILL.md` pattern) is
  // still discovered — so the surface looks untested even after the user adds
  // exactly the suggested file. DEFAULT_IGNORE still drops .git/node_modules/etc.
  const found = globSync([...globs], { cwd: basePath, ignore, dot: true });
  return found.map((path) => ({ path, content: read(join(basePath, path)) }));
}

/** Colocated: a test inside a skill dir, or a name-prefixed sibling of an agent/hook. */
function isColocated(surface: Surface, testPath: string): boolean {
  if (surface.kind === "skill") {
    const dir = dirname(surface.path);
    // A root `SKILL.md` (single-skill-dir target) lives at ".", so any TOP-LEVEL
    // test is colocated — globSync returns those without a "./" prefix, which a
    // bare `startsWith("./")` would miss (false "untested").
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
 * Split the discovered tests into the two tiers by SUFFIX — `*.eval.mjs` is the
 * paid real-model tier, everything else (`*.harness.mjs`, `*.test.*`, and any
 * user-supplied `testGlobs`) is the free deterministic tier. Suffix, not glob set,
 * so a custom `testGlobs` (a promptfoo suite, a home-grown loop) still lands in a
 * tier instead of silently disappearing from the split.
 */
function partitionTests(tests: readonly TestFile[]): {
  harness: TestFile[];
  evals: TestFile[];
} {
  const harness: TestFile[] = [];
  const evals: TestFile[] = [];
  for (const t of tests)
    (t.path.endsWith(EVAL_SUFFIX) ? evals : harness).push(t);
  return { harness, evals };
}

/** Split the considered surfaces by whether ONE tier's tests cover them. */
function tierOf(
  considered: readonly Surface[],
  tests: readonly TestFile[],
): CoverageTier {
  const covered: Surface[] = [];
  const untested: Surface[] = [];
  for (const s of considered)
    (isCovered(s, tests) ? covered : untested).push(s);
  return { covered, untested };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find harness surfaces (skills / agents / hooks) that no test or eval covers.
 * A surface is covered by a colocated `*.{harness,eval}.mjs` OR any discovered
 * test that references its path/namespace. EVERY skill, agent, and hook is held
 * to this — the only exemption is an explicit `vigiles:ignore-test` marker in the
 * surface file (counted as `exempt`).
 *
 * The `covered`/`untested` union fields are UNCHANGED (a test anywhere counts).
 * `harness` and `evals` carry the per-tier split so a caller can tell "has
 * deterministic coverage, no evals" from "has neither" — two positions the single
 * count made indistinguishable.
 */
export function findUntestedSurfaces(
  options: TestCoverageOptions = {},
): UntestedReport {
  const basePath = options.basePath ?? process.cwd();
  const layout = options.layout ?? claudeCodeLayout;
  const ignore = [...DEFAULT_IGNORE, ...(options.exclude ?? [])];
  const globs = options.testGlobs ?? DEFAULT_TEST_GLOBS;

  const surfaces: Surface[] = [];
  if (options.skills !== false)
    surfaces.push(...discoverSkills(basePath, ignore, layout));
  if (options.agents !== false)
    surfaces.push(...discoverAgents(basePath, ignore, layout));
  if (options.hooks !== false)
    surfaces.push(...discoverHooks(basePath, layout));

  // Every skill/agent/hook is held to the requirement — only an explicit
  // `vigiles:ignore-test` marker exempts a surface (a visible, deliberate skip).
  const considered = surfaces.filter((s) => !s.ignored);
  const exempt = surfaces.length - considered.length;

  const tests = discoverTests(basePath, globs, ignore);
  const split = partitionTests(tests);
  const union = tierOf(considered, tests);

  return {
    total: considered.length,
    covered: union.covered,
    untested: union.untested,
    exempt,
    harness: tierOf(considered, split.harness),
    evals: tierOf(considered, split.evals),
  };
}

/** Suggested colocated test path for an untested surface (shown in the warning). */
export function suggestedTestPath(surface: Surface): string {
  // A root skill lives at ".", so drop the "./" prefix — the suggested path then
  // matches what globSync actually discovers at the top level.
  const dir = dirname(surface.path);
  const prefix = dir === "." ? "" : `${dir}/`;
  if (surface.kind === "skill") {
    return `${prefix}${surface.name}.eval.mjs`;
  }
  return `${prefix}${surface.name}.harness.mjs`;
}

/** Format an untested-surface report as human-readable text. */
export function formatUntestedReport(report: UntestedReport): string {
  if (report.untested.length === 0) {
    const tail = report.exempt > 0 ? ` (${String(report.exempt)} exempt)` : "";
    const ok = `✓ all ${String(report.total)} surface(s) have a test or eval${tail}`;
    // A clean UNION can still hide a whole unanswered question: every surface may
    // have a deterministic harness and NOTHING may ever have measured that a
    // skill fires. The gate is unchanged (still the union), but the ✓ must not
    // read as "firing verified" when nothing asked.
    const unevaluated = report.evals.untested.length;
    return unevaluated === 0
      ? ok
      : `${ok}\n  …but ${String(unevaluated)} of them have no \`*.eval.mjs\`, so ` +
          `nothing has measured whether they actually fire (a harness can't tell you that).`;
  }
  const lines = [
    `⚠ ${String(report.untested.length)} surface(s) with no test or eval:`,
  ];
  for (const s of report.untested) {
    lines.push(`    ${s.kind} ${s.path} — add e.g. ${suggestedTestPath(s)}`);
  }
  // Name the two gaps SEPARATELY — they lead to different work at wildly
  // different cost. "add a test/eval" is one sentence for two prescriptions three
  // orders of magnitude apart; a reader can't tell whether it's ten minutes or a
  // model budget.
  lines.push(
    `  Two gaps, two costs: ${String(report.harness.untested.length)} with no ` +
      `deterministic harness (free, every push) · ` +
      `${String(report.evals.untested.length)} whose firing was never measured ` +
      `(needs a real model, run on a schedule).`,
  );
  // Already testing these another way (a promptfoo suite, a home-grown evals
  // file)? Point `testGlobs` at it so it counts toward coverage (issue #113).
  lines.push(
    `  Testing these another way (promptfoo / a home-grown eval loop)? Add its ` +
      `files to \`testGlobs\` in .vigilesrc.json — a discovered test that names a ` +
      `surface's path counts. See docs/rules/untested-skill.md.`,
  );
  return lines.join("\n");
}
