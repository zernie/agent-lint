import { readFileSync, lstatSync, existsSync, realpathSync } from "node:fs";
import { globSync } from "glob";
import { resolve, basename as pathBasename } from "node:path";
import { cosmiconfigSync } from "cosmiconfig";

import type {
  ParsedRule,
  ValidationError,
  ValidationResult,
  ReadResult,
  FileResult,
  ValidatePathsResult,
  RulesConfig,
  VigilesConfig,
  MarkerType,
  ParseOptions,
  ValidateOptions,
  ValidatePathsOptions,
  ReadOptions,
} from "./types.js";

// Re-export all types for consumers
export type {
  ParsedRule,
  ValidationError,
  ValidationResult,
  ReadResult,
  FileResult,
  ValidatePathsResult,
  RulesConfig,
  VigilesConfig,
  MarkerType,
  ParseOptions,
  ValidateOptions,
  ValidatePathsOptions,
  ReadOptions,
};

// ---------------------------------------------------------------------------
// Constants & regex
// ---------------------------------------------------------------------------

const GUIDANCE_RE = /\*\*Guidance only\*\*/;
const DISABLE_RE = /<!--\s*vigiles-disable\s*-->/;
const RULE_HEADER_RE = /^###\s+(.+)$/;
const CHECKBOX_RE = /^- \[([ xX])\]\s+(.+)$/;

const VALID_MARKERS: readonly MarkerType[] = ["headings", "checkboxes"];

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

// The instruction filenames vigiles recognizes when no dialect is injected — a
// validator-level default, not a harness dialect (the concrete dialects live in
// the adapters; an injected ValidateOptions.dialect overrides this).
const INSTRUCTION_FILES: readonly string[] = ["CLAUDE.md", "AGENTS.md"];

// The default instruction file to validate when no config names one.
const DEFAULT_FILES: string[] = [INSTRUCTION_FILES[0]];

export const DEFAULT_RULES: Required<RulesConfig> = {
  "require-instructions-spec": "warn",
  // Default OFF — the consistent `require-<surface>-spec` parallel. Skills are
  // legitimately hand-written, so requiring a .spec.ts per SKILL.md is the wrong
  // default (it would nag about vendored/fixture/bench skills); the coverage that
  // matters is the `untested-*` rules ("every skill/agent/hook ships with a test
  // or eval"). Set `require-skill-spec` explicitly if your team wants every skill
  // spec-managed.
  "require-skill-spec": false,
  integrity: "warn",
  coverage: false,
  // Per-kind surface-coverage: a skill/agent/hook must ship with a test or eval.
  "untested-skill": "warn",
  "untested-subagent": "warn",
  "untested-hook": "warn",
  "unmarked-refs": "warn",
  // High-precision (never-available + close typos only), so on by default at warn.
  "subagent-tool-contract": "warn",
  // High-precision (close typos only), on by default at warn.
  "hook-events": "warn",
  // Missing required frontmatter (name/description) — on by default at warn.
  "subagent-frontmatter": "warn",
  // A declared MCP server with no command/url can't start — on by default at warn.
  "mcp-config": "warn",
  // Best-practice nudge (skills load without frontmatter) — warn, not error.
  "skill-frontmatter": "warn",
  // High-precision (gated on a declared MCP set; built-ins allowlisted) — warn.
  "mcp-tool-resolves": "warn",
  // A hook script referenced but missing never runs — on by default at warn.
  "hook-script-exists": "warn",
  // Discovery nudge toward compiled hooks (one finding) — default OFF: it's a
  // recommendation, not a defect (the hand-written shell lane stays first-class),
  // so it shouldn't fire unasked. Set "warn"/"error" to opt in.
  "prefer-compiled-hooks": false,
  // High-precision (close-typo only) deny-list mirror of subagent-tool-contract.
  "disallowed-tools-contract": "warn",
  // Deterministic NCD precision proxy (near-identical skill descriptions) — warn.
  "description-overlap": "warn",
  // A model-invocable skill's description so long the trigger signal is buried —
  // WARN only (heuristic proxy, generous 500-char budget); never gates.
  "skill-description-budget": "warn",
  // Malformed-YAML frontmatter — WARN only (js-yaml is stricter than some loaders).
  "frontmatter-valid": "warn",
  // A mcp_tool hook incomplete / targeting an undeclared server — on by default at warn.
  "mcp-hook-target-resolves": "warn",
  // Lethal-trifecta capability set-intersection (read-private + ingest-untrusted +
  // exfiltrate in one unit) — WARN by default (don't-cry-wolf rollout); raise to error.
  "lethal-trifecta": "warn",
  // A SKILL.md body referencing a missing bundled resource — WARN by default
  // (don't-cry-wolf rollout, FP-safe); raise to error to gate CI.
  "skill-resource-resolves": "warn",
  // A SKILL.md missing its opening `---` fence (invisible skill) — WARN by
  // default (FP-safe key whitelist); raise to error to gate CI.
  "skill-missing-fence": "warn",
  // Functional dirs nested inside `.claude-plugin/` (invisible surfaces) — WARN
  // by default; raise to error to gate CI.
  "plugin-dir-layout": "warn",
  // A lethal trifecta emerging across a delegation edge (combined blast radius) —
  // WARN by default (don't-cry-wolf rollout); raise to error to gate CI.
  "delegation-trifecta": "warn",
  // A hook that looks like it blocks but silently doesn't (#19009) — WARN by
  // default (FP-safe literal patterns); raise to error to gate CI.
  "hook-block-ineffective": "warn",
  // A hook matcher that never fires (tool typo / wrong MCP form) — WARN by
  // default (high-precision); raise to error to gate CI.
  "hook-matcher": "warn",
};

