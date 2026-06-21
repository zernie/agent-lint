/**
 * `vigiles/claude-code` — the Claude Code-specific harness pieces a *different*
 * harness would swap out: the plugin/repo loader (reads real Claude Code plugin
 * layouts) and the scriptable Anthropic Messages mock. Split from
 * `vigiles/testing` on purpose — the test API above is the stable surface; this
 * is the adapter, so a future `vigiles/<other-harness>` can sit beside it.
 */
export * from "./adapters/claude-code/plugin-loader.js";
export * from "./mock-model.js";
// The Claude-Code harness-test transport — the default driver + its argv/parse
// helpers + the `claude` capability probe. Agnostic users never need these
// (`runHarnessTest` defaults to the CC driver), but they're exposed here — beside
// the Codex driver in `vigiles/codex` — for CC-specific tests/tooling. They are
// deliberately NOT on the agnostic `vigiles/testing` surface.
export {
  claudeCodeDriver,
  buildClaudeArgs,
  parseClaudeRun,
  claudeAvailable,
} from "./harness-test.js";
export * from "./adapters/claude-code/dialect.js";
// The typed Claude Code authoring surface: `agent` / `skill` with the `purity`
// floor enforced AT COMPILE TIME against the CC tool catalog (a `tsc` error for
// e.g. `purity: "pure"` + `"Bash"`). A strict addition to the runtime/compile
// purity checks; the bare core `agent()`/`skill()` (`vigiles/spec`) stay open.
export {
  agent,
  skill,
  type ClaudeCodeToolVocabulary,
} from "./adapters/claude-code/typed-spec.js";
export * from "./adapters/claude-code/layout.js";
export * from "./adapters/claude-code/runtime.js";
export * from "./adapters/claude-code/hook-protocol.js";
export * from "./adapters/claude-code/model-mock.js";
export * from "./adapters/claude-code/adapter.js";
