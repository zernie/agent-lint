/**
 * scan-core — the PURE, NODE-FREE detector runtime behind `vigiles audit`.
 *
 * These are the deterministic surface detectors `scanPlugin` (disk, src/scan.ts)
 * and `scanFiles` (browser, src/scan-files.ts) BOTH run — one detector, no drift.
 * They were split out of `scan.ts` so the in-browser audit engine can import them
 * WITHOUT dragging `scan.ts`'s node-only runtime deps (plugin-loader/crypto,
 * core/mcp/child_process, test-coverage/glob, node:fs) into the bundle: every
 * import below is node-free (path ops from the node-free `./posix-path.js`; all
 * filesystem IO is INJECTED by the caller, never imported here). `scan.ts`
 * re-exports everything here (`export *`) so its public surface is unchanged.
 *
 * The only edge back to `scan.ts` is TYPE-ONLY (the report shapes), elided at
 * build, so there is no runtime cycle — `scan.ts` requires `scan-core.js`, never
 * the reverse.
 */
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "./posix-path.js";

import {
  verifyToolContract,
  confidentToolIssues,
  disallowedToolIssues,
} from "./core/tool-contract.js";
import { editDistance } from "./core/edit-distance.js";
import { readFrontmatter, frontmatterScalar } from "./core/frontmatter-read.js";
import {
  findDescriptionOverlaps,
  type DescriptionOverlap,
} from "./core/description-overlap.js";
import {
  findDescriptionBudgetIssues,
  type DescriptionBudgetIssue,
} from "./core/skill-description-budget.js";
import { verifyMcpToolServers } from "./core/mcp-tool.js";
import { lethalTrifectaIssues } from "./core/lethal-trifecta.js";
import { skillResourceIssues } from "./core/skill-resources.js";
import { skillMissingFence } from "./core/skill-missing-fence.js";
import {
  delegationTrifectaIssues,
  type CapabilityNode,
} from "./core/delegation-trifecta.js";
import { effectSurface } from "./core/effects.js";
import {
  parseAgentTools,
  parseAgentToolList,
} from "./adapters/claude-code/agent-tools.js";
import type { PluginLayout } from "./core/layout.js";
import type { HarnessDialect } from "./core/dialect.js";
import type { HookRegistration } from "./core/hook-normalize.js";
import type { HookScriptEntry } from "./core/hook-block-ineffective.js";
import type { HookMatcherEntry } from "./core/hook-matcher.js";
import type {
  ScanSkill,
  ScanAgent,
  ScanHook,
  FrontmatterIssue,
  FrontmatterValueIssue,
  FrontmatterParseIssue,
  ScanTrifectaFinding,
  ScanSkillResourceFinding,
  ScanSkillFenceFinding,
  ScanDelegationFinding,
} from "./scan.js";

// A script-path token inside a hook command. The token class is `\S` MINUS the
// glob metacharacters `*` and `?` (dogfood D1): a real, resolvable hook path
// never contains them, but a command that merely MENTIONS a glob — e.g.
// `find . -name "*.js"` in a hook body — would otherwise have `"*.js"` grabbed as
// a "script" and reported MISSING (a false positive). Shell vars / braces /
// quotes / slashes ARE kept (`${CLAUDE_PLUGIN_ROOT}/hooks/x.sh`, `"$HOME"/y.sh`),
// since resolveScript expands + strips those; only glob patterns are dropped.
const SCRIPT_RE = /[^\s*?]+\.(?:sh|mjs|cjs|js|ts|py|rb)\b/g;

// The scalar fields scan reads from a skill/agent `---` block, via the shared
// lenient reader (core/frontmatter-read.ts) — a real YAML parse with a regex
// salvage on malformed input, so block scalars / multi-line quoted values parse
// for free and a bad block still yields what it can. One reader, no drift.
function frontmatter(md: string): {
  name?: string;
  description?: string;
  model?: string;
  color?: string;
} {
  const fm = readFrontmatter(md);
  return {
    name: frontmatterScalar(fm, "name"),
    description: frontmatterScalar(fm, "description"),
    model: frontmatterScalar(fm, "model"),
    color: frontmatterScalar(fm, "color"),
  };
}

/**
 * Per-kind surface classifiers, built from the harness `PluginLayout`'s
 * `skillDir`/`agentDir`/`commandDir` — so adding a harness whose subagents live
 * somewhere other than `agents/` (OpenCode's `.opencode/agent`) needs no change
 * here. Each anchors on a real path boundary (start-of-path or a `/`), so a
 * directory whose NAME merely ends in the keyword isn't misclassified — e.g. the
 * skill `skills/dispatching-parallel-agents/SKILL.md` must NOT register as an
 * agent named "SKILL" (the `-agents/` substring), which real plugins like
 * obra/superpowers ship. See scan.test.ts for the regression cases.
 */
