/**
 * Compiled hooks — a hook as a CONSTRAINED TYPED PROGRAM, not arbitrary shell.
 *
 * The pure core behind the public `vigiles/hook` surface (re-exported in
 * `src/hook.ts`; compiled by `vigiles compile`, run by `vigiles hook-runtime
 * run-program`). A hook today is opaque shell (`bash guard.sh`) —
 * un-analyzable (Rice), and the author hand-writes the fragile parts (exit code,
 * JSON field, a `grep` matcher) that the verified #1 pains come from. Invert it:
 * the author writes a PURE typed function `(event) => Decision` against a CLOSED
 * API; vigiles compiles it. The constraint ELIMINATES whole bug classes by
 * construction and buys testability / safety / matching / portability:
 *
 *  - TESTABILITY: `decide` is a pure fn — unit-test in-process, no subprocess, no
 *    exit-code/JSON plumbing. The false-confidence bug class (exit 1≠2, wrong field)
 *    is UNREPRESENTABLE — the author never writes the protocol; `compile` emits it.
 *  - SAFETY: capability = API surface. `checkHookImports` rejects any import outside
 *    `vigiles/hook` at compile (so the hook can't reach `child_process`/`net`), and
 *    `stampHook`/`verifyHookStamp` make the compiled artifact TAMPER-EVIDENT (the
 *    integrity.ts pattern) — a hand-edit that smuggles a capability breaks the stamp.
 *  - MATCHING: `command.runs("git push", { force })` is AST-backed (leafCommands),
 *    so it catches `cd x && git push -f` that the native `Bash(git:*)` glob (#30519)
 *    and a hand-written `grep` both miss.
 *  - PORTABILITY: one program → each harness's protocol (CC exit-2 here; Codex /
 *    OpenCode via the HookProtocol port later — OpenCode hooks ARE in-process TS).
 *
 * Pure core, harness-neutral. HONEST SCOPE (kept in every doc): compile/verify fix
 * the hook's AUTHORING + LOGIC, not DELIVERY — CC's subagent-bypass (#34692) means
 * a PreToolUse hook does not fire for a subagent's tool calls, so a gate is a strong
 * default, never an unbypassable wall. Limits (buy-in, node-startup latency) +
 * full record in research/hook-pain-points.md.
 */
import {
  leafCommands,
  classifyBashCommand,
  type BashEffect,
} from "./bash-effects.js";
import { sha256short, assertNever, type SHA256Hash } from "./hash.js";
import { stringify as stringifyToml } from "@iarna/toml";
import type { HarnessDialect } from "./dialect.js";
import type { HookProtocol } from "./hook-protocol.js";
import { verifyHookEvents } from "./hook-events.js";
import {
  unknownProviders,
  BUILTIN_PROVIDERS,
  type ProviderName,
  type ProviderResults,
  type HookCtx,
} from "./hook-providers.js";

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

/**
 * Whether a gate BLOCKS on a `deny` (`enforce`, the default) or only RECORDS what
 * it WOULD block while letting everything through (`observe` — the shadow / rollout
 * mode: trust a new gate by watching it first, then promote to `enforce`). This is
 * the WAF "shadow mode" pattern, the one essential mode (block vs don't-block-but-
 * record) — not a vocabulary of on-fail actions. HARNESS-NEUTRAL by construction:
 * observe just exits 0 and writes a local record, so it behaves identically on
 * Claude Code and Codex (no harness-specific field names involved).
 */
export type HookMode = "enforce" | "observe";

/** A gate's runtime ACTION after applying its {@link HookMode} to its {@link Decision}. Pure. */
export type GateAction =
  | { readonly kind: "block"; readonly reason: string }
  | { readonly kind: "ask"; readonly reason: string }
  | {
      readonly kind: "observe";
      readonly would: "deny" | "ask";
      readonly reason: string;
    }
  | { readonly kind: "allow" };

/**
 * Map a gate's {@link Decision} + {@link HookMode} to what the runtime actually does.
 * `enforce`: deny→block (exit 2), ask→ask, allow→allow. `observe`: a deny/ask is
 * recorded as a no-op `observe` (would-have-blocked) and allowed; allow stays allow.
 * Pure, so a test asserts "in observe mode this deny does NOT block" with no process.
 */
