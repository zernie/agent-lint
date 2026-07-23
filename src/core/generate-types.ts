/**
 * vigiles generate-types — emit .d.ts with type unions from actual project state.
 *
 * Scans linter configs, package.json, and filesystem to generate TypeScript
 * types that the compiler uses to PROVE references are valid at authoring time.
 *
 * Generated types:
 *   - EslintRule / StylelintRule / RuffRule / ... — enabled rules per linter
 *   - NpmScript — scripts from package.json
 *   - ProjectFile — files in the project (scoped to src/ by default)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { globSync } from "glob";
import {
  checkstyleEnabledStatus,
  parseDetektConfig,
  readDetektConfig,
} from "./linters.js";

// ---------------------------------------------------------------------------
// Linter config detection
// ---------------------------------------------------------------------------

function fileContainsSection(filePath: string, section: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    return readFileSync(filePath, "utf-8").includes(section);
  } catch {
    return false;
  }
}

function hasRuffConfig(basePath: string): boolean {
  return (
    existsSync(resolve(basePath, "ruff.toml")) ||
    existsSync(resolve(basePath, ".ruff.toml")) ||
    fileContainsSection(resolve(basePath, "pyproject.toml"), "[tool.ruff")
  );
}

function hasPylintConfig(basePath: string): boolean {
  return (
    existsSync(resolve(basePath, ".pylintrc")) ||
    existsSync(resolve(basePath, "pylintrc")) ||
    fileContainsSection(resolve(basePath, "pyproject.toml"), "[tool.pylint") ||
    fileContainsSection(resolve(basePath, "setup.cfg"), "[pylint")
  );
}

function hasRubocopConfig(basePath: string): boolean {
  return existsSync(resolve(basePath, ".rubocop.yml"));
}

function firstExisting(basePath: string, paths: string[]): string | null {
  for (const rel of paths) {
    const p = resolve(basePath, rel);
    if (existsSync(p)) return p;
  }
  return null;
}


function checkstyleConfigPath(basePath: string): string | null {
  return firstExisting(basePath, [
    "checkstyle.xml",
    "config/checkstyle/checkstyle.xml",
    "google_checks.xml",
    "sun_checks.xml",
  ]);
}

function hasGolangciConfig(basePath: string): boolean {
  return (
    firstExisting(basePath, [
      ".golangci.yml",
      ".golangci.yaml",
      ".golangci.toml",
      ".golangci.json",
    ]) !== null
  );
}

// ---------------------------------------------------------------------------
// Linter rule discovery
// ---------------------------------------------------------------------------

interface DiscoveredRules {
  linter: string;
  rules: string[];
  via: string;
}

function discoverEslintRules(basePath: string): DiscoveredRules | null {
  try {
    const script = `
      const { loadESLint } = require("eslint");
      (async () => {
        try {
          const ESLint = await loadESLint();
          const eslint = new ESLint({ cwd: ${JSON.stringify(basePath)} });
          const config = await eslint.calculateConfigForFile("dummy.js");
          const enabled = Object.entries(config.rules || {})
            .filter(([, v]) => {
              const sev = Array.isArray(v) ? v[0] : v;
              return sev !== 0 && sev !== "off";
            })
            .map(([k]) => k);
          console.log(JSON.stringify(enabled));
        } catch(e) {
          console.log("[]");
        }
      })();
    `;
    const output = execSync(`node -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      cwd: basePath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    const rules = JSON.parse(output.trim() || "[]") as string[];
    if (rules.length === 0) return null;
    return { linter: "eslint", rules, via: "flat config (v9+/v10)" };
  } catch {
    return null;
  }
}

function discoverStylelintRules(basePath: string): DiscoveredRules | null {
  try {
    const script = `
      const stylelint = require("stylelint");
      (async () => {
        try {
          const linter = stylelint.createLinter({});
          const result = await linter.getConfigForFile(${JSON.stringify(resolve(basePath, "dummy.css"))});
          const enabled = Object.entries(result.config.rules || {})
            .filter(([, v]) => v !== null && !(Array.isArray(v) && v[0] === null))
            .map(([k]) => k);
          console.log(JSON.stringify(enabled));
        } catch(e) {
          console.log("[]");
        }
      })();
    `;
    const output = execSync(`node -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      cwd: basePath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    const rules = JSON.parse(output.trim() || "[]") as string[];
    if (rules.length === 0) return null;
    return { linter: "stylelint", rules, via: "config" };
  } catch {
    return null;
  }
}

function discoverRuffRules(basePath: string): DiscoveredRules | null {
  try {
    if (!hasRuffConfig(basePath)) return null;
    execSync("which ruff", { stdio: "ignore" });
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
    const rules: string[] = [];
    if (enabledMatch?.[1]) {
      const codeRe = /\(([A-Z]+\d*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = codeRe.exec(enabledMatch[1])) !== null) {
        rules.push(m[1]);
      }
    }
    if (rules.length === 0) return null;
    return { linter: "ruff", rules, via: "CLI" };
  } catch {
    return null;
  }
}

function discoverPylintRules(basePath: string): DiscoveredRules | null {
  try {
    if (!hasPylintConfig(basePath)) return null;
    execSync("which pylint", { stdio: "ignore" });
    const output = execSync("pylint --list-msgs-enabled", {
      encoding: "utf-8",
      cwd: basePath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    const disabledIdx = output.indexOf("Disabled messages:");
    const enabledSection =
      disabledIdx >= 0 ? output.substring(0, disabledIdx) : output;
    // Extract rule IDs like (C0114), (W0611) etc.
    const rules: string[] = [];
    const idRe = /\(([A-Z]\d{4})\)/g;
    let m: RegExpExecArray | null;
    while ((m = idRe.exec(enabledSection)) !== null) {
      rules.push(m[1]);
    }
    // Also extract symbolic names like "missing-module-docstring"
    const nameRe = /^(\w[\w-]+)\s*\(/gm;
    while ((m = nameRe.exec(enabledSection)) !== null) {
      rules.push(m[1]);
    }
    if (rules.length === 0) return null;
    return { linter: "pylint", rules, via: "CLI" };
  } catch {
    return null;
  }
}

function discoverRubocopRules(basePath: string): DiscoveredRules | null {
  try {
    if (!hasRubocopConfig(basePath)) return null;
    execSync("which rubocop", { stdio: "ignore" });
    const output = execSync(
      "rubocop --list-target-files --show-cops 2>/dev/null | head -500",
      {
        encoding: "utf-8",
        cwd: basePath,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
        shell: "/bin/sh",
      },
    );
    const rules: string[] = [];
    const copRe = /^(\w+\/\w+):/gm;
    let m: RegExpExecArray | null;
    while ((m = copRe.exec(output)) !== null) {
      rules.push(m[1]);
    }
    if (rules.length === 0) return null;
    return { linter: "rubocop", rules, via: "CLI" };
  } catch {
    return null;
  }
}

function discoverCedarPolicies(basePath: string): DiscoveredRules | null {
  const ID_RE = /@id\("([^"]+)"\)/g;
  const STATEMENT_RE = /\b(?:permit|forbid)\s*\(/;
  const policies = new Set<string>();
  for (const dir of [".cedar", "cedar"]) {
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
      const annotated = [...content.matchAll(ID_RE)].map((m) => m[1]);
      if (annotated.length > 0) {
        for (const id of annotated) policies.add(id);
      } else if (STATEMENT_RE.test(content)) {
        policies.add(file.replace(/\.cedar$/, "").replace(/\\/g, "/"));
      }
    }
  }
  if (policies.size === 0) return null;
  return {
    linter: "cedar",
    rules: [...policies].sort(),
    via: ".cedar files",
  };
}

function discoverClippyRules(basePath: string): DiscoveredRules | null {
  try {
    const cargoPath = resolve(basePath, "Cargo.toml");
    if (!existsSync(cargoPath)) return null;
    execSync("which cargo", { stdio: "ignore" });
    // Clippy doesn't have a good "list enabled lints" command.
    // We read Cargo.toml [lints.clippy] section for explicit config,
    // and include default warn/deny lints from clippy -W clippy::all
    const content = readFileSync(cargoPath, "utf-8");
    const sectionMatch = content.match(/\[lints\.clippy\]([\s\S]*?)(?=\n\[|$)/);
    const rules: string[] = [];
    if (sectionMatch?.[1]) {
      const ruleRe = /^(\w[\w-]+)\s*=\s*"(\w+)"/gm;
      let m: RegExpExecArray | null;
      while ((m = ruleRe.exec(sectionMatch[1])) !== null) {
        if (m[2] !== "allow") {
          rules.push(m[1]);
        }
      }
    }
    if (rules.length === 0) return null;
    return { linter: "clippy", rules, via: "Cargo.toml" };
  } catch {
    return null;
  }
}

function discoverDetektRules(basePath: string): DiscoveredRules | null {
  // Reuse the shared detekt-config parser (one-parser-no-drift): a rule is
  // excluded when its own `active: false` OR its enclosing ruleset's
  // `active: false` disables it — so a spec can't type-check against a rule
  // detekt won't run.
  const cfg = readDetektConfig(basePath);
  if (cfg === null) return null;
  const rules = [...parseDetektConfig(cfg)]
    .filter(([, state]) => state.active !== "disabled")
    .map(([name]) => name);
  if (rules.length === 0) return null;
  return { linter: "detekt", rules, via: "detekt config" };
}

function discoverKtlintRules(basePath: string): DiscoveredRules | null {
  // ktlint has no rule-enumeration CLI; the per-rule `.editorconfig`
  // properties (`ktlint_<ruleset>_<rule-id> = enabled|disabled`) are the only
  // enumerable surface, so only explicitly-configured rules are discovered.
  const p = resolve(basePath, ".editorconfig");
  if (!existsSync(p)) return null;
  try {
    const content = readFileSync(p, "utf-8");
    const rules: string[] = [];
    const re =
      /^\s*ktlint_([a-z0-9-]+)_([a-z0-9-]+)\s*=\s*(enabled|disabled)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[3] === "enabled") rules.push(`${m[1]}:${m[2]}`);
    }
    if (rules.length === 0) return null;
    return { linter: "ktlint", rules, via: ".editorconfig" };
  } catch {
    return null;
  }
}

function discoverCheckstyleRules(basePath: string): DiscoveredRules | null {
  // A checkstyle config is a whitelist of <module name="..."> elements — the
  // module names (minus the Checker/TreeWalker containers) ARE the enabled
  // rule set.
  const configPath = checkstyleConfigPath(basePath);
  if (!configPath) return null;
  try {
    const content = readFileSync(configPath, "utf-8");
    const rules = new Set<string>();
    const re = /<module\s+name\s*=\s*["']([A-Za-z0-9.]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1] === "Checker" || m[1] === "TreeWalker") continue;
      // A module with `severity="ignore"` is DISABLED — leave it out of the type
      // union, or a spec could type-check against a rule CI won't enforce,
      // defeating the generated-types proof. Reuse the lint enabled-status logic
      // (one detector, no drift — Codex review).
      if (checkstyleEnabledStatus(m[1], basePath) === "disabled") continue;
      rules.add(m[1]);
    }
    if (rules.size === 0) return null;
    return {
      linter: "checkstyle",
      rules: [...rules].sort(),
      via: "checkstyle config",
    };
  } catch {
    return null;
  }
}

function discoverGolangciLintRules(basePath: string): DiscoveredRules | null {
  try {
    if (!hasGolangciConfig(basePath)) return null;
    execSync("which golangci-lint", { stdio: "ignore" });
    const output = execSync("golangci-lint linters", {
      encoding: "utf-8",
      cwd: basePath,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    const disabledIdx = output.search(/^Disabled by/m);
    const enabledSection =
      disabledIdx >= 0 ? output.substring(0, disabledIdx) : output;
    const rules: string[] = [];
    const re = /^([a-z][a-z0-9_-]+)(?:\s*\([^)]*\))?:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(enabledSection)) !== null) {
      rules.push(m[1]);
    }
    if (rules.length === 0) return null;
    return { linter: "golangci-lint", rules, via: "CLI" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NPM script discovery
// ---------------------------------------------------------------------------

function discoverNpmScripts(basePath: string): string[] {
  const pkgPath = resolve(basePath, "package.json");
  if (!existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    return Object.keys(pkg.scripts ?? {});
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Project file discovery
// ---------------------------------------------------------------------------

function discoverProjectFiles(
  basePath: string,
  globs: string[] = ["src/**/*"],
): string[] {
  const files: string[] = [];
  for (const pattern of globs) {
    const matches = globSync(pattern, {
      cwd: basePath,
      ignore: ["node_modules/**", "dist/**", ".git/**"],
      nodir: true,
    });
    files.push(...matches);
  }
  return [...new Set(files)].sort();
}

