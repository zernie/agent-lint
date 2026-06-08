/**
 * vigiles — a scripted, deterministic Anthropic Messages API mock.
 *
 * Point a Claude Code client at it with `ANTHROPIC_BASE_URL` (and any dummy
 * `ANTHROPIC_API_KEY`) and it serves a fixed *script* of model turns in order —
 * each `POST /v1/messages` returns the next. This is the seam that makes harness
 * testing deterministic: the real `claude` CLI runs your real hooks/settings,
 * but the model's turns are scripted, so the outcome is reproducible and free.
 *
 *   scriptModel([
 *     { tool: "Write", input: { file_path: "SKILL.md", content: "..." } },
 *     { text: "done" },
 *   ])
 *
 * Implements the parts a real client needs: SSE streaming (flushed per event),
 * `/v1/messages/count_tokens` (else Claude Code hangs), HEAD/health tolerance,
 * and echoing the requested model.
 */
import http from "node:http";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One scripted assistant turn: a final text answer, or a tool call. */
export interface ModelTurn {
  /** Final text answer (stops the turn). */
  readonly text?: string;
  /** A tool to invoke, e.g. "Bash" | "Write" | "Edit". */
  readonly tool?: string;
  /** The tool input, e.g. `{ file_path, content }` or `{ command }`. */
  readonly input?: Record<string, unknown>;
}

/** Build a scripted model from an ordered list of turns. */
export function scriptModel(turns: readonly ModelTurn[]): ModelTurn[] {
  return [...turns];
}

export interface TurnInfo {
  readonly n: number;
  readonly stream: boolean;
  readonly hasToolResult: boolean;
}

export interface MockHandle {
  readonly url: string;
  close(): void;
  /** Number of model turns served so far. */
  readonly count: number;
}

function writeEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const rid = (p: string): string =>
  `${p}${Math.random().toString(36).slice(2, 10)}`;

function streamTurn(res: ServerResponse, turn: ModelTurn, model: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  writeEvent(res, "message_start", {
    type: "message_start",
    message: {
      id: rid("msg_"),
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
  if (turn.tool) {
    writeEvent(res, "content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: rid("toolu_"),
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

function jsonTurn(res: ServerResponse, turn: ModelTurn, model: string): void {
  const content = turn.tool
    ? [
        {
          type: "tool_use",
          id: rid("toolu_"),
          name: turn.tool,
          input: turn.input ?? {},
        },
      ]
    : [{ type: "text", text: turn.text ?? "" }];
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: rid("msg_"),
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

interface ReqBody {
  stream?: boolean;
  model?: string;
  messages?: { content?: unknown }[];
}

/**
 * Start the scripted mock on a free port. Each `/v1/messages` POST consumes the
 * next turn (the last turn repeats if the client asks for more). Resolves to a
 * handle with the base `url` and a `close()`.
 */
export function startMock(
  script: readonly ModelTurn[],
  opts: { onTurn?: (info: TurnInfo) => void } = {},
): Promise<MockHandle> {
  let i = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c as string));
    req.on("end", () => {
      const url = req.url ?? "";
      const isCount = url.includes("count_tokens");
      const isMessages = url.includes("/v1/messages") && !isCount;
      let reqBody: ReqBody = {};
      try {
        reqBody = JSON.parse(body) as ReqBody;
      } catch {
        /* HEAD / health checks have no JSON body */
      }
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
      const last = JSON.stringify(reqBody.messages?.at(-1)?.content ?? "");
      opts.onTurn?.({
        n: i,
        stream: reqBody.stream === true,
        hasToolResult: last.includes('"tool_result"'),
      });
      const turn = script[Math.min(i, script.length - 1)] ?? { text: "" };
      i++;
      const model = reqBody.model ?? "claude-mock";
      if (reqBody.stream === true) streamTurn(res, turn, model);
      else jsonTurn(res, turn, model);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${String(port)}`,
        close: () => server.close(),
        get count() {
          return i;
        },
      });
    });
  });
}
