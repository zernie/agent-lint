/**
 * Tool-fake interception test suite — pure, model-free.
 *
 * Build fake declarations and assert the decision (fake vs run, with the right
 * canned result), the PreToolUse settings fragment, and the env round-trip
 * (including RegExp matchers, which a naive JSON.stringify would drop).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  decideFakeTool,
  fakeToolHookDecision,
  buildFakeToolSettings,
  serializeFakeTools,
  parseFakeTools,
  DEFAULT_FAKE_RESULT,
  FAKE_TOOLS_ENV,
  type FakeTool,
} from "./tool-fake.js";

test("decideFakeTool(): unconditional fake returns the canned (or default) result", () => {
  const fakes: FakeTool[] = [{ tool: "WebFetch", result: "<canned body>" }];
  const d = decideFakeTool("WebFetch", { url: "https://x" }, fakes);
  assert.deepEqual(d, { fake: true, result: "<canned body>" });

  // no result → the default marker
  const d2 = decideFakeTool("WebFetch", {}, [{ tool: "WebFetch" }]);
  assert.deepEqual(d2, { fake: true, result: DEFAULT_FAKE_RESULT });

  // unrelated tool → run for real
  assert.deepEqual(decideFakeTool("Read", {}, fakes), { fake: false });
});

test("decideFakeTool(): `when` scopes the fake to matching args", () => {
  // fake only a push to main; other Bash runs for real
  const fakes: FakeTool[] = [
    {
      tool: "Bash",
      when: { command: /push origin main\b/ },
      result: "pushed (fake)",
    },
  ];
  assert.deepEqual(
    decideFakeTool("Bash", { command: "git push origin main" }, fakes),
    { fake: true, result: "pushed (fake)" },
  );
  assert.deepEqual(decideFakeTool("Bash", { command: "git status" }, fakes), {
    fake: false,
  });
});

test("decideFakeTool(): first matching fake wins", () => {
  const fakes: FakeTool[] = [
    { tool: "Bash", when: { command: /rm -rf/ }, result: "blocked-ish" },
    { tool: "Bash", result: "generic" },
  ];
  assert.equal(
    decideFakeTool("Bash", { command: "rm -rf /" }, fakes).fake && true,
    true,
  );
  const d = decideFakeTool("Bash", { command: "rm -rf /" }, fakes);
  assert.equal(d.fake ? d.result : "", "blocked-ish");
  // a non-rm Bash falls through to the generic fake
  const d2 = decideFakeTool("Bash", { command: "ls" }, fakes);
  assert.equal(d2.fake ? d2.result : "", "generic");
});

test("fakeToolHookDecision(): parses a PreToolUse event; tolerant of malformed input", () => {
  const fakes: FakeTool[] = [{ tool: "Bash", when: { command: /push/ } }];
  const ev = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git push" },
  });
  assert.equal(fakeToolHookDecision(ev, fakes).fake, true);

  // no tool_name → no-op (let it run)
  assert.deepEqual(fakeToolHookDecision(JSON.stringify({}), fakes), {
    fake: false,
  });
  // malformed JSON → no-op, never throws
  assert.deepEqual(fakeToolHookDecision("{not json", fakes), { fake: false });
  // missing tool_input defaults to {} (no `when` match) → run
  assert.deepEqual(
    fakeToolHookDecision(JSON.stringify({ tool_name: "Bash" }), fakes),
    { fake: false },
  );
});

test("buildFakeToolSettings(): a PreToolUse hook matching the union of faked tools", () => {
  const s = buildFakeToolSettings([
    { tool: "Bash" },
    { tool: "WebFetch" },
    { tool: "Bash" }, // dup collapses
  ]);
  const entry = s.hooks.PreToolUse[0] as {
    matcher: string;
    hooks: { type: string; command: string }[];
  };
  assert.equal(entry.matcher, "Bash|WebFetch");
  assert.equal(entry.hooks[0].command, "npx vigiles fake-tool-hook");
  assert.equal(entry.hooks[0].type, "command");

  // mcp tool names carry regex metachars → escaped so the matcher is literal
  const mcp = buildFakeToolSettings([{ tool: "mcp__img__gen" }], {
    command: "node hook.js",
  });
  const mentry = mcp.hooks.PreToolUse[0] as { matcher: string };
  assert.equal(mentry.matcher, "mcp__img__gen");
});

test("serializeFakeTools/parseFakeTools(): round-trips, RegExp matchers survive", () => {
  const fakes: FakeTool[] = [
    { tool: "Bash", when: { command: /push origin main\b/i }, result: "ok" },
    { tool: "WebFetch" },
  ];
  const round = parseFakeTools(serializeFakeTools(fakes));
  assert.equal(round.length, 2);
  assert.equal(round[0].tool, "Bash");
  assert.equal(round[0].result, "ok");
  // the RegExp came back as a working RegExp (not dropped to {})
  const when = round[0].when ?? {};
  const re = when.command;
  assert.ok(re instanceof RegExp);
  assert.equal(re.test("git push origin MAIN"), true); // i flag preserved
  assert.equal(re.test("git push origin feature"), false);
  // decideFakeTool works over the parsed-back fakes
  assert.equal(
    decideFakeTool("Bash", { command: "git push origin main" }, round).fake,
    true,
  );

  // exact (non-regex) matchers survive too
  const exact = parseFakeTools(
    serializeFakeTools([{ tool: "Bash", when: { command: "ls" } }]),
  );
  assert.equal(exact[0].when?.command, "ls");
});

test("parseFakeTools(): tolerant of junk", () => {
  assert.deepEqual(parseFakeTools("not json"), []);
  assert.deepEqual(parseFakeTools(JSON.stringify({ not: "array" })), []);
  // entries without a string `tool` are skipped; valid ones kept
  const mixed = parseFakeTools(
    JSON.stringify([{ tool: 1 }, null, "x", { tool: "Bash" }]),
  );
  assert.deepEqual(mixed, [
    { tool: "Bash", result: undefined, when: undefined },
  ]);
});

test("FAKE_TOOLS_ENV is the documented var name", () => {
  assert.equal(FAKE_TOOLS_ENV, "VIGILES_FAKE_TOOLS");
});
