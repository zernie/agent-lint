/**
 * `vigiles/harness-test` — composition-root entry for the **deterministic** tier.
 *
 * This is the wiring seam where **Claude Code is the default harness**: it
 * re-exports the runner (`runHarnessTest`), the `Trace` model, the parsers, and
 * the CC `scriptModel`/`claudeCodeDriver` from the Claude Code adapter. Pass
 * `{ adapter }` (e.g. `codexAdapter` from `vigiles/codex`) to drive another
 * harness. The harness-agnostic public surface (`vigiles/testing`,
 * `vigiles/unit`, …) re-exports *this* module and must never reach into an
 * adapter directly — enforced by the `agnostic-surface` eslint boundary. Keeping
 * the default-wiring here (the composition root) rather than in the public barrel
 * means swapping the default harness is a one-module change. See
 * `research/adapter-api-design.md`.
 */
export * from "./adapters/claude-code/harness-test.js";
