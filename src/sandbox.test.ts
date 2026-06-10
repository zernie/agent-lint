/**
 * Tests for the safe-by-default confinement layer (src/sandbox.ts). The policy
 * (`decideSandbox`), trust test (`specTrusted`), bwrap argv (`bwrapArgs`), and
 * request-log parser are pure — exercised here with no bwrap. The end-to-end
 * confinement test (a sandboxed run can't reach the network) is gated on a real
 * bwrap + claude and skips otherwise, the same pattern as the claude-backed suite.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  decideSandbox,
  specTrusted,
  sandboxAvailable,
  bwrapArgs,
  parseRequestLog,
} from "./sandbox.js";
import {
  runHarnessTest,
  claudeAvailable,
  scriptModel,
} from "./harness-test.js";

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

test("bwrapArgs: isolated net, read-only root, writable work + io + fresh home", () => {
  const args = bwrapArgs({ cwd: "/work", ioDir: "/io", home: "/io/home" });
  const joined = args.join(" ");
  assert.ok(args.includes("--unshare-all")); // fresh net namespace, no egress
  assert.ok(joined.includes("--ro-bind / /")); // system read-only
  assert.ok(joined.includes("--bind /work /work")); // writable work dir
  assert.ok(joined.includes("--bind /io /io")); // writable IO relay dir
  assert.ok(joined.includes("--setenv HOME /io/home")); // fresh empty HOME
  assert.ok(joined.includes("--chdir /work"));
  assert.ok(args.includes("--die-with-parent"));
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
