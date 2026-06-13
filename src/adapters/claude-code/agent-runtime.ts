/**
 * vigiles — Agent runtime: the PreToolUse tool-contract rail.
 *
 * A subagent declares an allowed-tools contract in its frontmatter (`tools:`).
 * But that field is documentation, not a hard runtime boundary (Claude Code
 * issue #54898): permissions are session-wide, a subagent inherits the parent
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

// ---------------------------------------------------------------------------
// Parse the tool contract from a compiled agent .md
// ---------------------------------------------------------------------------

/** Extract the YAML frontmatter block (between the first pair of `---` fences). */
function extractFrontmatter(markdown: string): string | null {
  const lines = markdown.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(start + 1, i).join("\n");
    }
  }
  return null;
}

/**
 * Parse an agent's allowed-tools contract from its compiled markdown.
 *
 * Returns the list of allowed tool names, or `null` when the agent declares no
 * `tools:` line at all — which in Claude Code means it inherits EVERY tool (the
 * #1 footgun). `null` is the "no restriction" signal the decision logic honors;
 * an empty list (`tools:` with nothing after it) means "no tools allowed".
 */
export function parseAgentTools(markdown: string): string[] | null {
  const fm = extractFrontmatter(markdown);
  if (fm === null) return null;
  const match = /^tools:[ \t]*(.*)$/m.exec(fm);
  if (!match) return null;
  return match[1]
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
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
 * PreToolUse-hook decision. If an agent is active, parse its compiled `.md`
 * tool contract and allow the call only when the tool is in the allowlist;
 * otherwise block and tell the model which tools it may use. With no active
 * agent (or an agent that inherits all tools), always allow — the rail only
 * constrains agents that declared a contract.
 */
export function evaluatePreToolUse(cwd: string, tool: string): PreToolDecision {
  const agentPath = readActiveAgent(cwd);
  if (!agentPath) return { allow: true, message: "" };

  const full = resolve(cwd, agentPath);
  if (!existsSync(full)) return { allow: true, message: "" };

  const allowed = parseAgentTools(readFileSync(full, "utf-8"));
  return decidePreToolUse(allowed, tool);
}
