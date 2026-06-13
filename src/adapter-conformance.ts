/**
 * Adapter conformance kit — the reusable check every `HarnessAdapter` runs, so
 * authoring one is guided and safe rather than "hope it's wired right". It
 * verifies each port is populated AND a behavioural invariant: the adapter's
 * dialect actually drives tool-contract verification (its own built-in tool is
 * accepted). A third-party adapter author runs `assertAdapterConformance(myAdapter)`
 * in their test suite. See `docs/authoring-an-adapter.md`.
 */
import type { HarnessAdapter } from "./core/adapter.js";
import { compileAgent } from "./core/compile.js";
import { agent } from "./core/spec.js";

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
