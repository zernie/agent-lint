/**
 * Dogfood — vigiles' plugin loader against the dominant real-world marketplace
 * shape: one sub-plugin of wshobson/agents (MIT) made of subagents + slash
 * commands + skills with NO hooks. This is the case the loader exists to handle
 * safely: the deterministic tier has nothing to fire, so the loader must
 * MATERIALIZE the surfaces and WARN — never silently pass an empty machine.
 *
 * Reliability + safety: a VENDORED SNAPSHOT under ./vendor (pinned, offline);
 * `loadPlugin` only parses. See ./vendor/<plugin>/SOURCE and the sibling
 * real-superpowers.harness.mjs header for the full rationale.
 *
 * Pure + key-free: no `claude` CLI, no API key. Run:
 * `node examples/harness/real-wshobson.harness.mjs`.
 */
import { fileURLToPath } from "node:url";
import { loadPlugin } from "../../dist/adapters/claude-code/plugin-loader.js";

const dir = fileURLToPath(
  new URL("./vendor/wshobson-accessibility@cf6059d", import.meta.url),
);
const loaded = loadPlugin(dir);

// 1. This shape ships NO hooks — there is nothing for the deterministic tier.
if (loaded.settings.hooks !== undefined) {
  throw new Error(
    `expected no hooks; got events: ${JSON.stringify(Object.keys(loaded.settings.hooks))}`,
  );
}

// 2. agents + commands + skills were all materialized into the sandbox.
const under = (p) => Object.keys(loaded.files).filter((f) => f.startsWith(p));
const agents = under(".claude/agents/");
const commands = under(".claude/commands/");
const skills = under(".claude/skills/");
if (!agents.length || !commands.length || !skills.length) {
  throw new Error(
    `expected agents+commands+skills materialized; got agents=${agents.length} commands=${commands.length} skills=${skills.length}`,
  );
}

// 3. The loader WARNED that subagents + slash commands need the eval tier — the
//    proof it does not silently test an empty machine.
const warningText = loaded.warnings.join("\n");
if (!/subagent/.test(warningText) || !/slash-command/.test(warningText)) {
  throw new Error(
    `expected warnings flagging subagents + slash commands; got:\n${warningText}`,
  );
}

console.log(
  `✓ wshobson sub-plugin: 0 hooks; materialized ${agents.length} agent / ${commands.length} command / ${skills.length} skill file(s)`,
);
for (const w of loaded.warnings) console.log(`  ⚠ ${w}`);
console.log(
  "\nCoverage: no hooks to drive deterministically; the loader flagged the\n" +
    "subagent + slash-command surfaces for the eval tier instead of passing an\n" +
    "empty machine. That flagging IS the result.",
);
console.log("\n1 passed.");
