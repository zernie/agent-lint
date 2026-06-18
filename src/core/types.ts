import type { HarnessDialect } from "./dialect.js";

/** A parsed rule from a markdown instruction file. */
export interface ParsedRule {
  title: string;
  line: number;
  enforcement: "enforced" | "guidance" | "disabled" | "missing";
  enforcedBy: string | null;
}

/** A validation error produced by a rule check. */
export interface ValidationError {
  rule: string;
  message: string;
  line: number;
}

/** Result of validating a single file's content. */
export interface ValidationResult {
  rules: ParsedRule[];
  enforced: number;
  guidanceOnly: number;
  disabled: number;
  missing: number;
  total: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  valid: boolean;
}

/** Result of reading a file (may be skipped due to symlinks). */
export interface ReadResult {
  content: string | null;
  skipped: boolean;
  reason: string | null;
}

/** Result of validating a single file path. */
export interface FileResult {
  path: string;
  skipped: boolean;
  reason: string | null;
  result: ValidationResult | null;
}

/** Combined result of validating multiple file paths. */
export interface ValidatePathsResult {
  fileResults: FileResult[];
  valid: boolean;
}

/** Toggleable rule settings. */
/** Rule severity: "warn" prints but exits 0, "error" fails, false disables. */
export type RuleSeverity = "warn" | "error" | false;

/** Rule with options: severity alone or [severity, options] tuple. */
export type RuleWithOptions<T> =
  | RuleSeverity
  | [Exclude<RuleSeverity, false>, T];

/** Options for the coverage rule. */
export interface CoverageThresholds {
  /** Min % of enabled linter rules with enforce() declarations. */
  linterRules?: number;
  /** Min % of npm scripts documented in spec commands. */
  scripts?: number;
}

/** Options for the orphan-docs check. */
export interface OrphansConfig {
  /**
   * Glob patterns of `.md` files to scan for orphans. A doc is "orphaned"
   * when no other markdown file references it. Defaults to vigiles-repo
   * convention: `["docs/**\/*.md", "research/**\/*.md"]`. Set to `[]` to
   * disable orphan detection entirely.
   */
  include?: readonly string[];
  /**
   * Glob patterns to exclude within the include scope. Same shape as
   * `tsconfig.json#exclude`.
   */
  exclude?: readonly string[];
}

/** Options for the untested-surface check. */
export interface TestCoverageConfig {
  /** Scan skills. Default true. */
  skills?: boolean;
  /** Scan subagents. Default true. */
  agents?: boolean;
  /** Scan hook scripts referenced from plugin.json / settings.json. Default true. */
  hooks?: boolean;
  /** Globs of test files that count as coverage. */
  testGlobs?: readonly string[];
  /** Extra ignore globs. */
  exclude?: readonly string[];
}

export interface RulesConfig {
  /** Require .spec.ts for CLAUDE.md / AGENTS.md. Default: "warn". */
  "require-spec"?: RuleSeverity;
  /**
   * @deprecated Skills are legitimately hand-written; use `untested-surface`
   * ("every skill ships with a test/eval") instead. Default: false (off). The
   * check still runs if you set this explicitly.
   */
  "require-skill-spec"?: RuleSeverity;
  /** Detect hand-edits to compiled markdown via SHA-256 hash. Default: "warn". */
  integrity?: RuleSeverity;
  /** Enforce minimum spec coverage thresholds. Default: false. ESLint-style: ["warn", { scripts: 50 }]. */
  coverage?: RuleWithOptions<CoverageThresholds>;
  /** Flag skills/agents/hooks with no test or eval. Default: "warn". */
  "untested-surface"?: RuleWithOptions<TestCoverageConfig>;
  /**
   * Nudge (or block) when an instruction file has code-shaped references that
   * aren't expressed as vigiles marks (so the lint can't verify them), or a
   * `vigiles:symbol` mark that points at a missing symbol. Drives the
   * PostToolUse refs-hook: "warn" (default) → a non-blocking nudge, "error" →
   * block the edit, false → off.
   */
  "unmarked-refs"?: RuleSeverity;
}

// ---------------------------------------------------------------------------
// Rule parsing helpers
// ---------------------------------------------------------------------------

/** Extract severity from a rule value (handles both simple and tuple forms). */
export function ruleSeverity<T>(
  rule: RuleWithOptions<T> | undefined,
): RuleSeverity {
  if (rule === undefined) return false;
  if (Array.isArray(rule)) return rule[0];
  return rule;
}

/** Extract options from a rule value (returns undefined for simple severity). */
export function ruleOptions<T>(
  rule: RuleWithOptions<T> | undefined,
): T | undefined {
  if (Array.isArray(rule)) return rule[1];
  return undefined;
}

/** Full vigiles configuration. Loaded from .vigilesrc.json. */
export interface VigilesConfig {
  // --- Validation ---
  ruleMarkers: MarkerType[];
  rules: Required<RulesConfig>;
  files: string[];

  // --- Compilation ---
  /** Maximum number of rules allowed per spec. */
  maxRules?: number;
  /** Maximum estimated tokens for compiled output. */
  maxTokens?: number;
  /** Maximum lines per prose section. */
  maxSectionLines?: number;
  /** Skip config-enabled checks, only verify rule exists in catalog. */
  catalogOnly?: boolean;
  /** Custom linter configs (rulesDir). */
  linters?: Record<string, { rulesDir?: string | string[] }>;
  /** Orphan-docs check configuration. Include/exclude globs, tsconfig-style. */
  orphans?: OrphansConfig;
  /**
   * The harness(es) this repo targets — selects the compile dialect / skill
   * frontmatter profile / instruction-file shape, instead of sniffing the cwd.
   * A single name (`"codex"`) for the common single-harness repo, or an array
   * (`["claude-code", "codex"]`) declaring the supported set. Written by
   * `vigiles init`. Omitted → the CLI auto-detects (backwards-compatible).
   * Canonical adapter names; `"claude"` is accepted as an alias for
   * `"claude-code"`. See research/multi-harness-compile.md.
   */
  harness?: string | string[];
}

/** Valid marker types for rule detection. */
export type MarkerType = "headings" | "checkboxes";

/** Options for parseRules. */
export interface ParseOptions {
  ruleMarkers?: MarkerType[];
}

/** Options for validate(). */
export interface ValidateOptions {
  ruleMarkers?: MarkerType[];
  rules?: RulesConfig;
  filePath?: string;
  /** Injected harness dialect; its instructionTargets define recognized
   *  instruction filenames. Omitted → the validator's built-in default set. */
  dialect?: HarnessDialect;
}

/** Options for validatePaths(). */
export interface ValidatePathsOptions {
  followSymlinks?: boolean;
  ruleMarkers?: MarkerType[];
  rules?: RulesConfig;
}

/** Options for readInstructionFile(). */
export interface ReadOptions {
  followSymlinks?: boolean;
}
