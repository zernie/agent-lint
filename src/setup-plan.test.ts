/** Unit tests for the pure `vigiles init` plan logic. */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  parseSetupArgs,
  defaultPlan,
  shouldPrompt,
  resolvePlan,
  planPluginInstall,
  codexPluginHooks,
  applyCodexPluginHooks,
  mergeProjectConfig,
  collectSetupAnswers,
  STRUCTURAL_RULES,
  WORKFLOW_RULES,
  type AskFn,
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
  assert.equal(p.reportOnly, false);
});

test("parseSetupArgs reads --report-only", () => {
  assert.equal(parseSetupArgs(["--report-only"]).reportOnly, true);
  assert.equal(parseSetupArgs([]).reportOnly, false);
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

test("resolvePlan: an interactive 'yes' to strict opts into the workflow tier", () => {
  // The recommended-default opt-out: a TTY human says yes → strict; a bare
  // non-interactive run (no answers) stays non-strict (structural-only floor).
  assert.equal(resolvePlan(parseSetupArgs([]), { strict: true }).strict, true);
  assert.equal(
    resolvePlan(parseSetupArgs([]), { strict: false }).strict,
    false,
  );
  assert.equal(resolvePlan(parseSetupArgs([])).strict, false); // no human asked
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

test("planPluginInstall: codex installs skills GLOBALLY (-g) + wires repo hooks", () => {
  const [codex] = planPluginInstall(["codex"], { hasClaude: false });
  assert.equal(codex.harness, "codex");
  // The cross-agent skills CLI with -g → ~/.agents/skills/, not the repo.
  assert.ok(codex.commands.some((c) => /skills add .* -a codex -g/.test(c)));
  // Skills are global, but the nudge hooks are written to .codex/config.toml
  // (repo-committed, the Codex norm) → this method now touches the repo.
  assert.equal(codex.vendors, true);
  assert.ok(codex.notes.some((n) => /config\.toml/.test(n))); // names where hooks land
  assert.ok(codex.notes.some((n) => /Still manual/.test(n))); // honest about what's deferred
});

test("planPluginInstall: both harnesses → one plan each; only codex touches the repo", () => {
  const plans = planPluginInstall(["claude", "codex"], { hasClaude: true });
  assert.deepEqual(
    plans.map((p) => p.harness),
    ["claude", "codex"],
  );
  // Claude installs to the global marketplace (no repo files); Codex writes the
  // repo's .codex/config.toml hooks.
  const byName = Object.fromEntries(plans.map((p) => [p.harness, p.vendors]));
  assert.equal(byName.claude, false);
  assert.equal(byName.codex, true);
});

test("codexPluginHooks: the two PostToolUse nudges run as direct npx hook-runtime commands", () => {
  const hooks = codexPluginHooks();
  assert.equal(hooks.length, 2);
  assert.ok(hooks.every((h) => h.event === "PostToolUse"));
  // additionalContext is honored on PostToolUse (confirmed) — these reach the agent.
  assert.ok(
    hooks.some((h) => h.command.includes("hook-runtime eval-lock-nudge")),
  );
  assert.ok(hooks.some((h) => h.command.includes("hook-runtime refs")));
  // Direct npx, no plugin root / vendored script path.
  assert.ok(
    hooks.every((h) => h.command.startsWith("npx --no-install vigiles")),
  );
  // Anchored-regex matcher (the Codex dialect convention).
  assert.ok(hooks.every((h) => h.matcher === "^(Edit|Write)$"));
});

test("applyCodexPluginHooks: adds the nudges, is idempotent, preserves the user's config", () => {
  // Fresh config → both nudges added.
  const fresh = applyCodexPluginHooks({}) as {
    hooks: { PostToolUse: { command: string }[] };
  };
  assert.equal(fresh.hooks.PostToolUse.length, 2);

  // Re-run → still 2, never duplicated (idempotent re-merge keyed by command).
  const again = applyCodexPluginHooks(fresh) as typeof fresh;
  assert.equal(again.hooks.PostToolUse.length, 2);

  // Preserves the user's own hook AND unrelated top-level keys.
  const withUser = {
    model: "gpt-5",
    hooks: { PostToolUse: [{ matcher: "^Bash$", command: "my-own-hook" }] },
  };
  const merged = applyCodexPluginHooks(withUser) as {
    model: string;
    hooks: { PostToolUse: { command: string }[] };
  };
  assert.equal(merged.model, "gpt-5");
  assert.equal(merged.hooks.PostToolUse.length, 3); // 1 user + 2 vigiles
  assert.ok(merged.hooks.PostToolUse.some((e) => e.command === "my-own-hook"));
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

test("mergeProjectConfig: default init gates the FP-safe structural rules + harness", () => {
  const out = mergeProjectConfig({}, { harness: "claude-code", strict: false });
  const expected = Object.fromEntries(
    STRUCTURAL_RULES.map((r) => [r, "error"]),
  );
  assert.deepEqual(out, { harness: "claude-code", rules: expected });
});

test("mergeProjectConfig: default does NOT gate require-instructions-spec (stays opt-in)", () => {
  const out = mergeProjectConfig({}, { harness: "claude-code", strict: false });
  const rules = (out as { rules: Record<string, string> }).rules;
  assert.equal(
    rules["require-instructions-spec"],
    undefined,
    "require-instructions-spec is --strict-only",
  );
  assert.equal(
    rules["untested-skill"],
    undefined,
    "untested-* is --strict-only",
  );
});

test("mergeProjectConfig: --report-only writes the structural gate at warn, not error", () => {
  const out = mergeProjectConfig(
    {},
    { harness: "claude-code", strict: false, reportOnly: true },
  );
  const expected = Object.fromEntries(STRUCTURAL_RULES.map((r) => [r, "warn"]));
  assert.deepEqual(out, { harness: "claude-code", rules: expected });
});

test("mergeProjectConfig: --report-only composes with --strict (workflow tier at warn)", () => {
  const out = mergeProjectConfig(
    {},
    { harness: "claude-code", strict: true, reportOnly: true },
  );
  const expected = Object.fromEntries(
    [...STRUCTURAL_RULES, ...WORKFLOW_RULES].map((r) => [r, "warn"]),
  );
  assert.deepEqual(out, { harness: "claude-code", rules: expected });
});

test("mergeProjectConfig: test-only (lint:false) records harness but writes NO lint rules", () => {
  const out = mergeProjectConfig(
    {},
    { harness: "claude-code", strict: false, lint: false },
  );
  // Honors the positive-flag contract: `init --test` selects only the test
  // pillar, so the lint rule gate is not written.
  assert.deepEqual(out, { harness: "claude-code" });
});

test("mergeProjectConfig: lint:false with --strict still writes no rules", () => {
  const out = mergeProjectConfig(
    {},
    { harness: "codex", strict: true, lint: false },
  );
  assert.deepEqual(out, { harness: "codex" });
});

test("mergeProjectConfig: array harness is recorded as-is (with default gates)", () => {
  const out = mergeProjectConfig(
    {},
    { harness: ["claude-code", "codex"], strict: false },
  );
  assert.deepEqual((out as { harness: unknown }).harness, [
    "claude-code",
    "codex",
  ]);
});

test("mergeProjectConfig: never clobbers an existing harness key", () => {
  // harness already set, but the default gate rules are still added → writes.
  const out = mergeProjectConfig(
    { harness: "codex" },
    { harness: "claude-code", strict: false },
  );
  assert.equal((out as { harness: string }).harness, "codex", "kept");
});

test("mergeProjectConfig: preserves other existing keys", () => {
  const out = mergeProjectConfig(
    { maxRules: 50 },
    { harness: "codex", strict: false },
  );
  assert.equal((out as { maxRules: number }).maxRules, 50);
  assert.equal((out as { harness: string }).harness, "codex");
});

test("mergeProjectConfig: --strict adds the workflow-forcing tier on top of the gates", () => {
  const out = mergeProjectConfig({}, { harness: "claude-code", strict: true });
  const expected = Object.fromEntries(
    [...STRUCTURAL_RULES, ...WORKFLOW_RULES].map((r) => [r, "error"]),
  );
  assert.deepEqual(out, { harness: "claude-code", rules: expected });
});

test("WORKFLOW_RULES is require-instructions-spec + untested-*; nudge rules are NOT gated", () => {
  assert.ok(WORKFLOW_RULES.includes("require-instructions-spec"));
  assert.ok(WORKFLOW_RULES.includes("untested-skill"));
  // frontmatter-valid / skill-frontmatter are nudge-group — never gated, even --strict.
  assert.ok(
    !(WORKFLOW_RULES as readonly string[]).includes("frontmatter-valid"),
  );
  assert.ok(
    !(WORKFLOW_RULES as readonly string[]).includes("skill-frontmatter"),
  );
});

test("mergeProjectConfig: never clobbers a user-set severity, fills the rest", () => {
  const out = mergeProjectConfig(
    { harness: "codex", rules: { "subagent-tool-contract": "warn" } },
    { harness: "codex", strict: false },
  );
  const rules = (out as { rules: Record<string, string> }).rules;
  assert.equal(rules["subagent-tool-contract"], "warn", "user severity kept");
  assert.equal(rules["description-overlap"], "error", "others gated");
});

test("mergeProjectConfig: fully-satisfied config returns null (no write)", () => {
  const rules = Object.fromEntries(
    [...STRUCTURAL_RULES, ...WORKFLOW_RULES].map((r) => [r, "error"]),
  );
  assert.equal(
    mergeProjectConfig(
      { harness: "codex", rules },
      { harness: "codex", strict: true },
    ),
    null,
  );
});

// --- collectSetupAnswers: the interactive Q&A, unit-tested via a fake ask ---

/** A fake `ask` that returns the scripted answer per matched question substring,
 *  else the default (simulating the user hitting Enter). Records the prompts. */
function fakeAsk(scripted: Record<string, string>): {
  ask: AskFn;
  asked: string[];
} {
  const asked: string[] = [];
  const ask: AskFn = (q, def) => {
    asked.push(q);
    const hit = Object.keys(scripted).find((k) => q.includes(k));
    return Promise.resolve(hit ? scripted[hit] : def);
  };
  return { ask, asked };
}

test("collectSetupAnswers: all defaults (user hits Enter) → both pillars, all on, strict", async () => {
  const { ask, asked } = fakeAsk({});
  assert.deepEqual(await collectSetupAnswers(ask), {
    lint: true,
    test: true,
    gha: true,
    plugin: true,
    strict: true,
  });
  assert.equal(asked.length, 4, "asks pillars, CI, plugin, strict");
});

test("collectSetupAnswers: 'lint' pillar → test off", async () => {
  const { ask } = fakeAsk({ "which pillars": "lint" });
  const a = await collectSetupAnswers(ask);
  assert.equal(a.lint, true);
  assert.equal(a.test, false);
});

test("collectSetupAnswers: 'test' pillar → lint off", async () => {
  const { ask } = fakeAsk({ "which pillars": "test" });
  const a = await collectSetupAnswers(ask);
  assert.equal(a.lint, false);
  assert.equal(a.test, true);
});

test("collectSetupAnswers: declining CI / plugin / strict is honored", async () => {
  const { ask } = fakeAsk({
    "Wire CI": "n",
    "Install the Claude Code plugin": "n",
    "enforce specs": "n",
  });
  const a = await collectSetupAnswers(ask);
  assert.equal(a.gha, false);
  assert.equal(a.plugin, false);
  assert.equal(a.strict, false, "opts OUT of the workflow tier");
  assert.equal(a.lint, true, "structural gating still set up");
});
