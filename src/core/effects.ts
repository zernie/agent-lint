/**
 * Static effect-surface analysis — the `pure:` contract and the purity ladder.
 *
 * An agent's side effects ARE its tool calls. The read-only vs side-effecting
 * split is a PUBLISHED catalog (`dialect.sideEffectingTools`), so this analysis
 * is fully deterministic — no model needed. The result answers "how constrained
 * is this skill/agent's declared tool contract?" at three rungs:
 *
 *   **pure**       — no side-effecting tools; the skill can only observe, not
 *                    mutate. Deterministically testable with no mocks.
 *   **bounded**    — has decidable side-effecting tools (Edit, Write, …) but
 *                    none that are undecidable (`Bash`) or unknown-effect (MCP).
 *                    The side-effect surface is finite and enumerable.
 *   **unrestricted** — has `Bash` (undecidable) or an unknown-effect tool (MCP
 *                    or unclassified), or declares `"*"` / inherits-all. The
 *                    actual effect surface is unbounded from static analysis
 *                    alone; "unrestricted" is the honest report.
 *
 * ONE pure detector (`one-detector-no-drift`), dialect injected (core ⊄
 * adapter). The composition root passes `claudeCodeDialect` / `codexDialect`.
 *
 * See `research/side-effect-separation.md` for the full design rationale.
 */
import type { HarnessDialect } from "./dialect.js";
import { assertNever } from "./hash.js";

/** The effect class of a single tool from a declared `tools:` contract. */
export type ToolEffect = "read-only" | "side-effecting" | "unknown";

/**
 * The three rungs of the purity ladder. See module-level JSDoc for semantics.
 *
 * - `"pure"`:         no side-effecting tools, no unknown-effect tools, no wildcard.
 * - `"bounded"`:      has side-effecting tools, none of which are `Bash` or unknown.
 * - `"unrestricted"`: has `Bash`, any unknown-effect tool, or a wildcard (`"*"` /
 *                     inherits-all) that can reach effects.
 */
export type PurityLevel = "pure" | "bounded" | "unrestricted";

/**
 * The aggregated effect surface of a declared `tools:` contract.
 *
 * Fields are de-duplicated: a tool listed twice appears at most once per bucket.
 */
export interface EffectSurface {
  /** Built-in read-only tools in the contract (Read, Grep, Glob, …). */
  readonly readOnly: readonly string[];
  /** Built-in tools that produce side effects (Bash, Write, Edit, …). */
  readonly sideEffecting: readonly string[];
  /**
   * Tools whose effect class cannot be determined statically: MCP tools
   * (`mcp__server__tool`) and any tool name the dialect does not recognize.
   * These make purity `"unrestricted"` because the surface is unknown.
   */
  readonly unknown: readonly string[];
  /**
   * The overall purity of the contract:
   * - `"pure"`:         `sideEffecting` and `unknown` are both empty, no wildcard.
   * - `"bounded"`:      `sideEffecting` is non-empty, `unknown` is empty, no `Bash`.
   * - `"unrestricted"`: `Bash` present, OR `unknown` is non-empty, OR the contract
   *                     is `"*"` / inherits-all (can reach any tool, including effects).
   *
   * A wildcard (`"*"` or `""`) contract is always `"unrestricted"` — it grants
   * access to all tools including every side-effecting one.
   */
  readonly purity: PurityLevel;
}

/**
 * A violation record for `pureContractViolations` — a single tool in a
 * declared `pure:` contract that is side-effecting or unknown-effect.
 */