export function gateAction(
  decision: Decision,
  mode: HookMode = "enforce",
): GateAction {
  if (mode === "observe")
    return decision.kind === "allow"
      ? { kind: "allow" }
      : { kind: "observe", would: decision.kind, reason: decision.reason };
  switch (decision.kind) {
    case "deny":
      return { kind: "block", reason: decision.reason };
    case "ask":
      return { kind: "ask", reason: decision.reason };
    case "allow":
      return { kind: "allow" };
    default:
      return assertNever(decision);
  }
}

/** An AST-backed view of a Bash command — the author never writes a regex. */
export interface CommandView {
  readonly raw: string;
  /** True iff a leaf command runs `program` (e.g. "git push"), optionally with --force/-f. */
  runs(program: string, opts?: { readonly force?: boolean }): boolean;
  /** True iff the command is provably side-effecting (bash-effects classifier). */
  isSideEffecting(): boolean;
  /**
   * True iff a leaf command references a path under one of the prefixes (e.g.
   * `~/.ssh`, `.env`) — the secret-read / sensitive-path matcher. Sees the path
   * however the command is wrapped (`cd x && cat ~/.ssh/id_rsa`).
   */
  touches(prefixes: readonly string[]): boolean;
  /**
   * True iff the command pipes into a BARE shell interpreter (`curl … | sh`,
   * `… | bash -s`) — the remote-code-execution shape. High-signal: a shell leaf
   * WITH a script-file argument (`sh deploy.sh`) is NOT flagged; only a shell
   * reading from stdin is, which only happens downstream of a pipe.
   */
  pipesToShell(): boolean;
}

const FORCE_FLAG = /^-(?:-force$|[a-z]*f[a-z]*$)/;
const hasForce = (argv: readonly string[]): boolean =>
  argv.some((a) => FORCE_FLAG.test(a));

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/** Does `argv` run `tokens` in order (head exact, rest present after it)? */
function runsSeq(argv: readonly string[], tokens: readonly string[]): boolean {
  if (argv[0] !== tokens[0]) return false;
  let i = 1;
  for (let j = 1; j < argv.length && i < tokens.length; j++) {
    if (argv[j] === tokens[i]) i++;
  }
  return i === tokens.length;
}

/** Does a single token name a path at/under `prefix` (boundary-aware)? */
function tokenUnder(token: string, prefix: string): boolean {
  const t = token.replace(/^\.\//, "");
  return t === prefix || t.startsWith(prefix + "/") || t.endsWith("/" + prefix);
}

/** A leaf whose head is a shell reading stdin (no script-file argument). */
function isBareShellLeaf(argv: readonly string[]): boolean {
  return (
    SHELLS.has(argv[0] ?? "") && argv.slice(1).every((a) => a.startsWith("-"))
  );
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
    touches: (prefixes) =>
      leaves.some((argv) =>
        argv.slice(1).some((tok) => prefixes.some((p) => tokenUnder(tok, p))),
      ),
    pipesToShell: () => leaves.some(isBareShellLeaf),
  };
}

/**
 * The typed event a Bash gate decides over. Generic over the declared context
 * `needs` (`N`) so `e.ctx` exposes ONLY the facts the hook declared — reading an
 * undeclared one is a `tsc` error. The default is the erased (all-providers)
 * shape used by the runtime/`AnyHook`.
 */
export interface BashToolEvent<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly event: string;
  readonly tool: "Bash";
  readonly command: CommandView;
  /** Host-gathered, DECLARED read-only facts (git branch, …) — see `needs`. */
  readonly ctx: HookCtx<N>;
}

/** A hook program: where it fires + the pure decision. */
export interface HookProgram<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly on: string;
  readonly match: { readonly tool: string };
  /** `enforce` (default) blocks on a `deny`; `observe` records + allows. */
  readonly mode?: HookMode;
  /** Declared context providers the trusted runtime gathers into `e.ctx`. */
  readonly needs?: N;
  readonly decide: (e: BashToolEvent<N>) => Decision;
}

