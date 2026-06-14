/**
 * vigiles — record/replay cache for the eval tier.
 *
 * A real-model eval is slow and costs money, yet most iteration is on the
 * `measure` function, not the model call. This cache records each trial's raw
 * output AND its post-run filesystem, keyed on everything that determines the
 * model's behaviour — `task`, the resolved fixture files + settings, model,
 * tools, and the trial index — but DELIBERATELY NOT the `measure` function. So
 * editing your metric and re-running re-scores the captured runs for free; the
 * model is only re-called when a model-affecting input changes (or `cache:"off"`,
 * which always re-samples for a fresh statistic).
 *
 * Restoring the post-run filesystem is what makes replay *sound*: `measure`
 * routinely reads agent-produced files via `ctx.file()` / `ctx.sh("grep …")`, so
 * a stdout-only cache would silently mis-score on replay. We snapshot the cwd's
 * text files after the run and restore them into a fresh dir before re-scoring.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

import { sha256short, type SHA256Hash } from "../../core/hash.js";
import type { RunOut } from "./eval.js";

/** Cache behaviour: never touch the cache / read-only / read-and-write. */
export type CacheMode = "off" | "read" | "readwrite";

/** Everything that determines a trial's model output (the cache key inputs). */
export interface CacheKeyInput {
  readonly task: string;
  readonly model: string;
  readonly tools: readonly string[];
  /** The resolved fixture + arm + plugin files written before the run. */
  readonly files: Record<string, string>;
  /** The resolved `.claude/settings.json` for the arm (or undefined). */
  readonly settings: unknown;
  /** Which trial this is — distinct trials are distinct samples, cached apart. */
  readonly trialIndex: number;
}

/** A recorded trial: its raw output plus the post-run cwd snapshot. */
export interface CacheRecord {
  readonly out: RunOut;
  /** Text files present in the cwd after the run (relative path → contents). */
  readonly files: Record<string, string>;
}

const MAX_SNAPSHOT_FILE_BYTES = 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git"]);

/**
 * Canonicalize a value so the key is stable regardless of object key order —
 * recursively sorts object keys. Arrays keep order (it's significant for tools).
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k]);
    return out;
  }
  return value;
}

/** Deterministic content hash of the key inputs (order-independent). */
export function cacheKey(input: CacheKeyInput): SHA256Hash {
  return sha256short(JSON.stringify(canonical(input)));
}

/** Read a cached record by key, or null on miss / unreadable / malformed. */
export function readCache(dir: string, key: SHA256Hash): CacheRecord | null {
  const path = join(dir, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CacheRecord;
  } catch {
    return null;
  }
}

/** Write a cached record by key (creating the cache dir as needed). */
export function writeCache(
  dir: string,
  key: SHA256Hash,
  record: CacheRecord,
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.json`), JSON.stringify(record));
}

/** Snapshot the text files under `cwd` as `relativePath → contents` (bounded). */
export function snapshotDir(cwd: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile() && st.size <= MAX_SNAPSHOT_FILE_BYTES) {
        out[relative(cwd, full)] = readFileSync(full, "utf-8");
      }
    }
  };
  walk(resolve(cwd));
  return out;
}

/** Restore a snapshot into `cwd`, recreating directories as needed. */
export function restoreDir(cwd: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = resolve(cwd, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}
