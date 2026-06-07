/**
 * A scripted, deterministic Anthropic Messages API mock for E2E tests.
 *
 * Point a client at it with ANTHROPIC_BASE_URL. It serves a fixed *script* of
 * turns in order — each POST /v1/messages returns the next one:
 *   { text: "..." }                          → final text answer (stop: end_turn)
 *   { tool: "Bash", input: { command: "…" } } → a tool_use turn (stop: tool_use)
 *
 * Implements the gotchas real clients require: SSE streaming (flushed per
 * event), the /v1/messages/count_tokens endpoint (else Claude Code hangs),
 * trailing-slash tolerance, and echoing the requested model.
 */
import http from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamTurn(res, turn, model) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const id = `msg_${Math.random().toString(36).slice(2, 10)}`;
  writeEvent(res, "message_start", {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
  if (turn.tool) {
    writeEvent(res, "content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: `toolu_${Math.random().toString(36).slice(2, 10)}`,
        name: turn.tool,
        input: {},
      },
    });
    writeEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify(turn.input ?? {}),
      },
    });
    writeEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: 0,
    });
    writeEvent(res, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: 5 },
    });
  } else {
    writeEvent(res, "content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    });
    writeEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: turn.text ?? "" },
    });
    writeEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: 0,
    });
    writeEvent(res, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 5 },
    });
  }
  writeEvent(res, "message_stop", { type: "message_stop" });
  res.end();
}

function jsonTurn(res, turn, model) {
  const id = `msg_${Math.random().toString(36).slice(2, 10)}`;
  const content = turn.tool
    ? [
        {
          type: "tool_use",
          id: `toolu_${Math.random().toString(36).slice(2, 10)}`,
          name: turn.tool,
          input: turn.input ?? {},
        },
      ]
    : [{ type: "text", text: turn.text ?? "" }];
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id,
      type: "message",
      role: "assistant",
      model,
      stop_reason: turn.tool ? "tool_use" : "end_turn",
      stop_sequence: null,
      content,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  );
}

/**
 * Start the mock. `script` is the ordered list of turns (text/tool); each real
 * /v1/messages POST consumes the next. `onRequest({n,stream,hasToolResult})`
 * fires per real turn. Resolves to { url, close(), requests, count }.
 */
export function startMock(script, { port = 0, onRequest } = {}) {
  let i = 0;
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = req.url || "";
      const isCount = url.includes("count_tokens");
      const isMessages = url.includes("/v1/messages") && !isCount;
      let reqBody = {};
      try {
        reqBody = JSON.parse(body);
      } catch {
        /* HEAD / health checks have no JSON body */
      }

      // Health check / unknown route → 200, not counted as a turn.
      if (req.method === "HEAD" || (!isMessages && !isCount)) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (isCount) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ input_tokens: 10 }));
        return;
      }

      // A real model turn.
      const lastContent = JSON.stringify(
        reqBody.messages?.at(-1)?.content ?? "",
      );
      const info = {
        n: i,
        stream: reqBody.stream === true,
        hasToolResult: lastContent.includes('"tool_result"'),
      };
      requests.push({ ...info, body: reqBody });
      if (onRequest) onRequest(info);
      const turn = script[Math.min(i, script.length - 1)] ?? { text: "" };
      i++;
      const model = reqBody.model || "claude-mock";
      if (reqBody.stream === true) streamTurn(res, turn, model);
      else jsonTurn(res, turn, model);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({
        url: `http://127.0.0.1:${p}`,
        close: () => server.close(),
        requests,
        get count() {
          return i;
        },
      });
    });
  });
}

// CLI mode for the bash harness: `node mock-anthropic.mjs`
// reads MOCK_PORT, MOCK_SCRIPT (path to a JSON turn list), MOCK_LOG (append).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.MOCK_PORT || 8799);
  const script = process.env.MOCK_SCRIPT
    ? JSON.parse(readFileSync(process.env.MOCK_SCRIPT, "utf-8"))
    : [{ text: "ok" }];
  const log = process.env.MOCK_LOG;
  await startMock(script, {
    port,
    onRequest: (info) => {
      if (log) {
        appendFileSync(
          log,
          `turn n=${info.n} stream=${info.stream} toolresult=${info.hasToolResult}\n`,
        );
      }
    },
  });
  process.stderr.write(`mock listening ${port}\n`);
}