export const tool = (name: string): { tool: string } => ({ tool: name });
export function defineHook<
  const N extends readonly ProviderName[] = readonly [],
>(p: HookProgram<N>): HookProgram<N> {
  return p;
}

// ---------------------------------------------------------------------------
// Run the program against a raw PreToolUse event (the runtime half)
// ---------------------------------------------------------------------------

/** Build the typed event from a raw PreToolUse event, then decide. */
export function decideProgram(
  program: HookProgram,
  rawEvent: { tool_name?: string; tool_input?: { command?: unknown } },
  ctx: Partial<ProviderResults> = {},
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
    ctx: ctx as HookCtx,
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
      /** Tool matcher — omitted for tool-less events (SessionStart/UserPromptSubmit). */
      readonly matcher?: string;
      readonly hooks: readonly {
        readonly type: "command";
        readonly command: string;
      }[];
    }[]
  >;
  /**
   * The rendered settings block to add to the harness's hooks config — JSON for
   * Claude Code (`.claude/settings.json`), TOML `[[hooks.<event>]]` for Codex
   * (`config.toml`). The CLI prints this; the structured `hooks` above is the
   * Claude-Code-shaped intermediate.
   */
  readonly settingsBlock: string;
  /** SHA-256 of the sanctioned source — the runtime refuses an artifact whose stamp differs. */
  readonly stamp: SHA256Hash;
}

/**
 * Per-harness emit inputs (all optional, default to Claude Code) — the ports the
 * CLI threads in from the resolved adapter. Keeps the core harness-agnostic:
 * core depends only on these interfaces, never an adapter (core ⊄ adapter).
 */
export interface CompileHookOptions {
  /** The command the emitted block routes the event to. */
  readonly gateCommand?: string;
  /** Validate `hook.on` against this harness's hook-event catalog (a typo won't compile). */
  readonly dialect?: HarnessDialect;
  /** Matcher style (exact vs anchored regex). Defaults to Claude Code's `"exact"`. */
  readonly hookProtocol?: HookProtocol;
  /** Settings encoding — `"json"` (Claude Code) or `"toml"` (Codex). From `PluginLayout.settingsFormat`. */
  readonly settingsFormat?: "json" | "toml";
}

/**
 * Every hook shape the closed vocabulary can express. `compileHookProgram`
 * (emit) and the runtime dispatch both range over this union.
 */
export type AnyHook =
  | HookProgram
  | FileGateHook
  | PromptGateHook
  | StopGateHook
  | InjectHook
  | ReactHook;

/**
 * The runtime dispatch shapes. A bare {@link HookProgram} (no `role`) is a Bash
 * command gate; the role-keyed hooks carry their own shape. The runtime uses this
 * to pick the right decode + output (a gate exits 2, an inject prints
 * `additionalContext`, a react runs its classified command). `prompt-gate` and
 * `stop-gate` are gates on non-tool events — they decode the prompt / stop signal
 * and emit a `Decision` like the tool gates.
 */
export type DispatchKind =
  | "bash-gate"
  | "file-gate"
  | "prompt-gate"
  | "stop-gate"
  | "inject"
  | "react";

export function dispatchKind(hook: AnyHook): DispatchKind {
  if ("role" in hook) return hook.role === "gate" ? "file-gate" : hook.role;
  return "bash-gate";
}

/** A gate's {@link HookMode} (`enforce` default); non-gate roles report `enforce` too. */
export function hookMode(hook: AnyHook): HookMode {
  return "mode" in hook && hook.mode ? hook.mode : "enforce";
}

/** The context providers a hook declared via `needs` ([] if none / not a gate). */
export function hookNeeds(hook: AnyHook): readonly ProviderName[] {
  return "needs" in hook && Array.isArray(hook.needs)
    ? (hook.needs as readonly ProviderName[])
    : [];
}

/** Where a hook fires + its tool matcher (undefined for tool-less events). */
export function hookRouting(hook: AnyHook): {
  on: string;
  matcher?: string;
} {
  if ("role" in hook) {
    // inject / prompt-gate / stop-gate fire on a whole EVENT — no tool matcher.
    if (
      hook.role === "inject" ||
      hook.role === "prompt-gate" ||
      hook.role === "stop-gate"
    )
      return { on: hook.on };
    return { on: hook.on, matcher: hook.match.tools.join("|") };
  }
  return { on: hook.on, matcher: hook.match.tool };
}

