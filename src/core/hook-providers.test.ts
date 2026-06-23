/**
 * Hook context-provider suite (vitest): the gatherer runs only DECLARED
 * providers, parses each fact, defaults (never throws) on failure, and — the
 * load-bearing SOUNDNESS check — every built-in provider command is provably
 * read-only (a provider OBSERVES, never mutates). Pure: an injected fake `exec`,
 * no real git, no subprocess.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  gatherContext,
  unknownProviders,
  BUILTIN_PROVIDERS,
  type ProviderIO,
} from "./hook-providers.js";
import { isReadOnlyBash } from "./bash-effects.js";

/** A fake IO that answers a fixed map of commands. */
function fakeIO(answers: Record<string, string>, cwd = "/repo"): ProviderIO {
  return {
    cwd,
    exec: (command) => {
      if (command in answers) return answers[command];
      throw new Error(`fake exec: command failed: ${command}`);
    },
  };
}

test("gatherContext runs ONLY the declared providers and parses each fact", () => {
  const io = fakeIO({
    "git branch --show-current": "main\n",
    "git status --porcelain": " M src/x.ts\n",
  });
  const ctx = gatherContext(["git.branch", "git.isDirty", "cwd"], io);
  assert.equal(ctx["git.branch"], "main"); // trimmed
  assert.equal(ctx["git.isDirty"], true); // porcelain non-empty → dirty
  assert.equal(ctx.cwd, "/repo"); // ambient, from io.cwd

  // Only what's declared is gathered — nothing else appears.
  const only = gatherContext(["cwd"], io);
  assert.deepEqual(Object.keys(only), ["cwd"]);
});

test("a clean tree is not dirty; gathering NEVER throws (defaults on failure)", () => {
  const clean = gatherContext(
    ["git.isDirty"],
    fakeIO({ "git status --porcelain": "" }),
  );
  assert.equal(clean["git.isDirty"], false);

  // Not a git repo → exec throws → defaults ("" / false), not an exception.
  const io = fakeIO({}); // every command throws
  const ctx = gatherContext(["git.branch", "git.isDirty"], io);
  assert.equal(ctx["git.branch"], "");
  assert.equal(ctx["git.isDirty"], false);
});

test("unknownProviders flags a typo'd / non-built-in provider name", () => {
  assert.deepEqual(unknownProviders(["git.branch", "cwd"]), []);
  assert.deepEqual(unknownProviders(["git.brnch"]), ["git.brnch"]);
  assert.deepEqual(unknownProviders(["git.dirty", "k8s.ctx"]), [
    "git.dirty",
    "k8s.ctx",
  ]);
});

// SOUNDNESS — the whole guarantee rests on this: a provider may only OBSERVE.
// Every built-in command must be provably read-only by the bash classifier, so
// the trusted runtime can never mutate the world while gathering a fact.
test("every built-in provider command is provably READ-ONLY", () => {
  for (const [name, def] of Object.entries(BUILTIN_PROVIDERS)) {
    if (def.run === undefined) continue; // ambient (cwd) — no command
    assert.equal(
      isReadOnlyBash(def.run),
      true,
      `built-in provider "${name}" runs a non-read-only command: ${def.run}`,
    );
  }
});
