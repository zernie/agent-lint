#!/usr/bin/env node

/**
 * vigiles CLI — compile typed specs to instruction files.
 *
 * Commands:
 *   vigiles init            — scaffold a spec from scratch
 *   vigiles compile         — compile .spec.ts → .md with linter verification
 *   vigiles lint            — verify hashes, report coverage, detect duplicates
 *   vigiles generate types  — emit .d.ts with types from project state
 */

import {
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  lstatSync,
  type Dirent,
} from "node:fs";
import { resolve, dirname, basename, relative } from "node:path";
import { globSync } from "glob";
import { generateTypes } from "./core/generate-types.js";
import {
  loadHarnessModel,
  generateHarness,
  computeHarnessCapabilities,
  labelFor,
  HARNESS_GEN_FILENAME,
} from "./core/generate-harness.js";
import {
  diffCapabilities,
  formatCapabilityDiff,
} from "./core/capability-diff.js";
import { validate, loadConfig } from "./core/validate.js";
import { applyConfigFlags } from "./cli-flags.js";
import {
  parseSetupArgs,
  shouldPrompt,
  resolvePlan,
  planPluginInstall,
  mergeProjectConfig,
  collectSetupAnswers,
  type SetupPlan,
  type SetupAnswers,
  type AskFn,
  type ParsedSetupArgs,
} from "./setup-plan.js";
import type {
  VigilesConfig,
  CoverageThresholds,
  TestCoverageConfig,
  RuleSeverity,
} from "./core/types.js";
import { ruleSeverity, ruleOptions } from "./core/types.js";
import type { SurfaceKind, Surface } from "./test-coverage.js";
import { findUntestedSurfaces, formatUntestedReport } from "./test-coverage.js";
import {
  scaffoldTest,
  formatScaffolds,
  type ScaffoldInput,
  type ResultContract,
  type ContractField,
} from "./scaffold-test.js";
import { effectSurface } from "./core/effects.js";
import {
  scanPlugin,
  formatScanReport,
  inspectMarketplace,
  verifyLiveMcpTools,
  formatMcpContractReport,
  preferCompiledHooksMessage,
} from "./scan.js";
import type { ScanReport } from "./scan.js";
import {
  hasModelAccess,
  isMeteredAccess,
  decideExecute,
  formatExecuteSkip,
} from "./scan-trigger-suggest.js";
import { checkDialectDrift, formatDialectDrift } from "./dialect-drift.js";
import {
  probePluginTriggers,
  formatBehavioralReport,
  measurePluginSelection,
  formatSelectionReport,
  type TriggerPromptSet,
  type ProbeHarness,
} from "./scan-behavioral.js";
import {
  detectAdapterResult,
  resolveAdapter,
  resolveHarnessSelection,
  normalizeHarnessName,
  normalizeHarnessList,
  getAdapter,
  adapterForInstructionFile,
} from "./adapter-registry.js";
import type { HarnessDialect } from "./core/dialect.js";
import type { HarnessAdapter } from "./core/adapter.js";
import { skillFrontmatterDropWarnings } from "./skill-harness.js";
import {
  rankPlugins,
  formatLeaderboard,
  formatLeaderboardMarkdown,
} from "./leaderboard.js";
import { optimize, formatRecommendations } from "./optimize.js";
import { formatAuditScore } from "./audit-score.js";
import {
  autoTriggerPrompts,
  AUTO_RECALL_COUNT,
  AUTO_MIN_DISTANCE,
  type PromptSkill,
} from "./audit-prompts.js";
import { renderAuditHtml } from "./audit-html.js";
import {
  buildAuditReport,
  buildLeaderboardReport,
  buildMarketplaceReport,
  type AuditReport,
} from "./audit-report.js";
import {
  runAdoptabilityTier,
  formatAdoptability,
  type AdoptabilityResult,
} from "./adoptability.js";

import {
  compileClaude,
  compileSkill,
  compileAgent,
  compileRailway,
  checkFileHash,
  addHash,
  validateFileRef,
  validateCommandRef,
} from "./core/compile.js";
import type { CompileError } from "./core/compile.js";
import type { ClaudeSpec, SkillSpec, AgentSpec, Railway } from "./core/spec.js";
import { findSimilarRules } from "./core/proofs.js";
import { parseInlineRules } from "./core/inline.js";
import { parseFrontmatterRules } from "./core/frontmatter.js";
import { generateSchema } from "./core/generate-schema.js";
import {
  detectInstructionMirror,
  composeCollisions,
  detectSyncTools,
} from "./core/compose.js";
import type { InstructionMirror } from "./core/compose.js";
import { compileGeneratorSkill } from "./core/compile-generator.js";
import { evaluateAction, loadActionGates } from "./action-gate.js";
import { runGuardHook } from "./core/guards.js";
import {
  compileHookProgram,
  checkHookImports,
  verifyHookStamp,
  HookCompileError,
  decideProgram,
  decideFileGate,
  decidePromptGate,
  decideStopGate,
  runInject,
  runReact,
  dispatchKind,
  hookMode,
  hookNeeds,
  gateAction,
  type DispatchKind,
  type HookMode,
  type AnyHook,
  type FileGateHook,
  type PromptGateHook,
  type StopGateHook,
  type InjectHook,
  type ReactHook,
  type HookProgram,
  type Decision,
} from "./core/hook-program.js";
import {
  discoverHookFiles,
  discoverProviderFiles,
  mergeHooksJson,
  mergeHooksToml,
  serializeConfig,
} from "./hook-install.js";
import {
  gatherContext,
  unsafeProvider,
  type ProviderRegistry,
  type RegisteredProvider,
} from "./core/hook-providers.js";
import { parse as parseToml } from "@iarna/toml";
import type { SHA256Hash } from "./core/hash.js";
import {
  evaluatePreToolUse,
  pushActiveAgent,
  popActiveAgent,
  decideTaskDispatch,
} from "./adapters/claude-code/agent-runtime.js";
import {
  setEffectActive,
  clearEffectActive,
} from "./adapters/claude-code/effect-region.js";
import {
  interceptHookDecision,
  parseIntercepts,
  INTERCEPT_TOOLS_ENV,
} from "./tool-intercept.js";
import {
  verifySymbolRefs,
  collectRefIssues,
  refsHookAction,
} from "./core/refs.js";
import { verifyMcpRefs, loadMcpServers, mcpRefMessage } from "./core/mcp.js";
import {
  parseSkillGates,
  runSkillGates,
  setActiveSkill,
  clearActiveSkill,
  evaluateStopHook,
  evaluateSkillPreToolUse,
  gateLabel,
} from "./adapters/claude-code/skill-runtime.js";
import { checkLinterRule } from "./core/linters.js";
import { claudeAvailable } from "./harness-test.js";
import {
  discoverScripts,
  runScripts,
  formatScriptSummary,
  anyFailed,
  scriptGlob,
} from "./adapters/claude-code/run-scripts.js";
import {
  checkIntegrity,
  ejectMarkdown,
  parseIntegrityHeader,
  REQUIRE_INSTRUCTIONS_SPEC_DISABLE,
} from "./core/integrity.js";
import { adoptMarkdown, adoptSkill, adoptAgent } from "./core/adopt.js";
import { computeScriptCoverage } from "./core/coverage.js";
import { findOrphanDocs, formatOrphanReport } from "./core/orphans.js";
import { findDocRefs, formatDocRefReport } from "./core/doc-refs.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IGNORE_NODE_MODULES = ["node_modules/**"];

// ---------------------------------------------------------------------------
// Spec loading
// ---------------------------------------------------------------------------

function findSpecs(pattern?: string): string[] {
  const glob = pattern ?? "**/*.md.spec.ts";
  return globSync(glob, {
    // `dot: true` so specs that live in a sync tool's source slot (e.g.
    // `.ruler/AGENTS.md.spec.ts`, the redirect target) are discovered by
    // compile/lint/the recompile hook — not just root-level specs.
    dot: true,
    ignore: [...IGNORE_NODE_MODULES, "dist/**", ".git/**"],
    cwd: process.cwd(),
  });
}

type AnySpec = ClaudeSpec | SkillSpec | AgentSpec | Railway;

