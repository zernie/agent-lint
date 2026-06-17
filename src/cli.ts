#!/usr/bin/env node

/**
 * vigiles CLI — compile typed specs to instruction files.
 *
 * Commands:
 *   vigiles init            — scaffold a spec from scratch
 *   vigiles compile         — compile .spec.ts → .md with linter verification
 *   vigiles lint            — verify hashes, report coverage, detect duplicates
 *   vigiles generate-types  — emit .d.ts with types from project state
 */

import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  lstatSync,
} from "node:fs";
import { resolve, dirname, basename, relative } from "node:path";
import { globSync } from "glob";
import { generateTypes } from "./core/generate-types.js";
import { validate, loadConfig } from "./core/validate.js";
import { applyConfigFlags } from "./cli-flags.js";
import {
  parseSetupArgs,
  shouldPrompt,
  resolvePlan,
  planPluginInstall,
  mergeProjectConfig,
  type SetupPlan,
  type SetupAnswers,
  type ParsedSetupArgs,
} from "./setup-plan.js";
import type {
  VigilesConfig,
  CoverageThresholds,
  TestCoverageConfig,
} from "./core/types.js";
import { ruleSeverity, ruleOptions } from "./core/types.js";
import { findUntestedSurfaces, formatUntestedReport } from "./test-coverage.js";
import { scanPlugin, formatScanReport } from "./scan.js";
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
import { skillFrontmatterDropWarnings } from "./skill-harness.js";
import { rankPlugins, formatLeaderboard } from "./leaderboard.js";

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
import {
  evaluatePreToolUse,
  setActiveAgent,
  clearActiveAgent,
} from "./adapters/claude-code/agent-runtime.js";
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
import { checkIntegrity } from "./core/integrity.js";
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
  const { markdown, errors } = compileSkill(spec, {
    basePath: process.cwd(),
    specFile: specPath,
    // The SKILL.md frontmatter profile comes from the resolved harness — a Codex
    // repo gets a minimal (name + description) SKILL.md; CC gets the full set.
    dialect,
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

/** Compile a subagent spec → agents/<name>.md (with its result-contract section). */
function compileAgentToFile(
  spec: AgentSpec,
  specPath: string,
  dialect: HarnessDialect,
): boolean {
  const outputPath = specPath.replace(/\.spec\.ts$/, "");
  const { markdown, errors } = compileAgent(spec, {
    basePath: process.cwd(),
    specFile: specPath,
    dialect,
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
          `  ✗ [require-spec] ${filePath} references "${hashMatch[1]}" but that spec no longer exists.`,
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
    // doesn't misreport a require-spec / other validation failure.
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

  const files = findInstructionFiles(restArgs);

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
  // eval. Warning by default (a nudge, exit 0); set rules.untested-surface to
  // "error" to gate CI. See src/test-coverage.ts and docs/rules/untested-surface.md.
  const untested = checkUntestedSurfaces(config, silent);

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

function init(args: string[]): void {
  const targetFlag = args.find((a) => a.startsWith("--target="));
  const target = targetFlag ? targetFlag.split("=")[1] : "CLAUDE.md";
  const specPath = `${target}.spec.ts`;

  if (existsSync(resolve(process.cwd(), specPath))) {
    console.log(`${specPath} already exists.`);
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
  const specAbs = resolve(process.cwd(), specPath);
  mkdirSync(dirname(specAbs), { recursive: true });
  writeFileSync(specAbs, template);
  console.log(`Created ${specPath} — edit it and run \`vigiles compile\`.`);
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
    /vigiles\s+(lint|test|eval|compile|scan|generate-types|generate-schema|init)\b/.test(
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
  audit: "lint", // v3 → v4 rename
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

/** Rewrite removed/renamed `vigiles <sub>` invocations in place (audit → lint).
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

/** Interactive prompts (TTY only): which pillars, CI, plugin. */
async function promptSetup(): Promise<SetupAnswers> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q: string, def: string): Promise<string> =>
    new Promise((res) => {
      rl.question(q, (a) => {
        res(a.trim() || def);
      });
    });
  const isYes = (s: string): boolean => /^y(es)?$/i.test(s);
  try {
    const pillars = (
      await ask("Set up which pillars? [both/lint/test] (both): ", "both")
    ).toLowerCase();
    const gha = isYes(await ask("Wire CI (GitHub Action)? [Y/n]: ", "y"));
    const plugin = isYes(
      await ask(
        "Install the Claude Code plugin (hooks + skills)? [Y/n]: ",
        "y",
      ),
    );
    return {
      lint: pillars !== "test",
      test: pillars !== "lint" && pillars !== "verify",
      gha,
      plugin,
    };
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
  /** Existing hand-written targets that still need migrate-to-spec. */
  needsMigration: string[];
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
 * OVER a hand-written file — that is left to the migrate-to-spec skill. */
async function setupPillar1(
  detected: DetectedProject,
  targetValue: string | undefined,
  harnesses: string[],
): Promise<Pillar1Result> {
  const cwd = process.cwd();
  const written: string[] = [];
  const needsMigration: string[] = [];
  // An explicit --target is honoured as-is; otherwise collapse a CLAUDE.md⇄
  // AGENTS.md mirror (symlink or synced) to one canonical spec, then redirect
  // into a sync tool's source slot when one would own the output.
  const targets = targetValue
    ? determineTargets(detected, targetValue, harnesses)
    : redirectSyncToolTargets(
        cwd,
        collapseMirroredTargets(
          determineTargets(detected, targetValue, harnesses),
          detectInstructionMirror(cwd),
        ),
      );

  // Create specs (blank). An existing hand-written target keeps its content —
  // we scaffold the spec but flag it for migration rather than clobbering it.
  for (const target of targets) {
    const specPath = `${target}.spec.ts`;
    const targetExists = existsSync(resolve(cwd, target));
    if (existsSync(resolve(cwd, specPath))) {
      console.log(`✓ ${specPath} already exists`);
    } else {
      init(["--target=" + target]); // prints "Created …"
      written.push(specPath);
    }
    if (targetExists && !targetHasHash(resolve(cwd, target))) {
      needsMigration.push(target);
      console.log(
        `  ${target} already has content — port it into the spec with the migrate-to-spec skill, then \`vigiles compile\`.`,
      );
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

  // Compile — but only specs whose target is greenfield or already ours. A
  // freshly-scaffolded blank spec over an existing hand-written file is skipped
  // so we never overwrite the user's instructions with an empty compile.
  console.log("\nCompiling specs...");
  const specs = findSpecs().filter((s) => {
    const tf = resolve(cwd, s.replace(/\.spec\.ts$/, ""));
    return !existsSync(tf) || targetHasHash(tf);
  });
  if (specs.length > 0) await compile(specs, loadConfig());

  return { specTargets: targets, written, needsMigration };
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
  needsMigration: string[];
  written: string[];
}): void {
  const { plan, strict, targets, needsMigration, written } = opts;
  const specPathsList = targets.map((t) => `${t}.spec.ts`);
  console.log("\n---\nSetup complete.\n");

  const nextSteps: string[] = [];
  if (needsMigration.length > 0) {
    nextSteps.push(
      `Port ${needsMigration.join(", ")} into its spec with the migrate-to-spec skill, then \`npx vigiles compile\``,
    );
  } else if (specPathsList.length > 0) {
    nextSteps.push(
      `Edit ${specPathsList.join(", ")} — add your conventions, then \`/strengthen\``,
    );
  }
  if (plan.test) {
    nextSteps.push(
      "Edit vigiles.harness.mjs to test a real hook, then `npx vigiles test`",
    );
  }
  if (written.includes("package.json")) {
    nextSteps.push("Run `npm install` to fetch the vigiles dev dependency");
  }
  if (!strict) {
    nextSteps.push("When ready, enforce in CI: npx vigiles init --strict");
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
  const strict = parsed.strict;

  // Plan: defaults → flags → interactive prompts (only a human at a TTY).
  let plan = resolvePlan(parsed);
  if (shouldPrompt(parsed, process.stdin.isTTY ?? false)) {
    plan = resolvePlan(parsed, await promptSetup());
  }

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
  let needsMigration: string[] = [];
  if (plan.lint) {
    console.log("");
    const p1 = await setupPillar1(detected, parsed.target, harnesses);
    targets = p1.specTargets;
    needsMigration = p1.needsMigration;
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
  // deterministically (no cwd sniffing), plus strict rule severities on --strict.
  writeProjectConfig({ harnesses, strict, written });

  printSetupSummary({ plan, strict, targets, needsMigration, written });
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
 * Apply the `untested-surface` rule: find skills/agents/hooks with no test or
 * eval (see src/test-coverage.ts). Returns the raw untested count plus the
 * severity-gated error count — "warn" prints but never fails CI (errors=0),
 * "error" fails (exit 2), mirroring the integrity check.
 */
function checkUntestedSurfaces(
  config: VigilesConfig | undefined,
  silent: boolean,
): { untested: number; errors: number } {
  const severity = ruleSeverity(config?.rules["untested-surface"]);
  if (!severity) return { untested: 0, errors: 0 };

  const opts = ruleOptions<TestCoverageConfig>(
    config?.rules["untested-surface"],
  );
  const report = findUntestedSurfaces({ basePath: process.cwd(), ...opts });

  if (!silent) {
    console.log("\nUntested surfaces:\n");
    for (const line of formatUntestedReport(report).split("\n")) {
      console.log(`  ${line}`);
    }
    for (const s of report.untested) {
      ghAnnotate(
        severity === "error" ? "error" : "warning",
        `${s.kind} ${s.path} ships without a test or eval`,
        s.path,
      );
    }
  }

  return {
    untested: report.untested.length,
    errors: severity === "error" ? report.untested.length : 0,
  };
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

function findInstructionFiles(restArgs: string[]): string[] {
  if (restArgs.length > 0) return restArgs;
  const patterns = ["**/CLAUDE.md", "**/AGENTS.md", "**/SKILL.md"];
  const files: string[] = [];
  for (const pattern of patterns) {
    files.push(
      ...globSync(pattern, { ignore: IGNORE_NODE_MODULES, cwd: process.cwd() }),
    );
  }
  return files;
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
        `\n✗ ${outPath} does not exist. Run \`vigiles generate-types\` to create it.`,
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
        `\n✗ ${outPath} is stale. Run \`vigiles generate-types\` to update.`,
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
        `\n✗ ${outPath} does not exist. Run \`vigiles generate-schema\` to create it.`,
      );
      process.exit(1);
    }
    const existing = readFileSync(fullOut, "utf-8");
    if (existing.trim() === result.json.trim()) {
      console.log(`\n✓ ${outPath} is up to date`);
    } else {
      console.log(
        `\n✗ ${outPath} is stale. Run \`vigiles generate-schema\` to update.`,
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

function printUsage(command: string | undefined): void {
  console.log("vigiles — compile typed specs to instruction files");
  console.log("");
  console.log("Commands:");
  console.log(
    "  vigiles init [flags]           Setup project (--lint, --test, --harness=, --strict, --no-gha, --force)",
  );
  console.log("  vigiles compile [files...]     Compile .spec.ts → .md");
  console.log(
    "  vigiles lint [files...]        Verify references, find gaps in instruction files",
  );
  console.log(
    "  vigiles test [files...]        Run *.harness.mjs deterministic harness tests",
  );
  console.log(
    "  vigiles eval [files...]        Run *.eval.mjs real-model harness evals (--trials=N, --min=N, --no-skip)",
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
  console.log("  vigiles generate-types [out]  Emit .d.ts from project state");
  console.log("  vigiles generate-types --check  Verify .d.ts is up to date");
  console.log(
    "  vigiles generate-schema [out] Emit JSON Schema for vigiles: frontmatter",
  );
  console.log(
    "  vigiles generate-schema --check Verify schema.json is up to date",
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
    console.error("Usage: vigiles run-skill <SKILL.md>");
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
    console.error("Usage: vigiles skill-start <SKILL.md>");
    process.exit(2);
  }
  setActiveSkill(process.cwd(), target);
  console.log(`Active skill: ${target}`);
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
  try {
    tool = (JSON.parse(raw) as { tool_name?: string }).tool_name ?? "";
  } catch {
    /* malformed input → no tool, allow */
  }
  if (!tool) return;
  const decision = evaluatePreToolUse(process.cwd(), tool);
  if (!decision.allow) {
    console.error(decision.message);
    process.exit(2);
  }
}

/**
 * `vigiles intercept-tool-hook` — the PreToolUse interception hook for the
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

/** Mark a subagent active so the PreToolUse hook enforces its tool contract. */
function agentStartCommand(target: string | undefined): void {
  if (!target) {
    console.error("Usage: vigiles agent-start <agents/<name>.md>");
    process.exit(2);
  }
  setActiveAgent(process.cwd(), target);
  console.log(`Active agent: ${target}`);
}

/** Dispatch the skill-runtime subcommands. Returns false if unrecognized. */
function handleSkillCommand(command: string, restArgs: string[]): boolean {
  switch (command) {
    case "run-skill":
      runSkillCommand(restArgs[0]);
      return true;
    case "skill-start":
      skillStartCommand(restArgs[0]);
      return true;
    case "skill-done":
      clearActiveSkill(process.cwd());
      return true;
    case "skill-hook":
      skillHookCommand();
      return true;
    case "agent-start":
      agentStartCommand(restArgs[0]);
      return true;
    case "agent-done":
      clearActiveAgent(process.cwd());
      return true;
    case "agent-hook":
      agentHookCommand();
      return true;
    case "intercept-tool-hook":
      interceptToolHookCommand();
      return true;
    case "action-hook":
      actionHookCommand();
      return true;
    case "refs":
      refsCommand(restArgs[0]);
      return true;
    case "refs-hook":
      refsHookCommand();
      return true;
    default:
      return false;
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
 * Inspect an instruction file's symbol references: broken file-qualified refs
 * (`path.ext#symbol` whose file/symbol is wrong) and code-shaped references not
 * yet marked. Emits one line per finding via `log`; returns whether any issue
 * was found. `basePath` is the file's own directory (where paths resolve).
 */
function reportRefIssues(
  markdown: string,
  basePath: string,
  log: (m: string) => void,
): boolean {
  const issues = collectRefIssues(markdown, basePath);
  for (const m of issues) log(`  ✗ ${m}`);
  return issues.length > 0;
}

/** `vigiles refs <file>` — check a file's symbol references (exit 2 on issues). */
function refsCommand(target: string | undefined): void {
  if (!target) {
    console.error("Usage: vigiles refs <instruction-file.md>");
    process.exit(2);
  }
  const cwd = process.cwd();
  let markdown: string;
  try {
    markdown = readFileSync(resolve(cwd, target), "utf-8");
  } catch {
    console.error(`Cannot read ${target}`);
    process.exit(2);
  }
  const bad = reportRefIssues(markdown, dirname(resolve(cwd, target)), (m) => {
    console.log(m);
  });
  if (bad) process.exit(2);
  console.log(`✓ ${target}: all code references are marked and resolve.`);
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
      // remediation for the require-spec validator. Bare `vigiles init`
      // still runs the full wizard (project detection + auto-targets).
      const hasTarget = args.some((a) => a.startsWith("--target="));
      if (hasTarget) {
        init(args.slice(1));
      } else {
        await setup(args);
      }
      break;
    }

    case "compile": {
      const specs = restArgs.length > 0 ? restArgs : findSpecs();
      if (specs.length === 0) {
        console.log("No .spec.ts files found.");
        console.log("Run `vigiles init` to create one.");
        process.exit(0);
      }
      const harnessFlag = args
        .find((a) => a.startsWith("--harness="))
        ?.slice("--harness=".length);
      const valid = await compile(specs, config, { harnessFlag });
      console.log("");
      if (valid) {
        console.log("Compilation complete.");
      } else {
        console.log("Compilation complete with errors.");
        process.exit(1);
      }
      break;
    }

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

    case "scan": {
      const dirs = restArgs.length > 0 ? restArgs : ["."];
      const json = args.includes("--json");
      if (dirs.length > 1) {
        // Multiple targets → rank them (the leaderboard engine).
        const scores = rankPlugins(dirs);
        console.log(
          json ? JSON.stringify(scores, null, 2) : formatLeaderboard(scores),
        );
      } else {
        const root = resolve(dirs[0]);
        const harnessFlag = args
          .find((a) => a.startsWith("--harness="))
          ?.slice("--harness=".length);
        const det = detectAdapterResult(root);
        const adapter = harnessFlag
          ? resolveAdapter(root, harnessFlag)
          : det.adapter;
        const report = scanPlugin(dirs[0], adapter.layout);
        if (!json) {
          console.log(`Detected harness: ${adapter.name}`);
          if (!harnessFlag && det.ambiguousWith.length > 0) {
            console.log(
              `⚠ repo also matches: ${det.ambiguousWith.join(", ")} — override with --harness=<name>`,
            );
          }
          console.log("");
        }
        console.log(
          json ? JSON.stringify(report, null, 2) : formatScanReport(report),
        );
      }
      break;
    }

    // --- Plumbing ---

    case "generate-types":
      handleGenerateTypes(args, restArgs);
      break;

    case "generate-schema":
      handleGenerateSchema(args, restArgs);
      break;

    default:
      if (!handleSkillCommand(command, restArgs)) printUsage(command);
      break;
  }
}

void main();
