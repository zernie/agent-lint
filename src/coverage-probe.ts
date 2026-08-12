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
 * Which option grammar a head speaks. Not decoration: the same spelling means
 * different things in different families (see {@link OPTION_GRAMMAR}), so the
 * family has to be decided before any option word can be read.
 */
type InterpreterFamily = "shell" | "node" | "python" | "ruby" | "perl";

/**
 * Heads that EXECUTE a script named in their operands, each mapped to the option
 * grammar it speaks. Everything else — `cat`, `cp`, `grep`, `shasum` — takes the
 * same word as DATA and never reaches this table.
 */
const INTERPRETER_FAMILY: Readonly<Record<string, InterpreterFamily>> = {
  bash: "shell",
  sh: "shell",
  dash: "shell",
  zsh: "shell",
  ksh: "shell",
  node: "node",
  nodejs: "node",
  deno: "node",
  bun: "node",
  tsx: "node",
  "ts-node": "node",
  python: "python",
  python3: "python",
  ruby: "ruby",
  perl: "perl",
};

/** One family's option grammar. */
interface OptionGrammar {
  /**
   * Options that CONSUME THE NEXT WORD, so that word is an option value and not
   * the entry script.
   */
  readonly withValue: ReadonlySet<string>;
  /**
   * Options after which THERE IS NO SCRIPT OPERAND at all: the program is given
   * as source text or as a module name, or the file is parsed and never run.
   */
  readonly withoutScript: ReadonlySet<string>;
}

/**
 * The option grammar, PER INTERPRETER FAMILY.
 *
 * 🔴 "THE FIRST NON-FLAG OPERAND" IS NOT THE SCRIPT WHEN AN OPTION ATE IT, and
 * the version before the tables assumed it was. `node --loader tsx
 * hooks/pre-edit.ts` selected `tsx`, which fails {@link SCRIPT_RE}, so the hook
 * that DID run was recorded as nothing at all; `node --require setup.js app.js`
 * selected the PRELOAD and stopped, so `app.js` — the file whose execution the
 * coverage claim is about — never appeared. Both are silent: a passing test
 * simply earns no execution coverage, which reads exactly like a test that
 * exercised nothing.
 *
 * 🔴 AND ONE SHARED TABLE COULD NOT EXPRESS THEM, which the first version of it
 * claimed it could ("where these tools' spellings overlap they agree"). They do
 * not. Measured 2026-08-12 with the real binaries:
 *
 *   python3 -I /tmp/probe.py   → runs the script, exit 0   (`-I` = isolated mode,
 *                                                           consumes NOTHING)
 *   ruby -I /tmp -e '…'        → runs, exit 0              (`-I` = load path,
 *                                                           consumes a DIRECTORY)
 *
 * With `-I` in one shared value table, `python3 -I hooks/x.py` fed the hook path
 * to `-I`, found no operand left, and attributed nothing — the same silent loss
 * the table was written to stop, reintroduced by the table itself. `-E` is the
 * second disagreement in the same direction: python's ignores the environment and
 * consumes nothing, ruby's sets an encoding and consumes a value, and perl's
 * carries the PROGRAM (so there is no script operand at all).
 *
 * `--opt=value` needs no entry anywhere — it is one word starting with `-`,
 * already skipped as a flag. Only the space-separated spelling reaches a table.
 *
 * Ambiguity is still bounded in the SAFE direction: mis-skipping a word can only
 * move the selection off the script and onto nothing (silence), because the first
 * operand that still fails {@link SCRIPT_RE} ends the search.
 *
 * Deliberately NOT here: `ruby -S prog`. Its operand is a program looked up on
 * PATH, so consuming it would let the NEXT operand — `rake`'s own argument, i.e.
 * data — be selected as the executed script. That is the round-before's defect
 * (activity taken for the property) and the one direction these tables must not
 * open. Left out, `ruby -S rake x.rb` selects `rake`, fails `SCRIPT_RE`, and
 * attributes nothing.
 *
 * `-m` (python) runs a MODULE, so `python -m pytest hooks/x.py` runs pytest and
 * the hook is pytest's ARGUMENT; `-c`/`--check` (node) and `-c` (ruby, perl)
 * PARSE the file and never run it. Both land in `withoutScript`, so a command
 * line that only syntax-checks a hook no longer claims to have executed it.
 *
 * ⚠️ `-p`/`-n` are the disagreement the split RESOLVES rather than documents. In
 * node `-p` prints an evaluated expression and there is no script operand; in
 * ruby and perl it wraps the script in a read-print loop and the operand IS
 * executed. The shared table had to pick one and picked node's, so `ruby -p x.rb`
 * attributed nothing. Now each family answers for itself.
 */
