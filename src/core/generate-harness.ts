/**
 * vigiles generate-harness — emit ONE typed registry over the whole harness.
 *
 * The third generated artifact beside `generate-types` (`.d.ts`) and
 * `generate-schema` (JSON Schema): a `harness.gen.ts` that imports every
 * `*.spec.ts` in a directory, folds the agents into a `registry`, and asserts
 * the cross-spec invariants at the TYPE level — so a single `tsc --noEmit`
 * checks the WHOLE harness as one program (think TanStack's `routeTree.gen.ts`).
 * See research/whole-harness-codegen.md for the design + the measured perf.
 *
 * The shipped scope (the first increment):
 *  1. DANGLING `delegate` → a `tsc` error. Each `railway()` delegate target is a
 *     name the generator reads at codegen time; the gen file emits one shallow
 *     per-edge assertion (`KnownAgentName<"target", AgentName>` — O(N), no
 *     recursion) that the target resolves to a real agent, else a `tsc` error
 *     naming the dangling target + its railway.
 *  2. DUPLICATE agent/skill NAMES → a generator error (this module returns a
 *     `duplicate` diagnostic; the CLI exits non-zero). This is the O(N) JS check
 *     the encoding rule mandates — a set-uniqueness MAPPED TYPE is the TS2589
 *     wall (measured ≈ N=1000), so duplicates are NEVER a type.
 *  3. The whole-harness CAPABILITY LATTICE: the UNION of every agent's
 *     `effectSurface(tools, dialect)` — a generator-computed value + type, the
 *     substrate the future repo-scale capability-diff reads.
 *  4. CROSS-FILE TYPED COMPOSITION: when a `railway()` success-track step declares
 *     what it `needs()`, the gen file emits one shallow per-pair assertion
 *     (`Handoff<OkOf<typeof registry[producer]>, needs>` — O(N), no recursion)
 *     that the PRIOR step's `result().ok` SUPPLIES it, so a cross-file handoff
 *     mismatch (a missing field / wrong type) is a `tsc` error naming the field.
 *     The repo-scale generalization of the per-file `pipe`/`Supplies` composition.
 *     Scoped to the linear success track; recover/onError (which consume an `err`,
 *     not the prior `ok`) are a noted follow-up.
 *
 * Harness-agnostic: the `dialect` (for the capability lattice) is INJECTED by
 * the composition root (the CLI), never hard-coded — mirroring `compileAgent` /
 * `scanPlugin`. The core stays free of any Claude-Code literal.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, relative, dirname } from "node:path";
import type { HarnessDialect } from "./dialect.js";
import { effectSurface, type PurityLevel } from "./effects.js";

// ---------------------------------------------------------------------------
// Inputs — the spec facts the generator needs (decoupled from how they're read)
// ---------------------------------------------------------------------------

/** One agent the harness defines (its registry-relevant facts). */
export interface HarnessAgentEntry {
  /** The agent's dispatch name — also a registry key + the dangling-check union. */
  readonly name: string;
  /** The agent's declared tool contract (used to compute its effect surface). */
  readonly tools?: readonly string[];
  /** The spec file this agent came from (for import + duplicate diagnostics). */
  readonly file: string;
}

/** One delegate edge: a railway dispatches `target` (resolved against agents). */
export interface HarnessDelegateEdge {
  /** The railway / orchestrator the edge originates from (for the diagnostic). */
  readonly from: string;
  /** The delegate target name — must resolve to a known agent, else dangling. */
  readonly target: string;
}

/**
 * One CROSS-FILE handoff edge: a consecutive success-track pair where the
 * CONSUMER (`to`) declares the input it `needs`, asserted against the PRODUCER
 * (`from`, the prior step's agent) `result().ok` at the type level. The
 * registry already imports each agent's `TypedAgentSpec`, so the generator reads
 * the producer's `ok` shape off the registry (`OkOf<typeof registry[from]>`) and
 * emits one shallow `Handoff<>` assertion per such pair (O(N), no recursion).
 */
