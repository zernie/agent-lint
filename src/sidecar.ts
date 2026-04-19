/**
 * Per-spec sidecar manifests stored at `.vigiles/<target>.inputs.json`.
 *
 * Used by the post-session audit to know which targets exist and which
 * spec source / inputs each one tracks. The compile pipeline writes
 * these whenever a spec is built; readers (currently only session.ts)
 * consume them at audit time.
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
import { resolve } from "node:path";

import { sha256short } from "./hash.js";

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
  return resolve(basePath, ".vigiles", `${target}.inputs.json`);
}

export function writeSidecarManifest(
  basePath: string,
  manifest: SidecarManifest,
): void {
  const dir = resolve(basePath, ".vigiles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    sidecarPath(basePath, manifest.target),
    JSON.stringify(manifest, null, 2) + "\n",
  );
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
 * Iterate all sidecar manifests in `.vigiles/` and call `fn` for each.
 * Handles directory-not-found and read errors gracefully.
 */
export function iterateSidecars(
  basePath: string,
  fn: (target: string, manifest: SidecarManifest) => void,
): void {
  const dir = resolve(basePath, ".vigiles");
  if (!existsSync(dir)) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".inputs.json")) continue;
    const target = entry.replace(".inputs.json", "");
    const manifest = readSidecarManifest(basePath, target);
    if (!manifest) continue;
    fn(target, manifest);
  }
}
