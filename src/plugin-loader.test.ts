/**
 * Tests for the plugin/repo harness loader (src/plugin-loader.ts) — loads the
 * real assembled machine (hooks + CLAUDE.md + skills) so a test/eval runs
 * against what ships, not a retyped subset. Model-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { loadPlugin, resolveHarness } from "./plugin-loader.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

function makePlugin(): string {
  const root = makeTmpDir("plugin");
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "demo",
      skills: "./skills/",
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh",
              },
            ],
          },
        ],
      },
    }),
  );
  writeFileSync(join(root, "CLAUDE.md"), "# demo project\n");
  mkdirSync(join(root, "skills", "foo"), { recursive: true });
  writeFileSync(join(root, "skills", "foo", "SKILL.md"), "# foo skill\n");
  return root;
}

test("loadPlugin resolves CLAUDE_PLUGIN_ROOT to the absolute plugin path", () => {
  const root = makePlugin();
  try {
    const loaded = loadPlugin(root);
    const json = JSON.stringify(loaded.settings);
    assert.ok(!json.includes("${CLAUDE_PLUGIN_ROOT}"), "token not expanded");
    assert.ok(
      json.includes(`${root}/hooks/session-start.sh`),
      "abs path present",
    );
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin materializes CLAUDE.md and skills into the sandbox", () => {
  const root = makePlugin();
  try {
    const { files } = loadPlugin(root);
    assert.equal(files["CLAUDE.md"], "# demo project\n");
    assert.equal(
      files[join(".claude", "skills", "foo", "SKILL.md")],
      "# foo skill\n",
    );
  } finally {
    cleanupTmpDir(root);
  }
});

test("resolveHarness layers inline settings/files over the plugin", () => {
  const root = makePlugin();
  try {
    const { settings, files } = resolveHarness({
      plugin: root,
      settings: {
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo extra" }] },
          ],
          Stop: [{ hooks: [{ type: "command", command: "exit 0" }] }],
        },
      },
      files: { "extra.txt": "x" },
    });
    const s = settings as { hooks: Record<string, unknown[]> };
    // plugin SessionStart + inline SessionStart are concatenated
    assert.equal(s.hooks.SessionStart.length, 2);
    // inline-only event is present
    assert.equal(s.hooks.Stop.length, 1);
    // plugin files + inline files both present
    assert.equal(files["CLAUDE.md"], "# demo project\n");
    assert.equal(files["extra.txt"], "x");
  } finally {
    cleanupTmpDir(root);
  }
});

test("resolveHarness with no plugin and no settings yields undefined settings", () => {
  const r = resolveHarness({});
  assert.equal(r.settings, undefined);
  assert.deepEqual(r.files, {});
});

test("resolveHarness passes inline settings through when no plugin", () => {
  const inline = { hooks: { Stop: [{ hooks: [] }] } };
  const r = resolveHarness({ settings: inline });
  assert.deepEqual(r.settings, inline);
});

test("loadPlugin reads a plain repo's .claude/settings.json (no plugin manifest)", () => {
  const root = makeTmpDir("repo");
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "exit 0" }],
            },
          ],
        },
      }),
    );
    const loaded = loadPlugin(root);
    const s = loaded.settings as { hooks?: Record<string, unknown[]> };
    assert.equal(s.hooks?.PreToolUse?.length, 1);
  } finally {
    cleanupTmpDir(root);
  }
});

test("the plugin manifest wins when both it and .claude/settings.json exist", () => {
  const root = makeTmpDir("both");
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo manifest" }] }],
        },
      }),
    );
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo settings" }] }],
        },
      }),
    );
    const loaded = loadPlugin(root);
    assert.ok(JSON.stringify(loaded.settings).includes("manifest"));
    assert.ok(!JSON.stringify(loaded.settings).includes("settings"));
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin reads the hooks/hooks.json convention (e.g. obra/superpowers)", () => {
  const root = makeTmpDir("conv");
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    mkdirSync(join(root, "hooks"), { recursive: true });
    // plugin.json with NO inline hooks — hooks live in hooks/hooks.json
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "conv" }),
    );
    writeFileSync(
      join(root, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/run.sh",
                },
              ],
            },
          ],
        },
      }),
    );
    const loaded = loadPlugin(root);
    const s = loaded.settings as { hooks?: Record<string, unknown[]> };
    assert.equal(s.hooks?.SessionStart?.length, 1);
    assert.ok(JSON.stringify(s).includes(`${root}/hooks/run.sh`));
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin follows a `hooks` string path in plugin.json", () => {
  const root = makeTmpDir("hookspath");
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    mkdirSync(join(root, "hooks"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "p", hooks: "./hooks/custom.json" }),
    );
    writeFileSync(
      join(root, "hooks", "custom.json"),
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command: "exit 0" }] }] },
      }),
    );
    const loaded = loadPlugin(root);
    const s = loaded.settings as { hooks?: Record<string, unknown[]> };
    assert.equal(s.hooks?.Stop?.length, 1);
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin on a bare dir (CLAUDE.md only, no hooks) yields empty settings", () => {
  const root = makeTmpDir("bare");
  try {
    writeFileSync(join(root, "CLAUDE.md"), "# bare\n");
    const loaded = loadPlugin(root);
    assert.deepEqual(loaded.settings, {});
    assert.equal(loaded.files["CLAUDE.md"], "# bare\n");
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin materializes agents/ and commands/ and warns they need a model", () => {
  // The wshobson/agents shape: a plugin built from subagents + slash commands,
  // no hooks. Before this, the loader dropped both and could return an empty
  // machine; now they're materialized and flagged for the eval tier.
  const root = makeTmpDir("agentplugin");
  try {
    mkdirSync(join(root, "agents"), { recursive: true });
    mkdirSync(join(root, "commands"), { recursive: true });
    writeFileSync(join(root, "agents", "reviewer.md"), "# reviewer agent\n");
    writeFileSync(join(root, "commands", "tdd.md"), "# /tdd command\n");
    const loaded = loadPlugin(root);
    assert.equal(
      loaded.files[join(".claude", "agents", "reviewer.md")],
      "# reviewer agent\n",
    );
    assert.equal(
      loaded.files[join(".claude", "commands", "tdd.md")],
      "# /tdd command\n",
    );
    const w = loaded.warnings.join("\n");
    assert.ok(w.includes("subagent"), "warns about subagents");
    assert.ok(w.includes("slash-command"), "warns about commands");
    // not the empty-machine warning — files were loaded
    assert.ok(!w.includes("nothing was loaded"));
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin warns on an effectively empty plugin (no hooks, no files)", () => {
  const root = makeTmpDir("emptyplugin");
  try {
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "empty" }),
    );
    const loaded = loadPlugin(root);
    assert.ok(loaded.warnings.some((w) => w.includes("nothing was loaded")));
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin warns when a plugin declares MCP servers", () => {
  const root = makeTmpDir("mcpplugin");
  try {
    writeFileSync(join(root, "CLAUDE.md"), "# x\n");
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { demo: { command: "x" } } }),
    );
    const loaded = loadPlugin(root);
    assert.ok(loaded.warnings.some((w) => w.includes("MCP")));
  } finally {
    cleanupTmpDir(root);
  }
});

test("a fully-covered plugin (hooks + CLAUDE.md + skills) has no warnings", () => {
  const root = makePlugin();
  try {
    assert.deepEqual(loadPlugin(root).warnings, []);
  } finally {
    cleanupTmpDir(root);
  }
});

test("loadPlugin reads the in-repo vigiles plugin (dogfood)", () => {
  // The repo's own .claude-plugin/plugin.json — proves the loader parses the
  // real shipped manifest, not just a fixture.
  const loaded = loadPlugin(process.cwd());
  const s = loaded.settings as { hooks?: Record<string, unknown[]> };
  assert.ok(s.hooks, "vigiles plugin has hooks");
  assert.ok(
    !JSON.stringify(s).includes("${CLAUDE_PLUGIN_ROOT}"),
    "token expanded",
  );
  assert.ok(typeof loaded.files["CLAUDE.md"] === "string", "CLAUDE.md loaded");
});
