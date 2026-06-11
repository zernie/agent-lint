/**
 * vigiles v2 — Compiler: spec → markdown.
 *
 * Reads .spec.ts files, validates references, and produces
 * markdown instruction files with integrity hashes.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

import { sha256short, assertNever } from "./hash.js";
import { fileDefinesSymbol, langForFile } from "./symbols.js";

import type {
  ClaudeSpec,
  SkillSpec,
  AgentSpec,
  SkillInput,
  SkillStep,
  Gate,
  Rule,
  InstructionFragment,
  OutputContract,
  OutputFieldType,
  Railway,
  RailwayStep,
} from "./spec.js";

import { checkLinterRule, extractLinterName, editDistance } from "./linters.js";
import type { LinterCheckResult } from "./linters.js";

// ---------------------------------------------------------------------------
// Hash utilities
// ---------------------------------------------------------------------------

const HASH_RE =
  /^<!-- vigiles:sha256:([a-f0-9]+) compiled from (.+) -->\r?\n\r?\n?/;

/** @internal Compute SHA-256 hash of content (excluding any existing hash line). */
export function computeHash(content: string): string {
  const body = content.replace(HASH_RE, "");
  return sha256short(body);
}

/** @internal Prepend a hash comment to compiled content. */
export function addHash(content: string, specFile: string): string {
  const hash = computeHash(content);
  return `<!-- vigiles:sha256:${hash} compiled from ${specFile} -->\n\n${content}`;
}

