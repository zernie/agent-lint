/**
 * Deterministic, no-LLM Bash effect classifier.
 *
 * Classifies a Bash command string into a three-way verdict:
 *
 *   "read-only"      — proven: every leaf command head is in the read-only
 *                      catalog, no output redirection, no dynamic/residue node.
 *   "side-effecting" — at least one leaf is provably effecting (unknown head
 *                      outside the catalog, effecting flag, output redirection).
 *   "undecidable"    — a residue construct (eval, $VAR head, $(…) head, sh -c,
 *                      xargs, pipe-to-shell, ProcSubst, background &, Subshell)
 *                      makes the static verdict unsound; fail-closed.
 *
 * FAIL-CLOSED: "read-only" is returned ONLY when it can be proven. Anything
 * not proven read-only → "side-effecting" or "undecidable" (never "read-only").
 * The zero-false-read-only property is the invariant this module maintains.
 *
 * Parse errors → "undecidable" (can't analyze ⇒ not read-only).
 *
 * This is a STANDALONE pure module. It does NOT import any adapter or dialect.
 * Wiring into effectSurface / scan is a separate follow-up step.
 *
 * See `research/bash-effect-classification.md` for the full design rationale.
 */

// mvdan-sh is a CJS package (GopherJS build) with no bundled TypeScript types.
// The project compiles to CommonJS (Node16, no "type":"module"), so plain
// require() works and is the idiomatic pattern here (see linters.ts).
const _sh = require("mvdan-sh") as unknown;
const sh = _sh as {
  syntax: {
    NewParser: () => { Parse: (src: string, name: string) => MvdanNode };
    Walk: (node: MvdanNode, fn: (node: MvdanNode) => boolean) => void;
    NodeType: (node: MvdanNode) => string;
  };
};

// Minimal structural types for the mvdan-sh AST nodes we inspect.
// These are NOT exhaustive — only the fields we actually read are declared.
interface MvdanNode {
  // Stmt fields
  Background?: boolean;
  Redirs?: MvdanRedirect[];
  Cmd?: MvdanNode;
  Stmts?: MvdanNode[];
  // CallExpr fields
  Args?: MvdanWord[];
  // BinaryCmd fields
  Op?: number;
  X?: MvdanNode;
  Y?: MvdanNode;
  // Word fields
  Parts?: MvdanNode[];
  // Lit / Param fields
  Value?: string;
}

interface MvdanRedirect extends MvdanNode {
  Op: number;
}

interface MvdanWord extends MvdanNode {
  Parts: MvdanNode[];
}

// ---------------------------------------------------------------------------
// Redirect operator codes from mvdan-sh (empirically confirmed via probe).
// Op values:
//   54 = >   (RdrOut)      55 = >>  (AppOut)    60 = >|  (RdrClob)
//   64 = &>  (RdrAll)      65 = &>> (AppAll)
//   56 = <   (RdrIn — NOT a write)   59 = >&  (DplOut — NOT a file write)
//   61 = <<  (Hdoc — input)          63 = <<< (HereStr — input)
// ---------------------------------------------------------------------------

const WRITE_REDIR_OPS = new Set([54, 55, 60, 64, 65]);

// ---------------------------------------------------------------------------
// Shell-escape heads: commands that dispatch arbitrary code as an argument.
// We treat ALL of these as undecidable regardless of their flags.
// ---------------------------------------------------------------------------

const SHELL_ESCAPE_HEADS = new Set([
  "eval",
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "source",
  ".",
  "xargs",
  "env",
  "command",
  "exec",
  "nohup",
  "sudo",
  "timeout",
  "time",
]);

// ---------------------------------------------------------------------------
// Read-only command catalog (~35 heads, CONSERVATIVE).
// Only commands that are CLEARLY read-only without effecting flags are listed.
// Unknown heads → "side-effecting" (fail-closed).
// ---------------------------------------------------------------------------

const READ_ONLY_HEADS = new Set([
  "cat",
  "ls",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "head",
  "tail",
  "wc",
  "stat",
  "file",
  "echo",
  "printf",
  "pwd",
  "whoami",
  "id",
  "hostname",
  "date",
  "dirname",
  "basename",
  "realpath",
  "readlink",
  "tree",
  "du",
  "df",
  "cut",
  "tr",
  "uniq",
  "nl",
  "od",
  "cksum",
  "md5sum",
  "sha256sum",
  "sha1sum",
  "which",
  "type",
  "test",
  "[",
  "true",
  "false",
  "sleep",
  "diff",
  "cmp",
  "strings",
  "xxd",
  "readelf",
  "nm",
  "ps",
  "pgrep",
]);

