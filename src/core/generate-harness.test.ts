/**
 * Whole-harness codegen test suite (vitest) — the generator that folds every
 * `*.spec.ts` into ONE typed registry so a single `tsc --noEmit` cross-checks
 * the whole harness (research/whole-harness-codegen.md). Three behaviours:
 *
 *  - a CLEAN registry compiles (tsc exit 0),
 *  - a DANGLING-delegate registry is REJECTED by tsc, the diagnostic naming the
 *    missing target (`__dangling_delegate: "ghost"`),
 *  - a DUPLICATE name is caught in the JS generator (the O(N) check, NOT a type
 *    — the encoding rule that avoids the measured TS2589 wall),
 *  - and the capability lattice is the correct union of effect surfaces.
 *
 * Test files are exempt from the core ⊄ adapter boundary, so the concrete
 * Claude Code dialect is imported here to drive the capability lattice.
 */
import { test, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  generateHarness,
  computeHarnessCapabilities,
  findDuplicateName,
  loadHarnessModel,
  findHarnessSpecFiles,
  type HarnessModel,
  type HarnessAgentEntry,
} from "./generate-harness.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

// ---------------------------------------------------------------------------
// Pure core — emission, duplicate detection, capability lattice
// ---------------------------------------------------------------------------

const agents: HarnessAgentEntry[] = [
  {
    name: "planner",
    tools: ["Read", "Grep", "Glob"],
    file: "/h/planner.spec.ts",
  },
  {
    name: "implementer",
    tools: ["Read", "Edit", "Write", "Bash"],
    file: "/h/implementer.spec.ts",
  },
];

const model: HarnessModel = {
  agents,
  edges: [
    { from: "ship", target: "planner" },
    { from: "ship", target: "implementer" },
  ],
};

test("generateHarness emits a registry, an AgentName union, and per-edge checks", () => {
  const r = generateHarness(model, { dialect: d, outDir: "/h" });
  expect(r.duplicate).toBeUndefined();
  expect(r.agentCount).toBe(2);
  expect(r.edgeCount).toBe(2);
  // sorted, name-keyed registry
  expect(r.gen).toContain('"implementer": implementer');
  expect(r.gen).toContain('"planner": planner');
  // the literal name union (the dangling-check basis)
  expect(r.gen).toContain("export type AgentName =");
  expect(r.gen).toContain('| "planner"');
  // one shallow per-edge assertion, naming the railway it came from
  expect(r.gen).toContain(
    'const _edge_0: KnownAgentName<"planner", AgentName, "ship"> = true;',
  );
  // the public spec import (default)
  expect(r.gen).toContain('from "vigiles/spec"');
});

test("the spec import is overridable (for the in-repo dogfood)", () => {
  const r = generateHarness(model, {
    dialect: d,
    outDir: "/h",
    specImport: "../../src/spec.js",
  });
  expect(r.gen).toContain('from "../../src/spec.js"');
});

test("computeHarnessCapabilities is the UNION of every agent's effect surface", () => {
  const caps = computeHarnessCapabilities(agents, d);
  expect(caps.readOnly).toEqual(["Glob", "Grep", "Read"]);
  expect(caps.sideEffecting).toEqual(["Bash", "Edit", "Write"]);
  expect(caps.unknown).toEqual([]);
  // loosest agent's purity wins — Bash makes the harness unrestricted
  expect(caps.purity).toBe("unrestricted");
});

test("an agent with no tools (inherits-all) makes the lattice unrestricted", () => {
  const caps = computeHarnessCapabilities(
    [{ name: "open", file: "/h/open.spec.ts" }],
    d,
  );
  expect(caps.purity).toBe("unrestricted");
});

test("a pure-only harness stays pure in the lattice", () => {
  const caps = computeHarnessCapabilities(
    [{ name: "reader", tools: ["Read", "Grep"], file: "/h/reader.spec.ts" }],
    d,
  );
  expect(caps.purity).toBe("pure");
  expect(caps.sideEffecting).toEqual([]);
});

