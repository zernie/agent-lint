/**
 * oh-my-claudecode walkthrough — sandbox: record + block network egress.
 *
 * Testing a third-party hook means running ITS code. `recordEgress` confines the
 * hook under bubblewrap (no egress, read-only host, cleared env) AND records
 * every `host:port` a proxy-honoring tool tries to reach — so you can assert what
 * a hook/skill phones home to (supply-chain / "what would its install hit?").
 *
 * Here we run OMC's REAL, vendored `keyword-detector` hook under `recordEgress`
 * and assert it reaches out to NOTHING — while still doing its job.
 *
 *   npx vigiles test examples/harness/oh-my-claudecode-egress.harness.mjs
 *   node examples/harness/oh-my-claudecode-egress.harness.mjs        # standalone
 *
 * Needs Linux + bubblewrap (and working user namespaces). Self-skips otherwise —
 * you can't record egress where you can't confine. External users import from the
 * package: `from "vigiles/run-hook"` + `from "vigiles/harness-assert"`.
 */
import { fileURLToPath } from "node:url";

import { runHook } from "../../dist/run-hook.js";
import { sandboxAvailable } from "../../dist/sandbox.js";
import { assertNoEgress } from "../../dist/harness-assert.js";

if (!sandboxAvailable()) {
  console.log(
    "skip: no working bubblewrap sandbox (can't confine → can't record egress)",
  );
  process.exit(0);
}

const ROOT = fileURLToPath(
  new URL("./vendor/oh-my-claudecode@deee3a4", import.meta.url),
);

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

// 1. The real third-party hook, confined + recorded → it phones home to nothing.
check("oh-my-claudecode keyword-detector makes zero egress", () => {
  const r = runHook(
    `node "${ROOT}/scripts/run.cjs" "${ROOT}/scripts/keyword-detector.mjs"`,
    { hook_event_name: "UserPromptSubmit", prompt: "please ultrawork on this" },
    { recordEgress: true, env: { CLAUDE_PLUGIN_ROOT: ROOT }, timeoutMs: 30000 },
  );
  if (!/ULTRAWORK/.test(r.json?.hookSpecificOutput?.additionalContext ?? "")) {
    throw new Error("the hook should still inject its routing");
  }
  assertNoEgress(r); // …and reach out to nothing
});

// 2. The positive case: an attempt IS recorded (and blocked).
check("a hook that tries the network is recorded and blocked", () => {
  const r = runHook(
    "curl -s -m 5 -o /dev/null https://registry.npmjs.org/ ; true",
    { hook_event_name: "PreToolUse", tool_name: "Bash" },
    { recordEgress: true, timeoutMs: 30000 },
  );
  const hit = r.egress.find((e) => e.host === "registry.npmjs.org");
  if (!hit) {
    throw new Error(
      `expected the registry attempt recorded; got ${JSON.stringify(r.egress)}`,
    );
  }
  console.log(`      (recorded ${hit.host}:${hit.port}, blocked)`);
});

console.log(failed === 0 ? `\n${2} passed.` : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
