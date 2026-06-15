/**
 * `vigiles scan <dir>` — point vigiles at any plugin/repo and see what it ships
 * and what's broken, with **no model and no API key**.
 *
 * This is the deterministic substrate under the plugin/skill leaderboard
 * (research/divergent-bets.md #9) and the harness-aware scan
 * (research/agent-supply-chain-security.md #1): it re-aims the machinery that
 * already exists — `loadPlugin` (surfaces + dangling-ref/MCP/empty-machine
 * warnings), `parseAgentTools` (the declared tool contract), and
 * `findUntestedSurfaces` — into one read-only report. Behavioral checks that
 * need to RUN the plugin (observed egress under the sandbox, real trigger-rate)
 * stack on top later; this core stays pure so it runs anywhere in CI for free.
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

import { loadPlugin } from "./adapters/claude-code/plugin-loader.js";
import type { PluginLayout } from "./core/layout.js";
import { parseAgentTools } from "./adapters/claude-code/agent-runtime.js";
import { findUntestedSurfaces } from "./test-coverage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanSkill {
  readonly name: string;
  readonly path: string;
  readonly hasDescription: boolean;
  readonly userInvoked: boolean;
}

export interface ScanAgent {
  readonly name: string;
  readonly path: string;
  /** Declared tool contract, or null when the agent ships no `tools:` (inherits all). */
  readonly tools: readonly string[] | null;
}

/** ok = file present; missing = referenced but absent; unresolved = path still has an unexpanded var, can't check. */
export type HookStatus = "ok" | "missing" | "unresolved";

export interface ScanHook {
  readonly script: string;
  readonly status: HookStatus;
}

