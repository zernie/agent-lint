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
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { loadPlugin } from "./adapters/claude-code/plugin-loader.js";
import { claudeCodeLayout } from "./adapters/claude-code/layout.js";
import { claudeCodeDialect } from "./adapters/claude-code/dialect.js";
import { danglingRefs } from "./plugin-loader.js";
import type { PluginLayout } from "./core/layout.js";
import type { HarnessDialect } from "./core/dialect.js";
import {
  verifyToolContract,
  confidentToolIssues,
  disallowedToolIssues,
  type ToolIssue,
} from "./core/tool-contract.js";
import {
  verifyHookEvents,
  confidentHookEventIssues,
  type HookEventIssue,
} from "./core/hook-events.js";
import { verifyMcpServers, type McpIssue } from "./core/mcp-config.js";
import { editDistance } from "./core/linters.js";
import { readFrontmatter, frontmatterScalar } from "./core/frontmatter-read.js";
import {
  findDescriptionOverlaps,
  type DescriptionOverlap,
} from "./core/description-overlap.js";
import { verifyMcpToolServers, type McpToolIssue } from "./core/mcp-tool.js";
import { verifyMcpHookTargets, type McpHookIssue } from "./core/mcp-hook.js";
import {
  parseAgentTools,
  parseAgentToolList,
} from "./adapters/claude-code/agent-runtime.js";
import { findUntestedSurfaces } from "./test-coverage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A named writing system. The label `unexpectedScript` reports + the config's expectation parse into this. */
export type Script =
  | "Latin"
  | "Cyrillic"
  | "Han"
  | "Japanese"
  | "Korean"
  | "Arabic"
  | "Hebrew"
  | "Greek"
  | "Devanagari"
  | "Thai";

export interface ScanSkill {
  readonly name: string;
  readonly path: string;
  readonly hasDescription: boolean;
  readonly userInvoked: boolean;
  /**
   * The description's dominant script when it DIFFERS from the expected one
   * (default `"Latin"`), else null. The model's skill-selection context is
   * English-centric, so a description in another script carries a cross-language
   * trigger risk — it may under-fire on English prompts. A RISK flag, not a
   * defect (a language-matched audience is fine); measure the real gap with
   * `scan --trigger`.
   */
  readonly descriptionScript: Script | null;
}

export interface ScanAgent {
  readonly name: string;
  readonly path: string;
  /** Declared tool contract, or null when the agent ships no `tools:` (inherits all). */
  readonly tools: readonly string[] | null;
  /** Contract entries that don't resolve to a real built-in / MCP tool (typo, never-available). */
  readonly toolIssues: readonly ToolIssue[];
  /** MCP tool entries naming a server the plugin doesn't declare (can't resolve). */
  readonly mcpToolIssues: readonly McpToolIssue[];
  /** `disallowedTools:` block-list entries that are typos of a real tool (block nothing). */
  readonly disallowedToolIssues: readonly ToolIssue[];
}

/** A skill/agent whose frontmatter is missing a required field (name / description). */
export interface FrontmatterIssue {
  readonly path: string;
  readonly kind: "skill" | "agent";
  readonly missing: readonly ("name" | "description")[];
  readonly message: string;
}

/** A skill/agent whose `---` block exists but isn't valid YAML (may not parse as intended). */
export interface FrontmatterParseIssue {
  readonly path: string;
  readonly message: string;
}

/** An agent frontmatter field whose VALUE is invalid (a typo of a real model/color). */
export interface FrontmatterValueIssue {
  readonly path: string;
  readonly field: "model" | "color";
  readonly value: string;
  readonly suggestion: string;
  readonly message: string;
}

/** ok = file present; missing = referenced but absent; unresolved = path still has an unexpanded var, can't check. */
export type HookStatus = "ok" | "missing" | "unresolved";

export interface ScanHook {
  readonly script: string;
  readonly status: HookStatus;
}

/**
 * The repo's top-level instruction file (`CLAUDE.md` / `AGENTS.md`), if present.
 * Every cc/codex repo has one even when it ships no plugin surface, so `scan`
 * reports it — otherwise a plain instruction-only repo looks empty. `hasSpec` is
 * the deterministic fact that a `<file>.spec.ts` sits beside it (spec-managed vs
 * hand-written); it is informational, NOT the `require-spec` gate (that's lint).
 */
