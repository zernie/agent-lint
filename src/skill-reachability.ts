/**
 * Are vigiles's SHIPPED SKILLS actually reachable by the agent in this repo?
 *
 * vigiles publishes six user-facing skills (`SHIPPED_SKILLS`) — the teaching
 * surface. `test-harness` alone answers "which testing tier do I want?", the
 * question this project's docs are otherwise organized around. They reach the
 * agent through the GLOBAL plugin install (`vigiles init`, or
 * `claude plugin marketplace add zernie/vigiles` + `claude plugin install
 * vigiles@vigiles`), which lands in `~/.claude/plugins/` — deliberately never
 * vendored into the repo (`docs/agent-setup.md`).
 *
 * The failure this module makes loud: `npm install vigiles` ALSO puts those
 * skills on disk, at `node_modules/vigiles/skills/` (they are in package.json's
 * `files`, because the npm tarball doubles as the plugin payload). Claude Code
 * never scans `node_modules`. So a repo that took the dependency but never ran
 * the plugin install has all six skills present, unreachable, and **silent** —
 * observed in a real consumer repo, where a full day went into re-deriving what
 * `test-harness` teaches while it sat three directories away.
 *
 * ⚠️ The part that is easy to get wrong, and did get wrong TWICE, in opposite
 * directions:
 *
 * 1. The authoritative record of a `claude plugin install` is the GLOBAL
 *    `~/.claude/plugins/installed_plugins.json`. A repo's `.claude/settings.json`
 *    carries PROJECT-level `enabledPlugins`, which a correctly-installed
 *    user-scope plugin does not appear in. Judging "is it wired?" from
 *    `settings.json` alone reports a working install as broken — the misread
 *    that made this look like an npm packaging bug.
 * 2. The converse is ALSO false: a project `enabledPlugins` entry does not make
 *    the plugin load. Per the Claude Code docs (Discover plugins → "Configure
 *    team marketplaces"), as of CC v2.1.195 — "A plugin that only the project's
 *    `.claude/settings.json` enables, and that comes from an external source
 *    such as a GitHub repository or npm package, doesn't load until the team
 *    member installs it." vigiles ships from a GitHub marketplace, so that is
 *    exactly our case. Committing `extraKnownMarketplaces` + `enabledPlugins`
 *    makes Claude Code PROMPT each collaborator to install; it does not install.
 *    Confirmed empirically: in a repo whose committed settings.json declares an
 *    external plugin project-level, the global registry had no marketplace
 *    entry, no cache dir, and no install record for it, while a plugin installed
 *    the normal way on the same machine had all three.
 *
 * So a project declaration is a THIRD state — declared, not installed — that
 * still warrants a warning, with a different fix line: the collaborator runs the
 * install, the repo cannot run it for them.
 *
 * Shape follows `src/dialect-drift.ts`: pure parsers + a best-effort local read
 * that NEVER throws + a formatter that returns null when there is nothing to
 * say, so `vigiles audit` can print it without a new verb, flag, or failure mode.
 * It is ADVISORY — it never touches the audit score, because reachability is a
 * property of the machine (is the plugin installed?), not of the repo, and a
 * score that moved between a laptop and CI for identical source would be a lie.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SHIPPED_SKILLS } from "./setup-plan.js";

/** The plugin id `claude plugin install` records — `<plugin>@<marketplace>`. */
export const VIGILES_PLUGIN_ID = "vigiles@vigiles";

/**
 * Where a reachable install was found. Deliberately does NOT include a project
 * `enabledPlugins` entry: that declares the plugin, it does not install it (see
 * the header). It is reported as {@link SkillReachability.declaredNotInstalled}.
 */
export type ReachabilitySource =
  /** `~/.claude/plugins/installed_plugins.json` — what `claude plugin install` writes. */
  | "global-plugin"
  /** The skills vendored into the repo's own `.claude/skills/` (standalone config, always loaded). */
  | "repo-skills";

/** The advisory: can the agent see vigiles's skills from this repo? */
export interface SkillReachability {
  /** True when at least one {@link ReachabilitySource} was found. */
  readonly reachable: boolean;
  /** Every source that resolved, in check order. Empty when un-wired. */
  readonly sources: readonly ReachabilitySource[];
  /**
   * The repo's `.claude/settings.json` enables the plugin, but no install was
   * found. Claude Code will prompt this collaborator to install it; until they
   * do, it does not load. A distinct state from "nothing configured at all",
   * because the fix belongs to the person, not the repo.
   */
  readonly declaredNotInstalled: boolean;
  /**
   * Shipped skills found under `node_modules/vigiles/skills/` while UNREACHABLE
   * — present on disk, invisible to the agent. Empty when reachable (there is
   * nothing stranded if they are wired) or when the package isn't installed yet.
   */
  readonly strandedSkills: readonly string[];
}

/**
 * Is `vigiles` a declared dependency of this package.json text? Pure. Any of the
 * four dependency fields counts — the question is "did this repo take vigiles
 * on", not how.
 */
