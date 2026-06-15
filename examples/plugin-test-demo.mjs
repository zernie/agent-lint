/**
 * A plain-language demo: use vigiles to test a REAL Claude Code plugin.
 *
 *   npm run demo:plugin      (or: node examples/plugin-test-demo.mjs)
 *
 * It narrates, in plain words, what vigiles checks about a third-party plugin —
 * what it ships, what one of its hooks does, and what it phones home to — using a
 * real, popular plugin (oh-my-claudecode, ~36k★) vendored under examples/harness/.
 * No API key. The network check needs Linux + bubblewrap; it self-skips otherwise.
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";

import { loadPlugin } from "../dist/adapters/claude-code/plugin-loader.js";
import { runHook } from "../dist/run-hook.js";
import { sandboxAvailable } from "../dist/sandbox.js";

const ROOT = fileURLToPath(
  new URL("./harness/vendor/oh-my-claudecode@deee3a4", import.meta.url),
);
const line = (s = "") => console.log(s);

line("┌─────────────────────────────────────────────────────────────┐");
line("│  vigiles — testing a REAL Claude Code plugin                 │");
line("└─────────────────────────────────────────────────────────────┘");
line();
line("The plugin under test: oh-my-claudecode — a popular (~36k★),");
line("third-party Claude Code plugin. We didn't write it; we test it.");
line();

// 1) What does it ship?  (loadPlugin reads the plugin the way Claude Code does)
const p = loadPlugin(ROOT);
const hooks = Object.keys(p.settings.hooks ?? {});
const skills = Object.keys(p.files).filter((f) =>
  f.endsWith("SKILL.md"),
).length;
const agents = Object.keys(p.files).filter((f) =>
  f.includes("/agents/"),
).length;
const hasMcp = p.warnings.some((w) => w.includes("MCP"));
line("1. What does it ship?");
line(`   • hooks (code that runs on events): ${hooks.join(", ")}`);
line(
  `   • skills: ${skills}   • agents: ${agents}   • MCP server: ${hasMcp ? "yes" : "no"}`,
);
line();

// 2) Does one of its hooks do what it claims?  (runHook — no model, instant)
line("2. Does its `keyword-detector` hook work?");
line("   (it should inject skill-routing when you type a magic keyword)");
const k = runHook(
  `node "${ROOT}/scripts/run.cjs" "${ROOT}/scripts/keyword-detector.mjs"`,
  { hook_event_name: "UserPromptSubmit", prompt: "please ultrawork on this" },
  { env: { CLAUDE_PLUGIN_ROOT: ROOT } },
);
const injected = k.json?.hookSpecificOutput?.additionalContext ?? "";
line(
  `   → ${/ULTRAWORK/.test(injected) ? "✓ yes — it injected ULTRAWORK routing" : "✗ no"}`,
);
line();

// 3) What does it do on the NETWORK?  (record + block its egress)
line(
  "3. What does it phone home to?  (we record every network attempt AND block it)",
);
if (!sandboxAvailable()) {
  line(
    "   (skipped — needs Linux + bubblewrap to confine + record the network)",
  );
} else {
  const ws = mkdtempSync(join(tmpdir(), "demo-ws-"));
  writeFileSync(join(ws, ".omc-workspace"), "");
  const r = runHook(
    `node "${ROOT}/scripts/run.cjs" "${ROOT}/scripts/session-start.mjs"`,
    { hook_event_name: "SessionStart", source: "startup" },
    {
      recordEgress: true,
      cwd: ws,
      env: {
        CLAUDE_PLUGIN_ROOT: ROOT,
        OMC_STATE_DIR: mkdtempSync(join(tmpdir(), "demo-state-")),
      },
      timeoutMs: 30000,
    },
  );
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (r.egress.length === 0) {
    line(
      nodeMajor < 22
        ? "   (no egress captured — recording a Node fetch() needs Node 22+; you're on " +
            process.versions.node +
            ")"
        : "   → it made no network calls.",
    );
  } else {
    for (const e of r.egress)
      line(`   → it tried to reach ${e.host}:${e.port}`);
    line(
      "   That's its silent 'check npm for a new version' on every session start.",
    );
    line(
      "   Nothing actually left this machine — we recorded the attempt and blocked it.",
    );
  }
}
line();
line("─────────────────────────────────────────────────────────────");
line("That's vigiles testing a plugin: what it ships, what its hooks");
line("do, and what it phones home — so you can trust it before you run it.");