/** @internal Check if a file's hash matches its content. Returns null if no hash found. */
export function verifyHash(
  content: string,
): { valid: boolean; specFile: string } | null {
  const match = content.match(HASH_RE);
  if (!match) return null;
  const expectedHash = match[1];
  const specFile = match[2];
  const body = content.replace(HASH_RE, "");
  const actualHash = sha256short(body);
  return { valid: actualHash === expectedHash, specFile };
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count for a string.
 *
 * Uses the ~4 characters per token heuristic (accurate within ~10% for
 * English text and code). Swap in a real BPE tokenizer (tiktoken, gpt-tokenizer)
 * for exact counts if needed.
 */
/** @internal */ export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export interface CompileError {
  type:
    | "stale-file"
    | "stale-command"
    | "stale-ref"
    | "invalid-rule"
    | "budget-exceeded"
    | "section-too-long"
    | "section-has-header"
    | "reserved-section-key"
    | "spec-name-mismatch"
    | "unknown-tool"
    | "invalid-railway";
  message: string;
  path?: string;
}

// ---------------------------------------------------------------------------
// Reference validation
// ---------------------------------------------------------------------------

export function validateFileRef(
  filePath: string,
  basePath: string,
): CompileError | null {
  const resolved = resolve(basePath, filePath);
  if (!existsSync(resolved)) {
    return {
      type: "stale-file",
      message: `File not found: "${filePath}"`,
      path: filePath,
    };
  }
  return null;
}

export function readPackageScripts(
  basePath: string,
): Record<string, string> | null {
  const pkgPath = resolve(basePath, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? null;
  } catch {
    return null;
  }
}

export function validateCommandRef(
  command: string,
  basePath: string,
): CompileError | null {
  const npmRunMatch = command.match(/^npm\s+run\s+(\S+)/);
  const npmMatch = command.match(/^npm\s+(test|start|build|pretest)\b/);
  const scriptName = npmRunMatch?.[1] ?? npmMatch?.[1];
  if (scriptName) {
    const scripts = readPackageScripts(basePath);
    if (scripts && !scripts[scriptName]) {
      return {
        type: "stale-command",
        message: `Script "${scriptName}" not found in package.json`,
        path: command,
      };
    }
    return null;
  }

  // Script-runner commands (python/node/bash/ruby/…): verify the referenced
  // script file exists. Module forms (`python -m pkg`) are skipped — no path.
  const scriptFile = command.match(
    /^(?:python3?|node|bash|sh|ruby|deno run)\s+([^\s-]\S*\.[A-Za-z0-9]+)/,
  )?.[1];
  if (scriptFile && !existsSync(resolve(basePath, scriptFile))) {
    return {
      type: "stale-command",
      message: `Script "${scriptFile}" not found`,
      path: command,
    };
  }
  return null;
}

export function validateSymbolRef(
  file: string,
  name: string,
  basePath: string,
): CompileError | null {
  const full = resolve(basePath, file);
  if (!existsSync(full)) {
    return {
      type: "stale-file",
      message: `File not found: "${file}"`,
      path: file,
    };
  }
  if (langForFile(file) === null) {
    return {
      type: "stale-ref",
      message: `Unsupported language for symbol check: "${file}"`,
      path: file,
    };
  }
  if (!fileDefinesSymbol(full, name)) {
    return {
      type: "stale-ref",
      message: `"${name}" is not defined in ${file}`,
      path: `${file}#${name}`,
    };
  }
  return null;
}

function validateRefs(
  fragments: InstructionFragment[],
  basePath: string,
): CompileError[] {
  const errors: CompileError[] = [];
  for (const fragment of fragments) {
    if (typeof fragment === "string") continue;
    const r = fragment;
    switch (r._ref) {
      case "file": {
        const err = validateFileRef(r.path, basePath);
        if (err) errors.push(err);
        break;
      }
      case "cmd": {
        const err = validateCommandRef(r.command, basePath);
        if (err) errors.push(err);
        break;
      }
      case "skill": {
        const err = validateFileRef(r.path, basePath);
        if (err) {
          errors.push({
            type: "stale-ref",
            message: `Skill not found: "${r.path}"`,
            path: r.path,
          });
        }
        break;
      }
      case "symbol": {
        const err = validateSymbolRef(r.file, r.symbol, basePath);
        if (err) errors.push(err);
        break;
      }
    }
  }
  return errors;
}

function renderFragment(fragment: InstructionFragment): string {
  if (typeof fragment === "string") return fragment;
  switch (fragment._ref) {
    case "file":
      return `\`${fragment.path}\``;
    case "cmd":
      return `\`${fragment.command}\``;
    case "skill":
      return `[${basename(dirname(fragment.path))}](${fragment.path})`;
    case "symbol":
      return `\`vigiles:symbol ${fragment.file}#${fragment.symbol}\``;
    default:
      return assertNever(fragment);
  }
}

// ---------------------------------------------------------------------------
// Compile CLAUDE.md spec → markdown
// ---------------------------------------------------------------------------

function compileRule(id: string, rule: Rule): string {
  const title = id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  switch (rule._kind) {
    case "enforce":
      return [
        `### ${title}`,
        "",
        `**Enforced by:** \`${rule.linterRule}\``,
        `**Why:** ${rule.why}`,
      ].join("\n");

    case "guidance":
      return [`### ${title}`, "", `**Guidance only** — ${rule.text}`].join(
        "\n",
      );

    case "guard": {
      const patterns = Array.isArray(rule.watch)
        ? rule.watch.join("`, `")
        : rule.watch;
      return [
        `### ${title}`,
        "",
        `**Guard:** \`${patterns}\` → \`${rule.run}\``,
        `**Why:** ${rule.description}`,
      ].join("\n");
    }

    default:
      return assertNever(rule);
  }
}

export interface CompileClaudeResult {
  markdown: string;
  errors: CompileError[];
  linterResults: LinterCheckResult[];
  /** Estimated token count of compiled output (~4 chars/token). */
  tokens: number;
  /** All targets from the spec (for multi-target compilation). */
  targets: string[];
}

export interface CompileClaudeOptions {
  basePath?: string;
  specFile?: string;
  /** Maximum number of rules allowed. Compilation fails if exceeded. */
  maxRules?: number;
  /** Maximum estimated tokens for compiled output. */
  maxTokens?: number;
  /** Maximum lines per prose section. Forces splitting into named sections. */
  maxSectionLines?: number;
  /** Skip config-enabled checks, only verify rule exists in catalog. */
  catalogOnly?: boolean;
  /** Custom linter configs (rulesDir). */
  linters?: Record<string, { rulesDir?: string | string[] }>;
  /** Global kill switch: skip ALL linter verification. */
  verifyLinters?: boolean;
  /** Per-linter verification mode: true (full), "catalog-only", or false (skip). */
  linterModes?: Record<string, boolean | "catalog-only">;
}

// ---------------------------------------------------------------------------
// compileClaude section helpers
// ---------------------------------------------------------------------------

interface SectionResult {
  lines: string[];
  errors: CompileError[];
}

function validateSectionContent(
  name: string,
  text: string,
  maxSectionLines?: number,
): CompileError[] {
  const errors: CompileError[] = [];
  const contentLines = text.split("\n");

  // Reject markdown headers inside sections — sections compile to ## headings,
  // so raw # headers break document structure and signal pasted-in content.
  // Skip lines inside fenced code blocks (``` or ~~~).
  let inFence = false;
  for (const line of contentLines) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^ {0,3}#{1,2}\s/.test(line)) {
      errors.push({
        type: "section-has-header",
        message: `Section "${name}" contains a markdown header ("${line.trim().slice(0, 60)}"). Break into separate named sections instead.`,
      });
      break;
    }
  }

  if (maxSectionLines && contentLines.length > maxSectionLines) {
    errors.push({
      type: "section-too-long",
      message: `Section "${name}" is ${String(contentLines.length)} lines (max ${String(maxSectionLines)}). Split into smaller named sections.`,
    });
  }

  return errors;
}

const RESERVED_SECTION_KEYS = new Set([
  "commands",
  "keyFiles",
  "key-files",
  "key_files",
  "rules",
]);