// ---------------------------------------------------------------------------
// Flag-sensitive command helpers.
// Each returns the verdict for a command with those static args, or null to
// fall through to the catalog lookup (only used by classifyCall).
// ---------------------------------------------------------------------------

/** Flags on `find` that make it effecting. */
const FIND_EFFECTING_FLAGS = new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-fls",
]);

/** Read-only `git` subcommands (first positional arg after `git`). */
const GIT_READ_ONLY_SUBCMDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "tag",
  "rev-parse",
  "describe",
  "ls-files",
  "ls-tree",
  "cat-file",
  "blame",
  "shortlog",
  "remote",
  "config",
  "stash",
  "grep",
  "format-patch",
]);

/** Classify `git <args>` — read-only only for safe subcommands. */
function classifyGit(staticArgs: readonly string[]): BashEffect {
  const subcmd = staticArgs[0];
  if (!subcmd || subcmd.startsWith("-")) return "side-effecting";
  if (!GIT_READ_ONLY_SUBCMDS.has(subcmd)) return "side-effecting";
  if (subcmd === "stash") {
    const action = staticArgs[1];
    if (!action || (action !== "list" && action !== "show")) {
      return "side-effecting";
    }
  }
  return "read-only";
}

/** Classify `find <args>` — side-effecting if any effecting flag present. */
function classifyFind(staticArgs: readonly string[]): BashEffect {
  for (const arg of staticArgs) {
    if (FIND_EFFECTING_FLAGS.has(arg)) return "side-effecting";
  }
  return "read-only";
}

/** Classify `sort <args>` — side-effecting with `-o`. */
function classifySort(staticArgs: readonly string[]): BashEffect {
  for (const arg of staticArgs) {
    if (arg === "-o" || (arg.startsWith("-o") && arg.length > 2)) {
      return "side-effecting";
    }
  }
  return "read-only";
}

/** Classify `sed <args>` — side-effecting with `-i` / `--in-place`. */
function classifySed(staticArgs: readonly string[]): BashEffect {
  for (const arg of staticArgs) {
    if (arg === "-i" || arg.startsWith("-i") || arg === "--in-place") {
      return "side-effecting";
    }
  }
  return "read-only";
}

// ---------------------------------------------------------------------------
// Helpers: literal extraction from a Word node.
// ---------------------------------------------------------------------------

/** Returns the static string value of a Word iff it is a single Lit part. */
function getLiteral(word: MvdanWord | undefined): string | null {
  if (!word?.Parts || word.Parts.length !== 1) return null;
  const part = word.Parts[0];
  if (!part) return null;
  if (sh.syntax.NodeType(part) === "Lit") return part.Value ?? null;
  return null;
}

