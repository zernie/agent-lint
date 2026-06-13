/**
 * Canonical example — a *deterministic* harness test (`runHarnessTest`).
 *
 * Two real-plugin-shaped governance hooks, tested with no API key and no cost:
 * the real `claude` CLI runs your real hooks against a scripted mock model, so
 * the agent's turns are fixed and the outcome is reproducible.
 *
 *   1. A `PreToolUse` Bash policy gate (the **block-no-verify** shape) — blocks
 *      `git commit --no-verify`, lets a clean commit through.
 *   2. A `SessionStart` setup hook (the **obra/superpowers** shape) — runs a
 *      setup command before the agent starts.
 *
 * Both hook families are reliable in the deterministic tier (see
 * research/harness-testing.md). Run it:
 *
 *   npx vigiles test examples/harness/policy-gate.harness.mjs
 *   node examples/harness/policy-gate.harness.mjs        # standalone
 *
 * Needs the `claude` CLI and a built dist/ (`npm run build`). External users
 * import from the package instead: `from "vigiles/harness-test"`.
 */
import {
  runHarnessTest,
  scriptModel,
  claudeAvailable,
} from "../../dist/adapters/claude-code/harness-test.js";

if (!claudeAvailable()) {
  console.log("skip: `claude` CLI not found");
  process.exit(0);
}

/** Minimal sequential test runner: ✓/✗ per case, non-zero exit on any failure. */
async function run(cases) {
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}\n      ${err.message}`);
    }
  }
  console.log(
    failed === 0 ? `\n${cases.length} passed.` : `\n${failed} failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

await run([
  [
    "PreToolUse Bash gate blocks `git commit --no-verify`, allows a clean commit",
    async () => {
      const r = await runHarnessTest({
        settings: {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    // {cwd} is substituted with the run's temp dir — hooks don't
                    // run with the project dir as cwd.
                    command:
                      "CMD=$(cat | jq -r '.tool_input.command // empty'); " +
                      'case "$CMD" in *--no-verify*) ' +
                      "touch {cwd}/BLOCKED; echo 'blocked: --no-verify is banned' >&2; exit 2;; " +
                      "esac; exit 0",
                  },
                ],
              },
            ],
          },
        },
        model: scriptModel([
          { tool: "Bash", input: { command: "git commit --no-verify -m wip" } },
          { tool: "Bash", input: { command: "echo committed > RESULT" } },
          { text: "done" },
        ]),
      });
      try {
        assert(r.file("BLOCKED") !== null, "gate did not fire on --no-verify");
        assert(
          (r.file("RESULT") ?? "").includes("committed"),
          "clean commit path did not run",
        );
      } finally {
        r.cleanup();
      }
    },
  ],
  [
    "SessionStart hook runs a setup command before the agent starts",
    async () => {
      const r = await runHarnessTest({
        settings: {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { type: "command", command: "echo ready > {cwd}/SETUP_DONE" },
                ],
              },
            ],
          },
        },
        model: scriptModel([{ text: "hello" }]),
      });
      try {
        assert(
          (r.file("SETUP_DONE") ?? "").includes("ready"),
          "SessionStart setup hook did not run",
        );
      } finally {
        r.cleanup();
      }
    },
  ],
]);

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
