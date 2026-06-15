/** Unit tests for the pure `vigiles init` plan logic. */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  parseSetupArgs,
  defaultPlan,
  shouldPrompt,
  resolvePlan,
  planPluginInstall,
} from "./setup-plan.js";

test("defaults: both pillars, CI, plugin, non-strict", () => {
  assert.deepEqual(defaultPlan(), {
    verify: true,
    test: true,
    gha: true,
    plugin: true,
    strict: false,
  });
});

test("parseSetupArgs reads flags", () => {
  const p = parseSetupArgs([
    "--testing",
    "--no-gha",
    "--no-plugin",
    "--strict",
    "-y",
  ]);
  assert.equal(p.testing, true);
  assert.equal(p.verify, undefined);
  assert.equal(p.gha, false);
  assert.equal(p.plugin, false);
  assert.equal(p.strict, true);
  assert.equal(p.yes, true);
});

test("parseSetupArgs reads --verify / --no-testing / --harness", () => {
  const p = parseSetupArgs([
    "--verify",
    "--no-testing",
    "--harness=claude,codex",
  ]);
  assert.equal(p.verify, true);
  assert.equal(p.testing, false);
  assert.equal(p.harness, "claude,codex");
  assert.equal(parseSetupArgs([]).verify, undefined);
  assert.equal(parseSetupArgs([]).testing, undefined);
});

test("parseSetupArgs: deprecated --pillars alias maps onto verify/testing", () => {
  const both = parseSetupArgs(["--pillars=both"]);
  assert.equal(both.verify, true);
  assert.equal(both.testing, true);
  const v = parseSetupArgs(["--pillars=verify"]);
  assert.equal(v.verify, true);
  assert.equal(v.testing, false);
  const bad = parseSetupArgs(["--pillars=nonsense"]);
  assert.equal(bad.verify, undefined);
  assert.equal(bad.testing, undefined);
});

test("resolvePlan: a positive pillar flag selects exactly that pillar", () => {
  assert.deepEqual(resolvePlan(parseSetupArgs(["--verify"])), {
    verify: true,
    test: false,
    gha: true,
    plugin: true,
    strict: false,
  });
  const t = resolvePlan(parseSetupArgs(["--testing"]));
  assert.equal(t.verify, false);
  assert.equal(t.test, true);
  // both named → both on
  const both = resolvePlan(parseSetupArgs(["--verify", "--testing"]));
  assert.equal(both.verify, true);
  assert.equal(both.test, true);
  // --no-* drops one from the default-both
  const noTest = resolvePlan(parseSetupArgs(["--no-testing"]));
  assert.equal(noTest.verify, true);
  assert.equal(noTest.test, false);
});

test("resolvePlan: --no-gha / --no-plugin / --strict / --target", () => {
  const p = resolvePlan(
    parseSetupArgs(["--no-gha", "--no-plugin", "--strict"]),
  );
  assert.equal(p.gha, false);
  assert.equal(p.plugin, false);
  assert.equal(p.strict, true);
  // --target pins a bare Pillar-1 spec → no harness scaffold
  assert.equal(resolvePlan(parseSetupArgs(["--target=AGENTS.md"])).test, false);
});

test("resolvePlan: interactive answers override flags/defaults", () => {
  const p = resolvePlan(parseSetupArgs([]), { test: false, plugin: false });
  assert.equal(p.test, false);
  assert.equal(p.plugin, false);
  assert.equal(p.verify, true); // untouched
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
      parseSetupArgs(["--verify", "--testing", "--no-gha", "--no-plugin"]),
      true,
    ),
    false,
  );
});
