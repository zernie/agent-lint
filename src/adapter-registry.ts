/**
 * Adapter registry — the composition-root list the CLI uses to auto-detect which
 * harness a repo targets. The library API selects an adapter by import
 * (`vigiles/claude-code`); the CLI can't, so it walks this registry. Claude Code
 * is the default, so detection is backwards-compatible: an undetected repo (or a
 * repo with no adapter markers) resolves to Claude Code exactly as before.
 *
 * Adding a harness = add its `HarnessAdapter` to `ADAPTERS` (and a
 * `vigiles/<harness>` export). Order matters only if two adapters could both
 * match a repo; `detect()` returns a specificity score so the strongest signal
 * wins regardless of order.
 */
import type { HarnessAdapter } from "./core/adapter.js";
import { claudeCodeAdapter } from "./adapters/claude-code/adapter.js";
import { codexAdapter } from "./adapters/codex/adapter.js";

/** The default adapter when detection finds no harness markers. */
export const defaultAdapter: HarnessAdapter = claudeCodeAdapter;

/** All registered adapters. detect() specificity (not order) breaks ties. */
export const ADAPTERS: readonly HarnessAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
];

/** The result of auto-detecting a harness from a repo's layout. */
export interface DetectResult {
  readonly adapter: HarnessAdapter;
  /** True when detection found no harness markers and fell back to the default. */
  readonly fallback: boolean;
  /**
   * Other adapters that matched at the same top specificity — a non-empty list
   * means the repo looks like more than one harness (e.g. a CLAUDE.md + an
   * AGENTS.md), so the pick is ambiguous; resolve with `--harness`.
   */
  readonly ambiguousWith: readonly string[];
}

/** Auto-detect the harness for a repo at `root` by highest detect() specificity. */
export function detectAdapterResult(root: string): DetectResult {
  const scored = ADAPTERS.map((a) => ({ a, score: a.detect(root) })).filter(
    (s) => s.score > 0,
  );
  if (scored.length === 0) {
    return { adapter: defaultAdapter, fallback: true, ambiguousWith: [] };
  }
  const top = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === top).map((s) => s.a);
  return {
    adapter: winners[0],
    fallback: false,
    ambiguousWith: winners.slice(1).map((a) => a.name),
  };
}

/** The detected adapter (highest specificity), else the default (Claude Code). */
export function detectAdapter(root: string): HarnessAdapter {
  return detectAdapterResult(root).adapter;
}

/** Look up a registered adapter by `name` (e.g. for a `--harness` override). */
export function getAdapter(name: string): HarnessAdapter | undefined {
  return ADAPTERS.find((a) => a.name === name);
}

/**
 * Resolve the adapter for a command: an explicit `--harness <name>` wins (throws
 * if unknown); otherwise auto-detect from `root`. The single entry point the CLI
 * uses so detection + override live in one place.
 */
export function resolveAdapter(root: string, harness?: string): HarnessAdapter {
  if (harness !== undefined) {
    const a = getAdapter(harness);
    if (!a) {
      const known = ADAPTERS.map((x) => x.name).join(", ");
      throw new Error(`Unknown harness "${harness}". Known: ${known}.`);
    }
    return a;
  }
  return detectAdapter(root);
}
