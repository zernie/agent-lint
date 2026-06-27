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
}
