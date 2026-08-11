/**
 * Untested-surface detection: the third gap detector, alongside orphan-docs.
 *
 * Stale-ref detection catches specs pointing at files that vanished.
 * Orphan-docs catches docs nothing references. This catches harness *surfaces*
 * — skills, subagents, and hooks — that ship without a test or eval. A surface
 * with no test is a probabilistic-compliance gap hiding in the deterministic
 * layer: nothing measures whether it still does what it claims.
 *
 * TWO detectors decide "tested", in this order — **execution, then name, then
 * nothing** — and the report says which one answered:
 *
 *   1. EXECUTION — `.vigiles/coverage.json` records that a run exercised this
 *      surface, at this version of it (`coverage-artifact.ts`).
 *   2. COLOCATION — a `*.{harness,eval}.mjs` named after the surface, beside it
 *      (`skills/foo/foo.eval.mjs`, `hooks/pre-edit.harness.mjs`).
 *
 * Colocation was the only detector until 2026-08-11, and it answers a weaker
 * question than it appears to: it says a FILE EXISTS. `touch
 * .claude/skills/foo/foo.eval.mjs` — empty — drops the untested count by one.
 * No other coverage tool answers by name (`go test -cover`, coverage.py, nyc,
 * tarpaulin all answer from execution, using names only to FIND the file); we
 * kept the name because a skill cannot be run without a model, and a repo with
 * no runs recorded must behave exactly as it did before.
 *
 * A run recorded against an OLDER version of the surface grants nothing — it is
 * reported as `staleRuns` and the surface falls back to colocation. Silently
 * counting it is the PIPELINE-STATUS disease: a tick against a document that was
 * rewritten afterwards.
 *
 * There were three until 2026-08-11 (a `vigiles:covers` declaration, colocation,
 * and a content-reference "mention"). They were three NAMING CONVENTIONS, not
 * three strengths of evidence, and two of them could credit a surface no test
 * touched — measured on vigiles's own repo, `mention` supplied 9 of 10 covered
 * surfaces and at least three of those were false, including two hooks credited
 * by this detector's OWN test suite naming them as fixtures. See
 * `coverage-evidence.ts` for the full argument and the numbers.
 *
 * Colocation is kept because it cannot drift by construction: the test lives with
 * the surface, so deleting or renaming the surface takes its test along, and `ls`
 * answers "is this tested?" without running anything.
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
import { load } from "js-yaml";
import { testFileExt } from "./core/test-file-ext.js";
import { globSync } from "glob";
import type { PluginLayout } from "./core/layout.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";
import {
  countEvidence,
  evidenceFor,
  formatEvidence,
  prepareTest,
  type CoverageEvidence,
  type EvidenceCounts,
  type PreparedTest,
} from "./coverage-evidence.js";
import {
  indexRuns,
  readCoverageArtifact,
  surfaceSha,
  type CoverageTierName,
  type ExecutedRecord,
} from "./coverage-artifact.js";

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

/**
 * WHY one surface counts as covered — the provenance of a single decision.
 * Reported so a repo can see what its coverage number actually rests on; a count
 * whose derivation is invisible is exactly the failure this detector had.
 */
export interface CoverageDecision {
  readonly surface: Surface;
  readonly evidence: CoverageEvidence;
  /** The test file the (strongest) evidence came from. */
  readonly by: string;
}

/** A surface measured by a run that no longer describes it. */
export interface StaleRun {
  /** Repo-relative path of the surface. */
  readonly path: string;
  /** The script whose run measured the older version. */
  readonly by: string;
  /** When that run happened (ISO-8601). */
  readonly at: string;
}

