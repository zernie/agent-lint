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
import { leafArgvSource } from "./core/bash-effects.js";

/**
 * A whole word that spells a program file. Same extension set as the hook-script
 * scanner in `test-coverage.ts` (which reads settings.json the same way) — kept
 * as its own copy because this module must not pull in the disk detector.
 *
 * ANCHORED, unlike that scanner's: this one is asked about a word the parser
 * already isolated, so a substring match would be a second guess on top of a
 * decided question. `sh -c 'bash hooks/x.sh'` therefore attributes NOTHING — the
 * inner script is inside a string the shell grammar does not open, and reaching
 * into it is the very substring habit that produced the bug below.
 */
const SCRIPT_RE = /^[\w./${}@:\\-]+\.(?:sh|mjs|cjs|js|mts|cts|ts|py|rb)$/;

/**
 * Heads that EXECUTE a script named in their operands. Everything else — `cat`,
 * `cp`, `grep`, `shasum` — takes the same word as DATA.
 */
const INTERPRETERS = new Set([
  "bash",
  "sh",
  "dash",
  "zsh",
  "ksh",
  "node",
  "nodejs",
  "deno",
  "bun",
  "tsx",
  "ts-node",
  "python",
  "python3",
  "ruby",
  "perl",
]);

/**
 * Our own runtime's verb (`vigiles hook-runtime run-program <hook>`): the word
 * after it is a program vigiles is about to execute. Listed because it is OUR
 * contract, not a guess about someone's CLI — `hook-install` emits exactly this
 * line, and it is how every compiled hook in this repo is exercised.
 */
const RUN_PROGRAM_VERB = "run-program";

/** The basename of a head, so `/bin/bash` and `bash` classify alike. */
function headName(word: string): string {
  const unescaped = word.startsWith("\\") ? word.slice(1) : word;
  const slash = unescaped.lastIndexOf("/");
  return slash >= 0 ? unescaped.slice(slash + 1) : unescaped;
}

/**
 * The program files a command line EXECUTES.
 *
 * 🔴 THE WORD IS NOT THE POSITION, and this used to be a scan for script-looking
 * TOKENS anywhere in the command (and anywhere in the env). Which means a
 * passing harness that runs `cat hooks/pre-edit.sh`, `cp hooks/pre-edit.sh …` or
 * `grep -n foo hooks/pre-edit.sh` minted an execution-tier coverage record for a
 * hook that never ran — the same substitution this whole tier exists to remove,
 * activity taken for the property, only now manufactured by the attribution half
 * instead of the recording half. So the command is PARSED (`leafArgvSource`,
 * mvdan-sh) and only these positions count:
 *
 *  - the leaf HEAD, when it is itself a script (`./hooks/x.sh`, `/abs/x.mjs`);
 *  - the first non-flag operand of an {@link INTERPRETERS} head (`bash x.sh`);
 *  - the word after our own {@link RUN_PROGRAM_VERB}.
 *
 * AST-backed, so a leaf nested behind `&&`, a pipeline or a subshell is still
 * found and `cd /repo && bash hooks/x.sh` attributes the hook — which the old
 * token scan also did, but for the wrong reason.
 *
 * The env is still consulted, because the documented `runHook` idiom passes the
 * path through one: `runHook('"$GUARD"', event, { env: { GUARD: guardPath } })`.
 * It is now an EXPANSION, not a scan: `$GUARD` is substituted into the word that
 * references it and then classified by position, so an env entry the command
 * never mentions (a fixture path, a temp dir) attributes nothing.
 *
 * Deliberately not resolved to absolute paths here: the process's cwd is the
 * test's, not the repo's, and inventing a root would manufacture a match. The
 * runner resolves refs against real discovered surfaces or drops them.
 */
export function commandRefs(
  command: string,
  env?: Record<string, string>,
): string[] {
  // Expansion of a variable INTO a word — a string-value substitution, after the
  // grammar has already decided where the word boundaries are. Names not in
  // `env` are left as written, because `$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh`
  // still resolves by suffix against a real surface.
  const expand = (word: string): string =>
    env === undefined
      ? word
      : word.replace(
          /\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g,
          (whole, braced?: string, bare?: string) =>
            env[braced ?? bare ?? ""] ?? whole,
        );
  const out = new Set<string>();
  for (const leaf of leafArgvSource(command)) {
    const argv = leaf.map(expand);
    const head = argv[0] ?? "";
    if (SCRIPT_RE.test(head)) out.add(head);
    else if (INTERPRETERS.has(headName(head))) {
      // The FIRST non-flag operand is the script; the rest is that script's own
      // argv, where a path is data again (`node lint.mjs hooks/x.sh`).
      const script = argv.slice(1).find((w) => !w.startsWith("-"));
      if (script !== undefined && SCRIPT_RE.test(script)) out.add(script);
    }
    for (let i = 1; i < argv.length - 1; i++) {
      const next = argv[i + 1] ?? "";
      if (argv[i] === RUN_PROGRAM_VERB && SCRIPT_RE.test(next)) out.add(next);
    }
  }
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
