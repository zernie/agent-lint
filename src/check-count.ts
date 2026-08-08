/**
 * vigiles — the CHECK COUNTER: the channel a `*.harness.*` / `*.eval.*` script
 * uses to tell `vigiles test` / `vigiles eval` how much it actually did.
 *
 * 🔴 WHY THIS EXISTS. The runner knew exit codes and nothing else, so a script
 * that ran NOTHING was indistinguishable from one that ran and passed. Measured
 * 2026-08-08 — a file whose entire content is
 *
 *     export default { "never runs": () => assert.equal(1, 2) };
 *
 * imports cleanly, exits 0, and the runner printed `✓ … 1 passed`. The assertion
 * inside it is false; it is never called, because nothing calls an exported
 * object. Not hypothetical: a consumer repo hit it, and now hand-copies a warning
 * into the header of every new harness file — "An earlier version exported a
 * `tests` object; nothing ran and the runner printed ✓" — because the runner
 * could not enforce it. Eight harnesses resting on a comment.
 *
 * This is the same distinction `assertNoWrite` already draws between `undefined`
 * and `[]`: "nobody looked" and "nothing happened" must not print the same.
 *
 * HOW IT REPORTS. `vigiles test` puts a scratch path in `VIGILES_CHECK_COUNT_FILE`
 * before spawning each script; on exit, a script that loaded this module writes
 * its count there. A FILE, not stdout, because the runner inherits stdio so the
 * script's own report streams live — there is no stream left to parse. Not an
 * exit code either: those already carry pass/skip/fail, and overloading one would
 * make a real failure ambiguous.
 *
 * WHAT COUNTS AS A CHECK: an observation vigiles can see the script make — a run
 * through one of the tiers (`runHook`, `runHarnessTest`, `runEval`, …), an
 * in-process compiled-hook decision asserted, or an explicit {@link recordCheck}
 * from a harness that asserts some other way (`node:assert`, a runner's
 * `expect`). Deliberately generous: the question this answers is "did this file
 * exercise the harness at all", and a false "0 checks" against a script that
 * genuinely tested something would be exactly the crying wolf the rest of the
 * tool avoids.
 *
 * WHAT A MISSING COUNT MEANS: nothing at all. A script that never imports
 * `vigiles/testing` cannot report, so the runner sees no file and treats it
 * exactly as before — a plain pass. Silence is the legacy branch, never a
 * verdict; only a count of literally zero is a finding. (The alternative —
 * force-loading this module into every child with `node --import` so silence
 * became impossible — was rejected: it would report `0` for a hand-rolled
 * harness that spawns and asserts entirely on its own, which is a real and
 * blameless way to write one.)
 */
import { writeFileSync } from "node:fs";

/**
 * Env var naming the file a script writes its check count to. Set per-script by
 * the runner (`runScripts`), read once here at import.
 */
export const CHECK_COUNT_ENV = "VIGILES_CHECK_COUNT_FILE";

/**
 * The counter lives on the global registry, not in module scope, so two copies
 * of vigiles loaded in one child (a global CLI plus a local dependency, say)
 * share ONE count instead of one copy counting while the other reports zero.
 * The cheap version of that bug is a false "this file verified nothing".
 */
const STATE = Symbol.for("vigiles.check-count");

interface CountState {
  count: number;
  armed: boolean;
}

function state(): CountState {
  const g = globalThis as unknown as Record<symbol, CountState | undefined>;
  return (g[STATE] ??= { count: 0, armed: false });
}

/**
 * Record `n` checks against this script's run.
 *
 * The tiers call it themselves, so an ordinary harness never needs to. Call it
 * directly when you assert some OTHER way — `node:assert`, vitest's `expect`, a
 * hand-rolled comparison — and want those visible to `vigiles test` instead of
 * leaving it to conclude the file did nothing.
 */
export function recordCheck(n = 1): void {
  state().count += n;
}

/** How many checks this process has recorded so far. */
export function checksRecorded(): number {
  return state().count;
}

/**
 * Reset the counter AND the armed flag. For vigiles's own tests, which drive
 * {@link armCheckReport} with fakes several times in one process; a harness
 * script has no use for it.
 */
export function resetCheckCount(): void {
  const s = state();
  s.count = 0;
  s.armed = false;
}

/** Injection seam for {@link armCheckReport} — the process bits it needs. */
export interface CheckReportEnv {
  readonly env: NodeJS.ProcessEnv;
  readonly onExit: (fn: () => void) => void;
  readonly write: (path: string, contents: string) => void;
}

/**
 * Arm the exit-time report, returning whether it armed (i.e. whether the runner
 * asked for a count). Pure except for the two effects it is handed.
 *
 * It DELETES the env var after reading it. A harness spawns child processes —
 * that is its whole job — and a child inheriting the path would write ITS count
 * over the parent's on exit, reporting a sub-process's activity as the file's.
 * Reading the variable once and dropping it makes that unrepresentable rather
 * than merely unlikely.
 */
export function armCheckReport(deps: CheckReportEnv): boolean {
  const s = state();
  if (s.armed) return false;
  const file = deps.env[CHECK_COUNT_ENV];
  if (file === undefined || file === "") return false;
  // `Reflect.deleteProperty`, not `delete env[KEY]`: the key is a const, which
  // the lint rules count as a dynamic delete.
  Reflect.deleteProperty(deps.env, CHECK_COUNT_ENV);
  s.armed = true;
  deps.onExit(() => {
    try {
      deps.write(file, String(s.count));
    } catch {
      // An unwritable scratch path must never turn a passing harness into a
      // crash on the way out. No count reported = the legacy branch = a pass.
    }
  });
  return true;
}

armCheckReport({
  env: process.env,
  onExit: (fn) => {
    process.on("exit", fn);
  },
  write: (path, contents) => {
    writeFileSync(path, contents);
  },
});