/** Like getLiteral but also unwraps a single-Lit DblQuoted word. */
function getLiteralDeep(word: MvdanWord | undefined): string | null {
  if (!word?.Parts || word.Parts.length !== 1) return null;
  const p = word.Parts[0];
  if (!p) return null;
  const t = sh.syntax.NodeType(p);
  if (t === "Lit") return p.Value ?? null;
  if (t === "DblQuoted") {
    const inner = p as MvdanWord;
    if (!inner.Parts || inner.Parts.length !== 1) return null;
    const ip = inner.Parts[0];
    if (!ip || sh.syntax.NodeType(ip) !== "Lit") return null;
    return ip.Value ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal verdict type and combiner.
// ---------------------------------------------------------------------------

/** The three-way verdict. */
export type BashEffect = "read-only" | "side-effecting" | "undecidable";

/**
 * Combine two verdicts: undecidable > side-effecting > read-only.
 * A single undecidable dominates; otherwise a single side-effecting dominates.
 */
function combine(a: BashEffect, b: BashEffect): BashEffect {
  if (a === "undecidable" || b === "undecidable") return "undecidable";
  if (a === "side-effecting" || b === "side-effecting") return "side-effecting";
  return "read-only";
}

// ---------------------------------------------------------------------------
// Per-leaf classifier.
// ---------------------------------------------------------------------------

/** Collect static (literal) arg strings from a CallExpr's args, skipping i=0 (head). */
function staticCallArgs(args: MvdanWord[]): string[] {
  const result: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const lit = getLiteralDeep(args[i]);
    if (lit !== null) result.push(lit);
  }
  return result;
}

/** Resolve the head of a CallExpr to a static string, or null if dynamic. */
function resolveHead(args: MvdanWord[]): string | null {
  const headWord = args[0];
  if (!headWord) return null;
  return getLiteral(headWord);
}

/** Classify a flag-sensitive command once the head and static args are known. */
function classifyFlagSensitive(
  head: string,
  staticArgs: string[],
): BashEffect | null {
  switch (head) {
    case "git":
      return classifyGit(staticArgs);
    case "find":
      return classifyFind(staticArgs);
    case "sort":
      return classifySort(staticArgs);
    case "sed":
      return classifySed(staticArgs);
    case "tee":
      return "side-effecting";
    case "awk":
    case "gawk":
      return "side-effecting"; // awk programs can write internally
    default:
      return null; // fall through to catalog
  }
}

/** Classify a single CallExpr node (one simple command). */
function classifyCall(node: MvdanNode): BashEffect {
  const args = node.Args;
  if (!args || args.length === 0) return "side-effecting";

  const head = resolveHead(args);
  if (head === null) return "undecidable"; // dynamic head

  if (SHELL_ESCAPE_HEADS.has(head)) return "undecidable";

  const sArgs = staticCallArgs(args);
  const sensitive = classifyFlagSensitive(head, sArgs);
  if (sensitive !== null) return sensitive;

  return READ_ONLY_HEADS.has(head) ? "read-only" : "side-effecting";
}

// ---------------------------------------------------------------------------
// AST walker — classifies statements and commands.
// ---------------------------------------------------------------------------

/** Classify a Stmt node (handles redirections and background). */
function classifyStmt(stmt: MvdanNode): BashEffect {
  if (stmt.Background === true) return "undecidable";
  if (stmt.Redirs) {
    for (const r of stmt.Redirs) {
      if (WRITE_REDIR_OPS.has(r.Op)) return "side-effecting";
    }
  }
  const cmd = stmt.Cmd;
  if (!cmd) return "side-effecting";
  return classifyCmd(cmd);
}

/** Classify a Cmd node (the typed command inside a Stmt). */
function classifyCmd(cmd: MvdanNode): BashEffect {
  const t = sh.syntax.NodeType(cmd);

  switch (t) {
    case "CallExpr":
      return classifyCall(cmd);

    case "BinaryCmd":
      return classifyBinaryCmd(cmd);

    case "Subshell":
    case "Block":
      return classifyStmtList(cmd.Stmts);

    default:
      // IfClause, WhileClause, ForClause, CaseClause, FuncDecl, etc.
      return "side-effecting";
  }
}

/** Classify a BinaryCmd (pipe / && / ||). */
function classifyBinaryCmd(cmd: MvdanNode): BashEffect {
  const xVerdict = cmd.X ? classifyStmt(cmd.X) : "side-effecting";
  const yVerdict = cmd.Y ? classifyStmt(cmd.Y) : "side-effecting";
  // For a pipe where the right side is a shell-escape, that already returns
  // "undecidable" from classifyCall/classifyStmt — combine handles it.
  return combine(xVerdict, yVerdict);
}

/** Classify a list of Stmt nodes (Subshell/Block body or top-level File). */
function classifyStmtList(stmts: MvdanNode[] | undefined): BashEffect {
  if (!stmts || stmts.length === 0) return "read-only";
  let result: BashEffect = "read-only";
  for (const s of stmts) {
    result = combine(result, classifyStmt(s));
    if (result === "undecidable") return "undecidable";
  }
  return result;
}

// ---------------------------------------------------------------------------
// ProcSubst residue detector (pre-pass over the full AST).
// ---------------------------------------------------------------------------

/** Returns true if the AST contains a ProcSubst node anywhere. */
function hasProcSubst(root: MvdanNode): boolean {
  let found = false;
  sh.syntax.Walk(root, (node) => {
    if (found) return false;
    if (sh.syntax.NodeType(node) === "ProcSubst") {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a Bash command string by its effect. Sound by construction:
 * returns "read-only" ONLY when every leaf command is a catalogued read-only
 * head with no output redirection and no effecting flag; "undecidable" for the
 * dynamic residue (eval, $(...)-as-command, $VAR head, sh -c, xargs, pipe-into-shell);
 * "side-effecting" otherwise (the fail-closed default). NEVER returns "read-only"
 * for a command it cannot fully prove read-only.
 */
export function classifyBashCommand(command: string): BashEffect {
  let file: MvdanNode;
  try {
    file = sh.syntax.NewParser().Parse(command, "cmd.sh");
  } catch {
    // mvdan-sh throws a Go error object (not an Error instance) on parse failure.
    return "undecidable";
  }
  // Pre-pass: detect ProcSubst (process substitution) anywhere in the AST.
  if (hasProcSubst(file)) return "undecidable";
  return classifyStmtList(file.Stmts);
}

/**
 * True iff classifyBashCommand(command) === "read-only" — the safe predicate a
 * caller uses to decide "this Bash is provably an observation."
 */
export function isReadOnlyBash(command: string): boolean {
  return classifyBashCommand(command) === "read-only";
}
