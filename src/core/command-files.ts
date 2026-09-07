/**
 * Which FILES a shell command hands to a program to execute — the parser-backed
 * answer to "is the guard this hook names even on disk?".
 *
 * 🔴 WHY THIS EXISTS, and it is the loudest lie the sweep could tell. A hook
 * registered as `python3 .claude/hooks/guard.py` whose script is not there does
 * not fail in a way anyone can see: `python3` exits **2** on a file it cannot
 * open, and 2 is Claude Code's DENY code. So `decideHook` reads a block, and
 * `experimental_verifyPluginGuards` reports the hook as blocking every disaster
 * in the battery — a perfect score for a guard that does not exist. Measured on
 * this repo's own build:
 *
 * ```
 * hook `python3 .claude/hooks/guard.py`, script absent
 *   → MEASURED blocks=7/7 exits=2,2,2,2,2,2,2
 * ```
 *
 * No malformed config is needed to reach it — a relative script path is the
 * commonest shape in the wild — which makes it strictly worse than the
 * uncompilable-matcher lie fixed alongside it, and it is the same false
 * confidence the product sells against, produced by the product.
 *
 * THE EXIT CODE CANNOT DECIDE IT, and that is not a guess: `run-script.ts`
 * already writes down the same fact for its own coverage attribution — "`sh
 * <missing>` exits **2** under dash, which is Claude Code's BLOCK code —
 * indistinguishable from a gate legitimately denying, so it cannot be encoded".
 * The shell's own 126/127 catch a program that never launched; nothing catches a
 * program that launched and could not find its script. That is what this module
 * is for, and why the two halves are both needed rather than either alone.
 *
 * ## What counts as a file reference (MEASURED, not assumed)
 *
 * A word is only reported when it is UNAMBIGUOUSLY a script the command runs:
 * fully resolved (no unexpanded `$`, no substitution, no glob, no whitespace),
 * not a flag, not a `NAME=value`, not a URL, not the inline program text of a
 * `-c`/`-e`, and either the head is a known interpreter or the word carries a
 * script extension. The OR is what keeps either list from being load-bearing on
 * its own: an interpreter missing from the table is still caught by the
 * extension, and an extensionless script is still caught by the interpreter.
 *
 * The narrowing is measured, not taste. Over the 107 hook registrations in
 * `davila7/claude-code-templates` (the corpus the defect was found in):
 *
 * | rule                                   | hits | wrong |
 * | -------------------------------------- | ---: | ----: |
 * | any path-shaped operand                |   31 |     8 |
 * | interpreter head OR script extension   |   23 |     0 |
 *
 * The eight the wide rule got wrong are files a hook WRITES or later reads
 * (`rm ~/.claude/session_start.tmp`, `mv ~/.claude/performance.csv`) and one
 * outright absurdity (`echo N/A`, which contains a slash). Reporting those would
 * be crying wolf on hooks that are perfectly fine, and a check read once and
 * distrusted is a check that is off.
 *
 * CONSERVATIVE IN THE OTHER DIRECTION THAN {@link shellVarReads}, on purpose.
 * Over-reporting a missing FILE costs a real guard its measurement AND accuses
 * its author of shipping a broken hook, so here silence is the safe error: a
 * word this module cannot fully resolve is skipped, never guessed at. The
 * missing-program half of the same question is answered after the fact by the
 * shell's 126/127, so a false negative here is not the last line of defence.
 */

// mvdan-sh is a CJS package (GopherJS build) with no bundled TypeScript types —
// the same require() `core/shell-vars.ts` and `core/bash-effects.ts` use, for
// the same parser. The shared thing is the dependency, not the code: this module
// reads WORDS (expanding what it can), which neither of those two models.
const _sh = require("mvdan-sh") as unknown;
const sh = _sh as {
  syntax: {
    NewParser: () => { Parse: (src: string, name: string) => ShNode };
    Walk: (node: ShNode, fn: (node: ShNode) => boolean) => void;
    NodeType: (node: ShNode) => string;
  };
};

/** Only the fields this module reads; not an exhaustive mvdan-sh node. */
interface ShNode {
  /** `*CallExpr`: the command's words. */
  Args?: ShWord[];
  /** `*Lit` / `*SglQuoted`: the literal text. */
  Value?: string;
  /** `*DblQuoted`: the parts inside the quotes. */
  Parts?: ShNode[];
  /** `*ParamExp`: the parameter, a `*Lit` whose `.Value` is the name. */
  Param?: { Value?: string };
}
type ShWord = ShNode;

/**
 * Programs whose job is to RUN A FILE named on their command line. Deliberately
 * small: every entry is a language runtime whose first non-flag operand is a
 * script, and nothing else. It is not a closed set and does not need to be — a
 * runtime missing from it is still reached through {@link SCRIPT_EXTENSION}, and
 * a wrong entry can only cost a measurement, never invent a score.
 */
const INTERPRETERS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "ksh",
  "fish",
  "pwsh",
  "powershell",
  "python",
  "python2",
  "python3",
  "node",
  "deno",
  "bun",
  "ruby",
  "perl",
  "php",
  "lua",
  "Rscript",
  "osascript",
  "tsx",
  "ts-node",
]);

/** Extensions that name a script whatever runs it. */
const SCRIPT_EXTENSION =
  /\.(sh|bash|zsh|fish|ps1|py|js|cjs|mjs|ts|mts|cts|rb|pl|php|lua|R|applescript|scpt)$/;

/**
 * Flags whose VALUE is not a path — program text (`sh -c '…'`, `node -e '…'`)
 * or a module name (`python3 -m json.tool`). The operand after one of these is
 * something the shell never looks for on disk, so testing it as a file would be
 * a category error. (Most program bodies are already excluded by carrying
 * whitespace; this covers the one-word ones, e.g. `bash -c exit`.)
 */
