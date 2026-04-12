/**
 * Freshness detection for compiled instruction files.
 *
 * Three modes:
 * - "strict": recompile in memory, diff against existing output (zero false positives)
 * - "input-hash": hash tracked input files, compare to stored fingerprint (fast)
 * - "output-hash": existing behavior — only detects hand-edits to compiled .md
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FreshnessMode } from "./types.js";
import type { ClaudeSpec } from "./spec.js";

// ---------------------------------------------------------------------------
// Lock file detection
// ---------------------------------------------------------------------------

/** Known lock files, ordered by ecosystem then preference. */
const KNOWN_LOCK_FILES: readonly string[] = [
  // Node.js
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  // Ruby
  "Gemfile.lock",
  // Python
  "poetry.lock",
  "uv.lock",
  "pdm.lock",
  "requirements.txt",
  // Rust
  "Cargo.lock",
  // Go
  "go.sum",
  // PHP
  "composer.lock",
  // .NET
  "packages.lock.json",
  // Swift
  "Package.resolved",
  // Elixir
  "mix.lock",
];

/** Known linter configuration files. */
const KNOWN_LINTER_CONFIGS: readonly string[] = [
  // ESLint
  "eslint.config.mjs",
  "eslint.config.js",
  "eslint.config.ts",
  "eslint.config.cjs",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  ".eslintrc.cjs",
  // Stylelint
  ".stylelintrc.json",
  ".stylelintrc.js",
  ".stylelintrc.yml",
  ".stylelintrc.yaml",
  "stylelint.config.js",
  "stylelint.config.cjs",
  "stylelint.config.mjs",
  // Python
  "pyproject.toml",
  "ruff.toml",
  ".pylintrc",
  "setup.cfg",
  // Rust
  "Cargo.toml",
  "clippy.toml",
  ".clippy.toml",
  // Ruby
  ".rubocop.yml",
  ".rubocop.yaml",
];

/**
 * Detect lock files present at `basePath`.
 * Returns all found (a project may have multiple ecosystems).
 */
export function detectLockFiles(basePath: string): string[] {
  return KNOWN_LOCK_FILES.filter((f) => existsSync(resolve(basePath, f)));
}

/**
 * Detect linter config files present at `basePath`.
 */
export function detectLinterConfigs(basePath: string): string[] {
  return KNOWN_LINTER_CONFIGS.filter((f) => existsSync(resolve(basePath, f)));
}

// ---------------------------------------------------------------------------
// Input discovery
// ---------------------------------------------------------------------------

export interface DiscoveredInputs {
  /** All input file paths (relative to basePath), sorted. */
  files: string[];
  /** Which lock files were detected. */
  lockFiles: string[];
  /** Which linter configs were detected. */
  linterConfigs: string[];
}

/**
 * Discover all input files that affect a compiled spec's output.
 *
 * Categories:
 * 1. Spec source file
 * 2. Linter configuration files
 * 3. Package manifest (package.json)
 * 4. Lock files (per-ecosystem)
 * 5. Referenced files from keyFiles
 * 6. Generated types (.vigiles/generated.d.ts)
 * 7. Extra files from freshnessInputs config
 */
export function discoverInputs(
  specFile: string,
  spec: ClaudeSpec,
  basePath: string,
  extraInputs?: string[],
): DiscoveredInputs {
  const files = new Set<string>();

  // 1. Spec source
  files.add(specFile);

  // 2. Linter configs
  const linterConfigs = detectLinterConfigs(basePath);
  for (const cfg of linterConfigs) files.add(cfg);

  // 3. Package manifest
  if (existsSync(resolve(basePath, "package.json"))) {
    files.add("package.json");
  }

  // 4. Lock files
  const lockFiles = detectLockFiles(basePath);
  for (const lf of lockFiles) files.add(lf);

  // 5. Referenced files from keyFiles
  if (spec.keyFiles) {
    for (const filePath of Object.keys(spec.keyFiles)) {
      files.add(filePath);
    }
  }

  // 6. Generated types
  if (existsSync(resolve(basePath, ".vigiles/generated.d.ts"))) {
    files.add(".vigiles/generated.d.ts");
  }

  // 7. Extra configured inputs
  if (extraInputs) {
    for (const f of extraInputs) files.add(f);
  }

  const sorted = [...files].sort();
  return { files: sorted, lockFiles, linterConfigs };
}

