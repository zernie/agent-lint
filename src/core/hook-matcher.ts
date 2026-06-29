/**
 * Hook-matcher verification — the cross-referencing moat applied to the MATCHER
 * string inside a hook registration. A PreToolUse hook fires only when its
 * `matcher` equals the tool name the harness emits (or matches via glob/regex); a
 * typo or wrong form silently prevents the hook from ever running — exactly the
 * FALSE CONFIDENCE failure the compiled-hooks design exists to eliminate
 * (research/hook-pain-points.md).
 *
 * THREE kinds of bad matcher, each verified here (one-detector-no-drift):
 *
 * 1. **tool-typo** — a bare token that is a CLOSE TYPO (edit distance ≤ 2) of a
 *    real built-in tool name but not an exact match (`bash` → `Bash`, `read` →
 *    `Read`). Suggests the correct casing. Reuses `closestTool` from
 *    `tool-contract.ts` — same edit-distance logic, same ≤ 2 confidence bound.
 *
 * 2. **mcp-form** — a token that looks MCP-ish (starts with `mcp`, case-
 *    insensitive) but is NOT the required `mcp__<server>__<tool>` double-underscore
 *    shape (single underscores, a hyphen, a trailing `*`…). Suggests the corrected
 *    form when the server/tool segments can be recovered.
 *
 * 3. **mcp-undeclared** — a correctly-formed `mcp__<server>__…` token whose server
 *    is NOT in the plugin's declared MCP servers. Gated EXACTLY like
 *    `mcp-tool-resolves`: (a) no declared set → skip (reaches global/project
 *    servers); (b) built-ins allowlisted via `dialect.knownMcpServers`; (c) the
 *    plugin-namespaced `mcp__plugin_…__…` form is skipped. Reuses `mcpToolServer`
 *    from `mcp-tool.ts` for the extraction — one parser, no drift.
 *
 * FP-SAFE: only a SINGLE bare token is inspected. A matcher that is empty, a pure
 * wildcard (`*` / `.*`), or contains alternation (`|`) or other regex meta-
 * characters is skipped — it is a pattern/glob with legitimate broad matching, not
 * a tool name. Same don't-cry-wolf discipline as every other vigiles detector.
 *
 * Pure + ONE detector reused by `scan` + the `hook-matcher` lint rule
 * (one-detector-no-drift). The dialect is injected (core ⊄ adapter).
 */
import type { HarnessDialect } from "./dialect.js";
import { closestTool } from "./tool-contract.js";
import { mcpToolServer } from "./mcp-tool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which matching failure was detected in the hook matcher string. */
export type HookMatcherKind = "tool-typo" | "mcp-form" | "mcp-undeclared";

/** One finding for a hook matcher that will silently never fire. */
export interface HookMatcherFinding {
  /** The matcher string exactly as written. */
  readonly matcher: string;
  /** Which class of error was detected. */
  readonly kind: HookMatcherKind;
  /**
   * The corrected matcher when the intent is recoverable (e.g. `Bash` for
   * `bash`, `mcp__memory__.*` for `mcp_memory_*`). Absent when the server
   * segment can't be recovered from a malformed MCP form.
   */
  readonly suggestion?: string;
  /** A ready-to-show, actionable message. */
  readonly message: string;
}

