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
 * package: `from "vigiles/harness-test"`.
 */
import { fileURLToPath } from "node:url";
import {
  runHarnessTest,
  scriptModel,
  claudeAvailable,
} from "../../dist/harness-test.js";

if (!claudeAvailable()) {
  console.log("skip: `claude` CLI not found");
  process.exit(0);
}

const plugin = fileURLToPath(new URL("./fixture-plugin", import.meta.url));

const r = await runHarnessTest({
  plugin,
  model: scriptModel([
    { tool: "Bash", input: { command: "rm -rf /tmp/should-be-blocked" } },
    { tool: "Bash", input: { command: "echo ok > RESULT" } },
    { text: "done" },
  ]),
});

const checks = [
  ["SessionStart setup hook ran", () => r.file("SETUP_DONE") !== null],
  ["PreToolUse gate blocked `rm -rf`", () => r.file("BLOCKED") !== null],
  ["clean command still ran", () => (r.file("RESULT") ?? "").includes("ok")],
];

let failed = 0;
for (const [name, check] of checks) {
  const ok = check();
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
}
r.cleanup();
console.log(
  failed === 0 ? `\n${checks.length} passed.` : `\n${failed} failed.`,
);
process.exit(failed === 0 ? 0 : 1);
