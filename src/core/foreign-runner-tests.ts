/**
 * Harness test files that a THIRD-PARTY test runner will collect and execute.
 *
 * Measured 2026-08-11, not reasoned about. A fixture holding nothing but
 * `package.json` and `.claude/skills/foo/foo.test.mjs`, then `npx vitest run`
 * at the repo root: `Test Files  1 passed (1)`. Vitest descended into
 * `.claude/` and ran the file. The assumption that "it lives under a dot-dir,
 * so other tools leave it alone" is simply false — vitest's `defaultExclude` is
 * `["**\/node_modules/**", "**\/.git/**"]` and nothing else, so every dot-dir
 * except `.git` is fair game.
 *
 * Why this is not cosmetic: a harness test is not a unit test. It calls
 * `runHarnessTest` / `measureTriggerRate`, which SPAWN AN AGENT. A foreign
 * runner that collects one spends model budget — silently, in CI, on every
 * push — and the author never asked for it. The `*.eval.*` tier is the paid
 * one by definition, so a file carrying both an eval name and a foreign test
 * name is the expensive case, and the message says so outright.
 *
 * The collision is easy to walk into because vigiles ITSELF blesses these
 * names: `DEFAULT_TEST_SUFFIXES` in `test-coverage.ts` accepts `.test.ts` /
 * `.test.mjs` / … as valid harness tests. Our own `*.harness.mjs` and
 * `*.eval.mjs` do NOT match any third-party default; `*.test.*` matches all of
 * them. So the fix is always a rename, never a config edit.
 *
 * Deliberately NOT a config parse. Reading `vitest.config.*` / `jest.config.*`
 * / `package.json#jest` to find out whether THIS repo overrode its globs would
 * mean evaluating dynamic JS, following `extends`, and resolving monorepo
 * layers — a parser there produces false confidence in both directions. A
 * filename does not lie: these are the DEFAULTS, quoted verbatim from the
 * installed packages, and the finding says "a default run collects this",
 * which is true no matter what any config says.
 *
 * Default globs, read from the packages on disk (reproduce with the paths):
 *
 *   node_modules/vitest/dist/chunks/defaults.*.js
 *     **\/*.{test,spec}.?(c|m)[jt]s?(x)        (defaultInclude)
 *     **\/*.{test,spec}-d.?(c|m)[jt]s?(x)      (typecheck; --typecheck only)
 *
 *   node_modules/jest-config/build/index.js
 *     **\/?(*.)+(spec|test).?([mc])[jt]s?(x)
 *     **\/__tests__/**\/*.?([mc])[jt]s?(x)     ← EVERY js/ts file in the dir,
 *                                                no name suffix required
 *
 * The `-d` typecheck glob is quoted for completeness but NOT matched: it only
 * applies under `vitest --typecheck`, and a plain run ignores it. Reporting it
 * would flag files that no default run touches.
 *
 * Pure string work over names that are already in the scan — zero runtime
 * imports, so `scanFiles` (browser engine) and `scanPlugin` (disk) run the
 * identical predicate and their reports stay byte-identical.
 */

import type { PluginLayout } from "./layout.js";

/** A third-party runner whose DEFAULT config collects the file. */
export type ForeignRunner = "vitest" | "jest";

export interface ForeignRunnerTest {
  /** Repo-relative POSIX path of the offending file. */
  readonly path: string;
  /** Runners whose defaults collect it — never empty. */
  readonly runners: readonly ForeignRunner[];
  /**
   * `"suffix"` — the name ends in `.test.`/`.spec.` + a js/ts extension.
   * `"tests-dir"` — it sits under a `__tests__/` dir, where jest takes files by
   * LOCATION and the name is irrelevant. Kept apart because the fix differs:
   * one is a rename, the other is a move.
   */
  readonly reason: "suffix" | "tests-dir";
}

/**
 * The extension tail shared by both runners: `?(c|m)[jt]s?(x)` (vitest) and
 * `?([mc])[jt]s?(x)` (jest) denote the same set — an optional `c`/`m`, `j` or
 * `t`, `s`, an optional `x`.
 */
const EXT = /\.[cm]?[jt]sx?$/;

/** vitest `**\/*.{test,spec}.?(c|m)[jt]s?(x)` — `.test.`/`.spec.` before the ext. */
const VITEST_NAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * jest `**\/?(*.)+(spec|test).?([mc])[jt]s?(x)`. The prefix `?(*.)` is OPTIONAL,
 * so a bare `test.mjs` matches jest while vitest (which requires `*.` before
 * `.test.`) does not; `+(spec|test)` is one-or-more, so `foo.testspec.ts`
 * matches too. Faithfulness here is the whole point — an approximation would
 * either miss files jest runs or accuse files it does not.
 */
const JEST_NAME = /^(?:.*\.)?(?:spec|test)+\.[cm]?[jt]sx?$/;

/** The paid tier's marker. A foreign runner collecting one of these bills real money. */
const EVAL_MARKER = ".eval.";