export interface ScanInstructions {
  readonly file: string;
  readonly hasSpec: boolean;
}

export interface ScanReport {
  readonly dir: string;
  /** The detected instruction file (CLAUDE.md/AGENTS.md), or null if none. */
  readonly instructions: ScanInstructions | null;
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
  /** Hooks registered under an event name the harness doesn't define (typo / dead). */
  readonly hookEventIssues: readonly HookEventIssue[];
  /** Skills/agents missing a required frontmatter field (name; agents also description). */
  readonly frontmatterIssues: readonly FrontmatterIssue[];
  /** Agent frontmatter fields with an invalid value (a typo of a real model/color). */
  readonly frontmatterValueIssues: readonly FrontmatterValueIssue[];
  /** Skills lacking an EXPLICIT name/description — a best-practice recommendation, not a defect. */
  readonly skillMetaIssues: readonly FrontmatterIssue[];
  /** Declared MCP servers that can't start (no command/url). */
  readonly mcpIssues: readonly McpIssue[];
  /** `type: mcp_tool` hook actions that are incomplete or target an undeclared server. */
  readonly mcpHookIssues: readonly McpHookIssue[];
  /** Pairs of model-invocable skills whose descriptions are near-identical (precision collision). */
  readonly descriptionOverlaps: readonly DescriptionOverlap[];
  /** Skills/agents whose `---` block isn't valid YAML — informational (may still load via salvage). */
  readonly malformedFrontmatter: readonly FrontmatterParseIssue[];
  readonly warnings: readonly string[];
  readonly untested: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const SCRIPT_RE = /\S+\.(?:sh|mjs|cjs|js|ts|py|rb)\b/g;

// The scalar fields scan reads from a skill/agent `---` block, via the shared
// lenient reader (core/frontmatter-read.ts) — a real YAML parse with a regex
// salvage on malformed input, so block scalars / multi-line quoted values parse
// for free and a bad block still yields what it can. One reader, no drift.
function frontmatter(md: string): {
  name?: string;
  description?: string;
  model?: string;
  color?: string;
} {
  const fm = readFrontmatter(md);
  return {
    name: frontmatterScalar(fm, "name"),
    description: frontmatterScalar(fm, "description"),
    model: frontmatterScalar(fm, "model"),
    color: frontmatterScalar(fm, "color"),
  };
}

/**
 * Per-kind surface classifiers, built from the harness `PluginLayout`'s
 * `skillDir`/`agentDir`/`commandDir` — so adding a harness whose subagents live
 * somewhere other than `agents/` (OpenCode's `.opencode/agent`) needs no change
 * here. Each anchors on a real path boundary (start-of-path or a `/`), so a
 * directory whose NAME merely ends in the keyword isn't misclassified — e.g. the
 * skill `skills/dispatching-parallel-agents/SKILL.md` must NOT register as an
 * agent named "SKILL" (the `-agents/` substring), which real plugins like
 * obra/superpowers ship. See scan.test.ts for the regression cases.
 */
export interface SurfaceClassifier {
  isSkill(f: string): boolean;
  isAgent(f: string): boolean;
  isCommand(f: string): boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeClassifier(layout: PluginLayout): SurfaceClassifier {
  // An empty dir means "this harness has no such surface" → never matches.
  const at = (dir: string): string | null =>
    dir ? `(?:^|/)${escapeRe(dir)}/` : null;
  const skill = at(layout.skillDir);
  const agent = at(layout.agentDir);
  const command = at(layout.commandDir);
  const skillRe = skill ? new RegExp(`${skill}[^/]+/SKILL\\.md$`) : null;
  const agentRe = agent ? new RegExp(`${agent}[^/]+\\.md$`) : null;
  const commandRe = command ? new RegExp(`${command}.+\\.md$`) : null;
  return {
    isSkill: (f) => skillRe?.test(f) ?? false,
    isAgent: (f) => (agentRe?.test(f) ?? false) && !f.endsWith(".spec.ts"),
    isCommand: (f) => commandRe?.test(f) ?? false,
  };
}

function skillName(path: string): string {
  return (
    path
      .replace(/\/SKILL\.md$/, "")
      .split("/")
      .pop() ?? path
  );
}

// [Unicode \p{Script=…} property value (Node native, no dependency), our Script
// label]. Japanese kana fold to "Japanese". Latin is the DEFAULT expectation (the
// selector is English-centric), but it's just a default — a language-matched pack
// can declare a different expectation, and then the OTHER script is the mismatch.
const SCRIPTS: readonly [string, Script][] = [
  ["Latin", "Latin"],
  ["Cyrillic", "Cyrillic"],
  ["Han", "Han"],
  ["Hiragana", "Japanese"],
  ["Katakana", "Japanese"],
  ["Hangul", "Korean"],
  ["Arabic", "Arabic"],
  ["Hebrew", "Hebrew"],
  ["Greek", "Greek"],
  ["Devanagari", "Devanagari"],
  ["Thai", "Thai"],
];

/** Letter counts per named script label (Japanese kana folded together). */
function scriptCounts(text: string): Map<Script, number> {
  const counts = new Map<Script, number>();
  for (const [script, label] of SCRIPTS) {
    const n = (text.match(new RegExp(`\\p{Script=${script}}`, "gu")) ?? [])
      .length;
    if (n > 0) counts.set(label, (counts.get(label) ?? 0) + n);
  }
  return counts;
}

/**
 * The description's dominant alphabetic script when it DIFFERS from `expected`
 * (default `"Latin"`) — the cross-language trigger-risk signal. The model's
 * skill-selection context is English-centric, so a description written mostly in
 * another script may under-fire on English prompts. `expected` is a configurable
 * default, not a value judgement: a Russian-targeted pack sets it to `"Cyrillic"`
 * so its Cyrillic descriptions pass and an English one is flagged instead.
 * Returns null when the dominant script IS the expected one (or there's no
 * alphabetic content). Shared by `scan` and the future lint rule (one detector,
 * no drift). The ≥20% guard avoids a near-empty string tripping on one letter.
 */
export function unexpectedScript(
  text: string,
  expected: Script = "Latin",
): Script | null {
  const counts = scriptCounts(text);
  let total = 0;
  let dominant: { label: Script; count: number } | null = null;
  for (const [label, count] of counts) {
    total += count;
    if (!dominant || count > dominant.count) dominant = { label, count };
  }
  if (!dominant || dominant.label === expected) return null;
  return dominant.count / total >= 0.2 ? dominant.label : null;
}

/**
 * The first prose paragraph of a SKILL.md body (after the frontmatter and any
 * leading `#` headings) — Claude Code's FALLBACK skill description when the
 * frontmatter omits `description`. Used so the trigger-surface check doesn't
 * overclaim "can't trigger" for a skill that has a usable body paragraph.
 */
function firstBodyParagraph(md: string): string | undefined {
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const para: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) {
      if (para.length > 0) break; // end of the first paragraph
      continue; // skip leading blanks / headings
    }
    para.push(t);
  }
  return para.join(" ").trim() || undefined;
}