async function loadSpec(specPath: string): Promise<AnySpec | null> {
  const fullPath = resolve(process.cwd(), specPath);

  // Try multiple dist/ path strategies
  const candidates: string[] = [];

  // src/ → dist/ mapping (e.g., src/CLAUDE.md.spec.ts → dist/CLAUDE.md.spec.js)
  if (fullPath.includes("/src/")) {
    candidates.push(
      fullPath.replace(/\/src\//, "/dist/").replace(/\.ts$/, ".js"),
    );
  }

  // Root-level spec → dist/ (e.g., CLAUDE.md.spec.ts → dist/CLAUDE.md.spec.js)
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  const base = fullPath.substring(fullPath.lastIndexOf("/") + 1);
  candidates.push(resolve(dir, "dist", base.replace(/\.ts$/, ".js")));

  // examples/ → dist/examples/ mapping
  candidates.push(
    fullPath
      .replace(/\.ts$/, ".js")
      .replace(process.cwd(), resolve(process.cwd(), "dist")),
  );

  for (const distPath of candidates) {
    if (existsSync(distPath)) {
      try {
        const mod = (await import(distPath)) as {
          default: AnySpec | { default: AnySpec };
        };
        // CJS double-default: `{ default: { default: spec } }`.
        const raw = mod.default;
        if (raw && typeof raw === "object" && "default" in raw) {
          return (raw as { default: AnySpec }).default;
        }
        return raw;
      } catch {
        // Try next candidate
      }
    }
  }

  // Try loading .ts directly via tsx
  try {
    const { execSync } =
      require("node:child_process") as typeof import("node:child_process");
    // Handle ESM/CJS double-default: m.default may itself have a .default
    const script = `import(${JSON.stringify(fullPath)}).then(m => { const d = m.default?.default ?? m.default; console.log(JSON.stringify(d)); })`;
    const output = execSync(`npx tsx -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    return JSON.parse(output.trim()) as AnySpec;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printErrors(specFile: string, errors: CompileError[]): void {
  for (const err of errors) {
    const pathInfo = err.path ? ` (${err.path})` : "";
    console.log(`  [${err.type}] ${err.message}${pathInfo}`);
    console.log(`::error file=${specFile}::${err.message}`);
  }
}

/** Non-blocking advisories — printed, but never fail the compile. */
function printWarnings(specFile: string, warnings: CompileError[]): void {
  for (const w of warnings) {
    const pathInfo = w.path ? ` (${w.path})` : "";
    console.log(`  ⚠ [${w.type}] ${w.message}${pathInfo}`);
    console.log(`::warning file=${specFile}::${w.message}`);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Compile a generator-skill spec from source → SKILL.md. Returns validity. */
function compileGeneratorSkillToFile(
  specPath: string,
  source: string,
): boolean {
  const outputPath = specPath.replace(/\.spec\.ts$/, "");
  const { markdown, errors } = compileGeneratorSkill(source, {
    basePath: process.cwd(),
    specFile: specPath,
  });
  writeFileSync(resolve(process.cwd(), outputPath), markdown);
  if (errors.length === 0) {
    console.log(`\n✓ ${specPath} → ${outputPath} (generator skill)`);
    return true;
  }
  console.log(`\n✗ ${specPath} — ${String(errors.length)} error(s)`);
  for (const e of errors) console.log(`  ${e.type}: ${e.message}`);
  return false;
}

/** Compile a ClaudeSpec → its primary + any additional targets. */
function compileClaudeToFile(
  spec: ClaudeSpec,
  specPath: string,
  config: VigilesConfig,
  dialect: HarnessDialect,
): boolean {
  const basePath = process.cwd();
  const { markdown, errors, linterResults, targets } = compileClaude(spec, {
    basePath,
    specFile: specPath,
    dialect,
    maxRules: config.maxRules,
    maxTokens: config.maxTokens,
    maxSectionLines: config.maxSectionLines,
    catalogOnly: config.catalogOnly,
    linters: config.linters,
  });
  const primaryOutput = specPath.replace(/\.spec\.ts$/, "");
  if (errors.length > 0) {
    console.log(`\n✗ ${specPath} — ${String(errors.length)} error(s)`);
    printErrors(specPath, errors);
    writeFileSync(resolve(basePath, primaryOutput), markdown);
    return false;
  }
  writeFileSync(resolve(basePath, primaryOutput), markdown);
  const outputNames = [primaryOutput];
  for (const t of targets.slice(1)) {
    const body = markdown
      .replace(/^<!-- vigiles:[^\n]+\n\n?/, "")
      .replace(/^# [^\n]+/, `# ${t}`);
    const dir = primaryOutput.substring(0, primaryOutput.lastIndexOf("/") + 1);
    const targetPath = dir + t;
    writeFileSync(resolve(basePath, targetPath), addHash(body, specPath));
    outputNames.push(targetPath);
  }
  const linterCount = linterResults.filter((r) => r.exists).length;
  console.log(`\n✓ ${specPath} → ${outputNames.join(", ")}`);
  console.log(
    `  ${String(Object.keys(spec.rules).length)} rules (${String(linterCount)} linter-verified)`,
  );
  return true;
}

/**
 * Branch 3 of the mirror story (research/multi-harness-compile.md): when a repo
 * declares ≥2 harnesses and nothing else fans out the instruction file, write a
 * byte-identical copy to each other harness's instruction file (e.g. CLAUDE.md →
 * AGENTS.md). A copy — not a symlink — because it works everywhere and carries
 * the source's embedded integrity hash by construction, so a hand-edit of the
 * mirror trips the existing `integrity` check. Never fights a sync tool or
 * clobbers a target that owns its own spec.
 */
function writeInstructionMirrors(
  primaryOutput: string,
  harnesses: string[],
): void {
  if (harnesses.length < 2) return;
  const cwd = process.cwd();
  // A sync tool (Ruler/rulesync) owns fan-out — don't fight it.
  if (detectSyncTools(cwd).length > 0) return;
  const primaryName = basename(primaryOutput);
  const primaryAbs = resolve(cwd, primaryOutput);
  if (!existsSync(primaryAbs)) return;
  const content = readFileSync(primaryAbs, "utf-8");
  for (const name of harnesses) {
    const adapter = getAdapter(name);
    if (!adapter) continue;
    const target = adapter.layout.instructionFile;
    if (target === primaryName) continue; // the file we just compiled
    // Never clobber a target that has its own spec (a genuinely separate file).
    if (existsSync(resolve(cwd, `${target}.spec.ts`))) continue;
    const targetAbs = resolve(cwd, target);
    if (existsSync(targetAbs) && readFileSync(targetAbs, "utf-8") === content) {
      continue; // already byte-identical
    }
    writeFileSync(targetAbs, content);
    console.log(`  ↳ mirrored ${primaryName} → ${target} (byte-identical)`);
  }
}

/** Compile a declarative SkillSpec → SKILL.md. */
function compileSkillToFile(
  spec: SkillSpec,
  specPath: string,
  dialect: HarnessDialect,
): boolean {
  const outputPath = specPath.replace(/\.spec\.ts$/, "");
  const { markdown, errors, warnings } = compileSkill(spec, {
    basePath: process.cwd(),
    specFile: specPath,
    // The SKILL.md frontmatter profile comes from the resolved harness — a Codex
    // repo gets a minimal (name + description) SKILL.md; CC gets the full set.
    dialect,
  });
  writeFileSync(resolve(process.cwd(), outputPath), markdown);
  if (errors.length === 0) {
    console.log(`\n✓ ${specPath} → ${outputPath}`);
    printWarnings(specPath, warnings);
    return true;
  }
  console.log(`\n✗ ${specPath} — ${String(errors.length)} error(s)`);
  printErrors(specPath, errors);
  printWarnings(specPath, warnings);
  return false;
}

/** Compile a subagent spec → agents/<name>.md (with its result-contract section). */
function compileAgentToFile(
  spec: AgentSpec,
  specPath: string,
  dialect: HarnessDialect,
): boolean {
  const outputPath = specPath.replace(/\.spec\.ts$/, "");
  const { markdown, errors, warnings } = compileAgent(spec, {
    basePath: process.cwd(),
    specFile: specPath,
    dialect,
  });
  writeFileSync(resolve(process.cwd(), outputPath), markdown);
  if (errors.length === 0) {
    console.log(`\n✓ ${specPath} → ${outputPath}`);
    printWarnings(specPath, warnings);
    return true;
  }
  console.log(`\n✗ ${specPath} — ${String(errors.length)} error(s)`);
  printErrors(specPath, errors);
  printWarnings(specPath, warnings);
  return false;
}

/**
 * Compile a railway spec → the orchestrator command markdown. `knownAgents` is
 * the set of compiled agent names in the project, so every `delegate()` target
 * is resolved at compile time (an unknown target is a stale-ref error).
 */
function compileRailwayToFile(
  spec: Railway,
  specPath: string,
  knownAgents: readonly string[],
): boolean {
  const outputPath = specPath.replace(/\.spec\.ts$/, "");
  const { markdown, errors } = compileRailway(spec, {
    specFile: specPath,
    knownAgents,
  });
  writeFileSync(resolve(process.cwd(), outputPath), markdown);
  if (errors.length === 0) {
    console.log(`\n✓ ${specPath} → ${outputPath}`);
    return true;
  }
  console.log(`\n✗ ${specPath} — ${String(errors.length)} error(s)`);
  printErrors(specPath, errors);
  return false;
}

/** Names of every compiled agent spec in the project — resolves delegate() targets. */
async function collectAgentNames(): Promise<string[]> {
  const names: string[] = [];
  for (const p of findSpecs()) {
    const s = await loadSpec(p);
    if (s && s._specType === "agent") names.push(s.name);
  }
  return names;
}

async function compile(
  specPaths: string[],
  config: VigilesConfig,
  opts: { harnessFlag?: string } = {},
): Promise<boolean> {
  let allValid = true;
  // Parse the declared harness set ONCE (alias-normalized) and feed both the
  // dialect pick and the mirror from it — no re-parsing, no cwd-sniffing in the
  // helpers. A loud notice (never a silent guess) on a multi-harness or
  // ambiguous-detection pick.
  const declaredHarnesses = normalizeHarnessList(config.harness);
  const selection = resolveHarnessSelection({
    root: process.cwd(),
    flag: opts.harnessFlag,
    configHarness: declaredHarnesses,
  });
  if (selection.kind === "notice") console.log(`⚠ ${selection.notice}`);
  const dialect = selection.adapter.dialect;
  // Resolved lazily on the first railway spec — every delegate() target is
  // checked against the agents defined anywhere in the project.
  let knownAgents: string[] | null = null;
  for (const specPath of specPaths) {
    // Generator skills can't be executed to markdown — compile from source.
    const source = readFileSync(resolve(process.cwd(), specPath), "utf-8");
    if (/\bgenSkill\s*\(/.test(source)) {
      if (!compileGeneratorSkillToFile(specPath, source)) allValid = false;
      continue;
    }
    const spec = await loadSpec(specPath);
    if (!spec) {
      console.log(`\n✗ ${specPath} — failed to load`);
      console.log(
        `  Ensure the spec is compiled: run \`npm run build\` first.`,
      );
      allValid = false;
      continue;
    }
    if (spec._specType === "claude") {
      // Spec-target disambiguation: a CLAUDE.md.spec.ts is a claude-code file, an
      // AGENTS.md.spec.ts a codex one — the strongest dialect signal for THIS
      // spec. The flag still overrides; absent one, the spec's own target wins
      // over config/detect. (Skill/agent targets don't name a harness, so they
      // keep the run-level dialect.)
      const targetFile = basename(specPath).replace(/\.spec\.ts$/, "");
      const specDialect =
        opts.harnessFlag === undefined
          ? (adapterForInstructionFile(targetFile)?.dialect ?? dialect)
          : dialect;
      if (compileClaudeToFile(spec, specPath, config, specDialect)) {
        writeInstructionMirrors(
          specPath.replace(/\.spec\.ts$/, ""),
          declaredHarnesses,
        );
      } else {
        allValid = false;
      }
    } else if (spec._specType === "skill") {
      // Cross-harness verify: flag CC-only frontmatter a declared minimal-profile
      // harness (Codex/OpenCode) would silently drop.
      const forHarnesses =
        declaredHarnesses.length > 0
          ? declaredHarnesses
          : [selection.adapter.name];
      for (const w of skillFrontmatterDropWarnings(spec, forHarnesses)) {
        console.log(`⚠ ${w}`);
      }
      if (!compileSkillToFile(spec, specPath, dialect)) allValid = false;
    } else if (spec._specType === "agent") {
      if (!compileAgentToFile(spec, specPath, dialect)) allValid = false;
    } else if (spec._specType === "railway") {
      knownAgents ??= await collectAgentNames();
      if (!compileRailwayToFile(spec, specPath, knownAgents)) allValid = false;
    }
  }
  return allValid;
}

/** True when running inside a GitHub Actions workflow. */
function isGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/**
 * Emit a GitHub Actions annotation for the inline PR experience.
 * No-op outside GitHub Actions.
 */
function ghAnnotate(
  level: "error" | "warning",
  message: string,
  file?: string,
  line?: number,
): void {
  if (!isGitHubActions()) return;
  const locParts: string[] = [];
  if (file) locParts.push(`file=${file}`);
  if (line !== undefined) locParts.push(`line=${String(line)}`);
  const loc = locParts.length > 0 ? " " + locParts.join(",") : "";
  console.log(`::${level}${loc}::${message}`);
}

interface HashCheckResult {
  valid: boolean;
  errorCount: number;
}

function verifyHashes(filePaths: string[], silent = false): HashCheckResult {
  let errorCount = 0;
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  for (const filePath of filePaths) {
    const fullPath = resolve(process.cwd(), filePath);

    // If the file doesn't exist at all (typo, deleted), that's an error —
    // not a "no hash" informational message. Without this check, a scoped
    // lint like `vigiles lint typo.md` would silently exit clean.
    if (!existsSync(fullPath)) {
      log(`\n✗ ${filePath} — file not found`);
      if (!silent) {
        ghAnnotate("error", `File not found: ${filePath}`, filePath);
      }
      errorCount++;
      continue;
    }

    const result = checkFileHash(fullPath);

    if (!result.hasHash) {
      log(`\n- ${filePath} — no vigiles hash (hand-written or pre-v2)`);
      continue;
    }

    if (result.valid) {
      log(`\n✓ ${filePath} — hash valid (from ${result.specFile})`);
      continue;
    }

    log(`\n✗ ${filePath} — hash mismatch (manually edited after compilation)`);
    log(
      `  Re-run \`vigiles compile\` to regenerate from ${result.specFile ?? "spec"}.`,
    );
    if (!silent) {
      ghAnnotate(
        "error",
        "Hash mismatch — file was manually edited after compilation",
        filePath,
      );
    }
    errorCount++;
  }
  return { valid: errorCount === 0, errorCount };
}

function validateSpecs(
  filePaths: string[],
  rulesConfig?: import("./core/types.js").RulesConfig,
  silent = false,
): boolean {
  let allValid = true;
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  for (const filePath of filePaths) {
    const fullPath = resolve(process.cwd(), filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    // Multi-target: if file has a "compiled from" hash, it has a spec
    // even if it's not named <file>.spec.ts (e.g., AGENTS.md from CLAUDE.md.spec.ts)
    const hashMatch = content.match(
      /<!-- vigiles:sha256:[a-f0-9]+ compiled from (.+) -->/,
    );
    if (hashMatch) {
      // Verify the referenced spec still exists
      const specRef = resolve(process.cwd(), hashMatch[1]);
      if (!existsSync(specRef)) {
        log(
          `  ✗ [require-instructions-spec] ${filePath} references "${hashMatch[1]}" but that spec no longer exists.`,
        );
        allValid = false;
      }
      continue;
    }

    const result = validate(content, {
      filePath: fullPath,
      rules: rulesConfig,
    });
    for (const err of result.errors) {
      log(`  ✗ [${err.rule}] ${err.message}`);
      allValid = false;
    }
    for (const warn of result.warnings) {
      log(`  ⚠ [${warn.rule}] ${warn.message}`);
    }
  }
  return allValid;
}

interface CombinedCheckResult {
  valid: boolean;
  hashErrors: number;
  validationErrors: number;
}

function check(filePaths: string[], silent = false): CombinedCheckResult {
  const hashes = verifyHashes(filePaths, silent);
  const vConfig = loadConfig();
  const specsValid = validateSpecs(filePaths, vConfig.rules, silent);
  return {
    valid: hashes.valid && specsValid,
    hashErrors: hashes.errorCount,
    // `validateSpecs` only returns a boolean today, so we collapse
    // failures to 1 until it starts reporting counts. Kept in its own
    // counter so lint's "stale hash — run vigiles compile" remediation
    // doesn't misreport a require-instructions-spec / other validation failure.
    validationErrors: specsValid ? 0 : 1,
  };
}

interface DuplicateResult {
  valid: boolean;
  pairCount: number;
}

/**
 * Find near-duplicate rules within each spec using NCD similarity.
 * Catches spec bloat — rules that likely say the same thing in different words.
 * Uses information-theoretic distance (gzip-based) — no LLM, fully deterministic.
 */
async function findDuplicateRules(
  threshold: number = 0.3,
  silent = false,
  scopeFiles?: string[],
): Promise<DuplicateResult> {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  const allSpecs = findSpecs();
  // If lint was invoked with explicit file arguments, only scan the specs
  // for those files — otherwise an unrelated duplicate elsewhere in the
  // repo would fail a targeted CI check (e.g. `vigiles lint path/foo.md`).
  //
  // Resolve each requested file to its real source spec by reading the
  // compiled-from header. Multi-target projects compile one spec to
  // several targets (e.g. CLAUDE.md.spec.ts → CLAUDE.md + AGENTS.md), so
  // naive `${file}.spec.ts` concatenation would miss the real source for
  // the secondary targets. Fall back to the concatenation rule if the
  // file has no hash header (e.g. freshly hand-written).
  const specs =
    scopeFiles && scopeFiles.length > 0
      ? (() => {
          const wanted = new Set<string>();
          const compiledFromRe =
            /<!--\s*vigiles:sha256:[a-f0-9]+\s+compiled from (.+?)\s*-->/;
          for (const f of scopeFiles) {
            let resolved: string | undefined;
            try {
              const content = readFileSync(resolve(process.cwd(), f), "utf-8");
              const m = compiledFromRe.exec(content);
              if (m) {
                resolved = resolve(process.cwd(), m[1].trim());
              }
            } catch {
              // File unreadable — fall through to the naming convention
            }
            if (!resolved) {
              resolved = resolve(process.cwd(), `${f}.spec.ts`);
            }
            wanted.add(resolved);
          }
          return allSpecs.filter((specPath) =>
            wanted.has(resolve(process.cwd(), specPath)),
          );
        })()
      : allSpecs;
  if (specs.length === 0) return { valid: true, pairCount: 0 };

  let totalPairs = 0;
  let specsWithDuplicates = 0;

  for (const specPath of specs) {
    const spec = await loadSpec(specPath);
    if (!spec || spec._specType !== "claude") continue;

    const rules = spec.rules;
    const ruleCount = Object.keys(rules).length;
    if (ruleCount < 2) continue;

    const pairs = findSimilarRules(rules, threshold);
    if (pairs.length === 0) continue;

    if (specsWithDuplicates === 0) {
      log(`Found near-duplicate rules (NCD < ${String(threshold)}):\n`);
    }
    specsWithDuplicates++;
    totalPairs += pairs.length;

    log(`  ${specPath}`);
    for (const pair of pairs.slice(0, 5)) {
      log(
        `    ${pair.idA}  ↔  ${pair.idB}  (distance: ${pair.distance.toFixed(3)})`,
      );
    }
    if (pairs.length > 5) {
      log(`    ... and ${String(pairs.length - 5)} more`);
    }
  }

  if (totalPairs === 0) {
    log("No near-duplicate rules detected.");
    return { valid: true, pairCount: 0 };
  }

  log(
    `\n  ${String(totalPairs)} duplicate pair(s) in ${String(specsWithDuplicates)} spec(s). Consider merging or rewording.`,
  );
  return { valid: false, pairCount: totalPairs };
}

/**
 * Structured lint report used by --json, --summary, and exit-code logic.
 */
interface LintReport {
  hashErrors: number;
  validationErrors: number;
  inlineErrors: number;
  inlineRules: number;
  frontmatterErrors: number;
  frontmatterRules: number;
  duplicatePairs: number;
  coverageEnabled: number;
  coverageDocumented: number;
  strengthenSuggestions: number;
  integrityErrors: number;
  coverageErrors: number;
  orphanCount: number;
  untestedSurfaces: number;
  untestedErrors: number;
  toolContractIssues: number;
  toolContractErrors: number;
  hookEventIssues: number;
  hookEventErrors: number;
  frontmatterSchemaIssues: number;
  frontmatterSchemaErrors: number;
  mcpConfigIssues: number;
  mcpConfigErrors: number;
  skillFrontmatterIssues: number;
  skillFrontmatterErrors: number;
  mcpToolIssues: number;
  mcpToolErrors: number;
  hookScriptIssues: number;
  hookScriptErrors: number;
  disallowedToolIssues: number;
  disallowedToolErrors: number;
  descriptionOverlapIssues: number;
  descriptionOverlapErrors: number;
  frontmatterValidIssues: number;
  frontmatterValidErrors: number;
  mcpHookIssues: number;
  mcpHookErrors: number;
  preferCompiledHookIssues: number;
  preferCompiledHookErrors: number;
  docRefErrors: number;
  symbolRefErrors: number;
  mcpRefErrors: number;
  files: string[];
}

/**
 * Verify the file-qualified symbol references (`path.ext#symbol`) in instruction
 * files: the named file must exist and define the named symbol. The author
 * names the file, so this is a *declared* reference — a broken one is an error.
 * Each named file is parsed on demand; there is no project-wide index. Returns
 * the count of broken references.
 */
function verifyMarkdownSymbols(files: string[], silent: boolean): number {
  if (files.length === 0) return 0;
  const cwd = process.cwd();
  let printedHeader = false;
  let errors = 0;
  for (const f of files) {
    let markdown: string;
    try {
      markdown = readFileSync(resolve(cwd, f), "utf-8");
    } catch {
      continue;
    }
    const broken = verifySymbolRefs(markdown, dirname(resolve(cwd, f)));
    if (broken.length === 0) continue;
    if (!silent) {
      if (!printedHeader) {
        console.log("\nSymbol reference check:\n");
        printedHeader = true;
      }
      for (const b of broken) {
        console.log(`  ✗ ${f}:${String(b.line)} ${b.reason}`);
        ghAnnotate("error", b.reason, f, b.line);
      }
    }
    errors += broken.length;
  }
  return errors;
}

/**
 * Verify `vigiles:mcp server#tool` marks in instruction files against the live
 * MCP servers declared in `.mcp.json` — the referenced tool must exist on the
 * server (it gets started for the check). No `.mcp.json` ⇒ skipped; a server is
 * only started if a mark actually references it. Returns the count of broken
 * references. Async because it speaks to real servers.
 */
async function verifyMarkdownMcpRefs(
  files: string[],
  silent: boolean,
): Promise<number> {
  const cwd = process.cwd();
  const servers = loadMcpServers(cwd);
  if (files.length === 0 || Object.keys(servers).length === 0) return 0;
  let printedHeader = false;
  let errors = 0;
  for (const f of files) {
    let markdown: string;
    try {
      markdown = readFileSync(resolve(cwd, f), "utf-8");
    } catch {
      continue;
    }
    const broken = await verifyMcpRefs(markdown, servers);
    if (broken.length === 0) continue;
    if (!silent) {
      if (!printedHeader) {
        console.log("\nMCP reference check:\n");
        printedHeader = true;
      }
      for (const b of broken) {
        const msg = mcpRefMessage(b);
        console.log(`  ✗ ${f}:${String(b.line)} ${msg}`);
        ghAnnotate("error", msg, f, b.line);
      }
    }
    errors += broken.length;
  }
  return errors;
}

/** Exit codes: 0 clean, 1 warnings only, 2 hard errors. */
function lintExitCode(report: LintReport): 0 | 1 | 2 {
  if (
    report.hashErrors > 0 ||
    report.validationErrors > 0 ||
    report.inlineErrors > 0 ||
    report.frontmatterErrors > 0 ||
    report.integrityErrors > 0 ||
    report.coverageErrors > 0 ||
    report.untestedErrors > 0 ||
    report.toolContractErrors > 0 ||
    report.hookEventErrors > 0 ||
    report.frontmatterSchemaErrors > 0 ||
    report.mcpConfigErrors > 0 ||
    report.skillFrontmatterErrors > 0 ||
    report.mcpToolErrors > 0 ||
    report.hookScriptErrors > 0 ||
    report.disallowedToolErrors > 0 ||
    report.descriptionOverlapErrors > 0 ||
    report.frontmatterValidErrors > 0 ||
    report.mcpHookErrors > 0 ||
    report.preferCompiledHookErrors > 0 ||
    report.symbolRefErrors > 0 ||
    report.mcpRefErrors > 0
  )
    return 2;
  if (
    report.duplicatePairs > 0 ||
    report.orphanCount > 0 ||
    report.docRefErrors > 0
  )
    return 1;
  // Guidance counts are informational, not failures
  return 0;
}

/**
 * Verify inline `<!-- vigiles:enforce ... -->` comments in an instruction
 * file. Each comment's linter rule goes through the same verification as
 * spec-declared enforce rules (existence, enabled status, closest-match
 * suggestions on typo).
 */
type LinterOptions = {
  catalogOnly?: boolean;
  linters?: Record<string, { rulesDir?: string | string[] }>;
};

interface RuleVerifyResult {
  ok: boolean;
  errorCount: number;
  ruleCount: number;
  /** Linter rule references that were verified (for cross-source dedup). */
  ruleNames: string[];
}

/**
 * Verify one parsed enforce rule against the linter catalog/config, logging
 * and annotating on failure. Returns true when the rule is valid+enabled.
 */
function verifyOneRule(
  rule: { linterRule: string; line: number },
  filePath: string,
  silent: boolean,
  linterOptions?: LinterOptions,
): boolean {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  const result = checkLinterRule(rule.linterRule, process.cwd(), linterOptions);
  if (!result.exists) {
    const message = result.error ?? `Rule "${rule.linterRule}" not found`;
    log(`  ✗ line ${String(rule.line)}: ${message}`);
    if (!silent) ghAnnotate("error", message, filePath, rule.line);
    return false;
  }
  if (result.enabled === "disabled") {
    const message = `Rule "${rule.linterRule}" exists but is disabled in ${result.linter} config`;
    log(`  ✗ line ${String(rule.line)}: ${message}`);
    if (!silent) ghAnnotate("error", message, filePath, rule.line);
    return false;
  }
  log(`  ✓ line ${String(rule.line)}: ${rule.linterRule}`);
  return true;
}

/**
 * Verify the `vigiles:file` / `vigiles:cmd` references a markdown file declares
 * (inline comments or frontmatter lists), using the same engine spec mode uses:
 * file paths via existsSync, npm scripts and script-runner commands via
 * package.json / the filesystem. References resolve relative to the markdown
 * file's own directory. Returns the number of stale references found.
 */
function verifyMarkdownRefs(
  files: readonly { path: string; line: number }[],
  commands: readonly { command: string; line: number }[],
  filePath: string,
  silent: boolean,
): number {
  const basePath = dirname(resolve(process.cwd(), filePath));
  let errorCount = 0;
  const report = (err: CompileError, line: number): void => {
    if (!silent) {
      console.log(`  ✗ line ${String(line)}: ${err.message}`);
      ghAnnotate("error", err.message, filePath, line);
    }
    errorCount++;
  };
  for (const f of files) {
    const err = validateFileRef(f.path, basePath);
    if (err) report(err, f.line);
  }
  for (const c of commands) {
    const err = validateCommandRef(c.command, basePath);
    if (err) report(err, c.line);
  }
  return errorCount;
}

function verifyInlineRules(
  filePath: string,
  silent: boolean,
  linterOptions?: LinterOptions,
): RuleVerifyResult {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };

  let content: string;
  try {
    content = readFileSync(resolve(process.cwd(), filePath), "utf-8");
  } catch {
    return { ok: true, errorCount: 0, ruleCount: 0, ruleNames: [] };
  }

  const {
    rules,
    files,
    commands,
    errors: parseErrors,
  } = parseInlineRules(content);
  if (
    rules.length === 0 &&
    files.length === 0 &&
    commands.length === 0 &&
    parseErrors.length === 0
  ) {
    return { ok: true, errorCount: 0, ruleCount: 0, ruleNames: [] };
  }

  let errorCount = 0;
  log(`\n${filePath} (inline mode):`);

  for (const err of parseErrors) {
    log(`  ✗ line ${String(err.line)}: ${err.message}`);
    errorCount++;
    if (!silent) {
      ghAnnotate("error", err.message, filePath, err.line);
    }
  }

  for (const rule of rules) {
    if (!verifyOneRule(rule, filePath, silent, linterOptions)) errorCount++;
  }
  errorCount += verifyMarkdownRefs(files, commands, filePath, silent);

  return {
    ok: errorCount === 0,
    errorCount,
    ruleCount: rules.length + files.length + commands.length,
    ruleNames: rules.map((r) => r.linterRule),
  };
}

/**
 * Verify `vigiles.enforce` rules declared in a file's YAML frontmatter.
 * Same engine as inline/spec rules. Rules whose reference already appeared
 * in `exclude` (e.g. declared inline in the same file) are skipped so a
 * rule present in both sources is reported once, not twice.
 */
function verifyFrontmatterRules(
  filePath: string,
  silent: boolean,
  exclude: ReadonlySet<string>,
  linterOptions?: LinterOptions,
): RuleVerifyResult {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };

  let content: string;
  try {
    content = readFileSync(resolve(process.cwd(), filePath), "utf-8");
  } catch {
    return { ok: true, errorCount: 0, ruleCount: 0, ruleNames: [] };
  }

  const {
    rules: allRules,
    files,
    commands,
    errors: parseErrors,
  } = parseFrontmatterRules(content);
  const rules = allRules.filter((r) => !exclude.has(r.linterRule));
  if (
    rules.length === 0 &&
    files.length === 0 &&
    commands.length === 0 &&
    parseErrors.length === 0
  ) {
    return { ok: true, errorCount: 0, ruleCount: 0, ruleNames: [] };
  }

  let errorCount = 0;
  log(`\n${filePath} (frontmatter mode):`);

  for (const err of parseErrors) {
    log(`  ✗ line ${String(err.line)}: ${err.message}`);
    errorCount++;
    if (!silent) {
      ghAnnotate("error", err.message, filePath, err.line);
    }
  }

  for (const rule of rules) {
    if (!verifyOneRule(rule, filePath, silent, linterOptions)) errorCount++;
  }
  errorCount += verifyMarkdownRefs(files, commands, filePath, silent);

  return {
    ok: errorCount === 0,
    errorCount,
    ruleCount: rules.length + files.length + commands.length,
    ruleNames: rules.map((r) => r.linterRule),
  };
}

interface MarkdownModeTotals {
  inlineErrors: number;
  inlineRules: number;
  frontmatterErrors: number;
  frontmatterRules: number;
}

/**
 * Verify inline `<!-- vigiles:enforce -->` comments and `vigiles:` YAML
 * frontmatter in instruction files that aren't managed by a spec.
 *
 * Spec mode is the source of truth when it exists, so a literal
 * `<!-- vigiles:enforce ... -->` snippet that survived into compiled
 * markdown (or an example in a spec-managed file) must not trip lint. A
 * file is spec-managed iff it has a sibling `<file>.spec.ts` OR its own
 * `<!-- vigiles:sha256:... compiled from <spec> -->` header. A rule
 * declared both inline and in frontmatter is verified once (inline wins as
 * the first source). See docs/markdown-mode.md.
 */
function verifyMarkdownModeRules(
  files: string[],
  silent: boolean,
  config?: VigilesConfig,
): MarkdownModeTotals {
  const totals: MarkdownModeTotals = {
    inlineErrors: 0,
    inlineRules: 0,
    frontmatterErrors: 0,
    frontmatterRules: 0,
  };
  if (!silent && files.length > 0) {
    console.log("\nInline + frontmatter rule verification:");
  }
  const linterOptions: LinterOptions = {
    catalogOnly: config?.catalogOnly,
    linters: config?.linters,
  };
  const compiledFromRe =
    /<!--\s*vigiles:sha256:[a-f0-9]+\s+compiled from .+?\s*-->/;
  for (const filePath of files) {
    const abs = resolve(process.cwd(), filePath);
    if (existsSync(`${abs}.spec.ts`)) continue; // managed by sibling spec
    let content: string;
    try {
      content = readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    if (compiledFromRe.test(content)) continue; // managed via hash header
    const inline = verifyInlineRules(filePath, silent, linterOptions);
    totals.inlineErrors += inline.errorCount;
    totals.inlineRules += inline.ruleCount;
    const fm = verifyFrontmatterRules(
      filePath,
      silent,
      new Set(inline.ruleNames),
      linterOptions,
    );
    totals.frontmatterErrors += fm.errorCount;
    totals.frontmatterRules += fm.ruleCount;
  }
  if (
    !silent &&
    files.length > 0 &&
    totals.inlineRules === 0 &&
    totals.frontmatterRules === 0
  ) {
    console.log(
      "  (no inline vigiles:enforce comments or vigiles: frontmatter found)",
    );
  }
  return totals;
}

/**
 * Unified lint command: verify hashes, report coverage gaps, detect duplicates,
 * suggest improvements.
 *
 * Flags:
 *   --summary   Print a single-line summary (for SessionStart hooks)
 *   --json      Print structured JSON report (for CI integration)
 */
async function runLint(
  restArgs: string[],
  flags: string[],
  config?: VigilesConfig,
): Promise<LintReport> {
  const summary = flags.includes("--summary");
  const json = flags.includes("--json");
  const silent = summary || json;

  const files = findInstructionFiles(restArgs, config?.exclude);

  // Resolve the active harness ONCE so the harness-specific checks below run
  // against the right adapter's dialect (tool/event catalogs) and surfaces —
  // not a hard-coded Claude Code default. A subagent-surface rule reports n/a
  // on a harness without subagents (Codex) rather than scanning nothing.
  const harnessFlag = harnessFlagFrom(flags);
  const lintSelection = resolveHarnessSelection({
    root: process.cwd(),
    flag: harnessFlag,
    configHarness: normalizeHarnessList(config?.harness),
  });
  const adapter = lintSelection.adapter;

  // 1. Verify hashes and structure
  if (!silent) {
    if (files.length > 0) {
      console.log("Verifying compiled files...\n");
    } else {
      console.log("No compiled instruction files found.\n");
    }
  }
  const hashResult =
    files.length > 0
      ? check(files, silent)
      : { valid: true, hashErrors: 0, validationErrors: 0 };

  // 1b. Verify inline + frontmatter rules in instruction files not managed
  // by a spec. See verifyMarkdownModeRules / docs/markdown-mode.md.
  const md = verifyMarkdownModeRules(files, silent, config);
  const { inlineErrors, inlineRules, frontmatterErrors, frontmatterRules } = md;

  // 2. Coverage gaps (discover)
  if (!silent) console.log("\nLinter rule coverage:\n");
  const coverage = discover(silent);

  // 3. Duplicate rule detection (NCD). Scope to the requested files when
  // lint was invoked with explicit paths, so targeted CI checks don't
  // fail on unrelated duplicates elsewhere in the repo.
  if (!silent) console.log("\nDuplicate rule detection:\n");
  const dups = await findDuplicateRules(
    0.3,
    silent,
    restArgs.length > 0 ? files : undefined,
  );

  // 4. Guidance rule count (strengthen suggestions moved to /strengthen skill)
  const guidanceCount = await countGuidanceRules(silent);

  // 5. Integrity check (hand-edit detection via SHA-256 hash)
  const integritySeverity = config?.rules.integrity ?? "warn";
  let integrityErrors = 0;
  if (integritySeverity) {
    if (!silent) console.log("\nIntegrity check:\n");
    integrityErrors = checkIntegrityForFiles(files, integritySeverity, silent);
  }

  // 6. Coverage thresholds (gates CI when severity is "error")
  const coverageErrors = await checkCoverageThresholds(
    coverage,
    config,
    silent,
  );

  // 7. Orphan docs check — find .md files no other markdown references.
  // Enforces the `vigiles/orphan-docs` built-in rule when declared in a
  // spec. Include/exclude come from .vigilesrc.json#orphans (tsconfig-
  // style globs); default include is docs/ + research/ for the
  // vigiles-repo convention.
  if (!silent) console.log("\nOrphan docs check:\n");
  const orphanReport = findOrphanDocs({
    basePath: process.cwd(),
    include: config?.orphans?.include,
    exclude: config?.orphans?.exclude,
  });
  if (!silent) {
    for (const line of formatOrphanReport(orphanReport).split("\n")) {
      console.log(`  ${line}`);
    }
  }

  // 7b. Untested-surface check — skills/agents/hooks shipping without a test or
  // eval. Warning by default (a nudge, exit 0); set rules.untested-{skill,agent,
  // hook} to "error" to gate CI. See src/test-coverage.ts and docs/rules/.
  const untested = checkUntestedSurfaces(config, silent, adapter);

  // 7c. Subagent tool-contract check — cross-reference each subagent's `tools:`
  // rail against the harness catalog (the moat). n/a on a harness with no
  // subagents. Off by default unless a severity is configured; warning surfaces
  // a typo/never-available tool, error gates CI.
  const toolContract = checkSubagentToolContracts(config, silent, adapter);

  // 7d. Hook-event check — a hook registered under an event the harness doesn't
  // define never fires. High-precision (close typos only). Off unless configured.
  const hookEvents = checkHookEvents(config, silent, adapter);

  // 7e. Subagent-frontmatter check — a subagent missing required frontmatter
  // (name + description) won't register. n/a on a harness with no subagents.
  const frontmatter = checkFrontmatterSchema(config, silent, adapter);

  // 7f. MCP-config check — a declared MCP server with no command/url can't start.
  const mcpConfig = checkMcpConfig(config, silent, adapter);

  // 7g. Skill-frontmatter — RECOMMEND explicit name/description on skills (a
  // reliable trigger surface). Best-practice nudge; skills load without it.
  const skillFm = checkSkillFrontmatter(config, silent, adapter);

  // 7h. MCP tool-resolution — an `mcp__server__tool` in a contract whose server
  // the plugin doesn't declare can't resolve (the MCP half of the tool moat).
  const mcpToolResolves = checkMcpToolResolves(config, silent, adapter);

  // 7i. Hook-script existence — a hook command referencing a missing script file
  // never runs (matches Anthropic's own `claude plugin validate`).
  const hookScripts = checkHookScriptExists(config, silent, adapter);

  // 7j. Disallowed-tools — a `disallowedTools:` block-list typo blocks nothing
  // (the deny-side mirror of subagent-tool-contract; close-typo only).
  const disallowedTools = checkDisallowedTools(config, silent, adapter);

  // 7k. Description-overlap — two model-invocable skills with near-identical
  // descriptions collide in the selector (deterministic NCD precision proxy).
  const descriptionOverlap = checkDescriptionOverlap(config, silent, adapter);

  // 7l. Frontmatter-valid — a `---` block that isn't valid YAML (warn; js-yaml is
  // stricter than some loaders, so verify before enforcing).
  const frontmatterValid = checkFrontmatterValid(config, silent, adapter);

  // 7m. MCP hook-target — a `type: mcp_tool` hook action that's incomplete or
  // targets an undeclared server (the moat applied to the hook surface).
  const mcpHookTargets = checkMcpHookTargets(config, silent, adapter);

  // 7n. Prefer-compiled-hooks — ONE discovery nudge (not per-hook) toward
  // compiled `vigiles/hook` artifacts when hand-written hooks ship. Recommendation.
  const preferCompiledHooks = checkPreferCompiledHooks(config, silent, adapter);

  // 8. Validate vigiles builder calls inside markdown code blocks. Default
  // is to validate every ref; illustrative blocks opt out via
  // `<!-- vigiles:ignore -->` (single block) or
  // `<!-- vigiles:ignore-file -->` (whole file). Same engine as spec.ts.
  if (!silent) console.log("\nMarkdown code block refs:\n");
  const docRefReport = findDocRefs({ basePath: process.cwd() });
  if (!silent) {
    for (const line of formatDocRefReport(docRefReport).split("\n")) {
      console.log(`  ${line}`);
    }
  }
  // Per-line GitHub annotations for each broken doc ref — each carries file+line,
  // so GitHub renders it INLINE on the PR diff (not just in the summary blob).
  // Previously this check reported to stdout only; the inline/spec checks already
  // annotate per-line, so this closes the gap that left doc-ref findings invisible
  // on the PR. CI-only (isGitHubActions); skipped under --json/--summary.
  if (isGitHubActions() && !silent) {
    for (const e of docRefReport.errors) {
      ghAnnotate(
        "error",
        `${e.kind}("${e.value}") — ${e.message}`,
        e.file,
        e.line,
      );
    }
  }

  // 9. Verify code-shaped symbol references live (see src/refs.ts).
  const symbolRefErrors = verifyMarkdownSymbols(files, silent);

  // 10. Verify `vigiles:mcp server#tool` marks against live MCP servers
  // (only when a .mcp.json declares them). See src/mcp.ts.
  const mcpRefErrors = await verifyMarkdownMcpRefs(files, silent);

  const report: LintReport = {
    hashErrors: hashResult.hashErrors,
    validationErrors: hashResult.validationErrors,
    inlineErrors,
    inlineRules,
    frontmatterErrors,
    frontmatterRules,
    duplicatePairs: dups.pairCount,
    coverageEnabled: coverage.enabled,
    coverageDocumented: coverage.documented,
    strengthenSuggestions: guidanceCount,
    integrityErrors,
    coverageErrors,
    orphanCount: orphanReport.orphans.length,
    untestedSurfaces: untested.untested,
    untestedErrors: untested.errors,
    toolContractIssues: toolContract.issues,
    toolContractErrors: toolContract.errors,
    hookEventIssues: hookEvents.issues,
    hookEventErrors: hookEvents.errors,
    frontmatterSchemaIssues: frontmatter.issues,
    frontmatterSchemaErrors: frontmatter.errors,
    mcpConfigIssues: mcpConfig.issues,
    mcpConfigErrors: mcpConfig.errors,
    skillFrontmatterIssues: skillFm.issues,
    skillFrontmatterErrors: skillFm.errors,
    mcpToolIssues: mcpToolResolves.issues,
    mcpToolErrors: mcpToolResolves.errors,
    hookScriptIssues: hookScripts.issues,
    hookScriptErrors: hookScripts.errors,
    disallowedToolIssues: disallowedTools.issues,
    disallowedToolErrors: disallowedTools.errors,
    descriptionOverlapIssues: descriptionOverlap.issues,
    descriptionOverlapErrors: descriptionOverlap.errors,
    frontmatterValidIssues: frontmatterValid.issues,
    frontmatterValidErrors: frontmatterValid.errors,
    mcpHookIssues: mcpHookTargets.issues,
    mcpHookErrors: mcpHookTargets.errors,
    preferCompiledHookIssues: preferCompiledHooks.issues,
    preferCompiledHookErrors: preferCompiledHooks.errors,
    docRefErrors: docRefReport.errors.length,
    symbolRefErrors,
    mcpRefErrors,
    files,
  };

  if (summary) {
    printLintSummary(report);
  } else if (json) {
    console.log(JSON.stringify(report, null, 2));
  }

  return report;
}

/** Single-line lint summary for SessionStart hooks — minimal token cost. */
function printLintSummary(report: LintReport): void {
  const parts: string[] = [];
  if (report.hashErrors > 0) parts.push(`${String(report.hashErrors)} stale`);
  if (report.validationErrors > 0)
    parts.push(`${String(report.validationErrors)} validation errors`);
  if (report.inlineErrors > 0)
    parts.push(`${String(report.inlineErrors)} inline errors`);
  if (report.frontmatterErrors > 0)
    parts.push(`${String(report.frontmatterErrors)} frontmatter errors`);
  if (report.duplicatePairs > 0)
    parts.push(`${String(report.duplicatePairs)} duplicates`);
  if (report.orphanCount > 0)
    parts.push(`${String(report.orphanCount)} orphan docs`);
  if (report.untestedSurfaces > 0)
    parts.push(`${String(report.untestedSurfaces)} untested surfaces`);
  if (report.docRefErrors > 0)
    parts.push(`${String(report.docRefErrors)} broken doc refs`);
  if (report.symbolRefErrors > 0)
    parts.push(`${String(report.symbolRefErrors)} broken symbol refs`);
  if (report.mcpRefErrors > 0)
    parts.push(`${String(report.mcpRefErrors)} broken MCP refs`);
  const undocumented = report.coverageEnabled - report.coverageDocumented;
  if (undocumented > 0)
    parts.push(`${String(undocumented)} undocumented rules`);
  if (report.strengthenSuggestions > 0)
    parts.push(
      `${String(report.strengthenSuggestions)} guidance (run /strengthen to upgrade)`,
    );
  if (report.integrityErrors > 0)
    parts.push(
      `${String(report.integrityErrors)} tampered (edit the .spec.ts source)`,
    );
  if (parts.length === 0) {
    console.log("vigiles: clean");
  } else {
    console.log(`vigiles: ${parts.join(" / ")}`);
  }
}

function collectDocumentedRules(): Set<string> {
  const documented = new Set<string>();
  const mdFiles = globSync("**/CLAUDE.md", {
    ignore: IGNORE_NODE_MODULES,
    cwd: process.cwd(),
  });
  for (const mdFile of mdFiles) {
    const content = readFileSync(resolve(process.cwd(), mdFile), "utf-8");
    const enforcedRe = /\*\*Enforced by:\*\*\s*`([^`]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = enforcedRe.exec(content)) !== null) {
      documented.add(m[1]);
    }
  }
  return documented;
}

