/**
 * Dogfood — vigiles' plugin loader against a REAL, pinned Claude Code plugin:
 * obra/superpowers (MIT). This validates the loader's headline claim — that it
 * handles the `hooks/hooks.json` convention and expands `${CLAUDE_PLUGIN_ROOT}`
 * — against actual shipped files, not a synthetic look-alike fixture.
 *
 * Reliability: the plugin is a VENDORED SNAPSHOT under ./vendor (pinned to a
 * commit, with upstream LICENSE + SOURCE). There is no clone at test time, so
 * this runs offline and deterministically — see ../../test/dogfood/<plugin>/SOURCE.
 *
 * Safety: `loadPlugin` only PARSES the harness — it never runs a hook. This
 * example verifies superpowers' SessionStart hook is correctly WIRED, key-free.
 * To actually EXECUTE that untrusted third-party hook, `runHarnessTest` now runs
 * it CONFINED by default under bubblewrap (`src/sandbox.ts`) — see the dogfood in
 * `src/sandbox.test.ts`, which runs this same hook in a no-egress sandbox and
 * checks its real output (and shows, via `trace.modelRequests`, that its
 * top-level `additionalContext` does NOT reach Claude Code — "fired ≠ landed").
 *
 * Pure + key-free: needs neither the `claude` CLI nor an API key, so it runs in
 * CI for free. Run: `node examples/harness/real-superpowers.harness.mjs`.
 */
import { fileURLToPath } from "node:url";
import { loadPlugin } from "../../dist/adapters/claude-code/plugin-loader.js";

const dir = fileURLToPath(
  new URL("../../test/dogfood/superpowers@6fd4507", import.meta.url),
);
const loaded = loadPlugin(dir);

// 1. The `hooks/hooks.json` convention was auto-discovered → SessionStart present.
const hooks = loaded.settings.hooks ?? {};
if (!hooks.SessionStart) {
  throw new Error(
    `expected a SessionStart hook from hooks/hooks.json; got events: ${JSON.stringify(Object.keys(hooks))}`,
  );
}

// 2. `${CLAUDE_PLUGIN_ROOT}` was expanded to the real absolute path, so the
//    shipped script would run verbatim under a sandboxed exec tier.
const command = hooks.SessionStart[0].hooks[0].command;
if (command.includes("${CLAUDE_PLUGIN_ROOT}")) {
  throw new Error(`\${CLAUDE_PLUGIN_ROOT} was not expanded: ${command}`);
}
if (!command.includes(dir)) {
  throw new Error(
    `expanded hook command does not point at the vendor dir: ${command}`,
  );
}

// 3. The skills surface was materialized into the sandbox.
const skillFiles = Object.keys(loaded.files).filter(
  (f) => f.startsWith(".claude/skills/") && f.endsWith("SKILL.md"),
);
if (skillFiles.length < 1) {
  throw new Error("expected at least one SKILL.md to be materialized");
}

console.log(
  `✓ superpowers: SessionStart wired + \${CLAUDE_PLUGIN_ROOT} expanded; ${skillFiles.length} skill(s) materialized`,
);
for (const w of loaded.warnings) console.log(`  ⚠ ${w}`);
console.log(
  "\nNote: loadPlugin parsed the harness; it did NOT execute the SessionStart\n" +
    "setup hook. Wiring is verified here; CONFINED execution of this same hook is\n" +
    "dogfooded in src/sandbox.test.ts (bubblewrap, no egress). No code ran here.",
);
console.log("\n1 passed.");
