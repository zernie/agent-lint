/**
 * `vigiles/testing` — Pillar 2 entry point: the **harness-testing** API. Re-exports
 * the three tiers — `runHook` (unit), `runHarnessTest` (deterministic), `runEval`
 * (eval) — plus the runner-agnostic predicates/assertions. Kept deliberately
 * separate from `vigiles/claude-code` so this surface can stay harness-agnostic as
 * more harnesses are added. Granular paths (`vigiles/run-hook`, etc.) still work.
 *
 * It re-exports the composition-root runner modules (which do the Claude-Code
 * default-wiring), never an adapter directly — the `agnostic-surface` eslint
 * boundary forbids importing `src/adapters/*` from here. See
 * `research/adapter-api-design.md`.
 */
// Curated public re-exports (named, not `export *`) so the internal seams —
// the injectable `*With` runners, low-level `parse*`, pool/aggregate/model-tier
// helpers — stay out of the public surface, the api reports, and the docs site.
// (vigiles's own tests import those from the source modules directly.)

// --- unit tier: runScript (the primitive) + runHook (it, plus a decision) ---
// `runScript` runs any program and reports what it DID (exit, both streams,
// writes, egress). `runHook` is that plus the hook protocol: event to stdin,
// exit code to allow/deny. Testing a plain helper script? Reach for runScript —
// its result carries no `decision`, because a script does not have one.
export { runScript } from "./run-script.js";
export type { RunScriptOptions, ScriptRunResult } from "./run-script.js";
export { runHook, propertyHook } from "./run-hook.js";
export type {
  HookRunResult,
  RunHookOptions,
  HookInput,
  HookOutput,
  HookPropertyResult,
} from "./run-hook.js";

// --- eval tier: runEval / measure / trigger-rate ---
export {
  runEval,
  measure,
  measureArms,
  measureTriggerRate,
  assertRates,
  assertPromptDiversity,
  checkPromptDiversity,
  checkReportToJUnit,
  formatCheckReport,
  formatEvalReport,
  formatTriggerRateReport,
  claudeEvalDriver,
  parseClaudeRun,
  stubSkillBody,
} from "./eval.js";
export type {
  EvalArm,
  EvalDriver,
  EvalSpec,
  EvalReport,
  EvalUsage,
  MeasureSpec,
  ArmsMeasureSpec,
  ArmReport,
  ArmUsage,
  ArmsCheckReport,
  CheckRate,
  CheckReport,
  MetricStat,
  Metrics,
  ModelOutputParser,
  ParsedModelRun,
  PromptDiversityIssue,
  PromptTriggerStat,
  RunContext,
  RunOut,
  SelectionTrialResult,
  TriggerRateReport,
  TriggerRateSpec,
  AgentRunArgs,
  AgentRunner,
} from "./eval.js";

export * from "./harness-assert.js";
// The compiled-hook LOADER. The in-process assertions above take the hook
// OBJECT, but a `.harness.mjs` test only has its PATH — without this the
// intended in-process test path is unreachable from the file format
// `vigiles test` actually runs, and authors fall back to spawning the runtime as
// a subprocess (the very plumbing compiled hooks exist to remove). Same loader
// the CLI runtime uses, so a hook that loads in a test loads identically in prod.
export { loadHook } from "./load-hook.js";
// The declarative check vocabulary is now first-class at the front door. Its
// `hookFired` (a `Check<Trace>`) supersedes the legacy boolean predicate of the
// same name — the explicit re-export below wins over the two `export *`s.
export * from "./check.js";
export { hookFired } from "./check.js";
// The model-graded judge (agnostic — grades text against a rubric). Public here
// now that `vigiles/judge` is no longer a standalone subpath.
export { judge } from "./judge.js";
// Tool stubs on PATH (rung R2): shadow a CLI tool with a recorded canned result.
export * from "./tool-stub.js";
// The harness-test tier — AGNOSTIC SURFACE ONLY. The Claude-Code transport
// (`scriptModel`, `claudeCodeDriver`, `buildClaudeArgs`, `parseClaudeRun`,
// `claudeAvailable`, `loadPlugin`, `resolveHarness`) is deliberately NOT
// re-exported here, so `vigiles/testing` stays harness-agnostic — import those
// from `vigiles/claude-code` (or your harness's package). See
// `research/code-adapter-architecture.md`.
export { runHarnessTest, runHarness } from "./harness-test.js";
export type {
  HarnessTestSpec,
  Trace,
  SubagentTrace,
  HarnessTestResult,
  RunHarnessTestOptions,
  ModelTurn,
  ModelRequest,
  ToolCall,
  HookFire,
  HarnessTestDriver,
  SandboxMode,
} from "./harness-test.js";