interface CoverageTotals {
  enabled: number;
  documented: number;
}

function printLinterCoverage(
  linter: { linter: string; rules: string[] },
  documentedRules: Set<string>,
  silent = false,
): CoverageTotals {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  const documented = linter.rules.filter((r) =>
    documentedRules.has(`${linter.linter}/${r}`),
  );
  const undocumented = linter.rules.filter(
    (r) => !documentedRules.has(`${linter.linter}/${r}`),
  );
  const pct =
    linter.rules.length > 0
      ? Math.round((documented.length / linter.rules.length) * 100)
      : 0;

  log(
    `  ${linter.linter}: ${String(documented.length)}/${String(linter.rules.length)} rules documented (${String(pct)}%)`,
  );

  if (documented.length > 0 && documented.length <= 10) {
    for (const r of documented) {
      log(`    ✓ ${linter.linter}/${r}`);
    }
  }

  if (undocumented.length > 0) {
    const show = undocumented.slice(0, 5);
    log(`    Top undocumented:`);
    for (const r of show) {
      log(`    ✗ ${linter.linter}/${r}`);
    }
    if (undocumented.length > 5) {
      log(`    ... and ${String(undocumented.length - 5)} more`);
    }
  }
  log("");

  return { enabled: linter.rules.length, documented: documented.length };
}

function discover(silent = false): CoverageTotals {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };
  log("Scanning project for linter rules...\n");

  const result = generateTypes({ basePath: process.cwd() });
  const documentedRules = collectDocumentedRules();

  log("Detected linters:\n");

  let totalEnabled = 0;
  let totalDocumented = 0;

  for (const linter of result.linters) {
    const totals = printLinterCoverage(linter, documentedRules, silent);
    totalEnabled += totals.enabled;
    totalDocumented += totals.documented;
  }

  if (result.linters.length === 0) {
    log("  No linters detected.\n");
  }

  const totalPct =
    totalEnabled > 0 ? Math.round((totalDocumented / totalEnabled) * 100) : 0;
  log(
    `Coverage: ${String(totalDocumented)}/${String(totalEnabled)} rules documented (${String(totalPct)}%)`,
  );

  if (totalDocumented < totalEnabled) {
    log(
      `\nConsider adding enforce() rules for frequently-triggered undocumented rules.`,
    );
    log(`The agent encounters these rules but has no context about WHY.`);
  }

  return { enabled: totalEnabled, documented: totalDocumented };
}

/** This package's own version (from the installed package.json). */
function getVersion(): string {
  try {
    // dist/cli.js → ../package.json (the package root).
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** The dependency range to pin `vigiles` to (the running CLI's major, e.g.
 * `^3`). Falls back to `latest` for the unreleased dev placeholder version. */
function vigilesDepSpec(): string {
  const major = parseInt(getVersion(), 10);
  return Number.isFinite(major) && major > 0 ? `^${String(major)}` : "latest";
}

/** True when the file's first line carries a vigiles integrity hash (i.e. it
 * is a compiled artifact we own, safe to overwrite — not hand-written prose). */
function targetHasHash(absPath: string): boolean {
  try {
    const first = readFileSync(absPath, "utf-8").split("\n", 1)[0];
    return first.includes("vigiles:sha256");
  } catch {
    return false;
  }
}

/**
 * Single-target spec scaffolder — the small building block behind the `init`
 * verb, NOT the wizard. Creates exactly one sibling `<target>.spec.ts`: it
 * faithfully ADOPTS an existing hand-written instruction file (non-destructive —
 * never overwrites the markdown) or writes a blank starter for a greenfield
 * target. Called directly for `vigiles init --target=<file>`, and once per
 * target by `setupPillar1`. The full onboarding (both layers, deps, CI, plugin)
 * is `setup()`.
 */
/** Classify an adoption target by its path: a `SKILL.md` is a skill, a file under
 * an `agents/` dir is a subagent, everything else is an instruction file. Used to
 * pick the right adopt function so `init --target=skills/x/SKILL.md` (the
 * per-surface path the audit report points at) makes a `skill()`/`agent()` spec. */
function surfaceKind(target: string): "skill" | "agent" | "instruction" {
  if (/^SKILL\.md$/i.test(basename(target))) return "skill";
  if (/(^|[/\\])agents[/\\]/.test(target)) return "agent";
  return "instruction";
}

function logAdoptedSurface(
  target: string,
  specPath: string,
  label: string,
  unmappedKeys: string[],
): void {
  const note =
    unmappedKeys.length > 0
      ? ` (review the // NOTE — unmapped frontmatter: ${unmappedKeys.join(", ")})`
      : "";
  console.log(
    `Adopted ${label} ${target} → ${specPath}${note}. ` +
      `Run \`vigiles compile\` and review the diff.`,
  );
}

/** Discover existing skill (`skills/<x>/SKILL.md`) and subagent (`agents/<x>.md`)
 * surfaces — under the bare or `.claude/` roots — that don't yet have a spec, so
 * bare `vigiles init` creates a spec for EVERY surface it can, not just the
 * instruction file. Shallow (top-level only) so it never walks node_modules or a
 * vendored plugin. CC paths are intentional here — `init` is the one composition
 * point allowed to know them (see adapter-aware-lint-rules). */
function discoverAdoptableSurfaces(cwd: string): string[] {
  const out: string[] = [];
  const unspecced = (rel: string): boolean =>
    existsSync(resolve(cwd, rel)) &&
    !existsSync(resolve(cwd, `${rel}.spec.ts`));
  for (const root of ["skills", ".claude/skills"]) {
    const abs = resolve(cwd, root);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const rel = `${root}/${e.name}/SKILL.md`;
      if (e.isDirectory() && unspecced(rel)) out.push(rel);
    }
  }
  for (const root of ["agents", ".claude/agents"]) {
    const abs = resolve(cwd, root);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const rel = `${root}/${e.name}`;
      if (e.isFile() && e.name.endsWith(".md") && unspecced(rel)) out.push(rel);
    }
  }
  return out;
}

/** The full adoptable-surface list `audit` reports: the instruction file (when it
 * exists hand-written, no spec) PLUS every skill/subagent surface without a spec.
 * Same notion `init` adopts; surfaced in the AuditReport + the terminal nudge so
 * the report's "Create spec" / "Create all specs" affordances have their paths.
 * Composition-root only — CC paths are intentional here (like discoverAdoptableSurfaces). */
function discoverAdoptableForAudit(
  root: string,
  instructionFile: string,
): string[] {
  const out: string[] = [];
  const instrAbs = resolve(root, instructionFile);
  if (
    existsSync(instrAbs) &&
    !targetHasHash(instrAbs) &&
    !existsSync(resolve(root, `${instructionFile}.spec.ts`))
  ) {
    out.push(instructionFile);
  }
  out.push(...discoverAdoptableSurfaces(root));
  return out;
}

/** The terminal "adoptable surfaces" nudge — N un-spec'd surfaces + the create-all
 * command and up to ~5 per-surface commands (then "+K more"). "" when nothing to
 * adopt (a fully spec-managed repo says nothing). */
function formatAdoptableNudge(surfaces: readonly string[]): string {
  if (surfaces.length === 0) return "";
  const n = surfaces.length;
  const lines = [
    `ℹ ${String(n)} surface${n === 1 ? "" : "s"} not yet spec-managed — create specs with \`npx vigiles init\``,
    `  (or one at a time: \`npx vigiles init --target=<path>\`)`,
  ];
  const shown = surfaces.slice(0, 5);
  for (const s of shown) lines.push(`    • npx vigiles init --target=${s}`);
  const more = n - shown.length;
  if (more > 0) lines.push(`    • +${String(more)} more`);
  return lines.join("\n");
}

/** A small, terse behavioral nudge — the deterministic read can't tell whether a
 * skill actually FIRES. "" when there are no model-invocable skills. */
function formatTriggerNudge(triggerableSkills: number): string {
  if (triggerableSkills <= 0) return "";
  const n = triggerableSkills;
  return (
    `ℹ Do your ${String(n)} skill${n === 1 ? "" : "s"} actually fire? The deterministic read can't tell — ` +
    `run \`audit\` interactively to measure, or test with \`measureTriggerRate\` (vigiles/testing).`
  );
}

function scaffoldSpec(args: string[]): void {
  const targetFlag = args.find((a) => a.startsWith("--target="));
  const target = targetFlag ? targetFlag.split("=")[1] : "CLAUDE.md";
  const specPath = `${target}.spec.ts`;
  const specAbs = resolve(process.cwd(), specPath);

  if (existsSync(specAbs)) {
    console.log(`${specPath} already exists.`);
    return;
  }

  // Auto-adopt: when the target file already exists with hand-written content
  // (no integrity header), faithfully convert it into a spec instead of
  // scaffolding a blank one — so `init` leaves you with a spec, not homework, and
  // `require-instructions-spec` is satisfied by construction. The compile that
  // follows reproduces the file (+ the header); review the diff. `vigiles eject`
  // reverses it. See research/install-enforcement-dx.md.
  const targetAbs = resolve(process.cwd(), target);
  if (existsSync(targetAbs) && !targetHasHash(targetAbs)) {
    const md = readFileSync(targetAbs, "utf-8");
    mkdirSync(dirname(specAbs), { recursive: true });
    const kind = surfaceKind(target);
    if (kind === "skill") {
      const { source, unmappedKeys } = adoptSkill(
        md,
        basename(dirname(target)),
      );
      writeFileSync(specAbs, source);
      logAdoptedSurface(target, specPath, "skill", unmappedKeys);
    } else if (kind === "agent") {
      const { source, unmappedKeys } = adoptAgent(md, basename(target, ".md"));
      writeFileSync(specAbs, source);
      logAdoptedSurface(target, specPath, "subagent", unmappedKeys);
    } else {
      const { source, tier, sectionCount } = adoptMarkdown(
        md,
        basename(target),
      );
      writeFileSync(specAbs, source);
      console.log(
        `Adopted ${target} → ${specPath} (${tier}, ${String(sectionCount)} section${sectionCount === 1 ? "" : "s"}). ` +
          `Run \`vigiles compile\` and review the diff; the \`/strengthen\` skill upgrades prose to verified rules.`,
      );
    }
    return;
  }

  // The compiled output is derived from the spec FILE path; the spec's `target`
  // field is the h1 + the name the compiler validates against, so it must be the
  // bare filename even when the spec lives in a subdir (e.g. a sync tool's
  // `.ruler/AGENTS.md.spec.ts` source slot → target "AGENTS.md").
  const targetName = basename(target);
  const targetLine =
    targetName !== "CLAUDE.md" ? `\n  target: "${targetName}",` : "";
  // Import ONLY what the scaffold uses (`claude`) — a strict ESLint with
  // \`no-unused-vars\` + \`--max-warnings=0\` (common in CI) would otherwise fail
  // the moment this is committed, because the enforce()/guidance() examples
  // below are commented out. The commented import shows what to add when you
  // write a real rule.
  const template = `import { claude } from "vigiles/spec";
// When you add rules below, import the builders you use, e.g.:
// import { claude, enforce, guidance } from "vigiles/spec";

export default claude({${targetLine}
  sections: {
    // Prose sections become ## headings in the compiled output.
    // Do not add # or ## headers inside sections.
    // positioning: "What this project does and why.",

    // This section is included in the compiled output to help agents
    // understand how to work with specs. Remove it once your team is familiar.
    "how-to-edit": "This file is compiled from a .spec.ts file. Do not edit it directly — edit the spec and run 'npx vigiles compile'. To add a rule: add to the rules object in the spec.",
  },

  commands: {
    // Commands are verified against package.json at compile time.
    // "npm run build": "Compile the project",
    // "npm test": "Run all tests",
  },

  keyFiles: {
    // File paths are verified to exist at compile time.
    // "src/index.ts": "Main entry point",
  },

  rules: {
    // enforce() — backed by a linter rule, verified to exist AND be enabled:
    // "no-console": enforce("eslint/no-console", "Use structured logger."),
    //
    // guidance() — prose only, no enforcement:
    // "research-first": guidance("Google unfamiliar APIs before implementing."),
  },
});
`;
  mkdirSync(dirname(specAbs), { recursive: true });
  writeFileSync(specAbs, template);
  console.log(`Created ${specPath} — edit it and run \`vigiles compile\`.`);
}

/**
 * `vigiles eject [file]` — the inverse of `compile`: hand a compiled instruction
 * file back to the user as plain, hand-owned markdown. Strips the `vigiles:sha256`
 * integrity header, adds a `require-instructions-spec` disable marker so `lint` stays quiet,
 * and removes the spec that managed it (`--keep-spec` to leave it). The
 * "managed-but-ejectable" escape hatch: adopting a typed spec is never a one-way
 * door.
 */
function eject(args: string[]): void {
  const keepSpec = args.includes("--keep-spec");
  const file = args.find((a) => !a.startsWith("-")) ?? "CLAUDE.md";
  const abs = resolve(process.cwd(), file);
  if (!existsSync(abs)) {
    console.error(`✗ ${file}: no such file.`);
    process.exitCode = 1;
    return;
  }
  const ejected = ejectMarkdown(readFileSync(abs, "utf-8"));
  if (!ejected) {
    console.log(
      `${file} is not vigiles-managed (no integrity header) — nothing to eject.`,
    );
    return;
  }
  writeFileSync(abs, ejected.markdown);
  console.log(`✓ Ejected ${file} — it's now plain, hand-owned markdown.`);
  const specAbs = resolve(process.cwd(), ejected.specFile);
  // SAFETY: the `compiled from <path>` header is untrusted text — a hand-edited /
  // forged header could name `package.json` or `../../secret`, and a blind rmSync
  // would delete it. Only ever remove a `.spec.ts` that resolves INSIDE the
  // project (no `..` escape).
  const relSpec = relative(resolve(process.cwd()), specAbs);
  const isSafeSpecTarget =
    ejected.specFile.endsWith(".spec.ts") &&
    relSpec !== "" &&
    !relSpec.startsWith("..");
  if (existsSync(specAbs)) {
    if (!isSafeSpecTarget) {
      console.log(
        `  ⚠ Kept ${ejected.specFile} — the integrity header names a path that isn't a .spec.ts inside this project (it may have been hand-edited); refusing to delete it. Remove it yourself if that's intended.`,
      );
    } else if (keepSpec) {
      console.log(
        `  Kept ${ejected.specFile} (--keep-spec) — but \`vigiles compile\` would re-manage ${file}.`,
      );
    } else if (specReferencedElsewhere(ejected.specFile, file)) {
      // A multi-target spec (e.g. `target: ["CLAUDE.md", "docs/AGENTS.md"]`, or a
      // mirror) compiles to several files — possibly in other directories — that
      // all name the SAME source in their header. Deleting it while ANY of them is
      // still managed would orphan that file. So keep the spec until its last
      // consumer is ejected.
      console.log(
        `  Kept ${ejected.specFile} — another compiled file in this project is still managed by it (a multi-target / mirrored spec); deleting it would orphan that file. Eject the others too, or remove the spec by hand once it's unused.`,
      );
    } else {
      rmSync(specAbs);
      console.log(`  Removed ${ejected.specFile} (the spec that managed it).`);
    }
  }
  // The disable marker is only added to instruction files (not skills/agents),
  // so only mention it when it was actually written.
  if (ejected.markdown.startsWith(REQUIRE_INSTRUCTIONS_SPEC_DISABLE)) {
    console.log(
      `  Left a \`${REQUIRE_INSTRUCTIONS_SPEC_DISABLE}\` marker so \`vigiles lint\` won't ask for a spec; delete it if you remove vigiles entirely.`,
    );
  }
}

/**
 * Whether another compiled markdown file ANYWHERE under the project still carries
 * an integrity header naming `specFile` — i.e. the spec has OTHER compiled outputs
 * (a multi-target `target: [...]` spec or a CLAUDE.md⇄AGENTS.md mirror, possibly
 * in a different directory like `docs/AGENTS.md`), so removing it would orphan
 * them. Walks the project tree from cwd, skipping heavy/irrelevant dirs; the
 * ejected file itself is skipped (its header was already stripped). Matches on the
 * RESOLVED spec path (not basename), so two unrelated specs that happen to share a
 * filename — `src/CLAUDE.md.spec.ts` vs `CLAUDE.md.spec.ts`, common in a monorepo —
 * don't collide; genuine sibling outputs of one compile carry the identical
 * recorded spec path. Best-effort: an unreadable file is ignored.
 */
