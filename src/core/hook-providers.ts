/**
 * Hook CONTEXT PROVIDERS — let a compiled gate decide on external state (git
 * branch, working-tree dirtiness, cwd) WITHOUT breaking `capability = API
 * surface`. The design (research/hook-context-providers.md, grounded in
 * Cedar/OPA/Gatekeeper): the pure `decide` never fetches; the TRUSTED runtime
 * gathers a DECLARED set of read-only facts and hands them in as `e.ctx`. A hook
 * declares `needs: [...]`, so the dependency is explicit + auditable, and the
 * fact-gathering I/O lives here (the trusted host), never inside the hook.
 *
 * v1 ships a small CLOSED, built-in set (the famous-80% facts); the long tail is
 * the v2 user-declared-provider tier. Every built-in command is provably
 * read-only (asserted in the test via bash-effects) — a provider OBSERVES, it
 * never mutates. Gathering is parameterized over an injected `ProviderIO`, so the
 * registry is testable with a fake exec and core depends on no child_process.
 */

/** The closed set of built-in facts a gate may declare via `needs`, with value types. */
export interface ProviderResults {
  /** The current git branch, or "" outside a git repo / on an unborn HEAD. */
  readonly "git.branch": string;
  /** True iff the working tree has uncommitted changes (false if not a repo). */
  readonly "git.isDirty": boolean;
  /** The directory the hook runs in. */
  readonly cwd: string;
}

/** A declarable built-in provider name. */
export type ProviderName = keyof ProviderResults;

/**
 * The typed `e.ctx` for a hook that declared `needs: N` — ONLY the declared
 * facts are present, so reading an undeclared one is a `tsc` error (the
 * typed-purity trick). With `N = readonly []` the ctx is empty.
 */
export type HookCtx<
  N extends readonly ProviderName[] = readonly ProviderName[],
> = {
  readonly [K in N[number]]: ProviderResults[K];
};

/** The read-only capabilities a provider may use to gather its fact. */
export interface ProviderIO {
  /** Run a read-only command, return stdout (throws on non-zero exit). */
  readonly exec: (command: string) => string;
  /** The hook's working directory. */
  readonly cwd: string;
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
};

/** Provider names in `needs` that aren't built-ins (a typo → compile error). */
export function unknownProviders(needs: readonly string[]): string[] {
  return needs.filter((n) => !(n in BUILTIN_PROVIDERS));
}

/**
 * Gather the DECLARED facts into a context object (the trusted-host step). Only
 * the names in `needs` are gathered, each at most once; a provider that can't
 * resolve (e.g. not a git repo) yields its default, never throws. Pure over the
 * injected `io` — the CLI passes a real execSync-backed exec; tests pass a fake.
 */
export function gatherContext(
  needs: readonly ProviderName[],
  io: ProviderIO,
): Partial<ProviderResults> {
  const ctx: Record<string, unknown> = {};
  for (const name of needs) {
    ctx[name] = BUILTIN_PROVIDERS[name].gather(io);
  }
  return ctx as Partial<ProviderResults>;
}