export interface HarnessHandoffEdge {
  /** The railway the edge originates from (for the diagnostic). */
  readonly railway: string;
  /** The PRODUCER agent name (the prior success-track step) — registry key. */
  readonly from: string;
  /** The CONSUMER agent name (this step) — names the failing edge. */
  readonly to: string;
  /** The consumer's declared input shape (`needs(...)`) — the literal emitted. */
  readonly needs: Readonly<Record<string, string>>;
}

/** Everything the generator needs, already loaded (the pure-core input). */
export interface HarnessModel {
  readonly agents: readonly HarnessAgentEntry[];
  readonly edges: readonly HarnessDelegateEdge[];
  /**
   * Cross-file handoff edges (consecutive success-track step pairs whose
   * consumer declares `needs`). Optional + defaults to none, so an existing
   * model with no handoffs generates exactly as before — backwards-compatible.
   */
  readonly handoffs?: readonly HarnessHandoffEdge[];
}

export interface GenerateHarnessOptions {
  /** The dialect the capability lattice is computed against (injected). */
  readonly dialect: HarnessDialect;
  /**
   * The module specifier the generated file imports `KnownAgentName` from.
   * Defaults to the public package (`"vigiles/spec"`); the in-repo dogfood
   * passes a relative path so the generated file resolves without the package.
   */
  readonly specImport?: string;
  /** The directory the gen file will be written to (to relativize spec imports). */
  readonly outDir: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A duplicate-name collision found at codegen time (the O(N) JS check). */
export interface DuplicateNameDiagnostic {
  readonly name: string;
  readonly first: string;
  readonly second: string;
  /** A ready-to-print message. */
  readonly message: string;
}

/** The whole-harness capability lattice — the union of every agent's surface. */
export interface HarnessCapabilities {
  /** Every read-only tool reachable anywhere in the harness (de-duped, sorted). */
  readonly readOnly: readonly string[];
  /** Every side-effecting tool reachable anywhere (de-duped, sorted). */
  readonly sideEffecting: readonly string[];
  /** Every unknown-effect tool (MCP / unrecognized) reachable anywhere. */
  readonly unknown: readonly string[];
  /** The harness-wide purity: the LOOSEST purity of any single agent. */
  readonly purity: PurityLevel;
}

export interface GenerateHarnessResult {
  /** The generated `harness.gen.ts` source (always produced — even on a dup, so
   *  the caller can decide; the CLI gates the WRITE on `duplicate` being absent). */
  readonly gen: string;
  /** The computed capability lattice (also embedded in `gen`). */
  readonly capabilities: HarnessCapabilities;
  /** Set iff two agents declare the same name — the caller exits non-zero. */
  readonly duplicate?: DuplicateNameDiagnostic;
  /** The number of agents + edges folded in (for the CLI summary). */
  readonly agentCount: number;
  readonly edgeCount: number;
  /** The number of cross-file handoff assertions emitted (for the CLI summary). */
  readonly handoffCount: number;
}

// ---------------------------------------------------------------------------
// Capability lattice — the O(N) union over every agent's effect surface
// ---------------------------------------------------------------------------

/** Rank the purity rungs so the harness purity is the LOOSEST agent's. */
const PURITY_RANK: Record<PurityLevel, number> = {
  pure: 0,
  bounded: 1,
  unrestricted: 2,
};

/**
 * Fold every agent's `effectSurface` into one harness-wide lattice: the union of
 * each bucket and the loosest purity. An agent with no `tools` inherits all (a
 * wildcard), so its surface is `unrestricted` — handled by `effectSurface` when
 * we pass `["*"]`. O(N) over the agents; the per-agent legs are fixed-arity.
 */
export function computeHarnessCapabilities(
  agents: readonly HarnessAgentEntry[],
  dialect: HarnessDialect,
): HarnessCapabilities {
  const readOnly = new Set<string>();
  const sideEffecting = new Set<string>();
  const unknown = new Set<string>();
  let purityRank = 0;

  for (const a of agents) {
    // No `tools` line means inherits-all → a wildcard surface (unrestricted).
    const tools = a.tools && a.tools.length > 0 ? a.tools : ["*"];
    const surface = effectSurface(tools, dialect);
    for (const t of surface.readOnly) readOnly.add(t);
    for (const t of surface.sideEffecting) sideEffecting.add(t);
    for (const t of surface.unknown) unknown.add(t);
    purityRank = Math.max(purityRank, PURITY_RANK[surface.purity]);
  }

  const PURITY_BY_RANK: readonly PurityLevel[] = [
    "pure",
    "bounded",
    "unrestricted",
  ];
  const purity = PURITY_BY_RANK[purityRank];

  return {
    readOnly: [...readOnly].sort(),
    sideEffecting: [...sideEffecting].sort(),
    unknown: [...unknown].sort(),
    purity,
  };
}

// ---------------------------------------------------------------------------
// Duplicate-name detection — the O(N) JS check (NOT a type; the TS2589-safe path)
// ---------------------------------------------------------------------------

/**
 * Find the FIRST pair of agents that declare the same `name`. O(N) over the
 * agents — the set-cardinality check the encoding rule says must live in the JS
 * generator, never as an N×N mapped type (the measured TS2589 wall). Returns
 * `undefined` when names are unique.
 */
export function findDuplicateName(
  agents: readonly HarnessAgentEntry[],
): DuplicateNameDiagnostic | undefined {
  const seen = new Map<string, string>();
  for (const a of agents) {
    const prior = seen.get(a.name);
    if (prior !== undefined) {
      return {
        name: a.name,
        first: prior,
        second: a.file,
        message: `duplicate agent name "${a.name}" — declared in both ${prior} and ${a.file}`,
      };
    }
    seen.set(a.name, a.file);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Emission — the pure core (string in, string out, fully testable, no fs read)
// ---------------------------------------------------------------------------

/** A valid TS identifier derived from a registry key (for the import binding). */
function identFor(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`;
}

/** Relativize an import path against the gen file's directory (POSIX `./…`). */
function relImport(fromDir: string, toFile: string): string {
  let r = relative(fromDir, toFile).replace(/\\/g, "/");
  if (!r.startsWith(".")) r = "./" + r;
  return r;
}

/**
 * Emit the cross-file handoff assertions. For each consecutive success-track
 * pair whose CONSUMER declares `needs`, read the PRODUCER's `result().ok` off
 * the registry (`OkOf<typeof registry[from]>`) and assert `Handoff<producerOk,
 * needs>` is `true`. A missing field / wrong type collapses it to
 * `{ __handoff_error: … }`, so `= true` is a tsc error naming the field — across
 * files, at edit time. One shallow assertion per pair (O(N), no recursion).
 */
function handoffCheckLines(handoffs: readonly HarnessHandoffEdge[]): string[] {
  const L: string[] = [
    "// CHECK: every declared handoff lines up — the producer's result().ok",
    "// must SUPPLY the consumer's needs. A mismatch makes `Handoff<…>` a",
    "// `{ __handoff_error: … }` object, so `= true` is a tsc error naming the field.",
  ];
  handoffs.forEach((h, i) => {
    const needsLiteral = `{ ${Object.entries(h.needs)
      .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join("; ")} }`;
    L.push(
      `const _handoff_${String(i)}: Handoff<OkOf<typeof registry[${JSON.stringify(h.from)}]>, ${needsLiteral}> = true;`,
    );
    L.push(`void _handoff_${String(i)}; // ${h.railway}: ${h.from} → ${h.to}`);
  });
  L.push("");
  return L;
}

/**
 * Generate the `harness.gen.ts` source over an already-loaded `HarnessModel`.
 *
 * Pure: no filesystem read, no spec loading — just string emission + the two
 * O(N) computations (capability lattice + duplicate check). The fs/scan wrapper
 * (`loadHarnessModel`) feeds this.
 */
export function generateHarness(
  model: HarnessModel,
  options: GenerateHarnessOptions,
): GenerateHarnessResult {
  const { dialect, outDir } = options;
  const specImport = options.specImport ?? "vigiles/spec";

  // Stable order: agents sorted by name (deterministic output → clean diffs).
  const agents = [...model.agents].sort((a, b) => a.name.localeCompare(b.name));

  const duplicate = findDuplicateName(agents);
  const capabilities = computeHarnessCapabilities(agents, dialect);

  // Each agent gets a unique import binding. The registry key is the agent name.
  const bindings = agents.map((a) => ({
    ...a,
    ident: identFor(a.name),
    import: relImport(outDir, a.file),
  }));

  const L: string[] = [];
  L.push("// AUTO-GENERATED by `vigiles generate-harness` — DO NOT EDIT.");
  L.push(
    "// One typed registry over every *.spec.ts in the harness, so a single",
  );
  L.push("// `tsc --noEmit` cross-checks the WHOLE harness as one program.");
  L.push(
    "// Regenerate with `vigiles generate-harness` (wired to a spec guard).",
  );
  L.push("");
  const handoffs = model.handoffs ?? [];
  const specTypeImports =
    handoffs.length > 0 ? "KnownAgentName, Handoff, OkOf" : "KnownAgentName";
  L.push(
    `import type { ${specTypeImports} } from ${JSON.stringify(specImport)};`,
  );
  L.push("");

  for (const b of bindings) {
    L.push(`import ${b.ident} from ${JSON.stringify(b.import)};`);
  }
  L.push("");

  // The registry record. `as const` keeps each value's precise type for the
  // future cross-file handoff check; today the registry is keyed by agent name.
  L.push("export const registry = {");
  for (const b of bindings) {
    L.push(`  ${JSON.stringify(b.name)}: ${b.ident},`);
  }
  L.push("} as const;");
  L.push("");

  // The literal union of every agent name. The generator emits this (the value's
  // `name` field is `string`, not a literal, so the union can't be recovered
  // from the imported type — the generator KNOWS the names, so it writes them).
  L.push(
    "// The literal union of every agent name in the harness — the set every",
  );
  L.push(
    "// delegate target is checked against (the dangling-delegate basis).",
  );
  if (bindings.length === 0) {
    L.push("export type AgentName = never;");
  } else {
    L.push("export type AgentName =");
    bindings.forEach((b, i) => {
      const tail = i === bindings.length - 1 ? ";" : "";
      L.push(`  | ${JSON.stringify(b.name)}${tail}`);
    });
  }
  L.push("");

  // ---- CHECK: dangling delegate → tsc error (one shallow assertion per edge) --
  if (model.edges.length > 0) {
    L.push(
      "// CHECK: every delegate target resolves to a real agent. A dangling",
    );
    L.push(
      "// target makes `KnownAgentName<target, AgentName>` a `{ __dangling_delegate }`",
    );
    L.push(
      "// object, so assigning `true` to it is a tsc error naming the target.",
    );
    model.edges.forEach((e, i) => {
      L.push(
        `const _edge_${String(i)}: KnownAgentName<${JSON.stringify(e.target)}, AgentName, ${JSON.stringify(e.from)}> = true;`,
      );
      L.push(`void _edge_${String(i)}; // ${e.from} → ${e.target}`);
    });
    L.push("");
  }

  // ---- CHECK: cross-file handoff → tsc error (one shallow assertion per pair) -
  if (handoffs.length > 0) L.push(...handoffCheckLines(handoffs));

  // ---- The whole-harness capability lattice (a generator-computed value) ------
  L.push(
    "// The whole-harness capability lattice — the UNION of every agent's",
  );
  L.push(
    "// effect surface. The substrate a repo-scale capability-diff reads.",
  );
  L.push("export const harnessCapabilities = {");
  L.push(`  readOnly: ${JSON.stringify(capabilities.readOnly)},`);
  L.push(`  sideEffecting: ${JSON.stringify(capabilities.sideEffecting)},`);
  L.push(`  unknown: ${JSON.stringify(capabilities.unknown)},`);
  L.push(`  purity: ${JSON.stringify(capabilities.purity)},`);
  L.push("} as const;");
  L.push("");

  return {
    gen: L.join("\n") + "\n",
    capabilities,
    duplicate,
    agentCount: agents.length,
    edgeCount: model.edges.length,
    handoffCount: handoffs.length,
  };
}

// ---------------------------------------------------------------------------
// fs/scan wrapper — discover *.spec.ts, build the model from loaded spec values
// ---------------------------------------------------------------------------

/** A minimal shape of a loaded spec value (the fields the model reads). */
interface LoadedSpecLike {
  readonly _specType?: string;
  readonly name?: string;
  readonly tools?: readonly string[];
  readonly steps?: readonly {
    readonly agent?: string;
    readonly needs?: Readonly<Record<string, string>>;
  }[];
  readonly onError?: { readonly agent?: string };
  readonly recover?: { readonly step?: { readonly agent?: string } };
}

/** Discover every `*.spec.ts` directly under `dir` (non-recursive, sorted). */
export function findHarnessSpecFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".spec.ts"))
    .sort();
}