function specReferencedElsewhere(
  specFile: string,
  ejectedFile: string,
): boolean {
  const root = resolve(process.cwd());
  const ejectedAbs = resolve(root, ejectedFile);
  const specAbs = resolve(root, specFile);
  const SKIP = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
  ]);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) stack.push(p);
        continue;
      }
      if (!e.name.endsWith(".md") || p === ejectedAbs) continue;
      try {
        const header = parseIntegrityHeader(readFileSync(p, "utf-8"));
        if (header && resolve(root, header.specFile) === specAbs) return true;
      } catch {
        /* unreadable file — skip */
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

/** Full GitHub Actions workflow that wires the production `zernie/vigiles@v1`
 * Action (lint pillar) and, when the test pillar is set up, a deterministic
 * harness job. */
function vigilesWorkflow(plan: SetupPlan): string {
  const harness = plan.test
    ? `
  harness:
    # Test pillar — run your *.harness.{mjs,ts} tests against the real agent CLI and
    # a scripted mock model (deterministic, no API key). Drop this job if you only
    # author runHook unit tests, or keep it for the deterministic tier.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install
      - run: npm i -g @anthropic-ai/claude-code # mock tier needs the binary, no API key
      - run: npx vigiles test
`
    : "";
  return `name: vigiles
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write # for the sticky PR comment

jobs:
  lint:
    # Lint pillar — verify the references in your instruction files (composite
    # Action over the published CLI). Posts a sticky PR comment + a \`valid\` output.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: zernie/vigiles@v1
${harness}`;
}

/**
 * Detect a workflow that drives vigiles through an OLD API — a bare `npx vigiles`
 * (a no-op help screen in v2+) rather than the `zernie/vigiles@` Action or a real
 * subcommand (`lint`/`test`/…). Upgrading users whose workflow predates the
 * subcommand split silently lose CI validation, so we flag it loudly.
 */
function workflowUsesStaleApi(content: string): boolean {
  if (content.includes("zernie/vigiles@")) return false; // uses the Action — fine
  if (!/\bvigiles\b/.test(content)) return false; // not a vigiles workflow
  const hasModernCmd =
    /vigiles\s+(lint|test|eval|compile|audit|generate-types|generate-schema|init)\b/.test(
      content,
    );
  return !hasModernCmd;
}

/**
 * Subcommands removed/renamed across majors → the replacement to suggest. A
 * workflow that still calls one is a silently-broken CI step (the removed
 * subcommand exits non-zero / no-ops), and this stays true even when the file
 * ALSO uses the Action or a modern command — so it is checked independently of
 * the bare-API heuristic above, which an Action reference short-circuits.
 */
const REMOVED_SUBCOMMANDS: Record<string, string> = {
  scan: "audit", // renamed: the Lighthouse report verb is `audit`
};

/** The first removed/renamed `vigiles <sub>` a workflow still calls, if any. */
function workflowRemovedSubcommand(
  content: string,
): { sub: string; replacement: string } | null {
  for (const [sub, replacement] of Object.entries(REMOVED_SUBCOMMANDS)) {
    if (new RegExp(`vigiles\\s+${sub}\\b`).test(content))
      return { sub, replacement };
  }
  return null;
}

/** Rewrite removed/renamed `vigiles <sub>` invocations in place (scan → audit).
 * Surgical — preserves the rest of the user's workflow. */
function rewriteRemovedSubcommands(content: string): string {
  let out = content;
  for (const [sub, replacement] of Object.entries(REMOVED_SUBCOMMANDS)) {
    out = out.replace(
      new RegExp(`(vigiles\\s+)${sub}\\b`, "g"),
      `$1${replacement}`,
    );
  }
  return out;
}

/** Create `.github/workflows/vigiles.yml`. Returns the files it wrote (for the
 * commit hint). An existing workflow is never clobbered unless `--force`, but a
 * STALE one (old bare-`npx vigiles` API, or a removed subcommand) is reported
 * loudly instead of silently skipped — and rewritten in place with `--force`. */
function wireGha(plan: SetupPlan): string[] {
  const dir = resolve(process.cwd(), ".github", "workflows");
  const path = resolve(dir, "vigiles.yml");
  const rel = ".github/workflows/vigiles.yml";
  if (existsSync(path)) {
    const content = readFileSync(path, "utf-8");
    const removed = workflowRemovedSubcommand(content);
    if (removed) {
      if (plan.force) {
        writeFileSync(path, rewriteRemovedSubcommands(content));
        console.log(
          `✓ Rewrote ${rel} (vigiles ${removed.sub} → ${removed.replacement})`,
        );
        return [rel];
      }
      console.log(
        `⚠ ${rel} is STALE — it runs \`vigiles ${removed.sub}\`,\n` +
          `  which was removed/renamed (now \`vigiles ${removed.replacement}\`). That CI\n` +
          "  step is silently broken. Fix it:\n" +
          `    - re-run \`vigiles init --force\` to rewrite it in place (vigiles ${removed.sub} → ${removed.replacement}), or\n` +
          "    - switch the run step to `uses: zernie/vigiles@v1` (the composite Action).",
      );
    } else if (workflowUsesStaleApi(content)) {
      if (plan.force) {
        writeFileSync(path, vigilesWorkflow(plan));
        console.log(`✓ Regenerated ${rel} (was a stale bare \`npx vigiles\`)`);
        return [rel];
      }
      console.log(
        `⚠ ${rel} is STALE — it runs a bare \`npx vigiles\`,\n` +
          "  which is a no-op help screen now. CI is silently not validating anything. Fix it:\n" +
          "    - re-run `vigiles init --force` to regenerate the workflow, or\n" +
          "    - replace its run step with `uses: zernie/vigiles@v1` + `run: npx vigiles test`.",
      );
    } else {
      console.log(`✓ ${rel} already exists (up to date)`);
    }
    return [];
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, vigilesWorkflow(plan));
  console.log(
    "✓ Created .github/workflows/vigiles.yml (uses zernie/vigiles@v1)",
  );
  return [".github/workflows/vigiles.yml"];
}

const STARTER_HARNESS = `/**
 * Starter harness test (Pillar 2) — scaffolded by \`vigiles init\`.
 * Proves a hook actually FIRES, deterministically and with no API key.
 *
 *   npm i -D vigiles          # the testing API this imports
 *   npx vigiles test          # or: node vigiles.harness.mjs
 *
 * Guide: https://github.com/zernie/vigiles/blob/main/docs/harness-testing.md
 */
import { runHook } from "vigiles/testing";
import assert from "node:assert/strict";

// EXAMPLE — replace with one of YOUR hooks. This PreToolUse Bash guard blocks a
// destructive command; runHook pipes it a fake event and checks the decision.
const guard =
  \`CMD=$(cat | jq -r '.tool_input.command // empty'); \` +
  \`case "$CMD" in *"rm -rf /"*) echo blocked >&2; exit 2 ;; esac; exit 0\`;

const blocked = runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "rm -rf / --no-preserve-root" },
});
assert.ok(blocked.blocked, "guard should block \\\`rm -rf /\\\`");

const allowed = runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "ls -la" },
});
assert.ok(!allowed.blocked, "guard should allow a safe command");

console.log("\\u2713 hook blocks rm -rf / and allows safe commands");
`;

/** Pillar 2 — scaffold a starter harness test the user adapts to their hooks.
 * Returns the files it wrote (for the commit hint). */
function scaffoldPillar2(): string[] {
  const path = resolve(process.cwd(), "vigiles.harness.mjs");
  if (existsSync(path)) {
    console.log("✓ vigiles.harness.mjs already exists");
    return [];
  }
  writeFileSync(path, STARTER_HARNESS);
  console.log(
    "✓ Scaffolded vigiles.harness.mjs — Pillar 2 starter (npx vigiles test)",
  );
  return ["vigiles.harness.mjs"];
}

/** Interactive prompts (TTY only): the readline IO shell over the pure
 *  `collectSetupAnswers` (the Q&A logic is unit-tested in setup-plan.test.ts). */
async function promptSetup(): Promise<SetupAnswers> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask: AskFn = (q, def) =>
    new Promise((res) => {
      rl.question(q, (a) => {
        res(a.trim() || def);
      });
    });
  try {
    return await collectSetupAnswers(ask);
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Project detection for setup wizard
// ---------------------------------------------------------------------------

interface DetectedProject {
  /** Instruction files found (with or without specs). */
  instructionFiles: { path: string; hasSpec: boolean; isSymlink: boolean }[];
  /** Agent tools detected. */
  agents: string[];
  /** Sync tools detected in package.json. */
  syncTools: string[];
  /** Non-markdown agent config files. */
  otherConfigs: string[];
  /** Whether Claude Code project config exists. */
  hasClaude: boolean;
}

const KNOWN_INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md"];
const KNOWN_OTHER_CONFIGS: Record<string, string> = {
  ".cursorrules": "Cursor",
  ".github/copilot-instructions.md": "GitHub Copilot",
  ".windsurfrules": "Windsurf",
};
const KNOWN_SYNC_TOOLS = [
  "rule-porter",
  "rulesync",
  "vibe-cli",
  "@nichochar/rule-porter",
];

function detectProject(): DetectedProject {
  const cwd = process.cwd();
  const instructionFiles: DetectedProject["instructionFiles"] = [];
  const agents: string[] = [];
  const otherConfigs: string[] = [];

  // Check known instruction files
  for (const f of KNOWN_INSTRUCTION_FILES) {
    const full = resolve(cwd, f);
    if (existsSync(full)) {
      let isSymlink = false;
      try {
        isSymlink = lstatSync(full).isSymbolicLink();
      } catch {
        // ignore
      }
      const hasSpec = existsSync(resolve(cwd, `${f}.spec.ts`));
      instructionFiles.push({ path: f, hasSpec, isSymlink });
    }
  }

  // Detect agents from files
  if (
    instructionFiles.some((f) => f.path === "CLAUDE.md") ||
    existsSync(resolve(cwd, ".claude"))
  ) {
    agents.push("Claude Code");
  }
  if (instructionFiles.some((f) => f.path === "AGENTS.md")) {
    agents.push("Codex / GitHub Copilot");
  }

  // Check non-markdown configs
  for (const [path, agent] of Object.entries(KNOWN_OTHER_CONFIGS)) {
    if (existsSync(resolve(cwd, path))) {
      otherConfigs.push(`${path} (${agent})`);
      if (!agents.includes(agent)) agents.push(agent);
    }
  }

  // Check for sync tools in package.json
  const syncTools: string[] = [];
  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      for (const tool of KNOWN_SYNC_TOOLS) {
        if (tool in allDeps) syncTools.push(tool);
      }
    } catch {
      // ignore
    }
  }

  return {
    instructionFiles,
    agents,
    syncTools,
    otherConfigs,
    hasClaude: existsSync(resolve(cwd, ".claude")),
  };
}

/** What Pillar-1 setup produced. */
interface Pillar1Result {
  /** Spec targets to mention in the summary (e.g. CLAUDE.md). */
  specTargets: string[];
  /** Files actually written (for the commit hint). */
  written: string[];
  /** Existing hand-written targets `init` faithfully adopted into a spec (the
   *  compiled output replaced them — the user reviews the diff). */
  adopted: string[];
}

/** The instruction-file targets Pillar 1 will create specs for — the harness's
 * native instruction file (CLAUDE.md for Claude Code, AGENTS.md for Codex),
 * plus any existing instruction file that lacks a spec. */
function determineTargets(
  detected: DetectedProject,
  targetValue: string | undefined,
  harnesses: string[],
): string[] {
  if (targetValue) return [targetValue];
  const targets: string[] = [];
  if (harnesses.includes("claude")) targets.push("CLAUDE.md");
  if (harnesses.includes("codex")) targets.push("AGENTS.md");
  if (targets.length === 0) targets.push("CLAUDE.md");
  // Any existing instruction file without a spec also gets one.
  for (const f of detected.instructionFiles) {
    if (!f.hasSpec && !targets.includes(f.path)) targets.push(f.path);
  }
  return targets;
}

/**
 * When CLAUDE.md and AGENTS.md are ONE artifact — a symlink, or kept
 * byte-identical by rulesync/Ruler — collapse them to a single canonical spec
 * target. Two specs would fight over one file and collide on the integrity hash
 * (see the "Compose With Sync Tools" rule). The mirror is distributed from the
 * canonical, not compiled separately.
 */
function collapseMirroredTargets(
  targets: string[],
  mirror: InstructionMirror | null,
): string[] {
  if (!mirror) return targets;
  // The compile source slot: the real file for a symlink, else CLAUDE.md (the
  // one Claude Code reads natively; the sync tool fans out to AGENTS.md).
  const canonical =
    mirror.kind === "symlink"
      ? (mirror.realTarget ?? "CLAUDE.md")
      : "CLAUDE.md";
  const mirrored = mirror.files.find((f) => f !== canonical);
  if (!mirrored) return targets;
  if (!targets.includes(canonical) && !targets.includes(mirrored)) {
    return targets; // neither file is a target — nothing to collapse
  }
  const collapsed = targets.filter((t) => t !== mirrored);
  if (!collapsed.includes(canonical)) collapsed.push(canonical);
  console.log(
    `Note: CLAUDE.md and AGENTS.md are one artifact (${mirror.kind}). ` +
      `Scaffolding a single spec for ${canonical}; ${mirrored} is its mirror ` +
      `(don't add a second spec — it would collide on the integrity hash).`,
  );
  return collapsed;
}

/**
 * When a detected rule-sync tool (rulesync / Ruler) regenerates a file vigiles
 * would compile to, REDIRECT the compile target to the tool's source slot
 * (`.ruler/AGENTS.md`, `.rulesync/rules/vigiles.md`). vigiles compiles upstream;
 * the tool distributes to CLAUDE.md/AGENTS.md/Cursor/… — so the integrity hash
 * never collides with the tool's output (the "Compose With Sync Tools" rule).
 */
function redirectSyncToolTargets(cwd: string, targets: string[]): string[] {
  const collisions = composeCollisions(cwd, targets);
  if (collisions.length === 0) return targets;
  const slotFor = new Map(collisions.map((c) => [c.target, c.redirectTo]));
  const out: string[] = [];
  for (const t of targets) {
    const redirected = slotFor.get(t) ?? t;
    if (!out.includes(redirected)) out.push(redirected);
  }
  const tool = collisions[0].tool;
  const slots = [...new Set(collisions.map((c) => c.redirectTo))].join(", ");
  const from = [...slotFor.keys()].join(", ");
  console.log(
    `Note: ${tool} detected — scaffolding the spec to compile into its source ` +
      `slot (${slots}) instead of ${from}, so ${tool} distributes it without ` +
      `staling the integrity hash.`,
  );
  return out;
}

/** Pillar 1 — specs + types + schema + compile. Scaffolds a spec for every
 * instruction file (so `--lint` always delivers a spec), but never compiles
 * OVER a hand-written file — that is left to the adopt-spec skill. */
async function setupPillar1(
  detected: DetectedProject,
  targetValue: string | undefined,
  harnesses: string[],
): Promise<Pillar1Result> {
  const cwd = process.cwd();
  const written: string[] = [];
  const adopted: string[] = [];
  // An explicit --target is honoured as-is; otherwise collapse a CLAUDE.md⇄
  // AGENTS.md mirror (symlink or synced) to one canonical spec, then redirect
  // into a sync tool's source slot when one would own the output.
  const instructionTargets = targetValue
    ? determineTargets(detected, targetValue, harnesses)
    : redirectSyncToolTargets(
        cwd,
        collapseMirroredTargets(
          determineTargets(detected, targetValue, harnesses),
          detectInstructionMirror(cwd),
        ),
      );
  // Bare `init` (no explicit --target) also adopts every existing skill +
  // subagent surface — "create all the specs it can", not just the instruction
  // file. An explicit --target stays scoped to that one surface.
  const targets = targetValue
    ? instructionTargets
    : [...instructionTargets, ...discoverAdoptableSurfaces(cwd)];

  // Create specs. An existing hand-written target is faithfully ADOPTED into a
  // spec (scaffoldSpec() does the convert), not clobbered with a blank one — so the
  // compile below reproduces it (the user reviews the diff). A greenfield target
  // gets a blank starter spec.
  for (const target of targets) {
    const specPath = `${target}.spec.ts`;
    const targetAbs = resolve(cwd, target);
    const willAdopt =
      existsSync(targetAbs) &&
      !targetHasHash(targetAbs) &&
      !existsSync(resolve(cwd, specPath));
    if (existsSync(resolve(cwd, specPath))) {
      console.log(`✓ ${specPath} already exists`);
    } else {
      scaffoldSpec(["--target=" + target]); // adopts existing content, else blank scaffold
      written.push(specPath);
      if (willAdopt) adopted.push(target);
    }
  }

  // Generate types + schema.
  console.log("\nScanning linters and project files...");
  const typesResult = generateTypes({ basePath: cwd });
  const outDir = resolve(cwd, ".vigiles");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(cwd, ".vigiles/generated.d.ts"), typesResult.dts);
  for (const l of typesResult.linters) {
    console.log(`  ${l.linter}: ${String(l.rules.length)} rules`);
  }
  if (typesResult.scripts.length > 0) {
    console.log(`  npm scripts: ${String(typesResult.scripts.length)}`);
  }
  console.log("✓ Generated .vigiles/generated.d.ts");
  written.push(".vigiles/generated.d.ts");

  const schemaResult = generateSchema({
    basePath: cwd,
    linters: loadConfig().linters,
  });
  writeFileSync(resolve(cwd, ".vigiles/schema.json"), schemaResult.json);
  console.log("✓ Generated .vigiles/schema.json (YAML-LSP frontmatter schema)");
  written.push(".vigiles/schema.json");

  // Compile — but NEVER overwrite an existing hand-written file during `init`:
  // we compile only GREENFIELD targets (the file doesn't exist yet) and targets
  // we already manage (carry our hash). An ADOPTED file is left untouched — the
  // user reviews the generated spec and runs `vigiles compile` themselves to
  // switch it to spec-managed (non-destructive by default; the compile is
  // byte-faithful, but it's the user's call to make, with a diff to review).
  // And we only compile when `vigiles` actually resolves — a fresh repo hasn't
  // run `npm install` yet, so compiling would just error; defer it with a clear
  // next step instead of a scary stack-traceless "failed to load".
  const canCompile = canResolveVigiles(cwd);
  const specs = canCompile
    ? findSpecs().filter((s) => {
        const tf = resolve(cwd, s.replace(/\.spec\.ts$/, ""));
        return !existsSync(tf) || targetHasHash(tf);
      })
    : [];
  if (specs.length > 0) {
    console.log("\nCompiling specs...");
    await compile(specs, loadConfig());
  } else if (!canCompile) {
    // Honest, project-type-aware guidance. A JS repo just needs `npm install`
    // (init already added the devDep). A repo with NO package.json (Python, Rust,
    // …) can't resolve the npm package at all, so point at the no-install paths
    // instead of a misleading `npm install`.
    if (existsSync(resolve(cwd, "package.json"))) {
      console.log(
        "\n  Skipping compile — run `npm install` (to fetch the vigiles dep just added), then `npx vigiles compile`.",
      );
    } else {
      console.log(
        "\n  No package.json here, so the typed-spec compile isn't available yet.\n" +
          "  • `npx vigiles lint` verifies your instruction files right now — no install needed.\n" +
          "  • To spec-manage them, add a package.json first: `npm init -y && npm i -D vigiles`, then `npx vigiles compile`.",
      );
    }
  }

  return { specTargets: targets, written, adopted };
}

/**
 * Whether `vigiles/spec` will resolve for a spec compiled from `cwd` — true when
 * vigiles is installed locally (`node_modules/vigiles`) or `cwd` IS the vigiles
 * package itself (the in-repo dogfood / a monorepo workspace). A fresh user repo
 * that hasn't run `npm install` yet returns false, so `init` defers the compile
 * instead of emitting a resolution error.
 */
function canResolveVigiles(cwd: string): boolean {
  if (existsSync(resolve(cwd, "node_modules", "vigiles"))) return true;
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(cwd, "package.json"), "utf-8"),
    ) as { name?: string };
    return pkg.name === "vigiles";
  } catch {
    return false;
  }
}

