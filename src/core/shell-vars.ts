/**
 * Which environment variables a shell command actually DEPENDS ON — the
 * parser-backed answer to "would this command run the same program here?".
 *
 * 🔴 WHY A PARSER AND NOT A REGEX, measured. The caller
 * (`experimental_verifyPluginGuards`) refuses to run a hook whose command names
 * a variable nothing has set, because running it would measure a different
 * program than the harness runs. Deciding that with `/\$\{?NAME\}?/` gets two
 * ordinary shapes wrong, in the direction that costs a measurement:
 *
 * | command                          | the shell            | a raw regex   |
 * | -------------------------------- | -------------------- | ------------- |
 * | `GUARD=hooks/g.sh; "$GUARD"`     | sets it, then expands| "unset GUARD" |
 * | `echo '$NOT_A_VAR'`              | no expansion at all  | "unset …"     |
 *
 * Both are self-contained commands reported as unresolvable, so a real guard
 * goes unmeasured for a reason that is not true of it. This is the
 * `parse-structured-input-with-a-real-parser` rule applied to the same shell
 * grammar `core/bash-effects.ts` already parses: an ASSIGNMENT and a SINGLE-
 * QUOTED literal are nodes, so once the command is an AST the two mistakes above
 * are not expressible.
 *
 * 🔴 AND THE PARSER REMOVED TWO WAYS TO BE WRONG WHILE ADDING A THIRD, in the
 * worse direction. Subtracting every assigned name GLOBALLY excused a read the
 * assignment never reached, so the sweep ran a differently-configured program
 * and gave it a score. Measured against `/bin/sh` with the name exported first:
 *
 * ```
 * export X=ambient;   echo "$X"; X=1           → ambient   (read comes FIRST)
 * export FOO=ambient; FOO=1 sh -c "echo $FOO"  → ambient   (prefix assign does
 *                                                           not reach its own
 *                                                           command's words)
 * (G=inner); printf '[%s]' "$G"                → []        (subshell-scoped)
 * G=dominates; printf '[%s]' "$G"              → dominates (this one persists)
 * ```
 *
 * So the rule is DOMINANCE, not membership: an assignment excuses only the reads
 * it provably happens before, and a prefix / subshell / function-body assignment
 * excuses nothing at all. Where dominance is not provable, the read stands.
 *
 * It does NOT reach into `bash-effects.ts` for the parse: that module's `sh`
 * handle and node types are private to it, and its types model EFFECTS
 * (redirections, wrapper heads, flag tables) rather than expansions. The shared
 * thing is the dependency, not the code — both `require("mvdan-sh")`.
 *
 * CONSERVATIVE, ON PURPOSE, IN ONE DIRECTION. Over-reporting a dependency costs
 * a hook its measurement (the caller says so and names the variable);
 * under-reporting one lets a differently-configured program be measured and
 * scored. So where the parser cannot decide, this reports MORE:
 *
 * - a parse failure falls back to the regex scan and says `parsed: false`;
 * - `${FOO:-default}` and `${FOO:?msg}` count as reads even though the first
 *   always resolves — reading the expansion operator is a further step, and its
 *   only effect would be to measure more hooks;
 * - a `for f in …` loop variable is a read (nothing binds it in the AST the way
 *   an `Assign` does).
 *
 * `$1` / `$@` / `$?` are never reads: they are positional and special
 * parameters, not environment the caller could set.
 */

// mvdan-sh is a CJS package (GopherJS build) with no bundled TypeScript types —
// the same require() `core/bash-effects.ts` uses, for the same parser.
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
  /** `*Assign`: the variable name, a `*Lit` whose `.Value` is the name. */
  Name?: { Value?: string };
  /** `*ParamExp`: the parameter, a `*Lit` whose `.Value` is the name. */
  Param?: { Value?: string };
  /** `*CallExpr`: the command's words, and its leading `NAME=value` prefixes. */
  Args?: unknown[];
  Assigns?: ShNode[];
  /** Every node carries its source position; `Offset()` is the byte index. */
  Pos: () => { Offset: () => number };
}

/** A `$NAME` / `${NAME}` reference — not `$(…)`, `$1` or `$@`. */
const VAR_REF = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;