export interface ScanReport {
  readonly dir: string;
  readonly skills: readonly ScanSkill[];
  readonly agents: readonly ScanAgent[];
  readonly hooks: readonly ScanHook[];
  /** Hook entries with no script file (inline shell one-liners) — can't be path-checked. */
  readonly inlineHooks: number;
  readonly commands: number;
  readonly mcp: boolean;
  readonly warnings: readonly string[];
  readonly untested: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const SCRIPT_RE = /\S+\.(?:sh|mjs|cjs|js|ts|py|rb)\b/g;

function frontmatter(md: string): { name?: string; description?: string } {
  const m = /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  const name = /^name:\s*(.+)$/m.exec(m[1])?.[1]?.trim();
  const description = /^description:\s*(.+)$/m.exec(m[1])?.[1]?.trim();
  return { name, description };
}

const isSkill = (f: string): boolean => /skills\/[^/]+\/SKILL\.md$/.test(f);
const isAgent = (f: string): boolean =>
  /agents\/[^/]+\.md$/.test(f) && !f.endsWith(".spec.ts");
const isCommand = (f: string): boolean => /commands\/.+\.md$/.test(f);

function skillName(path: string): string {
  return (
    path
      .replace(/\/SKILL\.md$/, "")
      .split("/")
      .pop() ?? path
  );
}

function scanSkills(files: Record<string, string>): ScanSkill[] {
  const out: ScanSkill[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!isSkill(path)) continue;
    const fm = frontmatter(md);
    out.push({
      name: fm.name ?? skillName(path),
      path,
      hasDescription: Boolean(fm.description && fm.description.length >= 20),
      userInvoked: /^\s*disable-model-invocation:\s*true\s*$/m.test(md),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function scanAgents(files: Record<string, string>): ScanAgent[] {
  const out: ScanAgent[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!isAgent(path)) continue;
    out.push({ name: basename(path, ".md"), path, tools: parseAgentTools(md) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a hook script token to a checkable path. `loadPlugin` expands the
 * braced `${CLAUDE_PLUGIN_ROOT}`; the unbraced shell form `$CLAUDE_PLUGIN_ROOT`
 * survives, so resolve it against the plugin root here and strip shell quotes.
 * A token that still carries any `$VAR` after that is genuinely uncheckable.
 */
function resolveScript(token: string, root: string): ScanHook {
  const path = token
    .replace(/["']/g, "")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
    .replaceAll("$CLAUDE_PLUGIN_ROOT", root);
  if (path.includes("$")) return { script: token, status: "unresolved" };
  return { script: path, status: existsSync(path) ? "ok" : "missing" };
}

/** Pull script-file hook commands out of the resolved settings; count inline ones. */
function scanHooks(
  settings: { hooks?: unknown },
  root: string,
): { hooks: ScanHook[]; inline: number } {
  const text = JSON.stringify(settings.hooks ?? {});
  const commands = [...text.matchAll(/"command":\s*"((?:[^"\\]|\\.)*)"/g)].map(
    (m) => m[1],
  );
  const byScript = new Map<string, ScanHook>();
  let inline = 0;
  for (const cmd of commands) {
    const unescaped = cmd.replace(/\\(.)/g, "$1");
    const found = unescaped.match(SCRIPT_RE);
    if (!found || found.length === 0) {
      inline++;
      continue;
    }
    for (const tok of found) {
      const hook = resolveScript(tok, root);
      byScript.set(hook.script, hook);
    }
  }
  const hooks = [...byScript.values()].sort((a, b) =>
    a.script.localeCompare(b.script),
  );
  return { hooks, inline };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Scan a plugin/repo directory and report its surfaces + structural issues. */
export function scanPlugin(dir: string, layout?: PluginLayout): ScanReport {
  const loaded = loadPlugin(dir, layout);
  const { hooks, inline } = scanHooks(loaded.settings, resolve(dir));
  return {
    dir,
    skills: scanSkills(loaded.files),
    agents: scanAgents(loaded.files),
    hooks,
    inlineHooks: inline,
    commands: Object.keys(loaded.files).filter(isCommand).length,
    mcp: loaded.warnings.some((w) => w.includes("MCP server")),
    warnings: loaded.warnings,
    untested: findUntestedSurfaces({ basePath: dir }).untested.length,
  };
}

function section(title: string, lines: readonly string[]): string[] {
  if (lines.length === 0) return [];
  return [`${title} (${String(lines.length)}):`, ...lines, ""];
}

/** Format a scan report as human-readable text. */
export function formatScanReport(r: ScanReport): string {
  const out: string[] = [`Scan: ${r.dir}`, ""];

  out.push(
    ...section(
      "Skills",
      r.skills.map((s) => {
        const mark = s.hasDescription ? "✓" : "⚠";
        const note = s.hasDescription
          ? s.userInvoked
            ? "(user-invoked)"
            : ""
          : "(missing/short description — can't trigger)";
        return `  ${mark} ${s.name} ${note}`.trimEnd();
      }),
    ),
  );

  out.push(
    ...section(
      "Agents",
      r.agents.map((a) => {
        const tools =
          a.tools === null
            ? "tools: (inherits all — no contract)"
            : `tools: ${a.tools.join(", ") || "(none)"}`;
        return `  ${a.tools === null ? "⚠" : "✓"} ${a.name} — ${tools}`;
      }),
    ),
  );

  const hookMark: Record<HookStatus, string> = {
    ok: "✓",
    missing: "✗",
    unresolved: "?",
  };
  const hookNote: Record<HookStatus, string> = {
    ok: "",
    missing: " (referenced but MISSING)",
    unresolved: " (unresolved var — can't check)",
  };
  const hookLines = r.hooks.map(
    (h) => `  ${hookMark[h.status]} ${h.script}${hookNote[h.status]}`,
  );
  if (r.inlineHooks > 0) {
    hookLines.push(
      `  · ${String(r.inlineHooks)} inline hook(s) (no script file)`,
    );
  }
  out.push(...section("Hooks", hookLines));

  const facts: string[] = [];
  if (r.commands > 0) facts.push(`Commands: ${String(r.commands)}`);
  facts.push(`MCP servers: ${r.mcp ? "yes" : "no"}`);
  facts.push(`Untested surfaces: ${String(r.untested)}`);
  out.push(...facts, "");

  if (r.warnings.length > 0) {
    out.push("Warnings:", ...r.warnings.map((w) => `  - ${w}`), "");
  }

  const broken =
    r.hooks.filter((h) => h.status === "missing").length +
    r.skills.filter((s) => !s.hasDescription).length;
  out.push(
    broken === 0
      ? "✓ no structural issues found"
      : `⚠ ${String(broken)} structural issue(s) — see ✗/⚠ above`,
  );
  return out.join("\n");
}