/** Whether a harness binary (`claude`, `codex`) is on PATH. */
function harnessBinaryPresent(bin: string): boolean {
  try {
    const { execSync: exec } =
      require("node:child_process") as typeof import("node:child_process");
    exec(`${bin} --version`, { stdio: "ignore", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

type InstallOutcome = "ok" | "failed" | "no-cli";

/** Run a plan's auto-install commands; classify the result. */
function runInstall(
  plan: ReturnType<typeof planPluginInstall>[number],
  exec: typeof import("node:child_process").execSync,
): InstallOutcome {
  if (plan.commands.length === 0) return "no-cli";
  try {
    for (const cmd of plan.commands) {
      exec(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
    }
    return "ok";
  } catch {
    return "failed";
  }
}

/**
 * Report a plan's outcome. On anything but success, be LOUD — when an AGENT runs
 * `init` (no human at the TTY), a quiet "Install vigiles:" hint followed by
 * `/plugin` slash commands is a trap: the agent can't run a TUI slash command,
 * so the plugin silently never installs. Surface the failure as a warning AND
 * lead with the shell-runnable CLI form (which an agent CAN run), keeping the
 * slash commands clearly labelled as the in-TUI alternative for a human.
 */
function reportInstall(
  plan: ReturnType<typeof planPluginInstall>[number],
  outcome: InstallOutcome,
): void {
  if (outcome === "ok") {
    console.log(plan.successMessage);
    for (const note of plan.notes) console.log(`  ${note}`);
    return;
  }
  console.log(
    outcome === "failed"
      ? `⚠ vigiles plugin auto-install for ${plan.harness} FAILED — the plugin (hooks + skills) is NOT installed.`
      : `⚠ vigiles plugin for ${plan.harness} was NOT installed (the ${plan.harness} CLI isn't on PATH here).`,
  );
  if (plan.commands.length > 0) {
    console.log("  Finish from a shell (an agent can run these):");
    for (const cmd of plan.commands) console.log(`    ${cmd}`);
  }
  if (plan.manualSteps.length > 0) {
    console.log("  Or inside the Claude Code TUI (a human, not an agent):");
    for (const step of plan.manualSteps) console.log(`    ${step}`);
  }
  for (const note of plan.notes) console.log(`  ${note}`);
}

/**
 * Install vigiles's skills/hooks for the chosen harness(es) via the per-harness
 * `planPluginInstall` decision — Claude Code through the GLOBAL plugin
 * marketplace (nothing vendored into the repo), Codex via AGENTS.md-direct (no
 * global store). The decision is pure and unit-tested; this is the thin IO.
 */
function installPlugins(harnesses: string[]): void {
  const { execSync: exec } =
    require("node:child_process") as typeof import("node:child_process");
  const plans = planPluginInstall(harnesses, {
    hasClaude: harnesses.includes("claude") && harnessBinaryPresent("claude"),
  });

  for (const plan of plans) {
    console.log("");
    reportInstall(plan, runInstall(plan, exec));
  }
}

/** Add/upgrade `vigiles` in the project's `devDependencies` (and move it out of
 * `dependencies` if it's there). Returns the files it wrote (for the commit
 * hint). No-op in the vigiles repo itself and when there is no package.json. */
function ensureVigilesDevDep(): string[] {
  const pkgPath = resolve(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) return [];
  let pkg: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as typeof pkg;
  } catch {
    return [];
  }
  if (pkg.name === "vigiles") return []; // don't self-depend in this repo

  const spec = vigilesDepSpec();
  let changed = false;

  // Move a stale/misplaced runtime dependency (e.g. a `github:zernie/vigiles`
  // git pin, or vigiles sitting in `dependencies`) into devDependencies.
  if (pkg.dependencies && "vigiles" in pkg.dependencies) {
    delete pkg.dependencies.vigiles;
    changed = true;
  }
  const dev = (pkg.devDependencies ??= {});
  if (dev.vigiles !== spec) {
    dev.vigiles = spec;
    changed = true;
  }
  if (!changed) return [];

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(
    `✓ Set vigiles@${spec} in devDependencies — run \`npm install\` to fetch it`,
  );
  return ["package.json"];
}

/** Which harnesses to set up: an explicit `--harness=` list, else auto-detected
 * from the repo (Claude Code / Codex), defaulting to Claude Code. */
function resolveHarnesses(
  parsed: ParsedSetupArgs,
  detected: DetectedProject,
): string[] {
  if (parsed.harness) {
    return parsed.harness
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  const set = new Set<string>();
  if (
    detected.hasClaude ||
    detected.agents.includes("Claude Code") ||
    detected.instructionFiles.some((f) => f.path === "CLAUDE.md")
  ) {
    set.add("claude");
  }
  if (
    detected.agents.includes("Codex / GitHub Copilot") ||
    detected.instructionFiles.some((f) => f.path === "AGENTS.md")
  ) {
    set.add("codex");
  }
  if (set.size === 0) set.add("claude");
  return [...set];
}

/** Print the project-detection summary line(s). */
function printDetection(detected: DetectedProject, harnesses: string[]): void {
  if (detected.agents.length > 0) {
    console.log(`Detected: ${detected.agents.join(", ")}`);
  }
  if (detected.otherConfigs.length > 0) {
    console.log(`Other agent configs: ${detected.otherConfigs.join(", ")}`);
  }
  if (detected.syncTools.length > 0) {
    console.log(`Sync tools: ${detected.syncTools.join(", ")}`);
  }
  for (const f of detected.instructionFiles) {
    if (f.isSymlink) console.log(`Note: ${f.path} is a symlink`);
  }
  console.log(`Harness: ${harnesses.join(", ")}`);
}

/** Print the closing next-steps list + an honest commit hint (only files
 * actually written this run). */
function printSetupSummary(opts: {
  plan: SetupPlan;
  strict: boolean;
  targets: string[];
  adopted: string[];
  written: string[];
}): void {
  const { plan, strict, targets, adopted, written } = opts;
  const specPathsList = targets.map((t) => `${t}.spec.ts`);
  // A repo with no package.json (Python/Rust/…) can't resolve the npm package,
  // so the typed-spec compile path needs an install first — give honest steps.
  const hasPkg = existsSync(resolve(process.cwd(), "package.json"));
  console.log("\n---\nSetup complete.\n");

  // Next steps in DEPENDENCY order: install the dep first, then compile (which
  // needs it), then the optional hardening / test / CI steps.
  const nextSteps: string[] = [];
  if (written.includes("package.json")) {
    nextSteps.push("Run `npm install` to fetch the vigiles dev dependency");
  }
  if (adopted.length > 0 && !hasPkg) {
    // Non-JS repo: compile needs a local install. Point at the no-install verify
    // path + how to enable specs, instead of a compile that would fail.
    nextSteps.push(
      `Verify now with \`npx vigiles lint\` (no install). To spec-manage ${adopted.join(", ")}, add a package.json first (\`npm init -y && npm i -D vigiles\`), then \`npx vigiles compile\` and review the diff`,
    );
  } else if (adopted.length > 0) {
    // Adoption is NON-DESTRUCTIVE: the file is untouched until you compile, so
    // the diff to review is what compile WOULD produce (byte-faithful).
    nextSteps.push(
      `Run \`npx vigiles compile\` to put ${adopted.join(", ")} under spec management — it reproduces the file + adds an integrity header, so review the diff (\`vigiles eject\` reverses it)`,
    );
    nextSteps.push(
      "Run the `/strengthen` skill to upgrade prose rules to verified enforce()/guard()",
    );
  } else if (specPathsList.length > 0) {
    nextSteps.push(
      `Edit ${specPathsList.join(", ")} — add your conventions, then \`npx vigiles compile\` (and \`/strengthen\`)`,
    );
  }
  if (plan.test) {
    nextSteps.push(
      "Edit vigiles.harness.mjs to test a real hook, then `npx vigiles test`",
    );
  }
  if (!strict) {
    nextSteps.push(
      "When ready, enforce specs + tests in CI: `npx vigiles init --strict`",
    );
  }
  nextSteps.forEach((s, i) => {
    console.log(`  ${String(i + 1)}. ${s}`);
  });

  // Only list files actually written this run (deduped, in a stable order).
  const files = [...new Set(written)];
  if (files.length > 0) {
    console.log(
      `\n  Commit:\n    git add ${files.join(" ")} && git commit -m "Add vigiles"`,
    );
  }
}

async function setup(args: string[]): Promise<void> {
  const parsed = parseSetupArgs(args);

  // Plan: defaults → flags → interactive prompts (only a human at a TTY).
  let plan = resolvePlan(parsed);
  if (shouldPrompt(parsed, process.stdin.isTTY ?? false)) {
    plan = resolvePlan(parsed, await promptSetup());
  }
  // Read strict from the RESOLVED plan, not the raw flag — an interactive "yes"
  // to the workflow tier (no `--strict` flag) sets plan.strict, and the config
  // write + summary must honor it.
  const strict = plan.strict;

  const pillars = [plan.lint && "lint", plan.test && "test"]
    .filter(Boolean)
    .join(" + ");
  console.log(
    `vigiles setup${strict ? " (strict)" : ""} — pillars: ${pillars}\n`,
  );

  // Detect project.
  const detected = detectProject();
  const harnesses = resolveHarnesses(parsed, detected);
  printDetection(detected, harnesses);

  // Files actually written, accumulated for an honest commit hint.
  const written: string[] = [];

  // Lint pillar — verify instruction-file references.
  let targets: string[] = [];
  let adopted: string[] = [];
  if (plan.lint) {
    console.log("");
    const p1 = await setupPillar1(detected, parsed.target, harnesses);
    targets = p1.specTargets;
    adopted = p1.adopted;
    written.push(...p1.written);
  }

  // Test pillar — test the harness.
  if (plan.test) {
    console.log("");
    written.push(...scaffoldPillar2());
  }

  // Add/upgrade the vigiles dev dependency (both pillars import from it).
  if (plan.lint || plan.test) {
    written.push(...ensureVigilesDevDep());
  }

  // CI — the production Action (+ a harness job when Pillar 2 is on).
  if (plan.gha) {
    console.log("");
    written.push(...wireGha(plan));
  }

  // Plugin/skill install — per-harness (Claude marketplace / Codex direct).
  if (plan.plugin) {
    installPlugins(harnesses);
  }

  // Agent-specific guidance.
  if (targets.includes("AGENTS.md")) {
    console.log(
      "\n  Codex / Copilot reads AGENTS.md directly — no hooks needed.",
    );
    console.log(
      "  Run `npx vigiles compile` after spec edits. CI enforces freshness.",
    );
  }
  if (detected.otherConfigs.length > 0 && detected.syncTools.length === 0) {
    console.log(
      "\n  Non-markdown agent configs detected. Use a sync tool to convert:",
    );
    console.log("    npm install -D rule-porter");
  }

  // Project config — record the harness(es) so compile/lint select the dialect
  // deterministically (no cwd sniffing), plus strict rule severities on --strict
  // (or all-warn under --report-only).
  writeProjectConfig({
    harnesses,
    strict,
    reportOnly: parsed.reportOnly,
    lint: plan.lint,
    written,
  });

  printSetupSummary({ plan, strict, targets, adopted, written });
}

/** Canonical, de-duplicated harness list → a config value (string when one). */
function harnessConfigValue(harnesses: string[]): string | string[] {
  const canon = [...new Set(harnesses.map(normalizeHarnessName))];
  return canon.length === 1 ? canon[0] : canon;
}

/**
 * Merge the resolved harness(es) (and strict rule severities) into
 * `.vigilesrc.json` without clobbering existing keys — an existing `harness`
 * stays, a missing one is added, a malformed file is left untouched.
 */
function writeProjectConfig(opts: {
  harnesses: string[];
  strict: boolean;
  reportOnly: boolean;
  /** Lint pillar on — gates writing the lint rule severities (test-only setups
   * record only the harness). */
  lint: boolean;
  written: string[];
}): void {
  const configPath = resolve(process.cwd(), ".vigilesrc.json");
  const existed = existsSync(configPath);
  let existing: Record<string, unknown> = {};
  if (existed) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      return; // user-owned malformed config — never clobber it
    }
  }
  const merged = mergeProjectConfig(existing, {
    harness: harnessConfigValue(opts.harnesses),
    strict: opts.strict,
    reportOnly: opts.reportOnly,
    lint: opts.lint,
  });
  if (!merged) return;
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`✓ ${existed ? "Updated" : "Created"} .vigilesrc.json`);
  if (!opts.written.includes(".vigilesrc.json")) {
    opts.written.push(".vigilesrc.json");
  }
}

// ---------------------------------------------------------------------------
// Strengthen: guidance() → enforce() suggestions
// ---------------------------------------------------------------------------

function checkIntegrityForFiles(
  files: string[],
  severity: "warn" | "error",
  silent: boolean,
): number {
  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };

  let errorCount = 0;
  const basePath = process.cwd();

  for (const filePath of files) {
    const abs = resolve(basePath, filePath);
    if (!existsSync(abs)) continue;
    const result = checkIntegrity(readFileSync(abs, "utf-8"));

    if (!result.intact) {
      errorCount++;
      const marker = severity === "error" ? "✗" : "⚠";
      log(`  ${marker} ${filePath} — ${result.reason ?? "tampered"}`);
    } else if (!silent) {
      log(`  ✓ ${filePath}`);
    }
  }

  if (errorCount === 0) {
    log("  All compiled files intact.");
  }

  return severity === "error" ? errorCount : 0;
}

/**
 * Apply the per-kind `untested-skill` / `untested-subagent` / `untested-hook` rules:
 * find skills/agents/hooks with no test or eval (see src/test-coverage.ts). Each
 * kind is gated by its OWN rule severity — a kind set to `false` is not scanned;
 * "warn" prints but never fails CI; "error" fails (exit 2). Returns the raw
 * untested count plus the severity-gated error count.
 */
function checkUntestedSurfaces(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { untested: number; errors: number } {
  const rules = config?.rules;
  const skillSev = ruleSeverity(rules?.["untested-skill"]);
  const agentSev = ruleSeverity(rules?.["untested-subagent"]);
  const hookSev = ruleSeverity(rules?.["untested-hook"]);
  if (!skillSev && !agentSev && !hookSev) return { untested: 0, errors: 0 };
  const sevFor = (kind: SurfaceKind): RuleSeverity =>
    kind === "skill" ? skillSev : kind === "agent" ? agentSev : hookSev;

  // Test-discovery options (testGlobs/exclude) are shared; merge them from
  // whichever of the three rules carries them.
  const opts: TestCoverageConfig = {
    ...ruleOptions<TestCoverageConfig>(rules?.["untested-skill"]),
    ...ruleOptions<TestCoverageConfig>(rules?.["untested-subagent"]),
    ...ruleOptions<TestCoverageConfig>(rules?.["untested-hook"]),
  };
  const report = findUntestedSurfaces({
    basePath: process.cwd(),
    layout: adapter.layout,
    skills: skillSev !== false,
    agents: agentSev !== false,
    hooks: hookSev !== false,
    testGlobs: opts.testGlobs,
    exclude: opts.exclude,
  });

  if (!silent) {
    console.log("\nUntested surfaces:\n");
    for (const line of formatUntestedReport(report).split("\n")) {
      console.log(`  ${line}`);
    }
    for (const s of report.untested) {
      ghAnnotate(
        sevFor(s.kind) === "error" ? "error" : "warning",
        `${s.kind} ${s.path} ships without a test or eval`,
        s.path,
      );
    }
  }

  return {
    untested: report.untested.length,
    errors: report.untested.filter((s) => sevFor(s.kind) === "error").length,
  };
}

/**
 * A surface-scoped rule (subagent / shell-hook) is configured, but the active
 * harness doesn't have that surface. Report it as **n/a** — loud, not silent (the
 * no-silent-skips ethos): the rule isn't failing and isn't passing, it simply
 * doesn't apply to this harness. Never counts toward issues/errors.
 */
function reportNotApplicable(
  check: string,
  surface: string,
  adapter: HarnessAdapter,
  silent: boolean,
): void {
  if (silent) return;
  console.log(`\n${check}:\n`);
  console.log(`  – n/a — ${adapter.name} has no ${surface}`);
}

/**
 * Apply the `subagent-tool-contract` rule: cross-reference every subagent's `tools:`
 * rail against the harness tool catalog (the moat — "valid is not true"). Flags
 * only the HIGH-CONFIDENCE issues (a never-available tool, or a close typo) via
 * the shared `confidentToolIssues` detector — the same code `scan` and
 * `compileAgent` use (one-detector-no-drift), so a bare unrecognized tool
 * (plugin/MCP-provided) is never a false alarm. Warning by default; set
 * `subagent-tool-contract: "error"` to gate CI. Returns the issue + error counts.
 */
function checkSubagentToolContracts(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["subagent-tool-contract"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.subagents) {
    reportNotApplicable(
      "Subagent tool-contract check",
      "subagents",
      adapter,
      silent,
    );
    return { issues: 0, errors: 0 };
  }
  // Reuse the loader's already-resolved, layout+dialect-driven agents (the same
  // `scan` detector — one-detector-no-drift) instead of re-globbing a hard-coded
  // `agents/` path, so a harness with a different subagent dir Just Works.
  let agents: readonly {
    path: string;
    toolIssues: readonly { message: string }[];
  }[];
  try {
    agents = scanPlugin(process.cwd(), adapter.layout, adapter.dialect).agents;
  } catch {
    return { issues: 0, errors: 0 };
  }
  let issues = 0;
  let printedHeader = false;
  for (const agent of agents) {
    if (agent.toolIssues.length === 0) continue;
    issues += agent.toolIssues.length;
    if (!silent) {
      if (!printedHeader) {
        console.log("\nSubagent tool-contract check:\n");
        printedHeader = true;
      }
      for (const issue of agent.toolIssues) {
        console.log(
          `  ${sev === "error" ? "✗" : "⚠"} ${agent.path}: ${issue.message}`,
        );
        ghAnnotate(
          sev === "error" ? "error" : "warning",
          issue.message,
          agent.path,
        );
      }
    }
  }
  return { issues, errors: sev === "error" ? issues : 0 };
}

/**
 * Apply the `hook-events` rule: flag a hook registered under an event name the
 * harness doesn't define (a typo → the hook never fires). Reuses `scanPlugin`'s
 * `hookEventIssues` (the shared detector, high-precision: close typos only, never
 * a framework/custom event). Warning by default; "error" gates CI.
 */
function checkHookEvents(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["hook-events"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.shellHooks) {
    reportNotApplicable("Hook-event check", "shell hooks", adapter, silent);
    return { issues: 0, errors: 0 };
  }
  let found: readonly { message: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).hookEventIssues;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nHook-event check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(sev === "error" ? "error" : "warning", issue.message);
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `subagent-frontmatter` rule. Two kinds of subagent-frontmatter defect, one
 * rule: (1) a subagent MISSING a required field (`name`/`description`) — it won't
 * register; (2) a subagent with an INVALID `model:`/`color:` value (a close typo
 * of a real one) — it silently falls back / is ignored. Reuses `scanPlugin`'s
 * `frontmatterIssues` + `frontmatterValueIssues`. Warning by default; "error" gates CI.
 */
function checkFrontmatterSchema(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["subagent-frontmatter"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.subagents) {
    reportNotApplicable(
      "Subagent-frontmatter check",
      "subagents",
      adapter,
      silent,
    );
    return { issues: 0, errors: 0 };
  }
  let found: readonly { message: string; path: string }[];
  try {
    const r = scanPlugin(process.cwd(), adapter.layout, adapter.dialect);
    found = [...r.frontmatterIssues, ...r.frontmatterValueIssues];
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nFrontmatter-schema check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(
        sev === "error" ? "error" : "warning",
        issue.message,
        issue.path,
      );
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `skill-frontmatter` rule: RECOMMEND (not require) that a SKILL.md
 * declares an explicit `name` + `description` rather than relying on the
 * dir-name / first-paragraph fallbacks — a more reliable trigger surface. The
 * skill still LOADS without them, so this is a best-practice nudge: warn by
 * default; set "error" to enforce it on your own skills. Reuses `scanPlugin`'s
 * `skillMetaIssues`.
 */
function checkSkillFrontmatter(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["skill-frontmatter"]);
  if (!sev) return { issues: 0, errors: 0 };
  let found: readonly { message: string; path: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).skillMetaIssues;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nSkill-frontmatter check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(
        sev === "error" ? "error" : "warning",
        issue.message,
        issue.path,
      );
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `prefer-compiled-hooks` rule: a SINGLE repo-level recommendation
 * (one finding regardless of hook count) nudging hand-written hooks toward
 * compiled `vigiles/hook` artifacts. A discovery nudge, not a defect — the shell
 * lane stays first-class — so it fires once and the message links the guide.
 * Reuses `scanPlugin`'s `manualHookCount` (one-detector-no-drift).
 */
function checkPreferCompiledHooks(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["prefer-compiled-hooks"]);
  if (!sev) return { issues: 0, errors: 0 };
  let count: number;
  try {
    count = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).manualHookCount;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (count === 0) return { issues: 0, errors: 0 };
  const message = preferCompiledHooksMessage(count);
  if (!silent) {
    console.log("\nCompiled-hooks check:\n");
    console.log(`  ${sev === "error" ? "✗" : "ℹ"} ${message}`);
    ghAnnotate(sev === "error" ? "error" : "warning", message);
  }
  return { issues: 1, errors: sev === "error" ? 1 : 0 };
}

/**
 * Apply the `mcp-config` rule: a declared MCP server with neither a `command`
 * (stdio) nor a `url` (http/sse) can't start. Reuses `scanPlugin`'s `mcpIssues`.
 * Warning by default; "error" gates CI.
 */
function checkMcpConfig(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["mcp-config"]);
  if (!sev) return { issues: 0, errors: 0 };
  let found: readonly { message: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).mcpIssues;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nMCP-config check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(sev === "error" ? "error" : "warning", issue.message);
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `disallowed-tools-contract` rule: a subagent's `disallowedTools:`
 * block-list entry that's a close typo of a real tool blocks NOTHING — the tool
 * it was meant to deny stays available, silently. Reuses `scanPlugin`'s per-agent
 * `disallowedToolIssues` (close-typo only — high-precision). Warning by default;
 * "error" gates CI.
 */
function checkDisallowedTools(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["disallowed-tools-contract"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.subagents) {
    reportNotApplicable("Disallowed-tools check", "subagents", adapter, silent);
    return { issues: 0, errors: 0 };
  }
  let found: { message: string; path: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).agents.flatMap((a) =>
      a.disallowedToolIssues.map((i) => ({ message: i.message, path: a.path })),
    );
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nDisallowed-tools check:\n");
    for (const issue of found) {
      console.log(
        `  ${sev === "error" ? "✗" : "⚠"} ${issue.path}: ${issue.message}`,
      );
      ghAnnotate(
        sev === "error" ? "error" : "warning",
        issue.message,
        issue.path,
      );
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `frontmatter-valid` rule: a skill/agent `---` block that EXISTS but
 * isn't valid YAML — fields may not parse as intended. Reuses `scanPlugin`'s
 * `malformedFrontmatter`. HONEST caveat (see docs/rules/frontmatter-valid.md):
 * js-yaml is stricter than some loaders, so a one-line `description:` with a
 * colon / `<example>` is flagged though it may still load — hence WARN by default
 * (verify before setting "error").
 */
function checkFrontmatterValid(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["frontmatter-valid"]);
  if (!sev) return { issues: 0, errors: 0 };
  let found: readonly { message: string; path: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).malformedFrontmatter;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nFrontmatter-validity check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(
        sev === "error" ? "error" : "warning",
        issue.message,
        issue.path,
      );
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `description-overlap` rule: two model-invocable skills with
 * near-identical descriptions collide in the selector — the wrong one fires. A
 * deterministic NCD proxy for a `--trigger`-class precision bug. Reuses
 * `scanPlugin`'s `descriptionOverlaps` (calibrated FP-safe: only basically
 * identical text). Warning by default; "error" gates CI.
 */
function checkDescriptionOverlap(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["description-overlap"]);
  if (!sev) return { issues: 0, errors: 0 };
  let found: readonly { message: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).descriptionOverlaps;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nDescription-overlap check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(sev === "error" ? "error" : "warning", issue.message);
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `mcp-hook-target-resolves` rule: a `type: "mcp_tool"` hook action
 * that's incomplete (no `server`/`tool`) or targets a server the plugin doesn't
 * declare — the hook silently never dispatches. Reuses `scanPlugin`'s
 * `mcpHookIssues` (high-precision: declared-set gated, built-ins allowlisted).
 * Warning by default; "error" gates CI.
 */
function checkMcpHookTargets(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["mcp-hook-target-resolves"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.shellHooks) {
    reportNotApplicable(
      "MCP hook-target check",
      "shell hooks",
      adapter,
      silent,
    );
    return { issues: 0, errors: 0 };
  }
  let found: readonly { message: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).mcpHookIssues;
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nMCP hook-target check:\n");
    for (const issue of found) {
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${issue.message}`);
      ghAnnotate(sev === "error" ? "error" : "warning", issue.message);
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the `hook-script-exists` rule: a hook command references a script file
 * that doesn't exist on disk (with `${CLAUDE_PLUGIN_ROOT}` resolved) → the hook
 * silently never runs. Reuses `scanPlugin`'s `hooks` (status "missing"); the
 * shared resolver already excludes the FP-prone cases (unresolved vars,
 * existence-guarded one-liners, inline commands). Matches Anthropic's own
 * `claude plugin validate`. Warning by default; "error" gates CI.
 */
function checkHookScriptExists(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["hook-script-exists"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.shellHooks) {
    reportNotApplicable(
      "Hook-script existence check",
      "shell hooks",
      adapter,
      silent,
    );
    return { issues: 0, errors: 0 };
  }
  let missing: { script: string }[];
  try {
    missing = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).hooks.filter((h) => h.status === "missing");
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (missing.length > 0 && !silent) {
    console.log("\nHook-script existence check:\n");
    for (const h of missing) {
      const msg = `hook script "${h.script}" is referenced but missing — the hook never runs.`;
      console.log(`  ${sev === "error" ? "✗" : "⚠"} ${msg}`);
      ghAnnotate(sev === "error" ? "error" : "warning", msg);
    }
  }
  return {
    issues: missing.length,
    errors: sev === "error" ? missing.length : 0,
  };
}

/**
 * Apply the `mcp-tool-resolves` rule: an `mcp__server__tool` in a subagent's
 * contract whose server isn't in the plugin's declared `mcpServers` can't resolve
 * (the MCP half of the tool moat). Reuses `scanPlugin`'s per-agent `mcpToolIssues`
 * — high-precision (gated on a declared set, built-ins allowlisted, the
 * plugin-namespaced form skipped). Warning by default; "error" gates CI.
 */
function checkMcpToolResolves(
  config: VigilesConfig | undefined,
  silent: boolean,
  adapter: HarnessAdapter,
): { issues: number; errors: number } {
  const sev = ruleSeverity(config?.rules?.["mcp-tool-resolves"]);
  if (!sev) return { issues: 0, errors: 0 };
  if (!adapter.capabilities.subagents) {
    reportNotApplicable(
      "MCP tool-resolution check",
      "subagents",
      adapter,
      silent,
    );
    return { issues: 0, errors: 0 };
  }
  let found: { message: string; path: string }[];
  try {
    found = scanPlugin(
      process.cwd(),
      adapter.layout,
      adapter.dialect,
    ).agents.flatMap((a) =>
      a.mcpToolIssues.map((i) => ({ message: i.message, path: a.path })),
    );
  } catch {
    return { issues: 0, errors: 0 };
  }
  if (found.length > 0 && !silent) {
    console.log("\nMCP tool-resolution check:\n");
    for (const issue of found) {
      console.log(
        `  ${sev === "error" ? "✗" : "⚠"} ${issue.path}: ${issue.message}`,
      );
      ghAnnotate(
        sev === "error" ? "error" : "warning",
        issue.message,
        issue.path,
      );
    }
  }
  return { issues: found.length, errors: sev === "error" ? found.length : 0 };
}

/**
 * Apply the configured coverage thresholds. Returns the number of failing
 * thresholds (so the lint can fail CI when severity is "error").
 *
 * Loads specs directly via loadSpec() when the scripts threshold is set —
 * avoids depending on a pre-built `dist/` tree, which the setup-generated
 * CI step doesn't guarantee.
 */
async function checkCoverageThresholds(
  coverage: { enabled: number; documented: number },
  config: VigilesConfig | undefined,
  silent: boolean,
): Promise<number> {
  const severity = ruleSeverity(config?.rules.coverage);
  if (!severity) return 0;

  const opts = ruleOptions<CoverageThresholds>(config?.rules.coverage);
  if (!opts) return 0;

  const log = (msg: string): void => {
    if (!silent) console.log(msg);
  };

  let failing = 0;
  if (!silent) console.log("\nCoverage thresholds:\n");

  if (opts.linterRules !== undefined) {
    const pct =
      coverage.enabled > 0
        ? Math.round((coverage.documented / coverage.enabled) * 100)
        : 100;
    const ok = pct >= opts.linterRules;
    if (!ok) failing++;
    const marker = ok ? "✓" : severity === "error" ? "✗" : "⚠";
    log(
      `  ${marker} linterRules: ${String(pct)}% (threshold: ${String(opts.linterRules)}%)`,
    );
  }

  if (opts.scripts !== undefined) {
    // Load all claude specs so coverage doesn't depend on a built dist/.
    const loaded = await Promise.all(findSpecs().map(loadSpec));
    const claudeSpecs = loaded.filter(
      (s): s is ClaudeSpec => s?._specType === "claude",
    );
    const metric = computeScriptCoverage(
      process.cwd(),
      opts.scripts,
      claudeSpecs,
    );
    const ok = metric.passing;
    if (!ok) failing++;
    const marker = ok ? "✓" : severity === "error" ? "✗" : "⚠";
    log(
      `  ${marker} scripts: ${String(metric.percent)}% (threshold: ${String(opts.scripts)}%)`,
    );
  }

  return severity === "error" ? failing : 0;
}

async function countGuidanceRules(silent = false): Promise<number> {
  const specs = findSpecs();
  if (specs.length === 0) return 0;

  let count = 0;
  for (const specPath of specs) {
    const spec = await loadSpec(specPath);
    if (!spec || spec._specType !== "claude") continue;
    for (const rule of Object.values(spec.rules)) {
      if (rule._kind === "guidance") count++;
    }
  }

  if (!silent && count > 0) {
    console.log(
      `${String(count)} guidance rule(s) — run /strengthen to find enforce() upgrades\n`,
    );
  }
  return count;
}

// ---------------------------------------------------------------------------
// Command handlers for main()
// ---------------------------------------------------------------------------

function findInstructionFiles(
  restArgs: string[],
  exclude: readonly string[] = [],
): string[] {
  const patterns = ["**/CLAUDE.md", "**/AGENTS.md", "**/SKILL.md"];
  // `exclude` (from .vigilesrc.json) drops vendored/benchmark fixtures the repo's
  // own lint shouldn't police — a third-party CLAUDE.md isn't held to require-instructions-spec.
  // node_modules/dist/.git stay always-excluded.
  const ignore = [...IGNORE_NODE_MODULES, "dist/**", ".git/**", ...exclude];
  // Discover instruction files under one directory, as paths relative to cwd.
  const discoverIn = (dirAbs: string): string[] =>
    patterns
      .flatMap((p) => globSync(p, { ignore, cwd: dirAbs, absolute: true }))
      .map((abs) => relative(process.cwd(), abs));
  if (restArgs.length === 0) return discoverIn(process.cwd());
  // Explicit args: expand a DIRECTORY to the instruction files inside it (so
  // `vigiles lint .` works), keep a file arg as-is, and pass a non-existent arg
  // through unchanged (lint reports it as not-found rather than crashing).
  const out: string[] = [];
  for (const arg of restArgs) {
    const abs = resolve(process.cwd(), arg);
    if (existsSync(abs) && lstatSync(abs).isDirectory()) {
      out.push(...discoverIn(abs));
    } else {
      out.push(arg);
    }
  }
  return out;
}

/** Value of a `--flag=value` arg (the `=` form, so it never collides with a positional). */
function flagValue(args: string[], name: string): string | undefined {
  return args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * The MODEL-GATED behavioral half of `vigiles audit` (the model trigger tier; the
 * deterministic core of `audit` stays free). Loads the author-supplied per-skill
 * prompt sets (`--prompts`) and reports BOTH behavioral columns: trigger-rate (does
 * each skill actually FIRE — recall + precision) and the selection-collision matrix
 * (does one skill HIJACK a sibling's prompt — the behavioral confirmation of the
 * deterministic `description-overlap` rule). Needs the harness CLI + model auth;
 * degrades honestly ("unavailable") when absent. The OSS-testing front door:
 * `vigiles audit ./plugin --prompts=p.json` (interactive — say yes when asked).
 */
async function handleMeasure(
  restArgs: string[],
  args: string[],
): Promise<void> {
  const dir = resolve(restArgs[0] ?? ".");
  const json = args.includes("--json");
  const harnessFlag = harnessFlagFrom(args);
  const adapter = harnessFlag
    ? resolveAdapter(dir, harnessFlag)
    : detectAdapterResult(dir).adapter;
  const harness: ProbeHarness =
    adapter.name === "codex" ? "codex" : "claude-code";

  const promptsPath = flagValue(args, "--prompts");
  if (!promptsPath) {
    console.error(
      "measure needs --prompts=<file.json> (a map of skill name → { prompts, irrelevant }).",
    );
    process.exitCode = 2;
    return;
  }
  let promptSet: TriggerPromptSet;
  try {
    promptSet = JSON.parse(
      readFileSync(resolve(promptsPath), "utf-8"),
    ) as TriggerPromptSet;
  } catch (e) {
    console.error(
      `measure: could not read --prompts file "${promptsPath}": ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exitCode = 2;
    return;
  }
  const num = (f: string): number | undefined => {
    const v = flagValue(args, f);
    return v ? Number(v) : undefined;
  };
  const model = flagValue(args, "--model");
  const concurrency = num("--concurrency");
  // Trigger-rate (recall + precision) AND the selection-collision matrix — the two
  // behavioral columns, one report. Collisions report n/a where they don't apply
  // (a single skill, or Codex — no skill-selection event), never a false pass.
  const trigger = await probePluginTriggers(dir, promptSet, {
    concurrency,
    minPrompts: num("--min-prompts"),
    model,
    harness,
  });
  const collisions = await measurePluginSelection(dir, promptSet, {
    concurrency,
    trials: num("--trials"),
    model,
    harness,
  });
  if (json) {
    console.log(JSON.stringify({ trigger, collisions }, null, 2));
    return;
  }
  console.log(`\n${formatBehavioralReport(trigger)}`);
  console.log(`\n${formatSelectionReport(collisions)}`);
}

/**
 * `vigiles generate <kind>` — one verb over the three dev-toolchain generators
 * (types/schema/harness). Each emits a file YOUR editor/tsc reads, not the agent
 * — grouped under one verb instead of N hyphenated siblings (cohesive-cli-surface,
 * high-bar-for-new-commands). The kind is the first positional; the rest passes
 * through to the per-kind handler (out path / dir).
 */
async function handleGenerate(
  restArgs: string[],
  args: string[],
): Promise<void> {
  const kind = restArgs[0];
  const rest = restArgs.slice(1);
  switch (kind) {
    case "types":
      handleGenerateTypes(args, rest);
      break;
    case "schema":
      handleGenerateSchema(args, rest);
      break;
    case "harness":
      await handleGenerateHarness(args, rest);
      break;
    default:
      console.error(
        "Usage: vigiles generate <types|schema|harness> [out] [--check]",
      );
      process.exit(2);
  }
}

function handleGenerateTypes(args: string[], restArgs: string[]): void {
  const checkOnly = args.includes("--check");
  const outPath = restArgs[0] ?? ".vigiles/generated.d.ts";
  const fileGlobs = args
    .filter((a) => a.startsWith("--files="))
    .map((a) => a.split("=")[1])
    .filter(Boolean);

  console.log("Scanning project...\n");
  const result = generateTypes({
    basePath: process.cwd(),
    fileGlobs: fileGlobs.length > 0 ? fileGlobs : undefined,
  });

  for (const l of result.linters) {
    console.log(
      `  ${l.linter}: ${String(l.rules.length)} enabled rules (via ${l.via})`,
    );
  }
  if (result.scripts.length > 0) {
    console.log(`  npm scripts: ${String(result.scripts.length)}`);
  }
  console.log(`  project files: ${String(result.files.length)}`);

  const fullOut = resolve(process.cwd(), outPath);

  if (checkOnly) {
    // --check: compare against existing file, exit 1 if stale
    if (!existsSync(fullOut)) {
      console.log(
        `\n✗ ${outPath} does not exist. Run \`vigiles generate types\` to create it.`,
      );
      process.exit(1);
    }
    const existing = readFileSync(fullOut, "utf-8");
    // Normalize for formatter differences (trailing whitespace, blank lines)
    const normalize = (s: string): string =>
      s
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (normalize(existing) === normalize(result.dts)) {
      console.log(`\n✓ ${outPath} is up to date`);
    } else {
      console.log(
        `\n✗ ${outPath} is stale. Run \`vigiles generate types\` to update.`,
      );
      process.exit(1);
    }
    return;
  }

  const outDir = fullOut.substring(0, fullOut.lastIndexOf("/"));
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(fullOut, result.dts);
  console.log(`\n✓ Generated ${outPath}`);
}

function handleGenerateSchema(args: string[], restArgs: string[]): void {
  const checkOnly = args.includes("--check");
  const outPath = restArgs[0] ?? ".vigiles/schema.json";

  console.log("Scanning linters...\n");
  const result = generateSchema({
    basePath: process.cwd(),
    linters: loadConfig().linters,
  });

  for (const l of result.linters) {
    console.log(`  ${l.linter}: ${String(l.count)} rules`);
  }
  console.log(`  schema enum: ${String(result.ruleNames.length)} rule names`);

  const fullOut = resolve(process.cwd(), outPath);

  if (checkOnly) {
    if (!existsSync(fullOut)) {
      console.log(
        `\n✗ ${outPath} does not exist. Run \`vigiles generate schema\` to create it.`,
      );
      process.exit(1);
    }
    const existing = readFileSync(fullOut, "utf-8");
    if (existing.trim() === result.json.trim()) {
      console.log(`\n✓ ${outPath} is up to date`);
    } else {
      console.log(
        `\n✗ ${outPath} is stale. Run \`vigiles generate schema\` to update.`,
      );
      process.exit(1);
    }
    return;
  }

  const outDir = fullOut.substring(0, fullOut.lastIndexOf("/"));
  if (outDir && !existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(fullOut, result.json);
  console.log(`\n✓ Generated ${outPath}`);
  console.log(
    "  Add to your markdown frontmatter:\n" +
      `    # yaml-language-server: $schema=./${outPath}`,
  );
}

/**
 * `vigiles generate harness [dir] [out]` — emit one typed registry over every
 * `*.spec.ts` under `dir`, so a single `tsc --noEmit` cross-checks the whole
 * harness (dangling delegates → a tsc error; duplicate names → this command
 * exits non-zero; the capability lattice → a computed export). The third
 * generated artifact beside `generate-types` / `generate-schema`. See
 * docs/cli.md and research/whole-harness-codegen.md.
 */
/**
 * Keep an EXISTING `harness.gen.ts` fresh as a side effect of `compile`, so the
 * whole-harness registry tracks the specs without a separate manual
 * `generate-harness` run (the user almost never calls that verb by hand). Gated
 * on the file already existing: compile keeps a registry the user opted into
 * (committed like a lockfile) up to date — it never imposes one on a repo that
 * didn't ask for it. Cheap by construction: `generate-harness` only PARSES specs
 * (no linter spawning), unlike `generate-types`/`generate-schema` (which spawn
 * every linter and so stay on the config-change guard, off the hot compile path).
 * Returns false on a duplicate-name collision so it fails the compile.
 */
async function refreshHarnessGenIfPresent(
  harnessFlag: string | undefined,
): Promise<boolean> {
  const dir = process.cwd();
  const fullOut = resolve(dir, HARNESS_GEN_FILENAME);
  if (!existsSync(fullOut)) return true; // opt-in: nothing to refresh

  const adapter = harnessFlag
    ? resolveAdapter(dir, harnessFlag)
    : detectAdapterResult(dir).adapter;
  const model = await loadHarnessModel(
    dir,
    (abs) =>
      loadSpec(abs) as Promise<{
        _specType?: string;
        name?: string;
        tools?: readonly string[];
      } | null>,
  );
  const result = generateHarness(model, {
    dialect: adapter.dialect,
    outDir: dirname(fullOut),
  });
  if (result.duplicate) {
    console.log(`\n✗ ${result.duplicate.message}`);
    console.log(`::error::${result.duplicate.message}`);
    return false;
  }
  writeFileSync(fullOut, result.gen);
  console.log(
    `  ↻ refreshed ${HARNESS_GEN_FILENAME} (${String(result.agentCount)} agent(s))`,
  );
  return true;
}

async function handleGenerateHarness(
  args: string[],
  restArgs: string[],
): Promise<void> {
  const checkOnly = args.includes("--check");
  const dir = resolve(restArgs[0] ?? ".");
  const outPath = restArgs[1] ?? resolve(dir, HARNESS_GEN_FILENAME);
  const fullOut = resolve(process.cwd(), outPath);
  const specImport =
    args
      .filter((a) => a.startsWith("--spec-import="))
      .map((a) => a.split("=")[1])
      .filter(Boolean)[0] ?? undefined;

  // Resolve the harness ONCE (honour --harness / config / auto-detect) so the
  // capability lattice is computed against the right dialect — never defaulting
  // to Claude Code in core. The dialect is INJECTED into the generator.
  const harnessFlag = harnessFlagFrom(args);
  const adapter = harnessFlag
    ? resolveAdapter(dir, harnessFlag)
    : detectAdapterResult(dir).adapter;

  console.log(`Scanning ${labelFor(process.cwd(), dir)} for *.spec.ts...\n`);

  const model = await loadHarnessModel(
    dir,
    (abs) =>
      loadSpec(abs) as Promise<{
        _specType?: string;
        name?: string;
        tools?: readonly string[];
      } | null>,
  );

  const result = generateHarness(model, {
    dialect: adapter.dialect,
    outDir: dirname(fullOut),
    specImport,
  });

  console.log(
    `  ${String(result.agentCount)} agent(s), ${String(result.edgeCount)} delegate edge(s)` +
      (result.handoffCount > 0
        ? `, ${String(result.handoffCount)} handoff check(s)`
        : ""),
  );
  console.log(
    `  capabilities: ${result.capabilities.purity} (` +
      `${String(result.capabilities.sideEffecting.length)} side-effecting, ` +
      `${String(result.capabilities.unknown.length)} unknown)`,
  );

  // DUPLICATE NAME — the O(N) JS check (never a type). Exit non-zero, no write.
  if (result.duplicate) {
    console.log(`\n✗ ${result.duplicate.message}`);
    console.log(`::error::${result.duplicate.message}`);
    process.exit(2);
  }

  if (checkOnly) {
    if (!existsSync(fullOut)) {
      console.log(
        `\n✗ ${outPath} does not exist. Run \`vigiles generate harness\` to create it.`,
      );
      process.exit(1);
    }
    const existing = readFileSync(fullOut, "utf-8");
    const normalize = (s: string): string =>
      s
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (normalize(existing) === normalize(result.gen)) {
      console.log(`\n✓ ${outPath} is up to date`);
    } else {
      console.log(
        `\n✗ ${outPath} is stale. Run \`vigiles generate harness\` to update.`,
      );
      process.exit(1);
    }
    return;
  }

  const outDir = dirname(fullOut);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(fullOut, result.gen);
  console.log(`\n✓ Generated ${labelFor(process.cwd(), fullOut)}`);
  console.log(
    "  `tsc --noEmit` over this file now checks every delegate target resolves.",
  );
}

/**
 * `vigiles test` / `vigiles eval` — discover and run the two-tier harness
 * scripts (deterministic `*.harness.mjs` / real-model `*.eval.mjs`) as child
 * `node` processes, aggregating exit codes so they work as a CI command. See
 * src/run-scripts.ts.
 *
 * `vigiles test` skips clean when the `claude` CLI is absent (the deterministic
 * tier needs it, just like the node:test suite). `--trials=N` is forwarded to
 * eval scripts via the `VIGILES_TRIALS` env var.
 */
function handleRunScripts(
  kind: "test" | "eval",
  args: string[],
  restArgs: string[],
): void {
  const cwd = process.cwd();
  // Harness/eval scripts may be authored in JS or TS (see run-scripts.ts).
  const defaultGlob = scriptGlob(kind === "test" ? "harness" : "eval");

  const files = discoverScripts(restArgs, defaultGlob, cwd);

  // `--min=N`: a CI gate asserts at least N scripts actually RAN — so a bad path,
  // a renamed file, or a glob that matched nothing fails LOUD instead of passing
  // green with zero evals executed. Default 0 (off) keeps local runs ergonomic.
  const minFlag = args.find((a) => a.startsWith("--min="));
  const minRequired = minFlag
    ? Math.max(0, Number.parseInt(minFlag.split("=")[1] ?? "", 10) || 0)
    : 0;
  if (files.length < minRequired) {
    console.error(
      `✗ vigiles ${kind}: --min=${String(minRequired)} but only ${String(files.length)} ${kind} file(s) matched — ` +
        "evals never executed (check the paths/globs, or that the run was reached).",
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`No ${defaultGlob} files found.`);
    return;
  }

  // No blanket skip: unit-tier (runHook) tests need no `claude`, so always run.
  // A script whose tier DOES need `claude` self-reports `⊘ SKIPPED` (exit 77) —
  // loud, never a silent green. Just flag up front that some may skip.
  if (kind === "test" && !claudeAvailable()) {
    console.log(
      "ℹ `claude` CLI not found — unit-tier tests run; tests that need it report SKIPPED.\n",
    );
  }

  // `--trials=N` (a run knob: cost/precision, doesn't change WHAT is measured) is
  // forwarded to scripts via env. The MODEL is deliberately NOT a CLI/env knob —
  // it's part of the measurement definition, so it belongs in the spec
  // (`model` / `minModel`), version-controlled, not a hidden override.
  const trialsFlag = args.find((a) => a.startsWith("--trials="));
  const env: NodeJS.ProcessEnv = {};
  if (trialsFlag) env.VIGILES_TRIALS = trialsFlag.split("=")[1];

  console.log(`Running ${String(files.length)} ${kind} file(s):\n`);
  const results = runScripts(files, cwd, env);
  console.log("\n" + formatScriptSummary(results));

  if (anyFailed(results)) process.exit(1);

  // `--no-skip`: in a context that ASSERTS the capability is present (a CI job),
  // a skipped tier is untested surface — fail loudly instead of passing green.
  if (args.includes("--no-skip") && results.some((r) => r.status === "skip")) {
    const n = results.filter((r) => r.status === "skip").length;
    console.log(
      `\n✗ --no-skip: ${String(n)} tier(s) SKIPPED — untested surface here. ` +
        "Install the missing capability (e.g. the `claude` CLI) or scope the run.",
    );
    process.exit(1);
  }
}

/** Parse the `--harness=<name>` override out of an argv list (the one definition). */
function harnessFlagFrom(argv: string[]): string | undefined {
  return argv
    .find((a) => a.startsWith("--harness="))
    ?.slice("--harness=".length);
}

/**
 * Whole-harness capability lattice from a scanned plugin's agents (no `tools:` line →
 * inherits-all). The substrate `scan --capability-diff` diffs. Reused for both the
 * already-scanned "after" report and the freshly-scanned "before" dir.
 */
function capabilitiesOfReport(
  report: ScanReport,
  dialect: Parameters<typeof computeHarnessCapabilities>[1],
): ReturnType<typeof computeHarnessCapabilities> {
  const agents = report.agents.map((a) => ({
    name: a.name,
    tools: a.tools ?? undefined,
    file: a.path,
  }));
  return computeHarnessCapabilities(agents, dialect);
}

/**
 * The plugin's declared name for the namespaced skill id, read from the layout's
 * manifest (adapter-aware path, not a hardcoded `.claude-plugin/`), falling back to
 * the dir basename. JSON manifests only for now (a TOML/Codex manifest → basename).
 */
function pluginNameFor(dir: string, manifestPath: string): string {
  try {
    const manifest = JSON.parse(
      readFileSync(resolve(dir, manifestPath), "utf-8"),
    ) as { name?: unknown };
    if (typeof manifest.name === "string" && manifest.name)
      return manifest.name;
  } catch {
    /* missing / non-JSON manifest → fall back */
  }
  return basename(dir);
}

/** Enrich an untested Surface with the metadata the right template needs. */
/** Extract `"name": type` fields from one rendered `vigiles:ok`/`err` shape block. */
function parseContractFields(block: string): ContractField[] {
  const fields: ContractField[] = [];
  const re = /"([^"]+)"\s*:\s*(string\[\]|string|number|boolean)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    fields.push({ name: m[1], type: m[2] });
  }
  return fields;
}

/**
 * Parse a subagent's compiled `## Output contract` (the `vigiles:ok` / `vigiles:err`
 * blocks the compiler emits) back into a typed `ResultContract`, so the generator
 * can write an `assertAgentOk` test against the real fields. Returns null when the
 * agent has no result() contract.
 */
function parseResultContract(md: string): ResultContract | null {
  const ok = /```vigiles:ok\n([\s\S]*?)```/.exec(md);
  const err = /```vigiles:err\n([\s\S]*?)```/.exec(md);
  if (!ok && !err) return null;
  const okFields = ok ? parseContractFields(ok[1]) : [];
  const errFields = err ? parseContractFields(err[1]) : [];
  if (okFields.length === 0 && errFields.length === 0) return null;
  return { ok: okFields, err: errFields };
}

function scaffoldInputFor(
  s: Surface,
  report: ScanReport,
  pluginName: string,
  dir: string,
  dialect: HarnessDialect,
): ScaffoldInput {
  const base = { kind: s.kind, name: s.name, path: s.path };
  switch (s.kind) {
    case "skill": {
      const sk = report.skills.find((x) => x.name === s.name);
      return { ...base, pluginName, userInvoked: sk?.userInvoked };
    }
    case "agent": {
      const ag = report.agents.find((x) => x.name === s.name);
      const tools = ag?.tools ?? null;
      const sideEffectingTools = tools
        ? effectSurface(tools, dialect).sideEffecting
        : undefined;
      let resultContract: ResultContract | null = null;
      try {
        resultContract = parseResultContract(
          readFileSync(resolve(dir, s.path), "utf-8"),
        );
      } catch {
        // agent .md unreadable → no contract to generate against
      }
      return { ...base, tools, sideEffectingTools, resultContract };
    }
    case "hook":
      return { ...base, hookCommand: `bash ${s.path}` };
  }
}

/**
 * `vigiles scaffold-test [dir]` — generate a runnable STARTER test for each
 * untested skill/agent/hook (B1, test-gen from free-form). Reuses the
 * untested-surface detector for the list + `scan` for the metadata, then emits the
 * cheapest meaningful tier per kind (hook → `runHook`, skill → `measureTriggerRate`,
 * subagent → `runHarnessTest`) at the surface's suggested test path. Dry-run by
 * default (prints the scaffolds); `--write` creates the files (never clobbering an
 * existing one); `--json` for the agent-consumable `{ path, content }[]`.
 */
function handleScaffoldTest(restArgs: string[], args: string[]): void {
  const dir = resolve(restArgs[0] ?? ".");
  const write = args.includes("--write");
  const json = args.includes("--json");
  const harnessFlag = harnessFlagFrom(args);
  const adapter = harnessFlag
    ? resolveAdapter(dir, harnessFlag)
    : detectAdapterResult(dir).adapter;

  const { untested } = findUntestedSurfaces({
    basePath: dir,
    layout: adapter.layout,
  });
  const report = scanPlugin(dir, adapter.layout, adapter.dialect);
  const pluginName = pluginNameFor(dir, adapter.layout.manifestPath);
  const scaffolds = untested.map((s) =>
    scaffoldTest(scaffoldInputFor(s, report, pluginName, dir, adapter.dialect)),
  );

  if (json) {
    console.log(JSON.stringify(scaffolds, null, 2));
    return;
  }
  if (!write) {
    console.log(formatScaffolds(scaffolds));
    for (const s of scaffolds) {
      console.log(`\n# ${s.path}\n`);
      console.log(s.content);
    }
    if (scaffolds.length > 0) {
      console.log("Re-run with --write to create these files.");
    }
    return;
  }
  const written: string[] = [];
  const skipped: string[] = [];
  for (const s of scaffolds) {
    const target = resolve(dir, s.path);
    if (existsSync(target)) {
      skipped.push(s.path);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, s.content);
    written.push(s.path);
  }
  for (const p of written) console.log(`✓ wrote ${p}`);
  for (const p of skipped) console.log(`⊘ skipped ${p} (already exists)`);
  if (written.length === 0 && skipped.length === 0) {
    console.log("Nothing to scaffold — every surface already has a test.");
  }
}

function printUsage(command: string | undefined): void {
  console.log("vigiles — compile typed specs to instruction files");
  console.log("");
  console.log("Commands:");
  console.log(
    "  vigiles init [flags]           Setup project (--lint, --test, --harness=, --strict, --report-only, --no-gha, --force)",
  );
  console.log("  vigiles compile [files...]     Compile .spec.ts → .md");
  console.log(
    "  vigiles eject [file]           Un-manage a compiled file → plain hand-owned markdown (--keep-spec)",
  );
  console.log(
    "  vigiles lint [files...]        Verify references, find gaps in instruction files",
  );
  console.log(
    "  vigiles audit [dir...]          Lighthouse for your harness — a LOCAL report: rings + what's broken + fixes (a deterministic read; 2+ dirs → leaderboard)",
  );
  console.log(
    "                                 writes vigiles-report.html + vigiles-report.json (--no-html/--no-json) · --json for machine output. NOT a CI step — use `vigiles lint` in CI.",
  );
  console.log(
    "                                 the executing checks (run your hooks · live MCP · do skills fire?) run only interactively — `audit` asks once (remembered); automation uses the vigiles/testing API",
  );
  console.log(
    "  vigiles test [files...]        Run *.harness.mjs deterministic harness tests",
  );
  console.log(
    "  vigiles eval [files...]        Run *.eval.mjs real-model harness evals (--trials=N, --min=N, --no-skip)",
  );
  console.log(
    "  vigiles scaffold-test [dir]    Generate a starter test for each untested skill/agent/hook (--write, --json)",
  );
  console.log("");
  console.log("Examples:");
  console.log(
    "  vigiles init                 Auto-detect project, create specs, wire CI",
  );
  console.log("  vigiles compile              Compile all .spec.ts files");
  console.log(
    "  vigiles lint                 Verify references, hashes, coverage + suggestions",
  );
  console.log("");
  console.log("Plumbing:");
  console.log(
    "  vigiles generate <kind>       Emit a dev-toolchain artifact: types (.d.ts) · schema (JSON Schema) · harness (harness.gen.ts)",
  );
  console.log(
    "  vigiles generate <kind> --check  Verify the generated file is up to date",
  );
  console.log("  vigiles --version             Print the version number");
  if (command && command !== "--help") {
    console.log(`\nUnknown command: "${command}"`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Emit GitHub Actions annotations for an lint report. Skipped when --json or
 * --summary is active — those modes promise clean machine-readable stdout, and
 * ::error/::warning lines would contaminate output parsed as JSON.
 */
function annotateLintForGitHub(report: LintReport, flags: string[]): void {
  const structuredOutput =
    flags.includes("--json") || flags.includes("--summary");
  if (!isGitHubActions() || structuredOutput) return;
  if (report.hashErrors > 0) {
    ghAnnotate(
      "error",
      `${String(report.hashErrors)} compiled file(s) with stale hash — run vigiles compile`,
    );
  }
  if (report.validationErrors > 0) {
    ghAnnotate(
      "error",
      `${String(report.validationErrors)} spec validation failure(s) — see lint output`,
    );
  }
  if (report.duplicatePairs > 0) {
    ghAnnotate(
      "warning",
      `${String(report.duplicatePairs)} near-duplicate rule pair(s) detected — consider merging`,
    );
  }
}

/**
 * Run a compiled skill's deterministic gate ladder: execute each step gate in
 * order (short-circuiting on the first failure), then the result gate. This is
 * the v0 runtime — it enforces the `vigiles:gate`/`vigiles:result` markers a
 * compiled SKILL.md carries. It does not yet drive the model through the prose
 * steps (that needs a live harness).
 */
function runSkillCommand(target: string | undefined): void {
  if (!target) {
    console.error("Usage: vigiles hook-runtime run-skill <SKILL.md>");
    process.exit(2);
  }
  const path = resolve(process.cwd(), target);
  if (!existsSync(path)) {
    console.error(`Not found: ${target}`);
    process.exit(2);
  }
  const gates = parseSkillGates(readFileSync(path, "utf-8"));
  if (gates.steps.length === 0 && !gates.result) {
    console.log(`No vigiles:gate / vigiles:result markers in ${target}.`);
    return;
  }
  console.log(`Running gate ladder for ${target}:\n`);
  const report = runSkillGates(gates, process.cwd());
  for (const r of report.results) {
    const label = r.at === "result" ? "result" : `step ${String(r.at)}`;
    console.log(`  ${r.ok ? "✓" : "✗"} ${label} — ${gateLabel(r.gate)}`);
    if (!r.ok && r.output) {
      console.log(
        r.output
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n"),
      );
    }
  }
  if (report.ok) {
    console.log("\n✓ All gates passed.");
  } else {
    const where =
      report.blockedAt === "result"
        ? "the result gate"
        : `step ${String(report.blockedAt)}`;
    console.log(`\n✗ Blocked at ${where} — fix it before the skill is done.`);
    process.exit(2);
  }
}

/**
 * Stop-hook entrypoint: run the active skill's result gate and decide whether
 * the agent may stop. Exit 2 (with the reason on stderr) blocks the stop and
 * feeds the message back to the model; exit 0 allows it and clears the marker.
 */
function skillHookCommand(): void {
  const decision = evaluateStopHook(process.cwd());
  if (decision.allow) {
    if (decision.message) console.log(decision.message);
    clearActiveSkill(process.cwd());
    return;
  }
  console.error(decision.message);
  process.exit(2);
}

/** Mark a skill active so the Stop hook enforces its result gate. */
function skillStartCommand(target: string | undefined): void {
  if (!target) {
    console.error("Usage: vigiles hook-runtime skill-start <SKILL.md>");
    process.exit(2);
  }
  setActiveSkill(process.cwd(), target);
  console.log(`Active skill: ${target}`);
}

/**
 * PreToolUse-hook entrypoint: enforce the active skill's declared purity floor.
 * Reads the tool event on stdin, parses the `vigiles:purity:` marker from the
 * active skill's compiled SKILL.md, and blocks (exit 2 + reason on stderr) any
 * tool call that violates the declared floor — refining `Bash` by the live
 * command via `isReadOnlyBash`. Skills have no tools-allowlist rail; this gate
 * is purity-only. Mirrors `agentHookCommand` for skills.
 */
function skillToolHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  let tool = "";
  let command: string | undefined;
  try {
    const parsed = JSON.parse(raw) as {
      tool_name?: string;
      tool_input?: { command?: unknown };
    };
    tool = parsed.tool_name ?? "";
    if (typeof parsed.tool_input?.command === "string") {
      command = parsed.tool_input.command;
    }
  } catch {
    /* malformed input → no tool, allow */
  }
  if (!tool) return;
  const decision = evaluateSkillPreToolUse(process.cwd(), tool, command);
  if (!decision.allow) {
    console.error(decision.message);
    process.exit(2);
  }
}

/**
 * PreToolUse-hook entrypoint: enforce the active subagent's allowed-tools
 * contract. Reads the tool event on stdin, parses the active agent's compiled
 * `.md` tool rail, and blocks (exit 2 + reason on stderr) any tool outside it —
 * the deterministic boundary `tools:` alone can't provide (Claude Code #4740/#21460, SDK #172).
 */
function agentHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  let tool = "";
  let command: string | undefined;
  let event = "";
  let toolInput: unknown;
  try {
    const parsed = JSON.parse(raw) as {
      hook_event_name?: string;
      tool_name?: string;
      tool_input?: { command?: unknown };
    };
    event = parsed.hook_event_name ?? "";
    tool = parsed.tool_name ?? "";
    toolInput = parsed.tool_input;
    if (typeof parsed.tool_input?.command === "string") {
      command = parsed.tool_input.command;
    }
  } catch {
    /* malformed input → no tool, allow */
  }

  const cwd = process.cwd();

  // EXPERIMENTAL (parked P3 — do NOT auto-wire). The spawn/SubagentStop bracketing
  // is now nesting-safe: a depth-aware STACK (push on dispatch, POP on SubagentStop)
  // closes the contract-escape the flat single-slot model allowed under CC v2.1.172
  // depth-5 nesting. See research/effect-boundary-design.md + AgentWindowStack.tla.
  //
  // SubagentStop → CLOSE the window deterministically (no model `agent-done`): the
  // subagent returned, so POP its frame — control returns to its PARENT, whose
  // contract the gate enforces again (NOT a full clear, which would drop the parent).
  if (event === "SubagentStop") {
    popActiveAgent(cwd);
    clearEffectActive(cwd);
    return;
  }

  // PreToolUse(spawn) → OPEN the window deterministically (no model `agent-start` /
  // `effect-enter`): the parent is dispatching a subagent, so PUSH that subagent's
  // compiled contract for the tool calls it is about to make. Recognize both spawn
  // tool names — `Task` (top-level dispatch) and `Agent` (nested-spawn, CC v2.1.172)
  // — gated on a resolvable `subagent_type` so a non-spawn call never opens a frame.
  // The dispatch itself is the PARENT's action — don't gate it; just open + allow.
  if (tool === "Task" || tool === "Agent") {
    const agentPath = decideTaskDispatch(
      toolInput,
      cwd,
      process.env.CLAUDE_PLUGIN_ROOT,
    );
    if (agentPath) {
      pushActiveAgent(cwd, agentPath);
      setEffectActive(cwd);
    }
    return;
  }

  if (!tool) return;
  const decision = evaluatePreToolUse(cwd, tool, command);
  if (!decision.allow) {
    console.error(decision.message);
    process.exit(2);
  }
}

/**
 * `vigiles hook-runtime intercept-tool` — the PreToolUse interception hook for the
 * tool-call spy. Reads the intercept list from `VIGILES_INTERCEPT_TOOLS`, decides
 * whether the called tool should be intercepted, and if so denies the real
 * execution (exit 2) with a block message — the call is intercepted (prevented),
 * NOT executed. Allowing (return) lets the tool run for real. The model still
 * emits the `tool_use`, so its arguments land in the Trace for `toolWith` /
 * `notTool` to assert on. See src/tool-intercept.ts.
 */
function interceptToolHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  const intercepts = parseIntercepts(process.env[INTERCEPT_TOOLS_ENV] ?? "");
  const decision = interceptHookDecision(raw, intercepts);
  if (decision.intercept) {
    console.error(decision.denyReason);
    process.exit(2);
  }
}

/**
 * `vigiles hook-runtime guard` — the PreToolUse gate for typed safe-by-construction guards
 * (EXPERIMENTAL). Reads the live event on stdin, runs the declared guard set
 * (`.vigiles/guards.json`) against the session ledger (`.vigiles/guard-ledger.json`),
 * and blocks (exit 2 + reason) or records the allowed call. The command in the
 * generated hooks block IS this gate — not user shell — so the enforcement is
 * safe-by-construction. See src/core/guards.ts.
 */
function guardHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  const { decision } = runGuardHook(process.cwd(), raw);
  if (!decision.allow) {
    console.error(decision.reason ?? "Blocked by a vigiles guard.");
    process.exit(2);
  }
}

/** Mark a subagent active so the PreToolUse hook enforces its tool contract. */
function agentStartCommand(target: string | undefined): void {
  if (!target) {
    console.error("Usage: vigiles hook-runtime agent-start <agents/<name>.md>");
    process.exit(2);
  }
  pushActiveAgent(process.cwd(), target);
  console.log(`Active agent: ${target}`);
}

/** Dispatch the skill-runtime subcommands. Returns false if unrecognized. */
/**
 * `vigiles hook-runtime <kind> [args]` — the hidden umbrella for RUNTIME
 * entrypoints: the executables the harness invokes via a block `vigiles compile`
 * emits into your hooks config, NEVER typed by a human. They stay off the help
 * surface by design — verbs are typed, runtime entrypoints are emitted (the
 * cohesive-cli-surface rule). Renaming a `<kind>` breaks every already-emitted
 * block, so it is a breaking change.
 */
async function handleHookRuntime(
  kind: string | undefined,
  restArgs: string[],
): Promise<void> {
  switch (kind) {
    case "run-program":
      await runHookProgramCommand(restArgs[0]);
      return;
    case "agent":
      agentHookCommand();
      return;
    case "agent-start":
      agentStartCommand(restArgs[0]);
      return;
    case "agent-done":
      popActiveAgent(process.cwd());
      return;
    case "skill":
      skillHookCommand();
      return;
    case "skill-tool":
      skillToolHookCommand();
      return;
    case "skill-start":
      skillStartCommand(restArgs[0]);
      return;
    case "skill-done":
      clearActiveSkill(process.cwd());
      return;
    case "run-skill":
      runSkillCommand(restArgs[0]);
      return;
    case "intercept-tool":
      interceptToolHookCommand();
      return;
    case "guard":
      guardHookCommand();
      return;
    case "action":
      actionHookCommand();
      return;
    case "refs":
      refsHookCommand();
      return;
    case "effect-enter":
      setEffectActive(process.cwd());
      console.log("Effect boundary entered.");
      return;
    case "effect-exit":
      clearEffectActive(process.cwd());
      return;
    default:
      console.error(
        `vigiles hook-runtime: unknown runtime entrypoint "${kind ?? ""}". ` +
          `These are emitted into your hooks config by \`vigiles compile\` — ` +
          `you don't run them by hand.`,
      );
      process.exit(2);
  }
}

/**
 * PostToolUse-hook entrypoint for action gates. Reads the tool event on stdin,
 * runs the matching action gates from `.vigiles/action-gates.json`, and blocks
 * (exit 2 + reason on stderr) if any fails — plan-agnostic, so it works inside
 * dynamic workflows where there is no static step to attach a gate to.
 */
function actionHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  let event: { tool: string; input?: Record<string, unknown> } = { tool: "" };
  try {
    const j = JSON.parse(raw) as {
      tool_name?: string;
      tool_input?: Record<string, unknown>;
    };
    event = { tool: j.tool_name ?? "", input: j.tool_input };
  } catch {
    /* malformed input → no event, allow */
  }
  const decision = evaluateAction(
    event,
    loadActionGates(process.cwd()),
    process.cwd(),
  );
  if (!decision.allow) {
    console.error(decision.message);
    process.exit(2);
  }
}

const INSTRUCTION_FILE = /^(SKILL|CLAUDE|AGENTS)\.md$/;

function isInstructionFile(file: string): boolean {
  return INSTRUCTION_FILE.test(basename(file));
}

/**
 * PostToolUse-hook entrypoint: when the agent edits an instruction file, force
 * every code reference to carry a file-qualified mark (`path.ext#symbol`) and
 * verify the marked ones against the named file. Exit 2 (reason on stderr)
 * blocks the edit and feeds the fix back to the agent — the harness makes the
 * agent mark its references, at write time, with full context. `vigiles:ignore`
 * opts a prose span out.
 */
function refsHookCommand(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  let file = "";
  try {
    const j = JSON.parse(raw) as { tool_input?: { file_path?: string } };
    file = j.tool_input?.file_path ?? "";
  } catch {
    /* malformed → nothing to do */
  }
  if (!file || !isInstructionFile(file)) return;
  const severity = ruleSeverity(loadConfig().rules["unmarked-refs"]);
  if (severity === false) return;
  const cwd = process.cwd();
  const target = relative(cwd, resolve(cwd, file)) || file;
  let markdown: string;
  try {
    markdown = readFileSync(resolve(cwd, file), "utf-8");
  } catch {
    return;
  }
  const issues = collectRefIssues(markdown, dirname(resolve(cwd, file)));
  const action = refsHookAction(issues.length, severity);
  if (action === "ok") return;

  if (action === "block") {
    // Opt-in (`unmarked-refs: "error"`): exit 2 feeds stderr to the model.
    console.error(`vigiles: fix the code references in ${target}:`);
    for (const m of issues) console.error(`  ✗ ${m}`);
    process.exit(2);
  }

  // Default ("warn"): a non-blocking nudge injected into the agent's context.
  const context =
    `vigiles: ${target} has reference(s) that won't be verified unless they ` +
    `are vigiles marks:\n` +
    issues.map((m) => `  - ${m}`).join("\n") +
    `\nExpress references as marks (\`enforce()\` / \`file()\` / \`cmd()\` / a ` +
    `\`vigiles:symbol\` span / an inline \`<!-- vigiles:enforce -->\` comment) so ` +
    `\`vigiles lint\` can check them — or add \`<!-- vigiles:ignore -->\` if it ` +
    `is prose, not a reference.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context,
      },
    }) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Compiled hooks (`vigiles/hook`) — author a hook as a pure typed program,
// compile it to a harness block, run it as the hooks-block command.
// ---------------------------------------------------------------------------

/**
 * Load a compiled-hook program's default export. JS module formats
 * (`.mjs`/`.cjs`/`.js`) load via dynamic import directly; a TypeScript hook
 * loads only under a TS-capable runtime (tsx / Node >= 23.6) — otherwise an
 * actionable error points at authoring it as `.mjs`.
 */
async function loadHookProgram(file: string): Promise<AnyHook> {
  const abs = resolve(process.cwd(), file);
  const { pathToFileURL } = require("node:url") as typeof import("node:url");
  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(abs).href)) as { default?: unknown };
  } catch (e) {
    if (/\.(?:m|c)?ts$/.test(file)) {
      throw new HookCompileError(
        `Cannot load TypeScript hook "${file}" in this Node runtime. Run under ` +
          `tsx (npx tsx …) / Node >= 23.6, or author the hook as a .mjs file.`,
      );
    }
    throw new HookCompileError(
      `Cannot load hook "${file}": ${(e as Error).message}`,
    );
  }
  // Unwrap the ESM/CJS double-default that `export default` can produce.
  const program =
    (mod.default as { default?: unknown } | undefined)?.default ?? mod.default;
  if (!program || typeof program !== "object") {
    throw new HookCompileError(
      `${file} has no default-exported hook program ` +
        `(use \`export default defineHook({…})\`).`,
    );
  }
  return program as AnyHook;
}

