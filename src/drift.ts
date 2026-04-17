/**
 * Drift integration: detect when code anchored by specs has changed.
 *
 * Drift (github.com/fiberplane/drift) anchors markdown to source code via
 * tree-sitter AST fingerprinting. When anchored code changes, drift check
 * catches it.
 *
 * vigiles integrates drift as a rule in .vigilesrc.json. When enabled,
 * `vigiles audit` runs `drift check` and reports results. If drift anchors
 * exist in compiled output but drift isn't installed, audit errors with
 * install instructions.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftResult {
  /** Whether the check passed (no drifted anchors). */
  ok: boolean;
  /** Whether drift anchors were found in any compiled output. */
  hasAnchors: boolean;
  /** Whether the drift binary is installed. */
  installed: boolean;
  /** Number of anchors that have drifted. */
  drifted: number;
  /** Total anchors checked. */
  total: number;
  /** Human-readable message. */
  message: string;
  /** Raw drift check output (if available). */
  output?: string;
}

// ---------------------------------------------------------------------------
// Drift binary detection
// ---------------------------------------------------------------------------

/**
 * Check if the drift binary is available on PATH.
 */
export function isDriftInstalled(): boolean {
  try {
    execSync("drift --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Anchor detection
// ---------------------------------------------------------------------------

/**
 * Check if any compiled instruction files contain drift anchors.
 * Drift anchors appear as YAML frontmatter with a `drift:` key.
 */
export function hasDriftAnchors(basePath: string): boolean {
  // Check via sidecar manifests first
  const dir = resolve(basePath, ".vigiles");
  if (existsSync(dir)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.endsWith(".inputs.json")) continue;
      const target = entry.replace(".inputs.json", "");
      const targetPath = resolve(basePath, target);
      if (!existsSync(targetPath)) continue;

      try {
        const content = readFileSync(targetPath, "utf-8");
        if (/^---\s*\n[\s\S]*?drift:/m.test(content)) {
          return true;
        }
      } catch {
        // skip
      }
    }
  }

  // Fallback: check compiled files directly (without sidecar manifests)
  const mdFiles = ["CLAUDE.md", "AGENTS.md"];
  for (const md of mdFiles) {
    const mdPath = resolve(basePath, md);
    if (!existsSync(mdPath)) continue;
    try {
      const content = readFileSync(mdPath, "utf-8");
      if (/^---\s*\n[\s\S]*?drift:/m.test(content)) {
        return true;
      }
    } catch {
      // skip
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Drift check
// ---------------------------------------------------------------------------

/**
 * Run drift check and return structured results.
 *
 * Behavior:
 * - No drift anchors in any compiled output → skip (ok, nothing to check)
 * - Drift anchors exist, drift not installed → error with install instructions
 * - Drift anchors exist, drift installed → run `drift check`, parse output
 */
export function checkDrift(basePath: string): DriftResult {
  const anchors = hasDriftAnchors(basePath);

  if (!anchors) {
    return {
      ok: true,
      hasAnchors: false,
      installed: false,
      drifted: 0,
      total: 0,
      message: "No drift anchors found — skipping",
    };
  }

  const installed = isDriftInstalled();
  if (!installed) {
    return {
      ok: false,
      hasAnchors: true,
      installed: false,
      drifted: 0,
      total: 0,
      message:
        "Drift anchors found but drift is not installed.\n" +
        "  Install: brew install fiberplane/tap/drift\n" +
        "  Or: curl -fsSL https://drift.fp.dev/install.sh | sh\n" +
        "  Docs: https://github.com/fiberplane/drift",
    };
  }

  // Run drift check
  try {
    const output = execSync("drift check", {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      ok: true,
      hasAnchors: true,
      installed: true,
      drifted: 0,
      total: countAnchorsInOutput(output),
      message: "All drift anchors are fresh",
      output,
    };
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : "";
    const stdout =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: unknown }).stdout)
        : "";
    const combined = stdout + stderr;

    const drifted = countDriftedInOutput(combined);

    return {
      ok: false,
      hasAnchors: true,
      installed: true,
      drifted,
      total: drifted,
      message: `${String(drifted || "Some")} anchor(s) have drifted — review and run drift link`,
      output: combined,
    };
  }
}

function countAnchorsInOutput(output: string): number {
  const matches = output.match(/✓/g);
  return matches?.length ?? 0;
}

function countDriftedInOutput(output: string): number {
  const matches = output.match(/✗|drifted|changed/gi);
  return matches?.length ?? 0;
}