/** Apply a harness's matcher style to the neutral `A|B` matcher join. */
function styleMatcher(
  matcher: string | undefined,
  protocol: HookProtocol | undefined,
): string | undefined {
  if (matcher === undefined) return undefined;
  return protocol?.matcherStyle === "regex" ? `^(${matcher})$` : matcher;
}

/**
 * Render the settings block a user pastes into their hooks config. JSON for
 * Claude Code (the nested `{event:[{matcher,hooks:[{type,command}]}]}` shape);
 * TOML `[[hooks.<event>]]` with a flat `command` for Codex.
 */
function renderSettingsBlock(
  on: string,
  matcher: string | undefined,
  gateCommand: string,
  format: "json" | "toml",
): string {
  if (format === "toml") {
    const entry: Record<string, string> =
      matcher === undefined
        ? { command: gateCommand }
        : { matcher, command: gateCommand };
    return stringifyToml({ hooks: { [on]: [entry] } }).trim();
  }
  const entry =
    matcher === undefined
      ? { hooks: [{ type: "command", command: gateCommand }] }
      : { matcher, hooks: [{ type: "command", command: gateCommand }] };
  return JSON.stringify({ hooks: { [on]: [entry] } }, null, 2);
}

/**
 * Compile a hook program from its source. Runs the capability check FIRST (an
 * out-of-API import does NOT compile), validates the event against the target
 * harness (a typo won't compile), then stamps the source so the shipped artifact
 * is tamper-evident. The hook supplies the routing (event + matcher), which
 * differs per role — a tool gate matches its tool, a react matches its tools, an
 * inject (SessionStart) has no tool matcher at all.
 *
 * Harness-agnostic by injection: with no `opts` it emits the Claude Code block
 * (back-compatible); pass `{ dialect, hookProtocol, settingsFormat }` from a
 * resolved adapter and it emits that harness's block (e.g. Codex TOML + regex
 * matcher). Core never imports an adapter — only the port interfaces.
 */
export function compileHookProgram(
  source: string,
  hook: AnyHook,
  opts: CompileHookOptions = {},
): CompiledHookProgram {
  const violations = checkHookImports(source);
  if (violations.length > 0) {
    throw new HookCompileError(
      `hook program uses capabilities outside \`${ALLOWED_IMPORT}\`: ${violations.join(
        ", ",
      )} — only the sanctioned API is allowed (capability = API surface).`,
    );
  }
  const { on, matcher: rawMatcher } = hookRouting(hook);
  // A hook registered under an event the harness never fires is dead — reject it.
  if (opts.dialect) {
    const issues = verifyHookEvents([on], opts.dialect);
    if (issues.length > 0) {
      throw new HookCompileError(issues[0].message);
    }
  }
  // A `needs` entry that isn't a built-in provider never resolves — reject it
  // (the typo-won't-compile guarantee, for JS authors the type can't reach).
  const unknownNeeds = unknownProviders(hookNeeds(hook) as readonly string[]);
  if (unknownNeeds.length > 0) {
    throw new HookCompileError(
      `unknown context provider(s): ${unknownNeeds.join(", ")} — built-ins are ${Object.keys(
        BUILTIN_PROVIDERS,
      ).join(", ")} (see research/hook-context-providers.md).`,
    );
  }
  const gateCommand =
    opts.gateCommand ?? "npx vigiles hook-runtime run-program";
  const matcher = styleMatcher(rawMatcher, opts.hookProtocol);
  const entry =
    matcher === undefined
      ? { hooks: [{ type: "command" as const, command: gateCommand }] }
      : {
          matcher,
          hooks: [{ type: "command" as const, command: gateCommand }],
        };
  return {
    hooks: { [on]: [entry] },
    settingsBlock: renderSettingsBlock(
      on,
      matcher,
      gateCommand,
      opts.settingsFormat ?? "json",
    ),
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
export interface FileToolEvent<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly event: string;
  readonly tool: string;
  readonly path: PathView;
  /** Host-gathered, DECLARED read-only facts — see `needs`. */
  readonly ctx: HookCtx<N>;
}

export interface FileGateHook<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly role: "gate";
  readonly on: string;
  readonly match: { readonly tools: readonly string[] };
  /** `enforce` (default) blocks on a `deny`; `observe` records + allows. */
  readonly mode?: HookMode;
  /** Declared context providers the trusted runtime gathers into `e.ctx`. */
  readonly needs?: N;
  readonly decide: (e: FileToolEvent<N>) => Decision;
}

