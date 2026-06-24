/**
 * Hook CONTEXT PROVIDERS — let a compiled gate decide on EXTERNAL STATE (git
 * branch, working-tree dirtiness, cwd, OS) WITHOUT breaking `capability = API
 * surface`. The design (research/hook-context-providers.md, grounded in
 * Cedar/OPA/Gatekeeper): the pure `decide` never fetches; the TRUSTED runtime
 * gathers a DECLARED set of read-only facts and hands them in as `e.ctx`. A hook
 * declares `needs: [...]`, so the dependency is explicit + auditable, and the
 * fact-gathering I/O lives here (the trusted host), never inside the hook.
 *
 * Two tiers of `needs` entry, both DECLARED (the opt-out ladder):
 *  - a built-in provider NAME (`"git.branch"`) — the curated, famous-80% set;
 *  - an INLINE one-off — `provide(name, cmd)` (read-only, compile-rejected if not)
 *    or `dangerously(name, cmd)` (the loud, greppable escape for a command that
 *    isn't provably read-only) — for the long tail, no registration ceremony.
 *
 * Every built-in command is provably read-only (asserted in the test via
 * bash-effects); a `provide()` command is checked the same way at compile. The
 * gathering is parameterized over an injected `ProviderIO`, so the registry is
 * testable with a fake exec and core depends on no child_process.
 */
import { isReadOnlyBash } from "./bash-effects.js";

/** The closed set of built-in facts a gate may declare via `needs`, with value types. */
export interface ProviderResults {
  /** The current git branch, or "" outside a git repo / on an unborn HEAD. */
  readonly "git.branch": string;
  /** True iff the working tree has uncommitted changes (false if not a repo). */
  readonly "git.isDirty": boolean;
  /** The directory the hook runs in. */
  readonly cwd: string;
  /** The OS platform (`process.platform`: "darwin" | "linux" | "win32" | …). */
  readonly "os.platform": NodeJS.Platform;
}

/** A declarable built-in provider name. */
export type ProviderName = keyof ProviderResults;

/**
 * An INLINE one-off provider: a command declared right in `needs` (no registered
 * file), run by the trusted runtime, its stdout becoming `e.ctx[name]` (a string).
 * `dangerous` marks the loud escape — a command not provably read-only. Built via
 * {@link provide} (read-only) or {@link dangerously} (acknowledged).
 */
export interface InlineProvider<Name extends string = string> {
  readonly kind: "inline";
  readonly name: Name;
  readonly run: string;
  readonly dangerous: boolean;
}

/** A `needs` entry — a built-in name OR an inline `provide`/`dangerously`. */
export type NeedSpec = ProviderName | InlineProvider;

/**
 * Declare an INLINE read-only fact: `provide("k8sCtx", "kubectl config current-context")`.
 * The command MUST be provably read-only (compile rejects it otherwise — use
 * {@link dangerously} to acknowledge a side-effecting/undecidable one). Its stdout
 * is `e.ctx[name]`.
 */
export const provide = <const Name extends string>(
  name: Name,
  run: string,
): InlineProvider<Name> => ({ kind: "inline", name, run, dangerous: false });

/**
 * Declare an INLINE fact whose command ISN'T provably read-only — the loud,
 * greppable escape hatch (the `dangerouslySetInnerHTML` / `unsafe` / `http.send`
 * convention; sibling of `purity:'dangerously-unrestricted'`). A security review
 * searches for this one word.
 */
export const dangerously = <const Name extends string>(
  name: Name,
  run: string,
): InlineProvider<Name> => ({ kind: "inline", name, run, dangerous: true });

type NeedName<E extends NeedSpec> = E extends ProviderName
  ? E
  : E extends InlineProvider<infer Nm>
    ? Nm
    : never;
type NeedValue<E extends NeedSpec> = E extends ProviderName
  ? ProviderResults[E]
  : string;

