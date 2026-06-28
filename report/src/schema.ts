/**
 * The AuditReport wire types — a MIRROR of the CLI's `src/audit-report.ts` (+
 * `audit-score.ts` / `optimize.ts`). This sub-package builds independently, so it
 * can't import the CLI's source; the contract is versioned (`meta.schemaVersion`)
 * and additive-only, and the CLI's `report-schema-parity` test asserts these stay
 * in sync. Keep them aligned when the schema changes.
 */
export type CategoryKey =
  | "Truthfulness"
  | "Triggering"
  | "Structure"
  | "Tested";

export interface CategoryScore {
  key: CategoryKey;
  score: number | null;
  weight: number;
  /**
   * Advisory categories (e.g. Tested) are shown but EXCLUDED from the overall
   * grade — an untested surface is a hardening signal, not breakage. The report
   * renders an advisory ring neutrally (a muted "advisory" label), never as a
   * failing/red ring that appears to drag the grade.
   */
  advisory?: boolean;
  findings: string[];
}

export interface AuditScore {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: CategoryScore[];
  empty: boolean;
}

export type OptimizeAction = "fix" | "differentiate";

export interface Recommendation {
  surface: string;
  action: OptimizeAction;
  rationale: string;
  fix: string;
  detector: string;
  confidence: "likely" | "possible";
}

export interface AuditInventory {
  skills: number;
  agents: number;
  hooks: number;
  commands: number;
  mcp: boolean;
  untested: number;
}

export interface BrokenRef {
  kind: "enforce" | "file" | "cmd" | "dir";
  ref: string;
  issue: string;
}

export interface AdoptabilityResult {
  total: number;
  broken: number;
  brokenRefs: BrokenRef[];
}

export interface AdoptableSurface {
  path: string;
  command: string;
}

export interface Adoptable {
  surfaces: AdoptableSurface[];
  createAllCommand: string;
}

export interface AuditReport {
  meta: {
    schemaVersion: number;
    tool: string;
    vigilesVersion: string;
    harness: string;
    dir: string;
    generatedAt?: string;
  };
  score: AuditScore;
  recommendations: Recommendation[];
  inventory: AuditInventory;
  /** The adoption preview — present only when the model-gated tier ran. */
  adoptability?: AdoptabilityResult;
  /**
   * Surfaces that exist but aren't spec-managed yet, each with its adopt command,
   * plus a "create all" command. Drives the "Create spec" / "Create all specs"
   * command-emit affordances. Present only when there's something to adopt.
   */
  adoptable?: Adoptable;
}
