/**
 * rule-routing.ts — the deterministic (no-model) State-B routing PREVIEW.
 *
 * `rule-inventory.ts` answers a narrow question ("which prose lines name an
 * off-the-shelf lint rule, and is it enabled?"). This goes one honest step
 * further: it SEGMENTS the whole instruction file into atomic rules
 * ({@link segmentInstructions}) and routes each one into the class that a real
 * enforcement path would take — WITHOUT running a model:
 *
 *   reuse    → the rule text names an off-the-shelf lint rule ({@link INTENT_MAP})
 *              → mechanism: flip one config line.
 *   hook     → an ACTION rule a linter can't see (git push, rm -rf, "before you
 *              commit") → mechanism: a pre-commit / PreToolUse hook.
 *   semantic → a judgment call ("readable", "single responsibility") no checker
 *              can honestly decide → mechanism: stays prose.
 *   unrouted → none of the above fired deterministically → mechanism: the opt-in
 *              `compile` tier routes it (reuse / synthesize / hook / prose).
 *
 * HONESTY BY CONSTRUCTION: the deterministic tier NEVER claims a rule is
 * "synthesizable" — deciding that a custom rule can be written (and gating it)
 * is exactly the work the opt-in model tier does. Everything this file can't
 * pin to a concrete cue is `unrouted` ("compile to find out"), not a promise.
 *
 * Pure, deterministic, dependency-free. Reuses `rule-inventory`'s hardened
 * whole-token matcher + `INTENT_MAP`, and `segment`'s Tier-A segmenter.
 */
import { segmentInstructions } from "./segment.js";
import {
  INTENT_MAP,
  matchesWholeToken,
  type LinterName,
} from "./rule-inventory.js";

/** How a routed rule would be enforced (a MECHANISM ladder, not a 1-10 score). */
export type RuleCategory = "reuse" | "hook" | "semantic" | "unrouted";
export type RuleMechanism = "config-line" | "hook" | "prose" | "compile";

/** The mechanism each category maps to — a fixed, honest ladder. */
const MECHANISM: Record<RuleCategory, RuleMechanism> = {
  reuse: "config-line",
  hook: "hook",
  semantic: "prose",
  unrouted: "compile",
};

/** One segmented, deterministically-routed rule with provenance. */
export interface RoutedRule {
  /** Normalized atomic rule text (from the segmenter). */
  readonly text: string;
  /** Verbatim source slice — for a UI highlight. */
  readonly quote: string;
  readonly file: string | undefined;
  readonly lineStart: number;
  readonly lineEnd: number;
  /** Segmenter confidence that this IS a rule (3/3 cues → high, 2/3 → medium). */
  readonly confidence: "high" | "medium";
  readonly category: RuleCategory;
  readonly mechanism: RuleMechanism;
  /** reuse only: the off-the-shelf rule that enforces it. */
  readonly rule?: string;
  /** reuse only: the linter that rule belongs to. */
  readonly linter?: LinterName;
}

export interface RuleRouting {
  /** How many atomic rules were routed (after the confidence filter). */
  readonly segmented: number;
  readonly counts: Record<RuleCategory, number>;
  readonly rules: readonly RoutedRule[];
}

export interface RouteOptions {
  /**
   * Minimum segmenter confidence to route. The segmenter emits `high` (3/3 cues
   * — an imperative rule) and `medium` (2/3). For the audit PREVIEW we default to
   * `high` only: precision over recall. A doc-heavy instruction file (e.g. a
   * keyFiles index of "`path` — description" bullets) trips the medium tier with
   * non-rules, which would bury the real rules and overstate "unrouted". Pass
   * `"medium"` to include both.
   */
  readonly minConfidence?: "high" | "medium";
}

/**
 * ACTION-rule cues — things a linter never sees (git, filesystem, shell,
 * process). A hook is the right gate, not a lint rule. Ported from the compiler's
 * classifier; deliberately specific so it doesn't grab a lint rule that merely
 * mentions a file.
 */
