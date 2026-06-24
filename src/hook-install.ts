/**
 * Hook installation — the bridge from a typed hook program to a wired harness,
 * folded into `vigiles compile` (there is no stray `compile-hook` verb; the
 * cohesive-cli-surface rule).
 *
 * The typed hook program is harness-NEUTRAL — it imports `vigiles/hook` and
 * compiles to whatever harness — so its SOURCE lives in the agnostic,
 * committed {@link HOOKS_DIR} (`.vigiles/hooks/`), never in a harness's own
 * `.claude/`. `compile` discovers each hook there, compiles it, and MERGES the
 * result into the active harness's native config (`.claude/settings.json` JSON
 * / `config.toml` TOML) — so the harness is actually wired, not handed a
 * paste-this block. The merge is idempotent: an entry is keyed by the runtime
 * command's hook PATH, so recompiling updates in place and never duplicates,
 * while a user's own hand-written hooks are preserved untouched. One source dir
 * also means basenames are unique, so the stamp can key on the basename safely.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyToml } from "@iarna/toml";

/** The agnostic, committed home for hook SOURCE — one dir, cross-adapter. */
export const HOOKS_DIR = ".vigiles/hooks";

/** The committed home for registered context-provider SOURCE (v2). */
export const PROVIDERS_DIR = ".vigiles/providers";

/** A JS/TS hook source file (the `.json` stamp sidecar is never matched). */
const HOOK_SOURCE_RE = /\.(?:mjs|cjs|js|mts|cts|ts)$/;

/** List JS/TS source files under `dir` (relative to cwd), stamps excluded. */
function discoverSources(cwd: string, dir: string): string[] {
  const abs = join(cwd, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => HOOK_SOURCE_RE.test(f) && !f.endsWith(".d.ts"))
    .sort()
    .map((f) => join(dir, f));
}

/** Discover hook source files under {@link HOOKS_DIR} (stamps excluded). */
export function discoverHookFiles(cwd: string): string[] {
  return discoverSources(cwd, HOOKS_DIR);
}

/** Discover registered-provider source files under {@link PROVIDERS_DIR}. */
export function discoverProviderFiles(cwd: string): string[] {
  return discoverSources(cwd, PROVIDERS_DIR);
}

interface CommandHook {
  readonly type: "command";
  readonly command: string;
}
interface HookEntry {
  readonly matcher?: string;
  readonly hooks: readonly CommandHook[];
}
/** The CC-shaped structured block a compiled hook program carries. */
export type CompiledHooks = Record<string, readonly HookEntry[]>;

interface SettingsJson {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

/** True when an entry's command routes through the runtime for `hookPath`. */
function managesHook(entry: HookEntry, hookPath: string): boolean {
  return entry.hooks.some((h) => h.command.includes(hookPath));
}

/**
 * Idempotently merge a compiled hook's block into an existing `settings.json`
 * object. Entries managed by THIS hook file (the runtime command references
 * `hookPath`) are replaced; every unrelated entry — including the user's own
 * hand-written hooks — is preserved.
 */
export function mergeHooksJson(
  existing: SettingsJson,
  compiled: CompiledHooks,
  hookPath: string,
): SettingsJson {
  const hooks: Record<string, HookEntry[]> = { ...(existing.hooks ?? {}) };
  for (const [event, entries] of Object.entries(compiled)) {
    const kept = (hooks[event] ?? []).filter((e) => !managesHook(e, hookPath));
    hooks[event] = [...kept, ...entries];
  }
  return { ...existing, hooks };
}

interface TomlHookEntry {
  matcher?: string;
  command: string;
}
interface ConfigToml {
  hooks?: Record<string, TomlHookEntry[]>;
  [k: string]: unknown;
}

/** Flatten a CC-shaped entry to Codex's flat `{matcher?, command}` form. */
function toTomlEntries(entries: readonly HookEntry[]): TomlHookEntry[] {
  return entries.flatMap((e) =>
    e.hooks.map((h) =>
      e.matcher === undefined
        ? { command: h.command }
        : { matcher: e.matcher, command: h.command },
    ),
  );
}

/** The TOML sibling of {@link mergeHooksJson} (Codex `[[hooks.<event>]]`). */
export function mergeHooksToml(
  existing: ConfigToml,
  compiled: CompiledHooks,
  hookPath: string,
): ConfigToml {
  const hooks: Record<string, TomlHookEntry[]> = { ...(existing.hooks ?? {}) };
  for (const [event, entries] of Object.entries(compiled)) {
    const kept = (hooks[event] ?? []).filter(
      (e) => !e.command.includes(hookPath),
    );
    hooks[event] = [...kept, ...toTomlEntries(entries)];
  }
  return { ...existing, hooks };
}

/** Serialize a merged config back to its on-disk text (with trailing newline). */
export function serializeConfig(
  merged: Record<string, unknown>,
  format: "json" | "toml",
): string {
  return format === "toml"
    ? stringifyToml(merged as never).trimEnd() + "\n"
    : JSON.stringify(merged, null, 2) + "\n";
}
