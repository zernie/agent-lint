/**
 * Eval cost transparency — make what a real-model run SPENT impossible to miss.
 * vigiles's whole affordability pitch is "runs on your Claude subscription, not a
 * metered API," so every real-model run should say — out loud — how many tokens it
 * spent, the API-equivalent dollar cost, and (loudly) if it was billed to a
 * METERED API key instead of your subscription.
 *
 * HONEST SCOPE: we surface tokens + the API-equivalent `$` (`total_cost_usd` from
 * the `claude` CLI) + a running session tally. We deliberately do NOT show a
 * "% of your subscription" — Anthropic does not expose a subscription's quota or
 * limit programmatically (and the real limits are rolling rate windows, not a
 * dollar bucket), so any percentage would be fiction. See docs/eval-architecture.md.
 *
 * Pure + injectable (env + an output sink), so the whole thing is unit-tested
 * without a model or a real key.
 */
import type { EvalUsage, ArmUsage, EvalReport } from "./eval.js";

/** A normalized cost/token snapshot — the common shape a report renders from. */
export interface CostSummary {
  /** API-equivalent cost (`total_cost_usd`) — the number that matters. */
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
}

const ZERO: CostSummary = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

/** Total tokens across all four billing buckets. */
export function totalTokens(c: CostSummary): number {
  return (
    c.inputTokens + c.outputTokens + c.cacheCreationTokens + c.cacheReadTokens
  );
}

/** A per-run {@link EvalUsage} → the common snapshot. */
export function costFromRun(u: EvalUsage): CostSummary {
  return {
    costUsd: u.costUsd,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheCreationTokens: u.cacheCreationTokens,
    cacheReadTokens: u.cacheReadTokens,
  };
}

/** An aggregated per-arm {@link ArmUsage} → the common snapshot. */
export function costFromArm(u: ArmUsage): CostSummary {
  return {
    costUsd: u.totalCostUsd,
    inputTokens: u.totalInputTokens,
    outputTokens: u.totalOutputTokens,
    cacheCreationTokens: u.totalCacheCreationTokens,
    cacheReadTokens: u.totalCacheReadTokens,
  };
}

/** Sum any number of snapshots (e.g. every arm of an A/B). */
export function sumCosts(costs: readonly CostSummary[]): CostSummary {
  return costs.reduce(
    (a, c) => ({
      costUsd: a.costUsd + c.costUsd,
      inputTokens: a.inputTokens + c.inputTokens,
      outputTokens: a.outputTokens + c.outputTokens,
      cacheCreationTokens: a.cacheCreationTokens + c.cacheCreationTokens,
      cacheReadTokens: a.cacheReadTokens + c.cacheReadTokens,
    }),
    ZERO,
  );
}

/** The whole-{@link EvalReport} cost — every arm summed. */
export function costFromEvalReport(report: EvalReport): CostSummary {
  return sumCosts(Object.values(report.arms).map((a) => costFromArm(a.usage)));
}

/**
 * How the run was billed. `metered` is true when a real Anthropic API key is in
 * the environment — the `claude` CLI bills those PER TOKEN, whereas a
 * subscription run (auth via `~/.claude`, no key var) costs $0 beyond the sub.
 * The mock/deterministic tier never reaches here (it has no real cost), so a
 * present key means a real metered run.
 */
export interface Billing {
  readonly metered: boolean;
  /** Which env var carried the key (for the actionable "unset X" message). */
  readonly keyVar: string | null;
}

const KEY_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

export function detectBilling(env: NodeJS.ProcessEnv = process.env): Billing {
  for (const v of KEY_VARS) {
    const val = env[v];
    if (val !== undefined && val.trim() !== "")
      return { metered: true, keyVar: v };
  }
  return { metered: false, keyVar: null };
}

// --- Session tally (within one process) ------------------------------------

let SESSION: CostSummary = ZERO;

/** Add a run to the running session total and return the new total. */
export function recordSessionCost(c: CostSummary): CostSummary {
  SESSION = sumCosts([SESSION, c]);
  return SESSION;
}

/** The session total so far. */
export function sessionCost(): CostSummary {
  return SESSION;
}

/** Reset the session tally (test seam). */
export function resetSessionCost(): void {
  SESSION = ZERO;
}

// --- Formatting ------------------------------------------------------------

function fmtUsd(n: number): string {
  return `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/**
 * The human-readable cost block for a run. Shows tokens + API-equivalent `$`, the
 * billed-to line (a LOUD warning + an actionable fix when metered, a green ✅ when
 * on the subscription), and the session tally when it exceeds this run.
 */
export function formatCostSummary(
  c: CostSummary,
  opts: { billing: Billing; session?: CostSummary | null },
): string {
  const lines: string[] = [];
  lines.push(
    `  Spent: ${fmtInt(totalTokens(c))} tokens ` +
      `(${fmtK(c.inputTokens)} in · ${fmtK(c.outputTokens)} out · ${fmtK(c.cacheReadTokens)} cache) ` +
      `· ~${fmtUsd(c.costUsd)} API-equivalent`,
  );
  if (opts.billing.metered) {
    const v = opts.billing.keyVar ?? "ANTHROPIC_API_KEY";
    lines.push(
      `  ⚠ Billed to: METERED API (${v} is set) — you paid ~${fmtUsd(c.costUsd)} this run.`,
      `     Run it free on your Claude subscription: unset ${v}, then \`claude login\`.`,
    );
  } else {
    lines.push(`  Billed to: your Claude subscription — $0 metered ✅`);
  }
  if (opts.session && opts.session.costUsd > c.costUsd) {
    lines.push(
      `  Session so far: ${fmtInt(totalTokens(opts.session))} tokens · ~${fmtUsd(opts.session.costUsd)} API-equivalent`,
    );
  }
  return lines.join("\n");
}

/**
 * Record `c` into the session tally and emit its cost block. The default sink is
 * stderr (so a run's cost never pollutes `--json` stdout). Injectable env + sink
 * keep it fully testable. Returns the emitted text (also handy for a skill to
 * relay to the user).
 */
export function emitCostSummary(
  c: CostSummary,
  opts: {
    env?: NodeJS.ProcessEnv;
    out?: (s: string) => void;
  } = {},
): string {
  // A no-cost run (a replay, a zero-trial eval) has nothing to report.
  if (totalTokens(c) === 0 && c.costUsd === 0) return "";
  const billing = detectBilling(opts.env ?? process.env);
  const session = recordSessionCost(c);
  const text = formatCostSummary(c, { billing, session });
  (opts.out ?? ((s: string): void => console.error(s)))(text);
  return text;
}
