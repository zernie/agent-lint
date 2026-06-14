/**
 * `vigiles scan` test suite. Builds a tiny fake plugin in a tmp dir and asserts
 * the deterministic report: skill description/user-invoked flags, agent tool
 * contracts (incl. the inherits-all footgun), hook script resolution across the
 * braced/unbraced `$CLAUDE_PLUGIN_ROOT` forms (ok / missing / unresolved),
 * command + MCP detection, and the formatted output. No model, no network.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scanPlugin, formatScanReport } from "./scan.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function fixture(): string {
  const dir = makeTmpDir("scan");
  write(
    dir,
    "skills/good/SKILL.md",
    "---\nname: good\ndescription: A skill that does good things across many cases\n---\n# good\n",
  );
  write(dir, "skills/nodesc/SKILL.md", "---\nname: nodesc\n---\n# nodesc\n");
  write(
    dir,
    "skills/cmd/SKILL.md",
    "---\nname: cmd\ndescription: A user-invoked command skill for tests here\ndisable-model-invocation: true\n---\n# cmd\n",
  );
  write(
    dir,
    "agents/withtools.md",
    "---\nname: withtools\ntools: Read, Grep\n---\nbody\n",
  );
  write(dir, "agents/notools.md", "---\nname: notools\n---\nbody\n");
  write(dir, "commands/doit.md", "# doit command\n");
  write(dir, "hooks/present.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "fix",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/present.sh",
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash $CLAUDE_PLUGIN_ROOT/hooks/absent.sh",
              },
            ],
          },
        ],
        SessionStart: [
          { hooks: [{ type: "command", command: 'bash "$HOME"/weird.sh' }] },
        ],
        Stop: [{ hooks: [{ type: "command", command: "npm test" }] }],
      },
    }),
  );
  write(
    dir,
    ".mcp.json",
    JSON.stringify({
      mcpServers: { demo: { command: "node", args: ["s.js"] } },
    }),
  );
  return dir;
}

test("scanPlugin reports skills with description + user-invoked flags", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byName = Object.fromEntries(r.skills.map((s) => [s.name, s]));
  assert.equal(r.skills.length, 3);
  assert.equal(byName.good.hasDescription, true);
  assert.equal(byName.good.userInvoked, false);
  assert.equal(byName.nodesc.hasDescription, false);
  assert.equal(byName.cmd.userInvoked, true);
  cleanupTmpDir(dir);
});

test("scanPlugin reports agent tool contracts incl. inherits-all", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byName = Object.fromEntries(r.agents.map((a) => [a.name, a]));
  assert.deepEqual(byName.withtools.tools, ["Read", "Grep"]);
  assert.equal(byName.notools.tools, null); // no tools: line → inherits all
  cleanupTmpDir(dir);
});

test("scanPlugin resolves hook scripts: ok / missing / unresolved", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  const byBase = (suffix: string) =>
    r.hooks.find((h) => h.script.endsWith(suffix));
  assert.equal(byBase("hooks/present.sh")?.status, "ok"); // ${CLAUDE_PLUGIN_ROOT}
  assert.equal(byBase("hooks/absent.sh")?.status, "missing"); // $CLAUDE_PLUGIN_ROOT, no file
  // "$HOME"/weird.sh keeps an unexpanded var → can't be path-checked
  assert.ok(r.hooks.some((h) => h.status === "unresolved"));
  assert.equal(r.inlineHooks, 1); // `npm test`
  cleanupTmpDir(dir);
});

test("scanPlugin counts commands and detects MCP", () => {
  const dir = fixture();
  const r = scanPlugin(dir);
  assert.equal(r.commands, 1);
  assert.equal(r.mcp, true);
  cleanupTmpDir(dir);
});

test("formatScanReport flags the missing hook + the no-description skill", () => {
  const dir = fixture();
  const text = formatScanReport(scanPlugin(dir));
  assert.ok(text.includes("structural issue")); // absent.sh + nodesc
  assert.ok(/✗ .*hooks\/absent\.sh/.test(text));
  assert.ok(text.includes("inherits all")); // the notools agent footgun
  cleanupTmpDir(dir);
});
