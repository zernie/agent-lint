/**
 * Shared LEXICAL signals for "is this text a rule?" — the deontic/imperative
 * vocabulary the detection pipeline keys on, kept in ONE home so the stages that
 * use it can't silently drift. These previously lived as near-duplicate
 * deontic-modal regexes in `segment.ts` (`RULE_PREDICATE`) and `rule-routing.ts`
 * (`NORM_SIGNAL`) with no cross-reference.
 *
 * Two stages consume them:
 *
 *  - the segment GATE (`src/segment.ts`) — precision-first accept/reject. Uses
 *    `FORM_HEAD` (an imperative/prohibitive sentence HEAD) as a rule cue, and
 *    `RULE_PREDICATE` (a deontic modal ANYWHERE) to stop a code-span-led
 *    sentence being mis-rejected as a description.
 *  - the routing POSSIBLE filter (`src/rule-routing.ts`) — recall recovery. Uses
 *    `NORM_SIGNAL` to keep the "possible (review)" tier to genuine recall-misses
 *    (a bullet that carries a norm modal) instead of flooding it with prose.
 *
 * `NORM_SIGNAL` and `RULE_PREDICATE` are BOTH "deontic modal anywhere" matchers
 * with slightly different word lists ON PURPOSE — different jobs, calibrated
 * separately against the OSS corpus. They are kept ADJACENT here so a widening
 * of one prompts a review of the other, rather than the two drifting apart in
 * separate files. See `research/rule-enforcer-design.md` §2.
 */

/**
 * An imperative/prohibitive sentence HEAD ("Never …", "Avoid …", "No …") — the
 * segment gate's `form` cue. Anchored at the start (a HEAD, not anywhere). The
 * deontic verbs (require/disallow/forbid/ban/enforce) are common rule leads
 * ("Require `curly` braces", "Disallow `var`"). NB "no" is bare `no` + the
 * shared trailing `\b` (a boundary right after "no" — before a space OR a
 * backtick), so "No bare except" / "No default exports" / "No `any`" all match,
 * while "Note"/"Nowhere" (no boundary after "no") are rejected. The earlier
 * `no\s+\S` form silently failed "No bare except" (the measured bug).
 */
export const FORM_HEAD =
  /^(?:use|avoid|prefer|never|always|don'?t|do not|no|must|should|keep|run|write|add|remove|only|require|requires?|disallow|forbid|ban|enforce)\b/i;

/**
 * A deontic modal ANYWHERE in the text — routing's POSSIBLE-tier recall gate.
 * Narrow (modal verbs only) so the review tier stays genuine recall-misses.
 */
export const NORM_SIGNAL =
  /\b(?:must(?:n't)?|should(?:n't)?|shall|never|always|avoids?|require[sd]?|forbidden|disallow(?:ed)?|prohibited|banned?|prefers?|do not|don't)\b/i;

/**
 * A deontic predicate ANYWHERE — the segment gate's description-reject guard: a
 * code-span-led sentence carrying one of these is a RULE ("`const` is preferred
 * over `let`"), not a description, so the description reject must NOT fire.
 */
export const RULE_PREDICATE =
  /\b(?:must|should|shall|never|always|require|avoid|prefer|banned|forbidden|prohibited|allowed|disallowed|deprecated|discouraged|mandatory|do not|don'?t|only|instead)\b/i;
