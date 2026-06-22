/**
 * SPIKE — a hook as a CONSTRAINED TYPED PROGRAM, not arbitrary shell.
 *
 * The probe behind research/hook-pain-points.md's "compiled hooks" thread. A hook
 * today is opaque shell (`bash guard.sh`) — un-analyzable (Rice), and the author
 * hand-writes the fragile parts (exit code, JSON field, a `grep` matcher) that the
 * verified #1 pains come from. Invert it: the author writes a PURE typed function
 * `(event) => Decision` against a CLOSED API; vigiles compiles it. The constraint is
 * what buys testability / safety / evaluation / portability:
 *
 *  - TESTABILITY: `decide` is a pure fn — unit-test in-process, no subprocess, no
 *    exit-code/JSON plumbing. The false-confidence bug class (exit 1≠2, wrong field)
 *    is UNREPRESENTABLE — the author never writes the protocol; `compile` emits it.
 *  - SAFETY: capability = API surface. `checkHookImports` rejects any import outside
 *    `vigiles/hook` at compile (so the hook can't reach `child_process`/`net`), and
 *    `stampHook`/`verifyHookStamp` make the compiled artifact TAMPER-EVENT (the
 *    integrity.ts pattern) — a hand-edit that smuggles a capability breaks the stamp.
 *  - MATCHING: `command.runs("git push", { force })` is AST-backed (leafCommands),
 *    so it catches `cd x && git push -f` that the native `Bash(git:*)` glob (#30519)
 *    and a hand-written `grep` both miss.
 *  - PORTABILITY: one program → each harness's protocol (CC exit-2 here; Codex /
 *    OpenCode via the HookProtocol port later — OpenCode hooks ARE in-process TS).
 *
 * Pure core, harness-neutral. NOT wired to the CLI/public API — a probe. Honest
 * limits in the research doc: buy-in cost, node-startup latency, and CC delivery
 * bugs (subagent-bypass #34692) still apply — compile fixes AUTHORING, not delivery.
 */
import { leafCommands, classifyBashCommand } from "./bash-effects.js";
import { sha256short, type SHA256Hash } from "./hash.js";

// ---------------------------------------------------------------------------
// The closed vocabulary (this is the entire surface a hook author may touch)
// ---------------------------------------------------------------------------

export type Decision =
  | { readonly kind: "allow" }
  | { readonly kind: "deny"; readonly reason: string }
  | { readonly kind: "ask"; readonly reason: string };

export const allow = (): Decision => ({ kind: "allow" });
export const deny = (reason: string): Decision => ({ kind: "deny", reason });
export const ask = (reason: string): Decision => ({ kind: "ask", reason });

/** An AST-backed view of a Bash command — the author never writes a regex. */
export interface CommandView {
  readonly raw: string;
  /** True iff a leaf command runs `program` (e.g. "git push"), optionally with --force/-f. */
  runs(program: string, opts?: { readonly force?: boolean }): boolean;
  /** True iff the command is provably side-effecting (bash-effects classifier). */
  isSideEffecting(): boolean;
}

const FORCE_FLAG = /^-(?:-force$|[a-z]*f[a-z]*$)/;
const hasForce = (argv: readonly string[]): boolean =>
  argv.some((a) => FORCE_FLAG.test(a));

/** Does `argv` run `tokens` in order (head exact, rest present after it)? */
function runsSeq(argv: readonly string[], tokens: readonly string[]): boolean {
  if (argv[0] !== tokens[0]) return false;
  let i = 1;
  for (let j = 1; j < argv.length && i < tokens.length; j++) {
    if (argv[j] === tokens[i]) i++;
  }
  return i === tokens.length;
}

export function commandView(raw: string): CommandView {
  const leaves = leafCommands(raw);
  return {
    raw,
    runs(program, opts) {
      const tokens = program.split(/\s+/).filter(Boolean);
      return leaves.some(
        (argv) =>
          runsSeq(argv, tokens) && (opts?.force ? hasForce(argv) : true),
      );
    },
    isSideEffecting: () => classifyBashCommand(raw) === "side-effecting",
  };
}

