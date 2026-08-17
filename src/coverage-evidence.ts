/**
 * HOW a surface was decided to be covered — the provenance of every coverage
 * decision.
 *
 * ## The defect this exists to close
 *
 * Coverage used to be: "does any discovered test file contain this surface's
 * path or namespace as a substring?" Measured on a real repo (37 skills, 14
 * hooks), appending ONE LINE to an existing harness —
 *
 * ```js
 * // probe: skills/argument-arc
 * ```
 *
 * — a COMMENT, not a test, moved the untested count 33 → 32. The metric was
 * trivially gameable, and the gaming was indistinguishable from real work.
 *
 * This is the exact substitution vigiles names in other people's repos —
 * *presence of a surface taken for presence of the property*, the way
 * `noExplicitAny` sitting in a config is taken for the rule being enforced. The
 * tool was committing it in its own scoring.
 *
 * ## One kind of evidence, and why the other two were removed (2026-08-11)
 *
 * There were three: `declared` (a `vigiles:covers` marker), `colocated`, and
 * `mention` (the surface's name appearing in a test's code). They were never
 * three STRENGTHS of evidence — they were three NAMING CONVENTIONS, all
 * answering "does this surface's name appear near a test?" and none answering
 * "did anything run against it?". Ranking them implied a precision that did not
 * exist. Measured on this repo before the change:
 *
 * - `mention` supplied 9 of 10 covered surfaces. Reading what credited what:
 *   three were real dedicated evals (a `<skill>.trigger.eval.mjs` each) that
 *   colocation could not see, and at least three were FALSE — `hooks/pre-edit.sh`
 *   and `hooks/post-edit.sh` were credited by `test-coverage.test.ts`, which is
 *   the coverage detector's OWN suite naming them as fixtures. The detector
 *   granted coverage to hooks because it tested itself against them. A tier that
 *   wrong is not a weak tier; it is a bug.
 *
 * - `declared` was explicit and greppable — and a list living APART from the
 *   thing it describes, so it must rot. Its first real use in a consumer repo
 *   declared a conformance LINT over 21 skills as coverage OF those 21 skills,
 *   moving that repo's untested count 31 → 16 while nothing new was tested. It
 *   also needed a guard assertion to stay honest: a mechanism watching the
 *   mechanism.
 *
 * Colocation is the one that cannot drift BY CONSTRUCTION. The test lives inside
 * the surface's own directory, so deleting the skill deletes its test, renaming
 * moves both, and `ls` answers "is this tested?" without running anything. The
 * filesystem enforces the convention; a reader does not have to trust it.
 *
 * The cost is stated rather than hidden: a genuinely good test that sits
 * somewhere else now counts for nothing until it is moved next to its surface.
 * That is the intended pressure — a per-surface test belongs with its surface.
 *
 * ## The hole above it — closed 2026-08-11 by a tier ABOVE, not beside
 *
 * The paragraph that used to stand here read: *"colocation says a FILE EXISTS,
 * not that it RAN. An empty `foo.eval.mjs` still counts."* That is now the
 * FALLBACK, not the answer.
 *
 * `executed` is evidence of a different kind from all four naming conventions:
 * it comes from a run that happened, recorded in `.vigiles/coverage.json` by the
 * runner and attributed by the tiers themselves (`coverage-probe.ts`). This is
 * how every mature coverage tool answers the question — `go test -cover`,
 * coverage.py, nyc, tarpaulin — with the name used only to FIND the file to run.
 * A skill cannot be run without a model, so the name survives underneath it.
 *
 * So the order of answers is **execution → name → nothing**, and the report is
 * required to say which one it used: "measured by a run" and "there is a file
 * with a matching name" are different facts, and printing one number for both is
 * the substitution this module exists to stop.
 *
 * ⚠️ The hole colocation still has is unchanged, and is now visible instead of
 * hidden: a surface answered by `colocated` may have an empty test file. What
 * changed is that a surface answered by `executed` demonstrably does not.
 *
 * Browser-safe and pure (no `node:*`): the disk detector (`test-coverage.ts`) and
 * its in-browser twin (`test-coverage-files.ts`) both route through here, so the
 * two cannot drift on the part that decides coverage. A browser has no
 * filesystem and therefore no run records, so `executed` is structurally
 * impossible there and its count is 0 — see `test-coverage-files.ts`.
 */
