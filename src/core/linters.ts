/**
 * Linter cross-referencing engine.
 *
 * Verifies that linter rule references (e.g., "eslint/no-console") point to
 * real rules that exist and are enabled in project config. Supports:
 *   ESLint, Stylelint (Node API), Ruff, Clippy, Pylint, RuboCop, Detekt,
 *   Ktlint, Checkstyle, golangci-lint (CLI),
 *   Cedar (filesystem policies for AWS Bedrock AgentCore / Vectimus).
 *
 * This is the core moat — no other tool resolves rules across 11 catalog APIs
 * (10 linters + Cedar policy language) and checks config-enabled status.
 */

import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { editDistance } from "./edit-distance.js";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { globSync } from "glob";
import { load as loadYaml } from "js-yaml";

/**
 * Prepend version-manager shim directories (rbenv / asdf / rvm) to PATH so
 * gem/pip-installed linters are found in non-login shells and CI, where the
 * shims dir is often missing from PATH even though the tool is installed.
 * Runs once; only adds directories that exist and aren't already present.
 */
function augmentToolPath(): void {
  const home = process.env.HOME ?? "";
  // rbenv/asdf shims don't resolve without a selected version, so add the
  // concrete per-version `bin` dirs (where the gem executables actually live).
  const candidates = [
    ...globSync("/opt/rbenv/versions/*/bin", { nodir: false }),
    ...(home
      ? globSync(`${home}/.rbenv/versions/*/bin`, { nodir: false })
      : []),
    ...(home
      ? globSync(`${home}/.asdf/installs/*/*/bin`, { nodir: false })
      : []),
    `${home}/.rvm/bin`,
    `${home}/.local/bin`,
  ];
  const current = (process.env.PATH ?? "").split(":");
  const additions = candidates.filter(
    (d) => d && existsSync(d) && !current.includes(d),
  );
  if (additions.length > 0) {
    process.env.PATH = [...current, ...additions].join(":");
  }
}
augmentToolPath();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigEnabledStatus = "enabled" | "disabled" | "unknown";

export interface LinterCheckResult {
  exists: boolean;
  enabled: ConfigEnabledStatus;
  linter: string;
  rule: string;
  error?: string;
}

export interface DetectedLinter {
  name: string;
  ruleCount?: number;
  via?: string;
}

/** Extended Set with eslint metadata. */
interface EslintRuleSet extends Set<string> {
  _basePath?: string;
  _isEslint?: boolean;
}

// ---------------------------------------------------------------------------
// Parsing enforcement references
// ---------------------------------------------------------------------------

/** @internal */ export function extractLinterName(enforcedBy: string): string {
  const colonIdx = enforcedBy.indexOf("::");
  const slashIdx = enforcedBy.indexOf("/");
  if (colonIdx === -1 && slashIdx === -1) return enforcedBy;
  if (colonIdx === -1) return enforcedBy.substring(0, slashIdx);
  if (slashIdx === -1) return enforcedBy.substring(0, colonIdx);
  return enforcedBy.substring(0, Math.min(slashIdx, colonIdx));
}

/** @internal */ export function extractRuleName(
  enforcedBy: string,
): string | null {
  const colonIdx = enforcedBy.indexOf("::");
  const slashIdx = enforcedBy.indexOf("/");
  if (colonIdx === -1 && slashIdx === -1) return null;
  if (colonIdx === -1) return enforcedBy.substring(slashIdx + 1);
  if (slashIdx === -1) return enforcedBy.substring(colonIdx + 2);
  const idx = Math.min(slashIdx, colonIdx);
  const sep = idx === colonIdx ? 2 : 1;
  return enforcedBy.substring(idx + sep);
}

