/**
 * Hook-event verification — the cross-referencing moat applied to the EVENT a
 * hook registers under. A `hooks` block keys each entry by event name
 * (`PreToolUse`, `SessionStart`, …); a TYPO (`PreToolUSe`) means the hook
 * silently never fires — a dead registration no generic JSON linter catches.
 *
 * Like the tool catalog, the event set is NOT closed in practice: frameworks
 * extend it (TheBushidoCollective/han ships a custom runtime with `TeammateIdle`,
 * `WorktreeRemove`, … in its own `hooks.json`). So the audit path (scan/lint) is
 * HIGH-PRECISION — `confidentHookEventIssues` keeps only a close typo
 * (a did-you-mean within edit distance 2), never a bare unrecognized event that
 * may be a custom/future one. ONE detector (one-detector-no-drift): scan + the
 * `hook-events` lint rule call the same code. Dialect injected (core ⊄ adapter).
 */
import type { HarnessDialect } from "./dialect.js";
import { editDistance } from "./edit-distance.js";

export interface HookEventIssue {
  readonly event: string;
  /** Closest known event (did-you-mean), or null. */
  readonly suggestion: string | null;
  readonly message: string;
}

/** Closest known hook event by edit distance (≤ 2) — a confidence signal. */
function closestEvent(event: string, dialect: HarnessDialect): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of dialect.hookEvents) {
    const d = editDistance(event.toLowerCase(), known.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  return bestDistance <= 2 ? best : null;
}

/**
 * The HIGH-CONFIDENCE subset (what scan / lint act on): only an unrecognized
 * event that's a close typo of a real one. A bare unknown (no near match) is
 * likely a framework/custom event, not a defect — never flagged when auditing.
 */
export function confidentHookEventIssues(
  issues: readonly HookEventIssue[],
): HookEventIssue[] {
  return issues.filter((i) => i.suggestion !== null);
}

/**
 * Verify hook-event names against the dialect catalog. Returns one issue per
 * unrecognized event. Like the tool-contract check, a suggestion (edit distance
 * ≤ 2) is the confidence signal that an unknown is really a typo of a real event.
 */
export function verifyHookEvents(
  events: readonly string[],
  dialect: HarnessDialect,
): HookEventIssue[] {
  const known = new Set(dialect.hookEvents);
  const issues: HookEventIssue[] = [];
  for (const event of events) {
    if (known.has(event)) continue;
    const near = closestEvent(event, dialect);
    const hint = near ? ` Did you mean "${near}"?` : "";
    issues.push({
      event,
      suggestion: near,
      message: `Unknown hook event "${event}" — a hook here never fires. Valid events: ${dialect.hookEvents.join(", ")}.${hint}`,
    });
  }
  return issues;
}
