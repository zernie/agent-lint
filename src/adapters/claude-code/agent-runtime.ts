/**
 * vigiles — Agent runtime: the PreToolUse tool-contract rail.
 *
 * A subagent declares an allowed-tools contract in its frontmatter (`tools:`).
 * But that field is documentation, not a hard runtime boundary (Claude Code
 * #4740/#21460, SDK #172): permissions are session-wide, a subagent inherits the parent
 * session's grants, and `tools:` only filters what's *offered* — it can't deny
 * what the session allows. The deterministic layer that actually closes the gap
 * is a **PreToolUse hook** that blocks any tool the active agent's contract
 * doesn't list.
 *
 * This is the same emit-a-hook pattern the skill runtime already ships
 * (`src/skill-runtime.ts`): there a `Stop` hook reads the active skill's
 * compiled SKILL.md and runs its result gate; here a `PreToolUse` hook reads
 * the active agent's compiled `.md`, parses its `tools:` allowlist, and
 * allows/denies the tool call. The compiled markdown's frontmatter is the
 * single source of truth — the same list that documents intent IS the list the
 * hook enforces, so the two agree by construction (see `enforcedTools`).
 *
 * Which agent is active is recorded in `.vigiles/active-agent.json` — Claude
 * Code hooks don't surface the dispatched subagent, so vigiles records it
 * (mirrors `.vigiles/active-skill.json`). The decision logic below is
 * harness-agnostic and fully testable.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

import {
  readFrontmatter,
  frontmatterList,
} from "../../core/frontmatter-read.js";
import { decidePurityGate } from "../../core/effects.js";
import type { PurityLevel } from "../../core/effects.js";
import { claudeCodeDialect } from "./dialect.js";

// ---------------------------------------------------------------------------
// Parse the tool contract from a compiled agent .md
// ---------------------------------------------------------------------------

/**
 * Parse an agent's allowed-tools contract from its compiled markdown.
 *
 * Returns the list of allowed tool names, or `null` when the agent declares no
 * `tools:` line at all — which in Claude Code means it inherits EVERY tool (the
 * #1 footgun). `null` is the "no restriction" signal the decision logic honors;
 * an empty list (`tools:` with nothing after it) means "no tools allowed".
 */
export function parseAgentTools(markdown: string): string[] | null {
  return parseAgentToolList(markdown, "tools");
}

/**
 * Parse a comma/array tool list under an arbitrary frontmatter `key` (e.g.
 * `tools:` or `disallowedTools:`) via the shared lenient reader
 * (core/frontmatter-read.ts): a real YAML parse (so `key: [Read, "Bash"]` is a
 * native array and `key: Read, Bash` a comma scalar) with a regex salvage when
 * the block is malformed — the rail still reads the contract. `null` when the key
 * is absent (inherits all), `[]` when present-but-empty (no tools). Shared by the
 * rail (`tools:`) and the `disallowed-tools-contract` scan/lint.
 */
export function parseAgentToolList(
  markdown: string,
  key: string,
): string[] | null {
  return frontmatterList(readFrontmatter(markdown), key);
}

const PURITY_RE = /<!--\s*vigiles:purity:(pure|bounded|unrestricted)\s*-->/;

/**
 * Parse the declared purity floor from a compiled agent's `.md` — the
 * `<!-- vigiles:purity:LEVEL -->` marker `compile` emits (see `purityMarker`).
 * Returns null when no marker is present (the unit declared no floor, so the
 * purity gate imposes no constraint). The single source of truth the runtime
 * gate reads, exactly like `tools:` for the tool-contract rail.
 */
export function parseAgentPurity(markdown: string): PurityLevel | null {
  const m = PURITY_RE.exec(markdown);
  return m ? (m[1] as PurityLevel) : null;
}

// ---------------------------------------------------------------------------
// The pure decision: is this tool inside the contract?
// ---------------------------------------------------------------------------

export interface PreToolDecision {
  /** Whether the tool call is allowed (true) or blocked (false). */
  readonly allow: boolean;
  /** Message fed back to the model on a block; empty on allow. */
  readonly message: string;
}

/**
 * Decide whether `tool` is allowed under an agent's tool contract. Pure, so the
 * rail is unit-testable without spawning anything.
 *
 * - `allowed === null` → the agent declared no `tools:` line, so it inherits
 *   everything and the rail imposes no restriction (allow).
 * - otherwise → allow iff the tool is in the allowlist; deny anything else,
 *   feeding the contract back to the model so it self-corrects.
 */
export function decidePreToolUse(
  allowed: readonly string[] | null,
  tool: string,
): PreToolDecision {
  if (allowed === null) return { allow: true, message: "" };
  if (allowed.includes(tool)) return { allow: true, message: "" };
  const list = allowed.length > 0 ? allowed.join(", ") : "(none)";
  return {
    allow: false,
    message:
      `Tool "${tool}" is not in this subagent's allowed-tools contract ` +
      `(${list}). Use only the listed tools, or widen the agent's \`tools\`.`,
  };
}

// ---------------------------------------------------------------------------
// Active-agent tracking (mirrors .vigiles/active-skill.json)
// ---------------------------------------------------------------------------

const ACTIVE_PATH = ".vigiles/active-agent.json";

/** Record the subagent currently dispatched, so PreToolUse enforces its contract. */
export function setActiveAgent(cwd: string, agentPath: string): void {
  const p = resolve(cwd, ACTIVE_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ agent: agentPath }) + "\n");
}

/** Clear the active-agent marker (the subagent finished). */
export function clearActiveAgent(cwd: string): void {
  const p = resolve(cwd, ACTIVE_PATH);
  if (existsSync(p)) rmSync(p);
}

/** The path of the active agent's compiled `.md`, or null when none is active. */
export function readActiveAgent(cwd: string): string | null {
  const p = resolve(cwd, ACTIVE_PATH);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as { agent?: unknown };
    return typeof parsed.agent === "string" ? parsed.agent : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PreToolUse-hook decision
// ---------------------------------------------------------------------------

/**
 * PreToolUse-hook decision. If an agent is active, enforce BOTH deterministic
 * rails its compiled `.md` declares, in order:
 *
 *  1. the tool-contract rail (`tools:`) — allow only listed tools;
 *  2. the purity gate (`vigiles:purity:`) — allow only calls within the declared
 *     effect floor, refining `Bash` by the live `command` (`decidePurityGate`).
 *
 * The first to deny wins, feeding its reason back to the model. With no active
 * agent (or one that declared neither contract), always allow — the rails only
 * constrain agents that opted in.
 */
export function evaluatePreToolUse(
  cwd: string,
  tool: string,
  command?: string,
): PreToolDecision {
  const agentPath = readActiveAgent(cwd);
  if (!agentPath) return { allow: true, message: "" };

  const full = resolve(cwd, agentPath);
  if (!existsSync(full)) return { allow: true, message: "" };

  const md = readFileSync(full, "utf-8");

  // 1) Tool-contract rail — the declared allowlist.
  const rail = decidePreToolUse(parseAgentTools(md), tool);
  if (!rail.allow) return rail;

  // 2) Purity gate — the declared effect floor, refined by the live command.
  const purity = parseAgentPurity(md);
  if (purity) {
    const gate = decidePurityGate(purity, tool, command, claudeCodeDialect);
    if (!gate.allow) return gate;
  }

  return { allow: true, message: "" };
}
