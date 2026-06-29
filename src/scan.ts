/**
 * `vigiles audit <dir>` — point vigiles at any plugin/repo and see what it ships
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
import {
  verifyMcpContractTools,
  mcpContractToolMessage,
  type McpContractToolError,
  type McpServerConfig,
} from "./core/mcp.js";
import { verifyMcpHookTargets, type McpHookIssue } from "./core/mcp-hook.js";
import {
  lethalTrifectaIssues,
  type TrifectaFinding,
} from "./core/lethal-trifecta.js";
import {
  skillResourceIssues,
  type SkillResourceFinding,
} from "./core/skill-resources.js";
import {
  parseAgentTools,
  parseAgentToolList,
} from "./adapters/claude-code/agent-runtime.js";
import { findUntestedSurfaces } from "./test-coverage.js";
import {
  effectSurface,
  type PurityLevel,
  type EffectSurface,
} from "./core/effects.js";

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
  /**
   * The skill's effective description (frontmatter `description`, else the first
   * body paragraph — the same text the selector keys on), trimmed; `undefined`
   * when neither exists. Feeds the model trigger tier's auto-generated probes.
   */
  readonly description?: string;
  readonly userInvoked: boolean;
  /**
   * The description's dominant script when it DIFFERS from the expected one
   * (default `"Latin"`), else null. The model's skill-selection context is
   * English-centric, so a description in another script carries a cross-language
   * trigger risk — it may under-fire on English prompts. A RISK flag, not a
   * defect (a language-matched audience is fine); measure the real gap with the
   * `audit` trigger tier / `measureTriggerRate`.
   */
  readonly descriptionScript: Script | null;
  /**
   * SKILL.md body references to a bundled file (`scripts/`/`references/`/`assets/`
   * or a relative markdown link with an extension) that don't resolve on disk
   * under the skill dir — the agent reads the instruction and gets nothing.
   * Computed by `skillResourceIssues()` (one detector, no drift).
   */
  readonly resourceIssues: readonly SkillResourceFinding[];
  /**
   * Lethal-trifecta finding when a MODEL-INVOCABLE skill's declared `allowed-tools`
   * hold all three legs (read-private + ingest-untrusted + exfiltrate), else null.
   * A user-invoked skill is excluded (it can't be selected by attacker content).
   * Computed by `lethalTrifectaIssues()` (one detector, no drift).
   */
  readonly trifecta: TrifectaFinding | null;
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
  /**
   * Static effect-surface purity of the agent's declared tool contract.
   * - `"pure"` — no side-effecting tools (read-only, deterministically testable).
   * - `"bounded"` — has side-effecting tools (Edit/Write/…) but no Bash or unknown.
   * - `"unrestricted"` — has Bash, any MCP/unknown tool, or inherits-all (no contract).
   * Computed by `effectSurface()` from `src/core/effects.ts` — one detector, no drift.
   */
  readonly purity: PurityLevel;
  /**
   * The three tool buckets from `effectSurface()`: read-only, side-effecting, and
   * unknown-effect (MCP or unrecognized) tool names in the declared contract.
   */
  readonly effectBuckets: Pick<
    EffectSurface,
    "readOnly" | "sideEffecting" | "unknown"
  >;
  /**
   * Lethal-trifecta finding when the subagent's declared tools hold all three legs
   * (read-private + ingest-untrusted + exfiltrate), else null. An inherits-all
   * agent (no `tools:` line) is the "advisory" case. Computed by
   * `lethalTrifectaIssues()` (one detector, no drift).
   */
  readonly trifecta: TrifectaFinding | null;
}

/** A lethal-trifecta finding tagged with the surface (subagent/skill) that holds it. */
export interface ScanTrifectaFinding {
  readonly path: string;
  readonly kind: "subagent" | "skill";
  readonly name: string;
  readonly finding: TrifectaFinding;
}

