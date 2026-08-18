/**
 * Hook-event verification — the cross-referencing moat applied to the EVENT a
 * hook registers under. A `hooks` block keys each entry by event name
 * (`PreToolUse`, `SessionStart`, …); a TYPO (`PreToolUSe`) means the hook
 * silently never fires — a dead registration no generic JSON linter catches.
 *
 * The event set is NOT closed in practice: the vendor keeps adding events, and
 * frameworks ship custom runtimes with their own (TheBushidoCollective/han fires
 * `TeammateIdle`, `WorktreeRemove`, … from its own `hooks.json` — both of which
 * have since become real Claude Code events). This check used to handle that by
 * reporting an unknown event ONLY when it sat within edit distance 2 of a known
 * one. That is not a confidence signal, and it failed both ways at once:
 * `Setup`, a documented event, was accused of never firing and told to become
 * `Stop`; twenty-one other documented events drew nothing, because they happened
 * to be further than two characters from anything in a nine-name list.
 *
 * Now every name is CLASSIFIED against the dialect's vocabulary
 * (`core/vocabulary.ts`) and every verdict is reported — with the severity
 * coming from the verdict rather than from the caller. An event vigiles doesn't
 * hold is an `advisory` that names vigiles's own capture as the thing that may
 * be stale; it is surfaced and never scored, so a newer or custom event cannot
 * cost anyone a grade. ONE detector (one-detector-no-drift): scan + the
 * `hook-events` lint rule + compiled-hook `on:` validation call the same code.
 * Dialect injected (core ⊄ adapter).
 */
import type { HarnessDialect } from "./dialect.js";
import {
  classify,
  termIssue,
  vocabularyFromLists,
  type HarnessVocabulary,
  type IssueSeverity,
  type TermVerdict,
} from "./vocabulary.js";

export interface HookEventIssue {
  readonly event: string;
  /** Which vocabulary verdict produced this — the input to every policy. */
  readonly verdict: TermVerdict["kind"];
  /** Closest known event (did-you-mean), or null. Message decoration only. */
  readonly suggestion: string | null;
  /** `"scored"` counts toward the grade; `"advisory"` never does. */
  readonly severity: IssueSeverity;
  readonly message: string;
}

/**
 * The event vocabulary this dialect verifies against — its declared one, else a
 * synthesised one built from the flat `hookEvents` list so an adapter that
 * predates vocabularies keeps working.
 */
export function hookEventVocabulary(
  dialect: HarnessDialect,
): HarnessVocabulary {
  return (
    dialect.hookEventVocabulary ??
    vocabularyFromLists(
      `${dialect.name} hook event`,
      `${dialect.name} adapter (no recorded capture)`,
      dialect.hookEvents,
    )
  );
}

/**
 * Verify hook-event names against the dialect vocabulary. Returns one issue per
 * name that isn't plainly available, each already carrying its severity — see
 * {@link scoredIssues} / {@link advisoryIssues} to split them.
 */
export function verifyHookEvents(
  events: readonly string[],
  dialect: HarnessDialect,
): HookEventIssue[] {
  const vocab = hookEventVocabulary(dialect);
  const issues: HookEventIssue[] = [];
  for (const event of events) {
    const issue = termIssue(
      vocab,
      classify(vocab, event),
      "Hook event",
      "a hook here never fires",
    );
    if (issue === null) continue;
    issues.push({
      event,
      verdict: issue.verdict,
      suggestion: issue.suggestion,
      severity: issue.severity,
      message: issue.message,
    });
  }
  return issues;
}

export { scoredIssues, advisoryIssues, authoringIssues } from "./vocabulary.js";