const DEFAULT_CONFIG: VigilesConfig = {
  ruleMarkers: ["headings", "checkboxes"],
  rules: DEFAULT_RULES,
  files: DEFAULT_FILES,
};

// ---------------------------------------------------------------------------
// Instruction file discovery
// ---------------------------------------------------------------------------

export function findInstructionFiles(
  cwd: string = process.cwd(),
  configFiles?: string[],
): string[] {
  const candidates = configFiles ?? DEFAULT_FILES;
  return candidates.filter((f) => existsSync(resolve(cwd, f)));
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

export function loadConfig(): VigilesConfig {
  try {
    const explorer = cosmiconfigSync("vigiles", {
      searchPlaces: [".vigilesrc.json"],
      mergeSearchPlaces: false,
    });
    const result = explorer.search();
    if (!result?.config) return { ...DEFAULT_CONFIG };

    const userConfig = result.config as Partial<VigilesConfig> & {
      rules?: Partial<RulesConfig>;
    };

    const config: VigilesConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      rules: { ...DEFAULT_RULES, ...userConfig.rules },
      files: Array.isArray(userConfig.files) ? userConfig.files : DEFAULT_FILES,
    };

    if (
      !Array.isArray(config.ruleMarkers) ||
      !config.ruleMarkers.every((m): m is MarkerType =>
        (VALID_MARKERS as readonly string[]).includes(m),
      )
    ) {
      console.warn(
        `Invalid ruleMarkers in config: ${JSON.stringify(config.ruleMarkers)}. Using default.`,
      );
      config.ruleMarkers = [...DEFAULT_CONFIG.ruleMarkers];
    }

    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseRules(
  content: string,
  { ruleMarkers }: ParseOptions = {},
): ParsedRule[] {
  const markers = ruleMarkers ?? DEFAULT_CONFIG.ruleMarkers;
  const lines = content.split("\n");
  const rules: ParsedRule[] = [];

  let currentRule: ParsedRule | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = markers.includes("headings")
      ? line.match(RULE_HEADER_RE)
      : null;
    const checkboxMatch = markers.includes("checkboxes")
      ? line.match(CHECKBOX_RE)
      : null;

    if (headerMatch ?? checkboxMatch) {
      if (currentRule) {
        rules.push(currentRule);
      }
      const title = headerMatch
        ? headerMatch[1].trim()
        : (checkboxMatch as RegExpMatchArray)[2].trim();
      currentRule = {
        title,
        line: i + 1,
        enforcement: "missing",
        enforcedBy: null,
      };
      continue;
    }

    if (!currentRule || currentRule.enforcement !== "missing") continue;

    const enforcedMatch = line.match(/\*\*Enforced by:\*\*\s*`([^`]+)`/);
    if (enforcedMatch) {
      currentRule.enforcement = "enforced";
      currentRule.enforcedBy = enforcedMatch[1] ?? null;
      continue;
    }

    if (GUIDANCE_RE.test(line)) {
      currentRule.enforcement = "guidance";
      continue;
    }

    if (DISABLE_RE.test(line)) {
      currentRule.enforcement = "disabled";
      continue;
    }
  }

  if (currentRule) {
    rules.push(currentRule);
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export function validate(
  content: string,
  { ruleMarkers, rules: rulesConfig, filePath, dialect }: ValidateOptions = {},
): ValidationResult {
  const activeRules = rulesConfig ?? DEFAULT_RULES;
  const parsedRules = parseRules(content, { ruleMarkers });
  const enforced = parsedRules.filter(
    (r) => r.enforcement === "enforced",
  ).length;
  const guidanceOnly = parsedRules.filter(
    (r) => r.enforcement === "guidance",
  ).length;
  const disabled = parsedRules.filter(
    (r) => r.enforcement === "disabled",
  ).length;
  const missingCount = parsedRules.filter(
    (r) => r.enforcement === "missing",
  ).length;

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const disableComment =
    /<!--\s*vigiles-disable\s+require-instructions-spec\s*-->/;

  if (filePath) {
    const basename = pathBasename(filePath);
    const recognized = dialect?.instructionTargets ?? INSTRUCTION_FILES;
    const isInstruction = recognized.includes(basename);
    const isSkill = basename === "SKILL.md";

    // --- require-instructions-spec (CLAUDE.md / AGENTS.md) ---
    // NARROW: only a `.spec.ts` sibling satisfies it. The rule name says "spec",
    // so inline `<!-- vigiles:enforce -->` / `vigiles:` frontmatter do NOT count
    // (a user on inline mode keeps this rule off — it's a workflow-tier opt-in).
    // `vigiles init` auto-adopts every instruction file into a spec, so this is
    // green by construction after setup.
    const specSeverity = activeRules["require-instructions-spec"];
    if (specSeverity && isInstruction && !disableComment.test(content)) {
      const specPath = filePath + ".spec.ts";
      if (!existsSync(specPath)) {
        const msg: ValidationError = {
          rule: "require-instructions-spec",
          message: `No spec file found for "${filePath}". Expected "${specPath}". Run \`npx vigiles init --target=${filePath}\` to adopt it into a spec, or disable with <!-- vigiles-disable require-instructions-spec -->.`,
          line: 1,
        };
        if (specSeverity === "error") {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }

    // --- require-skill-spec (SKILL.md) — the consistent require-<surface>-spec
    // parallel, off by default; honored when a user sets it explicitly.
    const skillSeverity = activeRules["require-skill-spec"];
    if (skillSeverity && isSkill && !disableComment.test(content)) {
      const specPath = filePath + ".spec.ts";
      if (!existsSync(specPath)) {
        const msg: ValidationError = {
          rule: "require-skill-spec",
          message: `No spec file found for "${filePath}". Expected "${specPath}".`,
          line: 1,
        };
        if (skillSeverity === "error") {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }

  return {
    rules: parsedRules,
    enforced,
    guidanceOnly,
    disabled,
    missing: missingCount,
    total: parsedRules.length,
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

export function readInstructionFile(
  filePath: string,
  options: ReadOptions = {},
): ReadResult {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink() && !options.followSymlinks) {
      return {
        content: null,
        skipped: true,
        reason: `${filePath} is a symlink (use --follow-symlinks to include)`,
      };
    }
  } catch {
    return {
      content: null,
      skipped: false,
      reason: `File not found: ${filePath}`,
    };
  }

  try {
    return {
      content: readFileSync(filePath, "utf-8"),
      skipped: false,
      reason: null,
    };
  } catch {
    return {
      content: null,
      skipped: false,
      reason: `Could not read: ${filePath}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Glob expansion
// ---------------------------------------------------------------------------

export function expandGlobs(patterns: string[]): string[] {
  const GLOB_CHARS = /[*?{[]/;
  const paths: string[] = [];

  for (const pattern of patterns) {
    if (GLOB_CHARS.test(pattern)) {
      const matches = globSync(pattern, { cwd: process.cwd() });
      for (const match of matches.sort()) {
        paths.push(resolve(match));
      }
    } else {
      paths.push(pattern);
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Multi-file validation
// ---------------------------------------------------------------------------

export function validatePaths(
  paths: string[],
  {
    followSymlinks = false,
    ruleMarkers,
    rules: rulesConfig,
  }: ValidatePathsOptions = {},
): ValidatePathsResult {
  const fileResults: FileResult[] = [];
  let allValid = true;
  // Maps a real (symlink-resolved) path → the first path validated for it, so a
  // symlinked/synced CLAUDE.md⇄AGENTS.md mirror is validated ONCE on the real
  // file instead of double-firing require-instructions-spec on the mirror's name (sync-tool-
  // compatibility.md req 7). Recorded only on a successful validation, so a
  // symlink seen first (and skipped) never shadows its real target.
  const seenReal = new Map<string, string>();

  for (const filePath of paths) {
    let real: string;
    try {
      real = realpathSync(filePath);
    } catch {
      real = resolve(filePath);
    }

    const prior = seenReal.get(real);
    if (prior !== undefined) {
      fileResults.push({
        path: filePath,
        skipped: true,
        reason: `mirror of ${prior} (same file via symlink/sync) — validated once`,
        result: null,
      });
      continue;
    }

    const { content, skipped, reason } = readInstructionFile(filePath, {
      followSymlinks,
    });

    if (skipped || content === null) {
      fileResults.push({
        path: filePath,
        skipped,
        reason,
        result: null,
      });
      if (!skipped) allValid = false;
      continue;
    }

    // Attribute require-instructions-spec/integrity to the REAL file when this path is a
    // symlink, so a symlinked AGENTS.md resolves to CLAUDE.md's spec rather than
    // a nonexistent AGENTS.md.spec.ts. Non-symlinks keep the original path
    // verbatim (behaviour-preserving).
    const attributePath = real !== resolve(filePath) ? real : filePath;
    seenReal.set(real, filePath);
    const result = validate(content, {
      ruleMarkers,
      rules: rulesConfig,
      filePath: attributePath,
    });
    fileResults.push({ path: filePath, skipped: false, reason: null, result });
    if (!result.valid) allValid = false;
  }

  return { fileResults, valid: allValid };
}
