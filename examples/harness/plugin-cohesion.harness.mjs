/**
 * Canonical example — test the *whole assembled machine*, not one hook.
 *
 * The unit that matters in a plugin/repo is cohesion: do the hooks, settings,
 * CLAUDE.md and skills work *together*? `runHarnessTest({ plugin })` loads the
 * real harness from a plugin's `.claude-plugin/plugin.json` (resolving
 * `${CLAUDE_PLUGIN_ROOT}` to the real scripts), plus its CLAUDE.md and skills —
 * so you test what ships, not a hand-retyped subset.
 *
 * Here one `plugin:` load brings up two hooks at once — a SessionStart setup
 * hook and a PreToolUse Bash policy gate — and we assert both fire in a single
 * scenario. (Point `plugin` at your own repo / "./" to test yours.)
 *
 *   npx vigiles test examples/harness/plugin-cohesion.harness.mjs
 *   node examples/harness/plugin-cohesion.harness.mjs        # standalone
 *
 * Needs the `claude` CLI and a built dist/. External users import from the
 * package: `from "vigiles/harness-test"` and `from "vigiles/harness-assert"`.
 */
import { fileURLToPath } from "node:url";
import {
  scriptModel,
  claudeAvailable,
} from "../../dist/adapters/claude-code/harness-test.js";
import { withHarness, assertCreated, skip } from "../../dist/harness-assert.js";

if (!claudeAvailable()) skip("`claude` CLI not found");

const plugin = fileURLToPath(new URL("./fixture-plugin", import.meta.url));

// We use `withHarness` here instead of raw `runHarnessTest` + `r.cleanup()`.
// Trade-off, stated plainly so you can choose per test:
//   • withHarness removes the temp sandbox in a `finally`, so it is cleaned up
//     even when an assertion throws — no leaked temp dirs in CI. That is the win.
//   • The cost: assertions live inside a callback, and a thrown `assert*` aborts
//     the rest, so you see the FIRST failure, not all of them. If you want
//     per-check ✓/✗ output, or to inspect the result after the run, use raw
//     `runHarnessTest` + manual `r.cleanup()` instead — see policy-gate.harness.mjs.
await withHarness(
  {
    plugin, // fixture-plugin's real hooks (SessionStart + PreToolUse) + CLAUDE.md
    sandbox: false, // in-repo fixture we authored → trusted, run direct
    model: scriptModel([
      { tool: "Bash", input: { command: "rm -rf /tmp/should-be-blocked" } },
      { tool: "Bash", input: { command: "echo ok > RESULT" } },
      { text: "done" },
    ]),
  },
  (r) => {
    assertCreated(r, "SETUP_DONE"); // SessionStart setup hook ran
    assertCreated(r, "BLOCKED"); // PreToolUse gate blocked `rm -rf`
    if (!(r.file("RESULT") ?? "").includes("ok")) {
      throw new Error("clean command did not run (RESULT missing 'ok')");
    }
    console.log("  ✓ SessionStart + PreToolUse gate + clean command all fired");
  },
);

console.log("\n1 passed.");
