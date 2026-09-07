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
export function shellVarReads(command: string): ShellVarReads {
  let file: ShNode;
  try {
    file = sh.syntax.NewParser().Parse(command, "hook.sh");
  } catch {
    return { reads: scanRefs(command), parsed: false };
  }
  const assigned = new Set<string>();
  const referenced = new Set<string>();
  sh.syntax.Walk(file, (node) => {
    if (!node) return true;
    const kind = sh.syntax.NodeType(node);
    if (kind === "Assign") {
      const name = node.Name?.Value;
      if (name !== undefined && name !== "") assigned.add(name);
    } else if (kind === "ParamExp") {
      const name = node.Param?.Value;
      if (name !== undefined && VAR_NAME.test(name)) referenced.add(name);
    }
    return true;
  });
  return {
    reads: [...referenced].filter((name) => !assigned.has(name)),
    parsed: true,
  };
}
