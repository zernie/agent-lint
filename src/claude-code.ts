/**
 * `vigiles/claude-code` — the Claude Code-specific harness pieces a *different*
 * harness would swap out: the plugin/repo loader (reads real Claude Code plugin
 * layouts) and the scriptable Anthropic Messages mock. Split from
 * `vigiles/testing` on purpose — the test API above is the stable surface; this
 * is the adapter, so a future `vigiles/<other-harness>` can sit beside it.
 */
export * from "./adapters/claude-code/plugin-loader.js";
export * from "./adapters/claude-code/mock-model.js";
