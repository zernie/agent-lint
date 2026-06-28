/**
 * The `AuditReport` — the versioned JSON contract that IS the audit's product
 * boundary. Everything renders FROM it: the local self-contained HTML report,
 * `audit --json` for CI, and (later) an upload to a hosted dashboard. Because it's
 * the wire format between the CLI and anything downstream, it is VERSIONED
 * (`meta.schemaVersion`) and stable — additive changes only within a version.
 *
 * Pure: `buildAuditReport` assembles the report from the same deterministic pieces
 * the terminal output uses (`auditScore` + `optimize` + the scan inventory) — no
 * re-detection (one-detector-no-drift), no model, no clock (a `generatedAt`
 * timestamp is attached by the CLI at write time, never by this pure builder, so
 * the embedded-in-HTML form stays deterministic).
 */
import { auditScore, type AuditScore } from "./audit-score.js";
import { optimize, type Recommendation } from "./optimize.js";
import type { AdoptabilityResult } from "./adoptability.js";
import type { ScanReport } from "./scan.js";

/** The current schema version. Bump only on a BREAKING change to the shape. */
export const AUDIT_SCHEMA_VERSION = 1;

export interface AuditReportMeta {
  /** Wire-format version — consumers gate on this. */
  readonly schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  readonly tool: "vigiles";
  /** The vigiles version that produced the report. */
  readonly vigilesVersion: string;
  /** The detected/selected harness (`claude-code`, `codex`, …). */
  readonly harness: string;
  /** The audited directory. */
  readonly dir: string;
  /** ISO-8601 produced-at stamp — set by the CLI at write time (NOT the pure builder). */
  readonly generatedAt?: string;
}

/** What the harness ships — the "inventory" surface counts. */
export interface AuditInventory {
  readonly skills: number;
  readonly agents: number;
  readonly hooks: number;
  readonly commands: number;
  readonly mcp: boolean;
  readonly untested: number;
}

/**
 * A surface (skill / subagent / instruction file) that EXISTS but doesn't yet
 * have a `.spec.ts` — so it can be adopted into a typed spec. The report can't
 * write files (it's a browser app), so it EMITS the exact CLI command instead.
 */
export interface AdoptableSurface {
  /** The repo-relative path of the surface (e.g. `skills/foo/SKILL.md`). */
  readonly path: string;
  /** The exact command that adopts this one surface. */
  readonly command: string;
}

/**
 * The adoptable-surfaces list + the "create all" command — the data the report's
 * "Create spec" / "Create all specs" affordances copy to the clipboard. Present
 * only when there's at least one un-spec'd surface; the CLI computes the surface
 * paths (the layout-aware `discoverAdoptableSurfaces`) and passes them in, so the
 * pure builder stays adapter-agnostic.
 */
export interface Adoptable {
  readonly surfaces: readonly AdoptableSurface[];
  /** The one command that adopts every surface at once. */
  readonly createAllCommand: string;
}

/**
 * The full audit, as the dashboard / CI / HTML all consume it. Self-describing
 * and versioned; additive-only within a `schemaVersion`.
 */
export interface AuditReport {
  readonly meta: AuditReportMeta;
  /** The four deterministic category rings + the weighted overall + grade. */
  readonly score: AuditScore;
  /** The deterministic, ranked fixes (the inline recommendations). */
  readonly recommendations: readonly Recommendation[];
  readonly inventory: AuditInventory;
  /**
   * The adoption preview — "what would vigiles catch in your repo?" Present only
   * when the model-gated tier ran (behind consent); a deterministic read omits it.
   * Additive/optional, so the schema version is unchanged.
   */
  readonly adoptability?: AdoptabilityResult;
  /**
   * The surfaces that exist but aren't spec-managed yet, each with the command
   * that adopts it, plus a "create all" command. Drives the report's "Create
   * spec" / "Create all specs" command-emit buttons. Present only when there's
   * at least one adoptable surface. Additive/optional — schema version unchanged.
   */
  readonly adoptable?: Adoptable;
}

export interface BuildAuditReportOptions {
  readonly harness: string;
  readonly vigilesVersion: string;
  /**
   * The repo-relative paths of surfaces that exist but have no `.spec.ts` yet,
   * computed by the CLI's layout-aware `discoverAdoptableSurfaces` (so the pure
   * builder stays adapter-agnostic — it only formats the commands). Omit/empty
   * when there's nothing to adopt.
   */
  readonly adoptableSurfaces?: readonly string[];
}

/** The one command that adopts every un-spec'd surface (bare `init`). */
const CREATE_ALL_COMMAND = "npx vigiles init";

/** The command that adopts ONE surface at a given repo-relative path. */
function adoptCommand(path: string): string {
  return `npx vigiles init --target=${path}`;
}

/**
 * Build the {@link Adoptable} payload from the layout-aware surface paths — pure,
 * just formats the per-surface + create-all commands. Returns `undefined` when
 * there's nothing to adopt (so the field stays absent).
 */
function buildAdoptable(
  surfaces: readonly string[] | undefined,
): Adoptable | undefined {
  if (!surfaces || surfaces.length === 0) return undefined;
  return {
    surfaces: surfaces.map((path) => ({ path, command: adoptCommand(path) })),
    createAllCommand: CREATE_ALL_COMMAND,
  };
}

/**
 * Assemble the versioned {@link AuditReport} from a scan report — pure, no clock.
 * The CLI attaches `meta.generatedAt` when it writes the JSON artifact; the
 * HTML-embedded form omits it so the rendered file stays deterministic.
 */
export function buildAuditReport(
  report: ScanReport,
  opts: BuildAuditReportOptions,
): AuditReport {
  const adoptable = buildAdoptable(opts.adoptableSurfaces);
  return {
    meta: {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      tool: "vigiles",
      vigilesVersion: opts.vigilesVersion,
      harness: opts.harness,
      dir: report.dir,
    },
    score: auditScore(report),
    recommendations: optimize(report).recommendations,
    inventory: {
      skills: report.skills.length,
      agents: report.agents.length,
      // All hooks, file-backed + inline — matches formatScanReport and the
      // emptiness/scoring count, so a JSON/HTML "What it ships" never reports 0
      // hooks for an inline-hook-only harness.
      hooks: report.hooks.length + report.inlineHooks,
      commands: report.commands,
      mcp: report.mcp,
      untested: report.untested,
    },
    ...(adoptable ? { adoptable } : {}),
  };
}
