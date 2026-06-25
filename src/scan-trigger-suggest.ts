/**
 * scan → trigger-tier nudge. When a plugin ships model-invocable skills AND a
 * real model is reachable, surface the (real-model) `scan --trigger` tier that
 * measures whether those skills actually FIRE (recall + precision). Pure
 * decision + helpers; the IO (prompt / scaffold write / running the measure)
 * lives in the CLI. Honors `great-agent-flow`: an agent (non-TTY / `--json` /
 * `--no-interactive`) is HINTED, never prompted — a `scan` must never hang.
 */

/** Only the env vars that signal a reachable model (parse, don't validate). */
export interface ModelEnv {
  readonly ANTHROPIC_API_KEY?: string;
  readonly CLAUDECODE?: string;
  readonly CLAUDE_CODE_ENTRYPOINT?: string;
}

/**
 * Is a real model reachable for the eval / trigger tier? Either a metered API
 * key (`ANTHROPIC_API_KEY`), OR an authenticated Claude Code session
 * (`CLAUDECODE=1` / `CLAUDE_CODE_ENTRYPOINT`, web/desktop/CLI) — the latter
 * drives the `claude` CLI on the user's subscription, no key needed. Keeping
 * this a tiny, env-only predicate (not a live probe) means it never spends a
 * token just to decide whether to suggest spending one.
 */
export function hasModelAccess(env: ModelEnv): boolean {
  return Boolean(
    env.ANTHROPIC_API_KEY ||
    env.CLAUDECODE === "1" ||
    env.CLAUDE_CODE_ENTRYPOINT,
  );
}

export type TriggerSuggestion = "prompt" | "hint" | "none";

export interface SuggestOpts {
  /** A real model is reachable (`hasModelAccess`). */
  readonly modelAccess: boolean;
  /** stdout is an interactive terminal (a human is watching). */
  readonly isTTY: boolean;
  /** Count of model-invocable, described skills worth measuring. */
  readonly triggerableSkills: number;
  /** `--json` — machine output; never decorate or prompt. */
  readonly json: boolean;
  /** `--no-interactive` — explicit agent/CI mode; hint, never prompt. */
  readonly noInteractive: boolean;
}

/**
 * Decide how `scan` surfaces the trigger tier after its report:
 * - `"none"`   — no model-invocable skills, no model access, or `--json`.
 * - `"hint"`   — model access + skills but non-interactive (agent / CI / non-TTY
 *                / `--no-interactive`): a one-line, non-blocking hint.
 * - `"prompt"` — model access + skills + a human at a TTY: offer to set it up.
 */
export function decideTriggerSuggestion(o: SuggestOpts): TriggerSuggestion {
  if (o.json || o.triggerableSkills < 1 || !o.modelAccess) return "none";
  if (o.noInteractive || !o.isTTY) return "hint";
  return "prompt";
}

/** The one-line, non-blocking hint (the agent/CI surface). */
export function formatTriggerHint(
  dir: string,
  triggerableSkills: number,
): string {
  const n = triggerableSkills;
  return (
    `ℹ ${String(n)} model-invocable skill${n === 1 ? "" : "s"} + model access detected — ` +
    `measure whether they actually FIRE (recall + precision) with:\n` +
    `    vigiles scan ${dir} --trigger --prompts=trigger-prompts.json`
  );
}

/**
 * A starter `--prompts` file (the real `TriggerPromptSet` shape: bare skill name
 * → `{ prompts, irrelevant }`). One entry per triggerable skill, with TODO
 * placeholders the user replaces with real requests. Deterministic; written
 * only on an explicit human "yes" so a plain `scan` never spends a token.
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
