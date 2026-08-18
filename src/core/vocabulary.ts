/**
 * HarnessVocabulary — the platform's own words, with a STATUS per word.
 *
 * The three vocabulary checks (`hook-events`, `subagent-tool-contract`, and the
 * `disallowedTools:` mirror) used to model a harness's vocabulary as two
 * hand-kept arrays — "these names are fine", "these names are dead" — and then
 * decide what to SAY about a name in neither by its EDIT DISTANCE to the first
 * array. That is the defect this module exists to remove, and it failed in both
 * directions at once (measured against the vendor docs, 2026-08-17):
 *
 *  - FALSE ACCUSATION. `Setup` is a documented Claude Code hook event. It was
 *    reported as "a hook here never fires … Did you mean Stop?" — and the
 *    suggested repair rewires a one-shot setup hook onto every turn's Stop.
 *    It was caught for one reason only: `setup` happens to sit at edit distance
 *    2 from `stop`.
 *  - SILENCE. Of the 31 events the vendor documents, the old catalog held 9.
 *    The other 22 were not "accepted" — they were unrecognised and >2 away from
 *    any known name, so nothing was said. `SubagentStart` and `PostCompact` sat
 *    at distance 3: one character from becoming the next `Setup`.
 *
 * So which of the two a valid name got — an accusation or silence — was decided
 * by spelling luck. Neither is a verdict, and a tool whose pitch is precision
 * cannot ship either as its answer to "I don't know this word".
 *
 * The fix is not a longer array. It is to stop asking "is this string in my
 * list?" (a boolean, which has no room for "I don't know") and start asking
 * "what does my catalog SAY about this string?" — a {@link TermVerdict}, which
 * has four answers because the vendor's own documentation distinguishes four:
 *
 *  - `available`     — the platform provides it.
 *  - `withheld`      — the platform removes it, unconditionally. A real defect.
 *  - `conditional`   — the platform removes it only under a STATED condition
 *                      (`Agent` at the depth limit; `ExitPlanMode` unless
 *                      `permissionMode: plan`; every non-background built-in when
 *                      the subagent runs in the background). vigiles cannot see
 *                      the condition, so it must not assert — it reports the
 *                      condition and stops.
 *  - `unrecognised`  — not in the catalog. This is a statement about VIGILES,
 *                      not about the repo being audited, and the message says so.
 *
 * THE THIRD OPTION. `unrecognised` is why this module exists. Silence reads as
 * approval and hides our own staleness; an error blames the user for our gap.
 * The honest third answer is an ADVISORY that names vigiles as the possibly-stale
 * party and prints the capture the catalog came from. It is surfaced and it is
 * never scored, so a name newer than our capture can never cost anyone a grade.
 *
 * WHY THE DISTANCE IS NOT ON THE VERDICT. {@link TermVerdict}'s `unrecognised`
 * branch carries no near-match. A caller therefore CANNOT write
 * `if (nearest) report()` — the shape that produced both bugs — because at the
 * point where the report/skip decision is made, no distance is in scope.
 * {@link suggest} exists solely to decorate a message that is already being
 * emitted, and is called from the message builder, not from a branch.
 *
 * FAILING LOUDLY. `classify` is total: every name returns one of four cases, so
 * a `switch` that forgets one is a `tsc` error via the `never` exhaustiveness
 * check in {@link termIssue}. There is no `null`/`undefined` return to ignore.
 *
 * GOING STALE. It will. `capturedFrom` records the exact vendor artifact and
 * version each catalog was read from, and every name we do not hold prints it.
 * That is the difference from an ordinary allowlist: this one reports its own
 * age at the moment it is out of date, rather than silently approving the word
 * it has never heard of.
 */
import { editDistance } from "./edit-distance.js";

/** What the platform does with a term, per the vendor's own documentation. */
export type TermStatus = "available" | "withheld" | "conditional";

/** One word of a harness's vocabulary, with what the platform does with it. */
export interface VocabularyTerm {
  readonly name: string;
  readonly status: TermStatus;
  /**
   * The vendor's stated condition, near-verbatim. REQUIRED when `status` is
   * `"conditional"` — a condition we cannot quote is a condition we cannot
   * report, and reporting it is the whole point of the status.
   */
  readonly condition?: string;
  /**
   * The current name this term is a still-working deprecated alias of (e.g.
   * `Task` → `Agent`, renamed in Claude Code 2.1.63). An alias is NOT a defect:
   * the platform keeps honouring it.
   */
  readonly aliasOf?: string;
}

/** A named set of platform terms, tagged with where and when it was captured. */
export interface HarnessVocabulary {
  /** Which vocabulary this is — used in messages, so it must read as English. */
  readonly kind: string;
  /**
   * The exact vendor artifact + version this catalog was read from, e.g.
   * `"code.claude.com/docs/en/hooks § Hook events (claude-code 2.1.233)"`.
   * Printed with every `unrecognised` advisory, so our staleness is visible to
   * the person who hit it rather than only to us.
   */
  readonly capturedFrom: string;
  readonly terms: readonly VocabularyTerm[];
}

