/**
 * extract-existing — enumerate the lint rules a target repo ACTUALLY has
 * available and enabled, by resolving its real ESLint config.
 *
 * This is the "know the environment" step of the compiler's REUSE tier: before
 * synthesizing a checker for a prose rule, ask whether the repo already ships a
 * rule that enforces it (and whether it's on). If yes, the remedy is a one-line
 * config change (or nothing) — never synthesis.
 *
 * ⚠️ THIS EXECUTES THE TARGET'S ESLINT CONFIG. `eslint --print-config` loads and
 * runs `eslint.config.js` / resolves plugins — the RCE path. So this is an
 * OPT-IN / own-repo capability, NOT the foreign-safe deterministic surface. The
 * deterministic, exec-free counterpart (textual config grep, safe on any repo)
 * is vigiles's `src/rule-inventory.ts`. Keep the two separate on purpose:
 * inventory = safe-on-strangers teaser; extraction = precise-on-consent.
 *
 * We run the TARGET repo's OWN eslint (its node_modules/.bin/eslint) against a
 * representative file, so plugin resolution matches what the repo really uses —
 * not whatever eslint this package happens to bundle.
 */

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** Normalise an ESLint severity (0/1/2, "off"/"warn"/"error", or [sev, ...opts])
 * to "off" | "warn" | "error". */
function normalizeSeverity(entry) {
  const sev = Array.isArray(entry) ? entry[0] : entry;
  if (sev === 2 || sev === "error") return "error";
  if (sev === 1 || sev === "warn") return "warn";
  return "off";
}

/** Resolve the target repo's own eslint binary, or null if it isn't installed. */
function resolveEslintBin(repoRoot) {
  const bin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "eslint.cmd" : "eslint",
  );
  return fs.existsSync(bin) ? bin : null;
}

/** Pick a representative file for `--print-config` (config can be file-specific,
 * so we resolve against a real source file, not a guess). Prefers a TS/TSX file,
 * falls back to JS/JSX. Returns a repo-relative path or null. */
function pickSampleFile(repoRoot, preferred) {
  if (preferred) {
    const abs = path.resolve(repoRoot, preferred);
    if (fs.existsSync(abs)) return preferred;
  }
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
  ]);
  const exts = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
  const roots = ["src", "lib", "app", "packages", "."];
  const byExtRank = (f) => {
    const i = exts.indexOf(path.extname(f));
    return i < 0 ? exts.length : i;
  };
  let best = null;
  let bestRank = Infinity;
  const walk = (dir, depth) => {
    if (bestRank === 0) return; // already found the best-ranked extension
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!e.name.startsWith(".") && !skip.has(e.name) && depth < 3)
          walk(path.join(dir, e.name), depth + 1);
      } else if (
        e.isFile() &&
        exts.includes(path.extname(e.name)) &&
        // skip files eslint commonly ignores or that aren't representative
        // source (declarations, tests, config) — print-config errors on an
        // ignored file, and a test's config may differ from the real code's.
        !/\.d\.ts$/.test(e.name) &&
        !/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name) &&
        !/(^|\.)(eslint|prettier|vitest|jest|rollup|vite|webpack|babel)\./.test(
          e.name,
        )
      ) {
        const rank = byExtRank(e.name);
        if (rank < bestRank) {
          bestRank = rank;
          best = path.relative(repoRoot, path.join(dir, e.name));
          if (rank === 0) return;
        }
      }
    }
  };
  for (const r of roots) {
    const start = path.join(repoRoot, r);
    if (fs.existsSync(start)) walk(start, 0);
    if (bestRank === 0) break;
  }
  return best;
}

/** The eslint-plugin packages a repo declares (installed + therefore available),
 * read from package.json deps/devDeps. Not "enabled" — just present. */