function compileSectionsSection(
  spec: ClaudeSpec,
  basePath: string,
  maxSectionLines?: number,
): SectionResult {
  if (!spec.sections) return { lines: [], errors: [] };
  const lines: string[] = [];
  const errors: CompileError[] = [];
  for (const [name, content] of Object.entries(spec.sections)) {
    // #4: reject reserved section keys that clash with structured fields
    if (RESERVED_SECTION_KEYS.has(name)) {
      errors.push({
        type: "reserved-section-key",
        message: `Section key "${name}" is reserved — use the dedicated \`${name}\` field on the spec instead.`,
      });
    }
    const heading = name.charAt(0).toUpperCase() + name.slice(1);
    if (typeof content === "string") {
      errors.push(...validateSectionContent(name, content, maxSectionLines));
      lines.push(`## ${heading}\n\n${content.trim()}`);
    } else {
      errors.push(...validateRefs(content, basePath));
      const rendered = content.map(renderFragment).join("");
      errors.push(...validateSectionContent(name, rendered, maxSectionLines));
      lines.push(`## ${heading}\n\n${rendered.trim()}`);
    }
  }
  return { lines, errors };
}

function compileKeyFilesSection(
  spec: ClaudeSpec,
  basePath: string,
): SectionResult {
  if (!spec.keyFiles) return { lines: [], errors: [] };
  const lines = ["## Key Files", ""];
  const errors: CompileError[] = [];
  for (const [filePath, desc] of Object.entries(spec.keyFiles)) {
    lines.push(`- \`${filePath}\` — ${desc}`);
    const err = validateFileRef(filePath, basePath);
    if (err) errors.push(err);
  }
  return { lines: [lines.join("\n")], errors };
}

function compileCommandsSection(
  spec: ClaudeSpec,
  basePath: string,
): SectionResult {
  if (!spec.commands) return { lines: [], errors: [] };
  const lines = ["## Commands", ""];
  const errors: CompileError[] = [];
  for (const [command, desc] of Object.entries(spec.commands)) {
    lines.push(`- \`${command}\` — ${desc}`);
    const err = validateCommandRef(command, basePath);
    if (err) errors.push(err);
  }
  return { lines: [lines.join("\n")], errors };
}

/**
 * Determine if a rule should be verified, checking three levels:
 * 1. Per-rule: enforce("...", "...", { verify: false })
 * 2. Global: options.verifyLinters === false
 * 3. Per-linter: options.linterModes[linterName] === false
 */
function shouldVerifyRule(
  rule: { linterRule: string; verify: boolean },
  options: CompileClaudeOptions,
): boolean {
  if (!rule.verify) return false;
  if (options.verifyLinters === false) return false;
  const linterName = extractLinterName(rule.linterRule);
  const linterMode = options.linterModes?.[linterName];
  if (linterMode === false) return false;
  return true;
}

interface RulesSectionResult extends SectionResult {
  linterResults: LinterCheckResult[];
}

function compileRulesSection(
  spec: ClaudeSpec,
  basePath: string,
  options: CompileClaudeOptions,
): RulesSectionResult {
  const ruleEntries = Object.entries(spec.rules);
  if (ruleEntries.length === 0) {
    return { lines: [], errors: [], linterResults: [] };
  }
  const ruleLines = ["## Rules"];
  const errors: CompileError[] = [];
  const linterResults: LinterCheckResult[] = [];

  for (const [id, rule] of ruleEntries) {
    ruleLines.push("");
    ruleLines.push(compileRule(id, rule));
    if (rule._kind === "enforce") {
      const shouldVerify = shouldVerifyRule(rule, options);
      if (!shouldVerify) continue;

      const linterName = extractLinterName(rule.linterRule);
      const linterMode = options.linterModes?.[linterName];
      const catalogOnly = options.catalogOnly || linterMode === "catalog-only";

      const result = checkLinterRule(rule.linterRule, basePath, {
        catalogOnly,
        linters: options.linters,
      });
      linterResults.push(result);
      if (!result.exists) {
        errors.push({
          type: "invalid-rule",
          message:
            result.error ??
            `Rule "${rule.linterRule}" not found in ${result.linter}`,
          path: rule.linterRule,
        });
      } else if (result.enabled === "disabled") {
        errors.push({
          type: "invalid-rule",
          message: `Rule "${result.rule}" exists but is disabled in ${result.linter} config`,
          path: rule.linterRule,
        });
      }
    }
  }
  return { lines: [ruleLines.join("\n")], errors, linterResults };
}

// ---------------------------------------------------------------------------
// compileClaude
// ---------------------------------------------------------------------------

/**
 * Compile a ClaudeSpec into markdown.
 *
 * Returns the compiled markdown, validation errors, and linter check results.
 * The markdown is generated even if there are errors (with warnings).
 */
