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

/**
 * Shared options for the per-kind untested-* rules (`untested-skill` /
 * `untested-subagent` / `untested-hook`). Which kinds are scanned is controlled by
 * each rule's severity (set a rule to `false` to skip that kind), so only the
 * test-discovery knobs live here.
 */
export interface TestCoverageConfig {
  /** Globs of test files that count as coverage. */
  testGlobs?: readonly string[];
  /** Extra ignore globs. */
  exclude?: readonly string[];
}

export interface RulesConfig {
  /**
   * Require a `.spec.ts` behind each instruction file (CLAUDE.md / AGENTS.md) —
   * the file must be compiled from a typed spec, not hand-written. NARROW: only a
   * `.spec.ts` sibling (or an explicit `<!-- vigiles-disable
   * require-instructions-spec -->` marker) satisfies it; inline
   * `<!-- vigiles:enforce -->` comments do NOT (the rule name says "spec"). Default:
   * "warn". `vigiles init` auto-adopts every instruction file into a spec, so this
   * is GREEN by construction after setup — a safety net for a NEW hand-added file,
   * not a nag. The workflow-tier opt-in (gated under `--strict`).
   */
  "require-instructions-spec"?: RuleSeverity;
  /**
   * Require a `.spec.ts` behind each SKILL.md — the consistent
   * `require-<surface>-spec` parallel to `require-instructions-spec`. Default:
   * false (OFF): skills are legitimately hand-written, and the coverage that
   * matters ("every skill ships with a test/eval") is the `untested-skill` rule.
   * Set it explicitly if your team wants every skill spec-managed.
   */
  "require-skill-spec"?: RuleSeverity;
  /** Detect hand-edits to compiled markdown via SHA-256 hash. Default: "warn". */
  integrity?: RuleSeverity;
  /** Enforce minimum spec coverage thresholds. Default: false. ESLint-style: ["warn", { scripts: 50 }]. */
  coverage?: RuleWithOptions<CoverageThresholds>;
  /** Flag a skill (SKILL.md) that ships with no test or eval. Default: "warn". */
  "untested-skill"?: RuleWithOptions<TestCoverageConfig>;
  /** Flag a subagent (agents/*.md) that ships with no test or eval. Default: "warn". */
  "untested-subagent"?: RuleWithOptions<TestCoverageConfig>;
  /** Flag a hook script that ships with no test or eval. Default: "warn". */
  "untested-hook"?: RuleWithOptions<TestCoverageConfig>;
  /**
   * Nudge (or block) when an instruction file has code-shaped references that
   * aren't expressed as vigiles marks (so the lint can't verify them), or a
   * `vigiles:symbol` mark that points at a missing symbol. Drives the
   * PostToolUse refs-hook: "warn" (default) → a non-blocking nudge, "error" →
   * block the edit, false → off.
   */
  "unmarked-refs"?: RuleSeverity;
  /**
   * Cross-reference each subagent's `tools:` rail against the harness tool
   * catalog — flag a never-available tool or a close typo (the moat). Only
   * high-confidence issues are reported (a bare unrecognized tool is likely
   * plugin/MCP-provided, never flagged). Off unless set; "warn" surfaces,
   * "error" gates CI. Same detector as `scan` + `compileAgent`.
   */
  "subagent-tool-contract"?: RuleSeverity;
  /**
   * Flag a hook registered under an event name the harness doesn't define (a
   * typo → the hook never fires). High-precision: close typos only, never a
   * framework/custom event. Default "warn"; "error" gates CI. Same detector as
   * `scan`.
   */
  "hook-events"?: RuleSeverity;
  /**
   * Flag a skill/agent missing a required frontmatter field — a skill needs
   * `name` (to load), an agent needs `name` + `description`. A broken surface
   * that won't register. Default "warn"; "error" gates CI. Same detector as `scan`.
   */
  "subagent-frontmatter"?: RuleSeverity;
  /**
   * Flag a declared MCP server that can't start — neither a `command` (stdio)
   * nor a `url` (http/sse). Default "warn"; "error" gates CI. Same detector as
   * `scan`. (JSON `.mcp.json`/manifest `mcpServers`; Codex TOML not yet parsed.)
   */
  "mcp-config"?: RuleSeverity;
  /**
   * RECOMMEND (not require) that a SKILL.md declares an explicit `name` +
   * `description` rather than relying on the dir-name / first-paragraph
   * fallbacks — a more reliable trigger surface. The skill still loads without
   * them, so this is a best-practice nudge: default "warn"; set "error" to
   * enforce on your own skills. Same detector as `scan` (skillMetaIssues).
   */
  "skill-frontmatter"?: RuleSeverity;
  /**
   * Cross-reference an `mcp__server__tool` in a subagent's contract against the
   * plugin's declared `mcpServers` — flag a server the plugin doesn't declare
   * (the MCP half of the tool moat; `subagent-tool-contract` checks the built-in
   * half). High-precision: only flags when the plugin SHIPS a declared set,
   * allowlists harness built-ins (`ide`), and skips the plugin-namespaced
   * `mcp__plugin_…` form. Default "warn"; "error" gates CI. Same detector as
   * `scan` (mcpToolIssues).
   */
  "mcp-tool-resolves"?: RuleSeverity;
  /**
   * Flag a hook command that references a script file which doesn't exist on
   * disk (with `${CLAUDE_PLUGIN_ROOT}` resolved) — the hook silently never runs.
   * FP-safe: skips unresolved `$VAR` paths, existence-guarded one-liners, and
   * inline commands. Matches Anthropic's own `claude plugin validate`. Default
   * "warn"; "error" gates CI. Same detector as `scan` (hooks status "missing").
   */
  "hook-script-exists"?: RuleSeverity;
  /**
   * A single repo-level RECOMMENDATION (one finding regardless of hook count):
   * when a plugin/repo ships hand-written hook commands that aren't compiled
   * `vigiles/hook` artifacts, nudge toward compiled hooks — they make whole hook
   * bug classes (exit-1-not-2, wrong decision field, matcher bypass) UNREPRESENTABLE
   * at authoring time, and `guardrail-check` proves an existing one blocks. A
   * discovery nudge, not a defect: the hand-written shell lane stays first-class,
   * so it's opt-out and fires ONCE (never per-hook). The message links
   * `docs/compiled-hooks.md`. Default "warn"; set "off" to silence or "error" to
   * enforce. Same detector as `scan` (manualHookCount).
   */
  "prefer-compiled-hooks"?: RuleSeverity;
  /**
   * Cross-reference a subagent's `disallowedTools:` block-list against the
   * catalog — the deny-side mirror of `subagent-tool-contract`. A close typo there
   * blocks NOTHING (you meant to deny `Bash`, wrote `Bsh`), leaving the tool
   * available. High-precision: close-typo only (a never-available tool is
   * harmless to list, a bare unknown is likely a plugin tool). Default "warn";
   * "error" gates CI. Same detector as `scan` (disallowedToolIssues).
   */
  "disallowed-tools-contract"?: RuleSeverity;
  /**
   * Flag two model-invocable skills whose descriptions are near-identical — the
   * selector can't tell them apart, so the wrong one fires (a precision
   * collision). A DETERMINISTIC NCD proxy for a `--trigger`-class behavioral bug;
   * calibrated FP-safe (only basically-identical text, below the sweep's
   * most-similar distinct pair). Default "warn"; "error" gates CI. Same detector
   * as `scan` (descriptionOverlaps).
   */
  "description-overlap"?: RuleSeverity;
  /**
   * Flag a skill/agent whose `---` frontmatter block EXISTS but isn't valid YAML
   * — fields may not parse as intended. CAVEAT: a real YAML parser (js-yaml) is
   * stricter than some loaders, so a one-line `description:` containing a `: `
   * colon or an `<example>` block is flagged even though it may still load.
   * Hence default "warn" (a nudge), not "error" — verify before enforcing. Same
   * detector as `scan` (malformedFrontmatter).
   */
  "frontmatter-valid"?: RuleSeverity;
  /**
   * Flag a `type: "mcp_tool"` hook action that's incomplete (missing `server` /
   * `tool`) or targets a server the plugin doesn't declare in `mcpServers` — the
   * hook silently never dispatches. High-precision: the undeclared-server half is
   * gated on the plugin shipping a declared set and allowlists built-ins (`ide`),
   * mirroring `mcp-tool-resolves`. Default "warn"; "error" gates CI. Same detector
   * as `scan` (mcpHookIssues).
   */
  "mcp-hook-target-resolves"?: RuleSeverity;
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
   * Glob patterns of instruction/skill files to EXCLUDE from `lint` discovery
   * (tsconfig-style, relative to the repo root). Use it for vendored or
   * benchmark fixtures the repo's own lint shouldn't police — e.g.
   * `["bench/**"]` so a third-party `CLAUDE.md` injected verbatim as a benchmark
   * arm isn't held to `require-instructions-spec`. `node_modules`/`dist` are always
   * excluded.
   */
  exclude?: readonly string[];
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
