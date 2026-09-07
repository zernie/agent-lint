/**
 * claudeCodeHookCondition — Claude Code's hook `if` field, evaluated.
 *
 * A CC hook action may carry `if: "Bash(git push *--force*)"`. The hook command
 * runs ONLY when the tool call matches; otherwise it is never spawned. The syntax
 * is CC's permission-rule grammar, which is why this lives in the adapter and not
 * in core. Reached through `HookProtocol.condition`; the neutral shape and the
 * event rule live in `src/core/hook-condition.ts`.
 *
 * SOURCE OF THE SEMANTICS. Every rule below is transcribed from Claude Code's own
 * hooks documentation (the `if` row of the common-fields table + its "Bash if
 * matching" table) and cross-checked against the installed binary, whose bundled
 * schema carries the string verbatim: "Permission rule syntax to filter when this
 * hook runs (e.g., \"Bash(git *)\"). Only runs if the tool call matches the
 * pattern. Avoids spawning hooks for non-matching commands." Measured on
 * @anthropic-ai/claude-code 2.1.263.
 *
 * 🔴 THE MATCHER IS DELIBERATELY CONSERVATIVE IN ONE DIRECTION ONLY, and that is
 * the whole safety argument. CC itself fails OPEN — where it cannot tell what a
 * command name expands to, it runs the hook — so mirroring that means every
 * uncertain input yields `runs: true`. A wrong answer can therefore only ever
 * make a guardrail report say "this hook ran and did not block", never "this hook
 * was skipped". The first is a real finding about the hook; the second would be a
 * false alarm invented by us, and this file must not be able to produce one.
 *
 * THE SEVEN DOCUMENTED BASH CASES, all pinned in hook-condition.test.ts:
 *
 *   | pattern            | command                     | runs | why                                  |
 *   | ------------------ | --------------------------- | ---- | ------------------------------------ |
 *   | `Bash(git *)`      | `FOO=bar git push`          | yes  | leading assignments stripped         |
 *   | `Bash(git *)`      | `npm test && git push`      | yes  | each subcommand is checked           |
 *   | `Bash(rm *)`       | `echo $(rm -rf /)`          | yes  | commands inside `$()`/`` ` `` too    |
 *   | `Bash(rm *)`       | `echo $(date)`              | no   | no subcommand matches                |
 *   | `Bash(cat *)`      | `echo before $(date) after` | no   | full command and `date` both checked |
 *   | `Bash(git *)`      | `$TOOL git push`            | yes  | the command name is unknowable       |
 *   | `Bash(git push *)` | `echo $(date)`              | yes  | argument-bearing pattern + dynamic   |
 *
 * The last two rows are the fail-open half, and they are why a blanket "contains a
 * `$` ⇒ run" shortcut is wrong: rows 4 and 5 also contain `$(` and must say NO.
 * CC resolves command NAMES through substitution (it can see `date`, `rm`) but not
 * ARGUMENTS, so a command-name-only pattern (`rm *`) is decided precisely while an
 * argument-bearing one (`git push *`) gives up on any dynamic command.
 */
import type {
  HookConditionCall,
  HookConditionSupport,
  HookConditionVerdict,
} from "../../core/hook-condition.js";
import {
  leafCommands,
  leafCommandsNormalized,
} from "../../core/bash-effects.js";

/** The events Claude Code evaluates `if` on. On any other, a hook with `if` never runs. */
const EVALUATED_ON = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
] as const;

/** A parsed permission rule: `Tool(pattern)`, or a bare `Tool` (any call). */
interface PermissionRule {
  readonly tool: string;
  /** `null` for a bare `Tool` — matches every call to it. */
  readonly pattern: string | null;
}

/**
 * Parse `Tool(pattern)` / `Tool`. Returns `null` on anything else, which the
 * caller treats as "cannot decide" ⇒ run the hook.
 */
function parseRule(condition: string): PermissionRule | null {
  const text = condition.trim();
  if (text === "") return null;
  const open = text.indexOf("(");
  if (open === -1)
    return /^[\w.-]+$/.test(text) ? { tool: text, pattern: null } : null;
  if (!text.endsWith(")")) return null;
  const tool = text.slice(0, open).trim();
  if (!/^[\w.-]+$/.test(tool)) return null;
  return { tool, pattern: text.slice(open + 1, -1) };
}

/** A permission-rule glob (`*` is the only metacharacter) as a whole-string regex. */
function globToRegExp(pattern: string): RegExp {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\S]*");
  return new RegExp(`^${body}$`);
}

