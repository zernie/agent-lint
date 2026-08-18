/**
 * The Claude Code vocabularies — hook events and subagent tools — re-derived
 * from the vendor's own documentation on 2026-08-17 against Claude Code 2.1.233
 * (`claude --version` on the capture box).
 *
 * Every entry below came from a STRUCTURAL read of the docs, not a prose grep:
 * the hook events are the 31 `<h3>` subsections of the `## Hook events` section
 * of https://code.claude.com/docs/en/hooks (2,589,700 bytes as fetched), in
 * document order; the tool statuses are the two filter lists in the
 * "Available tools" section of https://code.claude.com/docs/en/sub-agents
 * (1,126,213 bytes as fetched). The `condition` strings are the vendor's own
 * wording, trimmed.
 *
 * This file is the ONE authored place for both catalogs. `dialect.ts` builds
 * `builtinAgentTools` / `neverAvailableTools` / `sideEffectingTools` and the
 * literal tool unions from the tuples below, so the state that produced the
 * `Agent`/`Task` inversion — two hand-kept lists disagreeing with each other —
 * has nowhere left to live.
 *
 * WHAT THIS CORRECTS, and how badly it was wrong (measured; the mechanism is
 * documented in `core/vocabulary.ts`):
 *
 *  - HOOK EVENTS: the old catalog held 9 of 31. It was NOT "current except for
 *    `Setup`" — 22 documented events were missing, and 21 of those went unsaid
 *    only because they sit more than 2 edit distance from a name we held.
 *    `Setup` was the one that happened to land within 2 of `Stop`, so it alone
 *    drew an accusation, and the fix it suggested — rewire a one-shot setup hook
 *    onto every turn's Stop — would have broken the repo it was aimed at.
 *  - `Agent` WAS BACKWARDS. The old dialect listed `Agent` as never-available
 *    and `Task` as a built-in. The vendor renamed it the other way round:
 *
 *      > In version 2.1.63, the Task tool was renamed to Agent. Existing
 *      > `Task(...)` references in settings and agent definitions still work
 *      > as aliases.
 *
 *    and ships `tools: Agent(worker, researcher), Read, Bash` as a worked
 *    example. vigiles rejected the current name, accepted the deprecated one,
 *    and told orchestrator subagents to delete the one tool they exist to use.
 *  - FOUR NAMES WE HELD DO NOT EXIST. `MultiEdit`, `BashOutput`, `KillBash` and
 *    `LS` appear ZERO times across all six vendor doc pages fetched (hooks,
 *    sub-agents, tools-reference, settings, iam, tool-use). They are historical.
 *    They are gone from this catalog, so listing one now draws an
 *    `unrecognised` advisory instead of silent approval.
 *  - THE EVIDENCE WAS ALREADY IN THE REPO. `dialect-drift.ts`'s
 *    `ACKNOWLEDGED_TOOL_INPUT_TYPES` has carried `Agent`, `TaskOutput` and
 *    `Workflow` — read from the vendor's own `sdk-tools.d.ts` — since 2.1.187,
 *    under a note asserting they are "NOT subagent-grantable". Nothing ever
 *    compared that list against this one, so the drift alarm watched the
 *    platform move while our two catalogs contradicted both it and each other.
 *
 * WHY `conditional` IS NOT A DEFECT. The vendor is explicit that a subagent's
 * tool set is not a property of the name:
 *
 *   > Claude Code removes every other built-in tool from a background subagent,
 *   > whether inherited or listed in the `tools` field, so the same definition
 *   > can resolve to different tools in the foreground and the background.
 *
 * and, of the catalog as a whole:
 *
 *   > Your exact tool set depends on your provider, platform, and settings.
 *
 * Availability is therefore a function of foreground/background, spawn depth,
 * `permissionMode`, model, provider and settings — none of which vigiles can
 * read off a `tools:` line. `conditional` records the condition and reports it
 * as a note. Evaluating those conditions (two of them are decidable from
 * frontmatter we already parse — `ExitPlanMode` against the agent's own
 * `permissionMode`, and background-vs-foreground) is real follow-on work and is
 * deliberately NOT done here.
 *
 * KNOWN GAP, recorded rather than smoothed: `TodoWrite` is named by the vendor
 * among the built-ins a background subagent keeps, so it is `available` — but
 * `tools-reference` also says that from 2.1.233 `TodoWrite`, `TaskCreate`,
 * `TaskGet`, `TaskUpdate` and `TaskList` are withheld on Opus 4.8 / Sonnet 5 /
 * Fable 5 / Mythos 5 and later unless opted in. That is a MODEL axis on top of
 * the two filter axes. The four `Task*` tools are `conditional` for the
 * background reason anyway and their condition says so; `TodoWrite` stays
 * `available` because the vendor names it in the kept-list verbatim. One
 * condition string cannot express three independent axes, and adding a field to
 * hold a case we still could not evaluate would be worse than saying so here.
 */