import { readFrontmatter, frontmatterScalar } from "./core/frontmatter-read.js";

import { scriptRefPattern } from "./core/source-refs.js";

/**
 * How a covered surface was decided to be covered.
 *
 * - `executed` — a recorded run exercised it, against THIS version of it.
 * - `colocated` — a test named after it sits beside it. Says the file exists.
 *
 * Two kinds, and unlike the three that were removed these are not two naming
 * conventions: one is about a process that ran, the other about a directory
 * listing. See the module header.
 */
export type CoverageEvidence = "executed" | "colocated";

/** The minimum a surface must expose to be matched — structural, no import cycle. */
export interface CoverableSurface {
  /** Repo-relative path of the surface file (SKILL.md / agent .md / hook script). */
  readonly path: string;
  /** Stable name: skill dir, agent basename, or hook script basename. */
  readonly name: string;
  /** Substrings a test may reference to "cover" this surface (path / namespace). */
  readonly tokens: readonly string[];
}

/**
 * A discovered test file. Only its PATH matters now: colocation is decided by
 * placement, so the detector no longer reads a single test file's contents —
 * which also means a repo's coverage can no longer be changed by editing text
 * inside a test.
 */
export interface PreparedTest {
  readonly path: string;
}

/** Wrap a discovered path. Kept as a function so both twins share one shape. */
export function prepareTest(path: string): PreparedTest {
  return { path };
}

/**
 * A path that looks like a script, inside a `command` string. Both twins used to
 * declare this separately; the extension vocabulary and the trailing boundary
 * now live in `core/source-refs.ts`, shared with the hook scanner, so the three
 * cannot drift and none can omit the boundary (without it, `hooks.json` matched
 * as `hooks.js`).
 *
 * ⚠️ This one scans a SERIALIZED settings blob rather than a shell parse, so it
 * cannot tell an operand from inline program text the way `commandWords` can.
 * It stays a regex because every hit is gated on the file EXISTING before it
 * becomes a surface — a stray match is dropped, never reported — so the failure
 * mode here is under-counting, not accusation.
 */
const SCRIPT_RE = scriptRefPattern();

/**
 * Is this filename one the PAID real-model runner would actually run?
 *
 * The tier split decides which of two runners owns a test file, and it is the
 * only thing standing between a scheduled paid run and a per-push one. It has
 * now been wrong in both directions:
 *
 * - As the full suffix `.eval.mjs` it was a MONEY HAZARD — `foo.eval.ts` fell
 *   into the free branch and would have spent real model calls on every push.
 * - As the bare INFIX `.eval.` it made a FALSE GRANT — `parser.eval.test.ts`,
 *   an ordinary deterministic test discovered by a `testGlobs` of
 *   `**\/*.test.ts`, was credited to the paid tier and dropped from the free
 *   one. `vigiles eval` globs `**\/*.eval.{mjs,cjs,js,mts,cts,ts}`, so that name
 *   is not discoverable by the eval runner at all: the surface was reported
 *   covered by the tier that cannot run it, and uncovered by the tier that does.
 *
 * The rule that is wrong in neither direction is the one the runner itself uses:
 * `.eval.` followed by a runnable extension AT THE END of the name. Anything
 * else — including a name that merely contains `.eval.` — is deterministic, or
 * is not a script at all.
 *
 * ⚠️ The extension list is RE-DECLARED, not imported: the authority is
 * `SCRIPT_EXTS` in adapters/claude-code/run-scripts.ts, which pulls in
 * `node:child_process` and `glob` and so cannot be imported by this
 * browser-safe module. A test in test-coverage.test.ts asserts the two agree,
 * so an extension added to the runner cannot silently fail to be billed here.
 */