export function declaresVigilesDependency(pkgJson: string): boolean {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgJson) as Record<string, unknown>;
  } catch {
    return false;
  }
  // The vigiles repo itself is not a consumer — it IS the plugin.
  if (pkg.name === "vigiles") return false;
  const fields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  return fields.some((f) => {
    const deps = pkg[f];
    return typeof deps === "object" && deps !== null && "vigiles" in deps;
  });
}

/**
 * Does the global registry record a live install of the vigiles plugin? Pure over
 * the raw `installed_plugins.json` text. An entry with an EMPTY array is a
 * leftover record, not an install, so it does not count.
 */
export function hasGlobalPluginInstall(installedPluginsJson: string): boolean {
  try {
    const parsed = JSON.parse(installedPluginsJson) as {
      plugins?: Record<string, unknown>;
    };
    const entry = parsed.plugins?.[VIGILES_PLUGIN_ID];
    return Array.isArray(entry) && entry.length > 0;
  } catch {
    return false;
  }
}

/**
 * Does the repo's `.claude/settings.json` explicitly enable the vigiles plugin?
 * Pure. An explicit `false` is a deliberate disable and does NOT count.
 */
export function hasEnabledPlugin(settingsJson: string): boolean {
  try {
    const parsed = JSON.parse(settingsJson) as {
      enabledPlugins?: Record<string, unknown>;
    };
    return parsed.enabledPlugins?.[VIGILES_PLUGIN_ID] === true;
  } catch {
    return false;
  }
}

/** Directory names directly under `dir`, or [] when it isn't readable. */
function dirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Read a file, or null when it isn't there / isn't readable. Never throws. */
function readOrNull(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort, read-local reachability check for `vigiles audit`. Returns null
 * when the question does not apply — the repo has no package.json, or does not
 * depend on vigiles, or IS vigiles — so a non-consumer is never nagged. NEVER
 * throws: every read degrades to "not found".
 *
 * `opts.home` overrides `$HOME` (tests, and any caller with a relocated config).
 */
export function checkSkillReachability(
  dir: string,
  opts: { readonly home?: string } = {},
): SkillReachability | null {
  const pkgJson = readOrNull(join(dir, "package.json"));
  if (pkgJson === null || !declaresVigilesDependency(pkgJson)) return null;

  const home = opts.home ?? homedir();
  const sources: ReachabilitySource[] = [];

  const installed = readOrNull(
    join(home, ".claude", "plugins", "installed_plugins.json"),
  );
  if (installed !== null && hasGlobalPluginInstall(installed))
    sources.push("global-plugin");

  // Vendored copies: only vigiles's OWN skill names count. A repo with 38
  // unrelated skills in `.claude/skills/` is still un-wired.
  const repoSkills = new Set(dirNames(join(dir, ".claude", "skills")));
  if (SHIPPED_SKILLS.some((s) => repoSkills.has(s)))
    sources.push("repo-skills");

  const reachable = sources.length > 0;

  // A project declaration is NOT a source — it makes Claude Code prompt for an
  // install, it does not perform one. Only meaningful while unreachable.
  const settings = readOrNull(join(dir, ".claude", "settings.json"));
  const declaredNotInstalled =
    !reachable && settings !== null && hasEnabledPlugin(settings);

  const vendored = new Set(
    dirNames(join(dir, "node_modules", "vigiles", "skills")),
  );
  return {
    reachable,
    sources,
    declaredNotInstalled,
    strandedSkills: reachable
      ? []
      : SHIPPED_SKILLS.filter((s) => vendored.has(s)),
  };
}

/**
 * The warning for an un-wired repo, or null when there is nothing to say
 * (reachable, or the check did not apply). Names the skill the user most likely
 * went looking for, says where the copies are stranded when they exist, and ends
 * on a command that fixes it.
 */
export function formatSkillReachability(
  r: SkillReachability | null,
): string | null {
  if (!r || r.reachable) return null;
  const stranded =
    r.strandedSkills.length > 0
      ? ` ${String(r.strandedSkills.length)} of them are sitting in ` +
        `node_modules/vigiles/skills/, which the agent never scans.`
      : "";
  const why = r.declaredNotInstalled
    ? `This repo DECLARES the vigiles plugin in .claude/settings.json, but a ` +
      `project declaration doesn't install it — Claude Code loads an ` +
      `external-source plugin only once each collaborator installs it on their ` +
      `own machine.`
    : `This repo depends on vigiles, but its plugin isn't installed.`;
  return (
    `⚠ vigiles's skills are NOT reachable by your agent here. ${why} So the ` +
    `shipped skills (${SHIPPED_SKILLS.join(", ")}) can't be selected — ` +
    `including test-harness, which picks the testing tier for you.${stranded}\n` +
    `  Fix (per machine): claude plugin marketplace add zernie/vigiles && ` +
    `claude plugin install ${VIGILES_PLUGIN_ID}\n` +
    `  (or run \`vigiles init\`, which does both)`
  );
}