/**
 * Build a `HarnessModel` from `dir`'s spec files using a caller-supplied
 * `load(file) → value` (the CLI injects its `loadSpec`, so this stays
 * fs/runtime-agnostic and unit-testable with fakes). Agents become registry
 * entries; railways contribute delegate edges (steps + recover + onError).
 */
export async function loadHarnessModel(
  dir: string,
  load: (absFile: string) => Promise<LoadedSpecLike | null>,
): Promise<HarnessModel> {
  const files = findHarnessSpecFiles(dir);
  const agents: HarnessAgentEntry[] = [];
  const edges: HarnessDelegateEdge[] = [];
  const handoffs: HarnessHandoffEdge[] = [];

  for (const file of files) {
    const abs = `${dir}/${file}`;
    const spec = await load(abs);
    if (!spec) continue;
    if (spec._specType === "agent" && typeof spec.name === "string") {
      agents.push({ name: spec.name, tools: spec.tools, file: abs });
    } else if (spec._specType === "railway" && typeof spec.name === "string") {
      edges.push(...railwayEdges(spec.name, spec));
      handoffs.push(...railwayHandoffs(spec.name, spec.steps ?? []));
    }
  }

  return { agents, edges, handoffs };
}

/** The delegate edges a railway contributes (steps + recover + onError). */
function railwayEdges(
  from: string,
  spec: LoadedSpecLike,
): HarnessDelegateEdge[] {
  const out: HarnessDelegateEdge[] = [];
  const push = (agentName: string | undefined): void => {
    if (typeof agentName === "string") out.push({ from, target: agentName });
  };
  for (const step of spec.steps ?? []) push(step.agent);
  push(spec.recover?.step?.agent);
  push(spec.onError?.agent);
  return out;
}