import type {
  HarnessVocabulary,
  VocabularyTerm,
} from "../../core/vocabulary.js";

/** The vendor artifact + version both catalogs below were captured from. */
const CAPTURE = "code.claude.com/docs (claude-code 2.1.233, read 2026-08-17)";

/**
 * The Claude Code hook events — the 31 `###` subsections under `## Hook events`
 * at https://code.claude.com/docs/en/hooks, in document order.
 *
 * `Setup` is the third. It is a real event with its own `Setup input` and
 * `Setup decision control` subsections; the old catalog's absence of it is what
 * produced the two-letter grade inversion this file exists to fix.
 */
export const claudeCodeHookEventNames = [
  "SessionStart",
  "Setup",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "MessageDisplay",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "ConfigChange",
  "CwdChanged",
  "DirectoryAdded",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "Elicitation",
  "ElicitationResult",
] as const;

/**
 * The 19 built-ins the vendor names as the set a BACKGROUND subagent keeps —
 * the default case, and the only tool set vigiles can assume without reading
 * conditions it cannot see.
 */
export const claudeCodeAvailableAgentTools = [
  "Read",
  "Grep",
  "Glob",
  "Bash",
  "PowerShell",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Skill",
  "ToolSearch",
  "EnterWorktree",
  "ExitWorktree",
  "Monitor",
  "TaskStop",
  "SendMessage",
  "Artifact",
] as const;

/**
 * The 7 unconditional entries of the vendor's first filter — "removes these
 * tools, even when listed in the `tools` field", with no qualifier attached.
 * Listing one is a genuine dead reference, and the only tool verdict that
 * still enters the grade.
 */
export const claudeCodeWithheldAgentTools = [
  "AskUserQuestion",
  "EndConversation",
  "EnterPlanMode",
  "ScheduleWakeup",
  "TaskOutput",
  "WaitForMcpServers",
  "Workflow",
] as const;

/** Vendor conditions quoted once, so the term table below stays readable. */
const DEPTH_LIMIT =
  "only when the subagent is at the depth limit; in a fork the tool stays " +
  "listed but returns an error instead of spawning";
const BACKGROUND =
  "from a background subagent (the default) — a foreground subagent or a fork " +
  "keeps it";
const BACKGROUND_AND_MODEL =
  `${BACKGROUND}; also withheld from Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 ` +
  "and later unless CLAUDE_CODE_ENABLE_TODO_TOOLS=1";

/**
 * Tools the platform removes only under a stated condition — the qualified
 * entries of the first filter, plus the built-ins that survive in the
 * foreground but not in the background. Declaring one is legitimate, so none
 * of these is scored; the condition is reported and vigiles stops there.
 */
export const claudeCodeConditionalAgentToolNames = [
  "Agent",
  // The rename runs the OTHER WAY from what vigiles used to encode: `Task` is
  // the old name and still works as an alias, `Agent` is the current one.
  "Task",
  "ExitPlanMode",
  "ListAgents",
  "LSP",
  "ShareOnboardingGuide",
  "CronCreate",
  "CronDelete",
  "CronList",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
] as const;