/**
 * What the catalog says about one name. Total — there is no absent answer, and
 * deliberately no near-match on the `unrecognised` branch (see the module note:
 * a distance in scope at the decision point is what produced the bugs).
 */
export type TermVerdict =
  | { readonly kind: "available"; readonly term: VocabularyTerm }
  | { readonly kind: "withheld"; readonly term: VocabularyTerm }
  | { readonly kind: "conditional"; readonly term: VocabularyTerm }
  | { readonly kind: "unrecognised"; readonly name: string };

/** How much weight a finding carries — the ONLY input to whether it is scored. */
export type IssueSeverity =
  /** A defect in the audited repo. Enters the grade. */
  | "scored"
  /** True but not actionable, or a statement about vigiles. Never scored. */
  | "advisory";

/** Look the name up. Total: always one of the four verdicts, never null. */
export function classify(vocab: HarnessVocabulary, name: string): TermVerdict {
  const term = vocab.terms.find((t) => t.name === name);
  if (term === undefined) return { kind: "unrecognised", name };
  switch (term.status) {
    case "available":
      return { kind: "available", term };
    case "withheld":
      return { kind: "withheld", term };
    case "conditional":
      return { kind: "conditional", term };
  }
}

/**
 * Closest catalog name within edit distance 2, else null — a MESSAGE decoration
 * only. Never call this to decide whether to report something; the verdict has
 * already decided that. The ≤2 bound stays tight for the reason it always was:
 * a loose bound mis-suggests (`TaskGet → Task?` is a different real tool, not a
 * typo). Only `available` terms are offered — suggesting a name the platform
 * withholds would trade one dead reference for another.
 */
export function suggest(vocab: HarnessVocabulary, name: string): string | null {
  const near = nearest(vocab, name);
  return near !== null && near.distance <= SUGGEST_MAX ? near.name : null;
}

/** How far a hint may reach. Beyond this a "did you mean" mis-suggests. */
const SUGGEST_MAX = 2;

/**
 * How close an unrecognised name must be to a real one before vigiles will call
 * it a TYPO and put it in the grade, rather than treating it as a name it simply
 * does not know.
 *
 * MEASURED, not assumed — and the measurement is the whole reason the old check
 * failed. Over every pair of distinct names in the two shipped Claude Code
 * vocabularies (465 hook-event pairs, 741 subagent-tool pairs):
 *
 *   distance 1 : 0 pairs of the 1,206
 *   distance 2 : exactly 1 pair in each — `Setup`/`Stop` and `Bash`/`Task`
 *
 * So the vendor does not ship two real names one edit apart, which makes
 * distance 1 strong evidence of a mistyped name. Distance 2, on the other hand,
 * is exactly where two genuinely different real names DO collide — and the one
 * event-pair that collides there is the bug itself: the old code used ≤2 as its
 * threshold and therefore accused `Setup`, a real event, of being a typo of
 * `Stop`. The old bound was not merely too loose, it was set precisely at the
 * width of the collision.
 *
 * Hence: distance 1 is scored, distance 2 still earns a did-you-mean but stays
 * advisory. RESIDUAL RISK, stated plainly: if the vendor ever ships a name one
 * edit from an existing one, it will be scored as a typo until the catalog is
 * updated. Zero of 1,206 current pairs are that close, and `dialect-drift` plus
 * the conformance invariants are what surface the catalog falling behind.
 */
const TYPO_MAX = 1;

/** Closest catalog name and its distance, or null when the vocabulary is empty. */
function nearest(
  vocab: HarnessVocabulary,
  name: string,
): { readonly name: string; readonly distance: number } | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const t of vocab.terms) {
    if (t.status === "withheld") continue;
    const d = editDistance(name.toLowerCase(), t.name.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = t.name;
    }
  }
  return best === null ? null : { name: best, distance: bestDistance };
}

/** A vocabulary finding: the message to show and whether it counts. */
export interface TermIssue {
  /** Which verdict produced this — the input to every downstream policy. */
  readonly verdict: TermVerdict["kind"];
  readonly severity: IssueSeverity;
  readonly message: string;
  /** Near-match for the message only; null unless the term is unrecognised. */
  readonly suggestion: string | null;
  /**
   * The vendor condition, present only for a `conditional` verdict. Carried so a
   * report can GROUP the tools that share one condition instead of repeating the
   * same sentence per tool — a delegating subagent legitimately declares eight of
   * them, and eight identical paragraphs is noise from a tool that sells itself
   * on not crying wolf.
   */
  readonly condition?: string;
}

/**
 * Turn a verdict into the finding to report, or null when there is nothing to
 * say. The severity is decided HERE, once, from the verdict — callers never
 * invent their own policy, which is what let `scan` and `lint` drift apart from
 * `compileAgent` before.
 *
 * `noun` names the thing in the message ("hook event" / "tool"); `subject`
 * describes what listing it does, e.g. "a hook here never fires".
 */