const EVAL_SCRIPT_RE = /\.eval\.(?:mjs|cjs|js|mts|cts|ts)$/;

/** @param filename a BASENAME — callers strip the directory with their own path
 * helper (`node:path` on disk, `posix-path` in the browser twin). */
export function isEvalScript(filename: string): boolean {
  return EVAL_SCRIPT_RE.test(filename);
}

/**
 * The root variables a hook command may be written against — the structural
 * slice of `PluginLayout` this needs, taken by SHAPE so the browser twin does
 * not have to import the layout module.
 */
export interface RootTokens {
  readonly pluginRootToken: string;
  readonly projectRootTokens?: readonly string[];
}

/**
 * The hook-script paths a manifest's `hooks` block names, repo-relative.
 *
 * 🔴 THIS EXISTS BECAUSE ONE BUG HAD TO BE FIXED TWICE, and the second half was
 * missed. `settings.json` has two readers — the disk detector in
 * test-coverage.ts and the file-map twin in test-coverage-files.ts. While only
 * the PLUGIN token was stripped, `"$CLAUDE_PROJECT_DIR/.claude/hooks/a.sh"` —
 * Claude Code's DOCUMENTED spelling, used because hooks do not run with a stable
 * cwd — kept its literal prefix, failed the existence check, and was dropped
 * without a word. The disk reader was taught the project token; the twin was
 * not, and went on reporting ONE hook surface where disk reported FOUR,
 * under-reporting the untested count and therefore the score.
 *
 * Repairing the twin in place would have left the NEXT token to be added in two
 * places again. So the parsing, the token set, the prefix stripping and the
 * dependency rule live here once, and the callers inject only what genuinely
 * differs: where the manifest text comes from, and what "this file exists" means
 * (disk `existsSync` vs a key in the file map). Neither caller enumerates
 * tokens, so neither can forget one.
 */