/** Load a registered provider (`.vigiles/providers/<name>`) → its definition. */
async function loadProvider(file: string): Promise<RegisteredProvider> {
  const abs = resolve(process.cwd(), file);
  const { pathToFileURL } = require("node:url") as typeof import("node:url");
  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(abs).href)) as { default?: unknown };
  } catch (e) {
    throw new HookCompileError(
      `Cannot load provider "${file}": ${(e as Error).message}`,
    );
  }
  const def =
    (mod.default as { default?: unknown } | undefined)?.default ?? mod.default;
  if (
    !def ||
    typeof def !== "object" ||
    (def as { kind?: unknown }).kind !== "provider-def"
  ) {
    throw new HookCompileError(
      `${file} has no default-exported provider ` +
        `(use \`export default defineProvider({…})\`).`,
    );
  }
  return def as RegisteredProvider;
}

/**
 * Compile (validate) the registered providers under `.vigiles/providers/`: each
 * must load and be read-only unless it opted into `dangerous`. Returns the set of
 * valid provider NAMES (so a hook's `provider()` ref can resolve at compile).
 * Throws HookCompileError on an unsafe provider — the same fail-the-build contract
 * as a hook.
 */
async function compileProviders(): Promise<string[]> {
  const names: string[] = [];
  for (const file of discoverProviderFiles(process.cwd())) {
    const def = await loadProvider(file);
    if (unsafeProvider(def)) {
      throw new HookCompileError(
        `provider ${file} ("${def.run}") is not provably read-only — ` +
          `pass dangerous:true to defineProvider to acknowledge it.`,
      );
    }
    names.push(def.name);
  }
  return names;
}

