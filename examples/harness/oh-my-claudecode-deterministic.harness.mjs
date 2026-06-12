/**
 * oh-my-claudecode walkthrough — Tier 2: deterministic harness test
 * (`runHarnessTest`).
 *
 * Right logic (Tier 1) ≠ wired in correctly and reaching the model. This tier
 * runs the REAL `claude` CLI against a SCRIPTED mock model (no API key, same
 * result every time), with OMC's real `keyword-detector` hook wired on
 * `UserPromptSubmit`. It proves two things a "did it run?" check can't:
 *
 *   1. the hook actually FIRED in a real session, and
 *   2. its injected `additionalContext` actually LANDED in the model's request
 *      (`trace.modelRequests`) — "fired ≠ landed".
 *
 * The hook is wired via inline `settings` (code we authored here → trusted →
 * runs direct, no sandbox needed). Pointing `pluginDir` at the whole untrusted
 * plugin instead would run confined under bubblewrap by default.
 *
 *   npx vigiles test examples/harness/oh-my-claudecode-deterministic.harness.mjs
 *   node examples/harness/oh-my-claudecode-deterministic.harness.mjs   # standalone
 *
 * Needs the `claude` CLI (no API key) and a built dist/. External users import
 * from the package: `from "vigiles/harness-test"`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runHarnessTest,
  scriptModel,
  claudeAvailable,
} from "../../dist/harness-test.js";
import {
  assertHookFired,
  assertRequestContains,
} from "../../dist/harness-assert.js";

if (!claudeAvailable()) {
  console.log("skip: `claude` CLI not found");
  process.exit(0);
}

const ROOT = fileURLToPath(
  new URL("./vendor/oh-my-claudecode@deee3a4", import.meta.url),
);
// Throwaway HOME + OMC_STATE_DIR so the hook's state dir never touches the repo
// (OMC writes <cwd>/.omc unless OMC_STATE_DIR is set).
const tmp = mkdtempSync(join(tmpdir(), "omc-det-"));
const command =
  `HOME="${tmp}" OMC_STATE_DIR="${tmp}" CLAUDE_PLUGIN_ROOT="${ROOT}" ` +
  `node "${ROOT}/scripts/run.cjs" "${ROOT}/scripts/keyword-detector.mjs"`;

const r = await runHarnessTest({
  settings: {
    hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command }] }] },
  },
  prompt: "please ultrawork on this refactor",
  transcript: true,
  model: scriptModel([{ text: "on it" }]),
});

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
};

// 1. fired: the UserPromptSubmit hook ran in the real session.
check("keyword-detector fired on UserPromptSubmit", () =>
  assertHookFired(r, "UserPromptSubmit"),
);
// 2. landed: the injected routing actually reached the model's request.
check("the injected ULTRAWORK routing reached the model (fired ≠ landed)", () =>
  assertRequestContains(r, "ULTRAWORK"),
);

console.log(failed === 0 ? "\n2 passed." : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
