/**
 * audit → model-tier (trigger-rate) decision. `audit` is Lighthouse-shaped: it
 * runs what it CAN by default and degrades loudly when it can't — so the
 * model-gated "do your skills actually FIRE?" measurement is NOT a buried opt-in.
 * On a subscription at a TTY it's offered by default (ask once, remember); in
 * `--json`/CI/non-interactive it's skipped with a loud note (never hang, never
 * silently burn quota), and `--measure`/`--fast` force it on/off. The IO (prompt /
 * scaffold write / running the measure / remembering the choice) lives in the CLI;
 * this is the pure decision + helpers. Honors `great-agent-flow`: an agent
 * (non-TTY / `--json` / `--no-interactive`) is never prompted — an `audit` must
 * never hang.
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
 * CLI on the user's subscription, no key needed and $0 metered. Keeping this a
 * tiny, env-only predicate (not a live probe) means it never spends a token just
 * to decide whether to spend one. `isMetered` distinguishes the two: a metered
 * API key bills per run, so we never auto-spend it — only an explicit `--measure`.
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
 * A metered key bills per token on every run, so the trigger tier is never
 * auto-run under it — it stays an explicit `--measure`. A subscription
 * (`CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`) runs the user's own `claude` CLI at
 * $0 metered, so it's safe to offer/run by default. When BOTH are set the key
 * wins (the SDK uses it), so we treat it as metered to stay conservative.
 */
export function isMeteredAccess(env: ModelEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/** Why the trigger tier was skipped (drives the loud "not measured" note). */
export type MeasureSkipReason =
  | "no-skills" // nothing model-invocable to measure (not a gap — no note)
  | "fast" // explicit --fast / --no-measure
  | "no-model" // no reachable model (or --measure with none)
  | "metered" // a paid API key — never auto-spend; --measure to force
  | "json" // machine output — only --measure forces the slow tier
  | "remembered-no" // a sticky .vigilesrc choice said no
  | "non-interactive"; // agent / CI / non-TTY — --measure to run it there

/**
 * What `audit` should do about the model trigger tier:
 * - `run`  — run it now, no prompt (forced via `--measure`, or a remembered yes).
 * - `ask`  — interactive human + model + no sticky choice: ask once, then remember.
 * - `skip` — don't run; the `reason` drives a loud, Lighthouse-style "Triggering
 *            not measured — …" note (never a silent gap).
 */
export type MeasureDecision =
  | { readonly kind: "run" }
  | { readonly kind: "ask" }
  | { readonly kind: "skip"; readonly reason: MeasureSkipReason };

export interface MeasureEnv {
  /** A real model is reachable (`hasModelAccess`). */
  readonly modelAccess: boolean;
  /** That model is a paid/metered API key (`isMeteredAccess`) — never auto-spend. */
  readonly metered: boolean;
  /** Both stdin AND stdout are a terminal (a human who can answer + wait). */
  readonly isTTY: boolean;
  /** Count of model-invocable, described skills worth measuring. */
  readonly triggerableSkills: number;
  /** `--json` — machine output; only `--measure` runs the slow tier under it. */
  readonly json: boolean;
  /** `--measure` — force the model tier ON (even non-interactive, if a model is reachable). */
  readonly forceMeasure: boolean;
  /** `--fast` / `--no-measure` — force the model tier OFF. */
  readonly noMeasure: boolean;
  /** `--no-interactive` / `--yes` — explicit agent/CI mode (never prompt). */
  readonly noInteractive: boolean;
  /** Sticky remembered choice from `.vigilesrc.json` (`audit.measure`), or undefined. */
  readonly remembered?: boolean;
}

/**
 * Decide what `audit` does with the model trigger tier. Total + pure; precedence
 * matters (the first matching rule wins):
 *  1. nothing to measure → skip (no note; not a gap)
 *  2. explicit `--fast` → skip "fast"
 *  3. explicit `--measure` → run if a model is reachable, else skip "no-model"
 *  4. no model → skip "no-model"
 *  5. metered API key → skip "metered" (never auto-spend; `--measure` to force)
 *  6. `--json` → skip "json" (machine output; `--measure` to force)
 *  7. sticky no/yes → skip "remembered-no" / run
 *  8. non-interactive (agent/CI/non-TTY) → skip "non-interactive"
 *  9. interactive human + subscription + no sticky → ask (then remember)
 */
export function decideMeasure(o: MeasureEnv): MeasureDecision {
  if (o.triggerableSkills < 1) return { kind: "skip", reason: "no-skills" };
  if (o.noMeasure) return { kind: "skip", reason: "fast" };
  if (o.forceMeasure)
    return o.modelAccess
      ? { kind: "run" }
      : { kind: "skip", reason: "no-model" };
  if (!o.modelAccess) return { kind: "skip", reason: "no-model" };
  if (o.metered) return { kind: "skip", reason: "metered" };
  if (o.json) return { kind: "skip", reason: "json" };
  if (o.remembered === false) return { kind: "skip", reason: "remembered-no" };
  if (o.remembered === true) return { kind: "run" };
  if (o.noInteractive || !o.isTTY)
    return { kind: "skip", reason: "non-interactive" };
  return { kind: "ask" };
}

/**
 * The loud, Lighthouse-style "Triggering not measured — …" note for a skipped
 * model tier (the no-silent-skips corollary). Returns null for `no-skills`
 * (there's nothing to measure — not a gap worth a line). Always points at the
 * one-line escape (`--measure`) so the capability is discoverable.
 */
export function formatMeasureSkip(
  reason: MeasureSkipReason,
  dir: string,
  n: number,
): string | null {
  const run = `    vigiles audit ${dir} --measure`;
  switch (reason) {
    case "no-skills":
      return null;
    case "fast":
      return "\nℹ Triggering not measured (--fast). Drop it to measure whether skills fire.";
    case "no-model":
      return (
        `\nℹ Triggering not measured — no model access. Run where the \`claude\` CLI is ` +
        `authenticated (subscription, $0) or set ANTHROPIC_API_KEY, then:\n${run}`
      );
    case "metered":
      return (
        `\nℹ Triggering not measured — a paid API key is set (per-token billing), so it ` +
        `isn't auto-run. Force it (spends API credits) with:\n${run}`
      );
    case "json":
      return null; // machine output — no human notes
    case "remembered-no":
      return `\nℹ Triggering not measured (disabled in .vigilesrc.json). Re-enable with:\n${run}`;
    case "non-interactive": {
      const s = n === 1 ? "" : "s";
      return (
        `\nℹ Triggering not measured — ${String(n)} model-invocable skill${s} + model access ` +
        `detected, but this is a non-interactive run. Measure whether they FIRE ` +
        `(recall + precision) with:\n${run}`
      );
    }
  }
}

/**
 * A starter `--prompts` file (the real `TriggerPromptSet` shape: bare skill name
 * → `{ prompts, irrelevant }`). One entry per triggerable skill, with TODO
 * placeholders the user replaces with real requests. Deterministic; written only
 * on an explicit human "yes" so a plain `audit` never spends a token.
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
