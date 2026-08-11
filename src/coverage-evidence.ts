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
 * ⚠️ HONEST REMAINING HOLE: colocation says a FILE EXISTS, not that it RAN. An
 * empty `foo.eval.mjs` still counts. Closing that is the `CHECK_COUNT` channel
 * (`check-count.ts`), which already knows how many checks a script really made —
 * a CONDITION to add to this one rule, not a fourth kind of evidence.
 *
 * Browser-safe and pure (no `node:*`): the disk detector (`test-coverage.ts`) and
 * its in-browser twin (`test-coverage-files.ts`) both route through here, so the
 * two cannot drift on the part that decides coverage.
 */

/**
 * How a covered surface was decided to be covered. One kind — see the module
 * header for the two that were removed and the measurements behind it.
 */
export type CoverageEvidence = "colocated";

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
  readonly colocated: number;
}

/** Tally a list of decisions by evidence kind. */
export function countEvidence(
  decisions: readonly { readonly evidence: CoverageEvidence }[],
): EvidenceCounts {
  return { colocated: decisions.length };
}

/**
 * One line naming how the coverage was established. Printed wherever a coverage
 * count is printed: a number with no provenance is the thing this module exists
 * to stop shipping.
 */
export function formatEvidence(counts: EvidenceCounts): string {
  if (counts.colocated === 0) return "";
  return (
    `How coverage was decided: ${String(counts.colocated)} colocated — a test ` +
    `file inside the surface's own directory. This says the file EXISTS, not ` +
    `that it ran.`
  );
}