// ---------------------------------------------------------------------------
// Type generation
// ---------------------------------------------------------------------------

function escapeForUnion(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatUnion(items: string[], indent: string = "  "): string {
  if (items.length === 0) return "never";
  if (items.length <= 3) {
    return items.map((i) => `"${escapeForUnion(i)}"`).join(" | ");
  }
  return (
    "\n" + items.map((i) => `${indent}| "${escapeForUnion(i)}"`).join("\n")
  );
}

export interface GenerateTypesOptions {
  basePath?: string;
  fileGlobs?: string[];
}

export interface GenerateTypesResult {
  dts: string;
  linters: DiscoveredRules[];
  scripts: string[];
  files: string[];
}

/**
 * Generate .d.ts content with type unions from actual project state.
 *
 * Scans all available linters, package.json scripts, and project files.
 */
export function generateTypes(
  options: GenerateTypesOptions = {},
): GenerateTypesResult {
  const basePath = options.basePath ?? process.cwd();
  const fileGlobs = options.fileGlobs ?? ["src/**/*"];

  // Discover everything
  const discoverers = [
    discoverEslintRules,
    discoverStylelintRules,
    discoverRuffRules,
    discoverPylintRules,
    discoverRubocopRules,
    discoverClippyRules,
    discoverDetektRules,
    discoverKtlintRules,
    discoverCheckstyleRules,
    discoverGolangciLintRules,
    discoverCedarPolicies,
  ];
  const linters: DiscoveredRules[] = [];
  for (const discover of discoverers) {
    const found = discover(basePath);
    if (found) linters.push(found);
  }

  const scripts = discoverNpmScripts(basePath);
  const files = discoverProjectFiles(basePath, fileGlobs);

  // Generate .d.ts
  const sections: string[] = [];

  sections.push(`/**`);
  sections.push(` * Auto-generated by \`vigiles generate-types\`.`);
  sections.push(
    ` * DO NOT EDIT — re-run \`vigiles generate-types\` to update.`,
  );
  sections.push(` */`);
  sections.push(``);
  // ---------------------------------------------------------------------------
  // vigiles/generated — standalone types for direct import
  // ---------------------------------------------------------------------------

  sections.push(`declare module "vigiles/generated" {`);

  // Linter rules
  for (const { linter, rules, via } of linters) {
    const typeName =
      linter.charAt(0).toUpperCase() +
      linter.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) +
      "Rule";
    sections.push(``);
    sections.push(
      `  /** ${String(rules.length)} enabled ${linter} rules (via ${via}). */`,
    );
    sections.push(`  export type ${typeName} = ${formatUnion(rules, "    ")};`);
  }

  // Combined linter rule type
  if (linters.length > 0) {
    const allNames = linters.map(
      (l) =>
        l.linter.charAt(0).toUpperCase() +
        l.linter
          .slice(1)
          .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) +
        "Rule",
    );
    sections.push(``);
    sections.push(
      `  /** All enabled linter rules across all detected linters. */`,
    );
    sections.push(`  export type LinterRule = ${allNames.join(" | ")};`);
  }

  // NPM scripts
  if (scripts.length > 0) {
    sections.push(``);
    sections.push(
      `  /** ${String(scripts.length)} npm scripts from package.json. */`,
    );
    sections.push(`  export type NpmScript = ${formatUnion(scripts, "    ")};`);
  }

  // Project files
  if (files.length > 0) {
    sections.push(``);
    sections.push(`  /** ${String(files.length)} project files. */`);
    sections.push(`  export type ProjectFile = ${formatUnion(files, "    ")};`);
  }

  sections.push(`}`);

  // ---------------------------------------------------------------------------
  // vigiles/spec augmentation — populates KnownLinterRules, KnownProjectFiles,
  // KnownNpmScripts interfaces so enforce(), file(), cmd() narrow automatically.
  // ---------------------------------------------------------------------------

  sections.push(``);
  sections.push(`declare module "vigiles/spec" {`);

  if (linters.length > 0) {
    sections.push(`  interface KnownLinterRules {`);
    for (const { linter, rules } of linters) {
      sections.push(
        `    "${escapeForUnion(linter)}": ${formatUnion(rules, "      ")};`,
      );
    }
    sections.push(`  }`);
  }

  if (files.length > 0) {
    sections.push(`  interface KnownProjectFiles {`);
    sections.push(`    files: ${formatUnion(files, "      ")};`);
    sections.push(`  }`);
  }

  if (scripts.length > 0) {
    sections.push(`  interface KnownNpmScripts {`);
    sections.push(`    scripts: ${formatUnion(scripts, "      ")};`);
    sections.push(`  }`);
  }

  sections.push(`}`);
  sections.push(``);

  return {
    dts: sections.join("\n"),
    linters,
    scripts,
    files,
  };
}