export function compileClaude(
  spec: ClaudeSpec,
  options: CompileClaudeOptions = {},
): CompileClaudeResult {
  const targets = spec.target ?? "CLAUDE.md";
  const target = Array.isArray(targets) ? targets[0] : targets;
  const basePath = options.basePath ?? process.cwd();
  const specFile = options.specFile ?? `${target}.spec.ts`;
  const errors: CompileError[] = [];
  const sections: string[] = [`# ${target}`];

  // Verify spec file naming matches the primary target
  if (!specFile.endsWith(".spec.ts")) {
    errors.push({
      type: "spec-name-mismatch",
      message: `Spec file "${specFile}" must end with .spec.ts`,
    });
  } else {
    const baseName = basename(specFile, ".spec.ts");
    if (baseName !== target) {
      errors.push({
        type: "spec-name-mismatch",
        message: `Spec file "${specFile}" doesn't match target "${target}". Expected "${target}.spec.ts".`,
      });
    }
  }

  // maxRules check
  const ruleCount = Object.keys(spec.rules).length;
  if (options.maxRules && ruleCount > options.maxRules) {
    errors.push({
      type: "invalid-rule",
      message: `${String(ruleCount)} rules exceeds maxRules limit of ${String(options.maxRules)}. Split into subdirectory specs.`,
    });
  }

  // Per-spec maxSectionLines takes precedence, then compile options
  const maxSectionLines = spec.maxSectionLines ?? options.maxSectionLines;
  const prose = compileSectionsSection(spec, basePath, maxSectionLines);
  const keyFiles = compileKeyFilesSection(spec, basePath);
  const commands = compileCommandsSection(spec, basePath);
  const rules = compileRulesSection(spec, basePath, options);

  sections.push(
    ...prose.lines,
    ...keyFiles.lines,
    ...commands.lines,
    ...rules.lines,
  );
  errors.push(
    ...prose.errors,
    ...keyFiles.errors,
    ...commands.errors,
    ...rules.errors,
  );

  const body = sections.join("\n\n") + "\n";
  const tokens = estimateTokens(body);

  // Per-spec maxTokens takes precedence, then compile options
  const maxTokens = spec.maxTokens ?? options.maxTokens;
  if (maxTokens && tokens > maxTokens) {
    errors.push({
      type: "budget-exceeded",
      message: `Compiled output is ~${String(tokens)} tokens, exceeding maxTokens limit of ${String(maxTokens)}. Trim prose sections, split into multiple specs, or raise maxTokens.`,
    });
  }

  const markdown = addHash(body, specFile);
  const allTargets = Array.isArray(targets) ? targets : [targets];
  return {
    markdown,
    errors,
    linterResults: rules.linterResults,
    tokens,
    targets: allTargets,
  };
}

// ---------------------------------------------------------------------------
// Compile SKILL.md spec → markdown
// ---------------------------------------------------------------------------

function renderBody(body: string | InstructionFragment[]): string {
  if (typeof body === "string") return body;
  return body.map(renderFragment).join("");
}

/** Derive the `argument-hint` frontmatter value from typed inputs. */
function renderArgumentHint(inputs: readonly SkillInput[]): string {
  return inputs
    .map((i) => (i.required === false ? `[<${i.name}>]` : `<${i.name}>`))
    .join(" ");
}

/** Render the `## Arguments` section from typed inputs. */
function renderArguments(inputs: readonly SkillInput[]): string {
  const lines = ["## Arguments", ""];
  inputs.forEach((i, idx) => {
    const opt = i.required === false ? " _(optional)_" : "";
    lines.push(`- \`$${String(idx + 1)}\` **${i.name}**${opt} — ${i.hint}`);
  });
  return lines.join("\n");
}

/** The human prose + machine-readable marker for a gate. */
function renderGate(
  gate: Gate,
  retry?: number,
): { prose: string; marker: string } {
  if (gate._ref === "cmd") {
    const r = retry && retry > 1 ? ` retry:${String(retry)}` : "";
    const proseR = retry && retry > 1 ? ` (retry up to ${String(retry)}×)` : "";
    return {
      prose: `**Gate** — run \`${gate.command}\`${proseR}; do not proceed until it passes.`,
      marker: `<!-- vigiles:gate "${gate.command}"${r} -->`,
    };
  }
  if (gate._ref === "role") {
    const proseR = retry && retry > 1 ? ` (retry up to ${String(retry)}×)` : "";
    const r = retry && retry > 1 ? ` retry:${String(retry)}` : "";
    return {
      prose: `**Gate** — run the project's ${gate.role} command${proseR}; do not proceed until it passes.`,
      marker: `<!-- vigiles:gate role:${gate.role}${r} -->`,
    };
  }
  return {
    prose: `**Gate** — \`${gate.path}\` must exist before proceeding.`,
    marker: `<!-- vigiles:gate file:${gate.path} -->`,
  };
}

