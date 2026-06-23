/**
 * Dialect freshness / drift detection against the INSTALLED Claude Code.
 *
 * Claude Code is a black box (only `settings.json` has an official schema), so
 * `claudeCodeDialect` is hand-maintained — see the licensing decision in
 * research/code-adapter-architecture.md. But the installed `@anthropic-ai/claude-code`
 * package ships a semi-machine source: `sdk-tools.d.ts` (the tool-input type set) and
 * the hook-event names as string literals in `cli.js`. We READ THE USER'S LOCAL
 * INSTALL (ToS-clean — no copying, no redistribution; same posture as driving the
 * user's own `claude` CLI) to ALARM when CC's surface drifts from our catalog. We
 * never ship or vendor their types — only diff against them at test/runtime.
 *
 * Pure parsers (testable with fixtures) + a local-install locator. The gated test
 * in `dialect-drift.test.ts` wires them; a runtime warn in compile/scan can reuse them.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/**
 * The `<X>Input` interface names we've ACKNOWLEDGED from `sdk-tools.d.ts` (Claude
 * Code 2.1.42). The drift test fails when the installed set differs — a loud nudge
 * to re-check `claudeCodeDialect` (and update this set) when CC adds/removes a tool.
 * NOT a redistribution of their file: a list of bare identifiers (facts), authored here.
 */
export const ACKNOWLEDGED_TOOL_INPUT_TYPES: readonly string[] = [
  "Agent",
  "AskUserQuestion",
  "Bash",
  "Config",
  "ExitPlanMode",
  "FileEdit",
  "FileRead",
  "FileWrite",
  "Glob",
  "Grep",
  "ListMcpResources",
  "Mcp",
  "NotebookEdit",
  "ReadMcpResource",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
];

/** Parse `export interface <X>Input {` names from sdk-tools.d.ts → sorted [<X>]. Pure. */
export function parseToolInputTypes(dts: string): string[] {
  const out = new Set<string>();
  for (const m of dts.matchAll(/export\s+interface\s+(\w+)Input\b/g))
    out.add(m[1]);
  return [...out].sort();
}

/** Which of `events` do NOT appear as a whole-word literal in the bundle. Pure. */
export function eventsMissingFromBundle(
  bundle: string,
  events: readonly string[],
): string[] {
  return events.filter((e) => !new RegExp(`\\b${e}\\b`).test(bundle));
}

/**
 * Locate the user's installed `@anthropic-ai/claude-code` package dir, or null.
 * Tries the global npm root, then the `claude` binary's real path. Read-only —
 * we only read files the user already installed under their own CC license.
 */
export function findClaudeCodePackage(): string | null {
  const tryDir = (dir: string): string | null =>
    existsSync(join(dir, "sdk-tools.d.ts")) ? dir : null;

  const candidates: (() => string | null)[] = [
    () => {
      const root = execSync("npm root -g", { encoding: "utf-8" }).trim();
      return tryDir(join(root, "@anthropic-ai", "claude-code"));
    },
    () => {
      const bin = execSync('readlink -f "$(command -v claude)"', {
        encoding: "utf-8",
      }).trim();
      const marker = "/@anthropic-ai/claude-code/";
      const i = bin.indexOf(marker);
      return i >= 0 ? tryDir(bin.slice(0, i + marker.length - 1)) : null;
    },
  ];

  for (const probe of candidates) {
    try {
      const hit = probe();
      if (hit) return hit;
    } catch {
      /* probe unavailable (no npm / no claude) — try the next */
    }
  }
  return null;
}
