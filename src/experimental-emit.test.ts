/**
 * Tests for the EXPERIMENTAL emit channel (src/experimental-emit.ts): the tool
 * derived from an `OutputContract`, the parse of an observed tool call, and the
 * assertion. Pure — no model, no MCP server; the paid measurement that this
 * surface exists to support lives in `mine`,
 * `vigiles/repro/experimental-emit-2026-08-13/`.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { result } from "./core/spec.js";
import type { ToolCall } from "./core/harness-driver.js";
import {
  experimental_emitTool,
  experimental_parseEmitted,
  experimental_assertEmittedOk,
  type EmitObjectSchema,
} from "./experimental-emit.js";

/** The verdict shape a pipeline skill records today via `ledger.mjs record`. */
const CONTRACT = result(
  { verdict: "string", count: "number", report: "string" },
  { reason: "string", detail: "string" },
);

function call(name: string, input: unknown): ToolCall {
  return { name, input, resultText: "recorded", isError: false };
}

test("emitTool derives an MCP tool from the same OutputContract as the fenced rail", () => {
  const { tool, instruction } = experimental_emitTool(CONTRACT);

  assert.equal(tool.name, "emit_result");
  // The two tracks are NESTED, so a mixed ok/err bag is not expressible.
  assert.deepEqual(Object.keys(tool.inputSchema.properties), [
    "track",
    "ok",
    "err",
  ]);
  const ok = tool.inputSchema.properties.ok as EmitObjectSchema;
  assert.deepEqual(ok.properties.count, { type: "number" });
  assert.deepEqual(ok.required, ["verdict", "count", "report"]);
  assert.equal(ok.additionalProperties, false);
  // The prose half carries the same fields, so a hand-wired skill cannot drift.
  assert.match(instruction, /"count": number/);
  assert.match(instruction, /emit_result` tool exactly once/);
});

test("emitTool honors a custom tool name in BOTH halves", () => {
  const { tool, instruction } = experimental_emitTool(CONTRACT, {
    name: "record_verdict",
  });
  assert.equal(tool.name, "record_verdict");
  assert.match(instruction, /`record_verdict` tool exactly once/);
});

test("emitTool maps every OutputFieldType, including string[]", () => {
  const { tool } = experimental_emitTool(
    result({ files: "string[]", done: "boolean" }, { reason: "string" }),
  );
  const ok = tool.inputSchema.properties.ok as EmitObjectSchema;
  assert.deepEqual(ok.properties.files, {
    type: "array",
    items: { type: "string" },
  });
  assert.deepEqual(ok.properties.done, { type: "boolean" });
});

test("parseEmitted reads an ok emit off the tool calls, MCP-prefixed name and all", () => {
  const calls = [
    call("Read", { file_path: "paper.md" }),
    call("mcp__spike__emit_result", {
      track: "ok",
      ok: { verdict: "FINDING", count: 3, report: "reviews/status.md" },
    }),
  ];
  const r = experimental_parseEmitted(calls, CONTRACT);
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.kind === "ok" ? r.value.count : null, 3);
});

test("parseEmitted reads the err track against the err shape", () => {
  const r = experimental_parseEmitted(
    [
      call("emit_result", {
        track: "err",
        err: { reason: "crashed", detail: "no build" },
      }),
    ],
    CONTRACT,
  );
  assert.equal(r.kind, "err");
});

test("parseEmitted: no emit at all is malformed, naming the tool", () => {
  const r = experimental_parseEmitted([call("Read", {})], CONTRACT);
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /no `emit_result` tool call/,
  );
});

test("parseEmitted: TWO emits are malformed, not last-one-wins", () => {
  const twice = [
    call("emit_result", {
      track: "ok",
      ok: { verdict: "FINDING", count: 1, report: "a.md" },
    }),
    call("emit_result", {
      track: "ok",
      ok: { verdict: "FINDING", count: 9, report: "b.md" },
    }),
  ];
  const r = experimental_parseEmitted(twice, CONTRACT);
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /called 2 times; the contract is exactly once/,
  );
});

test("parseEmitted: a MISSING required field is malformed — the runtime does not check it", () => {
  // Measured against the real runtime: a call omitting declared-required fields
  // is accepted and delivered. Validation has to happen HERE or nowhere.
  const r = experimental_parseEmitted(
    [call("emit_result", { track: "ok", ok: { verdict: "FINDING" } })],
    CONTRACT,
  );
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /ok payload: missing field "count"/,
  );
});

test("parseEmitted: a WRONG-TYPED field is malformed", () => {
  const r = experimental_parseEmitted(
    [
      call("emit_result", {
        track: "ok",
        ok: { verdict: "FINDING", count: "three", report: "a.md" },
      }),
    ],
    CONTRACT,
  );
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /field "count" should be number/,
  );
});

test("parseEmitted: a track with no matching payload object is malformed", () => {
  const r = experimental_parseEmitted(
    [call("emit_result", { track: "ok" })],
    CONTRACT,
  );
  assert.equal(r.kind, "malformed");
  assert.match(
    r.kind === "malformed" ? r.reason : "",
    /declared track "ok" but carried no `ok` object/,
  );
});

test("parseEmitted: a bad or absent track discriminator is malformed", () => {
  for (const input of [
    { ok: { verdict: "x" } },
    { track: "maybe" },
    "not-an-object",
  ]) {
    const r = experimental_parseEmitted([call("emit_result", input)], CONTRACT);
    assert.equal(r.kind, "malformed");
  }
});

test("assertEmittedOk returns the value, and names the tools called when it throws", () => {
  const good = [
    call("emit_result", {
      track: "ok",
      ok: { verdict: "FINDING", count: 2, report: "r.md" },
    }),
  ];
  assert.deepEqual(experimental_assertEmittedOk(good, CONTRACT), {
    verdict: "FINDING",
    count: 2,
    report: "r.md",
  });

  assert.throws(
    () =>
      experimental_assertEmittedOk(
        [call("Read", {}), call("Bash", {})],
        CONTRACT,
      ),
    /no `emit_result` tool call.*tools called: Read, Bash/s,
  );
  assert.throws(
    () =>
      experimental_assertEmittedOk(
        [
          call("emit_result", {
            track: "err",
            err: { reason: "crashed", detail: "d" },
          }),
        ],
        CONTRACT,
      ),
    /emitted an error result/,
  );
  assert.throws(
    () => experimental_assertEmittedOk([], CONTRACT),
    /tools called: none/,
  );
});