/**
 * Does the pattern constrain more than the command NAME?
 *
 * `git *` names only the command; `git push *` and `git push *--force*` constrain
 * arguments too. The distinction is exactly the documented fail-open boundary:
 * CC resolves command names through `$()` but not arguments, so only the second
 * kind gives up on a dynamic command.
 */
function specifiesMoreThanCommandName(pattern: string): boolean {
  return /\s/.test(pattern.replace(/\*+$/, "").trim());
}

/** `$(…)`, a backtick, or a `$VAR`/`${VAR}` expansion — content CC cannot resolve. */
function hasDynamicContent(command: string): boolean {
  return /\$\(|`|\$\{?[A-Za-z_]/.test(command);
}

/**
 * Every spelling of the command a pattern is tried against: the raw string, plus
 * each leaf command however nested (`&&` chains, pipelines, `$()`, backticks).
 *
 * BOTH leaf extractors are used on purpose. `leafCommands` keeps literal words
 * only; `leafCommandsNormalized` additionally unwraps quotes, so
 * `git commit -m 'skip hooks'` keeps its quoted operand instead of dropping it.
 * More candidates can only make a pattern MATCH, which is the fail-open direction.
 */
function candidateCommands(command: string): string[] {
  const out = new Set<string>([command.trim()]);
  for (const argv of leafCommands(command)) out.add(argv.join(" "));
  for (const leaf of leafCommandsNormalized(command))
    out.add(leaf.argv.join(" "));
  return [...out];
}

/**
 * True when at least one leaf could not be normalized — in practice a leaf whose
 * HEAD is a `$VAR`/substitution, so the command name is unknowable. CC runs the
 * hook in that case (`$TOOL git push` against `Bash(git *)`), so we do too.
 */
function hasUnresolvableCommandName(command: string): boolean {
  return leafCommandsNormalized(command).length < leafCommands(command).length;
}

function matchBash(
  pattern: string,
  input: Readonly<Record<string, unknown>>,
): HookConditionVerdict {
  const command = input["command"];
  if (typeof command !== "string")
    return { runs: true, why: "no command to match against — hook runs" };

  const re = globToRegExp(pattern);
  const hit = candidateCommands(command).find((c) => re.test(c));
  if (hit !== undefined)
    return { runs: true, why: `matches \`${pattern}\` via \`${hit}\`` };

  if (hasUnresolvableCommandName(command))
    return {
      runs: true,
      why: `the command name is an expansion, so \`${pattern}\` cannot be ruled out — hook runs`,
    };
  if (specifiesMoreThanCommandName(pattern) && hasDynamicContent(command))
    return {
      runs: true,
      why: `\`${pattern}\` constrains arguments and the command is dynamic — hook runs`,
    };

  return {
    runs: false,
    why: `does not match \`${pattern}\` — Claude Code would not run this hook`,
  };
}

/** The string inputs a non-Bash pattern (`Edit(*.ts)`) is matched against. */
const PATH_KEYS = ["file_path", "path", "notebook_path", "pattern"] as const;

function matchNonBash(
  pattern: string,
  input: Readonly<Record<string, unknown>>,
): HookConditionVerdict {
  const re = globToRegExp(pattern);
  const values = PATH_KEYS.map((k) => input[k]).filter(
    (v): v is string => typeof v === "string",
  );
  if (values.length === 0)
    return { runs: true, why: "no path input to match against — hook runs" };
  const hit = values.find((v) => re.test(v));
  return hit !== undefined
    ? { runs: true, why: `matches \`${pattern}\` via \`${hit}\`` }
    : {
        runs: false,
        why: `does not match \`${pattern}\` — Claude Code would not run this hook`,
      };
}

export const claudeCodeHookCondition: HookConditionSupport = {
  field: "if",
  evaluatedOn: [...EVALUATED_ON],
  matches(condition: string, call: HookConditionCall): HookConditionVerdict {
    const rule = parseRule(condition);
    if (!rule)
      return {
        runs: true,
        why: `\`${condition}\` is not a permission rule we can read — hook runs`,
      };
    if (rule.tool !== call.tool)
      return {
        runs: false,
        why: `\`${condition}\` names ${rule.tool}, the call is ${call.tool} — the hook never runs`,
      };
    if (rule.pattern === null)
      return {
        runs: true,
        why: `\`${condition}\` matches any ${rule.tool} call`,
      };
    return rule.tool === "Bash"
      ? matchBash(rule.pattern, call.input)
      : matchNonBash(rule.pattern, call.input);
  },
};
