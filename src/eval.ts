/**
 * `vigiles/eval` — composition-root entry for the **eval** axis (`runEval`,
 * `measureTriggerRate`, the report types/formatters).
 *
 * The pure eval orchestration (`runEvalWith`/`runPool`/aggregation/stats) is
 * harness-agnostic and driven by an injected `AgentRunner`; this seam defaults
 * that runner to the Claude Code spawn. The harness-agnostic surface
 * (`vigiles/testing`) re-exports this module and must not import the adapter
 * directly (enforced by the `agnostic-surface` eslint boundary). See
 * `research/adapter-api-design.md`.
 */
export * from "./adapters/claude-code/eval.js";