export interface SurfaceClassifier {
  readonly isSkill: (f: string) => boolean;
  readonly isAgent: (f: string) => boolean;
  readonly isCommand: (f: string) => boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeClassifier(layout: PluginLayout): SurfaceClassifier {
  // An empty dir means "this harness has no such surface" → never matches.
  const at = (dir: string): string | null =>
    dir ? `(?:^|/)${escapeRe(dir)}/` : null;
  const skill = at(layout.skillDir);
  const agent = at(layout.agentDir);
  const command = at(layout.commandDir);
  const skillRe = skill ? new RegExp(`${skill}[^/]+/SKILL\\.md$`) : null;
  const agentRe = agent ? new RegExp(`${agent}[^/]+\\.md$`) : null;
  const commandRe = command ? new RegExp(`${command}.+\\.md$`) : null;
  // A subagent lives at the plugin's TOP-LEVEL `agents/` dir (e.g. `agents/foo.md`
  // or `.claude/agents/foo.md`), never recursively under ANOTHER surface dir. Two
  // real-world nesting traps are excluded as false positives:
  //   - `skills/<x>/agents/…` — skill-internal worker docs (Anthropic's skill-creator)
  //   - `commands/agents/…`   — a COMMAND namespaced `/agents:…` (ruvnet/claude-flow),
  //     incl. a `README.md`; these are commands, not dispatchable subagents.
  // Flagging either as a subagent missing frontmatter is a false positive (it
  // mis-graded a real plugin F). A genuine top-level `agents/foo.md` still
  // matches. Both excluded dirs are read from the layout (adapter-agnostic). See
  // scan.test.ts for the regressions.
  const nestedUnder = [
    layout.skillDir &&
      `${escapeRe(layout.skillDir)}/.+/${escapeRe(layout.agentDir)}/`,
    layout.commandDir &&
      `${escapeRe(layout.commandDir)}/(?:.+/)?${escapeRe(layout.agentDir)}/`,
  ].filter((x): x is string => Boolean(x));
  const nestedAgentRe =
    layout.agentDir && nestedUnder.length
      ? new RegExp(`(?:^|/)(?:${nestedUnder.join("|")})`)
      : null;
  const isAgent = (f: string): boolean =>
    (agentRe?.test(f) ?? false) &&
    !f.endsWith(".spec.ts") &&
    !(nestedAgentRe?.test(f) ?? false);
  return {
    isSkill: (f) => skillRe?.test(f) ?? false,
    isAgent,
    isCommand: (f) => commandRe?.test(f) ?? false,
  };
}

function skillName(path: string): string {
  return (
    path
      .replace(/\/SKILL\.md$/, "")
      .split("/")
      .pop() ?? path
  );
}

/**
 * The first prose paragraph of a SKILL.md body (after the frontmatter and any
 * leading `#` headings) — Claude Code's FALLBACK skill description when the
 * frontmatter omits `description`. Used so the trigger-surface check doesn't
 * overclaim "can't trigger" for a skill that has a usable body paragraph.
 */
function firstBodyParagraph(md: string): string | undefined {
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const para: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) {
      if (para.length > 0) break; // end of the first paragraph
      continue; // skip leading blanks / headings
    }
    para.push(t);
  }
  return para.join(" ").trim() || undefined;
}

