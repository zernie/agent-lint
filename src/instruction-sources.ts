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

import { sha256short } from "./core/hash.js";

/** One instruction file gathered from disk, with its canonical (symlink-resolved)
 * path so a mirror can be detected. */
export interface RawInstructionFile {
  /** The repo-relative path (kept for provenance). */
  readonly path: string;
  /** The realpath (symlink-resolved) — a symlinked mirror shares this. */
  readonly canonical: string;
  readonly text: string;
}

/**
 * Dedup instruction files so a `CLAUDE.md`⇄`AGENTS.md` MIRROR is routed ONCE, not
 * double-counted (compose-with-sync-tools: a symlinked or byte-identical synced
 * mirror is ONE logical artifact). Dedups by BOTH the canonical path (a symlink)
 * AND the content hash (a byte-identical sync) — relative-path dedup alone caught
 * neither. First occurrence wins (callers pass root files first). Pure.
 */
export function dedupeInstructionFiles(
  files: readonly RawInstructionFile[],
): { path: string; text: string }[] {
  const seenReal = new Set<string>();
  const seenHash = new Set<string>();
  const out: { path: string; text: string }[] = [];
  for (const f of files) {
    if (seenReal.has(f.canonical)) continue; // symlinked mirror
    const hash = sha256short(f.text);
    if (seenHash.has(hash)) continue; // byte-identical synced mirror
    seenReal.add(f.canonical);
    seenHash.add(hash);
    out.push({ path: f.path, text: f.text });
  }
  return out;
}

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
  "__mocks__",
  "vendor",
  "third_party",
]);

/** Directory-name PREFIXES that mark a fixture / demo / sample / scratch dir.
 * Case-INSENSITIVE so `Examples/`, `Demo/` are skipped too. */
const FIXTURE_DIR_PREFIX =
  /^(?:demo|example|sample|fixture|bench|benchmark|mock|stub|scratch|tmp|\.tmp)/i;

/**
 * Is this (repo-relative) instruction-file path fixture/demo/build/test noise?
 * True when any DIRECTORY segment (never the filename) is a build/deps/test dir
 * OR starts with a demo/example/sample/fixture/bench/mock/scratch/tmp prefix.
 * Conventional + general (not vigiles-specific), precision over recall.
 */
export function isFixturePath(relPath: string): boolean {
  const segs = relPath.split(/[/\\]/).slice(0, -1); // directories only
  return segs.some(
    (s) => FIXTURE_DIR_EXACT.has(s.toLowerCase()) || FIXTURE_DIR_PREFIX.test(s),
  );
}
