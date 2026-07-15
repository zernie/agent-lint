/**
 * vigiles rule-catalog — the DYNAMIC available-rule catalog.
 *
 * Enumerates every lint rule the repo's linter ACTUALLY has — core built-ins PLUS
 * every installed plugin's rules — so prose can be matched against the LIVE
 * catalog instead of a static hand-curated map. On this repo one ESLint API call
 * yields ~702 available rules (292 core + 410 plugin: typescript-eslint / sonarjs
 * / boundaries), of which ~140 are enabled — vs the old static map's ~23. That
 * makes an architecture norm enforceable too (`boundaries/dependencies` is in the
 * catalog), which a static map never captured. See
 * `research/rule-compiler-multilang-design.md` §0 (the spike this productizes).
 *
 * SAFETY — this EXECUTES the linter. Loading ESLint resolves the repo's real
 * config (which can run plugin/config code), so `enumerateEslintCatalog` is an
 * OWN-REPO / consented capability, NOT the foreign-safe default. The deterministic
 * default rule-compile tier stays purely TEXTUAL (it parses config, never loads
 * it); reach for this only where executing the repo's toolchain is already
 * consented (own repo, on the user's machine). Mirrors the subprocess pattern of
 * `discoverEslintRules` in `src/core/generate-types.ts`: ESLint is loaded in a
 * child `node -e` process at the repo's cwd so it stays out of our process.
 */

import { resolve } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One rule the repo's linter has available, with its enabled state. */
export interface AvailableRule {
  /** The rule id: `no-console`, `@typescript-eslint/no-explicit-any`, `boundaries/dependencies`.
   * For Pylint this is the SYMBOLIC name (`missing-function-docstring`). */
  id: string;
  /** The linter this rule belongs to. Carried PER-RULE (not only on the catalog)
   * so a merged polyglot catalog keeps each rule's provenance — a routed reuse
   * hit can then say `pylint:invalid-name` vs `eslint:no-console`. */
  linter: "eslint" | "pylint";
  /** The plugin prefix (`@typescript-eslint`, `boundaries`), or null for a core rule.
   * Pylint's `--list-msgs` doesn't attribute a message to its plugin, so it's null there. */
  plugin: string | null;
  /** An alternate id the rule is ALSO matchable by (Pylint's numeric code, e.g. `C0116`),
   * so a doc naming either the symbol or the code resolves. Absent for ESLint. */
  code?: string;
  /** Whether the rule is enabled (severity not 0/"off") in the resolved config. */
  enabled: boolean;
}

/** The full available-rule catalog for a repo's linter. */
export interface RuleCatalog {
  linter: "eslint" | "pylint";
  /** Total rules available (core + every installed plugin). */
  available: number;
  /** How many of those are enabled in the resolved config. */
  enabled: number;
  rules: AvailableRule[];
}

// ---------------------------------------------------------------------------
// Pure parse: subprocess JSON → typed catalog (covered by the unit test)
// ---------------------------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parsePlugins(v: unknown): Record<string, string[]> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, string[]> = {};
  for (const [prefix, rules] of Object.entries(v as Record<string, unknown>)) {
    if (isStringArray(rules)) out[prefix] = rules;
  }
  return out;
}

function buildRules(
  core: string[],
  plugins: Record<string, string[]>,
  enabledSet: Set<string>,
): AvailableRule[] {
  const rules: AvailableRule[] = [];
  for (const id of core) {
    rules.push({
      id,
      linter: "eslint",
      plugin: null,
      enabled: enabledSet.has(id),
    });
  }
  for (const [prefix, pluginRules] of Object.entries(plugins)) {
    for (const rule of pluginRules) {
      const id = `${prefix}/${rule}`;
      rules.push({
        id,
        linter: "eslint",
        plugin: prefix,
        enabled: enabledSet.has(id),
      });
    }
  }
  return rules;
}

/**
 * Parse the enumeration subprocess's JSON payload into a typed {@link RuleCatalog}.
 *
 * Payload shape: `{ core: string[]; enabled: string[]; plugins: Record<prefix, string[]> }`.
 * Returns null on `"null"` / malformed input / an empty catalog (mirrors
 * `discoverEslintRules` returning null when nothing is found).
 */
