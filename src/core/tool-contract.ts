/**
 * Tool-contract verification — the cross-referencing moat ("valid is not true")
 * applied to a subagent's declared `tools:` rail. A subagent may only run
 * built-in tools from the harness dialect's catalog or an MCP tool; anything else
 * is a typo or a nonexistent / never-available tool — a guaranteed-dead reference
 * a compiler catches, not a runtime surprise.
 *
 * ONE pure detector (`one-detector-no-drift`), reused by THREE callers so they
 * can't disagree: `compileAgent` (spec authoring), `scan` (read-only audit of a
 * shipped plugin), and the `agent-tool-contract` lint rule (the severity-gated
 * commit gate). The dialect is injected (core ⊄ adapter) — the composition root
 * passes `claudeCodeDialect` / `codexDialect`.
 *
 * Scope note: this validates a SUBAGENT contract against the SUBAGENT catalog
 * (`builtinAgentTools` / `neverAvailableTools`). A skill's `allowed-tools` is a
 * DIFFERENT namespace (skills legitimately use `AskUserQuestion`, `TaskCreate`,
 * … which are never-available to a subagent), so it is deliberately NOT validated
 * here — doing so against the agent catalog would be a false-positive factory.
 */
import type { HarnessDialect } from "./dialect.js";
import { editDistance } from "./linters.js";

export type ToolIssueKind = "never-available" | "unknown";

export interface ToolIssue {
  readonly tool: string;
  readonly kind: ToolIssueKind;
  /** Closest known built-in tool (did-you-mean), or null. */
  readonly suggestion: string | null;
  /** A ready-to-show, actionable message. */
  readonly message: string;
}

/**
 * Closest known built-in tool by edit distance (≤ 2), for a "did you mean" hint.
 * The ≤ 2 bound is deliberately tight: a suggestion is a CONFIDENCE signal (this
 * `unknown` is really a typo of a real tool), and a loose bound mis-suggests —
 * `TaskGet → Task?` (distance 3) is a real tool set, not a typo of `Task`.
 */
export function closestTool(
  tool: string,
  dialect: HarnessDialect,
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of dialect.builtinAgentTools) {
    const d = editDistance(tool.toLowerCase(), known.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  return bestDistance <= 2 ? best : null;
}

/**
 * The HIGH-CONFIDENCE subset of a contract's issues — the ones safe to flag when
 * AUDITING a third-party plugin (scan / lint), where the catalog can't know
 * every tool (plugin-/MCP-provided, newer platform tools). Only two are confident:
 * a `never-available` tool (a curated denylist) and an `unknown` with a close
 * typo suggestion (`Edt → Edit`). A bare `unknown` with no near match is NOT
 * flagged here — it is more likely a tool vigiles doesn't know than a defect
 * (sweeping real plugins surfaced a 280★ plugin using `TaskCreate/TaskGet/…`
 * consistently; flagging those would be crying wolf). `compileAgent` stays strict
 * — when you author your OWN spec, every unrecognized tool is worth an error.
 */
export function confidentToolIssues(issues: readonly ToolIssue[]): ToolIssue[] {
  return issues.filter(
    (i) => i.kind === "never-available" || i.suggestion !== null,
  );
}

/**
 * Verify a subagent's `tools:` contract against the dialect catalog. Returns one
 * {@link ToolIssue} per offending entry (empty when every tool is a real built-in
 * or a well-formed MCP tool). A `Tool(restriction)` suffix (e.g. `Bash(git:*)`)
 * is stripped to its base tool before checking.
 */
export function verifyToolContract(
  tools: readonly string[],
  dialect: HarnessDialect,
): ToolIssue[] {
  const never = new Set(dialect.neverAvailableTools);
  const issues: ToolIssue[] = [];
  for (const raw of tools) {
    const tool = raw.split("(")[0].trim(); // strip a Tool(restriction) suffix
    if (tool === "") continue;
    if (never.has(tool)) {
      issues.push({
        tool,
        kind: "never-available",
        suggestion: null,
        message: `Tool "${tool}" is never available to a subagent — remove it from the tools list.`,
      });
      continue;
    }
    if (dialect.builtinAgentTools.includes(tool)) continue;
    if (dialect.mcpToolPattern.test(tool)) continue;
    const near = closestTool(tool, dialect);
    const hint = near ? ` Did you mean "${near}"?` : "";
    issues.push({
      tool,
      kind: "unknown",
      suggestion: near,
      message: `Unknown tool "${tool}" — use a built-in tool (${dialect.builtinAgentTools.join(", ")}) or an MCP tool (mcp__server__tool).${hint}`,
    });
  }
  return issues;
}
