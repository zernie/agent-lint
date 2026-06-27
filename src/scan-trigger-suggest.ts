/**
 * audit → the ONE read-vs-run decision. `audit` is a deterministic READ by
 * default — safe + identical on every OS, nothing executes. The executing checks
 * (safety battery, live MCP resolution, skill-firing trigger-rate) are opt-in via
 * a single consent: at a TTY `audit` ASKS once (and remembers in `.vigilesrc.json`
 * `audit.measure`); headless (CI / `--json` / `--no-interactive` / an agent) it
 * stays a read + a one-line nudge — never hangs, never silently executes. The one
 * flag, `--measure`, is just the headless "yes" (and a human's skip-the-prompt).
 * There is deliberately no `--fast`/`--no-measure`: the default IS the read, so
 * there is nothing to opt out of. The IO (prompt / run / remember) lives in the
 * CLI; this is the pure decision + helpers.
 */

/** Only the env vars that signal a reachable model (parse, don't validate). */
export interface ModelEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly CLAUDECODE?: string;
  readonly CLAUDE_CODE_ENTRYPOINT?: string;
}

/**
 * Is a real model reachable for the trigger tier? Either a metered API key
 * (`ANTHROPIC_API_KEY`), OR an authenticated Claude Code session (`CLAUDECODE=1`
 * / `CLAUDE_CODE_ENTRYPOINT`, web/desktop/CLI) — the latter drives the `claude`
 * CLI on the user's subscription, no key needed and $0 metered. A tiny env-only
 * predicate (not a live probe), so it never spends a token just to decide.
 */
export function hasModelAccess(env: ModelEnv): boolean {
  return Boolean(
    env.ANTHROPIC_API_KEY ||
    env.CLAUDECODE === "1" ||
    env.CLAUDE_CODE_ENTRYPOINT,
  );
}

/**
 * Is the reachable model METERED (a paid API key) rather than a subscription?
 * Only affects the consent DISCLOSURE wording (a metered key bills per token; a
 * subscription is $0 metered) — the run/skip decision itself is consent-driven,
 * not metered-driven.
 */
export function isMeteredAccess(env: ModelEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/** Why the executing checks were skipped (drives the loud "not run" nudge). */
export type ExecuteSkipReason =
  | "nothing" // no executable surface at all (no hooks / MCP / skills) — no nudge
  | "headless" // CI / --json / non-interactive / agent — --measure to run there
  | "remembered-no"; // a sticky .vigilesrc choice said no

/**
 * What `audit` should do about the EXECUTING checks (battery + live MCP +
 * trigger-rate), as ONE bundle:
 * - `run`  — run them now (forced via `--measure`, or a remembered yes).
 * - `ask`  — interactive human + something to run + no sticky choice: ask once,
 *            then remember.
 * - `skip` — stay a deterministic read; the `reason` drives a loud nudge.
 */
export type ExecuteDecision =
  | { readonly kind: "run" }
  | { readonly kind: "ask" }
  | { readonly kind: "skip"; readonly reason: ExecuteSkipReason };

export interface ExecuteEnv {
  /** Is there ANY executable surface — runnable hooks, an own-repo MCP server, or
   *  a model-invocable skill? Nothing to run → never ask, never nudge. */
  readonly hasExecutable: boolean;
  /** Both stdin AND stdout are a terminal (a human who can answer + wait). */
  readonly isTTY: boolean;
  /** `--json` — machine output; only `--measure` runs the executing checks under it. */
  readonly json: boolean;
  /** `--measure` — the headless "yes" (force the executing checks anywhere). */
  readonly forceMeasure: boolean;
  /** `--no-interactive` / `--yes` — explicit agent/CI mode (never prompt). */
  readonly noInteractive: boolean;
  /** Sticky remembered choice from `.vigilesrc.json` (`audit.measure`), or undefined. */
  readonly remembered?: boolean;
}

/**
 * Decide what `audit` does with the executing checks. Total + pure; the first
 * matching rule wins:
 *  1. nothing executable → skip "nothing" (a clean read; no nudge)
 *  2. `--measure` → run (the headless / skip-the-prompt yes)
 *  3. headless (`--json` / `--no-interactive` / non-TTY) → skip "headless"
 *     (never auto-execute without an explicit `--measure`, even if a choice is
 *     remembered — CI opting into execution must be visible in the workflow)
 *  4. sticky no → skip "remembered-no"
 *  5. sticky yes → run
 *  6. interactive human, no sticky choice → ask (then remember)
 */
export function decideExecute(o: ExecuteEnv): ExecuteDecision {
  if (!o.hasExecutable) return { kind: "skip", reason: "nothing" };
  if (o.forceMeasure) return { kind: "run" };
  if (o.json || o.noInteractive || !o.isTTY)
    return { kind: "skip", reason: "headless" };
  if (o.remembered === false) return { kind: "skip", reason: "remembered-no" };
  if (o.remembered === true) return { kind: "run" };
  return { kind: "ask" };
}

/**
 * The loud "executing checks not run" nudge for a skipped read (the
 * no-silent-skips corollary). Returns null for `nothing` (nothing to run — not a
 * gap). Always points at the one-line escape (`--measure`).
 */
export function formatExecuteSkip(
  reason: ExecuteSkipReason,
  dir: string,
): string | null {
  const run = `    vigiles audit ${dir} --measure`;
  switch (reason) {
    case "nothing":
      return null;
    case "headless":
      return (
        `\nℹ Executing checks not run (safety battery · live MCP · skill firing) — ` +
        `non-interactive run. Run them with:\n${run}`
      );
    case "remembered-no":
      return `\nℹ Executing checks not run (disabled in .vigilesrc.json). Re-enable with:\n${run}`;
  }
}

/**
 * A starter `--prompts` file (the real `TriggerPromptSet` shape: bare skill name
 * → `{ prompts, irrelevant }`). One entry per triggerable skill, with TODO
 * placeholders the user replaces with real requests.
 */
export function scaffoldTriggerPrompts(skillNames: readonly string[]): string {
  const obj: Record<string, { prompts: string[]; irrelevant: string[] }> = {};
  for (const name of skillNames) {
    obj[name] = {
      prompts: [
        `TODO: a request that SHOULD trigger "${name}"`,
        `TODO: a differently-phrased request that should also trigger it`,
      ],
      irrelevant: [
        `TODO: an unrelated request that should NOT trigger "${name}"`,
      ],
    };
  }
  return JSON.stringify(obj, null, 2) + "\n";
}