function installedPlugins(repoRoot) {
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
  } catch {
    return [];
  }
  const all = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
  return Object.keys(all)
    .filter(
      (name) =>
        /(^|\/)eslint-plugin(-|$)/.test(name) ||
        name === "typescript-eslint" ||
        name === "@typescript-eslint/eslint-plugin" ||
        name === "@eslint/js",
    )
    .sort();
}

/**
 * Extract the enabled rules of a target repo.
 *
 * @param {string} repoRoot absolute path to the repo
 * @param {object} [opts]
 * @param {string} [opts.sampleFile] repo-relative file to resolve config for
 * @param {number} [opts.timeoutMs] hard cap on the eslint call (default 60s)
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   sampleFile?: string,
 *   enabledRules: Record<string, "error"|"warn">,
 *   offRules: string[],
 *   installedPlugins: string[],
 *   ruleCount: number
 * }}
 */
function extractExistingRules(repoRoot, opts = {}) {
  const plugins = installedPlugins(repoRoot);
  const bin = resolveEslintBin(repoRoot);
  if (!bin) {
    return {
      ok: false,
      reason: "no local eslint (node_modules/.bin/eslint) — run npm install",
      enabledRules: {},
      offRules: [],
      installedPlugins: plugins,
      ruleCount: 0,
    };
  }
  const sampleFile = pickSampleFile(repoRoot, opts.sampleFile);
  if (!sampleFile) {
    return {
      ok: false,
      reason: "no representative source file found to resolve config against",
      enabledRules: {},
      offRules: [],
      installedPlugins: plugins,
      ruleCount: 0,
    };
  }
  let raw;
  try {
    raw = execFileSync(bin, ["--print-config", sampleFile], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: opts.timeoutMs || 60_000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return {
      ok: false,
      reason: `eslint --print-config failed: ${(err && err.message ? err.message : String(err)).split("\n")[0]}`,
      sampleFile,
      enabledRules: {},
      offRules: [],
      installedPlugins: plugins,
      ruleCount: 0,
    };
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: "could not parse eslint --print-config JSON",
      sampleFile,
      enabledRules: {},
      offRules: [],
      installedPlugins: plugins,
      ruleCount: 0,
    };
  }
  const rules = config.rules || {};
  const enabledRules = {};
  const offRules = [];
  for (const [name, entry] of Object.entries(rules)) {
    const sev = normalizeSeverity(entry);
    if (sev === "off") offRules.push(name);
    else enabledRules[name] = sev;
  }
  return {
    ok: true,
    sampleFile,
    enabledRules,
    offRules: offRules.sort(),
    installedPlugins: plugins,
    ruleCount: Object.keys(enabledRules).length,
  };
}

/** ESLint re-exports some core rules under `@typescript-eslint/`; treat base and
 * scoped names as the same rule (mirrors src/rule-inventory.ts variantsOf). */
function ruleVariants(rule) {
  const TS = "@typescript-eslint/";
  if (rule.startsWith(TS)) return [rule, rule.slice(TS.length)];
  if (!rule.includes("/")) return [rule, TS + rule];
  return [rule];
}

/**
 * Is `rule` (or a base/scoped variant) enabled in the extracted result?
 * Returns "error" | "warn" | "off" | "absent".
 */
function ruleStatus(extract, rule) {
  const variants = ruleVariants(rule);
  for (const v of variants) {
    if (extract.enabledRules && extract.enabledRules[v])
      return extract.enabledRules[v];
  }
  if (extract.offRules && variants.some((v) => extract.offRules.includes(v)))
    return "off";
  return "absent";
}

module.exports = {
  extractExistingRules,
  ruleStatus,
  ruleVariants,
  normalizeSeverity,
  // exported for testing
  installedPlugins,
  pickSampleFile,
};

// CLI: node extract-existing.js <repoRoot> [sampleFile]
if (require.main === module) {
  const repoRoot = path.resolve(process.argv[2] || ".");
  const sampleFile = process.argv[3];
  const result = extractExistingRules(repoRoot, { sampleFile });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}