const SAFE_RULE_NAME_RE = /^[a-zA-Z0-9_\-/.:#]+$/;

// ---------------------------------------------------------------------------
// ESLint plugin resolution
// ---------------------------------------------------------------------------

function eslintPluginPkgNames(pluginName: string): string[] {
  if (pluginName.startsWith("@")) {
    const parts = pluginName.split("/");
    if (parts.length === 1) return [`${parts[0]}/eslint-plugin`];
    return [
      `${parts[0]}/eslint-plugin-${parts[1]}`,
      `${parts[0]}/eslint-plugin`,
    ];
  }
  return [`eslint-plugin-${pluginName}`];
}

function tryResolvePlugin(
  req: NodeJS.Require,
  pkg: string,
): Set<string> | null {
  try {
    const plugin = req(pkg) as {
      rules?: Record<string, unknown>;
      default?: { rules?: Record<string, unknown> };
    };
    const rules = plugin.rules ?? plugin.default?.rules;
    if (rules) return new Set(Object.keys(rules));
    return null;
  } catch {
    return null;
  }
}

function resolveEslintPluginRules(
  pluginName: string,
  basePath: string,
): Set<string> | null {
  try {
    const req = createRequire(resolve(basePath, "package.json"));
    const pkgNames = eslintPluginPkgNames(pluginName);
    for (const pkg of pkgNames) {
      const result = tryResolvePlugin(req, pkg);
      if (result) return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Built-in resolvers (Node API)
// ---------------------------------------------------------------------------

const LINTER_RESOLVERS: Record<
  string,
  (basePath: string) => EslintRuleSet | Set<string>
> = {
  eslint(basePath: string): EslintRuleSet {
    const req = createRequire(resolve(basePath, "package.json"));
    const { builtinRules } = req("eslint/use-at-your-own-risk") as {
      builtinRules: Map<string, unknown>;
    };
    const rules: EslintRuleSet = new Set(builtinRules.keys());
    rules._basePath = basePath;
    rules._isEslint = true;
    return rules;
  },
  stylelint(basePath: string): Set<string> {
    const req = createRequire(resolve(basePath, "package.json"));
    const mod = req("stylelint") as { rules: Record<string, unknown> };
    return new Set(Object.keys(mod.rules));
  },
};

// ---------------------------------------------------------------------------
// JVM + Go catalog helpers (detekt / ktlint / checkstyle / golangci-lint)
//
// All four follow the rubocop/clippy shape: a CLI-backed existence check in
// CLI_RULE_CHECKS + a config-enabled checker in LINTER_CONFIG_CHECKERS. The
// pure parsing halves are exported @internal so they are unit-testable with
// no binary installed.
// ---------------------------------------------------------------------------

/** Escape a literal for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DETEKT_CONFIG_FILES = [
  "detekt.yml",
  "detekt-config.yml",
  "config/detekt/detekt.yml",
] as const;

/** The effective state of one detekt rule, read from a project's config. */
export interface DetektRuleState {
  /** The enclosing ruleset key (e.g. `style`, `complexity`). */
  readonly ruleset: string;
  /**
   * `enabled`/`disabled` if the rule's own `active:` is set, else `disabled`
   * when its ENCLOSING ruleset is `active: false` (a ruleset-level off disables
   * every rule under it), else `unknown` — the rule inherits detekt's default.
   */
  readonly active: ConfigEnabledStatus;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `active: true|false` → enabled/disabled; anything else (absent/non-bool) → null. */
function readActive(v: unknown): "enabled" | "disabled" | null {
  if (v === true) return "enabled";
  if (v === false) return "disabled";
  return null;
}

/**
 * Parse a detekt YAML config into a map of PascalCase rule name → its effective
 * state. Parsed with js-yaml, NOT a hand-rolled indent regex (see the
 * `parse-structured-input-with-a-real-parser` rule) — so indentation, quoting,
 * comments and inline maps all work, and a nested rule OPTION (`threshold:`,
 * `ignoreNumbers:`) can never be mistaken for a rule. The ONE parser every
 * detekt site derives from: rule-key discovery, the config-names-rule existence
 * fallback, and the enabled-state check. Rulesets are the top-level maps; a rule
 * is a PascalCase child key of a ruleset (detekt's meta sections — build,
 * processors, console-reports — have only lowercase/kebab children, so they are
 * never read as rules). Malformed YAML → an empty map (fail closed).
 * @internal
 */
export function parseDetektConfig(yaml: string): Map<string, DetektRuleState> {
  const out = new Map<string, DetektRuleState>();
  let doc: unknown;
  try {
    doc = loadYaml(yaml);
  } catch {
    return out;
  }
  if (!isRecord(doc)) return out;
  for (const [ruleset, body] of Object.entries(doc)) {
    if (isRecord(body)) collectDetektRuleset(ruleset, body, out);
  }
  return out;
}

/** Collect the PascalCase rules of one ruleset block into `out`. */
function collectDetektRuleset(
  ruleset: string,
  body: Record<string, unknown>,
  out: Map<string, DetektRuleState>,
): void {
  const rulesetDisabled = readActive(body.active) === "disabled";
  for (const [key, val] of Object.entries(body)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(key)) continue; // rule keys are PascalCase
    const ruleActive = isRecord(val) ? readActive(val.active) : null;
    const active: ConfigEnabledStatus =
      ruleActive ?? (rulesetDisabled ? "disabled" : "unknown");
    out.set(key, { ruleset, active });
  }
}

/**
 * The PascalCase rule names named by a detekt config — the discovery/existence
 * surface. A thin projection of {@link parseDetektConfig} so key extraction and
 * enabled-state can never disagree.
 * @internal
 */
export function parseDetektRuleKeys(yaml: string): Set<string> {
  return new Set(parseDetektConfig(yaml).keys());
}

/** Read the first present detekt config file's contents (null if none). @internal */
export function readDetektConfig(basePath: string): string | null {
  for (const rel of DETEKT_CONFIG_FILES) {
    const p = resolve(basePath, rel);
    if (!existsSync(p)) continue;
    try {
      return readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * detekt has no per-rule query CLI, but `detekt --generate-config` exports the
 * default config, which names every bundled rule. Generated once into a temp
 * dir and cached (the default catalog is project-independent). Newer CLIs
 * export to the `--config` path; older ones write `default-detekt-config.yml`
 * into the cwd — both locations are read back.
 */
let DETEKT_DEFAULT_RULE_CACHE: Set<string> | null = null;
function getDetektDefaultRules(): Set<string> {
  if (DETEKT_DEFAULT_RULE_CACHE) return DETEKT_DEFAULT_RULE_CACHE;
  let rules = new Set<string>();
  const tmp = mkdtempSync(join(tmpdir(), "vigiles-detekt-"));
  try {
    const target = join(tmp, "generated-default.yml");
    execSync(`detekt --generate-config --config ${target}`, {
      cwd: tmp,
      stdio: "ignore",
      timeout: 60000,
    });
    for (const p of [target, join(tmp, "default-detekt-config.yml")]) {
      if (!existsSync(p)) continue;
      rules = parseDetektRuleKeys(readFileSync(p, "utf-8"));
      if (rules.size > 0) break;
    }
  } catch {
    // Enumeration failed (old CLI / flag mismatch) — leave the set empty so
    // the existence check fails OPEN rather than crying wolf on every rule.
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  DETEKT_DEFAULT_RULE_CACHE = rules;
  return rules;
}

function detektConfigNamesRule(ruleName: string, basePath: string): boolean {
  const cfg = readDetektConfig(basePath);
  if (!cfg) return false;
  // Only a real PascalCase rule key counts — a nested option (`threshold:`)
  // must NOT pass as a rule (parseDetektConfig filters those out).
  return parseDetektConfig(cfg).has(ruleName);
}

/**
 * Config-enabled status for a detekt rule, read from the project's detekt
 * YAML (detekt.yml / detekt-config.yml / config/detekt/detekt.yml). The rule's
 * own `active: true|false` decides; failing that, a ruleset-level `active: false`
 * disables it; otherwise the rule inherits detekt's default, reported honestly
 * as "unknown". Derived from the shared {@link parseDetektConfig}.
 * @internal
 */
export function detektEnabledStatus(
  ruleName: string,
  basePath: string,
): ConfigEnabledStatus {
  const cfg = readDetektConfig(basePath);
  if (!cfg) return "unknown";
  return parseDetektConfig(cfg).get(ruleName)?.active ?? "unknown";
}

/**
 * Config-enabled status for a ktlint rule, read from `.editorconfig`. The
 * per-rule property is `ktlint_<ruleset>_<rule-id> = enabled|disabled`
 * (e.g. `ktlint_standard_no-wildcard-imports = disabled`); a ruleset-level
 * `ktlint_<ruleset> = enabled|disabled` is the fallback. An unqualified rule
 * name defaults to the `standard` ruleset, matching ktlint.
 * @internal
 */
export function ktlintEnabledStatus(
  ruleName: string,
  basePath: string,
): ConfigEnabledStatus {
  const p = resolve(basePath, ".editorconfig");
  if (!existsSync(p)) return "unknown";
  let content: string;
  try {
    content = readFileSync(p, "utf-8");
  } catch {
    return "unknown";
  }
  const colonIdx = ruleName.indexOf(":");
  const ruleset =
    colonIdx === -1 ? "standard" : ruleName.substring(0, colonIdx);
  const id = colonIdx === -1 ? ruleName : ruleName.substring(colonIdx + 1);
  const ruleProp = new RegExp(
    `^\\s*ktlint_${escapeRe(ruleset)}_${escapeRe(id)}\\s*=\\s*(enabled|disabled)`,
    "m",
  );
  const ruleMatch = ruleProp.exec(content);
  if (ruleMatch) return ruleMatch[1] === "enabled" ? "enabled" : "disabled";
  const setProp = new RegExp(
    `^\\s*ktlint_${escapeRe(ruleset)}\\s*=\\s*(enabled|disabled)`,
    "m",
  );
  const setMatch = setProp.exec(content);
  if (setMatch) return setMatch[1] === "enabled" ? "enabled" : "disabled";
  return "unknown";
}

const CHECKSTYLE_CONFIG_FILES = [
  "checkstyle.xml",
  "config/checkstyle/checkstyle.xml",
  "google_checks.xml",
  "sun_checks.xml",
] as const;

function readCheckstyleConfig(basePath: string): string | null {
  for (const rel of CHECKSTYLE_CONFIG_FILES) {
    const p = resolve(basePath, rel);
    if (!existsSync(p)) continue;
    try {
      return readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Config-enabled status for a checkstyle module. A checkstyle config is a
 * whitelist — only listed modules run — so a module absent from the config is
 * "disabled", and a listed module is "enabled" unless its own `severity`
 * property is `ignore`.
 * @internal
 */
export function checkstyleEnabledStatus(
  ruleName: string,
  basePath: string,
): ConfigEnabledStatus {
  const xml = readCheckstyleConfig(basePath);
  if (xml === null) return "unknown";
  const moduleRe = new RegExp(
    `<module\\s+name\\s*=\\s*["']${escapeRe(ruleName)}["']`,
  );
  const m = moduleRe.exec(xml);
  if (!m) return "disabled";
  const rest = xml.substring(m.index + m[0].length);
  const bounds = [rest.indexOf("<module"), rest.indexOf("</module>")].filter(
    (i) => i >= 0,
  );
  const scope =
    bounds.length > 0 ? rest.substring(0, Math.min(...bounds)) : rest;
  if (
    /name\s*=\s*["']severity["'][^>]*value\s*=\s*["']ignore["']/.test(scope)
  ) {
    return "disabled";
  }
  return "enabled";
}

/**
 * Whether `golangci-lint help linters` / `golangci-lint linters` output lists
 * a linter of this name (names start a line, followed by `:`, whitespace, or
 * an alt-name paren like `govet (vet, vetshadow):`).
 * @internal
 */
export function golangciOutputListsLinter(
  output: string,
  name: string,
): boolean {
  return new RegExp(`^${escapeRe(name)}[:\\s(]`, "m").test(output);
}

/**
 * Config-enabled status from `golangci-lint linters` output, which lists an
 * "Enabled by your configuration linters:" section followed by a
 * "Disabled by your configuration linters:" section (same section-split shape
 * as the pylint checker).
 * @internal
 */
export function golangciEnabledStatusFromOutput(
  output: string,
  name: string,
): ConfigEnabledStatus {
  const disabledIdx = output.search(/^Disabled by/m);
  const enabledSection =
    disabledIdx >= 0 ? output.substring(0, disabledIdx) : output;
  const disabledSection = disabledIdx >= 0 ? output.substring(disabledIdx) : "";
  if (golangciOutputListsLinter(disabledSection, name)) return "disabled";
  if (golangciOutputListsLinter(enabledSection, name)) return "enabled";
  return "unknown";
}

/** Linter names listed at line starts of `golangci-lint help linters` output. */
function golangciLinterNames(output: string): string[] {
  const names: string[] = [];
  const nameRe = /^([a-z][a-z0-9_-]+)(?:\s*\([^)]*\))?:/gm;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(output)) !== null) {
    names.push(m[1]);
  }
  return names;
}

const CHECKSTYLE_PROBE_HEADER =
  `<?xml version="1.0"?>\n` +
  `<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" ` +
  `"https://checkstyle.org/dtds/configuration_1_3.dtd">\n`;

function checkstyleProbeConfigs(ruleName: string): string[] {
  return [
    // Most checks are TreeWalker children (MagicNumber, WhitespaceAround, …).
    `${CHECKSTYLE_PROBE_HEADER}<module name="Checker"><module name="TreeWalker"><module name="${ruleName}"/></module></module>\n`,
    // File-level checks and filters sit directly under Checker
    // (NewlineAtEndOfFile, FileLength, SuppressionFilter, …).
    `${CHECKSTYLE_PROBE_HEADER}<module name="Checker"><module name="${ruleName}"/></module>\n`,
  ];
}

function runCheckstyleProbe(configPath: string, probePath: string): boolean {
  try {
    execSync(`checkstyle -c ${configPath} ${probePath}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    return true;
  } catch (e) {
    // A violation on the probe file still proves the module exists — only a
    // module-instantiation failure means "no such check".
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`;
    return !/cannot initialize module|Unable to instantiate/i.test(out);
  }
}

/**
 * Checkstyle has no "does check X exist" query, so probe by running the real
 * CLI over a tiny config that names the module, first as a TreeWalker child,
 * then as a Checker child (file-level checks/filters). The module exists iff
 * either placement instantiates.
 */
function checkstyleModuleInstantiates(ruleName: string): boolean {
  const tmp = mkdtempSync(join(tmpdir(), "vigiles-checkstyle-"));
  try {
    const probe = join(tmp, "Probe.java");
    writeFileSync(probe, "class Probe {}\n");
    let i = 0;
    for (const config of checkstyleProbeConfigs(ruleName)) {
      const configPath = join(tmp, `probe-${String(i++)}.xml`);
      writeFileSync(configPath, config);
      if (runCheckstyleProbe(configPath, probe)) return true;
    }
    return false;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI-based per-rule checks
// ---------------------------------------------------------------------------

// Each check throws if the rule doesn't exist. `basePath` is the TARGET project's
// root (a monorepo package / a library caller's audited repo), NOT process.cwd —
// a custom rule declared only in the target's own config must resolve against it
// (Codex review). A check that doesn't need it may omit the 2nd param.
const CLI_RULE_CHECKS: Record<
  string,
  (ruleName: string, basePath: string) => void
> = {
  ruff(ruleName: string): void {
    execSync(`ruff rule ${ruleName}`, { stdio: "ignore" });
  },
  clippy(ruleName: string): void {
    execSync(`cargo clippy --explain ${ruleName}`, { stdio: "ignore" });
  },
  pylint(ruleName: string): void {
    const output = execSync(`pylint --help-msg=${ruleName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (output.includes("No such message id")) {
      throw new Error(`Unknown pylint message: ${ruleName}`);
    }
  },
  rubocop(ruleName: string): void {
    const output = execSync(`rubocop --show-cops ${ruleName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (!output || output.trim().length === 0) {
      throw new Error(`Unknown cop: ${ruleName}`);
    }
  },
  detekt(ruleName: string, basePath: string): void {
    // detekt has no per-rule query CLI; the bundled catalog is enumerated once
    // via `detekt --generate-config` (see getDetektDefaultRules). A rule
    // outside the bundled set may still come from a third-party ruleset
    // plugin, so a rule named in the project's own detekt config is accepted
    // too. If enumeration fails entirely, fail OPEN — never cry wolf.
    const rules = getDetektDefaultRules();
    if (rules.size === 0) return;
    if (rules.has(ruleName)) return;
    if (detektConfigNamesRule(ruleName, basePath)) return;
    throw new Error(`Unknown detekt rule: ${ruleName}`);
  },
  ktlint(ruleName: string): void {
    // ktlint ships NO rule-catalog CLI (its only subcommands are
    // generateEditorConfig + the git hooks — verified against ktlint-cli
    // source), so existence is format-only: a qualified "<ruleset>:<rule-id>"
    // reference (e.g. "standard:no-wildcard-imports"). Enabled-status is
    // still real: it reads the `.editorconfig` ktlint properties.
    if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(ruleName)) {
      throw new Error(
        `ktlint rules must be "<ruleset>:<rule-id>" (e.g. "standard:no-wildcard-imports"), got: ${ruleName}`,
      );
    }
  },
  checkstyle(ruleName: string): void {
    // Checkstyle has no "does check X exist" query; probe by running the real
    // CLI over a tiny config naming the module (TreeWalker child first, then
    // Checker child). Only an instantiation error means "no such module" —
    // a violation on the probe file proves the module is real.
    if (!checkstyleModuleInstantiates(ruleName)) {
      throw new Error(`Unknown checkstyle module: ${ruleName}`);
    }
  },
  "golangci-lint"(ruleName: string): void {
    const output = execSync("golangci-lint help linters", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    if (!golangciOutputListsLinter(output, ruleName)) {
      throw new Error(`Unknown golangci-lint linter: ${ruleName}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Config-enabled checkers
// ---------------------------------------------------------------------------

type ConfigLoader = (ruleName: string) => ConfigEnabledStatus;

function createCachedChecker(
  loadConfigFn: (basePath: string) => ConfigLoader | null,
): (ruleName: string, basePath: string) => ConfigEnabledStatus {
  const cache = new Map<string, ConfigLoader | null>();
  return (ruleName: string, basePath: string): ConfigEnabledStatus => {
    if (!cache.has(basePath)) {
      try {
        cache.set(basePath, loadConfigFn(basePath));
      } catch {
        cache.set(basePath, null);
      }
    }
    const config = cache.get(basePath);
    if (!config) return "unknown";
    return config(ruleName);
  };
}

const LINTER_CONFIG_CHECKERS: Record<
  string,
  (ruleName: string, basePath: string) => ConfigEnabledStatus
> = {
  eslint: createCachedChecker((basePath: string): ConfigLoader | null => {
    try {
      const script = `
        const { loadESLint } = require("eslint");
        (async () => {
          try {
            const ESLint = await loadESLint();
            const eslint = new ESLint({ cwd: ${JSON.stringify(basePath)} });
            const config = await eslint.calculateConfigForFile("dummy.js");
            console.log(JSON.stringify(config.rules || {}));
          } catch(e) {
            console.log("{}");
          }
        })();
      `;
      const output = execSync(`node -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
      });
      const rules = JSON.parse(output.trim() || "{}") as Record<
        string,
        unknown
      >;
      return (ruleName: string): ConfigEnabledStatus => {
        if (!(ruleName in rules)) return "unknown";
        const setting: unknown = rules[ruleName];
        const severity: unknown = Array.isArray(setting) ? setting[0] : setting;
        if (severity === 0 || severity === "off") return "disabled";
        return "enabled";
      };
    } catch {
      return null;
    }
  }),

  stylelint: createCachedChecker((basePath: string): ConfigLoader | null => {
    try {
      const script = `
        const stylelint = require("stylelint");
        (async () => {
          try {
            const linter = stylelint.createLinter({});
            const result = await linter.getConfigForFile(${JSON.stringify(resolve(basePath, "dummy.css"))});
            console.log(JSON.stringify(result.config.rules || {}));
          } catch(e) {
            console.log("{}");
          }
        })();
      `;
      const output = execSync(`node -e '${script.replace(/'/g, "'\\''")}'`, {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
      });
      const rules = JSON.parse(output.trim() || "{}") as Record<
        string,
        unknown
      >;
      return (ruleName: string): ConfigEnabledStatus => {
        if (!(ruleName in rules)) return "unknown";
        const setting = rules[ruleName];
        if (setting === null || (Array.isArray(setting) && setting[0] === null))
          return "disabled";
        return "enabled";
      };
    } catch {
      return null;
    }
  }),

  ruff: createCachedChecker((basePath: string): ConfigLoader | null => {
    try {
      const dummyPath = resolve(basePath, "dummy.py");
      const output = execSync(`ruff check --show-settings ${dummyPath}`, {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      });
      const enabledMatch = output.match(
        /linter\.rules\.enabled\s*=\s*\[([\s\S]*?)\]/,
      );
      const enabledCodes = new Set<string>();
      if (enabledMatch?.[1]) {
        const codeRe = /\(([A-Z]+\d*)\)/g;
        let m: RegExpExecArray | null;
        while ((m = codeRe.exec(enabledMatch[1])) !== null) {
          enabledCodes.add(m[1]);
        }
      }
      return (ruleName: string): ConfigEnabledStatus => {
        if (enabledCodes.has(ruleName)) return "enabled";
        for (const code of enabledCodes) {
          if (code.startsWith(ruleName)) return "enabled";
        }
        return "disabled";
      };
    } catch {
      return null;
    }
  }),

  pylint: createCachedChecker((basePath: string): ConfigLoader | null => {
    try {
      const output = execSync("pylint --list-msgs-enabled", {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
      });
      const disabledIdx = output.indexOf("Disabled messages:");
      const enabledSection =
        disabledIdx >= 0 ? output.substring(0, disabledIdx) : output;
      const disabledSection =
        disabledIdx >= 0 ? output.substring(disabledIdx) : "";
      return (ruleName: string): ConfigEnabledStatus => {
        if (disabledSection.includes(ruleName)) return "disabled";
        if (enabledSection.includes(ruleName)) return "enabled";
        return "unknown";
      };
    } catch {
      return null;
    }
  }),

  rubocop(ruleName: string, basePath: string): ConfigEnabledStatus {
    try {
      const output = execSync(`rubocop --show-cops ${ruleName}`, {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "ignore"],
      });
      if (!output || output.trim().length === 0) return "unknown";
      const enabledMatch = output.match(/Enabled:\s*(true|false|pending)/);
      if (!enabledMatch) return "unknown";
      return enabledMatch[1] === "true" ? "enabled" : "disabled";
    } catch {
      return "unknown";
    }
  },

  clippy: createCachedChecker((basePath: string): ConfigLoader | null => {
    try {
      const cargoPath = resolve(basePath, "Cargo.toml");
      if (!existsSync(cargoPath)) return null;
      const content = readFileSync(cargoPath, "utf-8");
      const sectionMatch = content.match(
        /\[lints\.clippy\]([\s\S]*?)(?=\n\[|$)/,
      );
      if (!sectionMatch?.[1]) return null;
      const section = sectionMatch[1];
      return (ruleName: string): ConfigEnabledStatus => {
        const shortName = ruleName.replace(/^clippy::/, "");
        const ruleMatch = section.match(
          new RegExp(
            `${shortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*"(\\w+)"`,
          ),
        );
        if (!ruleMatch?.[1]) return "unknown";
        return ruleMatch[1] === "allow" ? "disabled" : "enabled";
      };
    } catch {
      return null;
    }
  }),

  detekt: detektEnabledStatus,

  ktlint: ktlintEnabledStatus,

  checkstyle: checkstyleEnabledStatus,

  "golangci-lint": createCachedChecker(
    (basePath: string): ConfigLoader | null => {
      try {
        const output = execSync("golangci-lint linters", {
          encoding: "utf-8",
          cwd: basePath,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 60000,
        });
        return (ruleName: string): ConfigEnabledStatus =>
          golangciEnabledStatusFromOutput(output, ruleName);
      } catch {
        return null;
      }
    },
  ),
};

function cliAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const CLI_TOOL_FOR_LINTER: Record<string, string> = {
  ruff: "ruff",
  clippy: "cargo",
  pylint: "pylint",
  rubocop: "rubocop",
  detekt: "detekt",
  ktlint: "ktlint",
  checkstyle: "checkstyle",
  "golangci-lint": "golangci-lint",
};

// ---------------------------------------------------------------------------
// Custom linter support (rulesDir)
// ---------------------------------------------------------------------------

function ruleFileExists(
  ruleName: string,
  rulesDir: string,
  basePath: string,
): boolean | null {
  const dir = resolve(basePath, rulesDir);
  if (!existsSync(dir)) return null;
  const matches = globSync(`${ruleName}.*`, { cwd: dir });
  return matches.length > 0;
}

// ---------------------------------------------------------------------------
// checkLinterRule helpers
// ---------------------------------------------------------------------------

interface RuleContext {
  linterName: string;
  ruleName: string;
  basePath: string;
  catalogOnly?: boolean;
  linters?: Record<string, { rulesDir?: string | string[] }>;
}

function makeResult(
  ctx: RuleContext,
  exists: boolean,
  enabled: ConfigEnabledStatus = "unknown",
  error?: string,
): LinterCheckResult {
  return { exists, enabled, linter: ctx.linterName, rule: ctx.ruleName, error };
}

// editDistance moved to ./edit-distance.ts (a zero-dep leaf) so the browser-safe
// typo detectors don't transitively import this node-coupled module. Imported at
// the top for closestRuleNames below; re-exported here for backward compatibility.
export { editDistance };

/** Top-N closest rule names by edit distance, filtered by a max distance. */
function closestRuleNames(
  target: string,
  candidates: Iterable<string>,
  limit = 3,
  maxDistance = 4,
): string[] {
  const scored: { name: string; dist: number }[] = [];
  for (const c of candidates) {
    const d = editDistance(target, c);
    if (d <= maxDistance) scored.push({ name: c, dist: d });
  }
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit).map((s) => s.name);
}

/** @internal */ function tryNodeResolver(
  ctx: RuleContext,
): LinterCheckResult | null {
  const resolver = LINTER_RESOLVERS[ctx.linterName];
  if (!resolver) return null;
  try {
    const resolved = resolver(ctx.basePath);
    const eslintSet = resolved as EslintRuleSet;

    if (!resolved.has(ctx.ruleName)) {
      const foundInPlugin =
        eslintSet._isEslint &&
        ctx.ruleName.includes("/") &&
        isEslintPluginRule(ctx.ruleName, eslintSet._basePath ?? ctx.basePath);
      if (!foundInPlugin) {
        const suggestions = closestRuleNames(ctx.ruleName, resolved);
        const hint =
          suggestions.length > 0
            ? ` Did you mean: ${suggestions.map((s) => `"${ctx.linterName}/${s}"`).join(", ")}?`
            : "";
        return makeResult(
          ctx,
          false,
          "unknown",
          `Rule "${ctx.ruleName}" not found in ${ctx.linterName}.${hint}`,
        );
      }
    }

    const enabled = checkConfigEnabled(
      ctx.linterName,
      ctx.ruleName,
      ctx.basePath,
      ctx.catalogOnly,
    );
    return makeResult(ctx, true, enabled);
  } catch {
    return null;
  }
}

function isEslintPluginRule(ruleName: string, basePath: string): boolean {
  const pluginPrefix = ruleName.substring(0, ruleName.indexOf("/"));
  const pluginRuleName = ruleName.substring(ruleName.indexOf("/") + 1);
  const pluginRules = resolveEslintPluginRules(pluginPrefix, basePath);
  return pluginRules?.has(pluginRuleName) === true;
}

/** @internal */ function tryScopedPlugin(
  ctx: RuleContext,
): LinterCheckResult | null {
  const pluginRules = resolveEslintPluginRules(ctx.linterName, ctx.basePath);
  if (!pluginRules) return null;
  if (!pluginRules.has(ctx.ruleName)) {
    return makeResult(
      ctx,
      false,
      "unknown",
      `Rule "${ctx.ruleName}" not found in ${ctx.linterName}`,
    );
  }
  const enabled = checkConfigEnabled(
    "eslint",
    `${ctx.linterName}/${ctx.ruleName}`,
    ctx.basePath,
    ctx.catalogOnly,
  );
  return makeResult(ctx, true, enabled);
}

/**
 * Enumerate all rules for a CLI-based linter so `tryCliCheck` can emit
 * closest-match suggestions on typos. Result is cached per (linter,
 * basePath) so each linter's discovery CLI runs at most once per lint.
 */
const CLI_RULE_SET_CACHE = new Map<string, Set<string>>();
function getCliRuleSet(linterName: string, basePath: string): Set<string> {
  const key = `${linterName}:${basePath}`;
  const cached = CLI_RULE_SET_CACHE.get(key);
  if (cached) return cached;
  const rules = new Set<string>();
  try {
    if (linterName === "ruff") {
      const output = execSync(
        `ruff check --show-settings ${resolve(basePath, "dummy.py")}`,
        { encoding: "utf-8", cwd: basePath, stdio: ["pipe", "pipe", "pipe"] },
      );
      const enabledMatch = output.match(
        /linter\.rules\.enabled\s*=\s*\[([\s\S]*?)\]/,
      );
      if (enabledMatch?.[1]) {
        const codeRe = /\(([A-Z]+\d*)\)/g;
        let m: RegExpExecArray | null;
        while ((m = codeRe.exec(enabledMatch[1])) !== null) {
          rules.add(m[1]);
        }
      }
    } else if (linterName === "pylint") {
      const output = execSync("pylint --list-msgs-enabled", {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const codeRe = /\b([a-z][a-z0-9-]+)\s*\([A-Z]\d+\)/g;
      let m: RegExpExecArray | null;
      while ((m = codeRe.exec(output)) !== null) {
        rules.add(m[1]);
      }
    } else if (linterName === "rubocop") {
      const output = execSync("rubocop --show-cops", {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const copRe = /^([A-Z][A-Za-z]+\/[A-Z][A-Za-z0-9]+):/gm;
      let m: RegExpExecArray | null;
      while ((m = copRe.exec(output)) !== null) {
        rules.add(m[1]);
      }
    } else if (linterName === "clippy") {
      // Read Cargo.toml [lints.clippy] section — same source of truth
      // generate-types uses. Full clippy catalogue is enormous and
      // only partially enabled per project.
      const cargoPath = resolve(basePath, "Cargo.toml");
      if (existsSync(cargoPath)) {
        const content = readFileSync(cargoPath, "utf-8");
        const sectionMatch = content.match(
          /\[lints\.clippy\]([\s\S]*?)(?=\n\[|$)/,
        );
        if (sectionMatch?.[1]) {
          const ruleRe = /^([a-z][a-z_]*)\s*=/gm;
          let m: RegExpExecArray | null;
          while ((m = ruleRe.exec(sectionMatch[1])) !== null) {
            rules.add(m[1]);
          }
        }
      }
    } else if (linterName === "detekt") {
      // Reuse the cached default-config catalog the existence check built.
      for (const r of getDetektDefaultRules()) rules.add(r);
    } else if (linterName === "golangci-lint") {
      const output = execSync("golangci-lint help linters", {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      for (const name of golangciLinterNames(output)) rules.add(name);
    }
    // ktlint + checkstyle ship no rule-enumeration CLI — empty set, so the
    // caller simply emits no did-you-mean suggestions.
  } catch {
    // CLI failed — return empty set, caller will just skip suggestions
  }
  CLI_RULE_SET_CACHE.set(key, rules);
  return rules;
}

/** @internal */ function tryCliCheck(
  ctx: RuleContext,
): LinterCheckResult | null {
  const cliCheck = CLI_RULE_CHECKS[ctx.linterName];
  if (!cliCheck) return null;
  const tool = CLI_TOOL_FOR_LINTER[ctx.linterName];
  if (tool && !cliAvailable(tool)) {
    return makeResult(
      ctx,
      false,
      "unknown",
      `${ctx.linterName} CLI tool "${tool}" not found on PATH`,
    );
  }
  try {
    cliCheck(ctx.ruleName, ctx.basePath);
    const enabled = checkConfigEnabled(
      ctx.linterName,
      ctx.ruleName,
      ctx.basePath,
      ctx.catalogOnly,
    );
    return makeResult(ctx, true, enabled);
  } catch {
    // Rule not found — try to suggest closest matches from the full
    // rule set. Uses the same edit-distance helper as the Node
    // resolver path; caching means this runs the CLI at most once.
    const ruleSet = getCliRuleSet(ctx.linterName, ctx.basePath);
    const suggestions =
      ruleSet.size > 0 ? closestRuleNames(ctx.ruleName, ruleSet) : [];
    const hint =
      suggestions.length > 0
        ? ` Did you mean: ${suggestions.map((s) => `"${ctx.linterName}/${s}"`).join(", ")}?`
        : "";
    return makeResult(
      ctx,
      false,
      "unknown",
      `Rule "${ctx.ruleName}" not found in ${ctx.linterName}.${hint}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Vigiles-internal assertion catalog
//
// The `vigiles/<id>` namespace lets specs declare mechanical checks that
// vigiles itself runs (orphan docs, integrity, etc.) without delegating to
// an external linter. Existence is verified at compile time against this
// fixed catalog; the actual check runs at lint time.
// ---------------------------------------------------------------------------

const VIGILES_INTERNAL_RULES = new Set<string>(["orphan-docs"]);

/** @internal */ function tryVigilesInternal(
  ctx: RuleContext,
): LinterCheckResult | null {
  if (ctx.linterName !== "vigiles") return null;
  if (!VIGILES_INTERNAL_RULES.has(ctx.ruleName)) {
    const suggestions = closestRuleNames(ctx.ruleName, VIGILES_INTERNAL_RULES);
    const hint =
      suggestions.length > 0
        ? ` Did you mean: ${suggestions.map((s) => `"vigiles/${s}"`).join(", ")}?`
        : "";
    return makeResult(
      ctx,
      false,
      "unknown",
      `Vigiles-internal rule "${ctx.ruleName}" not in known catalog (${[...VIGILES_INTERNAL_RULES].join(", ")}).${hint}`,
    );
  }
  return makeResult(ctx, true, "enabled");
}

// ---------------------------------------------------------------------------
// Cedar policy resolution (filesystem-based — no Node API, no CLI required)
//
// Cedar policies live in .cedar files. A policy is identified by its
// `@id("name")` annotation when present; otherwise by filename. Presence
// of a policy in the project counts as "enabled" — Cedar has no separate
// config layer the way ESLint does, the policy bundle IS the config.
//
// Default search dirs: .cedar/ and cedar/ (project root). Override via
// `options.linters.cedar.rulesDir`.
// ---------------------------------------------------------------------------

const CEDAR_DEFAULT_DIRS = [".cedar", "cedar"] as const;
const CEDAR_ID_RE = /@id\("([^"]+)"\)/g;
const CEDAR_STATEMENT_RE = /\b(?:permit|forbid)\s*\(/;

const CEDAR_POLICY_CACHE = new Map<string, Set<string>>();

function cedarCacheKey(
  basePath: string,
  customDirs?: string | readonly string[],
): string {
  const dirs = customDirs
    ? Array.isArray(customDirs)
      ? customDirs.join("|")
      : (customDirs as string)
    : "";
  return `${basePath}::${dirs}`;
}

function loadCedarPolicies(
  basePath: string,
  customDirs?: string | readonly string[],
): Set<string> {
  const policies = new Set<string>();
  const dirs: readonly string[] = customDirs
    ? Array.isArray(customDirs)
      ? (customDirs as readonly string[])
      : [customDirs as string]
    : CEDAR_DEFAULT_DIRS;

  for (const dir of dirs) {
    const fullDir = resolve(basePath, dir);
    if (!existsSync(fullDir)) continue;
    const files = globSync("**/*.cedar", { cwd: fullDir, nodir: true });
    for (const file of files) {
      let content: string;
      try {
        content = readFileSync(resolve(fullDir, file), "utf-8");
      } catch {
        continue;
      }
      const annotated = [...content.matchAll(CEDAR_ID_RE)].map((m) => m[1]);
      if (annotated.length > 0) {
        for (const id of annotated) policies.add(id);
      } else if (CEDAR_STATEMENT_RE.test(content)) {
        const name = file.replace(/\.cedar$/, "").replace(/\\/g, "/");
        policies.add(name);
      }
    }
  }
  return policies;
}

function getCedarPolicies(
  basePath: string,
  customDirs?: string | readonly string[],
): Set<string> {
  const key = cedarCacheKey(basePath, customDirs);
  const cached = CEDAR_POLICY_CACHE.get(key);
  if (cached) return cached;
  const policies = loadCedarPolicies(basePath, customDirs);
  CEDAR_POLICY_CACHE.set(key, policies);
  return policies;
}

/** @internal */ export function clearCedarCache(): void {
  CEDAR_POLICY_CACHE.clear();
}

/** @internal */ function tryCedarPolicy(
  ctx: RuleContext,
): LinterCheckResult | null {
  if (ctx.linterName !== "cedar") return null;
  const customDirs = ctx.linters?.cedar?.rulesDir;
  const policies = getCedarPolicies(ctx.basePath, customDirs);
  if (policies.size === 0) {
    return makeResult(
      ctx,
      false,
      "unknown",
      customDirs
        ? `No Cedar policies found in configured rulesDir.`
        : `No Cedar policies found. Add .cedar files under .cedar/ or cedar/, or set linters.cedar.rulesDir.`,
    );
  }
  if (!policies.has(ctx.ruleName)) {
    const suggestions = closestRuleNames(ctx.ruleName, policies);
    const hint =
      suggestions.length > 0
        ? ` Did you mean: ${suggestions.map((s) => `"cedar/${s}"`).join(", ")}?`
        : "";
    return makeResult(
      ctx,
      false,
      "unknown",
      `Cedar policy "${ctx.ruleName}" not found.${hint}`,
    );
  }
  return makeResult(ctx, true, "enabled");
}

/** @internal */ function tryCustomRulesDir(
  ctx: RuleContext,
): LinterCheckResult | null {
  const linterCfg = ctx.linters?.[ctx.linterName];
  if (!linterCfg?.rulesDir) return null;
  const dirs = Array.isArray(linterCfg.rulesDir)
    ? linterCfg.rulesDir
    : [linterCfg.rulesDir];
  for (const dir of dirs) {
    const found = ruleFileExists(ctx.ruleName, dir, ctx.basePath);
    if (found) return makeResult(ctx, true);
  }
  return makeResult(
    ctx,
    false,
    "unknown",
    `Rule file for "${ctx.ruleName}" not found in ${ctx.linterName} rulesDir`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a single linter rule reference (e.g., "eslint/no-console").
 *
 * Verifies: (1) rule exists in linter, (2) rule is enabled in project config.
 * Returns a result with exists/enabled status.
 */
export function checkLinterRule(
  enforcedBy: string,
  basePath: string,
  options?: {
    catalogOnly?: boolean;
    linters?: Record<string, { rulesDir?: string | string[] }>;
  },
): LinterCheckResult {
  const linterName = extractLinterName(enforcedBy);
  const ruleName = extractRuleName(enforcedBy);

  if (!ruleName || !SAFE_RULE_NAME_RE.test(ruleName)) {
    return {
      exists: false,
      enabled: "unknown",
      linter: linterName,
      rule: ruleName ?? enforcedBy,
      error: `Invalid rule reference: "${enforcedBy}"`,
    };
  }

  const ctx: RuleContext = {
    linterName,
    ruleName,
    basePath,
    catalogOnly: options?.catalogOnly,
    linters: options?.linters,
  };

  return (
    tryVigilesInternal(ctx) ??
    tryNodeResolver(ctx) ??
    tryScopedPlugin(ctx) ??
    tryCliCheck(ctx) ??
    tryCedarPolicy(ctx) ??
    tryCustomRulesDir(ctx) ??
    makeResult(ctx, false, "unknown", `Unknown linter: "${linterName}"`)
  );
}

function checkConfigEnabled(
  linterName: string,
  ruleName: string,
  basePath: string,
  catalogOnly?: boolean,
): ConfigEnabledStatus {
  if (catalogOnly) return "unknown";
  const checker = LINTER_CONFIG_CHECKERS[linterName];
  if (!checker) return "unknown";
  try {
    return checker(ruleName, basePath);
  } catch {
    return "unknown";
  }
}
