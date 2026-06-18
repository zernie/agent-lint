/** Unit tests for the pure `vigiles init` plan logic. */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  parseSetupArgs,
  defaultPlan,
  shouldPrompt,
  resolvePlan,
  planPluginInstall,
  mergeProjectConfig,
} from "./setup-plan.js";

test("defaults: both pillars, CI, plugin, non-strict", () => {
  assert.deepEqual(defaultPlan(), {
    lint: true,
    test: true,
    gha: true,
    plugin: true,
    strict: false,
    force: false,
  });
});

test("parseSetupArgs reads --force; resolvePlan carries it", () => {
  assert.equal(parseSetupArgs(["--force"]).force, true);
  assert.equal(parseSetupArgs([]).force, false);
  assert.equal(resolvePlan(parseSetupArgs(["--force"])).force, true);
  assert.equal(resolvePlan(parseSetupArgs([])).force, false);
});

test("parseSetupArgs reads flags", () => {
  const p = parseSetupArgs([
    "--test",
    "--no-gha",
    "--no-plugin",
    "--strict",
    "-y",
  ]);
  assert.equal(p.test, true);
  assert.equal(p.lint, undefined);
  assert.equal(p.gha, false);
  assert.equal(p.plugin, false);
  assert.equal(p.strict, true);
  assert.equal(p.yes, true);
});

test("parseSetupArgs reads --lint / --no-test / --harness", () => {
  const p = parseSetupArgs(["--lint", "--no-test", "--harness=claude,codex"]);
  assert.equal(p.lint, true);
  assert.equal(p.test, false);
  assert.equal(p.harness, "claude,codex");
  assert.equal(parseSetupArgs([]).lint, undefined);
  assert.equal(parseSetupArgs([]).test, undefined);
});

test("parseSetupArgs: the old --verify/--testing/--pillars flags are gone", () => {
  // Clean break — they no longer select a pillar (treated as unknown flags).
  const p = parseSetupArgs(["--verify", "--testing"]);
  assert.equal(p.lint, undefined);
  assert.equal(p.test, undefined);
  const q = parseSetupArgs(["--pillars=test"]);
  assert.equal(q.lint, undefined);
  assert.equal(q.test, undefined);
});

test("resolvePlan: a positive pillar flag selects exactly that pillar", () => {
  assert.deepEqual(resolvePlan(parseSetupArgs(["--lint"])), {
    lint: true,
    test: false,
    gha: true,
    plugin: true,
    strict: false,
    force: false,
  });
  const t = resolvePlan(parseSetupArgs(["--test"]));
  assert.equal(t.lint, false);
  assert.equal(t.test, true);
  // both named → both on
  const both = resolvePlan(parseSetupArgs(["--lint", "--test"]));
  assert.equal(both.lint, true);
  assert.equal(both.test, true);
  // --no-* drops one from the default-both
  const noTest = resolvePlan(parseSetupArgs(["--no-test"]));
  assert.equal(noTest.lint, true);
  assert.equal(noTest.test, false);
});

test("resolvePlan: --no-gha / --no-plugin / --strict / --target", () => {
  const p = resolvePlan(
    parseSetupArgs(["--no-gha", "--no-plugin", "--strict"]),
  );
  assert.equal(p.gha, false);
  assert.equal(p.plugin, false);
  assert.equal(p.strict, true);
  // --target pins a bare lint-pillar spec → no harness scaffold
  assert.equal(resolvePlan(parseSetupArgs(["--target=AGENTS.md"])).test, false);
});

test("resolvePlan: interactive answers override flags/defaults", () => {
  const p = resolvePlan(parseSetupArgs([]), { test: false, plugin: false });
  assert.equal(p.test, false);
  assert.equal(p.plugin, false);
  assert.equal(p.lint, true); // untouched
});