export const tools = (...names: string[]): { tools: string[] } => ({
  tools: names,
});
export function defineFileGate<
  const N extends readonly ProviderName[] = readonly [],
>(p: Omit<FileGateHook<N>, "role">): FileGateHook<N> {
  return { role: "gate", ...p };
}

/** Run a file-tool gate against a raw PreToolUse event (reads `file_path`). */
export function decideFileGate(
  hook: FileGateHook,
  raw: { tool_name?: string; tool_input?: { file_path?: unknown } },
  ctx: Partial<ProviderResults> = {},
): Decision {
  const t = raw.tool_name ?? "";
  if (!hook.match.tools.includes(t)) return allow();
  const fp =
    typeof raw.tool_input?.file_path === "string"
      ? raw.tool_input.file_path
      : "";
  return hook.decide({
    event: hook.on,
    tool: t,
    path: pathView(fp),
    ctx: ctx as HookCtx,
  });
}

// ===========================================================================
// PROBE 4 — gate-capable NON-TOOL events: UserPromptSubmit + Stop.
//
// The flagship gate is PreToolUse (block a dangerous tool call). But two more
// session events CAN block, and a typed DECISION fits them exactly:
//   - UserPromptSubmit: see the prompt TEXT, deny to block/erase it (a security
//     filter — refuse a prompt that leaks a secret or carries an injection);
//   - Stop: deny to BLOCK the agent from stopping (gate-until-tests-pass; the
//     reason is fed back to the agent telling it why to continue).
// Both are DECISIONS (the typed lane's sweet spot) on events the vocab didn't
// expose yet — they ride the SAME exit-2 gate runtime as PreToolUse, so they
// work on every harness whose gate vetoes via exit 2 (Claude Code + Codex).
// ===========================================================================

/** The event a UserPromptSubmit gate decides over — it sees the prompt TEXT. */
export interface PromptEvent<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly event: string;
  /** The user's submitted prompt text (empty string if the event carried none). */
  readonly prompt: string;
  /** Host-gathered, DECLARED read-only facts — see `needs`. */
  readonly ctx: HookCtx<N>;
}

export interface PromptGateHook<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly role: "prompt-gate";
  /** The event — `UserPromptSubmit`. */
  readonly on: string;
  /** `enforce` (default) blocks on a `deny`; `observe` records + allows. */
  readonly mode?: HookMode;
  /** Declared context providers the trusted runtime gathers into `e.ctx`. */
  readonly needs?: N;
  /** Decide over the prompt. `deny` blocks/erases the prompt; `ask` defers to the user. */
  readonly decide: (e: PromptEvent<N>) => Decision;
}
export function definePromptGate<
  const N extends readonly ProviderName[] = readonly [],
>(p: Omit<PromptGateHook<N>, "role">): PromptGateHook<N> {
  return { role: "prompt-gate", ...p };
}

/** Run a prompt gate against a raw UserPromptSubmit event (reads `prompt`). */
export function decidePromptGate(
  hook: PromptGateHook,
  raw: { prompt?: unknown },
  ctx: Partial<ProviderResults> = {},
): Decision {
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  return hook.decide({ event: hook.on, prompt, ctx: ctx as HookCtx });
}

/**
 * The event a Stop gate decides over. `deny` BLOCKS the agent from ending its
 * turn (the reason is surfaced to the agent — e.g. "tests are red, keep going").
 */
