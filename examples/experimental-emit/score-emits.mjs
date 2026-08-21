/**
 * $0, offline. Score recorded emit calls through `experimental_parseEmitted` —
 * the same function a test would use — and print the counters.
 *
 *   node examples/experimental-emit/score-emits.mjs [records/emits.jsonl]
 *
 * Input is one JSON object per line: `{ run, cwd, at, name, input }`, where
 * `input` is the tool call's argument object exactly as the runtime delivered
 * it. That is the shape `Trace.toolCalls` carries, so scoring the file and
 * scoring a live trace run the identical code path.
 *
 * Free by construction: no model, no MCP server, no network. Re-scoring after a
 * change to `experimental_parseEmitted` costs nothing, which is the point of
 * keeping the raw arguments rather than a summary of them.
 */
import { readFileSync } from "node:fs";

import { experimental_agent } from "../../dist/core/spec.js";
const { result } = experimental_agent;
import { experimental_parseEmitted } from "../../dist/experimental-emit.js";

// Defaults to the PUBLISHED run so `node score-emits.mjs` reproduces the numbers
// in the write-up with no arguments. A fresh `run-emit.mjs` writes
// `records/emits.jsonl` (gitignored — it carries un-redacted model prose); pass
// that path explicitly to score it.
const file =
  process.argv[2] ??
  new URL("records/emits-2026-08-13.jsonl", import.meta.url).pathname;

const CONTRACT = result(
  { verdict: "string", count: "number", report: "string" },
  { reason: "string", detail: "string" },
);

const rows = readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const tally = { ok: 0, err: 0, malformed: 0 };
for (const row of rows) {
  // One recorded call, presented exactly as a Trace would present it.
  const toolCalls = [
    {
      name: row.name,
      input: row.input,
      resultText: "recorded",
      isError: false,
    },
  ];
  const parsed = experimental_parseEmitted(toolCalls, CONTRACT);
  tally[parsed.kind]++;
  const detail =
    parsed.kind === "ok"
      ? `count=${String(parsed.value.count)}`
      : parsed.kind === "err"
        ? `reason=${String(parsed.error.reason)}`
        : parsed.reason;
  console.log(
    `run ${String(row.run).padStart(2)}  ${row.cwd}  ${parsed.kind.padEnd(9)} ${detail}`,
  );
}

console.log(
  `\nN=${String(rows.length)}  ok=${String(tally.ok)}  err=${String(tally.err)}  malformed=${String(tally.malformed)}`,
);

// A repeated emit is malformed, not last-one-wins — scored here on the real
// arguments rather than only on a constructed unit-test fixture.
if (rows.length >= 2) {
  const two = rows.slice(0, 2).map((row) => ({
    name: row.name,
    input: row.input,
    resultText: "recorded",
    isError: false,
  }));
  const r = experimental_parseEmitted(two, CONTRACT);
  console.log(
    `two real calls in one trace → ${r.kind}` +
      (r.kind === "malformed" ? `: ${r.reason}` : ""),
  );
}
