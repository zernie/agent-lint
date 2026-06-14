/**
 * Tests for parseAgentResult (src/agent-result.ts) — the railway result parser.
 * A subagent with a result() contract ends its turn with a vigiles:ok/err block;
 * this turns that text into a discriminated outcome (ok | err | malformed). Pure,
 * model-free — the primitive both the orchestrator and the assert helpers reuse.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { parseAgentResult } from "./agent-result.js";
import { result } from "../../core/spec.js";

const okBlock = (json: string) => "Done.\n\n```vigiles:ok\n" + json + "\n```\n";
const errBlock = (json: string) =>
  "Failed.\n\n```vigiles:err\n" + json + "\n```\n";

test("parses a success block (no contract)", () => {
  const r = parseAgentResult(
    okBlock('{ "files": ["a.ts"], "summary": "done" }'),
  );
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.kind === "ok" && r.value, {
    files: ["a.ts"],
    summary: "done",
  });
});

test("parses an error block (no contract)", () => {
  const r = parseAgentResult(
    errBlock('{ "reason": "boom", "retryable": true }'),
  );
  assert.equal(r.kind, "err");
  assert.deepEqual(r.kind === "err" && r.error, {
    reason: "boom",
    retryable: true,
  });
});

test("malformed when no result block is present", () => {
  const r = parseAgentResult("I finished the task, all good!");
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /no vigiles:ok\/vigiles:err/,
  );
});

test("malformed on invalid JSON", () => {
  const r = parseAgentResult(okBlock("{ not json"));
  assert.equal(r.kind, "malformed");
  assert.match(r.kind === "malformed" ? r.reason : "", /invalid JSON/);
});

test("malformed when the block is JSON but not an object", () => {
  for (const body of ["[1, 2, 3]", "42", '"a string"']) {
    const r = parseAgentResult(okBlock(body));
    assert.equal(r.kind, "malformed", `body ${body}`);
    assert.match(
      r.kind === "malformed" ? r.reason : "",
      /must be a JSON object/,
    );
  }
});

test("the LAST block wins (earlier illustrative blocks ignored)", () => {
  const text =
    'First I might do:\n```vigiles:ok\n{ "draft": true }\n```\n' +
    'but actually:\n```vigiles:err\n{ "reason": "nope" }\n```\n';
  const r = parseAgentResult(text);
  assert.equal(r.kind, "err");
});

test("contract validation: missing required field → malformed", () => {
  const c = result(
    { files: "string[]", summary: "string" },
    { reason: "string" },
  );
  const r = parseAgentResult(okBlock('{ "files": ["a.ts"] }'), c);
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /missing field "summary"/,
  );
});

test("contract validation: wrong field type → malformed", () => {
  const c = result({ summary: "string" }, { reason: "string" });
  const r = parseAgentResult(okBlock('{ "summary": 123 }'), c);
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /"summary" should be string/,
  );
});

test("contract validation: every field type matches → ok", () => {
  const c = result(
    { s: "string", n: "number", b: "boolean", arr: "string[]" },
    { reason: "string" },
  );
  const r = parseAgentResult(
    okBlock('{ "s": "x", "n": 1, "b": false, "arr": ["a", "b"] }'),
    c,
  );
  assert.equal(r.kind, "ok");
});

test("contract validation: string[] rejects a non-array and an array with non-strings", () => {
  const c = result({ arr: "string[]" }, { reason: "string" });
  assert.equal(
    parseAgentResult(okBlock('{ "arr": "x" }'), c).kind,
    "malformed",
  );
  assert.equal(
    parseAgentResult(okBlock('{ "arr": ["a", 2] }'), c).kind,
    "malformed",
  );
});

test("contract validation runs against the err track too", () => {
  const c = result(
    { summary: "string" },
    { reason: "string", retryable: "boolean" },
  );
  const bad = parseAgentResult(errBlock('{ "reason": "x" }'), c); // missing retryable
  assert.equal(bad.kind, "malformed");
  const good = parseAgentResult(
    errBlock('{ "reason": "x", "retryable": true }'),
    c,
  );
  assert.equal(good.kind, "err");
});
