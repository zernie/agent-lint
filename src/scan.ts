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

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { loadPlugin } from "./adapters/claude-code/plugin-loader.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";
import { danglingRefs } from "./plugin-loader.js";
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
  /**
   * Intra-plugin file references (hook scripts, skill bodies) pointing at files
   * that don't exist on disk — the broken-path / partial-vendor class. A
   * first-class structural finding, not just a free-text warning, so the verdict
   * and the leaderboard can count it.
   */
  readonly danglingRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly untested: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const SCRIPT_RE = /\S+\.(?:sh|mjs|cjs|js|ts|py|rb)\b/g;

/** A YAML block-scalar indicator: `>`/`|` with optional chomp (`+`/`-`) + indent digit. */
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*$/;

/**
 * Read a top-level frontmatter field, handling YAML block scalars. A naive
 * `description:\s*(.+)` captures only the `>` / `>-` indicator when a skill
 * writes its description as a folded block — real plugins (wshobson/agents)
 * commonly do, and the regex parser then mislabels a richly-described skill as
 * "no description". When the inline value is a block indicator, gather the
 * following more-indented lines.
 */
function readField(block: string, key: string): string | undefined {
  const lines = block.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx === -1) return undefined;
  const keyIndent = /^(\s*)/.exec(lines[idx])?.[1].length ?? 0;
  const inline = (
    new RegExp(`^${key}:[ \\t]*(.*)$`).exec(lines[idx])?.[1] ?? ""
  ).trim();
  if (!BLOCK_SCALAR_RE.test(inline)) {
    return inline.replace(/^["']|["']$/g, "").trim() || undefined;
  }
  const collected: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const indent = /^(\s*)/.exec(lines[i])?.[1].length ?? 0;
    if (indent <= keyIndent) break;
    collected.push(lines[i].trim());
  }
  return collected.join(" ").trim() || undefined;
}

function frontmatter(md: string): { name?: string; description?: string } {
  const m = /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  return {
    name: readField(m[1], "name"),
    description: readField(m[1], "description"),
  };
}

// Anchor each surface on a real path boundary (start-of-path or a `/`), so a
// directory whose NAME merely ends in the keyword isn't misclassified — e.g.
// the skill `skills/dispatching-parallel-agents/SKILL.md` must NOT register as
// an agent named "SKILL" (the `-agents/` substring), which real plugins like
// obra/superpowers ship. See scan.test.ts for the regression cases.
const isSkill = (f: string): boolean =>
  /(?:^|\/)skills\/[^/]+\/SKILL\.md$/.test(f);
const isAgent = (f: string): boolean =>
  /(?:^|\/)agents\/[^/]+\.md$/.test(f) && !f.endsWith(".spec.ts");
const isCommand = (f: string): boolean => /(?:^|\/)commands\/.+\.md$/.test(f);

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
  const lay = layout ?? claudeCodeLayout;
  const loaded = loadPlugin(dir, lay);
  const { hooks, inline } = scanHooks(loaded.settings, resolve(dir));
  return {
    dir,
    skills: scanSkills(loaded.files),
    agents: scanAgents(loaded.files),
    hooks,
    inlineHooks: inline,
    commands: Object.keys(loaded.files).filter(isCommand).length,
    mcp: loaded.warnings.some((w) => w.includes("MCP server")),
    danglingRefs: danglingRefs(resolve(dir), lay),
    warnings: loaded.warnings,
    untested: findUntestedSurfaces({ basePath: dir }).untested.length,
  };
}

/**
 * If `dir` is a plugin MARKETPLACE (a `marketplace.json` beside the layout's
 * plugin manifest, e.g. `.claude-plugin/marketplace.json`), expand it into the
 * absolute dirs of its member plugins, resolving each entry's relative `source`.
 * Returns `null` when there's no marketplace. Entries with a non-string source
 * (external git/github plugins, which aren't on disk) are skipped, as are member
 * dirs that don't exist. Used by `vigiles scan` to rank a whole marketplace —
 * wshobson/agents alone ships 80+ plugins under one `marketplace.json`.
 */
export function expandMarketplace(
  dir: string,
  layout: PluginLayout = claudeCodeLayout,
): string[] | null {
  const mpPath = join(dir, dirname(layout.manifestPath), "marketplace.json");
  if (!existsSync(mpPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(mpPath, "utf-8"));
  } catch {
    return null;
  }
  const plugins = (parsed as { plugins?: unknown }).plugins;
  if (!Array.isArray(plugins)) return null;
  const dirs: string[] = [];
  for (const entry of plugins) {
    const source = (entry as { source?: unknown }).source;
    if (typeof source !== "string") continue; // external plugin, not on disk
    const abs = resolve(dir, source);
    if (existsSync(abs) && statSync(abs).isDirectory()) dirs.push(abs);
  }
  return dirs;
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

  out.push(
    ...section(
      "Broken references",
      r.danglingRefs.map((ref) => `  ✗ ${ref} (referenced but MISSING)`),
    ),
  );

  const facts: string[] = [];
  if (r.commands > 0) facts.push(`Commands: ${String(r.commands)}`);
  facts.push(`MCP servers: ${r.mcp ? "yes" : "no"}`);
  facts.push(`Untested surfaces: ${String(r.untested)}`);
  out.push(...facts, "");

  // The dangling-ref warning is now shown as a first-class ✗ section above, so
  // drop it from the free-text list to avoid saying the same thing twice.
  const warnings = r.warnings.filter(
    (w) => !w.includes("intra-plugin file(s) that don't exist"),
  );
  if (warnings.length > 0) {
    out.push("Warnings:", ...warnings.map((w) => `  - ${w}`), "");
  }

  const broken =
    r.hooks.filter((h) => h.status === "missing").length +
    r.skills.filter((s) => !s.hasDescription).length +
    r.danglingRefs.length;
  out.push(
    broken === 0
      ? "✓ no structural issues found"
      : `⚠ ${String(broken)} structural issue(s) — see ✗/⚠ above`,
  );
  return out.join("\n");
}