export interface StopEvent<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly event: string;
  /**
   * True when this Stop is itself the consequence of a PRIOR Stop-block — the
   * loop guard. A gate MUST return `allow` when this is set, or it can wedge the
   * agent in an infinite stop→continue→stop cycle.
   */
  readonly stopHookActive: boolean;
  /** Host-gathered, DECLARED read-only facts — see `needs`. */
  readonly ctx: HookCtx<N>;
}

export interface StopGateHook<
  N extends readonly ProviderName[] = readonly ProviderName[],
> {
  readonly role: "stop-gate";
  /** The event — `Stop` or `SubagentStop`. */
  readonly on: string;
  /** `enforce` (default) blocks on a `deny`; `observe` records + allows. */
  readonly mode?: HookMode;
  /** Declared context providers the trusted runtime gathers into `e.ctx`. */
  readonly needs?: N;
  /** Decide whether the agent may stop. `deny` keeps it going; `allow` lets it stop. */
  readonly decide: (e: StopEvent<N>) => Decision;
}
export function defineStopGate<
  const N extends readonly ProviderName[] = readonly [],
>(p: Omit<StopGateHook<N>, "role">): StopGateHook<N> {
  return { role: "stop-gate", ...p };
}

/** Run a Stop gate against a raw Stop/SubagentStop event (reads `stop_hook_active`). */
export function decideStopGate(
  hook: StopGateHook,
  raw: { stop_hook_active?: unknown },
  ctx: Partial<ProviderResults> = {},
): Decision {
  return hook.decide({
    event: hook.on,
    stopHookActive: raw.stop_hook_active === true,
    ctx: ctx as HookCtx,
  });
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

// --- PROBE 3 — the REACT shape (PostToolUse): where side effects re-enter ---
//
// gate + inject are PURE. A react hook (PostToolUse) fires AFTER the tool ran, so
// it can't block — its job is to DO something in reaction (format, recompile, warn).
// That reintroduces side effects, the exact thing we constrained away. The principled
// answer keeps them BOUNDED: a react's action isn't arbitrary shell, it's a typed
// `Reaction` whose `run(cmd)` is EFFECT-CLASSIFIED at construction (bash-effects). So
// even the side-effecting role stays ANALYZABLE — you can list/diff exactly what every
// react hook runs and its effect — and a react still CANNOT block (no `deny` in
// Reaction), making "block on a PostToolUse hook" (a documented mistake) a type error.

/**
 * A view of a tool's RESPONSE (PostToolUse) — the matching primitive a react hook
 * reasons over (e.g. capture/notify only when a command FAILED). The author never
 * parses the raw payload shape.
 */
export interface ResponseView {
  /** The response as text (an object payload is JSON-stringified). */
  readonly raw: string;
  /**
   * True iff the tool reported a failure — a truthy `error`/`is_error` field on a
   * structured payload, or a leading `Error`/`error:` line on a text one.
   */
  isError(): boolean;
  /** True iff the response text contains `needle`. */
  contains(needle: string): boolean;
}

/** Normalize an arbitrary tool_response payload to text (object → JSON). */
function responseText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw == null) return "";
  return JSON.stringify(raw);
}

export function responseView(raw: unknown): ResponseView {
  const text = responseText(raw);
  const flagged =
    typeof raw === "object" &&
    raw !== null &&
    (Boolean((raw as { error?: unknown }).error) ||
      (raw as { is_error?: unknown }).is_error === true);
  return {
    raw: text,
    isError: () => flagged || /^\s*error[:\s]/i.test(text),
    contains: (needle) => text.includes(needle),
  };
}

/** The event a react hook reacts over — the tool, the file path, AND its response. */
export interface ReactEvent {
  readonly event: string;
  readonly tool: string;
  readonly path: PathView;
  /** The tool's response (PostToolUse) — react only on an error, capture output, … */
  readonly response: ResponseView;
}

export interface RunReaction {
  readonly kind: "run";
  readonly command: string;
  readonly effect: BashEffect;
}
export type Reaction =
  | RunReaction
  | { readonly kind: "notice"; readonly message: string }
  | { readonly kind: "none" };

