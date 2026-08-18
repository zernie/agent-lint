/**
 * Unit tests for the surface SCOPING decision — the module that replaced "read
 * the repo-root surfaces OR the `.claude/` ones, never both".
 *
 * Both halves, every time: a test that fires on the planted defect AND a test
 * that stays silent on the shapes that were already right. A test that only
 * checks the new case would pass just as well against code that read `.claude/`
 * and dropped the root — the mirror-image of the bug.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { claudeCodeLayout } from "../adapters/claude-code/layout.js";
import { codexLayout } from "../adapters/codex/layout.js";
import { opencodeLayout } from "../adapters/opencode/layout.js";
import type { PluginLayout } from "./layout.js";
import {
  assertDistinctScopeKeys,
  multiScopeWarning,
  scopeKey,
  surfaceSource,
  type SurfaceScope,
} from "./surface-scopes.js";

const probe = {
  hasRootSkillFile: false,
  skillName: "repo",
  rootHasLoadable: false,
  isPluginShaped: false,
  userHasLoadable: false,
};

function scopesOf(p: Partial<typeof probe>, layout = claudeCodeLayout) {
  const s = surfaceSource(layout, { ...probe, ...p });
  assert.equal(s.kind, "scopes", "expected the multi-scope shape");
  return s.kind === "scopes" ? s.scopes : [];
}

// --- THE DEFECT: both levels present, one was dropped ------------------------

test("both levels present → BOTH scopes are read", () => {
  const scopes = scopesOf({ rootHasLoadable: true, userHasLoadable: true });
  assert.deepEqual(
    scopes.map((s) => s.base),
    [".claude", ""],
    "project scope first, plugin scope second",
  );
});

test("both levels present → the two scopes mint DIFFERENT keys", () => {
  const scopes = scopesOf({ rootHasLoadable: true, userHasLoadable: true });
  const keys = scopes.map((s) => scopeKey(s, "skills", "dup/SKILL.md"));
  assert.deepEqual(keys, [
    ".claude/skills/dup/SKILL.md",
    "skills/dup/SKILL.md",
  ]);
  assert.equal(new Set(keys).size, keys.length, "no key is claimed twice");
});

test("a plugin-shaped repo with NO root surfaces still reads .claude/", () => {
  // The hook-only plugin: manifest + hooks, no `skills/`, but a real
  // `.claude/skills` the session loads. It used to be dropped as "dev-only".
  const scopes = scopesOf({ isPluginShaped: true, userHasLoadable: true });
  assert.deepEqual(scopes.map((s) => s.base).sort(), ["", ".claude"]);
});

// --- THE OTHER HALF: shapes that were already right must not move ------------

test("plugin-only repo is unchanged — root keeps the canonical key", () => {
  const scopes = scopesOf({ rootHasLoadable: true });
  assert.deepEqual(scopes, [
    { base: "", materializeUnder: ".claude", label: "plugin" },
  ]);
  assert.equal(
    scopeKey(scopes[0], "skills", "x/SKILL.md"),
    ".claude/skills/x/SKILL.md",
  );
});

test("plain-user repo is unchanged — .claude keeps the canonical key", () => {
  const scopes = scopesOf({ userHasLoadable: true });
  assert.deepEqual(scopes, [
    { base: ".claude", materializeUnder: ".claude", label: "project" },
  ]);
});

test("an empty repo still points at the project scope, not nothing", () => {
  // A repo with no surfaces anywhere must still LOOK at `.claude/` — that
  // fallback is why `userSurfaceRoot` exists.
  assert.deepEqual(
    scopesOf({}).map((s) => s.base),
    [".claude"],
  );
});

test("a root SKILL.md still wins outright (single-skill target)", () => {
  const s = surfaceSource(claudeCodeLayout, {
    ...probe,
    hasRootSkillFile: true,
    skillName: "solo",
    userHasLoadable: true,
  });
  assert.deepEqual(s, { kind: "single-skill", skillName: "solo" });
});

test("a layout without a user surface root yields at most the root scope", () => {
  // Codex/OpenCode declare no `userSurfaceRoot`; they must not grow a phantom
  // second scope, and an empty repo must not synthesize one either.
  for (const layout of [codexLayout, opencodeLayout]) {
    assert.equal(layout.userSurfaceRoot, undefined, layout.name);
    assert.deepEqual(scopesOf({ rootHasLoadable: true }, layout), [
      { base: "", materializeUnder: layout.materializeRoot, label: "plugin" },
    ]);
    assert.deepEqual(scopesOf({}, layout), []);
  }
});

// --- The loud backstop -------------------------------------------------------

test("assertDistinctScopeKeys is silent on every scope set the shipped layouts produce", () => {
  for (const layout of [claudeCodeLayout, codexLayout, opencodeLayout]) {
    for (const p of [
      { rootHasLoadable: true },
      { userHasLoadable: true },
      { rootHasLoadable: true, userHasLoadable: true },
      {},
    ]) {
      assertDistinctScopeKeys(scopesOf(p, layout), layout.name);
    }
  }
});

test("assertDistinctScopeKeys THROWS when two scopes would share a prefix", () => {
  // The planted defect: a future layout whose second scope relocates onto the
  // first one's prefix — exactly the silent overwrite this module removed.
  const colliding: SurfaceScope[] = [
    { base: ".claude", materializeUnder: ".claude", label: "project" },
    { base: "", materializeUnder: ".claude", label: "plugin" },
  ];
  assert.throws(() => {
    assertDistinctScopeKeys(colliding, "hypothetical");
  }, /silently shadow/);
});

test("a layout naming its materializeRoot as a SECOND scope base is caught", () => {
  // Constructed against the real decision function, not a hand-built list: a
  // layout whose `materializeRoot` is empty makes both scopes mint "" prefixes.
  const bad: PluginLayout = { ...claudeCodeLayout, materializeRoot: "" };
  const scopes = scopesOf(
    { rootHasLoadable: true, userHasLoadable: true },
    bad,
  );
  assert.throws(() => {
    assertDistinctScopeKeys(scopes, bad.name);
  }, /silently shadow/);
});

// --- The warning -------------------------------------------------------------

test("multiScopeWarning fires for two scopes and is silent for one or zero", () => {
  const two = scopesOf({ rootHasLoadable: true, userHasLoadable: true });
  const w = multiScopeWarning(two, { skills: 4 });
  assert.ok(w?.includes("TWO discovery levels"), "names the situation");
  assert.ok(w?.includes("4 file(s)"), "counts what was read");
  assert.equal(
    multiScopeWarning(scopesOf({ rootHasLoadable: true }), {}),
    undefined,
  );
  assert.equal(multiScopeWarning([], {}), undefined);
});

test("scopeKey drops empty segments instead of emitting a leading slash", () => {
  assert.equal(
    scopeKey(
      { base: "", materializeUnder: "", label: "plugin" },
      "skills",
      "x/SKILL.md",
    ),
    "skills/x/SKILL.md",
  );
});
