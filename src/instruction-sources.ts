/**
 * instruction-sources.ts — the pure policy for WHICH instruction files the audit
 * rule-routing preview reads.
 *
 * A repo's real subdirectory memory (`src/CLAUDE.md`, `research/CLAUDE.md`, a
 * nested `AGENTS.md`) IS worth routing; a fixture/demo/build/test CLAUDE.md is
 * NOISE that would flood the preview. `isFixturePath` is the precision-first
 * discriminator (over-skip a legit `sample-service` before flooding with fixture
 * rules). Pure + unit-tested; the fs discovery/glue lives in cli.ts
 * (`gatherInstructionFiles`). See research/rule-compiler-multilang-design.md §0.
 */

/** Directory segments that are unambiguously build / deps / test noise. */
const FIXTURE_DIR_EXACT = new Set<string>([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".next",
  ".cache",
  "test",
  "tests",
  "__tests__",
  "__fixtures__",
  "vendor",
  "third_party",
]);

/** Directory-name PREFIXES that mark a fixture / demo / sample / scratch dir. */
const FIXTURE_DIR_PREFIX =
  /^(?:demo|example|sample|fixture|bench|benchmark|mock|stub|scratch|tmp|\.tmp)/;

/**
 * Is this (repo-relative) instruction-file path fixture/demo/build/test noise?
 * True when any DIRECTORY segment (never the filename) is a build/deps/test dir
 * OR starts with a demo/example/sample/fixture/bench/mock/scratch/tmp prefix.
 * Conventional + general (not vigiles-specific), precision over recall.
 */
export function isFixturePath(relPath: string): boolean {
  const segs = relPath.split(/[/\\]/).slice(0, -1); // directories only
  return segs.some(
    (s) => FIXTURE_DIR_EXACT.has(s) || FIXTURE_DIR_PREFIX.test(s),
  );
}
