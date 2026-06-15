/**
 * Tests for the scripted Anthropic mock (src/mock-model.ts). The mock is an
 * in-process HTTP server, so its full behaviour — SSE vs JSON turns, tool vs
 * text turns, count_tokens / HEAD / health tolerance, the onTurn probe, and the
 * last-turn-repeat / empty-script defaults — is testable directly, no claude.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  startMock,
  scriptModel,
  extractRequest,
  type TurnInfo,
} from "./mock-model.js";

const post = (url: string, body: unknown): Promise<Response> =>
  fetch(`${url}/v1/messages`, { method: "POST", body: JSON.stringify(body) });

interface MsgBlock {
  type?: string;
  text?: string;
  input?: unknown;
}
interface MsgResponse {
  content?: MsgBlock[];
  stop_reason?: string;
  model?: string;
}
const readMsg = async (r: Response): Promise<MsgResponse> =>
  (await r.json()) as MsgResponse;

test("startMock: SSE and JSON turns, tool and text, count/HEAD/health, onTurn", async () => {
  const seen: TurnInfo[] = [];
  // Two mocks so all four (stream|json) × (tool|text) combinations are exercised.
  const streamMock = await startMock(
    scriptModel([
      { tool: "Bash", input: { command: "ls" } },
      { text: "all done" },
      { tool: "NoInput" }, // tool turn with no input → `turn.input ?? {}`
      {}, // turn with neither tool nor text → `turn.text ?? ""`
    ]),
    { onTurn: (info) => seen.push(info) },
  );
  try {
    // turn 0: streaming tool turn → streamTurn (tool branch)
    const sse = await (
      await post(streamMock.url, {
        stream: true,
        model: "m",
        messages: [{ content: "go" }],
      })
    ).text();
    assert.match(sse, /"type":"tool_use"/);
    assert.match(sse, /"name":"Bash"/);
    // turn 1: streaming text turn → streamTurn (text branch); a tool_result in
    // the request exercises the onTurn hasToolResult probe.
    const sse2 = await (
      await post(streamMock.url, {
        stream: true,
        messages: [{ content: [{ type: "tool_result", content: "x" }] }],
      })
    ).text();
    assert.match(sse2, /"text_delta"/);
    assert.match(sse2, /all done/);
    // turns 2 & 3: streaming tool turn with no input, then a no-text turn —
    // exercising the `turn.input ?? {}` / `turn.text ?? ""` defaults.
    assert.match(
      await (
        await post(streamMock.url, {
          stream: true,
          messages: [{ content: "x" }],
        })
      ).text(),
      /"name":"NoInput"/,
    );
    assert.match(
      await (
        await post(streamMock.url, {
          stream: true,
          messages: [{ content: "x" }],
        })
      ).text(),
      /message_stop/,
    );

    // count_tokens (else Claude Code hangs)
    const counted = (await (
      await fetch(`${streamMock.url}/v1/messages/count_tokens`, {
        method: "POST",
        body: "{}",
      })
    ).json()) as unknown;
    assert.deepEqual(counted, { input_tokens: 10 });

    // HEAD + a non-messages health GET both return {}
    assert.equal(
      (await fetch(`${streamMock.url}/v1/messages`, { method: "HEAD" })).status,
      200,
    );
    assert.deepEqual(
      (await (await fetch(`${streamMock.url}/health`)).json()) as unknown,
      {},
    );

    assert.equal(seen[0]?.stream, true);
    assert.equal(seen[1]?.hasToolResult, true);
    assert.ok(streamMock.count >= 2);
  } finally {
    streamMock.close();
  }

  const jsonMock = await startMock(
    scriptModel([
      { tool: "Bash", input: { command: "ls" } },
      { text: "ok" },
      { tool: "NoInput" }, // tool turn with no input → `turn.input ?? {}`
    ]),
  );
  try {
    // turn 0: non-streaming tool turn → jsonTurn (tool branch)
    const tool = await readMsg(
      await post(jsonMock.url, { messages: [{ content: "go" }] }),
    );
    assert.equal(tool.content?.[0]?.type, "tool_use");
    assert.equal(tool.stop_reason, "tool_use");
    // turn 1: non-streaming text turn (no model → default echo) → jsonTurn (text)
    const txt = await readMsg(
      await post(jsonMock.url, { messages: [{ content: "go" }] }),
    );
    assert.equal(txt.content?.[0]?.text, "ok");
    assert.equal(txt.model, "claude-mock");
    // turn 2: non-streaming tool turn with no input → `turn.input ?? {}`
    const noInput = await readMsg(
      await post(jsonMock.url, { messages: [{ content: "go" }] }),
    );
    assert.deepEqual(noInput.content?.[0]?.input, {});
  } finally {
    jsonMock.close();
  }
});

test("extractRequest: flattens system + messages, tolerates odd shapes", () => {
  // system as a string; message content as a string
  assert.deepEqual(
    extractRequest({
      system: "be brief",
      messages: [{ role: "user", content: "go" }],
    }),
    { system: "be brief", messages: [{ role: "user", text: "go" }] },
  );
  // system as a text-block array; content as a block array (text + non-text)
  assert.deepEqual(
    extractRequest({
      system: [
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ],
      messages: [
        {
          role: "user",
          content: [
            "raw",
            { type: "text", text: "C" },
            { type: "tool_result", content: "ignored" }, // no `text` → ""
          ],
        },
      ],
    }),
    { system: "AB", messages: [{ role: "user", text: "rawC" }] },
  );
  // missing system → ""; missing role → ""; non-array messages → []
  assert.deepEqual(extractRequest({ messages: [{ content: "x" }] }), {
    system: "",
    messages: [{ role: "", text: "x" }],
  });
  assert.deepEqual(extractRequest({}), { system: "", messages: [] });
  assert.deepEqual(extractRequest({ messages: "nope" as unknown }), {
    system: "",
    messages: [],
  });
});

test("startMock: captures each request via handle.requests", async () => {
  const mock = await startMock(scriptModel([{ text: "ok" }]));
  try {
    await post(mock.url, {
      system: "You have superpowers",
      messages: [{ role: "user", content: "go" }],
    });
    // count_tokens / HEAD must NOT be recorded as model requests
    await fetch(`${mock.url}/v1/messages/count_tokens`, {
      method: "POST",
      body: "{}",
    });
    await fetch(`${mock.url}/v1/messages`, { method: "HEAD" });
    await post(mock.url, { messages: [{ role: "user", content: "again" }] });

    assert.equal(mock.requests.length, 2);
    assert.equal(mock.requests[0]?.system, "You have superpowers");
    assert.equal(mock.requests[0]?.messages[0]?.text, "go");
    assert.equal(mock.requests[1]?.messages[0]?.text, "again");
  } finally {
    mock.close();
  }
});

test("startMock: repeats the last turn and defaults an empty script", async () => {
  const repeat = await startMock(scriptModel([{ text: "only" }]));
  try {
    for (let i = 0; i < 2; i++) {
      const j = await readMsg(
        await post(repeat.url, { messages: [{ content: "x" }] }),
      );
      assert.equal(j.content?.[0]?.text, "only"); // 2nd call repeats the last turn
    }
  } finally {
    repeat.close();
  }

  const empty = await startMock(scriptModel([]));
  try {
    // empty script + no messages field → default { text: "" }
    const j = await readMsg(await post(empty.url, {}));
    assert.equal(j.content?.[0]?.text, "");
  } finally {
    empty.close();
  }
});
