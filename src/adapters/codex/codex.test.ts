/**
 * Codex adapter validation — proves the harness-adapter kit generalizes beyond
 * Claude Code. codexAdapter is SHIPPED (registered in the registry, exported as
 * `vigiles/codex`); this suite drives it through the conformance kit and the real
 * compiler + loader against Codex-shaped fixtures (AGENTS.md, TOML config.toml
 * `[hooks]`, `${PLUGIN_ROOT}`). Findings → research/codex-prototype-findings.md.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { codexAdapter } from "./adapter.js";
import { codexDialect } from "./dialect.js";
import { codexLayout } from "./layout.js";
import {
  assertAdapterConformance,
  assertAdapterLoadsHooks,
} from "../../adapter-conformance.js";
import { ADAPTERS, getAdapter } from "../../adapter-registry.js";
import { compileAgent } from "../../core/compile.js";
import { agent } from "../../core/spec.js";
// The generic, layout-driven loader physically lives in the CC adapter; the
// Codex prototype reuses it with codexLayout (a finding: the loader should live
// in a shared/core location so adapters don't cross-import).
import { loadPlugin } from "../claude-code/plugin-loader.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

test("codexAdapter passes the conformance kit (ports + cross-port invariants)", () => {
  assertAdapterConformance(codexAdapter);
});

test("codexAdapter passes behavioural settings-load conformance (TOML round-trip)", () => {
  // Proves the settings-format axis: a Codex config.toml [hooks] block loads.
  assertAdapterLoadsHooks(codexAdapter);
});

test("codex is SHIPPED — registered in the public adapter registry", () => {
  assert.equal(getAdapter("codex"), codexAdapter);
  assert.ok(ADAPTERS.some((a) => a.name === "codex"));
});

test("the compiler verifies a subagent tool contract under codexDialect", () => {
  // A Codex built-in passes; a Claude Code tool (Read) is flagged — proving the
  // SAME compiler validates against the injected Codex catalog.
  const ok = compileAgent(
    agent({ name: "w", description: "x", tools: ["shell"], body: "b" }),
    { specFile: "w.md.spec.ts", dialect: codexDialect },
  );
  assert.equal(ok.errors.filter((e) => e.type === "unknown-tool").length, 0);

  const bad = compileAgent(
    agent({ name: "w", description: "x", tools: ["Read"], body: "b" }),
    { specFile: "w.md.spec.ts", dialect: codexDialect },
  );
  assert.ok(bad.errors.some((e) => e.type === "unknown-tool"));
});

test("the loader reads a real Codex-shaped plugin through codexLayout", () => {
  const dir = makeTmpDir("codex");
  try {
    // AGENTS.md + a skills surface + hooks in TOML config.toml referencing the
    // Codex plugin-root token.
    writeFileSync(join(dir, "AGENTS.md"), "# Agent rules\n");
    mkdirSync(join(dir, "skills", "review"), { recursive: true });
    writeFileSync(
      join(dir, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: review code\n---\nReview.\n",
    );
    mkdirSync(join(dir, ".codex"));
    writeFileSync(
      join(dir, ".codex", "config.toml"),
      '[[hooks.PreToolUse]]\ncommand = "${PLUGIN_ROOT}/hooks/gate.sh"\n',
    );

    const loaded = loadPlugin(dir, codexLayout);

    // instruction file picked up under its own name
    assert.ok(loaded.files["AGENTS.md"]);
    // skills surface materialized under the Codex materialize root
    assert.ok(loaded.files[join(".codex", "skills", "review", "SKILL.md")]);
    // hooks parsed from TOML, ${PLUGIN_ROOT} expanded to the absolute root
    const hooks = JSON.stringify(loaded.settings.hooks);
    assert.ok(hooks.includes(dir), "expected ${PLUGIN_ROOT} expanded");
    assert.ok(!hooks.includes("PLUGIN_ROOT"), "token should be gone");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("the loader detects Codex MCP servers from the TOML [mcp_servers] table", () => {
  const dir = makeTmpDir("codex-mcp");
  try {
    writeFileSync(join(dir, "AGENTS.md"), "# rules\n");
    mkdirSync(join(dir, ".codex"));
    // Codex MCP lives in config.toml as a [mcp_servers.<id>] TOML table — the
    // JSON-only manifest read used to miss this; the format-aware read finds it.
    writeFileSync(
      join(dir, ".codex", "config.toml"),
      '[mcp_servers.docs]\ncommand = "docs-server"\nargs = ["--stdio"]\n',
    );
    const loaded = loadPlugin(dir, codexLayout);
    assert.ok(
      loaded.warnings.some((w) => w.includes("MCP server")),
      "expected an MCP warning from the TOML [mcp_servers] table",
    );
    assert.ok(
      loaded.warnings.some((w) => w.includes("mcp_servers")),
      "warning should name the Codex manifest key",
    );
  } finally {
    cleanupTmpDir(dir);
  }
});
