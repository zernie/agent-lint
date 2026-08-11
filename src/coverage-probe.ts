/**
 * DERIVING which surface a run went by — the attribution half of the
 * `CHECK_COUNT` channel (see `check-count.ts`).
 *
 * ## What was broken
 *
 * "Is this skill tested?" was answered by a file name. Colocation says a file
 * named `foo.eval.mjs` sits in `foo/`; it says nothing about whether that file
 * ran, and an EMPTY one counts. Reproduce it in ten seconds: `touch
 * .claude/skills/foo/foo.eval.mjs` and watch the untested count drop by one.
 *
 * Every mature coverage tool answers from EXECUTION — `go test -cover`,
 * coverage.py, nyc, tarpaulin — and uses the name only to find the file to run.
 * We cannot run a skill without a model, so the name stays as a fallback; but
 * when a run DID happen, its own record must outrank the fallback.
 *
 * ## Why the machinery derives it instead of the author declaring it
 *
 * A `surface:` field on a spec would be the retired `vigiles:covers` marker with
 * extra steps: a claim about a test, written by whoever wrote the test, checked
 * by nobody. Every tier already knows what it was pointed at, so the attribution
 * is read back out of the run itself:
 *
 * | tier | what it goes by |
 * |---|---|
 * | `runScript` / `runHook` | the COMMAND LINE — it names a program file |
 * | `runHarnessTest` / eval / trigger-rate | the TRANSCRIPT — what actually fired |
 *
 * 🔴 THE TRANSCRIPT, NOT THE INSTALL SET, and this is the load-bearing choice.
 * A trigger-rate run installs many skills so the one under test competes for
 * selection; crediting all of them would credit a skill for LOSING. What fired
 * is one skill, and that is the one the run measured.
 *
 * Both halves are pure and exported so they are testable without a process: the
 * recording wrappers are one line each on top.
 */
import { recordSurfaceProbe, type SurfaceProbe } from "./check-count.js";

/**
 * Program-file-looking tokens in a command line. Same shape as the hook-script
 * scanner in `test-coverage.ts` (which reads settings.json the same way) — kept
 * as its own copy because this module must not pull in the disk detector.
 */
const SCRIPT_RE = /[\w./${}@:\\-]+\.(?:sh|mjs|cjs|js|mts|cts|ts|py|rb)/g;

/**
 * The program files a command line names, plus those reachable through its env.
 *
 * The env matters because the documented `runHook` idiom passes the path through
 * one: `runHook('"$GUARD"', event, { env: { GUARD: guardPath } })`. Reading only
 * the command string would attribute nothing for exactly the shape the docs
 * teach. Values are scanned, never keys — a variable NAME is not a path.
 *
 * Deliberately not resolved to absolute paths here: the process's cwd is the
 * test's, not the repo's, and inventing a root would manufacture a match. The
 * runner resolves refs against real discovered surfaces or drops them.
 */
export function commandRefs(
  command: string,
  env?: Record<string, string>,
): string[] {
  const out = new Set<string>();
  const scan = (text: string): void => {
    for (const m of text.matchAll(SCRIPT_RE)) out.add(m[0]);
  };
  scan(command);
  for (const value of Object.values(env ?? {})) scan(value);
  return [...out];
}

/** The transcript shape this module reads — structural, so it imports no tier. */
export interface ProbeableTrace {
  readonly toolCalls: readonly {
    readonly name: string;
    readonly input?: unknown;
    readonly isError?: boolean;
  }[];
  readonly hooks?: readonly { readonly name: string }[];
}

/**
 * The surfaces a run's transcript shows ACTIVATING — resolved `Skill` calls and
 * reporting hooks.
 *
 * An errored `Skill` call is excluded, matching `skillResolved`/`whichSkillsFired`:
 * the tool was reached and the skill was not. Counting it would make "the skill
 * is broken" indistinguishable from "the skill ran".
 */
export function traceRefs(trace: ProbeableTrace): SurfaceProbe[] {
  const out: SurfaceProbe[] = [];
  const seen = new Set<string>();
  const push = (ref: string): void => {
    const trimmed = ref.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ how: "fired", ref: trimmed });
  };
  for (const call of trace.toolCalls) {
    if (call.name !== "Skill" || call.isError === true) continue;
    const id = (call.input as { skill?: unknown } | undefined)?.skill;
    if (typeof id === "string") push(id);
  }
  // Hooks are included for the harnesses that report a script there. Claude Code
  // reports an `Event:Matcher` LABEL (`"PreToolUse:Edit"`), which resolves to no
  // surface and is dropped by the runner — recording it costs nothing and an
  // unresolvable ref is never guessed into a match.
  for (const hook of trace.hooks ?? []) push(hook.name);
  return out;
}

/** Record what a command line named. One line, so every tier can afford it. */
export function probeCommand(
  command: string,
  env?: Record<string, string>,
): void {
  for (const ref of commandRefs(command, env)) {
    recordSurfaceProbe("command", ref);
  }
}

/** Record what a run's transcript shows firing. */
export function probeTrace(trace: ProbeableTrace): void {
  for (const probe of traceRefs(trace)) {
    recordSurfaceProbe(probe.how, probe.ref);
  }
}