/** One tier's split of the considered surfaces — covered by THAT tier, or not. */
export interface CoverageTier {
  readonly covered: readonly Surface[];
  readonly untested: readonly Surface[];
  /** One entry per `covered` surface, in the same order — how it was decided. */
  readonly decisions: readonly CoverageDecision[];
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
   * Test files still carrying the RETIRED `vigiles:covers` marker.
   *
   * 🔴 A MIGRATION THAT WOULD OTHERWISE BE SILENT. Up to 15.0.2 this tool's own
   * untested finding told the reader to "mark what it covers with
   * `vigiles:covers <surface>`". That tier is gone: coverage is decided by where
   * a test sits and what it is named. Someone who followed the instruction gets
   * no error on upgrade — the marker simply becomes a comment, their coverage
   * drops and the count of untested surfaces rises with nothing said about why.
   *
   * Reading these files does NOT feed coverage (nothing inside a test can change
   * it any more); it exists purely so the upgrade can explain itself. Optional
   * so a report produced before this field still parses.
   */
  readonly legacyCoversFiles?: readonly string[];
  /** Extension a generated test should use — see `core/test-file-ext.ts`.
   *  Optional so a report produced before this field still parses. */
  readonly testExt?: string;
  /**
   * How each covered surface was decided — the union tier's provenance, one
   * entry per `covered` element. A coverage count whose derivation is invisible
   * is what let a COMMENT confer coverage unnoticed; this is the visibility.
   */
  readonly decisions: readonly CoverageDecision[];
  /**
   * Surfaces whose ONLY run record predates their current text — "measured, but
   * not this version".
   *
   * They grant no coverage (they fall back to colocation like anything else),
   * because a measurement of a file that has since been rewritten is a
   * measurement of a different file. Reported rather than dropped, since the
   * silent version of this is the PIPELINE-STATUS failure mode: a green tick
   * against a document somebody edited afterwards. Optional so a report produced
   * before this field still parses.
   */
  readonly staleRuns?: readonly StaleRun[];
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
  /**
   * `testExtension` from `.vigilesrc.json` — which extension a GENERATED test
   * gets. Detection (a tsconfig.json, a typescript dependency) decides by
   * default; this field exists only to disagree with it. Deliberately NOT written
   * by `init`: a value recorded at initialisation goes stale in silence when the
   * project migrates, while detection re-runs every time.
   */
  readonly testExtension?: string;
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

/**
 * The REAL-MODEL tier, by INFIX — the one file kind that costs money to run.
 *
 * 🔴 IT USED TO BE THE FULL SUFFIX `.eval.mjs`, and that was a money hazard the
 * moment TypeScript was accepted: `foo.eval.ts` would have fallen into the
 * `harness` branch, so a file that spends real model calls would have been
 * classified as the free deterministic tier and run on every push, in CI. Not a
 * naming detail — the tier split is the only thing standing between a scheduled
 * paid run and a per-push one.
 */
const EVAL_INFIX = ".eval.";

/** Every extension Node executes directly. `.mts`/`.cts` are real (TS 4.7+) and
 * Node 22 strips their types with no toolchain — measured, not assumed. */
const RUNNABLE_EXTS = "{ts,mts,cts,js,mjs,cjs}";

/**
 * 🔴 `*.test.*` USED TO BE HERE, AND REMOVING IT IS THE POINT.
 *
 * Those six entries matched the default patterns of vitest and jest EXACTLY
 * (read out of the installed packages, not from memory):
 *
 *   vitest  **\/*.{test,spec}.?(c|m)[jt]s?(x)
 *   jest    **\/?(*.)+(spec|test).?([mc])[jt]s?(x)
 *           **\/__tests__\/**\/*.?([mc])[jt]s?(x)   ← everything in that dir
 *
 * vigiles never RAN those files, but it CREDITED them — so an author writing a
 * skill test reasonably named it `foo.test.mjs`, and then `npx vitest` ran it.
 * A skill test calls `runHarnessTest`/`measureTriggerRate`: it spawns a model and
 * SPENDS MONEY, silently, on every push. Measured: a spike put
 * `.claude/skills/foo/foo.test.mjs` in a bare project and plain `npx vitest run`
 * executed it — the "it lives under a dot-directory so nothing else will see it"
 * assumption is false.
 *
 * With those entries gone the guarantee becomes one sentence a reader can hold:
 * NOTHING VIGILES RECOGNISES IS MATCHED BY A DEFAULT VITEST OR JEST RUN.
 *
 * ⚠️ BREAKING: a repo whose hook is covered by an ordinary `pre-edit.test.ts`
 * loses that credit. The migration is a rename, and the untested finding prints
 * the exact path. Taken deliberately over the alternative — keeping the entries
 * for hooks/agents and dropping them for skills — because a rule with a per-kind
 * exception is what this file just spent a day removing.
 */
const DEFAULT_TEST_GLOBS = [
  `**/*.harness.${RUNNABLE_EXTS}`,
  `**/*.eval.${RUNNABLE_EXTS}`,
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
    // 🔴 The DECLARED name wins here, and only here. For a nested skill the
    // directory IS the identity (`skills/foo/SKILL.md` → `foo`), but the base of
    // a single-skill target is wherever the thing happens to be checked out —
    // a temp dir, `~/src/wip-2`, a CI workspace. Since colocation now requires
    // the test to be NAMED after the surface, taking the identity from the path
    // would ask the author to name their test after their checkout directory.
    const content = read(rootSkill);
    const name = declaredName(content) ?? basename(basePath);
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

/** A skill's declared `name:`, or null. YAML scalar via the real parser. */
function declaredName(content: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!fm?.[1]) return null;
  try {
    const doc = load(fm[1]) as Record<string, unknown> | null;
    const name = doc?.["name"];
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null; // malformed frontmatter is another rule's finding, not ours
  }
}

/**
 * The retired declaration marker, kept ONLY to explain its own removal. Written
 * split so this source file does not match its own search.
 */
const LEGACY_COVERS = `vigiles:${"covers"}`;

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

function discoverTests(
  basePath: string,
  globs: readonly string[],
  ignore: string[],
): PreparedTest[] {
  // `dot: true` so a colocated test under a DOT directory is found — most
  // loose skills live in `.claude/skills/<name>/`, so the eval the warning
  // suggests (`.claude/skills/<name>/<name>.eval.mjs`) is itself dot-pathed.
  // Without this, a globstar (`**/*.eval.mjs`) silently skips it while the
  // skill (matched by the explicit-dot `.claude/skills/*/SKILL.md` pattern) is
  // still discovered — so the surface looks untested even after the user adds
  // exactly the suggested file. DEFAULT_IGNORE still drops .git/node_modules/etc.
  const found = globSync([...globs], { cwd: basePath, ignore, dot: true });
  // Prepared ONCE per file (comment-strip + declaration parse), not once per
  // (surface × file) pair — the matching below is quadratic by nature.
  return found.map((path) => prepareTest(path));
}

/**
 * Colocated: a test NAMED after the surface, SITTING BESIDE it. One rule, all
 * three kinds — a skill used to be exempt from both halves in turn.
 *
 * 🔴 THE NAME. Agents and hooks always required a name-prefixed basename; for a
 * skill the rule was "any file under the skill's directory". Those are different
 * claims — the second answers "is there a test NEAR this skill?", not "is there
 * a test FOR it" — and it is the substitution the removed `mention` tier made,
 * reached by a different route. Observed live: a repo's
 * `.claude/skills/paper-pipeline/` held six `*.eval.mjs`, exactly one about that
 * skill; the rest measured OTHER skills and sat there because the directory had
 * been the pipeline's home before tests moved next to their subjects. One was
 * literally `grade-paper-writing-ablation.eval.mjs`. The orchestrator scored as
 * covered and had no test of its own.
 *
 * 🔴 THE PLACE. A subdirectory (`skills/foo/tests/foo.harness.mjs`) is NOT
 * colocated, and dropping that allowance was measured rather than assumed. Across
 * two real repos exactly ONE nested test file exists, and it is
 * `verify-citations/scripts/verify-cites.test.mjs` — a unit test for a script the
 * skill BUNDLES, pinning that script's pure reducer. It is a good test of a
 * script and not a test of a skill, which is the whole distinction; the skill
 * carries its own two colocated files besides. So the allowance credited nothing
 * anyone wanted and cost the property that makes colocation worth having: `ls`
 * answers "is this tested?". With a subdirectory permitted, it takes `find`.
 *
 * That property is the entire argument for colocation over a parallel test tree
 * (`test/skills/foo_test.mjs`): the filesystem enforces the convention instead of
 * the reader having to trust it. Two permitted shapes is a choice at write time
 * and a lookup at read time, which is what convention-over-configuration exists
 * to remove.
 */
function isColocated(surface: Surface, testPath: string): boolean {
  if (!basename(testPath).startsWith(`${surface.name}.`)) return false;
  // A root `SKILL.md` (single-skill-dir target) lives at ".", and globSync returns
  // top-level files without a "./" prefix — so `dirname` is "." on both sides and
  // the comparison holds without a special case.
  return dirname(testPath) === dirname(surface.path);
}

/**
 * The STRONGEST evidence any discovered test provides for this surface, or null.
 * Strongest — not first-found — so a surface that is both name-mentioned and
 * explicitly declared is reported as declared; otherwise the provenance summary
 * would depend on glob order.
 */
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

/**
 * Split the discovered tests into the two tiers by SUFFIX — `*.eval.mjs` is the
 * paid real-model tier, everything else (`*.harness.mjs`, `*.test.*`, and any
 * user-supplied `testGlobs`) is the free deterministic tier. Suffix, not glob set,
 * so a custom `testGlobs` (a promptfoo suite, a home-grown loop) still lands in a
 * tier instead of silently disappearing from the split.
 */
function partitionTests(tests: readonly PreparedTest[]): {
  harness: PreparedTest[];
  evals: PreparedTest[];
} {
  const harness: PreparedTest[] = [];
  const evals: PreparedTest[] = [];
  for (const t of tests)
    (basename(t.path).includes(EVAL_INFIX) ? evals : harness).push(t);
  return { harness, evals };
}

/**
 * The FRESH run record for this surface in this tier, as a decision — or null.
 *
 * `tier` narrows to one runner (`vigiles test` vs `vigiles eval`) so an executed
 * harness cannot silence "nothing has ever measured whether this fires"; the
 * union pass passes `undefined` and takes either. Stale records are not
 * consulted here at all: they are reported separately, never counted.
 */
function executedOf(
  surface: Surface,
  index: ReadonlyMap<string, ExecutedRecord[]>,
  tier: CoverageTierName | undefined,
): CoverageDecision | null {
  for (const record of index.get(surface.path) ?? []) {
    if (!record.fresh) continue;
    if (tier !== undefined && record.run.tier !== tier) continue;
    return { surface, evidence: "executed", by: record.run.by };
  }
  return null;
}

/**
 * Split the considered surfaces by whether ONE tier covers them — a recorded run
 * first, a colocated test second. Execution outranks the name because the name
 * was only ever a stand-in for it.
 */
function tierOf(
  considered: readonly Surface[],
  tests: readonly PreparedTest[],
  index: ReadonlyMap<string, ExecutedRecord[]>,
  tier: CoverageTierName | undefined,
): CoverageTier {
  const covered: Surface[] = [];
  const untested: Surface[] = [];
  const decisions: CoverageDecision[] = [];
  for (const s of considered) {
    const decision = executedOf(s, index, tier) ?? coverageOf(s, tests);
    if (decision) {
      covered.push(s);
      decisions.push(decision);
    } else {
      untested.push(s);
    }
  }
  return { covered, untested, decisions };
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
  // The run record, if there is one. NO artifact ⇒ an empty index ⇒ every
  // decision below falls through to colocation, byte-for-byte as before: a fresh
  // clone and someone else's repo must not get one extra nudge from this tier.
  const runIndex = indexRuns(readCoverageArtifact(basePath), (p) => {
    const abs = join(basePath, p);
    return existsSync(abs) ? surfaceSha(read(abs)) : null;
  });
  const union = tierOf(considered, tests, runIndex, undefined);

  return {
    total: considered.length,
    covered: union.covered,
    untested: union.untested,
    exempt,
    staleRuns: staleRunsFor(considered, runIndex),
    testExt: testFileExt({
      configured: options.testExtension,
      hasTsconfig: existsSync(join(basePath, "tsconfig.json")),
      packageJson: existsSync(join(basePath, "package.json"))
        ? read(join(basePath, "package.json"))
        : undefined,
    }),
    legacyCoversFiles: tests
      .map((t) => t.path)
      .filter((path) => read(join(basePath, path)).includes(LEGACY_COVERS)),
    decisions: union.decisions,
    harness: tierOf(considered, split.harness, runIndex, "harness"),
    evals: tierOf(considered, split.evals, runIndex, "eval"),
  };
}

/**
 * Surfaces with run records but no FRESH one — measured, then edited.
 *
 * Only reported when nothing fresh exists for the surface: a re-run refreshes
 * one record and leaves the old ones in the artifact, and complaining about
 * those would make the notice permanent and therefore ignorable.
 */
function staleRunsFor(
  considered: readonly Surface[],
  index: ReadonlyMap<string, ExecutedRecord[]>,
): StaleRun[] {
  const out: StaleRun[] = [];
  for (const s of considered) {
    const records = index.get(s.path) ?? [];
    if (records.length === 0 || records.some((r) => r.fresh)) continue;
    const newest = records.reduce((a, b) => (a.run.at >= b.run.at ? a : b));
    out.push({ path: s.path, by: newest.run.by, at: newest.run.at });
  }
  return out;
}

/** Suggested colocated test path for an untested surface (shown in the warning). */
export function suggestedTestPath(surface: Surface, ext = "mjs"): string {
  // A root skill lives at ".", so drop the "./" prefix — the suggested path then
  // matches what globSync actually discovers at the top level.
  const dir = dirname(surface.path);
  const prefix = dir === "." ? "" : `${dir}/`;
  if (surface.kind === "skill") {
    return `${prefix}${surface.name}.eval.${ext}`;
  }
  return `${prefix}${surface.name}.harness.${ext}`;
}

/** Tally the union tier's coverage decisions by how each was established. */
export function coverageEvidenceCounts(report: UntestedReport): EvidenceCounts {
  return countEvidence(report.decisions);
}

/**
 * The edit-time half of `untested-skill` — the nudge a PostToolUse hook delivers
 * when the agent has just edited a skill/agent surface.
 *
 * WHY it lives next to `findUntestedSurfaces` instead of being its own detector:
 * the rule was already stated correctly, but it only ran inside `vigiles lint`,
 * which a human has to remember to type. A rule that fires only when invoked by
 * hand is prose, not policy — so this reuses the SAME detector at the moment the
 * surface changes.
 *
 * It deliberately does NOT say "write a test". An agent already knows that; what
 * it did not know is **with what** — so the message's job is to hand off to the
 * `test-harness` skill, which carries the tier→API table. A nudge that restates
 * the obligation and withholds the vocabulary is the failure this replaces.
 *
 * Two distinguishable gaps, because they cost orders of magnitude apart:
 *   - no test at all        → start at the cheapest tier
 *   - a harness but no eval → you just changed the TRIGGER surface, and a
 *                             deterministic harness structurally cannot tell you
 *                             whether a description still fires
 *
 * Returns `null` when the edited file isn't a skill/agent surface, or when it is
 * covered on both tiers. Never throws — a nudge must not disrupt an edit.
 */
export function skillTestNudge(
  filePath: string,
  options: TestCoverageOptions = {},
): string | null {
  let report: UntestedReport;
  try {
    report = findUntestedSurfaces({ ...options, hooks: false });
  } catch {
    return null; // a broken scan must never surface as a broken edit
  }

  const norm = (p: string): string => p.replaceAll("\\", "/");
  const target = norm(filePath);
  const isTarget = (s: Surface): boolean =>
    norm(s.path) === target || target.endsWith(`/${norm(s.path)}`);

  const untested = report.untested.find(isTarget);
  if (untested)
    return (
      `vigiles: you edited ${untested.path}, and nothing measures whether it ` +
      `still does what it claims — no test or eval covers it.\n` +
      `Don't hand-roll a runner: the \`test-harness\` skill carries the ` +
      `tier→API table (runHook · runHarnessTest+scriptModel · ` +
      `measureTriggerRate · measure+judged · runEval) and picks the cheapest ` +
      `tier that can answer your question. Start there, then add e.g. ` +
      `${suggestedTestPath(untested, report.testExt)}.\n` +
      `This is a reminder, not a block.`
    );

  // Covered by SOMETHING, but never evaluated — and an edit to a SKILL.md is
  // usually an edit to the description, i.e. to the trigger surface itself.
  const unevaluated = report.evals.untested.find(isTarget);
  if (unevaluated)
    return (
      `vigiles: you edited ${unevaluated.path}. A deterministic test covers ` +
      `it, but nothing has ever measured whether its description actually ` +
      `FIRES — and a harness structurally cannot tell you that.\n` +
      `See the \`test-harness\` skill for which tier answers it ` +
      `(\`measureTriggerRate\`, plus \`irrelevantPrompts\` for the precision ` +
      `side). This is a reminder, not a block.`
    );

  return null;
}

/** Format an untested-surface report as human-readable text. */
/**
 * One line for a repo that followed the OLD advice, and nothing for everyone else.
 *
 * The upgrade removes a tier this tool told people to use. Without this the only
 * signal is a coverage count that went down, which reads as "I broke something"
 * rather than "the rule changed" — and the marker still sits in the file looking
 * load-bearing. Printed in BOTH branches (clean and dirty): a repo can lose
 * coverage and still be at zero untested, and it would then never hear about it.
 */
function legacyCoversNote(report: UntestedReport): string[] {
  const files = report.legacyCoversFiles ?? [];
  if (files.length === 0) return [];
  const shown = files.slice(0, 3).join(", ");
  const more = files.length > 3 ? ` (+${String(files.length - 3)} more)` : "";
  return [
    `  ${String(files.length)} test file(s) still carry the retired \`vigiles:${"covers"}\` ` +
      `marker (${shown}${more}). It has granted no coverage since 15.x — a test counts ` +
      `when it is NAMED after the surface and sits next to it. The marker is now an ` +
      `ordinary comment; delete it or rename the file.`,
  ];
}

/**
 * The "measured, but not this version" line — printed in BOTH branches, for the
 * same reason `legacyCoversNote` is: a repo can be at zero untested and still be
 * resting on a measurement of text that no longer exists, and it would then
 * never hear about it.
 */
function staleRunNote(report: UntestedReport): string[] {
  const stale = report.staleRuns ?? [];
  if (stale.length === 0) return [];
  const shown = stale
    .slice(0, 3)
    .map((s) => s.path)
    .join(", ");
  const more = stale.length > 3 ? ` (+${String(stale.length - 3)} more)` : "";
  return [
    `  ${String(stale.length)} surface(s) have a run record from BEFORE their current ` +
      `text (${shown}${more}) — measured, but not this version, so it grants no ` +
      `coverage. Re-run \`vigiles test\` / \`vigiles eval\` to refresh it.`,
  ];
}

export function formatUntestedReport(report: UntestedReport): string {
  // Every coverage number is printed WITH its provenance. "28 covered" and
  // "28 covered, all of it a name appearing in a file" are different facts, and
  // the detector used to be able to say only the first.
  const provenance = formatEvidence(coverageEvidenceCounts(report));
  if (report.untested.length === 0) {
    const tail = report.exempt > 0 ? ` (${String(report.exempt)} exempt)` : "";
    const legacy = [...staleRunNote(report), ...legacyCoversNote(report)];
    const ok =
      `✓ all ${String(report.total)} surface(s) have a test or eval${tail}` +
      (provenance ? `\n  ${provenance}` : "") +
      (legacy.length ? `\n${legacy.join("\n")}` : "");
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
    lines.push(`    ${s.kind} ${s.path} — add e.g. ${suggestedTestPath(s, report.testExt)}`);
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
  // What the surfaces that DID pass are resting on.
  if (provenance) lines.push(`  ${provenance}`);
  lines.push(...staleRunNote(report));
  lines.push(...legacyCoversNote(report));
  // Already testing these another way (a promptfoo suite, a home-grown evals
  // file)? Point `testGlobs` at it so it counts toward coverage (issue #113) —
  // and put the file NEXT TO the surface, which is the only placement that
  // counts now. See docs/rules/untested-skill.md.
  lines.push(
    `  Testing these another way (promptfoo / a home-grown eval loop)? Add its ` +
      `files to \`testGlobs\` in .vigilesrc.json AND name each after the surface ` +
      `it covers, next to it (\`<surface>/<surface>.eval.mjs\`) — placement says ` +
      `where a file sits, the name says what it is about. ` +
      `See docs/rules/untested-skill.md.`,
  );
  return lines.join("\n");
}