/** Run a command in reaction — its effect is classified AT CONSTRUCTION (audit/diff-able). */
export const run = (command: string): RunReaction => ({
  kind: "run",
  command,
  effect: classifyBashCommand(command),
});
/** Surface a non-blocking note (no execution). */
export const notice = (message: string): Reaction => ({
  kind: "notice",
  message,
});
/** Do nothing. */
export const nothing = (): Reaction => ({ kind: "none" });

export interface ReactHook {
  readonly role: "react";
  readonly on: string;
  readonly match: { readonly tools: readonly string[] };
  /** Reacts to a tool that already ran. Returns a Reaction — NO `deny` exists here. */
  readonly react: (e: ReactEvent) => Reaction;
}
export const defineReact = (p: Omit<ReactHook, "role">): ReactHook => ({
  role: "react",
  ...p,
});

/** Run a react hook against a raw PostToolUse event → the (classified) Reaction. */
export function runReact(
  hook: ReactHook,
  raw: {
    tool_name?: string;
    tool_input?: { file_path?: unknown };
    tool_response?: unknown;
  },
): Reaction {
  const t = raw.tool_name ?? "";
  if (!hook.match.tools.includes(t)) return nothing();
  const fp =
    typeof raw.tool_input?.file_path === "string"
      ? raw.tool_input.file_path
      : "";
  return hook.react({
    event: hook.on,
    tool: t,
    path: pathView(fp),
    response: responseView(raw.tool_response),
  });
}

// ---------------------------------------------------------------------------
// runHookProgram — one in-process dispatcher over the whole role family. The
// cheapest test tier for a compiled hook: a hook's decision is a PURE function,
// so this evaluates it with NO subprocess and NO model (vs `runHook`, which
// spawns the real CLI runtime). Dispatches by role so a test never has to pick
// `decideProgram` vs `decideFileGate` vs `runReact`/`runInject` by hand — the
// in-process twin of the `vigiles hook-runtime run-program` CLI.
// ---------------------------------------------------------------------------

/** The raw event fields the decode functions read (the union across roles). */
export interface RawHookEvent {
  readonly tool_name?: string;
  readonly tool_input?: {
    readonly command?: unknown;
    readonly file_path?: unknown;
  };
  /** PostToolUse response (react). */
  readonly tool_response?: unknown;
  /** SessionStart / UserPromptSubmit (inject). */
  readonly source?: string;
  /** UserPromptSubmit (prompt-gate). */
  readonly prompt?: string;
  /** Stop / SubagentStop (stop-gate) — the prior-block loop guard. */
  readonly stop_hook_active?: boolean;
}

/** The normalized outcome of running a hook program — discriminated by role. */
export type HookProgramOutcome =
  | { readonly kind: "decision"; readonly decision: Decision }
  | { readonly kind: "injection"; readonly context: string }
  | { readonly kind: "reaction"; readonly reaction: Reaction };

/**
 * Evaluate a compiled hook against a raw event, in-process, dispatching by role:
 * a gate → its `Decision`, an inject → the injected context text, a react → its
 * (effect-classified) `Reaction`. Pure — no subprocess, no model. The ergonomic
 * base for testing a compiled hook (see `assertHookDenies` / `assertHookAllows`).
 */
export function runHookProgram(
  hook: AnyHook,
  event: RawHookEvent,
  ctx: Partial<ProviderResults> = {},
): HookProgramOutcome {
  const kind = dispatchKind(hook);
  switch (kind) {
    case "bash-gate":
      return {
        kind: "decision",
        decision: decideProgram(hook as HookProgram, event, ctx),
      };
    case "file-gate":
      return {
        kind: "decision",
        decision: decideFileGate(hook as FileGateHook, event, ctx),
      };
    case "prompt-gate":
      return {
        kind: "decision",
        decision: decidePromptGate(hook as PromptGateHook, event, ctx),
      };
    case "stop-gate":
      return {
        kind: "decision",
        decision: decideStopGate(hook as StopGateHook, event, ctx),
      };
    case "inject":
      return {
        kind: "injection",
        context: runInject(hook as InjectHook, event).hookSpecificOutput
          .additionalContext,
      };
    case "react":
      return { kind: "reaction", reaction: runReact(hook as ReactHook, event) };
    default:
      return assertNever(kind);
  }
}