/** Path of the tamper-evident stamp sidecar for a hook file. */
function hookStampPath(file: string): string {
  return resolve(process.cwd(), ".vigiles/hooks", basename(file) + ".json");
}

/** What installing one hook did — for the `compile` summary line. */
interface HookInstallResult {
  readonly role: DispatchKind;
  readonly settingsPath: string;
  /** Loud, non-CC inject/react caveat (the no-silent-skips gap). */
  readonly warning?: string;
}

/**
 * Compile ONE typed hook program (authored against `vigiles/hook`) and MERGE it
 * into the active harness's native config — the hook half of `vigiles compile`
 * (there is no `compile-hook` verb; the cohesive-cli-surface rule). An import
 * outside the sanctioned API does NOT compile (capability = API surface). The
 * emitted block routes the live event to `hook-runtime run-program`; a
 * tamper-evident stamp sidecar lets the runtime refuse a hand-edited artifact.
 * The merge is idempotent (keyed by the hook PATH), so recompiling updates in
 * place and never clobbers the user's own hooks.
 */
async function installHookFile(
  file: string,
  adapter: HarnessAdapter,
  registeredProviders: readonly string[] = [],
): Promise<HookInstallResult> {
  const source = readFileSync(resolve(process.cwd(), file), "utf-8");
  const program = await loadHookProgram(file);
  const compiled = compileHookProgram(source, program, {
    gateCommand: `npx vigiles hook-runtime run-program ${file}`,
    dialect: adapter.dialect,
    hookProtocol: adapter.hookProtocol,
    settingsFormat: adapter.layout.settingsFormat,
    registeredProviders,
  });

  // Tamper-evident stamp beside the source (one dir → basename is unique).
  mkdirSync(dirname(hookStampPath(file)), { recursive: true });
  writeFileSync(
    hookStampPath(file),
    JSON.stringify({ file, stamp: compiled.stamp }, null, 2) + "\n",
  );

  // Merge into the harness's native config, idempotently.
  const format = adapter.layout.settingsFormat;
  const settingsAbs = resolve(process.cwd(), adapter.layout.settingsPath);
  const existing: Record<string, unknown> = existsSync(settingsAbs)
    ? format === "toml"
      ? (parseToml(readFileSync(settingsAbs, "utf-8")) as Record<
          string,
          unknown
        >)
      : (JSON.parse(readFileSync(settingsAbs, "utf-8")) as Record<
          string,
          unknown
        >)
    : {};
  const merged =
    format === "toml"
      ? mergeHooksToml(existing, compiled.hooks, file)
      : mergeHooksJson(existing, compiled.hooks, file);
  mkdirSync(dirname(settingsAbs), { recursive: true });
  writeFileSync(settingsAbs, serializeConfig(merged, format));

  // Honest gap (no silent skips): the gate/deny path is exit-2 and cross-harness,
  // but an inject/react hook's OUTPUT shape is confirmed only for Claude Code. On
  // another harness it would emit CC-shaped output that may not be read — exactly
  // the silent failure this feature exists to prevent. Flag it, loudly.
  const role = dispatchKind(program);
  const warning =
    adapter.name !== "claude-code" && (role === "inject" || role === "react")
      ? `${role} output is only confirmed for Claude Code. On ${adapter.name}, ` +
        `the gate (deny→exit 2) path works, but this hook's ${role} output is ` +
        `CC-shaped and unverified — it may silently not apply. Use a gate hook on ` +
        `${adapter.name} for now, or confirm against the real binary first ` +
        `(research/compiled-hooks-codex.md §Deferred).`
      : undefined;
  return { role, settingsPath: adapter.layout.settingsPath, warning };
}

/**
 * Compile + install every hook (explicit paths, else discovered under
 * `.vigiles/hooks/`) into the active harness's config. Returns false if any
 * hook failed to compile.
 */
async function installHooks(
  hookFiles: string[],
  harnessFlag: string | undefined,
): Promise<boolean> {
  if (hookFiles.length === 0) return true;
  const adapter = harnessFlag
    ? resolveAdapter(process.cwd(), harnessFlag)
    : detectAdapterResult(process.cwd()).adapter;
  // Validate registered providers first → the names a hook's provider() ref may
  // resolve to (an unsafe provider fails the whole compile, like a bad hook).
  let registeredProviders: string[];
  try {
    registeredProviders = await compileProviders();
  } catch (e) {
    if (e instanceof HookCompileError) {
      console.error(`✗ ${e.message}`);
      return false;
    }
    throw e;
  }
  let ok = true;
  for (const file of hookFiles) {
    try {
      const r = await installHookFile(file, adapter, registeredProviders);
      console.log(
        `✓ ${file} → ${r.settingsPath} (role: ${r.role}, harness: ${adapter.name})`,
      );
      if (r.warning) console.warn(`⚠ ${r.warning}`);
    } catch (e) {
      if (e instanceof HookCompileError) {
        console.error(`✗ ${file} — ${e.message}`);
        const src = (() => {
          try {
            return readFileSync(resolve(process.cwd(), file), "utf-8");
          } catch {
            return "";
          }
        })();
        if (checkHookImports(src).length > 0) {
          console.error(
            "  A compiled hook may import ONLY `vigiles/hook` — that is its " +
              "entire capability surface.",
          );
        }
        ok = false;
      } else {
        throw e;
      }
    }
  }
  return ok;
}

/**
 * Gather a gate's DECLARED context providers (the trusted-host I/O step). Runs
 * each declared read-only command via execSync in the hook's cwd; a provider
 * that can't resolve yields its default (never throws). The pure registry +
 * decision logic live in core/hook-providers.ts — this only injects the real IO.
 */
async function gatherHookContext(
  program: AnyHook,
): Promise<Record<string, string | boolean>> {
  const needs = hookNeeds(program);
  if (needs.length === 0) return {};
  // Only load the registered-provider registry if a provider() ref is declared.
  const hasRef = needs.some(
    (n) => typeof n !== "string" && n.kind === "provider-ref",
  );
  const registry = hasRef ? await loadProviderRegistry() : {};
  const { execSync } =
    require("node:child_process") as typeof import("node:child_process");
  const { isCI } = require("ci-info") as { isCI: boolean };
  return gatherContext(
    needs,
    {
      exec: (command) =>
        execSync(command, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      cwd: process.cwd(),
      platform: process.platform,
      isCI,
    },
    registry,
  );
}

/**
 * Load the registered providers (`.vigiles/providers/`) into a name→def registry
 * for `provider()` ref resolution. A bad/unloadable provider file is skipped (the
 * ref then yields its default ""), never crashes a live session.
 */
async function loadProviderRegistry(): Promise<ProviderRegistry> {
  const registry: ProviderRegistry = {};
  for (const file of discoverProviderFiles(process.cwd())) {
    try {
      const def = await loadProvider(file);
      registry[def.name] = def;
    } catch {
      /* skip an unloadable provider file */
    }
  }
  return registry;
}

/** Append an observe-mode record to `.vigiles/hook-observations.jsonl` (best-effort). */
function recordObservation(
  file: string,
  on: string,
  would: "deny" | "ask",
  reason: string,
): void {
  try {
    const dir = resolve(process.cwd(), ".vigiles");
    mkdirSync(dir, { recursive: true });
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        hook: file,
        event: on,
        would,
        reason,
      }) + "\n";
    appendFileSync(resolve(dir, "hook-observations.jsonl"), line);
  } catch {
    /* recording is best-effort — never let it break a live session */
  }
}

/**
 * Emit a gate Decision in the harness protocol — the author never writes it.
 * `observe` mode turns a would-be block/ask into a recorded no-op (exit 0): the
 * shadow/rollout path. Harness-neutral — exit 2 / exit 0 are identical on Claude
 * Code and Codex; the record is vigiles-local.
 */
function emitGate(
  decision: Decision,
  on: string,
  mode: HookMode,
  file: string,
): void {
  const action = gateAction(decision, mode);
  switch (action.kind) {
    case "block":
      console.error(action.reason);
      process.exit(2);
      return;
    case "ask":
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: on,
            permissionDecision: "ask",
            permissionDecisionReason: action.reason,
          },
        }) + "\n",
      );
      return;
    case "observe":
      recordObservation(file, on, action.would, action.reason);
      console.error(
        `⚠ [vigiles observe] ${on}: would ${action.would} — ${action.reason}`,
      );
      return; // exit 0 — observe never blocks
    case "allow":
      return; // emit nothing, exit 0
  }
}

/**
 * Fail closed if a stamp sidecar exists and the on-disk source no longer
 * matches it — a hand-edit that smuggles in a capability breaks the stamp.
 * No sidecar → run uncompiled (e.g. a test fixture or a not-yet-compiled hook).
 */
function verifyStampOrRefuse(file: string): void {
  const stampPath = hookStampPath(file);
  if (!existsSync(stampPath)) return;
  try {
    const { stamp } = JSON.parse(readFileSync(stampPath, "utf-8")) as {
      stamp?: string;
    };
    const source = readFileSync(resolve(process.cwd(), file), "utf-8");
    if (stamp && !verifyHookStamp(source, stamp as SHA256Hash)) {
      console.error(
        `vigiles: hook ${file} does not match its compiled stamp (tampered).`,
      );
      process.exit(2);
    }
  } catch {
    /* unreadable sidecar → don't block a live session on it */
  }
}

/**
 * `vigiles hook-runtime run-program <file>` — the runtime the compiled hooks block
 * points at. Reads the live event on stdin, loads the typed program, verifies
 * its stamp, and dispatches by role: a gate exits 2 + reason on `deny`; an
 * inject prints `additionalContext`; a react runs its effect-classified
 * command. A hook that won't load fails CLOSED (exit 2), never silent-allow.
 */
async function runHookProgramCommand(file: string | undefined): Promise<void> {
  if (!file) {
    console.error("Usage: vigiles hook-runtime run-program <hook-file>");
    process.exit(2);
    return;
  }
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
  } catch {
    /* no stdin */
  }
  let event: {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: unknown;
    source?: string;
    prompt?: string;
    stop_hook_active?: boolean;
  } = {};
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    /* malformed → empty event */
  }

  let program: AnyHook;
  try {
    program = await loadHookProgram(file);
  } catch {
    console.error(`vigiles: cannot load hook program ${file}`);
    process.exit(2);
    return;
  }
  verifyStampOrRefuse(file);

  switch (dispatchKind(program)) {
    case "inject": {
      const out = runInject(program as InjectHook, { source: event.source });
      process.stdout.write(JSON.stringify(out) + "\n");
      return;
    }
    case "react": {
      const reaction = runReact(program as ReactHook, event);
      if (reaction.kind === "run") {
        const { spawnSync } =
          require("node:child_process") as typeof import("node:child_process");
        const res = spawnSync(reaction.command, {
          shell: true,
          stdio: "inherit",
        });
        process.exit(res.status ?? 0);
      }
      if (reaction.kind === "notice") console.error(reaction.message);
      return;
    }
    case "file-gate": {
      const ctx = await gatherHookContext(program);
      emitGate(
        decideFileGate(program as FileGateHook, event, ctx),
        program.on,
        hookMode(program),
        file,
      );
      return;
    }
    case "bash-gate": {
      const ctx = await gatherHookContext(program);
      emitGate(
        decideProgram(program as HookProgram, event, ctx),
        program.on,
        hookMode(program),
        file,
      );
      return;
    }
    case "prompt-gate": {
      const ctx = await gatherHookContext(program);
      emitGate(
        decidePromptGate(program as PromptGateHook, event, ctx),
        program.on,
        hookMode(program),
        file,
      );
      return;
    }
    case "stop-gate": {
      const ctx = await gatherHookContext(program);
      emitGate(
        decideStopGate(program as StopGateHook, event, ctx),
        program.on,
        hookMode(program),
        file,
      );
      return;
    }
  }
}