/**
 * The cross-file handoff edges a railway contributes: each consecutive
 * success-track pair whose CONSUMER declares `needs` asserts the PRODUCER (the
 * prior step) supplies it. Scoped to the LINEAR success track — recover/onError
 * consume an `err`, not the prior `ok`, so they are a noted follow-up.
 */
function railwayHandoffs(
  railwayName: string,
  steps: NonNullable<LoadedSpecLike["steps"]>,
): HarnessHandoffEdge[] {
  const out: HarnessHandoffEdge[] = [];
  for (let i = 1; i < steps.length; i++) {
    const producer = steps[i - 1].agent;
    const consumer = steps[i].agent;
    const need = steps[i].needs;
    if (
      need &&
      Object.keys(need).length > 0 &&
      typeof producer === "string" &&
      typeof consumer === "string"
    ) {
      out.push({
        railway: railwayName,
        from: producer,
        to: consumer,
        needs: need,
      });
    }
  }
  return out;
}

/** Convenience: the gen file's basename, used by the CLI default out path. */
export const HARNESS_GEN_FILENAME = "harness.gen.ts";

/** Relative label for a path under cwd (CLI-only nicety; pure). */
export function labelFor(cwd: string, abs: string): string {
  const r = relative(cwd, abs);
  return r === "" ? basename(abs) : r;
}

/** Read a spec file's raw text (helper exposed for callers that need the source). */
export function readSpecSource(absFile: string): string {
  return readFileSync(absFile, "utf-8");
}

/** The directory a gen file at `outFile` lives in (helper for the CLI). */
export function genOutDir(outFile: string): string {
  return dirname(outFile);
}