const OPTION_GRAMMAR: Readonly<Record<InterpreterFamily, OptionGrammar>> = {
  shell: {
    withValue: new Set(["-o", "+o", "--rcfile", "--init-file"]),
    withoutScript: new Set(["-c", "--command"]),
  },
  node: {
    withValue: new Set([
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
    ]),
    withoutScript: new Set(["-e", "--eval", "-p", "--print", "-c", "--check"]),
  },
  python: {
    // `-I` (isolated), `-E` (ignore env), `-B`, `-s`, `-S`, `-u`, `-v`, `-O` all
    // consume NOTHING; they are ordinary flags and the generic `-` skip handles
    // them. Listing them as value-takers is what ate the hook path.
    withValue: new Set(["-W", "-X", "-Q", "--check-hash-based-pycs"]),
    withoutScript: new Set(["-c", "-m"]),
  },
  ruby: {
    withValue: new Set([
      "-I",
      "-E",
      "-F",
      "-C",
      "-r",
      "--require",
      "--encoding",
      "--enable",
      "--disable",
    ]),
    withoutScript: new Set(["-e", "-c"]),
  },
  perl: {
    // perl's `-E` is `-e` with features on: it carries the PROGRAM, so there is
    // no script operand — the opposite conclusion from ruby's `-E`.
    withValue: new Set(["-I"]),
    withoutScript: new Set(["-e", "-E", "-c"]),
  },
};

/**
 * The entry script an interpreter's argv names, or `undefined` when this command
 * line executes no file operand. `argv` is the WHOLE leaf, head included.
 *
 * Still "the first non-flag operand", only now the option grammar OF THIS HEAD'S
 * FAMILY is read first, so an option's VALUE cannot be mistaken for it and a
 * neighbouring language's spelling cannot eat it. Everything after the entry
 * stays data (`node lint.mjs hooks/x.sh` attributes `lint.mjs` alone), which is
 * the property the round before this one bought.
 */
function entryScript(
  argv: readonly string[],
  family: InterpreterFamily,
): string | undefined {
  const grammar = OPTION_GRAMMAR[family];
  for (let i = 1; i < argv.length; i++) {
    const word = argv[i] ?? "";
    if (grammar.withoutScript.has(word)) return undefined;
    if (grammar.withValue.has(word)) {
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
 * The program file this leaf's INTERPRETER head executes, or `undefined`.
 *
 * A head that is an interpreter brings its own option grammar with it — `-I`
 * consumes a path for ruby and nothing for python — so the family is resolved
 * first and the entry script is the first operand THAT grammar has not already
 * claimed ({@link entryScript}). Everything after it is the script's own argv,
 * where a path is data again (`node lint.mjs hooks/x.sh`).
 */
function interpretedScript(argv: readonly string[]): string | undefined {
  const family = INTERPRETER_FAMILY[headName(argv[0] ?? "")];
  if (family === undefined) return undefined;
  const script = entryScript(argv, family);
  return script !== undefined && SCRIPT_RE.test(script) ? script : undefined;
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
    else {
      const script = interpretedScript(argv);
      if (script !== undefined) out.add(script);
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