const HOOK_CUES: readonly RegExp[] = [
  /\bgit\s+push\b/i,
  // "push … to main/master/prod" — tolerate backticks/adverbs between (real
  // phrasings: "push directly to `main`", "pushing straight to master").
  /\bpush\w*\b[^.\n]{0,24}\b(main|master|prod)\b/i,
  /\bforce[- ]?push/i,
  /--no-verify/i,
  /\bnever\s+commit\b/i,
  // "before you/each/every commit", "before committing".
  /\bbefore\s+(you\s+|each\s+|every\s+)?commit(ting)?\b/i,
  /\brun\b[^.\n]{0,20}\btests?\b[^.\n]{0,14}\bbefore\b/i,
  /\bsigned-off-by\b/i,
  /\b(don'?t|do not|never)\s+edit\b.*\b(generated|\.pb\.|_mock|proto-gen|lock)/i,
  /\bgenerated\s+files?\b/i,
  /\bco[- ]?authored[- ]?by\b/i,
  /\brm\s+-rf\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bchmod\b/i,
];

/**
 * Judgment / no-checker cues — a rule no linter can honestly decide, so it stays
 * labeled prose. Ported from the compiler's classifier (the static markers only —
 * no ruleMap dependency, to keep this file model-free and dep-free).
 */
const SEMANTIC_CUES: readonly RegExp[] = [
  /\bself[- ]?documenting\b/i,
  /\bclear(er)?\s+(names?|code|over clever)/i,
  /\breadable\b/i,
  /\bkeep it simple\b/i,
  /\bover[- ]?engineer/i,
  /\bsingle responsibility\b/i,
  /\bcomposition over inheritance\b/i,
  /\bmeaningful\b/i,
  /\bidiomatic\b/i,
  /\bwhere (it )?makes sense\b/i,
  /\bappropriate(ly)?\b/i,
  /\bsolid\s+principles?\b/i,
  /\bbest practices?\b/i,
  /\bclean code\b/i,
];

interface Classification {
  readonly category: RuleCategory;
  readonly rule?: string;
  readonly linter?: LinterName;
}

/**
 * Route one atomic rule. Order matters: an ACTION cue (git push) wins over a
 * rule-name mention ("never commit console.log" is a hook, not a lint rule);
 * reuse (a concrete off-the-shelf rule) wins over a soft semantic cue.
 */
function classify(text: string): Classification {
  if (HOOK_CUES.some((re) => re.test(text))) return { category: "hook" };
  for (const m of INTENT_MAP) {
    if (m.keywords.some((kw) => matchesWholeToken(text, kw))) {
      return { category: "reuse", rule: m.rule, linter: m.linter };
    }
  }
  if (SEMANTIC_CUES.some((re) => re.test(text)))
    return { category: "semantic" };
  return { category: "unrouted" };
}

/**
 * Segment the instruction file and route every atomic rule deterministically.
 * Pure: the caller passes the concatenated instruction text (and an optional
 * source path for provenance). Returns per-category counts + the routed rules.
 */
export function routeRules(
  instructionText: string,
  file?: string,
  options: RouteOptions = {},
): RuleRouting {
  const minConfidence = options.minConfidence ?? "high";
  const segments = segmentInstructions(instructionText, file).filter(
    (s) => minConfidence === "medium" || s.confidence === "high",
  );
  const rules: RoutedRule[] = segments.map((s) => {
    const c = classify(s.text);
    return {
      text: s.text,
      quote: s.exactQuote,
      file: s.file,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      confidence: s.confidence,
      category: c.category,
      mechanism: MECHANISM[c.category],
      ...(c.rule ? { rule: c.rule } : {}),
      ...(c.linter ? { linter: c.linter } : {}),
    };
  });
  const counts: Record<RuleCategory, number> = {
    reuse: 0,
    hook: 0,
    semantic: 0,
    unrouted: 0,
  };
  for (const r of rules) counts[r.category]++;
  return { segmented: segments.length, counts, rules };
}