// ---------------------------------------------------------------------------
// Input hash computation
// ---------------------------------------------------------------------------

const INPUT_HASH_RE = /^<!-- vigiles:inputs:([a-f0-9]+) -->\r?\n?/m;

/**
 * Compute a combined SHA-256 fingerprint of all input files.
 * Missing files hash to "MISSING:<path>" so deletion changes the hash.
 */
export function computeInputHash(
  inputFiles: string[],
  basePath: string,
): string {
  const fileHashes = inputFiles.map((f) => {
    const fullPath = resolve(basePath, f);
    if (!existsSync(fullPath)) return `MISSING:${f}`;
    const content = readFileSync(fullPath);
    return createHash("sha256").update(content).digest("hex");
  });
  return createHash("sha256")
    .update(fileHashes.join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** Embed input hash as an HTML comment in compiled markdown. */
export function addInputHash(markdown: string, inputHash: string): string {
  // Insert after the existing vigiles:sha256 comment (first line)
  const lines = markdown.split("\n");
  if (lines[0].startsWith("<!-- vigiles:sha256:")) {
    lines.splice(1, 0, `<!-- vigiles:inputs:${inputHash} -->`);
    return lines.join("\n");
  }
  // Fallback: prepend
  return `<!-- vigiles:inputs:${inputHash} -->\n${markdown}`;
}

/** Extract stored input hash from compiled markdown. */
export function extractInputHash(content: string): string | null {
  const match = content.match(INPUT_HASH_RE);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Freshness check result
// ---------------------------------------------------------------------------

export interface FreshnessResult {
  fresh: boolean;
  mode: FreshnessMode;
  reason?: string;
  /** Files that changed (input-hash mode only). */
  changedFiles?: string[];
}

/**
 * Check freshness of a compiled file using output-hash mode.
 * Only detects hand-edits to the compiled markdown.
 */
export function checkOutputHashFreshness(content: string): FreshnessResult {
  // Re-use existing hash verification
  const hashLine = content.match(
    /^<!-- vigiles:sha256:([a-f0-9]+) compiled from (.+) -->/,
  );
  if (!hashLine) {
    return {
      fresh: true,
      mode: "output-hash",
      reason: "No hash found (hand-written file)",
    };
  }
  const expectedHash = hashLine[1];
  const body = content
    .replace(
      /^<!-- vigiles:sha256:[a-f0-9]+ compiled from .+ -->\r?\n\r?\n?/,
      "",
    )
    .replace(INPUT_HASH_RE, "");
  const actualHash = createHash("sha256")
    .update(body)
    .digest("hex")
    .slice(0, 16);
  if (actualHash !== expectedHash) {
    return {
      fresh: false,
      mode: "output-hash",
      reason: "Compiled file was manually edited (hash mismatch)",
    };
  }
  return { fresh: true, mode: "output-hash" };
}

/**
 * Check freshness using input-hash mode.
 * Compares stored input fingerprint against current file state.
 */
export function checkInputHashFreshness(
  content: string,
  inputFiles: string[],
  basePath: string,
): FreshnessResult {
  const storedHash = extractInputHash(content);
  if (!storedHash) {
    return {
      fresh: false,
      mode: "input-hash",
      reason: "No input hash found — run `vigiles compile` to generate one",
    };
  }

  const currentHash = computeInputHash(inputFiles, basePath);
  if (storedHash !== currentHash) {
    // Report missing files (we can't identify other changes without
    // storing per-file hashes, but missing files are obvious)
    const changedFiles: string[] = [];
    for (const f of inputFiles) {
      if (!existsSync(resolve(basePath, f))) {
        changedFiles.push(`${f} (deleted)`);
      }
    }

    return {
      fresh: false,
      mode: "input-hash",
      reason: "Inputs changed since last compile — run `vigiles compile`",
      changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    };
  }

  return { fresh: true, mode: "input-hash" };
}
