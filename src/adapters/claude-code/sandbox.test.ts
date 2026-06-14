/**
 * Tests for the safe-by-default confinement layer (src/sandbox.ts). The policy
 * (`decideSandbox`), trust test (`specTrusted`), bwrap argv (`bwrapArgs`), and
 * request-log parser are pure — exercised here with no bwrap. The end-to-end
 * confinement test (a sandboxed run can't reach the network) is gated on a real
 * bwrap + claude and skips otherwise, the same pattern as the claude-backed suite.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  decideSandbox,
  specTrusted,
  sandboxAvailable,
  bwrapArgs,
  setenvArgs,
  parseRequestLog,
  parseEgressLog,
  diffTrees,
} from "./sandbox.js";
import {
  runHarnessTest,
  claudeAvailable,
  scriptModel,
} from "./harness-test.js";
import {
  assertRequestContains,
  assertHookFired,
} from "../../harness-assert.js";

test("specTrusted: inline-only is trusted, any external plugin is not", () => {
  assert.equal(specTrusted({}), true);
  assert.equal(specTrusted({ plugin: "./repo" }), false);
  assert.equal(specTrusted({ pluginDir: "/some/plugin" }), false);
});

test("decideSandbox: false is the dangerous opt-out — always runs direct", () => {
  for (const trusted of [true, false]) {
    for (const available of [true, false]) {
      assert.deepEqual(decideSandbox({ trusted, mode: false, available }), {
        action: "direct",
      });
    }
  }
});

test("decideSandbox: strict forces confinement, throws without a sandbox", () => {
  assert.deepEqual(
    decideSandbox({ trusted: true, mode: "strict", available: true }),
    { action: "sandbox" },
  );
  const refused = decideSandbox({
    trusted: true,
    mode: "strict",
    available: false,
  });
  assert.equal(refused.action, "throw");
  assert.match(refused.action === "throw" ? refused.reason : "", /bwrap/);
});

test("decideSandbox auto: trusted runs direct regardless of availability", () => {
  assert.deepEqual(
    decideSandbox({ trusted: true, mode: "auto", available: false }),
    { action: "direct" },
  );
  assert.deepEqual(
    decideSandbox({ trusted: true, mode: "auto", available: true }),
    { action: "direct" },
  );
});

test("decideSandbox auto: untrusted is sandboxed, or REFUSES if it can't be", () => {
  assert.deepEqual(
    decideSandbox({ trusted: false, mode: "auto", available: true }),
    { action: "sandbox" },
  );
  const refused = decideSandbox({
    trusted: false,
    mode: "auto",
    available: false,
  });
  assert.equal(refused.action, "throw");
  // safe-by-default: never silently runs untrusted code unconfined
  assert.match(
    refused.action === "throw" ? refused.reason : "",
    /refusing to execute|sandbox: false/,
  );
});

test("sandboxAvailable returns a boolean (covers the probe)", () => {
  assert.equal(typeof sandboxAvailable(), "boolean");
});

test("bwrapArgs: isolated net, cleared env, ro root, writable work + io + home", () => {
  const args = bwrapArgs({
    cwd: "/work",
    ioDir: "/io",
    home: "/io/home",
    path: "/usr/bin:/bin",
  });
  const joined = args.join(" ");
  assert.ok(args.includes("--unshare-all")); // fresh net namespace, no egress
  assert.ok(args.includes("--clearenv")); // drop host secrets from env
  assert.ok(joined.includes("--ro-bind / /")); // system read-only
  assert.ok(joined.includes("--bind /work /work")); // writable work dir
  assert.ok(joined.includes("--bind /io /io")); // writable IO relay dir
  assert.ok(joined.includes("--setenv HOME /io/home")); // fresh empty HOME
  assert.ok(joined.includes("--setenv PATH /usr/bin:/bin")); // PATH set back
  assert.ok(joined.includes("--chdir /work"));
  assert.ok(args.includes("--die-with-parent"));
});

test("setenvArgs: one --setenv pair per var, empty for none", () => {
  assert.deepEqual(setenvArgs({ GUARD: "/x", FOO: "bar" }), [
    "--setenv",
    "GUARD",
    "/x",
    "--setenv",
    "FOO",
    "bar",
  ]);
  assert.deepEqual(setenvArgs({}), []);
});

test("parseRequestLog: parses ndjson, skips blank and partial lines", () => {
  const ndjson =
    JSON.stringify({ system: "s1", messages: [{ role: "user", text: "a" }] }) +
    "\n\n" +
    JSON.stringify({ system: "s2", messages: [] }) +
    "\n" +
    '{"system":"partial' + // a half-written final line → skipped
    "\n";
  const reqs = parseRequestLog(ndjson);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0]?.system, "s1");
  assert.equal(reqs[1]?.system, "s2");
  assert.deepEqual(parseRequestLog(""), []);
});

test("parseEgressLog: parses host/port, skips blank/partial/invalid lines", () => {
  const ndjson =
    JSON.stringify({ host: "registry.npmjs.org", port: 443, ts: 1 }) +
    "\n\n" +
    JSON.stringify({ host: "evil.example", port: 80, ts: 2 }) +
    "\n" +
    JSON.stringify({ host: "no-port" }) + // missing port → skipped
    "\n" +
    JSON.stringify({ port: 22 }) + // missing host → skipped
    "\n" +
    '{"host":"partial' + // half-written final line → skipped
    "\n";
  const out = parseEgressLog(ndjson);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { host: "registry.npmjs.org", port: 443, ts: 1 });
  assert.equal(out[1]?.host, "evil.example");
  // a record without ts defaults to 0
  assert.equal(parseEgressLog('{"host":"h","port":7}')[0]?.ts, 0);
  assert.deepEqual(parseEgressLog(""), []);
});

test("diffTrees: new + changed files, sorted; unchanged + removed skipped", () => {
  const before = { "keep.txt": "10:1", "edit.txt": "5:1", "gone.txt": "3:1" };
  const after = {
    "keep.txt": "10:1", // unchanged → skipped
    "edit.txt": "5:2", // mtime changed → written
    "new/a.json": "2:9", // new → written
  };
  assert.deepEqual(diffTrees(before, after), ["edit.txt", "new/a.json"]);
  assert.deepEqual(diffTrees({}, {}), []);
});

// --- end-to-end confinement (needs a real bwrap + claude) ------------------

const sandboxRunnable = sandboxAvailable() && claudeAvailable();

// The security property, proven through the real stack: a sandboxed run's Bash
// can reach the in-sandbox mock (so turns are served + requests captured) but
// CANNOT reach the external network — egress is blocked by the netns.
test.skipIf(!sandboxRunnable)(
  "a sandboxed run blocks network egress while the mock stays reachable",
  async () => {
    const probe =
      "node -e \"fetch('https://example.com',{signal:AbortSignal.timeout(4000)})" +
      ".then(r=>require('fs').writeFileSync('NET','open:'+r.status))" +
      ".catch(()=>require('fs').writeFileSync('NET','blocked'))\"";
    const r = await runHarnessTest({
      sandbox: "strict", // force the sandbox path on a trusted inline spec
      allowedTools: ["Bash", "Write"],
      model: scriptModel([
        { tool: "Bash", input: { command: probe } },
        { text: "done" },
      ]),
      timeoutMs: 120000,
    });
    try {
      if (r.turns < 1 || r.modelRequests.length < 1) {
        console.error(
          `[SANDBOX-DIAG egress] exitCode=${String(r.exitCode)} turns=${String(r.turns)} modelRequests=${String(r.modelRequests.length)} NET=${String(r.file("NET"))}\n--- stderr(tail) ---\n${r.stderr.slice(-3000)}\n--- stdout(tail) ---\n${r.stdout.slice(-1500)}`,
        );
      }
      // mock was reachable inside the netns → turns served + requests relayed out
      assert.ok(r.turns >= 1, "expected the in-sandbox mock to serve a turn");
      assert.ok(
        r.modelRequests.length >= 1,
        "expected captured requests relayed out of the sandbox",
      );
      // the real payoff: external egress was blocked
      assert.equal(
        r.file("NET"),
        "blocked",
        "expected external network to be unreachable from the sandbox",
      );
    } finally {
      r.cleanup();
    }
  },
  130000,
);

// trace.modelRequests proves injected context actually REACHES the model — a
// SessionStart hook (emitting Claude Code's nested form) under the sandbox, and
// we find its additionalContext in the model's request. "fired" AND "landed".
test.skipIf(!sandboxRunnable)(
  "a SessionStart hook's injected context reaches the model (trace.modelRequests)",
  async () => {
    const marker = "VIGILES_CTX_MARKER_42";
    const hookCmd = `node -e "console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:'${marker}'}}))"`;
    const r = await runHarnessTest({
      settings: {
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [{ type: "command", command: hookCmd }],
            },
          ],
        },
      },
      sandbox: "strict", // force the sandbox path even though this is trusted
      transcript: true,
      model: scriptModel([{ text: "ok" }]),
      timeoutMs: 120000,
    });
    try {
      if (r.turns < 1 || r.modelRequests.length < 1) {
        console.error(
          `[SANDBOX-DIAG ctx] exitCode=${String(r.exitCode)} turns=${String(r.turns)} modelRequests=${String(r.modelRequests.length)} hooks=${JSON.stringify(r.hooks)}\n--- stderr(tail) ---\n${r.stderr.slice(-3000)}\n--- stdout(tail) ---\n${r.stdout.slice(-1500)}`,
        );
      }
      assertHookFired(r, "SessionStart");
      assertRequestContains(r, marker); // the injected context landed in the model's request
    } finally {
      r.cleanup();
    }
  },
  130000,
);

// Dogfood — the execute-and-verify payoff on a REAL pinned third-party plugin:
// obra/superpowers' SessionStart hook is UNTRUSTED, so it runs CONFINED (no
// sandbox:false). We assert the real hook FIRED inside the sandbox and produced
// its genuine output. (It emits a *top-level* additionalContext, which Claude
// Code — reading the *nested* form — does NOT inject; so trace.modelRequests
// shows the context did NOT reach the model. That "fired ≠ landed" gap is exactly
// what modelRequests exists to surface, proven against real third-party code.)
test.skipIf(!sandboxRunnable)(
  "dogfood: superpowers' SessionStart runs confined and its real output is captured",
  async () => {
    const superpowers = join(
      __dirname,
      "../../../examples/harness/vendor/superpowers@6fd4507",
    );
    const r = await runHarnessTest({
      plugin: superpowers, // external → untrusted → confined (no sandbox:false)
      transcript: true,
      model: scriptModel([{ text: "ok" }]),
      timeoutMs: 120000,
    });
    try {
      assertHookFired(r, "SessionStart"); // the real third-party hook ran, confined
      const ctx = r.hooks.find((h) => h.event === "SessionStart")?.output ?? "";
      assert.ok(
        ctx.includes("You have superpowers"),
        "expected superpowers' SessionStart to produce its real injected-context output",
      );
    } finally {
      r.cleanup();
    }
  },
  130000,
);
