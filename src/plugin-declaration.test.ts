/**
 * Tests for the project-level plugin DECLARATION (`src/plugin-declaration.ts`).
 *
 * What this is and is not: writing `extraKnownMarketplaces` + `enabledPlugins`
 * into a repo's `.claude/settings.json` does NOT make the plugin available to a
 * collaborator. Per the Claude Code team-marketplace docs, an external-source
 * plugin declared project-level "doesn't load until the team member installs
 * it". What the declaration buys is that Claude Code then TELLS them the project
 * wants it and how to install it, instead of the silence they get today.
 *
 * The load-bearing property under test is therefore not "does it enable the
 * plugin" but **"does it leave everything else alone"**. This file is the user's
 * hooks, permissions and other plugins — one real example is 100+ hand-written
 * lines wiring four compiled hooks. Clobbering it would be far worse than the
 * silence being fixed.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  addVigilesDeclaration,
  removeVigilesDeclaration,
  VIGILES_PLUGIN_ID,
} from "./plugin-declaration.js";

/** A settings.json shaped like a real one: hooks, permissions, another plugin. */
function realisticSettings(): Record<string, unknown> {
  return {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    permissions: { allow: ["Bash(npm run test:*)"], deny: ["Read(./.env)"] },
    extraKnownMarketplaces: {
      mattpocock: { source: { source: "github", repo: "mattpocock/skills" } },
    },
    enabledPlugins: { "mattpocock-skills@mattpocock": true },
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [{ type: "command", command: "bash .claude/hooks/guard.sh" }],
        },
      ],
    },
  };
}

test("adds both keys to a settings file that has neither", () => {
  const r = addVigilesDeclaration({});
  assert.equal(r.changed, true);
  assert.deepEqual(r.settings, {
    extraKnownMarketplaces: {
      vigiles: { source: { source: "github", repo: "zernie/vigiles" } },
    },
    enabledPlugins: { [VIGILES_PLUGIN_ID]: true },
  });
});

test("MERGES — every unrelated key survives untouched", () => {
  const before = realisticSettings();
  const r = addVigilesDeclaration(realisticSettings());
  assert.equal(r.changed, true);

  // The user's own config is byte-identical.
  assert.deepEqual(r.settings.permissions, before.permissions);
  assert.deepEqual(r.settings.hooks, before.hooks);
  assert.equal(r.settings.$schema, before.$schema);

  // Their other marketplace and plugin are still there, beside ours.
  const mk = r.settings.extraKnownMarketplaces as Record<string, unknown>;
  assert.deepEqual(mk.mattpocock, {
    source: { source: "github", repo: "mattpocock/skills" },
  });
  assert.deepEqual(mk.vigiles, {
    source: { source: "github", repo: "zernie/vigiles" },
  });
  const en = r.settings.enabledPlugins as Record<string, unknown>;
  assert.equal(en["mattpocock-skills@mattpocock"], true);
  assert.equal(en[VIGILES_PLUGIN_ID], true);
});

test("does not mutate the object it was given", () => {
  const input = realisticSettings();
  addVigilesDeclaration(input);
  assert.equal(
    (input.extraKnownMarketplaces as Record<string, unknown>).vigiles,
    undefined,
    "the caller's object must be untouched",
  );
});

test("leaves an existing vigiles marketplace entry alone — it may point at a fork", () => {
  const forked = {
    extraKnownMarketplaces: {
      vigiles: { source: { source: "github", repo: "myorg/vigiles-fork" } },
    },
  };
  const r = addVigilesDeclaration(forked);
  assert.deepEqual(
    (r.settings.extraKnownMarketplaces as Record<string, unknown>).vigiles,
    { source: { source: "github", repo: "myorg/vigiles-fork" } },
    "a hand-pointed source must not be rewritten",
  );
});

test("does not flip an explicit `false` back to true — that is a deliberate disable", () => {
  const disabled = { enabledPlugins: { [VIGILES_PLUGIN_ID]: false } };
  const r = addVigilesDeclaration(disabled);
  assert.equal(
    (r.settings.enabledPlugins as Record<string, unknown>)[VIGILES_PLUGIN_ID],
    false,
  );
});

test("is idempotent — running init twice changes nothing the second time", () => {
  const once = addVigilesDeclaration(realisticSettings());
  const twice = addVigilesDeclaration(once.settings);
  assert.equal(twice.changed, false, "second run is a no-op");
  assert.deepEqual(twice.settings, once.settings);
});

test("removal takes out exactly the two keys and leaves the siblings", () => {
  const withOurs = addVigilesDeclaration(realisticSettings()).settings;
  const r = removeVigilesDeclaration(withOurs);
  assert.equal(r.changed, true);

  const mk = r.settings.extraKnownMarketplaces as Record<string, unknown>;
  assert.equal(mk.vigiles, undefined, "ours is gone");
  assert.deepEqual(
    mk.mattpocock,
    { source: { source: "github", repo: "mattpocock/skills" } },
    "theirs is not",
  );
  const en = r.settings.enabledPlugins as Record<string, unknown>;
  assert.equal(en[VIGILES_PLUGIN_ID], undefined);
  assert.equal(en["mattpocock-skills@mattpocock"], true);

  // And nothing else was touched.
  assert.deepEqual(r.settings.hooks, realisticSettings().hooks);
  assert.deepEqual(r.settings.permissions, realisticSettings().permissions);
});

test("add → remove round-trips a file that started with neither key", () => {
  const original = { permissions: { allow: ["Bash(ls)"] } };
  const there = addVigilesDeclaration(original).settings;
  const back = removeVigilesDeclaration(there);
  assert.deepEqual(back.settings, original, "no litter left behind");
});

test("removing drops an emptied parent, but keeps one that still has entries", () => {
  const onlyOurs = addVigilesDeclaration({}).settings;
  const cleaned = removeVigilesDeclaration(onlyOurs).settings;
  assert.equal(cleaned.extraKnownMarketplaces, undefined);
  assert.equal(cleaned.enabledPlugins, undefined);

  const shared = addVigilesDeclaration(realisticSettings()).settings;
  const stillShared = removeVigilesDeclaration(shared).settings;
  assert.ok(
    stillShared.extraKnownMarketplaces,
    "theirs keeps the parent alive",
  );
  assert.ok(stillShared.enabledPlugins);
});

test("removing from a file that never had it is a no-op", () => {
  const r = removeVigilesDeclaration(realisticSettings());
  assert.equal(r.changed, false);
  assert.deepEqual(r.settings, realisticSettings());
});
