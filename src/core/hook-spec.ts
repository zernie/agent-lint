/**
 * SPIKE — typed, effect-classified HOOKS (the "type-safe bash" angle).
 *
 * A Claude Code / Codex hook today is hand-written shell in settings.json. Two
 * silent footguns dominate, and both are exactly what a COMPILER catches:
 *
 *  1. WRONG-FIELD EXTRACTION (silent no-op). A PreToolUse event's `tool_input`
 *     shape depends on the matched tool — `Bash` carries `command`, `Edit`/`Write`
 *     carry `file_path`. A hook that matches `Bash` but does
 *     `jq '.tool_input.file_path'` extracts EMPTY forever and never fires; nothing
 *     tells you. `validateHook` makes "read a field the matched tool never provides"
 *     an error, and the typed `hookFor` builder makes it a tsc error at edit time.
 *
 *  2. EFFECT MISDECLARATION ("type-safe bash"). A hook declared observe-only (a
 *     read-only gate/checker) that actually RUNS a mutating command — `eslint --fix`,
 *     `git push` — is a side effect masquerading as an observation. We already own a
 *     deterministic Bash-effect classifier (`bash-effects.ts`), so the command's
 *     effect class becomes a TYPE: an `effect: "observe"` hook whose `run` command
 *     classifies as side-effecting/undecidable does NOT compile. No other plugin
 *     tool has the classifier to make that judgment.
 *
 * Pure core, harness-agnostic: the per-tool field catalog is INJECTED (a Codex hook
 * has different fields), and the Bash classifier is the harness-neutral one. The CC
 * field catalog + the typed edit-time builder live in the test (no CC literal in core).
 *
 * NOT wired to the CLI/public API — a spike to see whether the compile step earns its
 * keep on the hook surface. See research/harness-protocol-flow-moat.md.
 */
import { classifyBashCommand } from "./bash-effects.js";

/** A hook's declared side-effect posture. */
export type HookEffect = "observe" | "mutate";

/** A declared hook (the typed source the compiler reads). */
export interface HookSpec {
  /** The harness event, e.g. "PreToolUse" | "PostToolUse". */
  readonly event: string;
  /** The tool name(s) the hook matches, e.g. ["Bash"] or ["Edit", "Write"]. */
  readonly match: readonly string[];
  /** The `tool_input` fields the hook extracts (must exist on the matched tools). */
  readonly reads: readonly string[];
  /** Observe-only (a gate/checker) or allowed to mutate (an action runner). */
  readonly effect: HookEffect;
  /** Optional command the hook runs — classified against {@link effect}. */
  readonly run?: string;
}

/** Build a hook spec (the untyped on-ramp; see `hookFor` for the typed one). */
export const hook = (spec: HookSpec): HookSpec => spec;

/** tool name → the `tool_input` fields it carries (injected; harness-specific). */
export type ToolFieldCatalog = Record<string, readonly string[]>;

