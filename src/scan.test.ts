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

import { scanPlugin, formatScanReport, expandMarketplace } from "./scan.js";
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

test("scanPlugin does not misclassify a '-agents' skill dir as an agent", () => {
  // Regression: obra/superpowers ships skills/dispatching-parallel-agents/SKILL.md.
  // The old unanchored /agents\/[^/]+\.md$/ matched the `-agents/SKILL.md`
  // substring and reported a phantom agent named "SKILL".
  const dir = makeTmpDir("scan-boundary");
  write(
    dir,
    "skills/dispatching-parallel-agents/SKILL.md",
    "---\nname: dispatching-parallel-agents\ndescription: Dispatch many subagents in parallel for fan-out work\n---\n# x\n",
  );
  write(
    dir,
    "skills/my-commands/SKILL.md",
    "---\nname: my-commands\ndescription: A skill whose directory ends in commands here\n---\n# y\n",
  );
  write(dir, "agents/real.md", "---\nname: real\ntools: Read\n---\nbody\n");
  const r = scanPlugin(dir);
  assert.deepEqual(
    r.agents.map((a) => a.name),
    ["real"],
  );
  assert.equal(r.skills.length, 2);
  assert.equal(r.commands, 0); // the `my-commands` skill dir is not a command
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

test("scanPlugin surfaces a dangling intra-plugin reference as a structural issue", () => {
  const dir = makeTmpDir("scan-dangling");
  // A skill body that points at a sibling skill file which doesn't exist —
  // the partial-vendor / broken-path class (obra/superpowers hit this twice).
  write(
    dir,
    "skills/using-x/SKILL.md",
    "---\nname: using-x\ndescription: read skills/missing-helper/SKILL.md for the details here\n---\nSee skills/missing-helper/SKILL.md\n",
  );
  const r = scanPlugin(dir);
  assert.deepEqual(r.danglingRefs, ["skills/missing-helper/SKILL.md"]);
  const text = formatScanReport(r);
  assert.ok(text.includes("Broken references"));
  assert.ok(/✗ skills\/missing-helper\/SKILL\.md/.test(text));
  assert.ok(text.includes("structural issue")); // counted in the verdict
  // shown once (as a ✗), not duplicated in the free-text Warnings block
  assert.ok(!text.includes("intra-plugin file(s) that don't exist"));
  cleanupTmpDir(dir);
});

test("expandMarketplace expands a marketplace root into member plugin dirs", () => {
  const dir = makeTmpDir("scan-mp");
  write(
    dir,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "mp",
      plugins: [
        { name: "a", source: "./plugins/a" },
        { name: "b", source: "./plugins/b" },
        { name: "gone", source: "./plugins/gone" }, // dir doesn't exist → skipped
        { name: "ext", source: { source: "github", repo: "x/y" } }, // not on disk → skipped
      ],
    }),
  );
  write(dir, "plugins/a/skills/sa/SKILL.md", "---\nname: sa\n---\n# sa\n");
  write(dir, "plugins/b/skills/sb/SKILL.md", "---\nname: sb\n---\n# sb\n");
  const members = expandMarketplace(dir);
  assert.ok(members);
  assert.equal(members.length, 2); // gone + ext skipped
  assert.ok(
    members.every((m) => m.endsWith("plugins/a") || m.endsWith("plugins/b")),
  );
  // a non-marketplace dir returns null
  assert.equal(expandMarketplace(join(dir, "plugins/a")), null);
  cleanupTmpDir(dir);
});
