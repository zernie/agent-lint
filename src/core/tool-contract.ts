/**
 * Tool-contract verification — the cross-referencing moat ("valid is not true")
 * applied to a subagent's declared `tools:` rail. A subagent may only run
 * built-in tools from the harness dialect's catalog or an MCP tool; anything else
 * is a typo or a nonexistent tool — a guaranteed-dead reference a compiler
 * catches, not a runtime surprise.
 *
 * ONE pure detector (`one-detector-no-drift`), reused by THREE callers so they
 * can't disagree: `compileAgent` (spec authoring), `scan` (read-only audit of a
 * shipped plugin), and the `subagent-tool-contract` lint rule (the severity-gated
 * commit gate). The dialect is injected (core ⊄ adapter) — the composition root
 * passes `claudeCodeDialect` / `codexDialect`.
 *
 * WHAT CHANGED, 2026-08-17. This used to split names two ways — in
 * `builtinAgentTools` (fine) or in `neverAvailableTools` (dead) — and decide
 * what to say about a name in neither by its edit distance to the first list.
 * Two failures came out of that shape:
 *
 *  - `Agent` was in the DENYLIST while its own deprecated alias `Task` was in the
 *    catalog, so vigiles rejected the platform's current name, accepted the old
 *    one, and told orchestrator subagents to remove the tool they exist to use.
 *    Nothing could notice, because the two lists were never compared.
 *  - Real tools vigiles didn't know (`EndConversation`, `TaskOutput`,
 *    `Workflow`) and outright invented ones passed in silence, while typos of
 *    known names were caught — so the more wrong a name was, the likelier it
 *    went unreported.
 *
 * Names are now CLASSIFIED against the dialect's vocabulary
 * (`core/vocabulary.ts`), which has a third status for what the two-way split
 * could not express: the vendor removes `Agent` only at the spawn depth limit,
 * `ExitPlanMode` only outside plan mode, and most built-ins only from a
 * background subagent. Those are `conditional` — reported as a note with the
 * condition quoted, never as "remove it". Severity travels on the issue, so
 * `scan`, `lint` and `compileAgent` cannot drift apart on which issues count.
 *
 * Scope note: this validates a SUBAGENT contract against the SUBAGENT catalog. A
 * skill's `allowed-tools` is a DIFFERENT namespace (skills legitimately use
 * `AskUserQuestion`, `TaskCreate`, … which a subagent doesn't get), so it is
 * deliberately NOT validated here — doing so against the agent catalog would be
 * a false-positive factory.
 */
import type { HarnessDialect } from "./dialect.js";
import {
  classify,
  suggest,
  termIssue,
  vocabularyFromLists,
  type HarnessVocabulary,
  type IssueSeverity,
  type TermVerdict,
} from "./vocabulary.js";

export type ToolIssueKind =
  /** The platform removes it unconditionally — a real, scored defect. */
  | "never-available"
  /** Not in vigiles's catalog — advisory; may be newer than our capture. */
  | "unknown"
  /** Real, but removed under a condition vigiles can't see — advisory. */
  | "conditional";

/**
 * The wire-shape `kind` each verdict maps to. `never-available` and `unknown`
 * predate the vocabulary and keep their meaning for existing consumers;
 * `conditional` is the new one the two-way split could not express.
 */
const TOOL_ISSUE_KIND: Record<TermVerdict["kind"], ToolIssueKind> = {
  withheld: "never-available",
  conditional: "conditional",
  unrecognised: "unknown",
  // `available` never reaches here — termIssue returns null for it.
  available: "unknown",
};

export interface ToolIssue {
  readonly tool: string;
  readonly kind: ToolIssueKind;
  /** Which vocabulary verdict produced this — the input to every policy. */
  readonly verdict: TermVerdict["kind"];
  /** Closest known built-in tool (did-you-mean), or null. Message only. */
  readonly suggestion: string | null;
  /**
   * The vendor condition — present ONLY for a `conditional` verdict. Carried so
   * a report can group the tools sharing one condition rather than repeat the
   * same sentence per tool.
   */
  readonly condition?: string;
  /** `"scored"` counts toward the grade; `"advisory"` never does. */
  readonly severity: IssueSeverity;
  /** A ready-to-show, actionable message. */
  readonly message: string;
}