/** A SKILL.md body resource reference that doesn't resolve, tagged with the skill path. */
export interface ScanSkillResourceFinding {
  readonly path: string;
  readonly name: string;
  readonly finding: SkillResourceFinding;
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
  /**
   * The full hook command as it would be run (plugin-root token expanded, shell
   * quotes stripped). Present on script-based hooks; empty string on hooks whose
   * command is entirely inline (no script file) — but inline hooks never appear
   * in `hooks[]`, they are counted by `inlineHooks`, so in practice `command` is
   * always non-empty when a `ScanHook` is in the list.
   */
  readonly command: string;
  readonly script: string;
  readonly status: HookStatus;
  /**
   * The hook EVENT this script is registered under (`PreToolUse`, `PostToolUse`,
   * `SessionStart`, …), when it can be determined from the canonical
   * object-keyed-by-event settings shape; `undefined` for a non-object/array
   * config. The safety battery uses it to test only the blocking-capable
   * `PreToolUse` guards — so a `SessionStart`/`PostToolUse` hook isn't unfairly
   * scored against "does it block rm -rf".
   */
  readonly event?: string;
}

/**
 * The repo's top-level instruction file (`CLAUDE.md` / `AGENTS.md`), if present.
 * Every cc/codex repo has one even when it ships no plugin surface, so `scan`
 * reports it — otherwise a plain instruction-only repo looks empty. `hasSpec` is
 * the deterministic fact that a `<file>.spec.ts` sits beside it (spec-managed vs
 * hand-written); it is informational, NOT the `require-instructions-spec` gate (that's lint).
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
  /**
   * Hand-written hook commands that are NOT compiled `vigiles/hook` artifacts (a
   * compiled hook's command invokes `vigiles hook-runtime run-program`). The basis
   * for the `prefer-compiled-hooks` recommendation — a single nudge regardless of
   * count. Zero when there are no hooks or every hook is vigiles-managed.
   */
  readonly manualHookCount: number;
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
  /**
   * Lethal-trifecta findings across subagents + model-invocable skills — a unit
   * holding all three legs (read-private + ingest-untrusted + exfiltrate). Each
   * carries the surface path + kind for reporting/annotations. Shared by `scan`
   * (the report) and the `lethal-trifecta` lint rule (one detector, no drift).
   */
  readonly trifectaFindings: readonly ScanTrifectaFinding[];
  /**
   * SKILL.md body references to a bundled resource that doesn't resolve on disk,
   * across all skills — each carries the skill path for reporting/annotations.
   * Shared by `scan` and the `skill-resource-resolves` lint rule (one detector, no
   * drift).
   */
  readonly skillResourceIssues: readonly ScanSkillResourceFinding[];
  /** Skills/agents whose `---` block isn't valid YAML — informational (may still load via salvage). */
  readonly malformedFrontmatter: readonly FrontmatterParseIssue[];
  readonly warnings: readonly string[];
  readonly untested: number;
  /**
   * Harness-level purity summary: how many scanned agents fall into each purity
   * rung. A high `pure` count means more of the harness is statically testable
   * (deterministic, no mocks); `unrestricted` is the blind-spot count.
   * Computed by `effectSurface()` (one detector, no drift).
   */
  readonly puritySummary: {
    pure: number;
    bounded: number;
    unrestricted: number;
  };
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
  readonly isSkill: (f: string) => boolean;
  readonly isAgent: (f: string) => boolean;
  readonly isCommand: (f: string) => boolean;
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
  // A subagent lives at the plugin's TOP-LEVEL `agents/` dir (e.g. `agents/foo.md`
  // or `.claude/agents/foo.md`), never recursively under ANOTHER surface dir. Two
  // real-world nesting traps are excluded as false positives:
  //   - `skills/<x>/agents/…` — skill-internal worker docs (Anthropic's skill-creator)
  //   - `commands/agents/…`   — a COMMAND namespaced `/agents:…` (ruvnet/claude-flow),
  //     incl. a `README.md`; these are commands, not dispatchable subagents.
  // Flagging either as a subagent missing frontmatter is a false positive (it
  // mis-graded a real plugin F). A genuine top-level `agents/foo.md` still
  // matches. Both excluded dirs are read from the layout (adapter-agnostic). See
  // scan.test.ts for the regressions.
  const nestedUnder = [
    layout.skillDir &&
      `${escapeRe(layout.skillDir)}/.+/${escapeRe(layout.agentDir)}/`,
    layout.commandDir &&
      `${escapeRe(layout.commandDir)}/(?:.+/)?${escapeRe(layout.agentDir)}/`,
  ].filter((x): x is string => Boolean(x));
  const nestedAgentRe =
    layout.agentDir && nestedUnder.length
      ? new RegExp(`(?:^|/)(?:${nestedUnder.join("|")})`)
      : null;
  const isAgent = (f: string): boolean =>
    (agentRe?.test(f) ?? false) &&
    !f.endsWith(".spec.ts") &&
    !(nestedAgentRe?.test(f) ?? false);
  return {
    isSkill: (f) => skillRe?.test(f) ?? false,
    isAgent,
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

/** The body of a SKILL.md with the leading `---` frontmatter block stripped. */
function skillBody(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * The on-disk path for a materialized file key. `loadPlugin` prefixes each
 * surface file with the layout's `materializeRoot` (e.g. `.claude/`), but the file
 * lives on disk WITHOUT that prefix (under the real surface dir), so a
 * bundled-resource existence check must strip it back off. Mirrors how
 * `resolveScript` resolves a hook path against the real plugin root.
 */
function onDiskPath(materializedKey: string, materializeRoot: string): string {
  if (!materializeRoot) return materializedKey;
  const prefix = `${materializeRoot}/`;
  return materializedKey.startsWith(prefix)
    ? materializedKey.slice(prefix.length)
    : materializedKey;
}

/** The plugin-root + materialize-root + dialect context skill scanning needs. */
interface SkillScanContext {
  readonly root: string;
  readonly materializeRoot: string;
  readonly dialect: HarnessDialect;
}

function scanSkills(
  files: Record<string, string>,
  cls: SurfaceClassifier,
  ctx: SkillScanContext,
): ScanSkill[] {
  const { root, materializeRoot, dialect } = ctx;
  const out: ScanSkill[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    const fm = frontmatter(md);
    // A skill's trigger surface is its frontmatter `description` OR — when that's
    // absent — Claude Code's fallback to the first body paragraph. Only when
    // NEITHER exists is the skill genuinely undescribed (can't be selected). The
    // explicit-frontmatter best-practice is the separate `skill-frontmatter` rule.
    const effectiveDesc = fm.description ?? firstBodyParagraph(md);
    const userInvoked = /^\s*disable-model-invocation:\s*true\s*$/m.test(md);
    // Bundled-resource refs resolve against the skill's OWN dir (resources ship
    // beside the SKILL.md), built from the plugin root + the file's ON-DISK dir
    // (the materialize-root prefix the loader added is stripped back off).
    const skillDir = resolve(root, dirname(onDiskPath(path, materializeRoot)));
    const resourceIssues = skillResourceIssues(skillBody(md), skillDir);
    // The lethal trifecta is a property of what a unit CAN do, which for a skill is
    // its declared `allowed-tools` (the CC skill tool contract). Only a model-
    // invocable skill can be hijacked by attacker content, so a user-invoked one is
    // excluded. A skill with no `allowed-tools` line inherits all → advisory.
    const skillTools = parseAgentToolList(md, "allowed-tools");
    const trifecta = userInvoked
      ? null
      : lethalTrifectaIssues(skillTools ?? [], dialect);
    out.push({
      name: fm.name ?? skillName(path),
      path,
      hasDescription: Boolean(effectiveDesc && effectiveDesc.length >= 20),
      description: effectiveDesc?.trim(),
      userInvoked,
      descriptionScript: effectiveDesc ? unexpectedScript(effectiveDesc) : null,
      resourceIssues,
      trifecta,
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
    // An inherits-all agent (no `tools:` line) grants access to every tool
    // including every side-effecting one — pass the wildcard sentinel so
    // effectSurface correctly classifies it as `"unrestricted"`.
    const surface = effectSurface(tools ?? ["*"], dialect);
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
      purity: surface.purity,
      effectBuckets: {
        readOnly: surface.readOnly,
        sideEffecting: surface.sideEffecting,
        unknown: surface.unknown,
      },
      // The lethal trifecta: a subagent whose contract grants all three legs. An
      // inherits-all agent (tools === null → empty list here) is the advisory case
      // that `lethalTrifectaIssues` handles. One detector, no drift.
      trifecta: lethalTrifectaIssues(tools ?? [], dialect),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a hook script token to a checkable path. `loadPlugin` expands the
 * braced plugin-root token (`${CLAUDE_PLUGIN_ROOT}`, Codex `${PLUGIN_ROOT}`, …);
 * the unbraced shell form survives, so resolve BOTH forms of the HARNESS's token
 * (from the layout, not hard-coded) against the plugin root and strip shell
 * quotes. A token that still carries any `$VAR` after that is genuinely
 * uncheckable.
 */
function resolveScript(
  token: string,
  root: string,
  pluginRootToken: string,
  fullCommand: string,
): ScanHook {
  // "${CLAUDE_PLUGIN_ROOT}" → unbraced "$CLAUDE_PLUGIN_ROOT".
  const unbraced = pluginRootToken.replace(/^\$\{(.+)\}$/, "$$$1");
  const cleaned = token
    .replace(/["']/g, "")
    .replaceAll(pluginRootToken, root)
    .replaceAll(unbraced, root);
  if (cleaned.includes("$"))
    return { command: fullCommand, script: token, status: "unresolved" };
  // A relative hook path (`./hooks/x.sh`, `scripts/x.py`) is the plugin's own —
  // resolve it against the PLUGIN ROOT, not the scanner's cwd. Without this, a
  // plugin that references `./hooks/x.sh` (the file IS present) was reported
  // MISSING because existsSync() checked cwd-relative (a false positive caught on
  // ananddtyagi/cc-marketplace). The displayed `script` stays as the author wrote it.
  const abs = isAbsolute(cleaned) ? cleaned : resolve(root, cleaned);
  // Resolve the full command the same way we resolve the script token (expand
  // plugin-root, strip outer quotes) so the CLI can pass it to verifyGuardrail.
  const resolvedCommand = fullCommand
    .replaceAll(pluginRootToken, root)
    .replaceAll(unbraced, root);
  return {
    command: resolvedCommand,
    script: cleaned,
    status: existsSync(abs) ? "ok" : "missing",
  };
}

// A shell existence guard around a command — `[ ! -f x ] || x`, `[ -f x ] && x`,
// `test -f x && …`. Authors use it to make a hook OPTIONAL (run the script only
// if present; a no-op otherwise — e.g. a runtime-generated guard), so a missing
// target is INTENTIONAL, not a broken reference. Don't flag scripts in such a
// command as MISSING (a false positive caught on gmickel/flow-next's ralph-guard).
const EXISTENCE_GUARD =
  /(?:\[\[?\s*!?\s*-[efsx]\s)|(?:\btest\s+!?\s*-[efsx]\s)/;

/**
 * A compiled `vigiles/hook` artifact runs through the `hook-runtime run-program`
 * runtime entrypoint; any other hook command is hand-written (a shell script or
 * an inline one-liner) the author maintains directly. The basis for the
 * `prefer-compiled-hooks` nudge.
 */
export function isManagedHookCommand(command: string): boolean {
  return /\bhook-runtime\b/.test(command);
}

/** The `prefer-compiled-hooks` recommendation message (shared by `lint` + `scan`). */
export function preferCompiledHooksMessage(count: number): string {
  return (
    `${String(count)} hand-written hook command(s) — if any gate the agent ` +
    `(a block/deny decision), compiled hooks (\`vigiles/hook\`) make whole hook ` +
    `bug classes unrepresentable at authoring time, and \`guardrail-check\` proves ` +
    `an existing one blocks. See docs/compiled-hooks.md.`
  );
}

/** Pull script-file hook commands out of the resolved settings; count inline ones. */
/**
 * Best-effort map of each script token → the hook EVENT it's registered under,
 * by walking the canonical object-keyed-by-event settings shape
 * (`{ PreToolUse: [{ hooks: [{ command }] }], … }`). Lets the safety battery
 * scope itself to `PreToolUse` (the only event that can block a tool call), so a
 * `SessionStart`/`PostToolUse`/`Stop` hook isn't tested against the disaster
 * catalog. Returns an empty map for a non-object/array config (event → unknown).
 */
function eventsByScript(hooks: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return map;
  for (const [event, arr] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      const hookList = (entry as { hooks?: unknown }).hooks;
      if (!Array.isArray(hookList)) continue;
      for (const h of hookList) {
        const cmd = (h as { command?: unknown }).command;
        if (typeof cmd !== "string") continue;
        for (const tok of cmd.match(SCRIPT_RE) ?? []) {
          if (!map.has(tok)) map.set(tok, event);
        }
      }
    }
  }
  return map;
}

function scanHooks(
  settings: { hooks?: unknown },
  root: string,
  pluginRootToken: string,
): { hooks: ScanHook[]; inline: number; manual: number } {
  const text = JSON.stringify(settings.hooks ?? {});
  const commands = [...text.matchAll(/"command":\s*"((?:[^"\\]|\\.)*)"/g)].map(
    (m) => m[1],
  );
  const evMap = eventsByScript(settings.hooks);
  // A hand-written hook is any non-empty command that isn't a vigiles-managed
  // (compiled) hook-runtime invocation — the basis for the prefer-compiled-hooks nudge.
  const manual = commands.filter((c) => {
    const u = c.replace(/\\(.)/g, "$1").trim();
    return u !== "" && !isManagedHookCommand(u);
  }).length;
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
      const hook = resolveScript(tok, root, pluginRootToken, unescaped);
      const event = evMap.get(tok);
      byScript.set(hook.script, event ? { ...hook, event } : hook);
    }
  }
  const hooks = [...byScript.values()].sort((a, b) =>
    a.script.localeCompare(b.script),
  );
  return { hooks, inline, manual };
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

/**
 * Flatten the per-surface lethal-trifecta + skill-resource findings into the
 * path-tagged report lists the `audit` report AND the `lethal-trifecta` /
 * `skill-resource-resolves` lint rules both consume (one detector, no drift).
 */
function collectSurfaceFindings(
  agents: readonly ScanAgent[],
  skills: readonly ScanSkill[],
): {
  trifectaFindings: ScanTrifectaFinding[];
  skillResourceFindings: ScanSkillResourceFinding[];
} {
  const trifectaFindings: ScanTrifectaFinding[] = [];
  for (const a of agents) {
    if (a.trifecta) {
      trifectaFindings.push({
        path: a.path,
        kind: "subagent",
        name: a.name,
        finding: a.trifecta,
      });
    }
  }
  for (const s of skills) {
    if (s.trifecta) {
      trifectaFindings.push({
        path: s.path,
        kind: "skill",
        name: s.name,
        finding: s.trifecta,
      });
    }
  }
  const skillResourceFindings: ScanSkillResourceFinding[] = skills.flatMap(
    (s) =>
      s.resourceIssues.map((finding) => ({
        path: s.path,
        name: s.name,
        finding,
      })),
  );
  return { trifectaFindings, skillResourceFindings };
}

/** Tally how many scanned agents fall into each purity rung (effectSurface). */
function summarizePurity(agents: readonly ScanAgent[]): {
  pure: number;
  bounded: number;
  unrestricted: number;
} {
  return agents.reduce(
    (acc, a) => {
      acc[a.purity]++;
      return acc;
    },
    { pure: 0, bounded: 0, unrestricted: 0 },
  );
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
  const { hooks, inline, manual } = scanHooks(
    loaded.settings,
    resolve(dir),
    lay.pluginRootToken,
  );
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
  const agents = scanAgents(loaded.files, dialect, declaredServers, cls);
  const skills = scanSkills(loaded.files, cls, {
    root: resolve(dir),
    materializeRoot: lay.materializeRoot,
    dialect,
  });
  const puritySummary = summarizePurity(agents);
  const { trifectaFindings, skillResourceFindings } = collectSurfaceFindings(
    agents,
    skills,
  );
  return {
    dir,
    instructions,
    skills,
    agents,
    hooks,
    inlineHooks: inline,
    manualHookCount: manual,
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
    trifectaFindings,
    skillResourceIssues: skillResourceFindings,
    malformedFrontmatter: malformedFrontmatterFor(loaded.files, cls),
    warnings: loaded.warnings,
    untested: findUntestedSurfaces({ basePath: dir, layout: lay }).untested
      .length,
    puritySummary,
  };
}

/**
 * LIVE MCP tool resolution for a scanned plugin — the dynamic check no static
 * linter can do: it STARTS each declared MCP server and checks every
 * `mcp__server__tool` the plugin's agents reference actually exists on it
 * (catching rename/removal rot, e.g. `create_issue`→`issue_write`). Reuses the
 * already-computed `report` (its agents' tool lists) + the declared server configs;
 * returns `[]` when the plugin declares no MCP servers (nothing to start). Async +
 * side-effecting (spawns servers) — so `audit` runs it by default only for the
 * user's OWN repo (own-repo, like running your own tools); a FOREIGN plugin's
 * servers are never spawned, and `--fast` opts out. See `verifyMcpContractTools`
 * (core/mcp.ts).
 */
export async function verifyLiveMcpTools(
  report: ScanReport,
  layout: PluginLayout,
  dialect: HarnessDialect,
  timeoutMs = 10000,
): Promise<McpContractToolError[]> {
  // collectMcpServers yields the raw JSON server entries; a malformed one (no
  // command) just fails to start → server-unreachable (handled), so the cast is safe.
  const servers = collectMcpServers(resolve(report.dir), layout) as Record<
    string,
    McpServerConfig
  >;
  if (Object.keys(servers).length === 0) return [];
  const tools = report.agents.flatMap((a) => a.tools ?? []);
  return verifyMcpContractTools(tools, servers, dialect, timeoutMs);
}

/** Render the live MCP tool-check result (human-readable). */
export function formatMcpContractReport(
  errors: readonly McpContractToolError[],
): string {
  if (errors.length === 0) {
    return "Live MCP tool check: every referenced mcp__server__tool resolves ✓";
  }
  const lines = [`Live MCP tool check — ${String(errors.length)} issue(s):`];
  for (const e of errors) lines.push("  ✗ " + mcpContractToolMessage(e));
  return lines.join("\n");
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
 * curated-marketplace report in `vigiles audit`.
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
 * on disk). Used by `vigiles audit` to rank a whole marketplace — wshobson/agents
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

/** One agent's report block: ✗ (broken contract) / ⚠ (inherits all) / ✓ + issues + purity. */
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
  // Purity is an informational health signal (not a structural defect); mark it
  // clearly so a reader knows which rung this agent is on.
  const PURITY_TAGS: Record<string, string> = {
    pure: "pure",
    bounded: "bounded",
    unrestricted: "unrestricted",
  };
  const purityTag = PURITY_TAGS[a.purity] ?? "unrestricted";
  const lines = [`  ${mark} ${a.name} — ${tools} [${purityTag}]`];
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

  out.push(
    ...section(
      "Lethal trifecta (prompt-injection exfil risk)",
      r.trifectaFindings.map(
        (t) =>
          `  ${t.finding.severity === "hard" ? "✗" : "⚠"} ${t.kind} ${t.name} (${t.path}): ${t.finding.message}`,
      ),
    ),
  );

  out.push(
    ...section(
      "Skill bundled resources",
      r.skillResourceIssues.map(
        (s) =>
          `  ✗ ${s.name}: ${s.finding.ref} (line ${String(s.finding.line)}) — bundled resource not found`,
      ),
    ),
  );

  const facts: string[] = [];
  if (r.commands > 0) facts.push(`Commands: ${String(r.commands)}`);
  facts.push(`MCP servers: ${r.mcp ? "yes" : "no"}`);
  facts.push(`Untested surfaces: ${String(r.untested)}`);
  // Effect surface: harness-level purity summary across all scanned agents.
  // Informational (higher pure% = more constrained, cheaper to test); shown
  // only when there are agents to summarize (no agents → no summary line).
  if (r.agents.length > 0) {
    const { pure, bounded, unrestricted } = r.puritySummary;
    facts.push(
      `Effect surface: ${String(pure)} pure · ${String(bounded)} bounded · ${String(unrestricted)} unrestricted`,
    );
  }
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
      `⚠ ${String(mismatched.length)} skill(s) have descriptions in an unexpected script (cross-language trigger risk) — measure with \`vigiles measure\``,
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

  // One discovery nudge toward compiled hooks (never per-hook); the hand-written
  // shell lane stays first-class, so this is a recommendation, not a defect.
  if (r.manualHookCount > 0) {
    out.push(`ℹ ${preferCompiledHooksMessage(r.manualHookCount)}`, "");
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
