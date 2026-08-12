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
 * Interpreter options that CONSUME THE NEXT WORD, so that word is an option
 * value and not the entry script.
 *
 * 🔴 "THE FIRST NON-FLAG OPERAND" IS NOT THE SCRIPT WHEN AN OPTION ATE IT, and
 * the previous version assumed it was. `node --loader tsx hooks/pre-edit.ts`
 * selected `tsx`, which fails {@link SCRIPT_RE}, so the hook that DID run was
 * recorded as nothing at all; `node --require setup.js app.js` selected the
 * PRELOAD and stopped, so `app.js` — the file whose execution the coverage claim
 * is about — never appeared. Both are silent: a passing test simply earns no
 * execution coverage, which reads exactly like a test that exercised nothing.
 *
 * ONE table for every interpreter head rather than one per tool. Where these
 * tools' spellings overlap they agree (`-r`/`--require` in node and ruby, `-C`
 * in node and ruby, `-I` in ruby and perl), and where they do not, the option is
 * simply absent from the other's grammar. Ambiguity is bounded in the SAFE
 * direction anyway: mis-skipping a word can only move the selection off the
 * script and onto nothing (silence), because the first operand that still fails
 * `SCRIPT_RE` ends the search.
 *
 * `--opt=value` needs no entry — it is one word starting with `-`, already
 * skipped as a flag. Only the space-separated spelling reaches this table.
 *
 * Deliberately NOT here: `ruby -S prog`. Its operand is a program looked up on
 * PATH, so consuming it would let the NEXT operand — `rake`'s own argument, i.e.
 * data — be selected as the executed script. That is the round-before's defect
 * (activity taken for the property) and the one direction this table must not
 * open. Left out, `ruby -S rake x.rb` selects `rake`, fails `SCRIPT_RE`, and
 * attributes nothing.
 */
const OPTIONS_WITH_VALUE = new Set([
  // node / tsx / ts-node — module hooks, preloads, resolution
  "-r",
  "--require",
  "--loader",
  "--experimental-loader",
  "--import",
  "-C",
  "--conditions",
  "--env-file",
  "--input-type",
  "--watch-path",
  "--title",
  "--test-name-pattern",
  "--test-reporter",
  "--test-shard",
  "--report-dir",
  "--report-filename",
  // POSIX shells
  "-o",
  "+o",
  "--rcfile",
  "--init-file",
  // python
  "-W",
  "-X",
  "-Q",
  "--check-hash-based-pycs",
  // ruby / perl
  "-I",
  "-E",
  "-F",
]);

/**
 * Options after which THERE IS NO SCRIPT OPERAND at all: the program to run is
 * given as source text or as a module name, so no file on this command line is
 * the thing executed.
 *
 * `sh -c 'bash hooks/x.sh'` was already attributing nothing (the inner command
 * sits inside a string the shell grammar does not open — see {@link commandRefs});
 * this states the same rule for the rest of the family, and adds the case that
 * matters most: `python -m pytest hooks/x.py` runs pytest, and `hooks/x.py` is
 * pytest's ARGUMENT. Without this, skipping `-m`'s value would have selected it
 * and minted execution coverage for a file this command line did not execute.
 *
 * `node -c file.js` / `--check` land here too, and correctly: they parse the file
 * and never run it — so a command line that only syntax-checks a hook no longer
 * claims to have executed it.
 *
 * ⚠️ ONE KNOWN DISAGREEMENT, stated rather than hidden: `-p` means "print the
 * evaluated expression" in node but "loop and print" in ruby/perl, where a script
 * operand CAN follow. So `ruby -p x.rb` attributes nothing where it used to
 * attribute `x.rb`. That is a lost warning, not a false one — the direction this
 * whole module errs in — and in practice ruby's `-p` is written with `-e`
 * (`ruby -pe '…'`), which has no script operand either way.
 */
const OPTIONS_WITHOUT_SCRIPT = new Set([
  "-c",
  "--command",
  "--check",
  "-e",
  "--eval",
  "-p",
  "--print",
  "-m",
]);

/**
 * The entry script an interpreter's argv names, or `undefined` when this command
 * line executes no file operand. `argv` is the WHOLE leaf, head included.
 *
 * Still "the first non-flag operand", only now the option grammar is read first
 * so an option's VALUE cannot be mistaken for it. Everything after the entry stays
 * data (`node lint.mjs hooks/x.sh` attributes `lint.mjs` alone), which is the
 * property the round before this one bought.
 */
function entryScript(argv: readonly string[]): string | undefined {
  for (let i = 1; i < argv.length; i++) {
    const word = argv[i] ?? "";
    if (OPTIONS_WITHOUT_SCRIPT.has(word)) return undefined;
    if (OPTIONS_WITH_VALUE.has(word)) {
      i++; // its value is not the script
      continue;
    }
    if (word.startsWith("-")) continue;
    return word;
  }
  return undefined;
}

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
      // The entry script is the first operand the option grammar has not already
      // claimed ({@link entryScript}); the rest is that script's own argv, where a
      // path is data again (`node lint.mjs hooks/x.sh`).
      const script = entryScript(argv);
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