/**
 * The tool vocabulary this dialect verifies against — its declared one, else a
 * synthesised one from the flat lists so a legacy adapter keeps working.
 */
export function subagentToolVocabulary(
  dialect: HarnessDialect,
): HarnessVocabulary {
  return (
    dialect.subagentToolVocabulary ??
    vocabularyFromLists(
      `${dialect.name} subagent tool`,
      `${dialect.name} adapter (no recorded capture)`,
      dialect.builtinAgentTools,
      dialect.neverAvailableTools,
    )
  );
}

/**
 * Closest known built-in tool by edit distance (≤ 2), for a "did you mean" hint.
 * A MESSAGE DECORATION, never a gate: whether to report is already settled by
 * the verdict before this is called. The ≤ 2 bound stays tight because a loose
 * bound mis-suggests — `TaskGet → Task?` is a different real tool, not a typo.
 */
export function closestTool(
  tool: string,
  dialect: HarnessDialect,
): string | null {
  return suggest(subagentToolVocabulary(dialect), tool);
}

/**
 * Verify a subagent's `disallowedTools:` BLOCK-list — the mirror of the allow
 * contract. A typo here is dangerous: you meant to block `Bash` but wrote `Bsh`,
 * so nothing is blocked and the dangerous tool stays available, silently. Returns
 * one {@link ToolIssue} per entry that's a CLOSE TYPO of a real tool.
 * Deliberately NOT flagged: any name the vocabulary knows (blocking it is the
 * point — including a withheld one, which is merely redundant), an MCP tool (a
 * legitimate plugin tool to block), or a bare unknown with no near match.
 *
 * This is the ONE place a near match still gates a finding, and it is not the
 * confidence proxy the allow-side check was rightly stripped of. On a block-list
 * the risk inverts: an entry naming nothing is harmless UNLESS you meant a real
 * tool and mistyped it, and "meant a real tool" is precisely what a one-character
 * distance evidences. `disallowedTools: [Zzzz]` blocks nothing and nobody
 * intended otherwise; `disallowedTools: [Bsh]` leaves `Bash` wide open. So the
 * distance here is the actual semantic signal, not a stand-in for one.
 */
export function disallowedToolIssues(
  tools: readonly string[],
  dialect: HarnessDialect,
): ToolIssue[] {
  const vocab = subagentToolVocabulary(dialect);
  const issues: ToolIssue[] = [];
  for (const raw of tools) {
    const tool = raw.split("(")[0].trim();
    if (tool === "" || tool === "*") continue;
    if (dialect.mcpToolPattern.test(tool)) continue; // a real plugin/MCP tool to block
    if (classify(vocab, tool).kind !== "unrecognised") continue; // a real name — blocking it is fine
    const near = suggest(vocab, tool);
    if (near === null) continue; // bare unknown → likely a plugin tool, not a typo
    issues.push({
      tool,
      verdict: "unrecognised",
      kind: "unknown",
      suggestion: near,
      severity: "scored",
      message: `disallowedTools entry "${tool}" matches no real tool — it blocks nothing. Did you mean "${near}"?`,
    });
  }
  return issues;
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
  const vocab = subagentToolVocabulary(dialect);
  const issues: ToolIssue[] = [];
  for (const raw of tools) {
    const tool = raw.split("(")[0].trim(); // strip a Tool(restriction) suffix
    if (tool === "" || tool === "*") continue; // "" / "*" = wildcard, inherits all
    if (dialect.mcpToolPattern.test(tool)) continue;
    const verdict = classify(vocab, tool);
    const issue = termIssue(
      vocab,
      verdict,
      "Tool",
      "the subagent never gets it",
    );
    if (issue === null) continue;
    issues.push({
      tool,
      verdict: verdict.kind,
      kind: TOOL_ISSUE_KIND[verdict.kind],
      suggestion: issue.suggestion,
      ...(issue.condition !== undefined ? { condition: issue.condition } : {}),
      severity: issue.severity,
      message: issue.message,
    });
  }
  return issues;
}

export { scoredIssues, advisoryIssues, authoringIssues } from "./vocabulary.js";