/** A single hook registration entry — its event and matcher string. */
export interface HookMatcherEntry {
  readonly event: string;
  readonly matcher: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Whether a matcher token should be skipped for FP-safety. We ONLY inspect
 * a SINGLE bare token that could plausibly be a literal tool name or MCP
 * reference. Anything with regex / glob meta-characters, alternation, a
 * trailing glob wildcard alone, or an empty string is a pattern — skip it.
 *
 * Conservative by design: an unrecognized form → skip, never flag.
 */
function isInspectableToken(token: string): boolean {
  if (token.length === 0) return false;
  // Pure wildcard forms used as "match-all" matchers.
  if (token === "*" || token === ".*" || token === "**") return false;
  // Contains regex alternation — a combined matcher, not a single tool name.
  if (token.includes("|")) return false;
  // Contains a parenthesised group `(…)` — regex, not a tool name.
  if (token.includes("(") || token.includes(")")) return false;
  // Contains a `[` — character class; skip.
  if (token.includes("[")) return false;
  // A leading `^` or trailing `$` — anchored regex.
  if (token.startsWith("^") || token.endsWith("$")) return false;
  // Leading `.*` — regex prefix; always a pattern.
  if (token.startsWith(".*")) return false;
  // A trailing `.*`/`*` is a glob/regex suffix on a plain TOOL matcher (`Bash.*`,
  // `Read*`) → skip. But for an MCP-ish token the trailing wildcard is EXACTLY
  // what we must inspect: `mcp__server__.*` is the legitimate match-all-tools
  // form, and `mcp_memory_*` is the classic single-underscore typo we want to
  // catch — so do NOT skip a wildcard suffix on an `mcp`-ish token.
  if (!looksMcpIsh(token) && (token.endsWith(".*") || token.endsWith("*")))
    return false;
  return true;
}

/**
 * A token starts with `mcp` (case-insensitive) and contains at least one
 * `_` (making it look like an MCP tool reference, not a harness built-in).
 */
function looksMcpIsh(token: string): boolean {
  return /^mcp[_-]/i.test(token);
}

/**
 * Whether `token` matches the canonical `mcp__<server>__<rest>` double-
 * underscore shape (the valid MCP matcher form). We use the dialect's own
 * `mcpToolPattern` extended to allow trailing `.*` for wildcard matchers,
 * since a hook `matcher` may be `mcp__server__.*` (match-all-tools-on-server).
 */
function isValidMcpForm(token: string, dialect: HarnessDialect): boolean {
  // The canonical pattern from the dialect: `mcp__server__tool`.
  if (dialect.mcpToolPattern.test(token)) return true;
  // Also allow the wildcard suffix form `mcp__server__.*`.
  if (/^mcp__[a-z0-9_-]+__\.\*$/i.test(token)) return true;
  return false;
}

/**
 * Attempt to recover the server segment from a malformed MCP token so we can
 * suggest the corrected `mcp__<server>__.*` form. Returns null when no
 * segment can be confidently recovered.
 *
 * Handles:
 *   - Single-underscore: `mcp_memory_search` → server=`memory`, tool=`search`
 *   - Hyphenated:        `mcp-memory-search` → server=`memory`, tool=`search`
 *   - Glob suffix:       `mcp_memory_*`       → server=`memory`
 *   - Mixed:             `mcp__memory_*`      → only one `__` segment found
 */
function recoverMcpServer(token: string): string | null {
  // Strip a leading `mcp` and then a separator (`__`, `_`, `-`).
  const rest = token.replace(/^mcp(?:__|_|-)/i, "");
  if (!rest || rest === token) return null;

  // Split on single underscores or hyphens (not `__`) to get the next segment.
  // We want the first non-empty segment after the `mcp` prefix separator.
  const segments = rest.split(/(?<!_)_(?!_)|(?<!-)(?:-(?!-))/);
  const server = segments[0];
  if (!server || server.length === 0) return null;

  // Reject segments that are clearly numeric-only or single chars (too ambiguous).
  if (/^\d+$/.test(server)) return null;

  return server;
}

// ---------------------------------------------------------------------------
// Public detector
// ---------------------------------------------------------------------------

/**
 * Verify hook-matcher strings for the three forms that silently never fire.
 * Returns one {@link HookMatcherFinding} per offending entry. De-duplicates
 * repeated matchers. Returns `[]` when all matchers are FP-safe to skip or
 * are correct.
 */
export function hookMatcherIssues(
  entries: readonly HookMatcherEntry[],
  declaredServers: readonly string[],
  dialect: HarnessDialect,
): HookMatcherFinding[] {
  const findings: HookMatcherFinding[] = [];
  const seen = new Set<string>();

  for (const { matcher } of entries) {
    // De-dupe repeated matchers across entries.
    if (seen.has(matcher)) continue;
    seen.add(matcher);

    // Skip wildcards, alternation, regex patterns — FP-safety.
    if (!isInspectableToken(matcher)) continue;

    // ── kind: mcp-form ──────────────────────────────────────────────────────
    // The token looks MCP-ish but is NOT the valid double-underscore form.
    if (looksMcpIsh(matcher)) {
      if (!isValidMcpForm(matcher, dialect)) {
        const server = recoverMcpServer(matcher);
        const suggestion = server ? `mcp__${server}__.*` : undefined;
        const hintPart =
          suggestion !== undefined
            ? ` Did you mean "${suggestion}"?`
            : " Use the form `mcp__<server>__<tool>` (double underscores).";
        findings.push({
          matcher,
          kind: "mcp-form",
          ...(suggestion !== undefined ? { suggestion } : {}),
          message: `Hook matcher "${matcher}" is not a valid MCP tool reference (requires double underscores: \`mcp__server__tool\`).${hintPart}`,
        });
        continue;
      }

      // ── kind: mcp-undeclared ──────────────────────────────────────────────
      // A correctly-formed MCP token whose server isn't in the declared set.
      // Guard 1: no declared set → skip (reaches global/project servers).
      if (declaredServers.length === 0) continue;

      const server = mcpToolServer(matcher, dialect);
      if (server === null) continue; // plugin-namespaced form → guard 3, skip

      const known = new Set<string>([
        ...declaredServers,
        ...(dialect.knownMcpServers ?? []),
      ]);

      // Guard 2: built-in server → skip.
      if (known.has(server)) continue;

      findings.push({
        matcher,
        kind: "mcp-undeclared",
        message: `Hook matcher "${matcher}" references MCP server "${server}", which the plugin doesn't declare (declared: ${declaredServers.join(", ")}) — the hook can't fire.`,
      });
      continue;
    }

    // ── kind: tool-typo ─────────────────────────────────────────────────────
    // A bare token that is NOT an exact built-in tool but IS a close typo of one.
    const knownTools = new Set(dialect.builtinAgentTools);
    if (knownTools.has(matcher)) continue; // exact match → no issue

    // Reuse the same ≤ 2 edit-distance helper from tool-contract.ts.
    const near = closestTool(matcher, dialect);
    if (near === null) continue; // far/unknown → likely a plugin tool, not a typo

    findings.push({
      matcher,
      kind: "tool-typo",
      suggestion: near,
      message: `Hook matcher "${matcher}" doesn't match any built-in tool — the hook silently never fires. Did you mean "${near}"?`,
    });
  }

  return findings;
}