/** An environment-variable name: what a caller could put in `env`. */
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What a command reads from its environment. */
export interface ShellVarReads {
  /** Names it expands and does not itself assign, first-seen order. */
  readonly reads: readonly string[];
  /**
   * Whether the shell parser accepted the command. `false` means `reads` came
   * from the regex fallback and may name a variable the command sets itself.
   */
  readonly parsed: boolean;
}

/** The fallback for a command the shell parser rejects: every `$NAME` in it. */
function scanRefs(command: string): string[] {
  const names = new Set<string>();
  for (const [, name] of command.matchAll(VAR_REF)) names.add(name);
  return [...names];
}

/**
 * The environment variables `command` expands and does not set for itself.
 *
 * @param command - the shell command, exactly as the hook registers it.
 */
/** A node's byte offset in the source, or `null` when the binding withholds it. */
function offsetOf(node: ShNode): number | null {
  try {
    return node.Pos().Offset();
  } catch {
    return null;
  }
}

/**
 * Offsets of assignments that do NOT persist into the surrounding shell, so
 * they excuse no read at all. Both kinds are MEASURED against `/bin/sh`, not
 * inferred from the grammar:
 *
 * ```
 * VP=prefix printf '[%s]' "$VP"   → []          a prefix assign does not reach
 * VT=prefix true; printf '[%s]' "$VT" → []      …nor outlive its own command
 * (G=inner); printf '[%s]' "$G"   → []          a subshell assign stays inside
 * G=dominates; printf '[%s]' "$G" → [dominates] a plain one does persist
 * ```
 *
 * A function body counts as non-persisting for the same conservative reason a
 * subshell does — it runs only if something calls it, and this module errs
 * toward reporting a dependency.
 */
function nonPersistingAssigns(file: ShNode): Set<number> {
  const scoped = new Set<number>();
  const markAssignsWithin = (root: ShNode): void => {
    sh.syntax.Walk(root, (node) => {
      if (node && sh.syntax.NodeType(node) === "Assign") {
        const at = offsetOf(node);
        if (at !== null) scoped.add(at);
      }
      return true;
    });
  };
  sh.syntax.Walk(file, (node) => {
    if (!node) return true;
    const kind = sh.syntax.NodeType(node);
    if (kind === "Subshell" || kind === "FuncDecl") markAssignsWithin(node);
    // A `CallExpr` with WORDS carries prefix assignments (`FOO=1 cmd`); one with
    // no words IS the assignment statement (`FOO=1`), which does persist.
    else if (kind === "CallExpr" && (node.Args?.length ?? 0) > 0)
      for (const assign of node.Assigns ?? []) {
        const at = offsetOf(assign);
        if (at !== null) scoped.add(at);
      }
    return true;
  });
  return scoped;
}

export function shellVarReads(command: string): ShellVarReads {
  let file: ShNode;
  try {
    file = sh.syntax.NewParser().Parse(command, "hook.sh");
  } catch {
    return { reads: scanRefs(command), parsed: false };
  }
  const scoped = nonPersistingAssigns(file);
  const assignedAt = new Map<string, number>();
  const reads: string[] = [];
  const seen = new Set<string>();
  sh.syntax.Walk(file, (node) => {
    if (!node) return true;
    const kind = sh.syntax.NodeType(node);
    const at = offsetOf(node);
    if (kind === "Assign") {
      const name = node.Name?.Value;
      // The FIRST persisting assignment is the only one that can dominate a
      // read; a later one cannot reach backwards.
      if (name !== undefined && name !== "" && at !== null && !scoped.has(at))
        if (!assignedAt.has(name)) assignedAt.set(name, at);
    } else if (kind === "ParamExp") {
      const name = node.Param?.Value;
      if (name !== undefined && VAR_NAME.test(name) && !seen.has(name)) {
        // 🔴 DOMINANCE, NOT MEMBERSHIP. Subtracting every assigned name globally
        // excused `echo "$GUARD"; GUARD=hooks/g.sh` — where the expansion runs
        // FIRST and really does read the environment — so the sweep ran a
        // differently-configured program and scored it. An assignment excuses
        // only the reads it provably happens before.
        const assigned = assignedAt.get(name);
        // `at === null` means the binding withheld the position: excuse nothing.
        if (assigned === undefined || at === null || assigned > at) {
          seen.add(name);
          reads.push(name);
        }
      }
    }
    return true;
  });
  return { reads, parsed: true };
}
