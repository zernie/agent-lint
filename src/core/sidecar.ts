/**
 * Per-spec sidecar manifests stored at `.vigiles/<target>.inputs.json`.
 *
 * Used by the post-session audit to know which targets exist and which
 * spec source / inputs each one tracks. The compile pipeline writes
 * these whenever a spec is built; readers (currently only session.ts)
 * consume them at verification time.
 *
 * This module is the ONLY place sidecars live now — the freshness rule
 * doesn't depend on them anymore.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { entryOf } from "../fs-walk.js";
import { sha256short } from "./hash.js";

const SIDECAR_ROOT = ".vigiles";
const MANIFEST_SUFFIX = ".inputs.json";

export interface SidecarManifest {
  /** The spec source file (relative to basePath). */
  specFile: string;
  /** The compilation target (e.g., "CLAUDE.md"). */
  target: string;
  /** ISO 8601 timestamp of last compilation. */
  compiledAt: string;
  /** Per-file SHA-256 hashes (truncated, 16 hex chars). */
  files: Record<string, string>;
}

export function sidecarPath(basePath: string, target: string): string {
  return resolve(basePath, SIDECAR_ROOT, `${target}${MANIFEST_SUFFIX}`);
}

export function writeSidecarManifest(
  basePath: string,
  manifest: SidecarManifest,
): void {
  // Targets can be nested (e.g. ".github/copilot-instructions.md"), so
  // ensure every intermediate directory under .vigiles/ exists before
  // writing — otherwise writeFileSync throws ENOENT.
  const filePath = sidecarPath(basePath, manifest.target);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + "\n");
}

export function readSidecarManifest(
  basePath: string,
  target: string,
): SidecarManifest | null {
  const filePath = sidecarPath(basePath, target);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as SidecarManifest;
  } catch {
    return null;
  }
}

export function computePerFileHashes(
  inputFiles: string[],
  basePath: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const f of inputFiles) {
    const fullPath = resolve(basePath, f);
    result[f] = existsSync(fullPath)
      ? sha256short(readFileSync(fullPath))
      : "MISSING";
  }
  return result;
}

/**
 * Iterate all sidecar manifests under `.vigiles/`, including nested
 * directories. Handles directory-not-found and read errors gracefully.
 *
 * Recurses so that nested targets (e.g. `.github/copilot-instructions.md`,
 * which lives at `.vigiles/.github/copilot-instructions.md.inputs.json`)
 * are not silently skipped.
 *
 * 🔴 A DIRECTORY SYMLINK IS NOT DESCENDED INTO — this walk classified entries
 * with a bare `statSync().isDirectory()`, which FOLLOWS a link, so a link inside
 * `.vigiles/` pointing at a directory OUTSIDE it was walked (manifests from a
 * foreign tree entering the audit under reconstructed target names), and a cycle
 * — `.vigiles/loop -> .vigiles`, or a link to any ancestor — re-walked the same
 * tree once per lap. Measured 2026-08-13 by reverting this call: ONE manifest was
 * reported FORTY-ONE times, as `Real.md`, `loop/Real.md`, `loop/loop/Real.md` …
 * until the kernel's link limit stopped it. Unlike the loader's walk it did not
 * throw, and that is not a mitigation: the `catch` below swallowed the `ELOOP` and
 * turned a crash into a silently multiplied audit. Third instance of the class in
 * this repo; the decision is {@link entryOf} in `fs-walk.ts`, which carries the
 * full rationale: a symlinked FILE is still read (it cannot recurse, and a
 * manifest reached through one is a real manifest), termination is by
 * construction rather than a visited-set, and an unreadable entry is `"skip"`
 * rather than a throw — which is exactly what the `try`/`continue` here did.
 */
export function iterateSidecars(
  basePath: string,
  fn: (target: string, manifest: SidecarManifest) => void,
): void {
  const root = resolve(basePath, SIDECAR_ROOT);
  if (!existsSync(root)) return;
  walk(root, root, basePath, fn);
}

function walk(
  dir: string,
  root: string,
  basePath: string,
  fn: (target: string, manifest: SidecarManifest) => void,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const { kind } = entryOf(fullPath);

    if (kind === "dir") {
      walk(fullPath, root, basePath, fn);
      continue;
    }
    // "skip" covers what the old bare `statSync` handled by throwing (a dangling
    // link, an unreadable entry) AND the symlinked directory it silently followed.
    if (kind === "skip") continue;
    if (!entry.endsWith(MANIFEST_SUFFIX)) continue;

    // Reconstruct the target name from the path relative to .vigiles/
    const rel = relative(root, fullPath);
    const target = rel.slice(0, -MANIFEST_SUFFIX.length);
    const manifest = readSidecarManifest(basePath, target);
    if (!manifest) continue;
    fn(target, manifest);
  }
}