export function parseEslintCatalog(raw: string): RuleCatalog | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const core = isStringArray(obj.core) ? obj.core : [];
  const enabledList = isStringArray(obj.enabled) ? obj.enabled : [];
  const plugins = parsePlugins(obj.plugins);
  const rules = buildRules(core, plugins, new Set(enabledList));
  if (rules.length === 0) return null;
  const enabled = rules.reduce((n, r) => (r.enabled ? n + 1 : n), 0);
  return { linter: "eslint", available: rules.length, enabled, rules };
}

// ---------------------------------------------------------------------------
// Pure parse: pylint's text listings → typed catalog (covered by the unit test)
// ---------------------------------------------------------------------------

// A message line in `pylint --list-msgs`: `:invalid-name (C0103): *...*`
// (leading colon, no indent). In `--list-msgs-enabled`: `  invalid-name (C0103)`
// (indented, no colon). One regex captures the `name (CODE)` core of both.
const PYLINT_MSG_RE = /^\s*:?([a-z][a-z0-9-]*)\s+\(([A-Z]\d+)\)/;

/** Collect the symbol names under the `Enabled messages:` header ONLY.
 *
 * `--list-msgs-enabled` also prints `Disabled messages:` and `Non-emittable
 * messages:` sections with the SAME `name (CODE)` line shape, so a naive
 * line-shape parse would mislabel disabled rules as enabled. Track the current
 * section: a non-indented line ending in `:` is a header; only lines while the
 * "enabled" header is active count. */
function parseEnabledSymbols(listEnabled: string): Set<string> {
  const enabled = new Set<string>();
  let inEnabled = false;
  for (const line of listEnabled.split("\n")) {
    // A section header is a flush-left line ending in a colon (e.g.
    // "Enabled messages:", "Disabled messages:"). Indented message lines never
    // start at column 0, so this never eats a rule.
    if (/^\S.*:\s*$/.test(line)) {
      inEnabled = /^enabled messages:/i.test(line.trim());
      continue;
    }
    if (!inEnabled) continue;
    const m = PYLINT_MSG_RE.exec(line);
    if (m) enabled.add(m[1]);
  }
  return enabled;
}

/**
 * Parse pylint's `--list-msgs` (available) + `--list-msgs-enabled` (enabled)
 * text listings into a typed {@link RuleCatalog}.
 *
 * The available set is every emittable message (`:name (CODE):` lines); enabled
 * is the section-scoped subset. Each rule is matchable by BOTH its symbolic name
 * (`id`) and its numeric code (`code`), since a doc may name either. Returns null
 * when no message parses (pylint absent, or malformed output).
 */
export function parsePylintCatalog(
  listMsgs: string,
  listEnabled: string,
): RuleCatalog | null {
  const enabledSet = parseEnabledSymbols(listEnabled);
  const rules: AvailableRule[] = [];
  const seen = new Set<string>();
  for (const line of listMsgs.split("\n")) {
    // Available lines carry a leading colon; skip anything else (headers, the
    // wrapped description lines, blank lines).
    if (!line.startsWith(":")) continue;
    const m = PYLINT_MSG_RE.exec(line);
    if (!m) continue;
    const [, name, code] = m;
    if (seen.has(name)) continue;
    seen.add(name);
    rules.push({
      id: name,
      linter: "pylint",
      plugin: null,
      code,
      enabled: enabledSet.has(name),
    });
  }
  if (rules.length === 0) return null;
  const enabled = rules.reduce((n, r) => (r.enabled ? n + 1 : n), 0);
  return { linter: "pylint", available: rules.length, enabled, rules };
}

// ---------------------------------------------------------------------------
// Merge: a polyglot repo (JS + Python) yields two catalogs → one for routing
// ---------------------------------------------------------------------------

/**
 * Merge the catalogs of every linter a repo has into ONE catalog for routing.
 *
 * Routing consumes only `.rules` (as a `Map<id, enabled>`), so the merged
 * `linter` field is cosmetic — it names the first present catalog's linter. Rule
 * ids across linters don't collide (ESLint slash-ids vs Pylint symbols), so the
 * concatenation is de-dupe-safe; a repeated id keeps its first entry. Returns
 * undefined when nothing was enumerated (so a non-JS-non-Python repo is byte-
 * identical to before this existed).
 */