test("findDuplicateName flags the first collision (O(N) JS check, not a type)", () => {
  const dup = findDuplicateName([
    { name: "reviewer", file: "/h/alpha.spec.ts" },
    { name: "planner", file: "/h/planner.spec.ts" },
    { name: "reviewer", file: "/h/beta.spec.ts" },
  ]);
  expect(dup).toBeDefined();
  expect(dup?.name).toBe("reviewer");
  expect(dup?.first).toBe("/h/alpha.spec.ts");
  expect(dup?.second).toBe("/h/beta.spec.ts");
  expect(dup?.message).toContain('duplicate agent name "reviewer"');
});

test("unique names yield no duplicate diagnostic", () => {
  expect(findDuplicateName(agents)).toBeUndefined();
});

test("generateHarness surfaces a duplicate on the result (the CLI exits non-zero)", () => {
  const dupModel: HarnessModel = {
    agents: [
      { name: "x", file: "/h/a.spec.ts" },
      { name: "x", file: "/h/b.spec.ts" },
    ],
    edges: [],
  };
  const r = generateHarness(dupModel, { dialect: d, outDir: "/h" });
  expect(r.duplicate?.name).toBe("x");
});

test("an empty harness emits AgentName = never and no edges", () => {
  const r = generateHarness(
    { agents: [], edges: [] },
    { dialect: d, outDir: "/h" },
  );
  expect(r.gen).toContain("export type AgentName = never;");
  expect(r.gen).not.toContain("_edge_");
});

// ---------------------------------------------------------------------------
// loadHarnessModel — railway edges (steps + recover + onError) become edges
// ---------------------------------------------------------------------------