/**
 * The vendor's qualifier for each conditional tool.
 *
 * Typed as a `Record` over the name tuple ON PURPOSE: a conditional tool with no
 * stated condition cannot be reported as conditional (the condition IS the
 * report), so adding a name above without a line here is a `tsc` error rather
 * than a runtime surprise. The equivalent runtime check in
 * `vocabularyProjectionProblems` stays for adapters that build a vocabulary
 * dynamically, but for this one the gap is unrepresentable.
 */
const CONDITIONS: Record<
  (typeof claudeCodeConditionalAgentToolNames)[number],
  string
> = {
  Agent: DEPTH_LIMIT,
  Task: DEPTH_LIMIT,
  ExitPlanMode: "unless the subagent's permissionMode is plan",
  ListAgents:
    "from a background subagent; a foreground subagent inherits it only in " +
    "sessions where cross-session messaging is enabled",
  LSP: BACKGROUND,
  ShareOnboardingGuide: BACKGROUND,
  CronCreate: BACKGROUND,
  CronDelete: BACKGROUND,
  CronList: BACKGROUND,
  TaskCreate: BACKGROUND_AND_MODEL,
  TaskGet: BACKGROUND_AND_MODEL,
  TaskList: BACKGROUND_AND_MODEL,
  TaskUpdate: BACKGROUND_AND_MODEL,
};

/** Still-honoured deprecated spellings, pointing at the current name. */
const ALIASES: Partial<
  Record<(typeof claudeCodeConditionalAgentToolNames)[number], string>
> = { Task: "Agent" };

/**
 * The side-effecting subset of everything a subagent may declare (the
 * complement is read-only). Two rules decided the additions here, both from the
 * vendor's own tool descriptions rather than from the tool's name:
 *
 *  - `Monitor` "writes a small script, runs it in the background" and can open
 *    a WebSocket — execution plus network, so it is side-effecting despite
 *    reading like an observer.
 *  - `LSP`, `ToolSearch`, `ListAgents`, `TaskGet`, `TaskList` and `CronList`
 *    only report state, so they stay read-only.
 *
 * This matters beyond tidiness: `classifyToolEffect` treats "in the built-in
 * catalog and NOT here" as read-only, so a name added to the catalog without a
 * decision here would silently be declared harmless — and a spawning tool
 * misfiled as read-only would let a subagent pass the lethal-trifecta check it
 * should fail.
 */
export const claudeCodeSideEffectingAgentTools = [
  "Bash",
  "PowerShell",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Skill",
  "TodoWrite",
  "Monitor",
  "SendMessage",
  "Artifact",
  "EnterWorktree",
  "ExitWorktree",
  "TaskStop",
  "Agent",
  "Task",
  "TaskCreate",
  "TaskUpdate",
  "CronCreate",
  "CronDelete",
  "ShareOnboardingGuide",
] as const;

/** The hook-event vocabulary — every documented event, all currently available. */
export const claudeCodeHookEventVocabulary: HarnessVocabulary = {
  kind: "claude-code hook event",
  capturedFrom: `${CAPTURE} § hooks / Hook events`,
  terms: claudeCodeHookEventNames.map(
    (name): VocabularyTerm => ({ name, status: "available" }),
  ),
};

/** The subagent-tool vocabulary — available / withheld / conditional. */
export const claudeCodeSubagentToolVocabulary: HarnessVocabulary = {
  kind: "claude-code subagent tool",
  capturedFrom: `${CAPTURE} § sub-agents / Available tools`,
  terms: [
    ...claudeCodeAvailableAgentTools.map(
      (name): VocabularyTerm => ({ name, status: "available" }),
    ),
    ...claudeCodeWithheldAgentTools.map(
      (name): VocabularyTerm => ({ name, status: "withheld" }),
    ),
    ...claudeCodeConditionalAgentToolNames.map(
      (name): VocabularyTerm => ({
        name,
        status: "conditional",
        condition: CONDITIONS[name],
        ...(ALIASES[name] !== undefined ? { aliasOf: ALIASES[name] } : {}),
      }),
    ),
  ],
};
