/**
 * Pure decision logic for `vigiles init`.
 *
 * Turns CLI args + whether a human's at a TTY into a concrete setup PLAN, so the
 * IO-heavy `setup()` in cli.ts stays a thin shell and every choice is unit-tested.
 * Best-practice onboarding: **interactive** when a human runs it in a terminal,
 * **non-interactive** (sensible defaults) for agents / CI / piped input — so
 * "set up vigiles" from a Claude Code or Codex prompt Just Works without hanging
 * on a prompt. See docs/agent-setup.md.
 */

/** What `vigiles init` will set up. */
export interface SetupPlan {
  /** Pillar 1 — verify instruction files (specs, types, compile, audit, hooks). */
  verify: boolean;
  /** Pillar 2 — test the harness (scaffold a starter harness test + CI job). */
  test: boolean;
  /** Wire CI (the `zernie/vigiles@v1` Action; creates a workflow if none). */
  gha: boolean;
  /** Install the Claude Code plugin (hooks + skills). */
  plugin: boolean;
  /** Strict rule severities in `.vigilesrc.json`. */
  strict: boolean;
}

/** The explicit choices a user pinned via flags (undefined = "not specified"). */
export interface ParsedSetupArgs {
  target?: string;
  strict: boolean;
  yes: boolean;
  /** Pillar 1 — `--verify` → true, `--no-verify` → false, absent → undefined. */
  verify?: boolean;
  /** Pillar 2 — `--testing` → true, `--no-testing` → false, absent → undefined. */
  testing?: boolean;
  /** `--harness=claude,codex` override (empty = auto-detect). */
  harness?: string;
  gha?: boolean;
  plugin?: boolean;
}

function flagValue(
  args: readonly string[],
  prefix: string,
): string | undefined {
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** `--name` → true, `--no-name` → false, neither present → undefined. */
function boolFlag(args: readonly string[], name: string): boolean | undefined {
  if (args.includes(`--${name}`)) return true;
  if (args.includes(`--no-${name}`)) return false;
  return undefined;
}

/** Parse `init` args into the choices the user pinned. */
export function parseSetupArgs(args: readonly string[]): ParsedSetupArgs {
  let verify = boolFlag(args, "verify");
  let testing = boolFlag(args, "testing");

  // Deprecated alias: `--pillars=verify|test|both` maps onto the two flags, so
  // old invocations keep working. The pair of boolean flags is the public API.
  const pillarsRaw = flagValue(args, "--pillars=");
  if (verify === undefined && testing === undefined) {
    if (pillarsRaw === "verify") {
      verify = true;
      testing = false;
    } else if (pillarsRaw === "test") {
      verify = false;
      testing = true;
    } else if (pillarsRaw === "both") {
      verify = true;
      testing = true;
    }
  }

  return {
    target: flagValue(args, "--target="),
    strict: args.includes("--strict"),
    yes: args.includes("--yes") || args.includes("-y"),
    verify,
    testing,
    harness: flagValue(args, "--harness="),
    gha: args.includes("--no-gha") ? false : undefined,
    plugin: args.includes("--no-plugin") ? false : undefined,
  };
}

/** The non-interactive defaults: both pillars, CI, and the plugin. */
export function defaultPlan(strict = false): SetupPlan {
  return { verify: true, test: true, gha: true, plugin: true, strict };
}

/**
 * Whether to drop into interactive prompts: a human at a TTY who passed neither
 * `--yes` nor an explicit `--target`, and who hasn't already pinned every choice
 * via flags. Agents / CI / piped input (no TTY) never prompt.
 */
export function shouldPrompt(parsed: ParsedSetupArgs, isTTY: boolean): boolean {
  if (!isTTY || parsed.yes || parsed.target) return false;
  const pillarsPinned =
    parsed.verify !== undefined || parsed.testing !== undefined;
  const allPinned =
    pillarsPinned && parsed.gha !== undefined && parsed.plugin !== undefined;
  return !allPinned;
}

/** Interactive answers (only the fields the prompts cover). */
export type SetupAnswers = Partial<
  Pick<SetupPlan, "verify" | "test" | "gha" | "plugin">
>;

/**
 * Resolve the final plan: defaults, then flags, then interactive answers (each
 * layer overrides the previous only where it has an opinion). `--target` pins a
 * bare Pillar-1 spec (no harness scaffold).
 */
/**
 * Apply the pillar flags. A positive flag (`--verify` and/or `--testing`) is an
 * explicit SELECTION — enable exactly the named pillars. Otherwise default to
 * both and let a `--no-*` flag drop one.
 */
function applyPillarFlags(plan: SetupPlan, parsed: ParsedSetupArgs): void {
  if (parsed.verify === true || parsed.testing === true) {
    plan.verify = parsed.verify === true;
    plan.test = parsed.testing === true;
    return;
  }
  if (parsed.verify === false) plan.verify = false;
  if (parsed.testing === false) plan.test = false;
}

function applyAnswers(plan: SetupPlan, answers: SetupAnswers): void {
  if (answers.verify !== undefined) plan.verify = answers.verify;
  if (answers.test !== undefined) plan.test = answers.test;
  if (answers.gha !== undefined) plan.gha = answers.gha;
  if (answers.plugin !== undefined) plan.plugin = answers.plugin;
}

export function resolvePlan(
  parsed: ParsedSetupArgs,
  answers?: SetupAnswers,
): SetupPlan {
  const plan = defaultPlan(parsed.strict);
  applyPillarFlags(plan, parsed);
  if (parsed.gha === false) plan.gha = false;
  if (parsed.plugin === false) plan.plugin = false;
  if (parsed.target) plan.test = false;
  if (answers) applyAnswers(plan, answers);
  return plan;
}