/**
 * Harness surface dirs, in every form the loader accepts: bare (`skills/` — the
 * published-plugin shape) and under the materialize/user root (`.claude/skills/`
 * — what a normal Claude Code user has). Layout-driven, so a harness that names
 * its dirs differently is covered without touching this file.
 *
 * Scope is deliberate: `src/foo.test.ts` is an ordinary project test and none of
 * our business. Only a test sitting INSIDE a harness surface is a file whose
 * execution spawns an agent.
 */
export function harnessSurfaceDirs(layout: PluginLayout): readonly string[] {
  const base = [
    layout.skillDir,
    layout.agentDir,
    layout.commandDir,
    // `hooks/hooks.json` → `hooks`. Hook tests are the ones most likely to be
    // named `*.test.mjs`, since they read like ordinary unit tests.
    layout.hooksConventionPath.split("/")[0],
  ].filter((d) => d !== "");
  const roots = ["", layout.materializeRoot, layout.userSurfaceRoot ?? ""];
  const out = new Set<string>();
  for (const root of roots) {
    for (const dir of base) out.add(root === "" ? dir : `${root}/${dir}`);
  }
  return [...out];
}

function inHarnessSurface(path: string, dirs: readonly string[]): boolean {
  return dirs.some((d) => path.startsWith(`${d}/`));
}

/**
 * Classify ONE repo-relative POSIX path, or `undefined` when no default run
 * collects it. Exported for the tests — the engines call {@link foreignRunnerTests}.
 */
export function collectingRunners(path: string): ForeignRunner[] | undefined {
  const segments = path.split("/");
  const base = segments[segments.length - 1] ?? "";
  const runners: ForeignRunner[] = [];
  if (VITEST_NAME.test(base)) runners.push("vitest");
  if (JEST_NAME.test(base)) runners.push("jest");
  return runners.length > 0 ? runners : undefined;
}

/**
 * Every harness file a DEFAULT vitest/jest run would collect. `list` yields
 * repo-relative POSIX paths — injected so the disk scan (walking the surface
 * dirs) and the browser scan (map keys) share one predicate and cannot drift.
 * Sorted, because a report compared byte-for-byte cannot depend on walk order.
 */
export function foreignRunnerTests(
  list: () => readonly string[],
  layout: PluginLayout,
): readonly ForeignRunnerTest[] {
  const dirs = harnessSurfaceDirs(layout);
  const out: ForeignRunnerTest[] = [];
  for (const path of list()) {
    if (!inHarnessSurface(path, dirs)) continue;
    const segments = path.split("/");
    const base = segments[segments.length - 1] ?? "";
    // jest's `__tests__` glob takes files by LOCATION — any js/ts file below
    // such a dir, whatever it is called. Checked on the DIRECTORY part only:
    // a file literally named `__tests__` is not a directory.
    if (segments.slice(0, -1).includes("__tests__") && EXT.test(base)) {
      out.push({ path, runners: ["jest"], reason: "tests-dir" });
      continue;
    }
    const runners = collectingRunners(path);
    if (runners !== undefined) out.push({ path, runners, reason: "suffix" });
  }
  // Plain codepoint order, NOT `localeCompare` — the byte-parity gate compares
  // two engines' reports, and a locale-dependent sort makes that depend on the
  // machine's locale.
  return out.sort((a, b) => {
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });
}

/** Render one finding as a report warning. Shared, so the wording cannot drift. */
export function foreignRunnerTestWarning(f: ForeignRunnerTest): string {
  const runners = f.runners.join(" and ");
  const where =
    f.reason === "tests-dir"
      ? `sits under a \`__tests__/\` dir, and jest's default \`testMatch\` takes EVERY ` +
        `js/ts file below such a dir regardless of its name`
      : `matches the default test glob of ${runners}`;
  const fix =
    f.reason === "tests-dir"
      ? `Move it out of \`__tests__/\` (or rename the dir)`
      : `Rename it to \`*.harness.mjs\` / \`*.eval.mjs\``;
  const command = f.runners[0] === "jest" ? "npx jest" : "npx vitest run";
  return (
    `${f.path} ${where}, so a plain \`${command}\` ` +
    // No harness-specific dir name here: the fact that carries the point is the
    // EXCLUDE list, which is the runner's and is the same everywhere. Naming a
    // dir would also hard-code one harness's layout into shared code.
    `at the repo root COLLECTS AND EXECUTES it — those runners exclude only ` +
    `\`node_modules\` and \`.git\`, so living under a dot-dir protects nothing. ` +
    (f.path.includes(EVAL_MARKER)
      ? `This is an \`*.eval.*\` file: running it drives the REAL model, so a foreign ` +
        `runner burns model budget on every CI run. `
      : // Class-level, not a claim about THIS file: the check reads names only,
        // so it cannot know whether this one drives an agent or is pure. Saying
        // "this spawns an agent" would be an overclaim on a plain offline test.
        `Harness tests drive an agent (\`runHarnessTest\` / \`measureTriggerRate\`), so a ` +
        `collected one runs the model outside the run you asked for. `) +
    `${fix} — vigiles collects those, and no third-party runner's defaults match them.`
  );
}
