/**
 * The ONE exclusion policy for every walk that polices the user's repository.
 *
 * `.vigilesrc.json#exclude` is documented as "tsconfig-style" — a list of paths or
 * globs the repo's own lint should not police (vendored corpora, benchmark
 * fixtures, frozen reproductions). Issue #192: it was honoured by three walks,
 * ignored by six, and the three that honoured it did not agree with each other.
 *
 * 🔴 TWO DIALECTS WERE ALREADY IN `main`, AND THEY DISAGREED ON `"bench"`.
 * `glob`'s string `ignore` treats a bare directory name as a file pattern:
 * measured 2026-09-03 on glob 13, `ignore: ["bench"]` and `["bench/"]` exclude
 * NOTHING, only `["bench/**"]` works. The minimatch helper inside
 * `discoverNestedBundles` accepted the bare name. tsc and ESLint both treat the
 * bare name as the directory (measured the same day). So a user who wrote the
 * key the way its JSDoc promised got the nested-bundle pass filtered and every
 * glob-backed pass unfiltered — with no way to tell from the output.
 *
 * This module is the fix in the shape the fence-parser fix took
 * (`core/markdown.ts`): not one WALK — the walks legitimately have different
 * scopes — but ONE PREDICATE, parsed once from config, that every walk consumes.
 * It offers the predicate in the two forms a walk needs and nothing else:
 *
 *   - `globIgnore` — an `IgnoreLike` for `globSync`, keyed on the path's position
 *     RELATIVE TO THE REPO ROOT, so a glob rooted below the root (`vigiles lint
 *     some/dir`) still applies a root-relative `exclude` correctly. The string
 *     list could not: `bench/**` relative to `some/dir` matches nothing.
 *   - `ignore` — the normalized string list, for pure detectors in `core/` that
 *     take an ignore list by injection and glob from the repo root themselves.
 *   - `matches(rel)` / `explain(rel)` — for `readdirSync`-style walks and for the
 *     one line printed when an explicitly named path is processed anyway.
 *
 * 🔴 EVERY IN-SCOPE WALK TAKES AN `ExcludeSet` AS A REQUIRED PARAMETER. The
 * shape that let `findSpecs` go a year without the key was
 * `exclude: readonly string[] = []` — optional-with-default lets a call site
 * forget, and a forgotten argument is indistinguishable from an empty config.
 * Do not reintroduce an optional `ExcludeSet` anywhere in scope.
 *
 * EXPLICITLY NAMED PATHS WIN, LOUDLY. Four tools were measured (2026-09-03):
 * ripgrep and tsc process an explicitly named ignored file silently; ESLint
 * skips it with a warning; prettier skips it and prints "All matched files use
 * Prettier code style!" — the silent no-op this repo has burned itself on. vigiles
 * takes the rg/tsc semantics (an argument is an instruction) with ESLint's
 * loudness: the path is processed and ONE line says which pattern it matched.
 * `exclude` filters DISCOVERY, never an argument.
 *
 * WHAT DELIBERATELY DOES NOT GO THROUGH THIS MODULE — so the next reader does not
 * "fix" it (the classification is issue #192's comment):
 *
 *   - `core/compile.ts#validateGlobRef` — verifies a spec's own `glob()` reference
 *     resolves to ≥1 file. That is reference verification of the user's claim
 *     about the repo, not lint scope; excluding a dir must not make a true ref
 *     false.
 *   - `cli.ts#specReferencedElsewhere` — eject's "is this spec compiled anywhere
 *     else" safety check. Wider is safer: a target under an excluded dir is still
 *     a target that would be orphaned.
 *   - `core/validate.ts#expandGlobs` — expands a pattern the user TYPED. An
 *     argument wins (see above); it is not discovery.
 *   - Surface walks INSIDE a bundle (`plugin-loader.ts#readTree`,
 *     `skill-reachability.ts`): `exclude` applies at BUNDLE granularity via
 *     `discoverNestedBundles`; a skill inside your own `skills/` is yours.
 *   - Internal machinery that never enumerates the user's repo as lint surface:
 *     eval temp installs (`eval.ts`, `adapters/codex/eval.ts`), the eval cache and
 *     locks (`eval-cache.ts`, `eval-lock.ts`, `run-script.ts#snapshotTree`),
 *     `.vigiles/hooks/` discovery (`hook-install.ts`, a fixed dir), sidecars
 *     (`core/sidecar.ts`), linter catalogs / rulesDirs / toolchain paths
 *     (`core/linters.ts`, `core/generate-schema.ts`, `core/generate-types.ts`),
 *     `init`'s shallow adoptable-surface sweep (`cli.ts#discoverAdoptableSurfaces`)
 *     and lint-config collection (`cli.ts#safeReaddir`), and
 *     `core/generate-harness.ts` (an explicit, non-recursive dir argument).
 *
 * The floor (`node_modules`, `dist`, `.git`, `.vigiles`) lives here too, so a
 * walk cannot carry its own private copy of it — the original `findSpecs` list
 * lacked `.vigiles/**` while the three `core/` detectors had it.
 */