export function mergeCatalogs(
  ...cats: (RuleCatalog | null | undefined)[]
): RuleCatalog | undefined {
  const present = cats.filter((c): c is RuleCatalog => c != null);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const rules: AvailableRule[] = [];
  const seen = new Set<string>();
  for (const cat of present) {
    for (const r of cat.rules) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rules.push(r);
    }
  }
  const enabled = rules.reduce((n, r) => (r.enabled ? n + 1 : n), 0);
  return {
    linter: present[0].linter,
    available: rules.length,
    enabled,
    rules,
  };
}

// ---------------------------------------------------------------------------
// Real-IO seam: run ESLint in a child process at the repo's cwd
// ---------------------------------------------------------------------------

/* v8 ignore start -- spawns a `node -e` subprocess that LOADS ESLint in the
   repo's cwd (the executes-the-linter seam); the pure JSON→typed parse is
   parseEslintCatalog, covered by the unit test, and the gated integration test
   drives this real path when eslint resolves. */

/**
 * Enumerate the repo's available ESLint rules (core + every installed plugin).
 *
 * EXECUTES the repo's ESLint in a child process — an own-repo / consented
 * capability (see the file header). Returns null if ESLint isn't resolvable, no
 * config applies, or the subprocess fails.
 */
export function enumerateEslintCatalog(root: string): RuleCatalog | null {
  try {
    // A `.ts` path under src/ so the repo's flat config applies its TypeScript +
    // plugin blocks (typescript-eslint / sonarjs / boundaries all scope to
    // `src/**/*.ts`); the path need not exist — calculateConfigForFile resolves
    // the config, it does not read the file.
    const probeFile = resolve(root, "src/index.ts");
    const script = `
      const { loadESLint } = require("eslint");
      const { builtinRules } = require("eslint/use-at-your-own-risk");
      (async () => {
        try {
          const ESLint = await loadESLint();
          const eslint = new ESLint({ cwd: ${JSON.stringify(root)} });
          const cfg = await eslint.calculateConfigForFile(${JSON.stringify(probeFile)});
          const core = [...builtinRules.keys()];
          const enabled = Object.entries(cfg.rules || {})
            .filter(([, v]) => {
              const sev = Array.isArray(v) ? v[0] : v;
              return sev !== 0 && sev !== "off";
            })
            .map(([k]) => k);
          const plugins = {};
          for (const [prefix, plugin] of Object.entries(cfg.plugins || {})) {
            plugins[prefix] = Object.keys((plugin && plugin.rules) || {});
          }
          console.log(JSON.stringify({ core, enabled, plugins }));
        } catch (e) {
          console.log("null");
        }
      })();
    `;
    const output = execSync(`node -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    return parseEslintCatalog(output);
  } catch {
    return null;
  }
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Real-IO seam: run pylint in a child process at the repo's cwd
// ---------------------------------------------------------------------------

/* v8 ignore start -- spawns the repo's `pylint` twice (the executes-the-linter
   seam); the pure text→typed parse is parsePylintCatalog, covered by the unit
   test, and the gated integration test drives this real path when pylint is on
   PATH. */

/**
 * Enumerate the repo's available Pylint messages (core + every loaded plugin)
 * and their enabled state, via `pylint --list-msgs` + `--list-msgs-enabled`.
 *
 * Run at the repo's cwd so its rcfile (`.pylintrc` / `pyproject.toml` /
 * `setup.cfg`) and `load-plugins` apply — so the listing reflects the repo's
 * REAL rule set, plugins included, with correct enabled state. Like the ESLint
 * catalog this EXECUTES the linter (loading a pylint plugin imports its module),
 * so it's an OWN-REPO / consented capability, NOT the foreign-safe default.
 * Returns null when pylint isn't runnable or lists nothing.
 */
export function enumeratePylintCatalog(root: string): RuleCatalog | null {
  const run = (args: string): string =>
    execSync(`pylint ${args}`, {
      encoding: "utf-8",
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
  try {
    return parsePylintCatalog(run("--list-msgs"), run("--list-msgs-enabled"));
  } catch {
    return null;
  }
}
/* v8 ignore stop */
