/** Unit tests for the pure `vigiles init` plan logic. */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  parseSetupArgs,
  defaultPlan,
  shouldPrompt,
  resolvePlan,
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
    "--pillars=test",
    "--no-gha",
    "--no-plugin",
    "--strict",
    "-y",
  ]);
  assert.equal(p.pillars, "test");
  assert.equal(p.gha, false);
  assert.equal(p.plugin, false);
  assert.equal(p.strict, true);
  assert.equal(p.yes, true);
});

test("parseSetupArgs ignores an invalid --pillars value", () => {
  assert.equal(parseSetupArgs(["--pillars=nonsense"]).pillars, undefined);
  assert.equal(parseSetupArgs([]).pillars, undefined);
});

test("resolvePlan: --pillars scopes to one pillar", () => {
  assert.deepEqual(resolvePlan(parseSetupArgs(["--pillars=verify"])), {
    verify: true,
    test: false,
    gha: true,
    plugin: true,
    strict: false,
  });
  const t = resolvePlan(parseSetupArgs(["--pillars=test"]));
  assert.equal(t.verify, false);
  assert.equal(t.test, true);
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
      parseSetupArgs(["--pillars=both", "--no-gha", "--no-plugin"]),
      true,
    ),
    false,
  );
});