import { Minimatch } from "minimatch";
import { relative, sep } from "node:path";
import type { IgnoreLike } from "glob";

/** Always excluded, whatever the config says. Root-relative, like `exclude`. */
export const EXCLUDE_FLOOR: readonly string[] = [
  "node_modules/**",
  "dist/**",
  ".git/**",
  ".vigiles/**",
];

/** The parsed `.vigilesrc.json#exclude`, in the forms a walk consumes. */
export interface ExcludeSet {
  /** Absolute repo root every pattern is relative to. */
  readonly root: string;
  /** The user's patterns, as written (for messages). */
  readonly patterns: readonly string[];
  /**
   * The string-list face for a glob rooted AT `root`: the floor, then each user
   * pattern normalized so a bare directory name excludes its subtree (`bench` →
   * `bench`, `bench/**`), which is what "tsconfig-style" promises.
   */
  readonly ignore: readonly string[];
  /** The function face for `globSync`, correct whatever the glob's `cwd` is. */
  readonly globIgnore: IgnoreLike;
  /** Is this root-relative path excluded (floor or user pattern)? */
  matches(rel: string): boolean;
  /** The pattern that excludes this root-relative path, or null when none does. */
  explain(rel: string): string | null;
}

/** `a\b\c` → `a/b/c`, drop a leading `./`, drop a trailing `/`. */
function normalizeRel(rel: string): string {
  let r = rel
    .split(sep)
    .join("/")
    .replace(/^(?:\.\/)+/, "");
  while (r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

/** Parse `.vigilesrc.json#exclude` once, against `root`. */
export function excludeSet(
  root: string,
  patterns: readonly string[] | undefined,
): ExcludeSet {
  const user = (patterns ?? []).map(normalizeRel).filter((p) => p !== "");
  const all = [...EXCLUDE_FLOOR, ...user];
  // One compiled matcher pair per pattern: the pattern itself and its subtree.
  const compiled = all.map((p) => ({
    pattern: p,
    self: new Minimatch(p, { dot: true }),
    subtree: new Minimatch(`${p}/**`, { dot: true }),
  }));
  const explain = (rel: string): string | null => {
    const r = normalizeRel(rel);
    if (r === "" || r === "." || r.startsWith("../")) return null;
    for (const c of compiled) {
      if (c.self.match(r) || c.subtree.match(r)) return c.pattern;
    }
    return null;
  };
  const matches = (rel: string): boolean => explain(rel) !== null;
  const relOf = (p: { fullpath(): string }): string =>
    normalizeRel(relative(root, p.fullpath()));
  return {
    root,
    patterns: user,
    ignore: [...EXCLUDE_FLOOR, ...user.flatMap((p) => [p, `${p}/**`])],
    globIgnore: {
      ignored: (p) => matches(relOf(p)),
      childrenIgnored: (p) => matches(relOf(p)),
    },
    matches,
    explain,
  };
}