/** Render the `## Steps` checklist with a gate per step. */
function renderSteps(steps: readonly SkillStep[]): string {
  const out = ["## Steps", ""];
  steps.forEach((s, idx) => {
    out.push(`### Step ${String(idx + 1)}`, "");
    out.push(renderBody(s.do).trim(), "");
    if (s.gate) {
      const g = renderGate(s.gate, s.retry);
      out.push(g.prose, "", g.marker, "");
    }
  });
  return out.join("\n").trimEnd();
}

/** Render the `## Result` postcondition gate. */
function renderResult(result: Gate): string {
  let target: string;
  let marker: string;
  if (result._ref === "cmd") {
    target = `\`${result.command}\` passes`;
    marker = `<!-- vigiles:result "${result.command}" -->`;
  } else if (result._ref === "role") {
    target = `the project's ${result.role} command passes`;
    marker = `<!-- vigiles:result role:${result.role} -->`;
  } else {
    target = `\`${result.path}\` exists`;
    marker = `<!-- vigiles:result file:${result.path} -->`;
  }
  return [
    "## Result",
    "",
    `This skill is complete when ${target}.`,
    "",
    marker,
  ].join("\n");
}

/** Gather every reference a skill carries that needs author-time verification. */
function collectSkillRefs(spec: SkillSpec): InstructionFragment[] {
  const refs: InstructionFragment[] = [];
  if (Array.isArray(spec.body)) refs.push(...spec.body);
  for (const s of spec.steps ?? []) {
    if (Array.isArray(s.do)) refs.push(...s.do);
    // Role gates resolve per host project at run time — nothing to verify here.
    if (s.gate && s.gate._ref !== "role") refs.push(s.gate);
  }
  if (spec.result && spec.result._ref !== "role") refs.push(spec.result);
  return refs;
}

/** Build the SKILL.md YAML frontmatter block. */
function renderSkillFrontmatter(spec: SkillSpec): string {
  const fm = [
    "---",
    "",
    `name: ${spec.name}`,
    `description: ${spec.description}`,
  ];
  if (spec.disableModelInvocation !== undefined) {
    fm.push(`disable-model-invocation: ${String(spec.disableModelInvocation)}`);
  }
  const argHint =
    spec.inputs && spec.inputs.length > 0
      ? renderArgumentHint(spec.inputs)
      : spec.argumentHint;
  if (argHint) fm.push(`argument-hint: ${argHint}`);
  fm.push("", "---");
  return fm.join("\n");
}

/**
 * Compose the body: Arguments, then the knowledge body (reference prose), then
 * the gated Steps, then the Result. body + steps compose — a skill can carry
 * both a rich reference body and a verified procedure.
 */
function renderSkillSections(spec: SkillSpec): string {
  const sections: string[] = [];
  if (spec.inputs && spec.inputs.length > 0) {
    sections.push(renderArguments(spec.inputs));
  }
  if (spec.body !== undefined) sections.push(renderBody(spec.body).trim());
  if (spec.steps && spec.steps.length > 0) {
    sections.push(renderSteps(spec.steps));
  }
  if (spec.result) sections.push(renderResult(spec.result));
  return sections.join("\n\n");
}

const DEFAULT_MAX_INLINE_CODE_LINES = 20;