/**
 * The typed `e.ctx` for a hook that declared `needs: N` — ONLY the declared facts
 * are present (built-in name → its typed value, inline → string), so reading an
 * undeclared one is a `tsc` error (the typed-purity trick). With `N = readonly []`
 * the ctx is empty. The default `readonly ProviderName[]` is the erased runtime
 * shape (built-ins only — an inline `string` name would force an index signature
 * that clashes with `git.isDirty: boolean`; concrete authored inline names are
 * literals, so they never clash).
 */
export type HookCtx<N extends readonly NeedSpec[] = readonly ProviderName[]> = {
  readonly [E in N[number] as NeedName<E>]: NeedValue<E>;
};

/** The read-only capabilities a provider may use to gather its fact. */
export interface ProviderIO {
  /** Run a read-only command, return stdout (throws on non-zero exit). */
  readonly exec: (command: string) => string;
  /** The hook's working directory. */
  readonly cwd: string;
  /** The OS platform (`process.platform`). */
  readonly platform: NodeJS.Platform;
}

interface ProviderDef<K extends ProviderName> {
  /**
   * The read-only command the provider runs (for audit + the read-only
   * soundness test). Absent for an ambient fact gathered without a subprocess.
   */
  readonly run?: string;
  /** Produce the fact; TOTAL — returns a sensible default on failure, never throws. */
  readonly gather: (io: ProviderIO) => ProviderResults[K];
}

/** Run a command and trim, returning "" on any failure (total). */
function tryExec(io: ProviderIO, command: string): string {
  try {
    return io.exec(command).trim();
  } catch {
    return "";
  }
}

/** The closed built-in registry. Each `run` is provably read-only (see the test). */
export const BUILTIN_PROVIDERS: {
  readonly [K in ProviderName]: ProviderDef<K>;
} = {
  "git.branch": {
    run: "git branch --show-current",
    gather: (io) => tryExec(io, "git branch --show-current"),
  },
  "git.isDirty": {
    run: "git status --porcelain",
    gather: (io) => tryExec(io, "git status --porcelain").length > 0,
  },
  cwd: {
    gather: (io) => io.cwd,
  },
  "os.platform": {
    gather: (io) => io.platform,
  },
};

/** True iff a `needs` entry is an inline `provide`/`dangerously` (not a built-in name). */
function isInline(need: NeedSpec): need is InlineProvider {
  return typeof need !== "string";
}

/** Built-in `needs` names that aren't real providers (a typo → compile error). */
export function unknownProviders(needs: readonly NeedSpec[]): string[] {
  return needs
    .filter((n): n is ProviderName => !isInline(n))
    .filter((n) => !(n in BUILTIN_PROVIDERS));
}

/**
 * Inline `provide()` entries whose command ISN'T provably read-only — these must
 * switch to `dangerously()` (the acknowledged escape) or compile is rejected. A
 * `dangerously()` entry is never flagged (it already acknowledged the risk).
 */
export function unsafeInlineProviders(
  needs: readonly NeedSpec[],
): InlineProvider[] {
  return needs
    .filter(isInline)
    .filter((n) => !n.dangerous && !isReadOnlyBash(n.run));
}

/**
 * Gather the DECLARED facts into a context object (the trusted-host step). Only
 * the names in `needs` are gathered, each at most once; a built-in or inline
 * provider that can't resolve yields its default ("" / false), never throws. Pure
 * over the injected `io` — the CLI passes a real execSync-backed exec; tests pass
 * a fake.
 */
export function gatherContext(
  needs: readonly NeedSpec[],
  io: ProviderIO,
): Record<string, string | boolean> {
  const ctx: Record<string, string | boolean> = {};
  for (const need of needs) {
    if (isInline(need)) ctx[need.name] = tryExec(io, need.run);
    else ctx[need] = BUILTIN_PROVIDERS[need].gather(io);
  }
  return ctx;
}
