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
import {
  auditScore,
  type AuditScore,
  type BatterySummary,
} from "./audit-score.js";
import { optimize, type Recommendation } from "./optimize.js";
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
 * The full audit, as the dashboard / CI / HTML all consume it. Self-describing
 * and versioned; additive-only within a `schemaVersion`.
 */
export interface AuditReport {
  readonly meta: AuditReportMeta;
  /** The five category rings + the weighted overall + grade. */
  readonly score: AuditScore;
  /** The deterministic, ranked fixes (the inline recommendations). */
  readonly recommendations: readonly Recommendation[];
  readonly inventory: AuditInventory;
}

export interface BuildAuditReportOptions {
  readonly harness: string;
  readonly vigilesVersion: string;
  /** The safety-battery aggregate (feeds the Safety ring); omit if not run. */
  readonly battery?: BatterySummary;
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
  return {
    meta: {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      tool: "vigiles",
      vigilesVersion: opts.vigilesVersion,
      harness: opts.harness,
      dir: report.dir,
    },
    score: auditScore(report, opts.battery),
    recommendations: optimize(report).recommendations,
    inventory: {
      skills: report.skills.length,
      agents: report.agents.length,
      hooks: report.hooks.length,
      commands: report.commands,
      mcp: report.mcp,
      untested: report.untested,
    },
  };
}