/** The typed event a hook decides over (the probe covers the Bash PreToolUse shape). */
export interface BashToolEvent {
  readonly event: string;
  readonly tool: "Bash";
  readonly command: CommandView;
}

/** A hook program: where it fires + the pure decision. */
export interface HookProgram {
  readonly on: string;
  readonly match: { readonly tool: string };
  readonly decide: (e: BashToolEvent) => Decision;
}

export const tool = (name: string): { tool: string } => ({ tool: name });
export const defineHook = (p: HookProgram): HookProgram => p;

// ---------------------------------------------------------------------------
// Run the program against a raw PreToolUse event (the runtime half)
// ---------------------------------------------------------------------------

/** Build the typed event from a raw CC PreToolUse event, then decide. */
export function decideProgram(
  program: HookProgram,
  rawEvent: { tool_name?: string; tool_input?: { command?: unknown } },
): Decision {
  if (rawEvent.tool_name !== program.match.tool) return allow();
  const command =
    typeof rawEvent.tool_input?.command === "string"
      ? rawEvent.tool_input.command
      : "";
  return program.decide({
    event: program.on,
    tool: "Bash",
    command: commandView(command),
  });
}

/** Map a Decision to the CC hook exit code — the protocol the author never writes. */
export function decisionExitCode(d: Decision): number {
  return d.kind === "deny" ? 2 : 0;
}

// ---------------------------------------------------------------------------
// Compile-time safety: capability = the API surface
// ---------------------------------------------------------------------------

const ALLOWED_IMPORT = "vigiles/hook";

/**
 * Reject any import/require outside `vigiles/hook` + textual escape hatches
 * (eval / Function / dynamic import). The hook's capabilities are then EXACTLY the
 * sanctioned API — it cannot reach `child_process`, `fs`, or the network. Returns
 * the offending specifiers/constructs (empty = clean). (Probe: a regex scan; a
 * production impl walks the TS AST.)
 */
