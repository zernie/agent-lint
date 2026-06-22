/**
 * EXPERIMENTAL prototype — typed, safe-by-construction harness GUARDS.
 *
 * Dogfood finding (real OSS hooks: our pre-edit.sh, superpowers/OMC session-start,
 * OMC keyword-detector): a "hook" today is an arbitrary shell command in
 * settings.json — which is BOTH the enforcement vehicle AND the RCE footgun
 * (CVE-2025-59536: a malicious repo's hook runs before the trust dialog). Arbitrary
 * hook safety is UNDECIDABLE (Rice). So this prototype inverts it: you don't WRITE a
 * hook, you DECLARE a guard from a closed, audited vocabulary, and vigiles GENERATES
 * the hooks block — whose command is vigiles's OWN gate (`vigiles guard-hook`), never
 * user shell. Safe-by-construction, not safe-by-analysis.
 *
 * Covers the real PreToolUse patterns + the new ORDER axis:
 *   - block:        deny a tool call matching args (reproduces pre-edit.sh's intent)
 *   - requireBefore: ORDER — deny a tool call until a prerequisite call has fired
 *                    (`terraform destroy` only after `terraform plan`; the moat)
 *   - confine:      deny a path-taking tool whose path escapes an allowlist (rm -rf /)
 *
 * NOT wired into the public API or the CLI yet — a sketch to see what's achievable.
 * The pure `decideGuards` is the runtime half (a `guard-hook` CLI would call it with
 * the live event + the reconstructed prior-call ledger); `compileGuards` is the
 * generator half. See research/harness-protocol-flow-moat.md.
 */

import { matchesArgs, describeArgs, type ArgMatcher } from "../arg-match.js";

/** A tool-call shape: a tool name + an optional argument matcher (the `when`). */
export interface ToolPattern {
  readonly tool: string;
  readonly when?: ArgMatcher;
}

export type Guard =
  | {
      readonly kind: "block";
      readonly target: ToolPattern;
      readonly reason: string;
    }
  | {
      readonly kind: "requireBefore";
      readonly target: ToolPattern;
      /** The prerequisite call that must have fired earlier this session. */
      readonly prerequisite: ToolPattern;
      readonly reason?: string;
    }
  | {
      readonly kind: "confine";
      readonly tools: readonly string[];
      /** Dot-path to the path argument (default `file_path`). */
      readonly pathKey?: string;
      /** Allowed path prefixes (a call outside ALL of them is denied). */
      readonly allow: readonly string[];
      readonly reason?: string;
    };

/** Ergonomic builders for the closed vocabulary. */
export const guard = {
  block: (target: ToolPattern, reason: string): Guard => ({
    kind: "block",
    target,
    reason,
  }),
  requireBefore: (
    target: ToolPattern,
    prerequisite: ToolPattern,
    reason?: string,
  ): Guard => ({ kind: "requireBefore", target, prerequisite, reason }),
  confine: (
    tools: readonly string[],
    allow: readonly string[],
    reason?: string,
    pathKey?: string,
  ): Guard => ({ kind: "confine", tools, allow, reason, pathKey }),
};

/** A tool call as seen at PreToolUse (and as recorded in the prior-call ledger). */
export interface ToolEvent {
  readonly tool: string;
  readonly input: unknown;
}

export interface GuardDecision {
  readonly allow: boolean;
  /** Set on a deny — the message surfaced to the agent. */
  readonly reason?: string;
}

const ALLOW: GuardDecision = { allow: true };
const deny = (reason: string): GuardDecision => ({ allow: false, reason });

const matchesPattern = (e: ToolEvent, p: ToolPattern): boolean =>
  e.tool === p.tool && (p.when === undefined || matchesArgs(e.input, p.when));

/** A path is confined if it sits under at least one allowed prefix. */
function isConfined(path: string, allow: readonly string[]): boolean {
  const norm = path.replace(/^\.\//, "");
  return allow.some((a) => {
    const base = a.replace(/\/?\*+$/, "").replace(/\/$/, "");
    return base === "" || norm === base || norm.startsWith(base + "/");
  });
}

/** Decide a single guard against the event (null = this guard doesn't apply). */
function decideOne(
  g: Guard,
  event: ToolEvent,
  prior: readonly ToolEvent[],
): GuardDecision | null {
  switch (g.kind) {
    case "block":
      return matchesPattern(event, g.target) ? deny(g.reason) : null;
    case "requireBefore":
      if (!matchesPattern(event, g.target)) return null;
      if (prior.some((c) => matchesPattern(c, g.prerequisite))) return null;
      return deny(
        g.reason ??
          `${describePattern(g.target)} requires ${describePattern(g.prerequisite)} first`,
      );
    case "confine": {
      if (!g.tools.includes(event.tool)) return null;
      const path = (event.input as Record<string, unknown> | null)?.[
        g.pathKey ?? "file_path"
      ];
      if (typeof path !== "string" || isConfined(path, g.allow)) return null;
      return deny(
        g.reason ??
          `${event.tool} path "${path}" is outside the allowed set [${g.allow.join(", ")}]`,
      );
    }
  }
}

/**
 * The pure runtime gate: decide allow/deny for `event`, given the guards and the
 * calls that already fired this session (`prior`, oldest-first — the ledger the
 * `guard-hook` CLI reconstructs from the transcript). First match wins a deny.
 */
export function decideGuards(
  guards: readonly Guard[],
  event: ToolEvent,
  prior: readonly ToolEvent[] = [],
): GuardDecision {
  for (const g of guards) {
    const d = decideOne(g, event, prior);
    if (d) return d;
  }
  return ALLOW;
}

const describePattern = (p: ToolPattern): string =>
  p.when ? `${p.tool}(${describeArgs(p.when)})` : p.tool;

/** Every tool name a guard set gates (the PreToolUse matcher union). */
export function guardedTools(guards: readonly Guard[]): string[] {
  const tools = new Set<string>();
  for (const g of guards) {
    if (g.kind === "confine") for (const t of g.tools) tools.add(t);
    else tools.add(g.target.tool);
  }
  return [...tools].sort();
}

/** A Claude Code settings `hooks` block (the generated artifact). */
export interface HooksConfig {
  readonly hooks: {
    readonly PreToolUse: readonly {
      readonly matcher: string;
      readonly hooks: readonly {
        readonly type: "command";
        readonly command: string;
      }[];
    }[];
  };
}

/**
 * Generate the hooks block for a guard set. The command is vigiles's OWN gate
 * (default `npx vigiles guard-hook`), NOT user shell — so the generated enforcement
 * is safe-by-construction and a repo can't smuggle an arbitrary RCE hook. The gate
 * reads the same guard set + the live event and runs `decideGuards`.
 */
export function compileGuards(
  guards: readonly Guard[],
  gateCommand = "npx vigiles guard-hook",
): HooksConfig {
  const matcher = guardedTools(guards).join("|");
  return {
    hooks: {
      PreToolUse: [
        { matcher, hooks: [{ type: "command", command: gateCommand }] },
      ],
    },
  };
}
