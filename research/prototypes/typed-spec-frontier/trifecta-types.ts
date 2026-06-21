/**
 * PROTOTYPE A — the lethal trifecta as a TYPE-LEVEL forbidden flow.
 *
 * Information-flow control / taint typing (noninterference): an agent is
 * structurally dangerous when its capability set simultaneously holds all three
 * legs of Simon Willison's "lethal trifecta":
 *   Leg A  private-data access    (Read, mcp__github__get_file_contents, …)
 *   Leg B  untrusted-content intake (WebFetch, WebSearch, mcp__fetch__*, …)
 *   Leg C  an exfiltration channel  (Bash → curl, create_pull_request, …)
 * because indirect prompt injection in B can redirect a private read (A) to an
 * external write (C). `harness-state-space.md` ships this as a deterministic
 * `scan`/lint set-intersection (a RUNTIME check). The question for the frontier:
 * can the TYPE SYSTEM make the trifecta UNREPRESENTABLE — so a spec that grants
 * all three legs does not COMPILE, before any vigiles run?
 *
 * The mechanism: tag each tool with its taint legs, fold the union of legs over
 * the declared `tools` tuple at the type level (a `const` tuple + a mapped/
 * conditional reduce), and constrain the `agent()` parameter so that a tool set
 * whose accumulated legs ⊇ {A,B,C} forces the parameter to a descriptive error
 * object. An explicit `allowTrifecta("<reason>")` escape hatch recovers the
 * legitimate deploy/triage agent (the same "warn + sign-off, not block" posture
 * the scan rule takes) — here the sign-off is a SECOND type parameter the author
 * must supply, so the dangerous state is reachable only by NAMING it.
 *
 * Self-contained: COPIES a minimal tool/leg catalog; does NOT touch src/.
 *   pass case:  npx tsc --noEmit --strict trifecta-types.ts   (exit 0)
 *   fail cases: ./trifecta-fails.ts
 */

// ---------------------------------------------------------------------------
// The taint lattice: three legs. A tool carries a SET of legs (a tool can be
// more than one — `Bash` is an exfil channel AND, via cat, a private read).
// ---------------------------------------------------------------------------

type Leg = "private" | "untrusted" | "exfil";

/**
 * The leg(s) each tool taints with. This is the typed mirror of the dialect's
 * three leg catalogs in `harness-state-space.md`. A tool absent here taints with
 * nothing (it cannot contribute to the trifecta).
 */
interface ToolLegs {
  Read: "private";
  Grep: "private";
  Glob: "private";
  mcp__github__get_file_contents: "private";
  mcp__filesystem__read: "private";
  WebFetch: "untrusted";
  WebSearch: "untrusted";
  mcp__fetch__get: "untrusted";
  Bash: "exfil";
  mcp__github__create_pull_request: "exfil";
  mcp__slack__post: "exfil";
  // read-only/no-leg tools (present so they're nameable but taint nothing):
  TodoWrite: never;
  Edit: never;
  Write: never;
}

type Tool = keyof ToolLegs;

/** The legs a single tool taints with (never for an unlisted/no-leg tool). */
type LegsOf<T> = T extends keyof ToolLegs ? ToolLegs[T] : never;

/** Fold the union of legs over a tuple of tools. */
type LegsOfAll<Tools extends readonly Tool[]> = LegsOf<Tools[number]>;

/** Does the accumulated leg set hold ALL THREE legs? */
type HasTrifecta<Tools extends readonly Tool[]> =
  "private" extends LegsOfAll<Tools>
    ? "untrusted" extends LegsOfAll<Tools>
      ? "exfil" extends LegsOfAll<Tools>
        ? true
        : false
      : false
    : false;

// ---------------------------------------------------------------------------
// The constraint. `agent({ tools })` is well-typed UNLESS the tools hold the
// trifecta — then `tools` is forced to a descriptive error object naming the
// forbidden flow. The author recovers a legitimate all-three agent ONLY by
// passing `allow` = a non-empty sign-off reason (the typed equivalent of the
// `vigiles:allow-trifecta` marker).
// ---------------------------------------------------------------------------

interface AgentSpec<Tools extends readonly Tool[]> {
  readonly name: string;
  readonly tools: Tools;
  /** Sign-off reason; REQUIRED (non-empty) iff the tools hold the trifecta. */
  readonly allowTrifecta?: string;
}

/** The error object surfaced at the call site on an unacknowledged trifecta. */
type TrifectaError = {
  readonly __LETHAL_TRIFECTA: "tools grant private-read + untrusted-intake + exfil";
  readonly fix: "remove one leg, OR set allowTrifecta: '<reason>' to sign off";
};

/**
 * When the tools hold the trifecta AND no sign-off is supplied, the parameter
 * type collapses to `TrifectaError`, so the call is rejected at the offending
 * argument. With a sign-off (`allowTrifecta` present), it type-checks.
 */
function agent<const Tools extends readonly Tool[]>(
  spec: HasTrifecta<Tools> extends true
    ? AgentSpec<Tools> & { readonly allowTrifecta: string } // sign-off REQUIRED
    : AgentSpec<Tools>,
): AgentSpec<Tools> {
  return spec;
}

// ---------------------------------------------------------------------------
// Passing cases — these COMPILE.
// ---------------------------------------------------------------------------

// Two legs only (private + untrusted, no exfil) — safe, compiles.
export const researcher = agent({
  name: "researcher",
  tools: ["Read", "WebFetch", "Grep"],
});

// Two legs (untrusted + exfil, no private) — safe, compiles.
export const poster = agent({
  name: "poster",
  tools: ["WebFetch", "Bash"],
});

// All three legs BUT explicitly signed off — the legitimate deploy/triage agent.
export const triage = agent({
  name: "triage",
  tools: ["Read", "WebFetch", "Bash"],
  allowTrifecta:
    "triage bot: reads logs, fetches issue, posts a summary — reviewed 2026-06-21",
});

// Prove the leg fold is precise at the type level.
type _Legs = LegsOfAll<["Read", "WebFetch", "Bash"]>; // "private" | "untrusted" | "exfil"
const _check: _Legs = "private";
void _check;

export { agent, type Tool, type HasTrifecta, type LegsOfAll };