/**
 * Write the versioned JSON artifact (`vigiles-report.json`) — the upload/CI
 * boundary a hosted dashboard ingests. Stamps `meta.generatedAt` here (at write
 * time, not in the pure builder, so the HTML-embedded form stays deterministic).
 */
function writeAuditJson(report: AuditReport): void {
  const jsonPath = resolve(process.cwd(), "vigiles-report.json");
  const stamped: AuditReport = {
    ...report,
    meta: { ...report.meta, generatedAt: new Date().toISOString() },
  };
  try {
    writeFileSync(jsonPath, JSON.stringify(stamped, null, 2) + "\n");
    console.log("✓ Wrote vigiles-report.json — the upload/CI artifact");
  } catch (e) {
    console.log(
      `\n⚠ could not write vigiles-report.json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Best-effort open the report in the default browser (TTY-only caller). */
function openBestEffort(file: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  void import("node:child_process")
    .then(({ spawn }) => {
      const child = spawn(cmd, [file], {
        stdio: "ignore",
        detached: true,
        shell: process.platform === "win32",
      });
      child.on("error", () => undefined);
      child.unref();
    })
    .catch(() => undefined);
}

/**
 * Write the self-contained HTML audit report to `vigiles-report.html` (cwd) and,
 * for a human at a TTY, open it best-effort. The shareable Lighthouse artifact;
 * never spawns a browser for an agent / CI run.
 */
function writeAuditHtml(report: AuditReport): void {
  const htmlPath = resolve(process.cwd(), "vigiles-report.html");
  try {
    writeFileSync(htmlPath, renderAuditHtml(report));
    console.log("\n✓ Wrote vigiles-report.html — open it for the full report");
    if (process.stdout.isTTY) openBestEffort(htmlPath);
  } catch (e) {
    // No template (unbuilt checkout) or a write error — skip the HTML; the JSON
    // artifact + terminal report don't depend on it.
    console.log(
      `\n⚠ skipped vigiles-report.html: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Run the model trigger tier with no `--prompts`: auto-generate diverse probe
 * prompts from each skill's description and measure trigger-rate (recall +
 * precision) — zero-setup. `--prompts=<file>` (handled by handleMeasure)
 * overrides for a curated benchmark + the collision matrix. Model-gated: the
 * probes are deterministic, but RUNNING them needs the harness CLI + model auth
 * (degrades to "unavailable" otherwise).
 */
async function runAutoTrigger(
  dir: string,
  report: ScanReport,
  adapter: HarnessAdapter,
  args: string[],
): Promise<void> {
  const json = args.includes("--json");
  const harness: ProbeHarness =
    adapter.name === "codex" ? "codex" : "claude-code";
  const skills: PromptSkill[] = report.skills
    .filter((s) => s.hasDescription && !s.userInvoked && s.description)
    .map((s) => ({ name: s.name, description: s.description ?? "" }));
  if (skills.length === 0) {
    if (!json) {
      console.log(
        "\nℹ no model-invocable skills with a description to measure.",
      );
    }
    return;
  }
  const promptSet = autoTriggerPrompts(skills);
  if (!json) {
    console.log(
      "\nℹ auto-generated probe prompts from skill descriptions (pass --prompts=<file> for a curated set).",
    );
  }
  const trigger = await probePluginTriggers(dir, promptSet, {
    minPrompts: AUTO_RECALL_COUNT,
    minDistance: AUTO_MIN_DISTANCE,
    model: flagValue(args, "--model"),
    harness,
    // Discover candidates with the resolved adapter's layout/dialect — a Codex
    // repo's skills live under the Codex layout, not the default CC one.
    layout: adapter.layout,
    dialect: adapter.dialect,
  });
  console.log(
    json
      ? JSON.stringify({ trigger }, null, 2)
      : "\n" + formatBehavioralReport(trigger),
  );
}

/**
 * What `audit`'s executing checks (safety battery + live MCP + trigger-rate) need
 * — used to decide whether there's anything to run, and to disclose it at consent.
 */
interface ExecutableSurfaces {
  readonly hasMcp: boolean; // own-repo + declares MCP server(s)
  readonly triggerableSkills: number; // model-invocable, described skills
  // An instruction file whose refs the adoption preview can draft+verify. Harness-
  // aware: Claude Code only in v1 (drafting drives the `claude` CLI), so a bare
  // CLAUDE.md repo is consent-eligible but a Codex AGENTS.md repo isn't (it gets a
  // loud deferral note instead).
  readonly adoptableRefs: boolean;
}

/**
 * The ONE read-vs-run decision for a single-plugin `audit`. A plain `audit` is a
 * deterministic READ; the executing checks are opt-in via a single consent —
 * `decideExecute` resolves it (run / ask / skip). At a TTY we ASK ONCE (bundled,
 * with a confinement + cost DISCLOSURE) and remember the answer in `.vigilesrc.json`;
 * headless we stay a read (the `note` is the loud nudge, printed by the caller
 * AFTER the report). Never hangs an agent / CI run (`great-agent-flow`).
 *
 * Returns `execute` (run the executing checks?) + a `note` to print at the end.
 */
async function resolveExecution(
  s: ExecutableSurfaces,
  json: boolean,
  args: string[],
  harness: string,
): Promise<{ execute: boolean; note: string | null }> {
  const decision = decideExecute({
    hasExecutable: s.hasMcp || s.triggerableSkills > 0 || s.adoptableRefs,
    // A human is "interactive" only when BOTH streams are a terminal — `askOnce`
    // reads stdin, so a TTY stdout with piped/redirected stdin (agents, shell
    // pipelines) must NOT block on a read that never gets input.
    isTTY: process.stdout.isTTY && process.stdin.isTTY,
    json,
    noInteractive: args.includes("--no-interactive") || args.includes("--yes"),
    remembered: loadConfig().audit?.measure,
  });
  if (decision.kind === "run") return { execute: true, note: null };
  if (decision.kind === "skip")
    return {
      execute: false,
      note: json ? null : formatExecuteSkip(decision.reason),
    };
  // ask — prompt once, then remember the answer.
  const answer = await askOnce(buildExecuteDisclosure(s, harness));
  const yes = /^y(es)?$/i.test(answer); // default NO (executes your hooks / servers)
  rememberAuditMeasure(yes);
  return {
    execute: yes,
    note: yes
      ? null
      : "  Skipped (remembered — edit .vigilesrc.json `audit.measure` to change).",
  };
}

/** The bundled consent prompt — discloses exactly what will execute (and what it
 *  costs) so the yes is informed. Default NO. Harness-aware: a Codex repo measures
 *  via the codex CLI (not a Claude env var), so the cost wording must not falsely
 *  read "no model access" in exactly the case the prompt is meant to disclose. */
function buildExecuteDisclosure(
  s: ExecutableSurfaces,
  harness: string,
): string {
  const lines = ["\nRun the executing checks against your harness?"];
  if (s.hasMcp)
    lines.push("  · start your MCP servers — connects to their backends");
  if (s.triggerableSkills > 0) {
    lines.push(
      `  · measure whether skills fire (${triggerCostWording(harness)})`,
    );
  }
  if (s.adoptableRefs) {
    lines.push(
      `  · draft + verify your instruction file's references (${triggerCostWording(harness)})`,
    );
  }
  lines.push("Asked once — remembered in .vigilesrc.json. [y/N] ");
  return lines.join("\n");
}

/** Cost/availability wording for the trigger tier, per harness. Codex runs on the
 *  codex CLI (its own auth/plan), so it's never gated on a Claude env var. */
function triggerCostWording(harness: string): string {
  if (harness === "codex")
    return "your Codex CLI, $0 metered — skips if `codex` isn't on PATH";
  return !hasModelAccess(process.env)
    ? "needs model access — none detected, will skip"
    : isMeteredAccess(process.env)
      ? "⚠ spends API credits"
      : "your subscription, $0 metered";
}

/** Run the trigger tier: a curated `--prompts` file, else auto-generated probes. */
async function runTriggerTier(
  dir: string,
  report: ScanReport,
  adapter: HarnessAdapter,
  args: string[],
): Promise<void> {
  if (flagValue(args, "--prompts")) {
    await handleMeasure([dir], args);
  } else {
    await runAutoTrigger(dir, report, adapter, args);
  }
}

/** Ask one question on a fresh readline, closing it after (the codebase pattern). */
async function askOnce(q: string): Promise<string> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await new Promise<string>((res) => {
      rl.question(q, (a) => {
        res(a.trim());
      });
    });
  } finally {
    rl.close();
  }
}

/**
 * Persist the audit consent (`audit.measure`) into `.vigilesrc.json` without
 * clobbering existing keys — the "ask once, remember" sticky choice. Best-effort:
 * a malformed user config is left untouched, a write error is non-fatal (the
 * measurement already ran / was skipped; only the memory is lost).
 */
function rememberAuditMeasure(value: boolean): void {
  const configPath = resolve(process.cwd(), ".vigilesrc.json");
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      return; // user-owned malformed config — never clobber it
    }
  }
  const prevAudit =
    typeof existing.audit === "object" && existing.audit !== null
      ? (existing.audit as Record<string, unknown>)
      : {};
  const merged = { ...existing, audit: { ...prevAudit, measure: value } };
  try {
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
  } catch {
    /* non-fatal — the run already happened; only the remembered choice is lost */
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // `--version` / `-v` / `version` prints the version number, not the help
  // banner — so `npx vigiles --version` reports e.g. `3.0.0`.
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(getVersion());
    return;
  }

  const restArgs = args.slice(1).filter((a) => !a.startsWith("--"));
  // Shared flags (--max-rules, --catalog-only) override the loaded config so
  // every GitHub Action input maps to a real CLI flag. See src/cli-flags.ts.
  const config = applyConfigFlags(loadConfig(), args);

  switch (command) {
    // --- Primary commands ---

    case "init": {
      // Explicit --target bypasses the setup wizard and always creates a
      // bare spec, so `npx vigiles init --target=<file>` is a reliable
      // remediation for the require-instructions-spec validator. Bare `vigiles init`
      // still runs the full wizard (project detection + auto-targets).
      const hasTarget = args.some((a) => a.startsWith("--target="));
      if (hasTarget) {
        scaffoldSpec(args.slice(1));
      } else {
        await setup(args);
      }
      break;
    }

    case "compile": {
      const harnessFlag = harnessFlagFrom(args);
      // One verb compiles every typed authoring artifact: a .spec.ts → markdown,
      // a hook program → its harness config + stamp (cohesive-cli-surface). With
      // explicit args, partition by extension; bare, discover both.
      const specs =
        restArgs.length > 0
          ? restArgs.filter((f) => f.endsWith(".spec.ts"))
          : findSpecs();
      const hooks =
        restArgs.length > 0
          ? restArgs.filter((f) => !f.endsWith(".spec.ts"))
          : discoverHookFiles(process.cwd());
      if (specs.length === 0 && hooks.length === 0) {
        console.log("No .spec.ts or .vigiles/hooks/ hook files found.");
        console.log("Run `vigiles init` to create one.");
        process.exit(0);
      }
      let valid = true;
      if (specs.length > 0)
        valid = (await compile(specs, config, { harnessFlag })) && valid;
      valid = (await installHooks(hooks, harnessFlag)) && valid;
      // Keep an existing whole-harness registry in sync (cheap, opt-in) so the
      // user never hand-runs `generate-harness`. Skipped when no harness.gen.ts.
      if (specs.length > 0)
        valid = (await refreshHarnessGenIfPresent(harnessFlag)) && valid;
      console.log("");
      if (valid) {
        console.log("Compilation complete.");
      } else {
        console.log("Compilation complete with errors.");
        process.exit(1);
      }
      break;
    }

    case "eject":
      // Inverse of compile: un-manage a compiled file → plain hand-owned
      // markdown (the "always ejectable" escape hatch).
      eject(args.slice(1));
      break;

    case "lint": {
      // lint = verify references + discover + guidance count
      const flags = args.slice(1).filter((a) => a.startsWith("--"));
      const report = await runLint(restArgs, flags, config);
      annotateLintForGitHub(report, flags);
      const exitCode = lintExitCode(report);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
      break;
    }

    case "test":
      handleRunScripts("test", args, restArgs);
      break;

    case "eval":
      handleRunScripts("eval", args, restArgs);
      break;

    case "audit": {
      // The Lighthouse run: a plain `audit` is a deterministic READ — rings, each
      // finding's fix inline, HTML/JSON report — safe + identical on every OS,
      // nothing executes. Like Lighthouse it's a LOCAL report, NOT a CI step (CI
      // uses `vigiles lint`). The executing checks (safety battery + live MCP +
      // skill firing) run only on consent: at a TTY `audit` asks once (remembered
      // in `.vigilesrc.json`), headless it stays a read + a one-line nudge. There
      // is NO execution flag — automation tests the harness via the vigiles/testing
      // API + skills, not the report verb. See the `audit-side-effect-free` rule.
      const dirs = restArgs.length > 0 ? restArgs : ["."];
      const json = args.includes("--json");
      // A single dir that's a marketplace (e.g. wshobson/agents' 80+ plugins
      // under one marketplace.json) expands into its members and ranks them.
      const market =
        dirs.length === 1 ? inspectMarketplace(resolve(dirs[0])) : null;
      const targets =
        market && market.onDisk.length > 0 ? [...market.onDisk] : dirs;
      if (market && market.onDisk.length === 0 && market.total > 0) {
        // A CURATED marketplace — every member is an external git/url plugin, so
        // there's nothing on disk to scan. Say so honestly instead of falling
        // through to a misleading "empty machine / no structural issues" report
        // (obra/superpowers-marketplace, anthropics/claude-plugins-community).
        if (json) {
          console.log(
            JSON.stringify(
              buildMarketplaceReport(market, {
                vigilesVersion: getVersion(),
                dir: resolve(dirs[0]),
              }),
              null,
              2,
            ),
          );
        } else {
          console.log(
            `Marketplace "${market.name}": ${String(market.total)} plugin(s), all external ` +
              `(url/git sources, not on disk).\n` +
              `Nothing to scan here — clone a member plugin and scan that, or scan a ` +
              `marketplace that vendors its plugins in-tree.`,
          );
        }
      } else if (targets.length > 1) {
        // Multiple targets → rank them (the leaderboard engine). `--md` emits the
        // publishable Markdown table (a README / gist / the leaderboard site).
        const scores = rankPlugins(targets);
        const text = args.includes("--md")
          ? formatLeaderboardMarkdown(scores)
          : formatLeaderboard(scores);
        console.log(
          json
            ? JSON.stringify(
                buildLeaderboardReport(scores, {
                  vigilesVersion: getVersion(),
                  dir: resolve(dirs[0]),
                }),
                null,
                2,
              )
            : text,
        );
      } else {
        const root = resolve(targets[0]);
        const harnessFlag = harnessFlagFrom(args);
        const det = detectAdapterResult(root);
        const adapter = harnessFlag
          ? resolveAdapter(root, harnessFlag)
          : det.adapter;
        const report = scanPlugin(targets[0], adapter.layout, adapter.dialect);
        if (!json) {
          console.log(`Detected harness: ${adapter.name}`);
          if (!harnessFlag && det.ambiguousWith.length > 0) {
            console.log(
              `⚠ repo also matches: ${det.ambiguousWith.join(", ")} — override with --harness=<name>`,
            );
          }
          // Freshness: warn if our hand-maintained CC catalog drifted from the
          // user's INSTALLED claude-code (read-local, best-effort, never throws).
          if (adapter.name === "claude-code") {
            const drift = formatDialectDrift(checkDialectDrift());
            if (drift) console.log(drift);
          }
          console.log("");
        }
        // The versioned AuditReport is the product boundary — the same JSON the
        // HTML renders, `--json` emits, and (later) a hosted dashboard ingests.
        // Built ONCE; the rings + fix list are read off it. Pure deterministic —
        // nothing executes to produce it.
        // Surfaces that exist but aren't spec-managed yet — the same notion
        // `init` adopts (layout-driven instruction file + skill/subagent sweep).
        // Surfaced in the AuditReport (the report's "Create spec" command-emit
        // buttons read it) and the terminal nudge below.
        const adoptableSurfaces = discoverAdoptableForAudit(
          root,
          adapter.layout.instructionFile,
        );
        const auditReport = buildAuditReport(report, {
          harness: adapter.name,
          vigilesVersion: getVersion(),
          adoptableSurfaces,
        });
        const sc = auditReport.score;
        const plan = optimize(report);
        if (!json) {
          // The Lighthouse rings: per-category 0–100 + the weighted overall,
          // shown before the detailed report so the headline signal leads.
          console.log(formatAuditScore(sc));
          console.log("");
        }
        console.log(
          json
            ? JSON.stringify(auditReport, null, 2)
            : formatScanReport(report),
        );
        if (!json) {
          // Fold each finding's fix inline (replaces the former --fix-plan/--explain
          // flags): the deterministic, free recommendation list under the report.
          const fixes = formatRecommendations(plan);
          if (fixes) console.log("\n" + fixes);
          // Adoption nudge: surfaces that exist but aren't spec-managed yet, with
          // the create-all + per-surface `init` commands (the JSON carries the
          // data in `adoptable` instead — the terminal stays human-readable).
          const adoptNudge = formatAdoptableNudge(adoptableSurfaces);
          if (adoptNudge) console.log("\n" + adoptNudge);
          // A small behavioral nudge — the deterministic read can't tell whether
          // skills actually FIRE; point at the interactive measure + the API.
          const fireNudge = formatTriggerNudge(
            report.skills.filter((s) => s.hasDescription && !s.userInvoked)
              .length,
          );
          if (fireNudge) console.log("\n" + fireNudge);
        }
        // ONE read-vs-run decision for the EXECUTING checks (live MCP + skill
        // firing). A plain `audit` is a deterministic READ; these run only on
        // consent — ASK once at a TTY (remembered); headless stays a read + a
        // nudge (no execution flag — automation uses the vigiles/testing API).
        // (The safety battery is NOT here — it needs cross-platform confinement
        // that isn't shipped, so it lives in the vigiles/testing API.)
        const isForeign = root !== process.cwd();
        const surfaces: ExecutableSurfaces = {
          hasMcp: report.mcp && !isForeign,
          triggerableSkills: report.skills.filter(
            (s) => s.hasDescription && !s.userInvoked,
          ).length,
          adoptableRefs:
            adapter.name === "claude-code" &&
            existsSync(resolve(root, adapter.layout.instructionFile)),
        };
        const { execute, note: execNote } = await resolveExecution(
          surfaces,
          json,
          args,
          adapter.name,
        );
        // LIVE MCP tool resolution STARTS each declared MCP server — a server is
        // exactly what connects to a real Postgres / authenticates a real API on
        // boot. So it runs only under consent (`execute`) AND own-repo (never
        // spawn a stranger's server).
        if (execute && surfaces.hasMcp) {
          const mcpErrs = await verifyLiveMcpTools(
            report,
            adapter.layout,
            adapter.dialect,
          );
          console.log(
            json
              ? JSON.stringify({ mcpContractTools: mcpErrs }, null, 2)
              : "\n" + formatMcpContractReport(mcpErrs),
          );
        }
        const capBase = flagValue(args, "--capability-diff");
        if (capBase) {
          // Did this version WIDEN the agent's blast radius vs <before>? Diffs the
          // two whole-harness capability lattices (moat #2). Informational by
          // default; `--fail-on-widen` exits non-zero (the opt-in CI gate).
          const beforeReport = scanPlugin(
            resolve(capBase),
            adapter.layout,
            adapter.dialect,
          );
          const diff = diffCapabilities(
            capabilitiesOfReport(beforeReport, adapter.dialect),
            capabilitiesOfReport(report, adapter.dialect),
          );
          console.log(
            json
              ? JSON.stringify({ capabilityDiff: diff }, null, 2)
              : "\n" + formatCapabilityDiff(diff),
          );
          if (args.includes("--fail-on-widen") && diff.widened)
            process.exitCode = 1;
        }
        // The model trigger tier — "do your skills actually FIRE?" — runs as part
        // of the same consent (`execute`), and only when a model is reachable;
        // otherwise it's a one-line note (never a hang).
        if (execute && surfaces.triggerableSkills > 0) {
          // Model-access detection is per-harness: `hasModelAccess` reads Claude
          // env (claude CLI / ANTHROPIC_API_KEY). A Codex repo authenticates the
          // codex CLI instead, so we DON'T gate it on a Claude var — the Codex
          // probe checks `codexDriver.available()` internally and self-reports
          // unavailable. (harness-parity: never block Codex behind a CC check.)
          const modelReachable =
            adapter.name === "codex" || hasModelAccess(process.env);
          if (modelReachable) {
            await runTriggerTier(targets[0], report, adapter, args);
          } else if (!json) {
            console.log(
              "\nℹ skill firing not measured — no model access (authenticate the `claude` CLI or set ANTHROPIC_API_KEY).",
            );
          }
        }
        // The adoption preview — "what would vigiles catch in YOUR repo?" The model
        // DRAFTS the verifiable refs in the instruction file; the cross-ref engine
        // VERIFIES each, so "M broken right now" is trustworthy though the extraction
        // is probabilistic. Same consent as the trigger tier (`surfaces.adoptableRefs`
        // makes a bare instruction-file repo consent-eligible — the prime adoption
        // target). v1: instruction-file only; drafting drives the `claude` CLI, so
        // `adoptableRefs` is Claude Code only (the Codex deferral note is printed
        // below as a LOUD harness-parity deferral, never a silent CC-only path).
        let adoptabilityResult: AdoptabilityResult | undefined;
        if (execute && surfaces.adoptableRefs) {
          if (hasModelAccess(process.env)) {
            const instrPath = resolve(root, adapter.layout.instructionFile);
            adoptabilityResult = await runAdoptabilityTier({
              instructionContent: readFileSync(instrPath, "utf-8"),
              basePath: root,
            });
            if (!json)
              console.log(
                "\n" +
                  formatAdoptability(
                    adoptabilityResult,
                    adapter.layout.instructionFile,
                  ),
              );
          } else if (!json && surfaces.triggerableSkills === 0) {
            // Only when the trigger tier didn't already print the same note.
            console.log(
              "\nℹ adoptability not measured — no model access (authenticate the `claude` CLI or set ANTHROPIC_API_KEY).",
            );
          }
        }
        // LOUD harness-parity deferral: adoptability drafting drives the `claude`
        // CLI, so a Codex repo with an instruction file is told it's a follow-up,
        // never silently skipped (research/adoption-gateway-preview.md, increment 4).
        if (
          !json &&
          adapter.name === "codex" &&
          existsSync(resolve(root, adapter.layout.instructionFile))
        ) {
          console.log(
            "\nℹ adoptability preview (what vigiles would catch in your repo) is Claude Code only for now — Codex support is a follow-up.",
          );
        }
        // The loud read-vs-run nudge for a headless / remembered-no skip — printed
        // AFTER the report so the deterministic read leads.
        if (execNote) console.log(execNote);
        // The final report folds in the adoptability preview (when the model-gated
        // tier ran) so the written HTML/JSON carry it; a deterministic read omits it.
        const finalReport: AuditReport = adoptabilityResult
          ? { ...auditReport, adoptability: adoptabilityResult }
          : auditReport;
        // The shareable HTML report — written by default (--no-html to skip), and
        // opened best-effort only for a human at a TTY (never spawn a browser for
        // an agent / CI run).
        if (!json && !args.includes("--no-html")) {
          writeAuditHtml(finalReport);
        }
        // The versioned JSON artifact — the upload/CI boundary (a hosted dashboard
        // ingests this). Written by default in the human path; --no-json to skip.
        if (!json && !args.includes("--no-json")) {
          writeAuditJson(finalReport);
        }
      }
      break;
    }

    case "scaffold-test":
      handleScaffoldTest(restArgs, args);
      break;

    // --- Plumbing ---

    case "generate":
      await handleGenerate(restArgs, args);
      break;

    // Hidden umbrella for runtime entrypoints emitted into hooks configs — never
    // typed by a human. See handleHookRuntime / the cohesive-cli-surface rule.
    case "hook-runtime":
      await handleHookRuntime(restArgs[0], restArgs.slice(1));
      break;

    default:
      printUsage(command);
      break;
  }
}

void main();