export function hookScriptRefs(
  manifestText: string | undefined,
  layout: RootTokens,
  exists: (rel: string) => boolean,
): string[] {
  if (manifestText === undefined) return [];
  let hooks: unknown;
  try {
    hooks = (JSON.parse(manifestText) as { hooks?: unknown }).hooks;
  } catch {
    return [];
  }
  if (hooks === undefined) return [];
  // Every token in BOTH spellings: `${CLAUDE_PROJECT_DIR}` and the unbraced
  // `$CLAUDE_PROJECT_DIR` a settings file is just as likely to use.
  const tokens = [
    layout.pluginRootToken,
    ...(layout.projectRootTokens ?? []),
  ].flatMap((t) => [t, t.replace(/^\$\{(.+)\}$/, "$$$1")]);
  const scripts = new Set<string>();
  for (const m of JSON.stringify(hooks).matchAll(SCRIPT_RE)) {
    let rel = m[0];
    for (const t of tokens) rel = rel.replaceAll(t, "");
    rel = rel.replace(/^\/+/, "").replace(/^\.\//, "");
    // A DEPENDENCY is not a surface of this repo. The same settings that name a
    // repo hook also name the runtime that runs the compiled ones
    // (`node_modules/vigiles/dist/cli.js`); holding that to `untested-hook`
    // would be asking the author to test their package manager. The compiled
    // `.hook.ts` it is pointed AT is extracted from the same command and is the
    // real surface.
    if (rel.startsWith("node_modules/") || rel.includes("/node_modules/"))
      continue;
    if (exists(rel)) scripts.add(rel);
  }
  return [...scripts];
}

/**
 * The evidence one test file provides for one surface, or `null` for none.
 * `colocated` is passed in because placement is a path question the two twins
 * answer with their own (disk vs POSIX-string) path helpers.
 */
export function evidenceFor(
  _surface: CoverableSurface,
  _test: PreparedTest,
  colocated: boolean,
): CoverageEvidence | null {
  return colocated ? "colocated" : null;
}

/** Per-evidence tallies — the provenance summary the report prints. */
export interface EvidenceCounts {
  /** Decided by a recorded run against this version of the surface. */
  readonly executed: number;
  readonly colocated: number;
}

/** Tally a list of decisions by evidence kind. */
export function countEvidence(
  decisions: readonly { readonly evidence: CoverageEvidence }[],
): EvidenceCounts {
  let executed = 0;
  let colocated = 0;
  for (const d of decisions) {
    if (d.evidence === "executed") executed += 1;
    else colocated += 1;
  }
  return { executed, colocated };
}

/**
 * One line naming how the coverage was established. Printed wherever a coverage
 * count is printed: a number with no provenance is the thing this module exists
 * to stop shipping.
 *
 * 🔴 THE TWO CLAUSES ARE WORDED DIFFERENTLY ON PURPOSE. "Measured by a run" and
 * "there is a file with a matching name" are not two strengths of the same
 * statement, and a reader who cannot tell them apart in the output has the same
 * number they had before this tier existed.
 */
export function formatEvidence(counts: EvidenceCounts): string {
  const parts: string[] = [];
  if (counts.executed > 0) {
    parts.push(
      `${String(counts.executed)} MEASURED BY A RUN — a recorded run exercised ` +
        `the surface and reported checks (.vigiles/coverage.json)`,
    );
  }
  if (counts.colocated > 0) {
    parts.push(
      `${String(counts.colocated)} colocated — a test NAMED after the surface, ` +
        `in the surface's own place. This says the file EXISTS, not that it ran`,
    );
  }
  if (parts.length === 0) return "";
  return `How coverage was decided: ${parts.join("; ")}.`;
}

/**
 * A root `SKILL.md`'s DECLARED `name:`, or `null` — the identity of a
 * single-skill-at-root repo.
 *
 * 🔴 SHARED BECAUSE IT DRIFTED. This lived only in the disk detector
 * (`test-coverage.ts`), and the browser twin hard-coded the string `"SKILL"` in
 * its place. For a single-skill repo declaring `name: foo`, the disk engine
 * therefore counted a top-level `foo.harness.mjs` as colocated coverage and the
 * GitHub/file-map engine — the SAME audit, same files — called the skill untested
 * and lowered its Tested score. That is the third time in this PR that a change
 * landed in one report builder and not the other, so the field is no longer
 * mirrored: both twins call this one function, and there is nothing left to
 * mirror wrong.
 *
 * The name matters only at the ROOT. For a nested skill the DIRECTORY is the
 * identity (`skills/foo/SKILL.md` → `foo`); the base of a single-skill target is
 * wherever the thing happens to be checked out — a temp dir, `~/src/wip-2`, a CI
 * workspace — and since colocation requires the test to be NAMED after the
 * surface, taking the identity from the path would ask the author to name their
 * test after their checkout directory.
 *
 * Read through the SHARED lenient frontmatter reader rather than a private
 * `load()` + regex — a small behaviour change, stated rather than smuggled: a
 * root SKILL.md whose YAML is malformed but whose `name:` line is salvageable now
 * keys coverage on that name instead of on the checkout directory. That is the
 * name `scanSkills` already prints for the same file, so the report and the
 * coverage tier stop disagreeing about what the skill is called. A file with no
 * declaration at all still returns `null` and the caller's fallback applies
 * (`basename` of the audited dir on disk, the repo name in the browser).
 */
export function declaredSurfaceName(content: string): string | null {
  const name = frontmatterScalar(readFrontmatter(content), "name");
  return name !== undefined && name.trim() ? name.trim() : null;
}
