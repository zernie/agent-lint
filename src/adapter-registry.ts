/**
 * Adapter registry — the composition-root list the CLI uses to auto-detect which
 * harness a repo targets. The library API selects an adapter by import
 * (`vigiles/claude-code`); the CLI can't, so it walks this registry. Claude Code
 * is the default, so detection is backwards-compatible: an undetected repo (or a
 * repo with no adapter markers) resolves to Claude Code exactly as before.
 *
 * Adding a harness = add its `HarnessAdapter` to `ADAPTERS` (and a
 * `vigiles/<harness>` export). Order matters only if two adapters could both
 * match a repo; today there is one.
 */
import type { HarnessAdapter } from "./core/adapter.js";
import { claudeCodeAdapter } from "./adapters/claude-code/adapter.js";

/** The default adapter when detection finds no harness markers. */
export const defaultAdapter: HarnessAdapter = claudeCodeAdapter;

/** All registered adapters, in detection priority order. */
export const ADAPTERS: readonly HarnessAdapter[] = [claudeCodeAdapter];

/** The first adapter whose `detect(root)` matches, else the default (Claude Code). */
export function detectAdapter(root: string): HarnessAdapter {
  return ADAPTERS.find((a) => a.detect(root)) ?? defaultAdapter;
}

/** Look up a registered adapter by `name` (e.g. for a `--harness` override). */
export function getAdapter(name: string): HarnessAdapter | undefined {
  return ADAPTERS.find((a) => a.name === name);
}
