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
  pillars?: "verify" | "test" | "both";
  gha?: boolean;
  plugin?: boolean;
}

function flagValue(
  args: readonly string[],
  prefix: string,
): string | undefined {
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/** Parse `init` args into the choices the user pinned. */
export function parseSetupArgs(args: readonly string[]): ParsedSetupArgs {
  const pillarsRaw = flagValue(args, "--pillars=");
  const pillars =
    pillarsRaw === "verify" || pillarsRaw === "test" || pillarsRaw === "both"
      ? pillarsRaw
      : undefined;
  return {
    target: flagValue(args, "--target="),
    strict: args.includes("--strict"),
    yes: args.includes("--yes") || args.includes("-y"),
    pillars,
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
  const allPinned =
    parsed.pillars !== undefined &&
    parsed.gha !== undefined &&
    parsed.plugin !== undefined;
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
export function resolvePlan(
  parsed: ParsedSetupArgs,
  answers?: SetupAnswers,
): SetupPlan {
  const plan = defaultPlan(parsed.strict);

  if (parsed.pillars === "verify") {
    plan.verify = true;
    plan.test = false;
  } else if (parsed.pillars === "test") {
    plan.verify = false;
    plan.test = true;
  }
  if (parsed.gha === false) plan.gha = false;
  if (parsed.plugin === false) plan.plugin = false;
  if (parsed.target) plan.test = false;

  if (answers) {
    if (answers.verify !== undefined) plan.verify = answers.verify;
    if (answers.test !== undefined) plan.test = answers.test;
    if (answers.gha !== undefined) plan.gha = answers.gha;
    if (answers.plugin !== undefined) plan.plugin = answers.plugin;
  }
  return plan;
}