/** Flag inline fenced code blocks longer than `max` lines (0 = disabled). */
function checkInlineCode(markdown: string, max: number): CompileError[] {
  if (max <= 0) return [];
  const errs: CompileError[] = [];
  const lines = markdown.split("\n");
  let start = -1;
  let lang = "";
  for (let i = 0; i < lines.length; i++) {
    const m = /^```(\w*)/.exec(lines[i].trim());
    if (!m) continue;
    if (start === -1) {
      start = i;
      lang = m[1];
    } else {
      const len = i - start - 1;
      if (len > max) {
        errs.push({
          type: "section-too-long",
          message: `Inline ${lang || "code"} block is ${String(len)} lines (max ${String(max)}); extract it to a file and reference it with file().`,
        });
      }
      start = -1;
      lang = "";
    }
  }
  return errs;
}

export interface CompileSkillResult {
  markdown: string;
  errors: CompileError[];
}

/**
 * Compile a SkillSpec into SKILL.md markdown with YAML frontmatter.
 */
export function compileSkill(
  spec: SkillSpec,
  options: { basePath?: string; specFile?: string } = {},
): CompileSkillResult {
  const basePath = options.basePath ?? process.cwd();
  const specFile = options.specFile ?? "SKILL.md.spec.ts";
  const errors: CompileError[] = [];

  // Verify spec file naming
  if (!specFile.endsWith(".spec.ts")) {
    errors.push({
      type: "spec-name-mismatch",
      message: `Spec file "${specFile}" must end with .spec.ts`,
    });
  } else {
    const baseName = basename(specFile, ".spec.ts");
    if (!/\.md$/i.test(baseName)) {
      errors.push({
        type: "spec-name-mismatch",
        message: `Spec file "${specFile}" should be named <output>.spec.ts (e.g., SKILL.md.spec.ts)`,
      });
    }
  }

  errors.push(...validateRefs(collectSkillRefs(spec), basePath));

  const sections = renderSkillSections(spec);
  errors.push(
    ...checkInlineCode(
      sections,
      spec.maxInlineCodeLines ?? DEFAULT_MAX_INLINE_CODE_LINES,
    ),
  );

  const content =
    renderSkillFrontmatter(spec) + "\n\n" + sections.trim() + "\n";
  return { markdown: addHash(content, specFile), errors };
}

// ---------------------------------------------------------------------------
// Compile a subagent spec → agents/<name>.md
// ---------------------------------------------------------------------------

// The tool contract a subagent may declare — the rails it runs on. Anything
// else must be an MCP tool (mcp__server__tool), else it's a typo / nonexistent
// tool the dispatched worker could never call.
const KNOWN_AGENT_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Grep",
  "Glob",
  "WebSearch",
  "WebFetch",
  "NotebookEdit",
  "TodoWrite",
  "Task",
  "Skill",
] as const;

const MCP_TOOL_RE = /^mcp__[a-z0-9_-]+__[a-z0-9_-]+$/i;

// Tools the platform never exposes to a subagent, whatever the list says — so a
// subagent listing one is a guaranteed-dead reference only a compiler catches.
const NEVER_AVAILABLE_TOOLS = new Set([
  "Agent",
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
  "ScheduleWakeup",
  "WaitForMcpServers",
]);

/** Closest known tool by edit distance (≤ 3), for a "did you mean" hint. */
function closestTool(tool: string): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of KNOWN_AGENT_TOOLS) {
    const d = editDistance(tool.toLowerCase(), known.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  return bestDistance <= 3 ? best : null;
}

/** Verify a subagent's allowed-tools contract — the rails are real tools. */
function validateAgentTools(tools: readonly string[]): CompileError[] {
  const errors: CompileError[] = [];
  for (const tool of tools) {
    if (NEVER_AVAILABLE_TOOLS.has(tool)) {
      errors.push({
        type: "unknown-tool",
        message: `Tool "${tool}" is never available to a subagent — remove it from the tools list.`,
      });
      continue;
    }
    if ((KNOWN_AGENT_TOOLS as readonly string[]).includes(tool)) continue;
    if (MCP_TOOL_RE.test(tool)) continue;
    const near = closestTool(tool);
    const hint = near ? ` Did you mean "${near}"?` : "";
    errors.push({
      type: "unknown-tool",
      message: `Unknown tool "${tool}" in agent tools — use a built-in tool (${KNOWN_AGENT_TOOLS.join(", ")}) or an MCP tool (mcp__server__tool).${hint}`,
    });
  }
  return errors;
}

/** Build the subagent YAML frontmatter (name / description / model / tools). */
function renderAgentFrontmatter(spec: AgentSpec): string {
  const fm = [
    "---",
    "",
    `name: ${spec.name}`,
    `description: ${spec.description}`,
  ];
  if (spec.model !== undefined) fm.push(`model: ${spec.model}`);
  if (spec.tools && spec.tools.length > 0) {
    fm.push(`tools: ${spec.tools.join(", ")}`);
  }
  fm.push("", "---");
  return fm.join("\n");
}

/** Render the subagent's named `##` system-prompt sections (verified like CLAUDE.md). */
function renderAgentSections(
  sections: Record<string, string | InstructionFragment[]>,
  basePath: string,
): SectionResult {
  const lines: string[] = [];
  const errors: CompileError[] = [];
  for (const [name, content] of Object.entries(sections)) {
    if (name.toLowerCase() === "rules") {
      errors.push({
        type: "reserved-section-key",
        message: `Section key "${name}" is reserved — use the \`rules\` field instead.`,
      });
    }
    const heading = name.charAt(0).toUpperCase() + name.slice(1);
    if (typeof content === "string") {
      errors.push(...validateSectionContent(name, content));
      lines.push(`## ${heading}\n\n${content.trim()}`);
    } else {
      errors.push(...validateRefs(content, basePath));
      const rendered = content.map(renderFragment).join("");
      errors.push(...validateSectionContent(name, rendered));
      lines.push(`## ${heading}\n\n${rendered.trim()}`);
    }
  }
  return { lines, errors };
}

/** Render a result-contract track shape as a compact `{ "f": type, … }` line. */
function renderShape(shape: Readonly<Record<string, OutputFieldType>>): string {
  const fields = Object.entries(shape)
    .map(([k, t]) => `"${k}": ${t}`)
    .join(", ");
  return fields ? `{ ${fields} }` : "{}";
}

/**
 * Render the subagent's typed result contract — the `## Output contract` section
 * that turns a flat worker into a railway step: it must end its turn with a
 * `vigiles:ok` / `vigiles:err` block matching one of these shapes, so its
 * outcome is parseable (`parseAgentResult`) and testable (`assertAgentOk`).
 */
function renderOutputContract(contract: OutputContract): string {
  return [
    "## Output contract",
    "",
    "Finish your turn with exactly one fenced block — success or error — matching one of these shapes.",
    "",
    "On success:",
    "",
    "```vigiles:ok",
    renderShape(contract.ok),
    "```",
    "",
    "On error:",
    "",
    "```vigiles:err",
    renderShape(contract.err),
    "```",
  ].join("\n");
}

/** Render the rules a subagent must follow as a `## Rules` section. */
function renderAgentRules(rules: Record<string, Rule>): string {
  const parts = ["## Rules", ""];
  for (const [id, rule] of Object.entries(rules)) {
    parts.push(compileRule(id, rule), "");
  }
  return parts.join("\n").trim();
}

export interface CompileAgentResult {
  markdown: string;
  errors: CompileError[];
}

/**
 * Compile an AgentSpec into a subagent markdown file with YAML frontmatter.
 * Verifies the tool contract and the body's references; the marks the body
 * carries (`vigiles:symbol`, file/cmd refs) are the same ones `audit` re-checks.
 */
export function compileAgent(
  spec: AgentSpec,
  options: { basePath?: string; specFile?: string } = {},
): CompileAgentResult {
  const basePath = options.basePath ?? process.cwd();
  const specFile = options.specFile ?? "agent.md.spec.ts";
  const errors: CompileError[] = [];

  if (!specFile.endsWith(".spec.ts")) {
    errors.push({
      type: "spec-name-mismatch",
      message: `Spec file "${specFile}" must end with .spec.ts`,
    });
  } else if (!/\.md$/i.test(basename(specFile, ".spec.ts"))) {
    errors.push({
      type: "spec-name-mismatch",
      message: `Spec file "${specFile}" should be named <output>.spec.ts (e.g., agents/reviewer.md.spec.ts)`,
    });
  }

  if (spec.tools) errors.push(...validateAgentTools(spec.tools));
  if (Array.isArray(spec.body)) {
    errors.push(...validateRefs(spec.body, basePath));
  }

  const sections: string[] = [];
  if (spec.body !== undefined) sections.push(renderBody(spec.body).trim());
  if (spec.sections) {
    const result = renderAgentSections(spec.sections, basePath);
    sections.push(...result.lines);
    errors.push(...result.errors);
  }
  if (spec.rules && Object.keys(spec.rules).length > 0) {
    sections.push(renderAgentRules(spec.rules));
  }
  if (spec.output) sections.push(renderOutputContract(spec.output));
  const body = sections.join("\n\n");
  errors.push(...checkInlineCode(body, DEFAULT_MAX_INLINE_CODE_LINES));

  const content = renderAgentFrontmatter(spec) + "\n\n" + body.trim() + "\n";
  return { markdown: addHash(content, specFile), errors };
}

// ---------------------------------------------------------------------------
// Compile a railway → an orchestrator command
//
// A railway composes flat subagents on a success/error track. It compiles to an
// orchestrator command the lead agent reads — NOT a runtime engine (vigiles
// verifies + emits; the agent executes; the per-step rails enforce). Every
// delegate target is resolved against the known agent set (stale-ref), the
// step list must be non-empty, and recovery must be bounded — the finite,
// sub-Turing guarantees that make the whole flow checkable.
// ---------------------------------------------------------------------------

export interface CompileRailwayOptions {
  /** Names of compiled agents, to resolve `delegate` targets. Skipped if omitted. */
  knownAgents?: readonly string[];
  specFile?: string;
}

export interface CompileRailwayResult {
  markdown: string;
  errors: CompileError[];
}

/** Verify a railway: non-empty, bounded recovery, every delegate target real. */
export function validateRailway(
  rw: Railway,
  knownAgents?: readonly string[],
): CompileError[] {
  const errors: CompileError[] = [];
  if (rw.steps.length === 0) {
    errors.push({
      type: "invalid-railway",
      message: `Railway "${rw.name}" has no steps.`,
    });
  }
  if (rw.recover && rw.recover.max < 1) {
    errors.push({
      type: "invalid-railway",
      message: `Railway "${rw.name}" recover.max must be ≥ 1 (got ${String(rw.recover.max)}).`,
    });
  }
  if (knownAgents) {
    const known = new Set(knownAgents);
    const refs: RailwayStep[] = [...rw.steps];
    if (rw.onError) refs.push(rw.onError);
    if (rw.recover) refs.push(rw.recover.step);
    for (const s of refs) {
      if (!known.has(s.agent)) {
        errors.push({
          type: "stale-ref",
          message: `Railway "${rw.name}" delegates to unknown agent "${s.agent}".`,
          path: s.agent,
        });
      }
    }
  }
  return errors;
}

/** Render the orchestrator command markdown for a railway. */
function renderRailwayMarkdown(rw: Railway): string {
  const lines = [
    `# Railway: ${rw.name}`,
    "",
    "Dispatch these subagents on the **success track**, in order. Each returns a " +
      "result block (`vigiles:ok` / `vigiles:err`). If a step returns an error, " +
      "stop the success track and run the error handler with that error payload.",
    "",
    "## Success track",
    "",
  ];
  rw.steps.forEach((s, i) => {
    const task = s.task ? ` — ${s.task}` : "";
    lines.push(`${String(i + 1)}. **${s.agent}**${task}`);
  });
  if (rw.recover) {
    lines.push(
      "",
      "## Recovery",
      "",
      `If a step errors, retry it via **${rw.recover.step.agent}** up to ${String(rw.recover.max)}× before falling to the error track.`,
    );
  }
  if (rw.onError) {
    lines.push(
      "",
      "## On error",
      "",
      `Run **${rw.onError.agent}** with the failing step's error payload.`,
    );
  }
  return lines.join("\n");
}

/**
 * Compile a railway into an orchestrator command markdown (with integrity hash),
 * resolving every delegate target against `knownAgents` when provided.
 */
export function compileRailway(
  rw: Railway,
  options: CompileRailwayOptions = {},
): CompileRailwayResult {
  const errors = validateRailway(rw, options.knownAgents);
  const specFile = options.specFile ?? `${rw.name}.railway.spec.ts`;
  const content = renderRailwayMarkdown(rw) + "\n";
  return { markdown: addHash(content, specFile), errors };
}

// ---------------------------------------------------------------------------
// Hash check for existing files
// ---------------------------------------------------------------------------

export interface HashCheckResult {
  hasHash: boolean;
  valid: boolean;
  specFile: string | null;
}

/** Check if a generated file's hash is intact. */
export function checkFileHash(filePath: string): HashCheckResult {
  if (!existsSync(filePath)) {
    return { hasHash: false, valid: false, specFile: null };
  }
  const content = readFileSync(filePath, "utf-8");
  const result = verifyHash(content);
  if (!result) {
    return { hasHash: false, valid: false, specFile: null };
  }
  return { hasHash: true, valid: result.valid, specFile: result.specFile };
}

// ---------------------------------------------------------------------------
// Adopt: detect manual edits and show diff
// ---------------------------------------------------------------------------

export interface AdoptResult {
  filePath: string;
  hasHash: boolean;
  valid: boolean;
  specFile: string | null;
  currentContent: string;
  compiledContent: string | null;
  addedLines: string[];
  removedLines: string[];
  changed: boolean;
}

/**
 * Compare a generated file against what the spec would produce.
 * Returns the diff so users can see what was manually changed.
 */
export function adoptDiff(
  filePath: string,
  spec: ClaudeSpec | SkillSpec | AgentSpec,
  basePath: string,
): AdoptResult {
  const fullPath = resolve(basePath, filePath);
  const currentContent = existsSync(fullPath)
    ? readFileSync(fullPath, "utf-8")
    : "";

  const hashResult = verifyHash(currentContent);

  // Compile the spec to get what it WOULD produce
  let compiledContent: string | null = null;
  if (spec._specType === "claude") {
    const { markdown } = compileClaude(spec, { basePath, specFile: filePath });
    compiledContent = markdown;
  } else if (spec._specType === "skill") {
    const { markdown } = compileSkill(spec, { basePath, specFile: filePath });
    compiledContent = markdown;
  } else if (spec._specType === "agent") {
    const { markdown } = compileAgent(spec, { basePath, specFile: filePath });
    compiledContent = markdown;
  }

  // Simple line-based diff
  const currentLines = currentContent.replace(HASH_RE, "").split("\n");
  const compiledLines = (compiledContent ?? "")
    .replace(HASH_RE, "")
    .split("\n");

  const currentSet = new Set(currentLines);
  const compiledSet = new Set(compiledLines);

  const addedLines = currentLines.filter(
    (l) => l.trim() && !compiledSet.has(l),
  );
  const removedLines = compiledLines.filter(
    (l) => l.trim() && !currentSet.has(l),
  );

  return {
    filePath,
    hasHash: hashResult !== null,
    valid: hashResult?.valid ?? false,
    specFile: hashResult?.specFile ?? null,
    currentContent,
    compiledContent,
    addedLines,
    removedLines,
    changed: addedLines.length > 0 || removedLines.length > 0,
  };
}