export function termIssue(
  vocab: HarnessVocabulary,
  verdict: TermVerdict,
  noun: string,
  deadConsequence: string,
): TermIssue | null {
  switch (verdict.kind) {
    case "available":
      return null;
    case "conditional": {
      const alias =
        verdict.term.aliasOf !== undefined
          ? ` "${verdict.term.name}" is a still-supported deprecated alias of "${verdict.term.aliasOf}".`
          : "";
      return {
        verdict: "conditional",
        severity: "advisory",
        suggestion: null,
        condition: verdict.term.condition,
        message:
          `${noun} "${verdict.term.name}" is available to a subagent, but the platform ` +
          `removes it ${verdict.term.condition ?? "under a documented condition"}. ` +
          `vigiles cannot see that condition from the file, so this is a note, not a defect.${alias}`,
      };
    }
    case "withheld":
      return {
        verdict: "withheld",
        severity: "scored",
        suggestion: null,
        message: `${noun} "${verdict.term.name}" is never available to a subagent — remove it from the tools list.`,
      };
    case "unrecognised": {
      const near = nearest(vocab, verdict.name);
      const suggestion =
        near !== null && near.distance <= SUGGEST_MAX ? near.name : null;
      // One edit from a real name, and no two real names are that close (see
      // TYPO_MAX): this is a mistyped name, and it is dead in the repo now.
      if (near !== null && near.distance <= TYPO_MAX)
        return {
          verdict: "unrecognised",
          severity: "scored",
          suggestion,
          message:
            `${noun} "${verdict.name}" matches no known name — ${deadConsequence}. ` +
            `Did you mean "${near.name}"?`,
        };
      const hint = suggestion !== null ? ` Did you mean "${suggestion}"?` : "";
      return {
        verdict: "unrecognised",
        severity: "advisory",
        suggestion,
        message:
          `${noun} "${verdict.name}" is not in vigiles's ${vocab.kind} catalog ` +
          `(captured from ${vocab.capturedFrom}). If it is newer than that capture, or ` +
          `custom to your harness, vigiles is out of date — not your config. ` +
          `If it is a typo, ${deadConsequence}.${hint}`,
      };
    }
    default: {
      // Exhaustiveness: a new verdict kind with no branch is a tsc error here,
      // so a future status cannot be silently dropped on the floor.
      const never: never = verdict;
      return never;
    }
  }
}

/**
 * The issues that count toward a grade. Replaces the per-check
 * `confidentToolIssues` / `confidentHookEventIssues` helpers, which asked "is
 * there a near match?" — a question about spelling, answered by a helper each
 * caller had to remember to apply and which `compileAgent` did not, so `scan`,
 * `lint` and authoring could disagree about which issues were real. Severity now
 * travels ON the issue, decided once in {@link termIssue}, so the split is the
 * same wherever it is taken.
 */
export function scoredIssues<T extends { readonly severity: IssueSeverity }>(
  issues: readonly T[],
): T[] {
  return issues.filter((i) => i.severity === "scored");
}

/**
 * The issues that are surfaced but never scored — `conditional` tools and any
 * name newer than our capture. Kept out of the grade on purpose: vigiles's own
 * staleness must not cost someone a letter.
 */
export function advisoryIssues<T extends { readonly severity: IssueSeverity }>(
  issues: readonly T[],
): T[] {
  return issues.filter((i) => i.severity === "advisory");
}

/**
 * The issues an AUTHORING path treats as errors — everything except
 * `conditional`. Authoring is a CLOSED world: you are writing this spec now,
 * against the vigiles you have, so an unrecognised name is a typo worth stopping
 * for. Auditing is an OPEN world: someone else wrote the file, possibly against
 * a newer platform, so there the same verdict is only an advisory.
 *
 * `conditional` is an error in NEITHER. The tool is real and declaring it is
 * correct; erroring on it is exactly what told delegating subagents to drop
 * `Agent`, and what made `tools: Agent, Read, Bash` — a worked example in the
 * vendor's own docs — fail to compile.
 */
export function authoringIssues<
  T extends { readonly verdict: TermVerdict["kind"] },
>(issues: readonly T[]): T[] {
  return issues.filter((i) => i.verdict !== "conditional");
}

/**
 * Build a vocabulary from a dialect that predates this module — `available` from
 * its built-in catalog, `withheld` from its never-available list. A dialect on
 * the legacy shape keeps working and its unknowns become `unrecognised`
 * ADVISORIES rather than silence, which is the honest reading: a catalog with no
 * recorded capture cannot claim a name is invalid.
 */
export function vocabularyFromLists(
  kind: string,
  capturedFrom: string,
  available: readonly string[],
  withheld: readonly string[] = [],
): HarnessVocabulary {
  return {
    kind,
    capturedFrom,
    terms: [
      ...available.map(
        (name): VocabularyTerm => ({ name, status: "available" }),
      ),
      ...withheld.map((name): VocabularyTerm => ({ name, status: "withheld" })),
    ],
  };
}
