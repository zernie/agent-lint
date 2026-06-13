/**
 * Adapter conformance kit — the reusable check every `HarnessAdapter` runs, so
 * authoring one is guided and safe rather than "hope it's wired right". It
 * verifies each port is populated AND a behavioural invariant: the adapter's
 * dialect actually drives tool-contract verification (its own built-in tool is
 * accepted). A third-party adapter author runs `assertAdapterConformance(myAdapter)`
 * in their test suite. See `docs/authoring-an-adapter.md`.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import type { HarnessAdapter } from "./core/adapter.js";
import { compileAgent } from "./core/compile.js";
import { agent } from "./core/spec.js";
import { loadPlugin } from "./adapters/claude-code/plugin-loader.js";

export interface ConformanceResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

/** Check an adapter against the port contracts; returns the (possibly empty) failure list. */
export function checkAdapterConformance(
  adapter: HarnessAdapter,
): ConformanceResult {
  const failures: string[] = [];
  const need = (cond: boolean, msg: string): void => {
    if (!cond) failures.push(msg);
  };

  need(adapter.name.length > 0, "name is empty");
  need(
    adapter.dialect.builtinAgentTools.length > 0,
    "dialect has no builtinAgentTools",
  );
  need(
    adapter.dialect.instructionTargets.length > 0,
    "dialect has no instructionTargets",
  );
  need(
    adapter.layout.instructionFile.length > 0,
    "layout.instructionFile is empty",
  );
  need(adapter.layout.manifestPath.length > 0, "layout.manifestPath is empty");
  need(adapter.layout.surfaceDirs.length > 0, "layout has no surfaceDirs");
  need(adapter.runtime.agentBinary.length > 0, "runtime.agentBinary is empty");
  need(
    adapter.runtime.modelBaseUrlEnv.length > 0,
    "runtime.modelBaseUrlEnv is empty",
  );
  need(
    Number.isInteger(adapter.hookProtocol.blockExitCode),
    "hookProtocol.blockExitCode is not an integer",
  );
  need(
    adapter.modelMock.modelEndpoint.length > 0,
    "modelMock.modelEndpoint is empty",
  );
  need(typeof adapter.detect === "function", "detect is not a function");

  // Cross-port invariants — the kind of mismatch a copy-paste authoring slip
  // produces, that no single-port check would catch.
  for (const [port, name] of [
    ["dialect", adapter.dialect.name],
    ["layout", adapter.layout.name],
    ["runtime", adapter.runtime.name],
    ["hookProtocol", adapter.hookProtocol.name],
    ["modelMock", adapter.modelMock.name],
  ] as const) {
    need(
      name === adapter.name,
      `${port}.name "${name}" != adapter.name "${adapter.name}"`,
    );
  }
  need(
    adapter.layout.pluginRootToken === adapter.dialect.pluginRootToken,
    "layout.pluginRootToken and dialect.pluginRootToken disagree",
  );
  need(
    adapter.dialect.instructionTargets.includes(adapter.layout.instructionFile),
    `layout.instructionFile "${adapter.layout.instructionFile}" is not one of dialect.instructionTargets`,
  );
  need(
    adapter.layout.settingsFormat === "json" ||
      adapter.layout.settingsFormat === "toml",
    `layout.settingsFormat "${adapter.layout.settingsFormat}" is not "json" | "toml"`,
  );

  // Behavioural: the dialect drives the compiler — its own built-in tool must
  // pass the subagent tool-contract check under this dialect.
  const tool = adapter.dialect.builtinAgentTools[0];
  if (tool) {
    const spec = agent({
      name: "conformance",
      description: "conformance probe",
      tools: [tool],
      body: "probe",
    });
    const r = compileAgent(spec, {
      specFile: "conformance.md.spec.ts",
      dialect: adapter.dialect,
    });
    need(
      !r.errors.some((e) => e.type === "unknown-tool"),
      `dialect rejects its own built-in tool "${tool}"`,
    );
  }

  return { ok: failures.length === 0, failures };
}

/** Throw if the adapter fails conformance — drop this in an adapter's test suite. */
export function assertAdapterConformance(adapter: HarnessAdapter): void {
  const r = checkAdapterConformance(adapter);
  if (!r.ok) {
    throw new Error(
      `Adapter "${adapter.name}" failed conformance:\n  - ${r.failures.join("\n  - ")}`,
    );
  }
}

/**
 * Behavioural conformance the pure checks can't reach: write a minimal settings
 * file in the adapter's declared `settingsFormat` (with a hook), load it through
 * the adapter's `layout`, and assert the hooks actually came back. This is what
 * catches a layout that points at the right file but in the wrong format (the
 * JSON-vs-TOML trap) — the pure checker would pass it, the agent would silently
 * run with zero hooks. Does filesystem IO, so it's a separate opt-in assert.
 */
export function assertAdapterLoadsHooks(adapter: HarnessAdapter): void {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-conformance-"));
  try {
    const settingsAbs = join(dir, adapter.layout.settingsPath);
    mkdirSync(dirname(settingsAbs), { recursive: true });
    const content =
      adapter.layout.settingsFormat === "toml"
        ? '[[hooks.PreToolUse]]\ncommand = "echo conformance"\n'
        : JSON.stringify({
            hooks: { PreToolUse: [{ command: "echo conformance" }] },
          });
    writeFileSync(settingsAbs, content);
    const loaded = loadPlugin(dir, adapter.layout);
    if (!loaded.settings.hooks) {
      throw new Error(
        `Adapter "${adapter.name}": loadPlugin read no hooks from a ${adapter.layout.settingsFormat} settings file at ${adapter.layout.settingsPath} — the settings-format wiring is broken.`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