export interface PureViolation {
  /** The base tool name (restriction suffix already stripped). */
  readonly tool: string;
  /** Why this tool violates a pure contract. */
  readonly effect: ToolEffect;
  /** A ready-to-show, actionable message. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strips a `Tool(restriction)` suffix and returns the base tool name. */
function baseTool(raw: string): string {
  return raw.split("(")[0].trim();
}

/** Returns true for the wildcard sentinels that mean "inherits-all". */
function isWildcard(tool: string): boolean {
  return tool === "" || tool === "*";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the effect of ONE tool name against a dialect's known catalogs.
 *
 * A `Tool(restriction)` suffix (e.g. `Bash(git:*)`) is stripped first — the
 * restriction narrows what the tool can DO but doesn't change its effect class
 * (Bash with any restriction is still conservatively side-effecting).
 *
 * Classification rules (in priority order):
 *  1. In `dialect.sideEffectingTools`  → `"side-effecting"`
 *  2. In `dialect.builtinAgentTools` (and NOT side-effecting) → `"read-only"`
 *  3. Matches `dialect.mcpToolPattern` → `"unknown"` (MCP tools are not
 *     classifiable from the name alone — treated as unknown-effect)
 *  4. Otherwise → `"unknown"` (unrecognized tool; may be a plugin tool or a typo)
 */
export function classifyToolEffect(
  tool: string,
  dialect: HarnessDialect,
): ToolEffect {
  const base = baseTool(tool);
  const sideEffecting = dialect.sideEffectingTools ?? [];
  if (sideEffecting.includes(base)) return "side-effecting";
  if (dialect.builtinAgentTools.includes(base)) return "read-only";
  if (dialect.mcpToolPattern.test(base)) return "unknown";
  return "unknown";
}

/**
 * Compute the static effect surface of a declared `tools:` contract.
 *
 * `"*"` / `""` (inherits-all) entries make purity `"unrestricted"` because the
 * contract grants access to all tools including every side-effecting one — the
 * full surface is unknowable statically. They are NOT listed in any bucket
 * (they represent a wildcard, not a named tool).
 *
 * De-duplication: a tool name that appears more than once in `tools` is counted
 * once in its bucket (base tool after restriction stripping).
 */
export function effectSurface(
  tools: readonly string[],
  dialect: HarnessDialect,
): EffectSurface {
  const readOnly = new Set<string>();
  const sideEffecting = new Set<string>();
  const unknown = new Set<string>();
  let hasWildcard = false;
  let hasBash = false;

  for (const raw of tools) {
    const base = baseTool(raw);
    if (isWildcard(base)) {
      hasWildcard = true;
      continue; // wildcards don't go into any named bucket
    }
    const effect = classifyToolEffect(raw, dialect);
    switch (effect) {
      case "read-only":
        readOnly.add(base);
        break;
      case "side-effecting":
        sideEffecting.add(base);
        if (base === "Bash") hasBash = true;
        break;
      case "unknown":
        unknown.add(base);
        break;
      default:
        assertNever(effect);
    }
  }

  const purity: PurityLevel =
    hasWildcard || hasBash || unknown.size > 0
      ? "unrestricted"
      : sideEffecting.size > 0
        ? "bounded"
        : "pure";

  return {
    readOnly: [...readOnly],
    sideEffecting: [...sideEffecting],
    unknown: [...unknown],
    purity,
  };
}

/**
 * Returns the violations in a declared `pure:` contract — every tool that is
 * side-effecting or unknown-effect. An empty result means the contract is
 * genuinely pure.
 *
 * A wildcard (`"*"` / `""`) contract is always a violation: "inherits-all"
 * grants access to every side-effecting tool, making purity unenforceable.
 *
 * The `message` on each violation is actionable — it names the tool, explains
 * the effect class, and tells the author what to do.
 */
export function pureContractViolations(
  tools: readonly string[],
  dialect: HarnessDialect,
): PureViolation[] {
  const violations: PureViolation[] = [];
  const seen = new Set<string>();

  for (const raw of tools) {
    const base = baseTool(raw);

    if (isWildcard(base)) {
      const key = base === "" ? '""' : '"*"';
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({
          tool: base,
          effect: "side-effecting",
          message: `${key} (inherits-all) is not allowed in a pure contract — it grants access to every side-effecting tool. Declare only specific read-only tools instead.`,
        });
      }
      continue;
    }

    if (seen.has(base)) continue;
    const effect = classifyToolEffect(raw, dialect);

    switch (effect) {
      case "read-only":
        // No violation — pure contracts may declare read-only tools.
        break;
      case "side-effecting":
        seen.add(base);
        violations.push({
          tool: base,
          effect,
          message: `"${base}" is side-effecting; a pure skill cannot declare it. Remove it or downgrade the skill to bounded/unrestricted.`,
        });
        break;
      case "unknown":
        seen.add(base);
        violations.push({
          tool: base,
          effect,
          message: `"${base}" has unknown effect class (MCP or unrecognized tool); a pure skill cannot declare it — unknown tools may be side-effecting. Remove it or downgrade the skill to bounded/unrestricted.`,
        });
        break;
      default:
        assertNever(effect);
    }
  }

  return violations;
}