test("loadHarnessModel turns agents into entries and railways into edges", async () => {
  const load = (abs: string): Promise<Record<string, unknown> | null> => {
    if (abs.endsWith("planner.spec.ts"))
      return Promise.resolve({
        _specType: "agent",
        name: "planner",
        tools: ["Read"],
      });
    if (abs.endsWith("fixer.spec.ts"))
      return Promise.resolve({
        _specType: "agent",
        name: "fixer",
        tools: ["Edit"],
      });
    if (abs.endsWith("ship.spec.ts"))
      return Promise.resolve({
        _specType: "railway",
        name: "ship",
        steps: [{ agent: "planner" }],
        recover: { step: { agent: "fixer" }, max: 2 },
        onError: { agent: "reporter" },
      });
    return Promise.resolve(null);
  };
  const dir = mkdtempSync(join(resolve("."), ".tmp-genh-load-"));
  try {
    writeFileSync(join(dir, "planner.spec.ts"), "");
    writeFileSync(join(dir, "fixer.spec.ts"), "");
    writeFileSync(join(dir, "ship.spec.ts"), "");
    expect(findHarnessSpecFiles(dir).length).toBe(3);
    const m = await loadHarnessModel(dir, load);
    expect(m.agents.map((a) => a.name).sort()).toEqual(["fixer", "planner"]);
    // step + recover + onError all become edges
    expect(m.edges).toEqual([
      { from: "ship", target: "planner" },
      { from: "ship", target: "fixer" },
      { from: "ship", target: "reporter" },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// tsc smoke — a CLEAN registry compiles, a DANGLING one is rejected naming ghost
//
// The fixture lives UNDER the repo root so `vigiles/spec` (self-reference) and
// the gen file's `*.spec.ts` imports resolve. Dogfoods the example-railway
// shape (planner → implementer, fixer recovery, reporter onError).
// ---------------------------------------------------------------------------

const TSC = resolve("node_modules/.bin/tsc");
const cleanups: string[] = [];
afterAll(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

function fixtureDir(): string {
  const dir = mkdtempSync(join(resolve("."), ".tmp-genh-tsc-"));
  cleanups.push(dir);
  return dir;
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
    },
    include: ["harness.gen.ts", "*.spec.ts"],
  },
  null,
  2,
);

const PLANNER = `import { agent, result } from "vigiles/spec";
export default agent({
  name: "planner",
  description: "Break the request into an ordered plan. Dispatch first.",
  tools: ["Read", "Grep", "Glob"],
  output: result({ steps: "string[]" }, { reason: "string" }),
});
`;
const IMPLEMENTER = `import { agent, result } from "vigiles/spec";
export default agent({
  name: "implementer",
  description: "Implement the plan and prove the build passes.",
  tools: ["Read", "Edit", "Write", "Bash"],
  output: result({ files: "string[]" }, { failedAt: "string" }),
});
`;
const FIXER = `import { agent } from "vigiles/spec";
export default agent({
  name: "fixer",
  description: "Address the failing step's findings, then re-verify.",
  tools: ["Read", "Edit", "Bash"],
});
`;
const REPORTER = `import { agent } from "vigiles/spec";
export default agent({
  name: "reporter",
  description: "Report an exhausted failure for a human.",
  tools: ["Read"],
});
`;

function writeRailwayFixture(dir: string, target: string): void {
  writeFileSync(join(dir, "planner.spec.ts"), PLANNER);
  writeFileSync(join(dir, "implementer.spec.ts"), IMPLEMENTER);
  writeFileSync(join(dir, "fixer.spec.ts"), FIXER);
  writeFileSync(join(dir, "reporter.spec.ts"), REPORTER);
  writeFileSync(
    join(dir, "ship.spec.ts"),
    `import { railway, delegate } from "vigiles/spec";
export default railway({
  name: "ship",
  steps: [delegate("planner"), delegate("${target}")],
  recover: { step: delegate("fixer"), max: 2 },
  onError: delegate("reporter"),
});
`,
  );
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
}

async function genFor(dir: string): Promise<void> {
  // Use loadHarnessModel with a real tsx-free in-test loader by importing the
  // built CLI's loadSpec would couple to the CLI; instead drive the public
  // generator over a model parsed from the known fixture (the loader is tested
  // above). Here we assert the EMITTED file compiles, which is the real product.
  const m: HarnessModel = await loadHarnessModel(dir, (abs) => {
    // A tiny deterministic loader matching the fixture (no tsx, no model).
    const base = abs.split("/").pop() ?? "";
    if (base === "planner.spec.ts")
      return Promise.resolve({
        _specType: "agent",
        name: "planner",
        tools: ["Read", "Grep", "Glob"],
      });
    if (base === "implementer.spec.ts")
      return Promise.resolve({
        _specType: "agent",
        name: "implementer",
        tools: ["Read", "Edit", "Write", "Bash"],
      });
    if (base === "fixer.spec.ts")
      return Promise.resolve({
        _specType: "agent",
        name: "fixer",
        tools: ["Read", "Edit", "Bash"],
      });
    if (base === "reporter.spec.ts")
      return Promise.resolve({
        _specType: "agent",
        name: "reporter",
        tools: ["Read"],
      });
    if (base === "ship.spec.ts") {
      const text = readFileSync(abs, "utf-8");
      // The first two delegate() targets are the success-track steps; recover +
      // onError are the fixed fixture values below.
      const steps = [...text.matchAll(/delegate\("([^"]+)"/g)]
        .slice(0, 2)
        .map((x) => ({ agent: x[1] }));
      return Promise.resolve({
        _specType: "railway",
        name: "ship",
        steps,
        recover: { step: { agent: "fixer" }, max: 2 },
        onError: { agent: "reporter" },
      });
    }
    return Promise.resolve(null);
  });
  const r = generateHarness(m, { dialect: d, outDir: dir });
  expect(r.duplicate).toBeUndefined();
  writeFileSync(join(dir, "harness.gen.ts"), r.gen);
}

function tsc(dir: string): { status: number; out: string } {
  try {
    execFileSync(TSC, ["--noEmit", "-p", join(dir, "tsconfig.json")], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, out: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      out: (err.stdout ?? "") + (err.stderr ?? ""),
    };
  }
}

test("a CLEAN railway registry compiles (tsc exit 0)", async () => {
  const dir = fixtureDir();
  writeRailwayFixture(dir, "implementer");
  await genFor(dir);
  const r = tsc(dir);
  expect(r.out).toBe("");
  expect(r.status).toBe(0);
}, 60_000);

test("a DANGLING delegate is rejected by tsc, naming the missing target", async () => {
  const dir = fixtureDir();
  writeRailwayFixture(dir, "ghost"); // delegates to a non-existent agent
  await genFor(dir);
  const r = tsc(dir);
  expect(r.status).not.toBe(0);
  expect(r.out).toContain('__dangling_delegate: "ghost"');
  expect(r.out).toContain('from: "ship"');
}, 60_000);