const NON_PATH_FLAGS: ReadonlySet<string> = new Set([
  "-c",
  "-e",
  "-E",
  "-m",
  "--command",
  "--eval",
  "--module",
]);

/**
 * Anything that makes a word something other than one plain filename: shell or
 * glob syntax, whitespace, a quote that survived expansion. A word carrying any
 * of these is not resolvable to a single path here, so it is skipped.
 */
const NOT_A_PLAIN_PATH = /[*?[\]{}()$`|;&<>\s'"\\]/;

/** What a command would execute, as far as this module can resolve it. */
export interface CommandFileRefs {
  /**
   * Files the command hands to a program to run, in first-seen order, exactly
   * as the shell would spell them (relative stays relative — the caller resolves
   * against the cwd the hook will run in).
   */
  readonly refs: readonly string[];
  /** Whether the shell parser accepted the command. `false` ⇒ `refs` is empty. */
  readonly parsed: boolean;
}

/** A word's text with the variables we know expanded, or null when we cannot. */
function wordText(
  word: ShWord | undefined,
  values: Readonly<Record<string, string>>,
): string | null {
  let text = "";
  for (const part of word?.Parts ?? []) {
    const kind = sh.syntax.NodeType(part);
    if (kind === "Lit" || kind === "SglQuoted") text += part.Value ?? "";
    else if (kind === "DblQuoted") {
      const inner = wordText(part, values);
      if (inner === null) return null;
      text += inner;
    } else if (kind === "ParamExp") {
      // A parameter whose value we do not know makes the WHOLE word unresolved.
      // Substituting a placeholder would manufacture a path and then report it
      // missing — an accusation built out of our own guess.
      const name = part.Param?.Value;
      const value = name === undefined ? undefined : values[name];
      if (value === undefined) return null;
      text += value;
    } else return null; // command substitution, arithmetic, process subst, …
  }
  return text;
}

/** Could this word be a filename at all — before asking whose script it is? */
function isPlainPath(word: string): boolean {
  if (word === "") return false;
  if (word.startsWith("-")) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) return false;
  if (word.includes("://")) return false;
  return !NOT_A_PLAIN_PATH.test(word);
}

/** The last path segment, for matching a head like `/usr/bin/python3`. */
function basename(head: string): string {
  const cut = head.lastIndexOf("/");
  return cut === -1 ? head : head.slice(cut + 1);
}

/**
 * The script references of one simple command.
 *
 * TWO independent reasons a word is a script, and the difference in how far each
 * reaches is deliberate. A SCRIPT EXTENSION speaks for itself, so any operand
 * carrying one is reported. An INTERPRETER HEAD speaks only for its FIRST
 * non-flag operand — everything after that is the script's own arguments, and
 * reporting `bash hooks/g.sh production` as naming a missing file `production`
 * would accuse a working hook.
 */
function leafRefs(
  args: readonly ShWord[],
  values: Readonly<Record<string, string>>,
  into: Set<string>,
): void {
  const head = wordText(args[0], values);
  let interpreterOperand =
    head !== null && INTERPRETERS.has(basename(head)) ? "pending" : "no";
  let skipNext = false;
  for (const word of args.slice(1)) {
    const text = wordText(word, values);
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (text !== null && NON_PATH_FLAGS.has(text)) {
      skipNext = true;
      // The interpreter is running program text or a module, not a file: it has
      // no script operand left to name.
      interpreterOperand = "no";
      continue;
    }
    if (text !== null && text.startsWith("-")) continue;
    const script =
      text !== null &&
      isPlainPath(text) &&
      (SCRIPT_EXTENSION.test(text) || interpreterOperand === "pending");
    // The first non-flag operand IS the interpreter's script, whether or not we
    // could resolve it — everything after it belongs to the script, not to us.
    if (interpreterOperand === "pending") interpreterOperand = "no";
    if (script && text !== null) into.add(text);
  }
  // A head that is itself a path (`./hooks/guard.sh`, `"$ROOT"/g.sh`) is a file
  // the shell must find. A BARE head is deliberately not reported: a shell
  // builtin or function (`echo`, `true`, `command`) has no file at all, and
  // calling those missing would flag most hooks in the corpus. The shell's own
  // exit 127 answers that half after the fact.
  if (head !== null && head.includes("/") && !NOT_A_PLAIN_PATH.test(head))
    into.add(head);
}

/**
 * The files `command` would hand to a program to execute.
 *
 * @param command - the shell command, exactly as the hook registers it.
 * @param values - variables whose value is known at run time, for expansion. A
 *   word naming anything absent from this map is skipped, not guessed.
 */
export function commandFileRefs(
  command: string,
  values: Readonly<Record<string, string>> = {},
): CommandFileRefs {
  let file: ShNode;
  try {
    file = sh.syntax.NewParser().Parse(command, "hook.sh");
  } catch {
    return { refs: [], parsed: false };
  }
  const refs = new Set<string>();
  sh.syntax.Walk(file, (node) => {
    const kind = sh.syntax.NodeType(node);
    // 🔴 NEVER DESCEND INTO A SUBSTITUTION. `bash $(which guard.sh)` runs
    // `which`, which does not execute `guard.sh` — it prints where it lives. The
    // inner command's operands are the OUTER command's data, so reading them as
    // files it runs invents a reference nobody named. Returning false stops the
    // walk at this node, which is the only reason the callback returns a boolean.
    if (kind === "CmdSubst" || kind === "ProcSubst") return false;
    if (kind === "CallExpr" && node.Args) leafRefs(node.Args, values, refs);
    return true;
  });
  return { refs: [...refs], parsed: true };
}