export function checkHookImports(source: string): string[] {
  const out: string[] = [];
  const importRe =
    /\b(?:import|require)\s*(?:\(|[^'"]*from)?\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(importRe)) {
    if (m[1] !== ALLOWED_IMPORT) out.push(m[1]);
  }
  if (/\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(/.test(source)) {
    out.push("dynamic-eval");
  }
  return out;
}

export class HookCompileError extends Error {}

/** A compiled hook program: the harness block + a tamper-evident stamp. */
export interface CompiledHookProgram {
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
  /** SHA-256 of the sanctioned source — the runtime refuses an artifact whose stamp differs. */
  readonly stamp: SHA256Hash;
}

/**
 * Compile a hook program from its source. Runs the capability check FIRST (an
 * out-of-API import does NOT compile), then stamps the source so the shipped
 * artifact is tamper-evident. `program` supplies the routing (event + tool).
 */
export function compileHookProgram(
  source: string,
  program: HookProgram,
  gateCommand = "npx vigiles run-hook-program",
): CompiledHookProgram {
  const violations = checkHookImports(source);
  if (violations.length > 0) {
    throw new HookCompileError(
      `hook program uses capabilities outside \`${ALLOWED_IMPORT}\`: ${violations.join(
        ", ",
      )} — only the sanctioned API is allowed (capability = API surface).`,
    );
  }
  return {
    hooks: {
      [program.on]: [
        {
          matcher: program.match.tool,
          hooks: [{ type: "command", command: gateCommand }],
        },
      ],
    },
    stamp: stampHook(source),
  };
}

/** Stamp a hook's source (the integrity.ts pattern, applied to a hook artifact). */
export function stampHook(source: string): SHA256Hash {
  return sha256short(source);
}

/** Verify a shipped hook artifact matches its stamp (tamper → false). */
export function verifyHookStamp(source: string, stamp: SHA256Hash): boolean {
  return stampHook(source) === stamp;
}

// ===========================================================================
// PROBE 2 — does the closed vocabulary HOLD for two genuinely different shapes?
//
// Finding: it holds, but the vocabulary is a small FAMILY keyed by hook ROLE,
// and the per-role OUTPUT TYPE makes two more verified pains UNREPRESENTABLE:
//   - a context-injection hook can't return a block (no `deny` in `Injection`) —
//     so "block on a SessionStart/PostToolUse hook" (a documented mistake) is a
//     TYPE error, not a silent no-op;
//   - the compiler emits the RIGHT JSON field per role (`additionalContext` for
//     inject vs the exit-2/`permissionDecision` for a gate) — the wrong-field pain
//     vanishes because the author never picks the field.
// ===========================================================================

// --- A second GATE shape: Edit/Write path confinement (a different tool/field/matcher) ---

/** An AST-free view of a file path — the matching primitive for file tools. */
export interface PathView {
  readonly raw: string;
  /** True iff the path sits under at least one allowed prefix (e.g. "src/**"). */
  under(prefixes: readonly string[]): boolean;
}

export function pathView(raw: string): PathView {
  const norm = raw.replace(/^\.\//, "");
  return {
    raw,
    under: (prefixes) =>
      prefixes.some((p) => {
        const base = p.replace(/\/?\*+$/, "").replace(/\/$/, "");
        return base === "" || norm === base || norm.startsWith(base + "/");
      }),
  };
}

/** The event a file-tool gate decides over (Edit/Write/Read carry `file_path`). */
export interface FileToolEvent {
  readonly event: string;
  readonly tool: string;
  readonly path: PathView;
}

export interface FileGateHook {
  readonly role: "gate";
  readonly on: string;
  readonly match: { readonly tools: readonly string[] };
  readonly decide: (e: FileToolEvent) => Decision;
}

export const tools = (...names: string[]): { tools: string[] } => ({
  tools: names,
});
export const defineFileGate = (
  p: Omit<FileGateHook, "role">,
): FileGateHook => ({
  role: "gate",
  ...p,
});

/** Run a file-tool gate against a raw PreToolUse event (reads `file_path`). */
export function decideFileGate(
  hook: FileGateHook,
  raw: { tool_name?: string; tool_input?: { file_path?: unknown } },
): Decision {
  const t = raw.tool_name ?? "";
  if (!hook.match.tools.includes(t)) return allow();
  const fp =
    typeof raw.tool_input?.file_path === "string"
      ? raw.tool_input.file_path
      : "";
  return hook.decide({ event: hook.on, tool: t, path: pathView(fp) });
}

// --- A non-gate shape: context INJECTION (SessionStart) — a different OUTPUT ---

/** The output of an inject hook — text to add to context. NO allow/deny exists here. */
export interface Injection {
  readonly kind: "inject";
  readonly context: string;
}
export const inject = (context: string): Injection => ({
  kind: "inject",
  context,
});

/** The event an inject hook produces from (no tool — SessionStart/UserPromptSubmit). */
export interface SessionEvent {
  readonly event: string;
  readonly source: string;
}

export interface InjectHook {
  readonly role: "inject";
  readonly on: string;
  /** Produces context to add. Its return type (Injection) has no `deny` — by design. */
  readonly produce: (e: SessionEvent) => Injection;
}
export const defineInject = (p: Omit<InjectHook, "role">): InjectHook => ({
  role: "inject",
  ...p,
});

/**
 * Run an inject hook → the CC JSON the author never hand-writes. The compiler
 * targets `additionalContext` (the RIGHT field for this event), so the
 * wrong-JSON-field pain can't occur.
 */
export function runInject(
  hook: InjectHook,
  raw: { source?: string },
): {
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
} {
  const out = hook.produce({ event: hook.on, source: raw.source ?? "startup" });
  return {
    hookSpecificOutput: {
      hookEventName: hook.on,
      additionalContext: out.context,
    },
  };
}
