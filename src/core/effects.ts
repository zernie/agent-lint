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
 * SURFACE vs FLOOR — two related but distinct questions, intentionally. The
 * `effectSurface` above is the STATIC surface: it can't see a `Bash` command, so
 * any `Bash` makes the surface `unrestricted` (honest — statically unbounded).
 * The purity FLOOR (`purityViolations` / `decidePurityGate`) is what's
 * ENFORCED, and `bounded` admits `Bash` because the runtime gate refines it by
 * command (`isReadOnlyBash`). So a `bounded`-declared unit with `Bash` reports an
 * `unrestricted` surface yet enforces a `bounded` floor — the runtime gate is
 * exactly what closes that gap.
 *
 * ONE pure detector (`one-detector-no-drift`), dialect injected (core ⊄
 * adapter). The composition root passes `claudeCodeDialect` / `codexDialect`.
 *
 * See `research/side-effect-separation.md` for the full design rationale.
 */
import type { HarnessDialect } from "./dialect.js";
import { assertNever } from "./assert-never.js";
import { isReadOnlyBash } from "./bash-effects.js";

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
 * Returns the violations of a DECLARED purity floor — the tools that make the
 * actual effect surface LOOSER than the declared level. Empty ⇒ the contract
 * honours the declared level. The `message` on each is actionable (names the
 * tool, the effect class, and what to do).
 *
 * What counts as a violation depends on `declared`:
 * - `"pure"`:         every side-effecting tool (incl. `Bash`), every
 *                     unknown-effect tool, and any wildcard (a pure unit may
 *                     only observe — no `Bash`, no effects, fully static).
 * - `"bounded"`:      only the truly UNBOUNDED tools — unknown-effect (MCP /
 *                     unrecognized) and wildcards. Every decidable side-effecting
 *                     tool is ALLOWED: Write/Edit confine to the boundary, and
 *                     `Bash` is admitted because the RUNTIME gate
 *                     (`decidePurityGate`) refines it by command (read-only Bash
 *                     is an observation; a mutating command is denied).
 * - `"unrestricted"`: never a violation (the rung carries no constraint).
 *
 * A wildcard (`"*"` / `""`) contract is a violation at every constrained level:
 * "inherits-all" grants every tool, so neither `pure` nor `bounded` can hold.
 */
export function purityViolations(
  tools: readonly string[],
  dialect: HarnessDialect,
  declared: PurityLevel,
): PureViolation[] {
  if (declared === "unrestricted") return []; // no constraint to violate
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
          message: `${key} (inherits-all) is not allowed in a ${declared} contract — it grants access to every tool, including side-effecting ones. Declare explicit tools instead.`,
        });
      }
      continue;
    }

    if (seen.has(base)) continue;
    const effect = classifyToolEffect(raw, dialect);

    switch (effect) {
      case "read-only":
        break; // allowed at every level
      case "unknown":
        seen.add(base);
        violations.push({
          tool: base,
          effect,
          message: `"${base}" has unknown effect class (MCP or unrecognized tool); a ${declared} contract cannot declare it — its effects are unbounded from static analysis. Remove it or declare the unit dangerously-unrestricted.`,
        });
        break;
      case "side-effecting":
        // In a BOUNDED unit every decidable side-effecting tool is allowed:
        // Write/Edit confine to the boundary, and `Bash` is admitted because the
        // RUNTIME gate (`decidePurityGate`) refines it by command — a read-only
        // Bash is an observation, a mutating command is denied. Only `pure` bars
        // them (a pure unit may only observe; no `Bash`, no effects).
        if (declared === "bounded") break;
        seen.add(base);
        violations.push({
          tool: base,
          effect,
          message:
            base === "Bash"
              ? `"Bash" is undecidable at the tool-name level; a pure unit cannot declare it. A read-only Bash belongs in a bounded unit (the runtime gate confines it by command) — declare the unit bounded or dangerously-unrestricted.`
              : `"${base}" is side-effecting; a pure unit cannot declare it. Remove it or declare the unit bounded.`,
        });
        break;
      default:
        assertNever(effect);
    }
  }

  return violations;
}

/**
 * The violations of a `purity: "pure"` contract — every side-effecting,
 * unknown-effect, or wildcard tool. A thin alias for `purityViolations(…,
 * "pure")` kept for the common pure case.
 */
export function pureContractViolations(
  tools: readonly string[],
  dialect: HarnessDialect,
): PureViolation[] {
  return purityViolations(tools, dialect, "pure");
}

// ---------------------------------------------------------------------------
// The runtime half — the live-call purity gate
// ---------------------------------------------------------------------------

/** A runtime allow/deny decision for the PreToolUse purity gate. */
export interface PurityGateDecision {
  readonly allow: boolean;
  /** Reason fed back to the model on a deny; empty on allow. */
  readonly message: string;
}

/**
 * The RUNTIME half of the purity contract: decide whether a single LIVE tool
 * call is allowed under the active unit's declared purity floor.
 *
 * Unlike `purityViolations` (which checks the DECLARED tools contract
 * statically), this sees the ACTUAL call — including the `Bash` command string —
 * so it refines `Bash` by effect via `isReadOnlyBash`. That command is the whole
 * reason the gate's home is the runtime hook: only here is the concrete command
 * visible (the static surface sees a tool name + a `Bash(git:*)` pattern, never
 * the command).
 *
 * Rules (the ladder, command-refined):
 * - `unrestricted` → always allow (no constraint).
 * - read-only tool → allow at every level.
 * - `Bash` → allow iff the command is provably read-only (an observation);
 *   otherwise deny — a mutating/undecidable command's effect must move to a
 *   marked boundary. Same at `pure` and `bounded`.
 * - other side-effecting tool (Write, Edit, …) → allow under `bounded`
 *   (a decidable, boundary-confined effect), deny under `pure` (observe-only).
 * - unknown-effect (MCP / unrecognized) → deny under `pure`/`bounded`
 *   (unbounded from static analysis).
 *
 * Dialect injected (core ⊄ adapter). Reuses `classifyToolEffect` +
 * `isReadOnlyBash` — one-detector-no-drift with compile + scan.
 */
export function decidePurityGate(
  declared: PurityLevel,
  tool: string,
  command: string | undefined,
  dialect: HarnessDialect,
): PurityGateDecision {
  if (declared === "unrestricted") return { allow: true, message: "" };

  const base = baseTool(tool);
  const effect = classifyToolEffect(tool, dialect);

  if (effect === "read-only") return { allow: true, message: "" };

  if (base === "Bash") {
    if (command !== undefined && isReadOnlyBash(command)) {
      return { allow: true, message: "" };
    }
    const shown = command ? `"${command}" ` : "";
    return {
      allow: false,
      message:
        `Bash command ${shown}is not provably read-only; a ${declared} unit may run only read-only Bash ` +
        `(observation). Move the side effect into a marked boundary, or declare the unit dangerously-unrestricted.`,
    };
  }

  if (effect === "side-effecting") {
    if (declared === "bounded") return { allow: true, message: "" };
    return {
      allow: false,
      message:
        `"${base}" is side-effecting; a pure unit may only observe. ` +
        `Declare the unit bounded (or dangerously-unrestricted) to use it.`,
    };
  }

  // unknown — MCP / unrecognized tool
  return {
    allow: false,
    message:
      `"${base}" has unknown effect class; a ${declared} unit cannot use it — its effects are unbounded. ` +
      `Declare the unit dangerously-unrestricted to allow it.`,
  };
}