export interface HookIssue {
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface ValidateHookOptions {
  /** The per-tool `tool_input` field catalog for the active harness. */
  readonly toolFields: ToolFieldCatalog;
  /** The harness's known event names (optional — skips the event check if absent). */
  readonly events?: readonly string[];
}

/** Which matched tools actually carry `field`. */
function toolsProviding(
  field: string,
  match: readonly string[],
  toolFields: ToolFieldCatalog,
): string[] {
  return match.filter((t) => (toolFields[t] ?? []).includes(field));
}

/** Check 1 — every read field exists on the matched tool(s). */
function fieldIssues(
  spec: HookSpec,
  toolFields: ToolFieldCatalog,
): HookIssue[] {
  const out: HookIssue[] = [];
  for (const field of spec.reads) {
    const providers = toolsProviding(field, spec.match, toolFields);
    if (providers.length === 0) {
      out.push({
        severity: "error",
        message: `reads "${field}" but no matched tool (${spec.match.join("|")}) provides it — the extraction is always empty (silent no-op)`,
      });
    } else if (providers.length < spec.match.length) {
      const missing = spec.match.filter((t) => !providers.includes(t));
      out.push({
        severity: "warning",
        message: `reads "${field}", which ${missing.join("/")} does not carry — empty on those events`,
      });
    }
  }
  return out;
}

/** Check 2 — an observe-only hook's command must be provably read-only. */
function effectIssues(spec: HookSpec): HookIssue[] {
  if (spec.effect !== "observe" || spec.run === undefined) return [];
  const cls = classifyBashCommand(spec.run);
  if (cls === "read-only") return [];
  return [
    {
      severity: "error",
      message: `declared observe-only but its command is ${cls}: "${spec.run}" — an observe hook must not mutate (use effect:"mutate" or a read-only command)`,
    },
  ];
}

/**
 * Validate a hook spec — the compiler half. Flags wrong-field extraction (Check 1)
 * and effect misdeclaration (Check 2), plus an unknown event when `events` is given.
 * Pure; the same checks `compileHook` enforces before emitting.
 */
export function validateHook(
  spec: HookSpec,
  opts: ValidateHookOptions,
): HookIssue[] {
  const out: HookIssue[] = [];
  if (opts.events && !opts.events.includes(spec.event)) {
    out.push({
      severity: "error",
      message: `unknown event "${spec.event}" — it will never fire`,
    });
  }
  out.push(...fieldIssues(spec, opts.toolFields));
  out.push(...effectIssues(spec));
  return out;
}

/** A settings `hooks` block keyed by the spec's event (the generated artifact). */
export interface CompiledHook {
  readonly hooks: Record<
    string,
    readonly {
      readonly matcher: string;
      readonly hooks: readonly {
        readonly type: "command";
        readonly command: string;
      }[];
    }[]
  >;
  /** field → the extraction expression a generated hook would use (the typed read). */
  readonly extractions: Record<string, string>;
}

export class HookCompileError extends Error {}

/**
 * Compile a validated hook to its settings block. Refuses (throws) on any error-level
 * issue — "an unsafe hook doesn't compile" — so a wrong-field read or a mutating
 * observe-hook never ships. The `extractions` map shows the correctly-typed field
 * reads the generated hook uses (here as jq paths) — never a hand-typed `jq` string.
 */
export function compileHook(
  spec: HookSpec,
  opts: ValidateHookOptions & { gateCommand?: string },
): CompiledHook {
  const issues = validateHook(spec, opts);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new HookCompileError(
      `hook does not compile:\n  ${errors.map((e) => e.message).join("\n  ")}`,
    );
  }
  const command = opts.gateCommand ?? "npx vigiles guard-hook";
  const extractions: Record<string, string> = {};
  for (const field of spec.reads) extractions[field] = `.tool_input.${field}`;
  return {
    hooks: {
      [spec.event]: [
        {
          matcher: spec.match.join("|"),
          hooks: [{ type: "command", command }],
        },
      ],
    },
    extractions,
  };
}

// ---------------------------------------------------------------------------
// Typed edit-time builder — the "doesn't compile" half (Check 1 at tsc time)
// ---------------------------------------------------------------------------
//
// A harness supplies a field MAP type (tool name → its field-name union). `hookFor`
// then constrains `reads` to the fields the matched tools actually carry, so reading
// the wrong field is a TYPE error before anything runs. The runtime `validateHook`
// stays the backstop (it does the precise per-tool all/partial check a union type
// can't), exactly like typed purity over `decidePurityGate`.

/**
 * The typed source for a hook over a field map `M` (tool → field-union) and the
 * matched tool(s) `T`. `reads` is constrained to the fields of `T` — a field absent
 * from the matched tool is a tsc error. `M` stays unconstrained so a plain interface
 * (no index signature) works as the field map.
 */
export interface TypedHookSpec<M, T extends keyof M & string> {
  readonly event: string;
  readonly match: readonly T[];
  readonly reads: readonly Extract<M[T], string>[];
  readonly effect: HookEffect;
  readonly run?: string;
}

/** Build a typed hook; `reads` outside the matched tool's field-union won't compile. */
export function hookFor<M, T extends keyof M & string>(
  spec: TypedHookSpec<M, T>,
): HookSpec {
  return spec as HookSpec;
}
