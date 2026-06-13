/**
 * Sync-tool compatibility detector — keep vigiles composable with the rule-sync
 * tools (Ruler, rulesync) instead of fighting them for the same files.
 *
 * Both vigiles and a sync tool want to *write* CLAUDE.md / AGENTS.md. That
 * collision is the whole compatibility problem: vigiles stamps a SHA-256
 * integrity header on line 1 (see `integrity.ts`), but Ruler concatenates its
 * source files into CLAUDE.md (prepending `<!-- Source: … -->`) and rulesync
 * regenerates it — either way the hash silently goes stale. The clean topology
 * is "vigiles upstream": compile into the tool's *source slot* and let the tool
 * distribute (see `research/sync-tool-compatibility.md`).
 *
 * This detector is pure filesystem inspection — the same deterministic-detector
 * shape as `orphans.ts` / `test-coverage.ts`. It reports which tools are present
 * and any target that collides with a file the tool regenerates, so `vigiles
 * audit` can warn before the integrity guarantee is lost.
 */

import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A rule-sync tool vigiles should compose with rather than reimplement. */
export type SyncToolName = "ruler" | "rulesync";

export interface DetectedSyncTool {
  readonly name: SyncToolName;
  /**
   * Where vigiles should compile its canonical output so the tool picks it up
   * as a source (Topology A), e.g. `.ruler/AGENTS.md`.
   */
  readonly sourceSlot: string;
  /**
   * Files the tool regenerates/concatenates as distribution output. A vigiles
   * compile target that lands in this set collides (the integrity hazard).
   */
  readonly distributes: readonly string[];
}

export interface ComposeCollision {
  readonly tool: SyncToolName;
  /** The vigiles compile target that the tool also owns. */
  readonly target: string;
  /** The source slot to compile into instead. */
  readonly redirectTo: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** True when `rel` under `root` exists and is a directory. */
function hasDir(root: string, rel: string): boolean {
  const p = join(root, rel);
  return existsSync(p) && statSync(p).isDirectory();
}

/** True when `rel` under `root` exists as a file. */
function hasFile(root: string, rel: string): boolean {
  const p = join(root, rel);
  return existsSync(p) && statSync(p).isFile();
}

/**
 * Detect the rule-sync tools configured in the repo at `root`. Ruler is keyed
 * on its `.ruler/` source dir or a `ruler.toml`; rulesync on its `.rulesync/`
 * dir. Returns each tool's recommended source slot and the files it owns as
 * distribution output (used to find collisions).
 */
export function detectSyncTools(root: string): DetectedSyncTool[] {
  const base = resolve(root);
  const tools: DetectedSyncTool[] = [];

  if (hasDir(base, ".ruler") || hasFile(base, "ruler.toml")) {
    tools.push({
      name: "ruler",
      sourceSlot: join(".ruler", "AGENTS.md"),
      // Ruler's default agent outputs that overlap vigiles instruction targets.
      distributes: ["CLAUDE.md", "AGENTS.md"],
    });
  }

  if (hasDir(base, ".rulesync")) {
    tools.push({
      name: "rulesync",
      sourceSlot: join(".rulesync", "rules", "vigiles.md"),
      distributes: ["CLAUDE.md", "AGENTS.md"],
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Collision analysis
// ---------------------------------------------------------------------------

/** Normalize a target to its bare filename for comparison (handles paths). */
function targetName(target: string): string {
  const parts = target.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Given the repo `root` and the spec's compile `targets`, report every case
 * where a target is also a file a detected sync tool regenerates. Each
 * collision carries the source slot to compile into instead — the actionable
 * fix that preserves the integrity hash (the tool distributes from there).
 *
 * No detected tool, or no overlapping target, yields an empty list.
 */
export function composeCollisions(
  root: string,
  targets: readonly string[],
): ComposeCollision[] {
  const tools = detectSyncTools(root);
  const collisions: ComposeCollision[] = [];
  for (const tool of tools) {
    for (const target of targets) {
      if (!tool.distributes.includes(targetName(target))) continue;
      collisions.push({
        tool: tool.name,
        target,
        redirectTo: tool.sourceSlot,
        reason: `${tool.name} regenerates ${targetName(target)}, which would overwrite vigiles output and stale its integrity hash — compile into ${tool.sourceSlot} and let ${tool.name} distribute.`,
      });
    }
  }
  return collisions;
}