/** The body of a SKILL.md with the leading `---` frontmatter block stripped. */
function skillBody(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * The on-disk path for a materialized file key. `loadPlugin` prefixes each
 * surface file with the layout's `materializeRoot` (e.g. `.claude/`), but the file
 * lives on disk WITHOUT that prefix (under the real surface dir), so a
 * bundled-resource existence check must strip it back off. Mirrors how
 * `resolveScript` resolves a hook path against the real plugin root.
 */
function onDiskPath(materializedKey: string, materializeRoot: string): string {
  if (!materializeRoot) return materializedKey;
  const prefix = `${materializeRoot}/`;
  return materializedKey.startsWith(prefix)
    ? materializedKey.slice(prefix.length)
    : materializedKey;
}

/** The plugin-root + materialize-root + dialect context skill scanning needs. */
export interface SkillScanContext {
  readonly root: string;
  readonly materializeRoot: string;
  readonly dialect: HarnessDialect;
  /**
   * Materialized-key → real on-disk path (from `loadPlugin`). A surface can be
   * materialized under a canonical key while living at a different root (repo-root
   * `skills/` vs project-level `.claude/skills/`), so bundled-resource resolution
   * uses the true dir from here rather than reverse-guessing from the key.
   */
  readonly sources?: Record<string, string>;
  /** OPT-IN top-level shared-resource dirs (`.vigilesrc.json` `sharedDirs`). */
  readonly sharedDirs?: readonly string[];
  /**
   * The REPO root the `sharedDirs` are declared relative to (where `.vigilesrc.json`
   * lives) — distinct from the scan `root`, which may be a scoped SUBDIR (e.g.
   * `lint packages/foo`). A shared-dir ref resolves against THIS, not the subdir,
   * so a scoped scan doesn't false-flag the top-level shared tree. Defaults to
   * `root` (unchanged when scanning the repo root itself).
   */
  readonly sharedDirsRoot?: string;
  /**
   * REQUIRED existence check for bundled-resource resolution. The disk scan
   * (`scanPlugin`) injects `node:fs` `existsSync`; the browser file-map engine
   * (`scanFiles`) a map-backed impl — so the same `scanSkills` runs on disk OR
   * in the browser with no `node:` import in this node-free module.
   */
  readonly existsSync: (p: string) => boolean;
}

/**
 * The path to REPORT for a scanned surface (dogfood E1). A plugin skill/agent is
 * materialized under a SYNTHETIC canonical key (the layout's `materializeRoot`
 * prefix, e.g. `.claude/agents/x.md`) that does NOT exist on disk; `sources[key]`
 * holds the real absolute on-disk path. Report the real path made REPO-RELATIVE —
 * clickable in the terminal AND valid as a GitHub annotation `file=` — falling
 * back to the canonical key when no source is recorded (a repo-root surface whose
 * key already IS the real relative path). A source resolving OUTSIDE the scan root
 * (a `..`-escape, unusual) keeps its real absolute path rather than a phantom.
 */
function reportedSurfacePath(
  canonicalKey: string,
  onDisk: string | undefined,
  root: string,
): string {
  if (onDisk === undefined) return canonicalKey;
  const rel = relative(root, onDisk);
  return rel !== "" && !rel.startsWith("..") ? rel : onDisk;
}

/**
 * Does the repo already ship its OWN test setup — a real `package.json` `test`
 * script, or a conventional test dir? Used by `audit` to credit an existing
 * testing story as OPTIONAL (a repo isn't scolded for surfaces with no vigiles
 * test when it clearly tests some other way). Node-free + injectable so the same
 * detector runs on disk (`node:fs`) AND in the browser (map-backed), keeping the
 * disk report and the demo report byte-identical (the OUTPUT-PARITY the
 * scanFiles-vs-scanPlugin gate enforces).
 */
export function detectOwnTestSignal(
  root: string,
  io: {
    readonly readFile: (p: string) => string;
    readonly existsSync: (p: string) => boolean;
  },
): boolean {
  const pkg = io.readFile(join(root, "package.json"));
  if (pkg !== "") {
    try {
      const { scripts } = JSON.parse(pkg) as {
        scripts?: Record<string, string>;
      };
      const t = scripts?.test?.trim();
      if (t !== undefined && t !== "" && !/no test specified/i.test(t))
        return true;
    } catch {
      /* malformed package.json — ignore */
    }
  }
  return ["test", "tests", "__tests__", "spec", join("src", "test")].some((d) =>
    io.existsSync(join(root, d)),
  );
}

export function scanSkills(
  files: Record<string, string>,
  cls: SurfaceClassifier,
  ctx: SkillScanContext,
): ScanSkill[] {
  const { root, materializeRoot, dialect, sharedDirs } = ctx;
  // `sharedDirs` are declared relative to the REPO root (config location), which
  // is `root` for a whole-repo scan but a PARENT when the scan is scoped to a
  // subdir. Resolve them against that, not the scoped subdir.
  const sharedDirsRoot = ctx.sharedDirsRoot ?? root;
  const out: ScanSkill[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    // Prefer the real on-disk dir (a `.claude/skills/…` skill materializes under
    // the same canonical key as a repo-root one, but lives elsewhere on disk).
    const onDiskDir = ctx.sources?.[path];
    const fm = frontmatter(md);
    // A skill's trigger surface is its frontmatter `description` OR — when that's
    // absent — Claude Code's fallback to the first body paragraph. Only when
    // NEITHER exists is the skill genuinely undescribed (can't be selected). The
    // explicit-frontmatter best-practice is the separate `skill-frontmatter` rule.
    const effectiveDesc = fm.description ?? firstBodyParagraph(md);
    const userInvoked = /^\s*disable-model-invocation:\s*true\s*$/m.test(md);
    // Bundled-resource refs resolve against the skill's OWN dir (resources ship
    // beside the SKILL.md), built from the plugin root + the file's ON-DISK dir
    // (the materialize-root prefix the loader added is stripped back off).
    const skillDir = onDiskDir
      ? dirname(onDiskDir)
      : resolve(root, dirname(onDiskPath(path, materializeRoot)));
    // Bundled refs resolve against the skill's OWN dir. A repo that shares a
    // top-level tree across skills (`sharedDirs` in .vigilesrc.json) ALSO resolves
    // a ref under one of those declared dirs against the repo root — OPT-IN, so a
    // repo that doesn't set it is byte-identical to before (no masking of a real
    // missing bundled resource). See feedback P1-4.
    const resourceIssues = skillResourceIssues(skillBody(md), skillDir, {
      repoRoot: sharedDirsRoot,
      sharedDirs,
      existsSync: ctx.existsSync,
    });
    // The lethal trifecta is a property of what a unit CAN do, which for a skill is
    // its declared `allowed-tools` (the CC skill tool contract). Only a model-
    // invocable skill can be hijacked by attacker content, so a user-invoked one is
    // excluded. A skill with no `allowed-tools` line inherits all → advisory.
    const skillTools = parseAgentToolList(md, "allowed-tools");
    // No `allowed-tools:` line (null) → inherits all → wildcard sentinel; an
    // EXPLICIT empty `[]` means zero tools → no trifecta (don't collapse them).
    const trifecta = userInvoked
      ? null
      : lethalTrifectaIssues(skillTools ?? ["*"], dialect);
    out.push({
      name: fm.name ?? skillName(path),
      // Report the real on-disk path, not the synthetic materialize key (E1).
      path: reportedSurfacePath(path, onDiskDir, root),
      hasDescription: Boolean(effectiveDesc && effectiveDesc.length >= 20),
      description: effectiveDesc?.trim(),
      userInvoked,
      resourceIssues,
      trifecta,
      // A SKILL.md opening with `name:`/`description:` but no `---` fence loads
      // as plain body → the skill is invisible. Inspect the RAW md (not the
      // frontmatter-stripped body) so the unfenced keys are visible.
      fenceIssue: skillMissingFence(md),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Near-duplicate description pairs among the MODEL-INVOCABLE skills — the ones
 * that actually compete for auto-selection (a user-invoked skill is picked by
 * explicit command, so it can't collide). Uses the same effective-description
 * logic as `scanSkills` (frontmatter `description` ← first body paragraph), then
 * the NCD precision-proxy. See description-overlap.ts.
 */
function modelInvocableSkillSurfaces(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): { name: string; description: string }[] {
  const surfaces: { name: string; description: string }[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    if (/^\s*disable-model-invocation:\s*true\s*$/m.test(md)) continue;
    const fm = frontmatter(md);
    const description = fm.description ?? firstBodyParagraph(md);
    if (!description || description.length < 20) continue;
    surfaces.push({ name: fm.name ?? skillName(path), description });
  }
  return surfaces;
}

export function descriptionOverlapsFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): DescriptionOverlap[] {
  return findDescriptionOverlaps(modelInvocableSkillSurfaces(files, cls));
}

/**
 * Model-invocable skills whose description is so long the trigger signal is
 * buried (heuristic proxy; degrades recall + precision). Same surfaces as the
 * overlap check. See skill-description-budget.ts.
 */
export function descriptionBudgetFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): DescriptionBudgetIssue[] {
  return findDescriptionBudgetIssues(modelInvocableSkillSurfaces(files, cls));
}

export function scanAgents(
  files: Record<string, string>,
  dialect: HarnessDialect,
  declaredServers: readonly string[],
  cls: SurfaceClassifier,
  // Source-mapping context (dogfood E1): the scan `root` + the loader's canonical
  // key → real on-disk path map, so a materialized agent reports its REAL path
  // instead of the synthetic `.claude/agents/…` key. Optional so a caller that
  // doesn't materialize (no sources) is unchanged — the canonical key is used.
  ctx?: { root: string; sources?: Record<string, string> },
): ScanAgent[] {
  const out: ScanAgent[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue;
    const tools = parseAgentTools(md);
    // An inherits-all agent (no `tools:` line) grants access to every tool
    // including every side-effecting one — pass the wildcard sentinel so
    // effectSurface correctly classifies it as `"unrestricted"`.
    const surface = effectSurface(tools ?? ["*"], dialect);
    out.push({
      name: basename(path, ".md"),
      path: ctx
        ? reportedSurfacePath(path, ctx.sources?.[path], ctx.root)
        : path,
      tools,
      // Cross-reference the declared rail against the dialect catalog — the moat.
      // Auditing third-party plugins → only the HIGH-CONFIDENCE issues (never-
      // available + close typos); a bare unrecognized tool is likely plugin/MCP-
      // provided, not a defect (the TaskCreate/TaskGet lesson). See tool-contract.ts.
      toolIssues: tools
        ? confidentToolIssues(verifyToolContract(tools, dialect))
        : [],
      // The MCP half of the moat: an `mcp__server__tool` whose server isn't in the
      // plugin's declared set can't resolve. High-precision (gated on a declared
      // set, built-ins allowlisted, plugin-namespaced form skipped). See mcp-tool.ts.
      mcpToolIssues: tools
        ? verifyMcpToolServers(tools, declaredServers, dialect)
        : [],
      // The block-list mirror: a `disallowedTools:` entry that's a typo of a real
      // tool blocks nothing (close-typo only — high-precision). See tool-contract.ts.
      disallowedToolIssues: disallowedToolIssues(
        parseAgentToolList(md, "disallowedTools") ?? [],
        dialect,
      ),
      purity: surface.purity,
      effectBuckets: {
        readOnly: surface.readOnly,
        sideEffecting: surface.sideEffecting,
        unknown: surface.unknown,
      },
      // The lethal trifecta: a subagent whose contract grants all three legs. An
      // inherits-all agent (no `tools:` line → tools === null) is the advisory
      // case — pass the wildcard sentinel so it's distinguished from an EXPLICIT
      // empty `tools: []` (zero tools → no trifecta). One detector, no drift.
      trifecta: lethalTrifectaIssues(tools ?? ["*"], dialect),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a hook script token to a checkable path. `loadPlugin` expands the
 * braced plugin-root token (`${CLAUDE_PLUGIN_ROOT}`, Codex `${PLUGIN_ROOT}`, …);
 * the unbraced shell form survives, so resolve BOTH forms of the HARNESS's token
 * (from the layout, not hard-coded) against the plugin root and strip shell
 * quotes. A token that still carries any `$VAR` after that is genuinely
 * uncheckable.
 */
function resolveScript(
  token: string,
  root: string,
  pluginRootToken: string,
  fullCommand: string,
  exists: (p: string) => boolean,
): ScanHook {
  // "${CLAUDE_PLUGIN_ROOT}" → unbraced "$CLAUDE_PLUGIN_ROOT".
  const unbraced = pluginRootToken.replace(/^\$\{(.+)\}$/, "$$$1");
  const cleaned = token
    .replace(/["']/g, "")
    .replaceAll(pluginRootToken, root)
    .replaceAll(unbraced, root);
  if (cleaned.includes("$"))
    return { command: fullCommand, script: token, status: "unresolved" };
  // A relative hook path (`./hooks/x.sh`, `scripts/x.py`) is the plugin's own —
  // resolve it against the PLUGIN ROOT, not the scanner's cwd. Without this, a
  // plugin that references `./hooks/x.sh` (the file IS present) was reported
  // MISSING because existsSync() checked cwd-relative (a false positive caught on
  // ananddtyagi/cc-marketplace). The displayed `script` stays as the author wrote it.
  const abs = isAbsolute(cleaned) ? cleaned : resolve(root, cleaned);
  // Resolve the full command the same way we resolve the script token (expand
  // plugin-root, strip outer quotes) so the CLI can pass it to verifyGuardrail.
  const resolvedCommand = fullCommand
    .replaceAll(pluginRootToken, root)
    .replaceAll(unbraced, root);
  return {
    command: resolvedCommand,
    script: cleaned,
    status: exists(abs) ? "ok" : "missing",
  };
}

// A shell existence guard around a command — `[ ! -f x ] || x`, `[ -f x ] && x`,
// `test -f x && …`. Authors use it to make a hook OPTIONAL (run the script only
// if present; a no-op otherwise — e.g. a runtime-generated guard), so a missing
// target is INTENTIONAL, not a broken reference. Don't flag scripts in such a
// command as MISSING (a false positive caught on gmickel/flow-next's ralph-guard).
const EXISTENCE_GUARD =
  /(?:\[\[?\s*!?\s*-[efsx]\s)|(?:\btest\s+!?\s*-[efsx]\s)/;

/**
 * A compiled `vigiles/hook` artifact runs through the `hook-runtime run-program`
 * runtime entrypoint; any other hook command is hand-written (a shell script or
 * an inline one-liner) the author maintains directly. The basis for the
 * `prefer-compiled-hooks` nudge.
 */
export function isManagedHookCommand(command: string): boolean {
  return /\bhook-runtime\b/.test(command);
}

/** The `prefer-compiled-hooks` recommendation message (shared by `lint` + `scan`). */
export function preferCompiledHooksMessage(count: number): string {
  return (
    `${String(count)} hand-written hook command(s) — if any gate the agent ` +
    `(a block/deny decision), compiled hooks (\`vigiles/hook\`) make whole hook ` +
    `bug classes unrepresentable at authoring time, and \`guardrail-check\` proves ` +
    `an existing one blocks. See docs/compiled-hooks.md.`
  );
}

/** Pull script-file hook commands out of the resolved settings; count inline ones. */
/**
 * Best-effort map of each script token → the hook EVENT it's registered under,
 * by walking the canonical object-keyed-by-event settings shape
 * (`{ PreToolUse: [{ hooks: [{ command }] }], … }`). Lets the safety battery
 * scope itself to `PreToolUse` (the only event that can block a tool call), so a
 * `SessionStart`/`PostToolUse`/`Stop` hook isn't tested against the disaster
 * catalog. Returns an empty map for a non-object/array config (event → unknown).
 */
function eventsByScript(
  regs: readonly HookRegistration[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const reg of regs) {
    for (const tok of reg.command.match(SCRIPT_RE) ?? []) {
      if (!map.has(tok)) map.set(tok, reg.event);
    }
  }
  return map;
}

export function scanHooks(
  regs: readonly HookRegistration[],
  root: string,
  pluginRootToken: string,
  exists: (p: string) => boolean,
): { hooks: ScanHook[]; inline: number; manual: number } {
  const commands = regs.map((r) => r.command);
  const evMap = eventsByScript(regs);
  // A hand-written hook is any non-empty command that isn't a vigiles-managed
  // (compiled) hook-runtime invocation — the basis for the prefer-compiled-hooks nudge.
  const manual = commands.filter((c) => {
    const u = c.trim();
    return u !== "" && !isManagedHookCommand(u);
  }).length;
  const byScript = new Map<string, ScanHook>();
  let inline = 0;
  for (const cmd of commands) {
    const found = cmd.match(SCRIPT_RE);
    if (!found || found.length === 0) {
      inline++;
      continue;
    }
    // A guarded command runs its script only if it exists — an optional hook, not
    // a broken one. Treat it as a conditional one-liner (inline), don't path-check.
    if (EXISTENCE_GUARD.test(cmd)) {
      inline++;
      continue;
    }
    for (const tok of found) {
      const hook = resolveScript(tok, root, pluginRootToken, cmd, exists);
      const event = evMap.get(tok);
      byScript.set(hook.script, event ? { ...hook, event } : hook);
    }
  }
  const hooks = [...byScript.values()].sort((a, b) =>
    a.script.localeCompare(b.script),
  );
  return { hooks, inline, manual };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Frontmatter-schema check — **subagents only**. Per the Claude Code docs, a
 * subagent (`agents/*.md`) REQUIRES `name` + `description` (no fallback) or it
 * won't register. A SKILL.md requires NOTHING: `name` falls back to the directory
 * name and `description` to the first body paragraph, so a frontmatter-less skill
 * still loads — flagging it would be a false positive (skill description QUALITY
 * is a separate, behavioral concern). See https://code.claude.com/docs/en/skills
 * and …/sub-agents.
 */
export function frontmatterIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterIssue[] {
  const out: FrontmatterIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue; // skills require no frontmatter (dir/body fallbacks)
    const fm = frontmatter(md);
    const missing: ("name" | "description")[] = [];
    if (!fm.name) missing.push("name");
    if (!fm.description) missing.push("description");
    if (missing.length === 0) continue;
    out.push({
      path,
      kind: "agent",
      missing,
      message: `agent ${path} is missing required frontmatter: ${missing.join(", ")} — it won't register.`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// The canonical subagent `model:` aliases and `color:` enum (Claude Code). The
// model check skips a full/dated id (`claude-sonnet-4-5`) — that's a valid
// explicit form, not a typo — so only an alias misspelling is caught.
const MODEL_ALIASES = ["inherit", "sonnet", "opus", "haiku"];
const AGENT_COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan",
];

/**
 * Closest candidate by edit distance, ONLY when it's a high-confidence typo: the
 * value isn't already a candidate, and the nearest is within 2 edits. Returns
 * null otherwise — a far-off value is more likely an unknown-we-don't-know than a
 * typo (the high-precision discipline), so it's suppressed, not flagged.
 */
function closeCandidate(
  value: string,
  candidates: readonly string[],
): string | null {
  const v = value.toLowerCase();
  if (candidates.includes(v)) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const dist = editDistance(v, c);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = c;
    }
  }
  return bestDistance > 0 && bestDistance <= 2 ? best : null;
}

/**
 * Agent frontmatter VALUE validity — a `model:` or `color:` that's a close typo
 * of a real one. A bad `model:` silently falls back; a bad `color:` is ignored.
 * High-precision (close-typo only); a full/dated model id is left alone. Folded
 * into the `subagent-frontmatter` rule. Agents only (skills have no model/color).
 */
export function frontmatterValueIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterValueIssue[] {
  const out: FrontmatterValueIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isAgent(path)) continue;
    const fm = frontmatter(md);
    // A model id with a digit/hyphen is an explicit form, not an alias typo.
    if (fm.model && !/[0-9-]/.test(fm.model)) {
      const near = closeCandidate(fm.model, MODEL_ALIASES);
      if (near) {
        out.push({
          path,
          field: "model",
          value: fm.model,
          suggestion: near,
          message: `agent ${path} has model "${fm.model}", not a known alias — it silently falls back. Did you mean "${near}"?`,
        });
      }
    }
    if (fm.color) {
      const near = closeCandidate(fm.color, AGENT_COLORS);
      if (near) {
        out.push({
          path,
          field: "color",
          value: fm.color,
          suggestion: near,
          message: `agent ${path} has color "${fm.color}", not a valid color — it's ignored. Did you mean "${near}"?`,
        });
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Frontmatter that EXISTS but isn't valid YAML — the `frontmatter-valid` signal.
 * Reported for skills + agents via the shared reader's `malformed` flag. Honest
 * caveat (see docs/rules/frontmatter-valid.md): js-yaml is stricter than some
 * loaders, so a one-line `description:` containing a `: ` colon or an `<example>`
 * block is flagged even though it may still load — which is why scan surfaces it
 * as an informational note (NOT a structural defect) and the lint rule is a
 * warn, not an error. The file's other fields are still salvaged.
 */
export function malformedFrontmatterFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterParseIssue[] {
  const out: FrontmatterParseIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path) && !cls.isAgent(path)) continue;
    if (!readFrontmatter(md).malformed) continue;
    out.push({
      path,
      message: `${path}: frontmatter is not valid YAML — fields may not parse as intended (a colon, quote, or bracket likely needs escaping/quoting).`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Skill-metadata RECOMMENDATION (not a correctness check): a `SKILL.md` loads
 * fine without frontmatter (`name` ← dir, `description` ← first body paragraph),
 * but relying on those fallbacks is fragile — the dir name may be unclear and the
 * first paragraph is often a heading or boilerplate, making a weak trigger
 * surface. Best practice is an EXPLICIT `name` + `description`. Flags skills
 * missing either; surfaced as a soft note in scan (NOT a structural defect, NOT
 * scored) and gated by the `skill-frontmatter` lint rule (warn by default).
 */
export function skillMetaIssuesFor(
  files: Record<string, string>,
  cls: SurfaceClassifier,
): FrontmatterIssue[] {
  const out: FrontmatterIssue[] = [];
  for (const [path, md] of Object.entries(files)) {
    if (!cls.isSkill(path)) continue;
    const fm = frontmatter(md);
    const missing: ("name" | "description")[] = [];
    if (!fm.name) missing.push("name");
    if (!fm.description) missing.push("description");
    if (missing.length === 0) continue;
    out.push({
      path,
      kind: "skill",
      missing,
      message: `skill ${path} has no explicit frontmatter ${missing.join(" / ")} — recommended for a reliable trigger surface (it still loads via the dir-name / first-paragraph fallback).`,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Flatten the per-surface lethal-trifecta + skill-resource findings into the
 * path-tagged report lists the `audit` report AND the `lethal-trifecta` /
 * `skill-resource-resolves` lint rules both consume (one detector, no drift).
 */
export function collectSurfaceFindings(
  agents: readonly ScanAgent[],
  skills: readonly ScanSkill[],
): {
  trifectaFindings: ScanTrifectaFinding[];
  skillResourceFindings: ScanSkillResourceFinding[];
  skillFenceFindings: ScanSkillFenceFinding[];
} {
  const trifectaFindings: ScanTrifectaFinding[] = [];
  for (const a of agents) {
    if (a.trifecta) {
      trifectaFindings.push({
        path: a.path,
        kind: "subagent",
        name: a.name,
        finding: a.trifecta,
      });
    }
  }
  for (const s of skills) {
    if (s.trifecta) {
      trifectaFindings.push({
        path: s.path,
        kind: "skill",
        name: s.name,
        finding: s.trifecta,
      });
    }
  }
  const skillResourceFindings: ScanSkillResourceFinding[] = skills.flatMap(
    (s) =>
      s.resourceIssues.map((finding) => ({
        path: s.path,
        name: s.name,
        finding,
      })),
  );
  const skillFenceFindings: ScanSkillFenceFinding[] = skills.flatMap((s) =>
    s.fenceIssue ? [{ path: s.path, name: s.name, finding: s.fenceIssue }] : [],
  );
  return { trifectaFindings, skillResourceFindings, skillFenceFindings };
}

/**
 * Build the subagent delegation graph and flag a lethal trifecta that EMERGES
 * across an edge (own ∪ delegated-to capability) though no single unit trips it.
 *
 * Edge source (deterministic, audit-available): a subagent that lists the `Task`
 * tool can dispatch any sibling subagent, so it `delegatesTo` every OTHER agent.
 * An inherits-all agent (`tools === null`) carries the wildcard, which the
 * detector's FP-safe guard skips (that maximal-blast case is the per-unit
 * advisory's job). One detector, no drift. (Richer edge sources — a typed
 * railway's `delegate()` chain, a Flue subagent inheritance tree — plug in here.)
 */
export function collectDelegationTrifecta(
  agents: readonly ScanAgent[],
  dialect: HarnessDialect,
): ScanDelegationFinding[] {
  const allNames = agents.map((a) => a.name);
  const nodes: CapabilityNode[] = agents.map((a) => {
    const canDispatch =
      a.tools === null ||
      a.tools.some((t) => t === "Task" || t.startsWith("Task("));
    return {
      name: a.name,
      kind: "agent",
      tools: a.tools ?? ["*"],
      delegatesTo: canDispatch ? allNames.filter((n) => n !== a.name) : [],
    };
  });
  const pathByName = new Map(agents.map((a) => [a.name, a.path]));
  return delegationTrifectaIssues(nodes, dialect).map((finding) => ({
    path: pathByName.get(finding.name) ?? "",
    finding,
  }));
}

/**
 * Build `hookBlockIssues` entries by walking the canonical object-keyed-by-event
 * settings shape PER REGISTRATION — so a script registered under several events
 * is inspected under EACH (no de-dup by script path), inline one-liners are
 * included (script token → null, inspect the command), and a script token is
 * resolved to its ABSOLUTE on-disk path against the plugin root (not the caller's
 * cwd). Addresses the gaps a de-duplicated `ScanHook[]` would miss.
 */
export function collectHookBlockEntries(
  regs: readonly HookRegistration[],
  root: string,
  pluginRootToken: string,
  exists: (p: string) => boolean,
): HookScriptEntry[] {
  const out: HookScriptEntry[] = [];
  for (const { event, command: cmd } of regs) {
    // A wrapper command runs MORE than one script (`node run.cjs guard.mjs`),
    // so resolve EVERY candidate and inspect each — reading only the first
    // (the wrapper) would miss the guard's block logic. Candidates: extensioned
    // script tokens (SCRIPT_RE) PLUS path-like words with NO extension
    // (`bash hooks/guard`, `${ROOT}/hooks/session-start`) that resolve to a file.
    const candidates = new Set<string>(cmd.match(SCRIPT_RE) ?? []);
    for (const word of cmd.split(/\s+/)) {
      const w = word.replace(/^["']+|["']+$/g, "");
      if (w.startsWith("-")) continue; // a flag, not a path
      if (w.includes("/") || w.includes(pluginRootToken)) candidates.add(w);
    }
    const resolvedPaths: string[] = [];
    for (const tok of candidates) {
      const r = resolveScript(tok, root, pluginRootToken, cmd, exists);
      if (r.status === "ok") {
        const abs = isAbsolute(r.script) ? r.script : resolve(root, r.script);
        if (!resolvedPaths.includes(abs)) resolvedPaths.push(abs);
      }
    }
    if (resolvedPaths.length > 0) {
      // One entry per resolvable script (each is inspected on its own).
      for (const sp of resolvedPaths) {
        out.push({ event, command: cmd, scriptPath: sp });
      }
    } else {
      // No script file resolved → inline one-liner; inspect the command text.
      out.push({ event, command: cmd, scriptPath: null });
    }
  }
  return out;
}

/** Extract (event, matcher) pairs from the normalized hook registrations. */
export function collectHookMatchers(
  regs: readonly HookRegistration[],
): HookMatcherEntry[] {
  const seen = new Set<string>();
  const out: HookMatcherEntry[] = [];
  for (const { event, matcher } of regs) {
    if (matcher === null) continue;
    const key = `${event}\u0000${matcher}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ event, matcher });
  }
  return out;
}

/** Tally how many scanned agents fall into each purity rung (effectSurface). */
export function summarizePurity(agents: readonly ScanAgent[]): {
  pure: number;
  bounded: number;
  unrestricted: number;
} {
  return agents.reduce(
    (acc, a) => {
      acc[a.purity]++;
      return acc;
    },
    { pure: 0, bounded: 0, unrestricted: 0 },
  );
}