test("planPluginInstall: claude uses the marketplace and never vendors", () => {
  const [withCli] = planPluginInstall(["claude"], { hasClaude: true });
  assert.equal(withCli.harness, "claude");
  assert.equal(withCli.vendors, false); // the whole point of issue #1
  assert.deepEqual(withCli.commands, [
    "claude plugin marketplace add zernie/vigiles",
    "claude plugin install vigiles@vigiles",
  ]);

  // No claude CLI → no auto-run commands, but the manual /plugin steps print.
  const [noCli] = planPluginInstall(["claude"], { hasClaude: false });
  assert.deepEqual(noCli.commands, []);
  assert.ok(
    noCli.manualSteps.some((s) => s.includes("/plugin install vigiles")),
  );
  assert.equal(noCli.vendors, false);
});

test("planPluginInstall: codex installs skills GLOBALLY (-g), not vendored", () => {
  const [codex] = planPluginInstall(["codex"], { hasClaude: false });
  assert.equal(codex.harness, "codex");
  // The cross-agent skills CLI with -g → ~/.codex/skills/, not the repo.
  assert.ok(codex.commands.some((c) => /skills add .* -a codex -g/.test(c)));
  assert.equal(codex.vendors, false); // -g is global, so no repo pollution
  assert.ok(codex.notes.some((n) => /hooks/.test(n))); // honest about the gap
});

test("planPluginInstall: both harnesses → one plan each, none vendoring", () => {
  const plans = planPluginInstall(["claude", "codex"], { hasClaude: true });
  assert.deepEqual(
    plans.map((p) => p.harness),
    ["claude", "codex"],
  );
  assert.ok(plans.every((p) => !p.vendors)); // BOTH install globally
});

test("shouldPrompt: only a TTY human with unpinned choices", () => {
  const bare = parseSetupArgs([]);
  assert.equal(shouldPrompt(bare, true), true); // human, nothing pinned → ask
  assert.equal(shouldPrompt(bare, false), false); // agent/CI/pipe → never
  assert.equal(shouldPrompt(parseSetupArgs(["-y"]), true), false); // --yes
  assert.equal(
    shouldPrompt(parseSetupArgs(["--target=CLAUDE.md"]), true),
    false,
  ); // explicit target
  // every choice pinned via flags → nothing to ask
  assert.equal(
    shouldPrompt(
      parseSetupArgs(["--lint", "--test", "--no-gha", "--no-plugin"]),
      true,
    ),
    false,
  );
});

// --- mergeProjectConfig: what `vigiles init` writes to .vigilesrc.json ---

test("mergeProjectConfig: empty config gets the harness", () => {
  assert.deepEqual(
    mergeProjectConfig({}, { harness: "claude-code", strict: false }),
    {
      harness: "claude-code",
    },
  );
});

test("mergeProjectConfig: array harness is recorded as-is", () => {
  assert.deepEqual(
    mergeProjectConfig(
      {},
      { harness: ["claude-code", "codex"], strict: false },
    ),
    { harness: ["claude-code", "codex"] },
  );
});

test("mergeProjectConfig: never clobbers an existing harness (returns null)", () => {
  assert.equal(
    mergeProjectConfig(
      { harness: "codex" },
      { harness: "claude-code", strict: false },
    ),
    null,
  );
});

test("mergeProjectConfig: preserves other existing keys while adding harness", () => {
  assert.deepEqual(
    mergeProjectConfig({ maxRules: 50 }, { harness: "codex", strict: false }),
    { maxRules: 50, harness: "codex" },
  );
});

test("mergeProjectConfig: strict tightens require-spec alongside harness", () => {
  // `require-skill-spec` is deprecated, so --strict tightens only `require-spec`.
  assert.deepEqual(
    mergeProjectConfig({}, { harness: "claude-code", strict: true }),
    {
      harness: "claude-code",
      rules: { "require-spec": "error" },
    },
  );
});

test("mergeProjectConfig: strict leaves an already-set require-spec alone", () => {
  // require-spec already defined and the only rule --strict touches → nothing to
  // tighten → no write.
  const out = mergeProjectConfig(
    { harness: "codex", rules: { "require-spec": "warn" } },
    { harness: "codex", strict: true },
  );
  assert.equal(out, null);
});

test("mergeProjectConfig: fully-satisfied config returns null (no write)", () => {
  assert.equal(
    mergeProjectConfig(
      {
        harness: "codex",
        rules: { "require-spec": "error", "require-skill-spec": "error" },
      },
      { harness: "codex", strict: true },
    ),
    null,
  );
});