function scanSkills(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): ScanSkill[] {
  const out: ScanSkill[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    const fm = frontmatter(md);
    // A skill's trigger surface is its frontmatter `description` OR — when that's
    // absent — Claude Code's fallback to the first body paragraph. Only when
    // NEITHER exists is the skill genuinely undescribed (can't be selected). The
    // explicit-frontmatter best-practice is the separate `skill-frontmatter` rule.
    const effectiveDesc = fm.description ?? firstBodyParagraph(md);
    out.push({
      name: fm.name ?? skillName(path),
      path,
      hasDescription: Boolean(effectiveDesc && effectiveDesc.length >= 20),
      userInvoked: /^\s*disable-model-invocation:\s*true\s*$/m.test(md),
      descriptionScript: effectiveDesc ? unexpectedScript(effectiveDesc) : null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Near-duplicate description pairs among the MODEL-INVOCABLE skills — the ones
 * that actually compete for auto-selection (a user-invoked skill is picked by
 * explicit command, so it can't collide). Uses the same effective-description
 * logic as `scanSkills` (frontmatter `description` ← first body paragraph), then
 * the NCD precision-proxy. See description-overlap.ts.
 */
function descriptionOverlapsFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): DescriptionOverlap[] {
  const surfaces: { name: string; description: string }[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    if (/^\s*disable-model-invocation:\s*true\s*$/m.test(md)) continue;
    const fm = frontmatter(md);
    const description = fm.description ?? firstBodyParagraph(md);
    if (!description || description.length < 20) continue;
    surfaces.push({ name: fm.name ?? skillName(path), description });
  }
  return findDescriptionOverlaps(surfaces);
}

function scanAgents(
  files: Record<string, string>,
  dialect: HarnessDialect,
  declaredServers: readonly string[],
  cls: SurfaceClassifier,
): ScanAgent[] {
  const out: ScanAgent[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue;
    const tools = parseAgentTools(md);
    out.push({
      name: basename(path, ".md"),
      path,
      tools,
      // Cross-reference the declared rail against the dialect catalog — the moat.
      // Auditing third-party plugins → only the HIGH-CONFIDENCE issues (never-
      // available + close typos); a bare unrecognized tool is likely plugin/MCP-
      // provided, not a defect (the TaskCreate/TaskGet lesson). See tool-contract.ts.
      toolIssues: tools
        ? confidentToolIssues(verifyToolContract(tools, dialect))
        : [],
      // The MCP half of the moat: an `mcp__server__tool` whose server isn't in the
      // plugin's declared set can't resolve. High-precision (gated on a declared
      // set, built-ins allowlisted, plugin-namespaced form skipped). See mcp-tool.ts.
      mcpToolIssues: tools
        ? verifyMcpToolServers(tools, declaredServers, dialect)
        : [],
      // The block-list mirror: a `disallowedTools:` entry that's a typo of a real
      // tool blocks nothing (close-typo only — high-precision). See tool-contract.ts.
      disallowedToolIssues: disallowedToolIssues(
        parseAgentToolList(md, "disallowedTools") ?? [],
        dialect,
      ),
    });
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
  const cleaned = token
    .replace(/["']/g, "")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
    .replaceAll("$CLAUDE_PLUGIN_ROOT", root);
  if (cleaned.includes("$")) return { script: token, status: "unresolved" };
  // A relative hook path (`./hooks/x.sh`, `scripts/x.py`) is the plugin's own —
  // resolve it against the PLUGIN ROOT, not the scanner's cwd. Without this, a
  // plugin that references `./hooks/x.sh` (the file IS present) was reported
  // MISSING because existsSync() checked cwd-relative (a false positive caught on
  // ananddtyagi/cc-marketplace). The displayed `script` stays as the author wrote it.
  const abs = isAbsolute(cleaned) ? cleaned : resolve(root, cleaned);
  return { script: cleaned, status: existsSync(abs) ? "ok" : "missing" };
}

// A shell existence guard around a command — `[ ! -f x ] || x`, `[ -f x ] && x`,
// `test -f x && …`. Authors use it to make a hook OPTIONAL (run the script only
// if present; a no-op otherwise — e.g. a runtime-generated guard), so a missing
// target is INTENTIONAL, not a broken reference. Don't flag scripts in such a
// command as MISSING (a false positive caught on gmickel/flow-next's ralph-guard).
const EXISTENCE_GUARD =
  /(?:\[\[?\s*!?\s*-[efsx]\s)|(?:\btest\s+!?\s*-[efsx]\s)/;

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
    // A guarded command runs its script only if it exists — an optional hook, not
    // a broken one. Treat it as a conditional one-liner (inline), don't path-check.
    if (EXISTENCE_GUARD.test(unescaped)) {
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

/**
 * Frontmatter-schema check — **subagents only**. Per the Claude Code docs, a
 * subagent (`agents/*.md`) REQUIRES `name` + `description` (no fallback) or it
 * won't register. A SKILL.md requires NOTHING: `name` falls back to the directory
 * name and `description` to the first body paragraph, so a frontmatter-less skill
 * still loads — flagging it would be a false positive (skill description QUALITY
 * is a separate, behavioral concern). See https://code.claude.com/docs/en/skills
 * and …/sub-agents.
 */
function frontmatterIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterIssue[] {
  const out: FrontmatterIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue; // skills require no frontmatter (dir/body fallbacks)
    const fm = frontmatter(md);
    const missing: ("name" | "description")[] = [];
    if (!fm.name) missing.push("name");
    if (!fm.description) missing.push("description");
    if (missing.length === 0) continue;
    out.push({
      path,
      kind: "agent",
      missing,
      message: `agent ${path} is missing required frontmatter: ${missing.join(", ")} — it won't register.`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// The canonical subagent `model:` aliases and `color:` enum (Claude Code). The
// model check skips a full/dated id (`claude-sonnet-4-5`) — that's a valid
// explicit form, not a typo — so only an alias misspelling is caught.
const MODEL_ALIASES = ["inherit", "sonnet", "opus", "haiku"];
const AGENT_COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan",
];

/**
 * Closest candidate by edit distance, ONLY when it's a high-confidence typo: the
 * value isn't already a candidate, and the nearest is within 2 edits. Returns
 * null otherwise — a far-off value is more likely an unknown-we-don't-know than a
 * typo (the high-precision discipline), so it's suppressed, not flagged.
 */
function closeCandidate(
  value: string,
  candidates: readonly string[],
): string | null {
  const v = value.toLowerCase();
  if (candidates.includes(v)) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const dist = editDistance(v, c);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = c;
    }
  }
  return bestDistance > 0 && bestDistance <= 2 ? best : null;
}

/**
 * Agent frontmatter VALUE validity — a `model:` or `color:` that's a close typo
 * of a real one. A bad `model:` silently falls back; a bad `color:` is ignored.
 * High-precision (close-typo only); a full/dated model id is left alone. Folded
 * into the `subagent-frontmatter` rule. Agents only (skills have no model/color).
 */
function frontmatterValueIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterValueIssue[] {
  const out: FrontmatterValueIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue;
    const fm = frontmatter(md);
    // A model id with a digit/hyphen is an explicit form, not an alias typo.
    if (fm.model && !/[0-9-]/.test(fm.model)) {
      const near = closeCandidate(fm.model, MODEL_ALIASES);
      if (near) {
        out.push({
          path,
          field: "model",
          value: fm.model,
          suggestion: near,
          message: `agent ${path} has model "${fm.model}", not a known alias — it silently falls back. Did you mean "${near}"?`,
        });
      }
    }
    if (fm.color) {
      const near = closeCandidate(fm.color, AGENT_COLORS);
      if (near) {
        out.push({
          path,
          field: "color",
          value: fm.color,
          suggestion: near,
          message: `agent ${path} has color "${fm.color}", not a valid color — it's ignored. Did you mean "${near}"?`,
        });
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Frontmatter that EXISTS but isn't valid YAML — the `frontmatter-valid` signal.
 * Reported for skills + agents via the shared reader's `malformed` flag. Honest
 * caveat (see docs/rules/frontmatter-valid.md): js-yaml is stricter than some
 * loaders, so a one-line `description:` containing a `: ` colon or an `<example>`
 * block is flagged even though it may still load — which is why scan surfaces it
 * as an informational note (NOT a structural defect) and the lint rule is a
 * warn, not an error. The file's other fields are still salvaged.
 */
function malformedFrontmatterFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterParseIssue[] {
  const out: FrontmatterParseIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path) && !cls.isAgent(path)) continue;
    if (!readFrontmatter(md).malformed) continue;
    out.push({
      path,
      message: `${path}: frontmatter is not valid YAML — fields may not parse as intended (a colon, quote, or bracket likely needs escaping/quoting).`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Skill-metadata RECOMMENDATION (not a correctness check): a `SKILL.md` loads
 * fine without frontmatter (`name` ← dir, `description` ← first body paragraph),
 * but relying on those fallbacks is fragile — the dir name may be unclear and the
 * first paragraph is often a heading or boilerplate, making a weak trigger
 * surface. Best practice is an EXPLICIT `name` + `description`. Flags skills
 * missing either; surfaced as a soft note in scan (NOT a structural defect, NOT
 * scored) and gated by the `skill-frontmatter` lint rule (warn by default).
 */
function skillMetaIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterIssue[] {
  const out: FrontmatterIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    const fm = frontmatter(md);
    const missing: ("name" | "description")[] = [];
    if (!fm.name) missing.push("name");
    if (!fm.description) missing.push("description");
    if (missing.length === 0) continue;
    out.push({
      path,
      kind: "skill",
      missing,
      message: `skill ${path} has no explicit frontmatter ${missing.join(" / ")} — recommended for a reliable trigger surface (it still loads via the dir-name / first-paragraph fallback).`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Collect declared MCP servers from the JSON sources (`.mcp.json` + the plugin
 * manifest's `mcpServers`). Codex's TOML `[mcp_servers]` isn't parsed here (a
 * documented gap); the JSON CC shape is the common case. Merged so a server
 * defined in both sources appears once. Shared by the `mcp-config` check (does
 * each server start?) and `mcp-tool-resolves` (is each referenced server here?).
 */
function collectMcpServers(
  root: string,
  layout: PluginLayout,
): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  const collect = (file: string): void => {
    const p = join(root, file);
    if (!existsSync(p)) return;
    try {
      const parsed = JSON.parse(readFileSync(p, "utf-8")) as {
        mcpServers?: unknown;
      };
      if (parsed.mcpServers !== null && typeof parsed.mcpServers === "object") {
        Object.assign(servers, parsed.mcpServers);
      }
    } catch {
      /* malformed JSON is the loader's concern, not this check's */
    }
  };
  collect(".mcp.json");
  collect(layout.manifestPath);
  return servers;
}

/** Scan a plugin/repo directory and report its surfaces + structural issues. */
export function scanPlugin(
  dir: string,
  layout?: PluginLayout,
  dialect: HarnessDialect = claudeCodeDialect,
): ScanReport {
  const lay = layout ?? claudeCodeLayout;
  const cls = makeClassifier(lay);
  const loaded = loadPlugin(dir, lay);
  const { hooks, inline } = scanHooks(loaded.settings, resolve(dir));
  // Hook-event keys are a CLOSED platform set — an unrecognized one is a dead
  // registration (the hook never fires), so flag every unknown (not just typos).
  // ONLY for the canonical object-keyed-by-event shape: a plugin shipping a
  // hooks ARRAY uses a non-CC/custom format whose events live INSIDE each entry
  // (e.g. ananddtyagi/sugar's `[{event:"tool-use",…}]`) — Object.keys would read
  // array INDICES, a false positive. We don't interpret a format we don't own.
  const hooksObj = loaded.settings.hooks;
  const eventNames =
    hooksObj !== null &&
    typeof hooksObj === "object" &&
    !Array.isArray(hooksObj)
      ? Object.keys(hooksObj as Record<string, unknown>)
      : [];
  const hookEventIssues = confidentHookEventIssues(
    verifyHookEvents(eventNames, dialect),
  );
  const instructions: ScanInstructions | null =
    loaded.files[lay.instructionFile] !== undefined
      ? {
          file: lay.instructionFile,
          hasSpec: existsSync(
            join(resolve(dir), `${lay.instructionFile}.spec.ts`),
          ),
        }
      : null;
  const mcpServers = collectMcpServers(resolve(dir), lay);
  const declaredServers = Object.keys(mcpServers);
  return {
    dir,
    instructions,
    skills: scanSkills(loaded.files, cls),
    agents: scanAgents(loaded.files, dialect, declaredServers, cls),
    hooks,
    inlineHooks: inline,
    commands: Object.keys(loaded.files).filter(cls.isCommand).length,
    mcp: loaded.warnings.some((w) => w.includes("MCP server")),
    danglingRefs: danglingRefs(resolve(dir), lay),
    hookEventIssues,
    frontmatterIssues: frontmatterIssuesFor(loaded.files, cls),
    frontmatterValueIssues: frontmatterValueIssuesFor(loaded.files, cls),
    skillMetaIssues: skillMetaIssuesFor(loaded.files, cls),
    mcpIssues: verifyMcpServers(mcpServers),
    mcpHookIssues: verifyMcpHookTargets(
      loaded.settings.hooks,
      declaredServers,
      dialect,
    ),
    descriptionOverlaps: descriptionOverlapsFor(loaded.files, cls),
    malformedFrontmatter: malformedFrontmatterFor(loaded.files, cls),
    warnings: loaded.warnings,
    untested: findUntestedSurfaces({ basePath: dir }).untested.length,
  };
}

/**
 * A plugin MARKETPLACE (`.claude-plugin/marketplace.json`) decomposed into its
 * members. A marketplace either VENDORS its plugins in-tree (string `source`
 * paths, e.g. wshobson/agents — `onDisk` populated) or CURATES external ones
 * (object `source` with a git/url, e.g. obra/superpowers-marketplace,
 * anthropics/claude-plugins-community — `external` populated, nothing on disk).
 * Distinguishing the two lets `scan` report a curated marketplace honestly
 * instead of mistaking it for an empty repo.
 */
export interface MarketplaceInfo {
  readonly name: string;
  /** Member plugin dirs that exist on disk (string `source` paths). */
  readonly onDisk: readonly string[];
  /** Members referencing an off-disk source (url/git/github) — can't be scanned here. */
  readonly external: number;
  readonly total: number;
}

/**
 * Read a `marketplace.json` beside the layout's plugin manifest and classify its
 * members into on-disk vs external. Returns `null` when `dir` is not a
 * marketplace. The source of truth behind {@link expandMarketplace} and the
 * curated-marketplace report in `vigiles scan`.
 */
export function inspectMarketplace(
  dir: string,
  layout: PluginLayout = claudeCodeLayout,
): MarketplaceInfo | null {
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
  const name = (parsed as { name?: unknown }).name;
  // Dedupe by resolved path: a marketplace may map several named entries to the
  // SAME plugin dir (TheBushidoCollective/han aliases 338 names onto 159 dirs).
  // Scanning a dir twice is pure noise, so each on-disk member counts once.
  const onDisk: string[] = [];
  const seen = new Set<string>();
  let external = 0;
  for (const entry of plugins) {
    const source = (entry as { source?: unknown }).source;
    if (typeof source !== "string") {
      external++; // external plugin (url/git/github object), not on disk
      continue;
    }
    const abs = resolve(dir, source);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      if (!seen.has(abs)) {
        seen.add(abs);
        onDisk.push(abs);
      }
    } else {
      external++; // a string source that doesn't resolve on disk
    }
  }
  return {
    name: typeof name === "string" ? name : basename(dir),
    onDisk,
    external,
    total: plugins.length,
  };
}

/**
 * If `dir` is a plugin MARKETPLACE (a `marketplace.json` beside the layout's
 * plugin manifest, e.g. `.claude-plugin/marketplace.json`), expand it into the
 * absolute dirs of its member plugins. Returns `null` when there's no
 * marketplace, `[]` when it's a marketplace whose members are all external (not
 * on disk). Used by `vigiles scan` to rank a whole marketplace — wshobson/agents
 * alone ships 80+ plugins under one `marketplace.json`. See {@link inspectMarketplace}.
 */
export function expandMarketplace(
  dir: string,
  layout: PluginLayout = claudeCodeLayout,
): string[] | null {
  const mp = inspectMarketplace(dir, layout);
  return mp ? [...mp.onDisk] : null;
}

// `count` defaults to the number of lines, but a section whose entries span
// multiple lines (Agents: a header + indented issue lines; Hooks: file hooks +
// an inline-summary line) passes the real entity count so the header isn't
// inflated by sub-lines.
function section(
  title: string,
  lines: readonly string[],
  count: number = lines.length,
): string[] {
  if (lines.length === 0) return [];
  return [`${title} (${String(count)}):`, ...lines, ""];
}

/** One skill's report line: ✓/⚠ + name + notes (no-trigger, user-invoked, language risk). */
function skillLine(s: ScanSkill): string {
  if (!s.hasDescription) {
    return `  ⚠ ${s.name} (no usable description — no frontmatter description and no body text — can't trigger)`;
  }
  const notes: string[] = [];
  if (s.userInvoked) notes.push("user-invoked");
  if (s.descriptionScript) {
    notes.push(
      `description in ${s.descriptionScript} — cross-language trigger risk`,
    );
  }
  const mark = s.descriptionScript ? "⚠" : "✓";
  return `  ${mark} ${s.name}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

/** One agent's report block: ✗ (broken contract) / ⚠ (inherits all) / ✓ + issues. */
function agentLines(a: ScanAgent): string[] {
  const tools =
    a.tools === null
      ? "tools: (inherits all — no contract)"
      : `tools: ${a.tools.join(", ") || "(none)"}`;
  const broken =
    a.toolIssues.length +
    a.mcpToolIssues.length +
    a.disallowedToolIssues.length;
  let mark = "✓";
  if (broken > 0) mark = "✗";
  else if (a.tools === null) mark = "⚠";
  const lines = [`  ${mark} ${a.name} — ${tools}`];
  for (const issue of a.toolIssues) lines.push(`      ✗ ${issue.message}`);
  for (const issue of a.mcpToolIssues) lines.push(`      ✗ ${issue.message}`);
  for (const issue of a.disallowedToolIssues)
    lines.push(`      ✗ ${issue.message}`);
  return lines;
}

/** Format a scan report as human-readable text. */
export function formatScanReport(r: ScanReport): string {
  const out: string[] = [`Scan: ${r.dir}`, ""];

  if (r.instructions) {
    const tag = r.instructions.hasSpec
      ? "spec-managed"
      : "hand-written, no spec";
    out.push(`Instructions: ${r.instructions.file} (${tag})`, "");
  }

  out.push(...section("Skills", r.skills.map(skillLine)));

  out.push(...section("Agents", r.agents.flatMap(agentLines), r.agents.length));

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
  out.push(...section("Hooks", hookLines, r.hooks.length + r.inlineHooks));

  out.push(
    ...section(
      "Broken references",
      r.danglingRefs.map((ref) => `  ✗ ${ref} (referenced but MISSING)`),
    ),
  );

  out.push(
    ...section(
      "Hook events",
      r.hookEventIssues.map((i) => `  ✗ ${i.message}`),
    ),
  );

  out.push(
    ...section("Frontmatter", [
      ...r.frontmatterIssues.map((i) => `  ✗ ${i.message}`),
      ...r.frontmatterValueIssues.map((i) => `  ✗ ${i.message}`),
    ]),
  );

  out.push(
    ...section(
      "MCP config",
      r.mcpIssues.map((i) => `  ✗ ${i.message}`),
    ),
  );

  out.push(
    ...section(
      "MCP hook targets",
      r.mcpHookIssues.map((i) => `  ✗ ${i.message}`),
    ),
  );

  out.push(
    ...section(
      "Description overlap (precision risk)",
      r.descriptionOverlaps.map((o) => `  ⚠ ${o.message}`),
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

  // Cross-language trigger risk is a RISK, not a structural defect (a
  // language-matched audience is fine), so it's reported separately from the
  // verdict — it points at the behavioral column, it doesn't fail the scan.
  const mismatched = r.skills.filter((s) => s.descriptionScript);
  if (mismatched.length > 0) {
    out.push(
      `⚠ ${String(mismatched.length)} skill(s) have descriptions in an unexpected script (cross-language trigger risk) — measure with \`scan --trigger\``,
      "",
    );
  }

  // Skill-metadata is a RECOMMENDATION, not a structural defect (the skill loads
  // via fallbacks) — reported as a soft note, never counted in the verdict.
  if (r.skillMetaIssues.length > 0) {
    out.push(
      `ℹ ${String(r.skillMetaIssues.length)} skill(s) lack an explicit frontmatter name/description (recommended for a reliable trigger surface) — they still load via fallback`,
      "",
    );
  }

  // Malformed-YAML frontmatter is INFORMATIONAL, not a structural defect: js-yaml
  // is stricter than some loaders (a colon/quote/<example> in a one-line
  // description trips it though the file may still load), and the other fields are
  // salvaged. Surfaced as a note; the frontmatter-valid lint rule warns on it.
  if (r.malformedFrontmatter.length > 0) {
    out.push(
      `ℹ ${String(r.malformedFrontmatter.length)} file(s) have frontmatter that isn't valid YAML — fields may not parse as intended (verify before enforcing \`frontmatter-valid\`)`,
      "",
    );
  }

  const broken =
    r.hooks.filter((h) => h.status === "missing").length +
    r.skills.filter((s) => !s.hasDescription).length +
    r.agents.reduce(
      (n, a) =>
        n +
        a.toolIssues.length +
        a.mcpToolIssues.length +
        a.disallowedToolIssues.length,
      0,
    ) +
    r.danglingRefs.length +
    r.hookEventIssues.length +
    r.frontmatterIssues.length +
    r.frontmatterValueIssues.length +
    r.mcpIssues.length +
    r.mcpHookIssues.length;
  out.push(
    broken === 0
      ? "✓ no structural issues found"
      : `⚠ ${String(broken)} structural issue(s) — see ✗/⚠ above`,
  );
  return out.join("\n");
}
