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
 * Pure parsers (testable with fixtures) + a local-install locator. TWO consumers:
 * the gated CI test in `dialect-drift.test.ts` (fails loud on tool/event drift), and
 * `vigiles scan` at runtime via `checkDialectDrift`/`formatDialectDrift` (a best-effort,
 * read-local freshness WARN when the installed CC's tool surface drifts from ours).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/** The Claude Code version `ACKNOWLEDGED_TOOL_INPUT_TYPES` + the dialect were last validated against. */
export const VALIDATED_CC_VERSION = "2.1.42";

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

/** A runtime drift report: how the INSTALLED CC's tool surface compares to ours. */
export interface DialectDriftReport {
  readonly installedVersion: string;
  readonly validatedVersion: string;
  /** Tool-input types present in the install but not in ACKNOWLEDGED (CC added). */
  readonly newToolTypes: string[];
  /** Acknowledged types absent from the install (CC removed/renamed). */
  readonly removedToolTypes: string[];
}

/**
 * Best-effort, read-local drift check for `scan` (and other runtime callers). Reads
 * only the small `sdk-tools.d.ts` (fast — no `cli.js` bundle scan; events are the
 * CI test's job). Returns null when CC isn't installed or anything is unreadable —
 * NEVER throws, so it can't break the command. ToS-clean: reads the user's own
 * install, ships nothing.
 */
export function checkDialectDrift(): DialectDriftReport | null {
  const pkg = findClaudeCodePackage();
  if (!pkg) return null;
  try {
    const installed = new Set(
      parseToolInputTypes(readFileSync(join(pkg, "sdk-tools.d.ts"), "utf-8")),
    );
    const ack = new Set(ACKNOWLEDGED_TOOL_INPUT_TYPES);
    let installedVersion = "unknown";
    try {
      installedVersion =
        (
          JSON.parse(readFileSync(join(pkg, "package.json"), "utf-8")) as {
            version?: string;
          }
        ).version ?? "unknown";
    } catch {
      /* version optional */
    }
    return {
      installedVersion,
      validatedVersion: VALIDATED_CC_VERSION,
      newToolTypes: [...installed].filter((t) => !ack.has(t)).sort(),
      removedToolTypes: [...ack].filter((t) => !installed.has(t)).sort(),
    };
  } catch {
    return null;
  }
}

/** A one-line freshness warning if the dialect drifted from the install, else null. */
export function formatDialectDrift(
  r: DialectDriftReport | null,
): string | null {
  if (!r || (r.newToolTypes.length === 0 && r.removedToolTypes.length === 0))
    return null;
  const parts: string[] = [];
  if (r.newToolTypes.length > 0)
    parts.push(`CC added tool type(s): ${r.newToolTypes.join(", ")}`);
  if (r.removedToolTypes.length > 0)
    parts.push(`removed: ${r.removedToolTypes.join(", ")}`);
  return (
    `⚠ dialect freshness: vigiles's tool catalog was validated against ` +
    `claude-code ${r.validatedVersion}, you have ${r.installedVersion} — ` +
    `${parts.join("; ")}. Tool/contract checks may be stale; a vigiles update may be needed.`
  );
}
