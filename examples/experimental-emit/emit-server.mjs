/**
 * A minimal stdio MCP server that serves ONE tool: the emit tool derived by
 * `experimental_emitTool(contract)`.
 *
 * The tool definition is NOT written here — it is read from the JSON file named
 * by `$VIGILES_EMIT_TOOL_JSON`, which the runner produces by calling
 * `experimental_emitTool`. That is deliberate: if the schema were hand-copied
 * into this file, the measurement would be testing a hand-copy, not the API.
 *
 * Every call's arguments are appended to `$VIGILES_EMIT_OUT` (one JSON line) so
 * the run can be inspected out-of-band as well as through `Trace.toolCalls`.
 *
 * Zero dependencies, ~70 lines. Adapted from the 2026-08-13 output-contract spike.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const TOOL = JSON.parse(
  readFileSync(process.env.VIGILES_EMIT_TOOL_JSON, "utf8"),
);
const OUT = process.env.VIGILES_EMIT_OUT || "/tmp/emit_result.jsonl";

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "emit", version: "0.0.0" },
      },
    });
    return;
  }
  if (method === "notifications/initialized" || id === undefined) return;
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: [TOOL] } });
    return;
  }
  if (method === "tools/call") {
    // The server does NOT validate: the point of the measurement is what the
    // RUNTIME does and does not enforce. Validation is the receiving code's job
    // (`experimental_parseEmitted`), which is where it lands in real use too.
    appendFileSync(
      OUT,
      JSON.stringify({
        at: Date.now(),
        name: params?.name,
        args: params?.arguments,
      }) + "\n",
    );
    send({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: "recorded" }], isError: false },
    });
    return;
  }
  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "method not found" },
  });
});
