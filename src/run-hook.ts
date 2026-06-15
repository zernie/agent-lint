/**
 * `vigiles/run-hook` — composition-root entry for the **unit** tier (`runHook`).
 *
 * The wiring seam that defaults the hook protocol to Claude Code (`decideHook`
 * takes `protocol = claudeCodeHookProtocol`); a non-CC harness reads its protocol
 * from its own adapter. The harness-agnostic surface (`vigiles/unit`,
 * `vigiles/testing`) re-exports this module and must not import the adapter
 * directly (enforced by the `agnostic-surface` eslint boundary). See
 * `research/adapter-api-design.md`.
 */
export * from "./adapters/claude-code/run-hook.js";
