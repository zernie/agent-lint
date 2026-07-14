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
 *              → mechanism: flip one config line. The "narrow list we compile
 *              very well" — everything else is honestly labelled, not force-fit.
 *   hook     → an ACTION rule a linter can't see (git push, rm -rf, "before you
 *              commit") → mechanism: a pre-commit / PreToolUse hook.
 *   meta     → an agent-instruction, not a code rule ("read X first", "tell the
 *              user", "you are …") → mechanism: stays prose. Split out of
 *              `unrouted` so it never reads as "compilable but hard" (it isn't).
 *   semantic → a judgment call ("readable", "single responsibility") no checker
 *              can honestly decide → mechanism: stays prose.
 *   unrouted → looks like a code rule but matched no off-the-shelf rule: HARD to
 *              codify → mechanism: the opt-in `compile` tier MIGHT synthesize a
 *              checker, but it is NOT guaranteed (the gate may abstain). This is
 *              the bucket audit must present clearly as "hard", never as done.
 *
 * HONESTY BY CONSTRUCTION: the deterministic tier NEVER claims a rule is
 * "synthesizable" — deciding that a custom rule can be written (and gating it)
 * is exactly the work the opt-in model tier does. `unrouted` means "hard —
 * compile to find out", never a promise; `meta`/`semantic` mean "not an
 * enforceable code rule at all" (a different, honest kind of no).
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
import type { RuleCatalog } from "./core/rule-catalog.js";

/** How a routed rule would be enforced (a MECHANISM ladder, not a 1-10 score). */
export type RuleCategory = "reuse" | "hook" | "meta" | "semantic" | "unrouted";
export type RuleMechanism = "config-line" | "hook" | "prose" | "compile";

/** The mechanism each category maps to — a fixed, honest ladder. */
const MECHANISM: Record<RuleCategory, RuleMechanism> = {
  reuse: "config-line",
  hook: "hook",
  meta: "prose",
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
  /** reuse via the DYNAMIC catalog only: whether the rule is currently enabled in
   * the repo's config (a disabled match is the "documented but OFF" nudge). */
  readonly enabled?: boolean;
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
  /**
   * The repo's DYNAMIC available-rule catalog (from `enumerateEslintCatalog`).
   * When provided (OWN-REPO / consented — it executes the linter), a bullet that
   * NAMES any of the repo's real rules routes to `reuse` with its enabled state —
   * not just the ~23 static `INTENT_MAP` aliases. Absent = foreign-safe default
   * (static map only, no execution).
   */
  readonly availableRules?: RuleCatalog;
}

/**
 * ACTION-rule cues — things a linter never sees (git, filesystem, shell,
 * process). A hook is the right gate, not a lint rule. Widened to the article's
 * measured surfaces (vcs / process / shell / redirect) — the narrow original
 * (git-push + rm-rf only) reported ~2% hooks where the 252-rule hand-sort found
 * **37%** (the largest bucket); it was missing push-to-branch, before-push,
 * after-edit, tool-substitution, amend/rebase-pushed, and dependency guards.
 * See `research/rule-compiler-multilang-design.md` §5b (the hook lane).
 */
const HOOK_CUES: readonly RegExp[] = [
  // — branch / push guards (vcs) —
  /\bgit\s+push\b/i,
  // "push … to main/master/prod/origin" — tolerate backticks/adverbs between.
  /\bpush\w*\b[^.\n]{0,24}\b(main|master|prod|production|origin|development)\b/i,
  /\bforce[- ]?push/i,
  /\bpush\w*\b[^.\n]{0,16}\bbranch/i,
  // — protected paths (vcs) —
  /\b(don'?t|do not|never)\s+(edit|modify|touch|change)\b[^.\n]{0,30}\b(generated|vendored|lock(file)?|\.pb\.|proto-gen|_mock|snapshot)/i,
  /\bgenerated\s+files?\b/i,
  // — sequencing / tests-before / after-edit (process) —
  /\b(run|execute)\b[^.\n]{0,30}\b(tests?|lint|check|type-?check|format|prettier|ruff)\b[^.\n]{0,20}\bbefore\b/i,
  /\bbefore\s+(you\s+|each\s+|every\s+)?(commit|push|merg|committing|pushing)/i,
  /\brun\b[^.\n]{0,20}\btests?\b[^.\n]{0,14}\bbefore\b/i,
  /\b(format|lint|check|run)\b[^.\n]{0,30}\b(after|immediately after)\b[^.\n]{0,16}\b(writ|edit)/i,
  // — tool substitution / redirect —
  /\b(never|do not|don'?t)\s+run\b[^.\n]{0,30}\b(directly|instead)\b/i,
  /\b(never|do not|don'?t)\s+run\b[^.\n]{0,20}`?(eslint|prettier|npm|npx|cargo|yarn|pnpm|pip|black|ruff)\b/i,
  /\buse\b\s+`?[\w:.-]+`?\s+(instead of|not|over|rather than)\s+`?(npm|npx|cargo|yarn|pnpm|eslint|prettier)\b/i,
  // — commit content / history (vcs) —
  /\b(amend|squash|rebase)\b[^.\n]{0,40}\b(pushed|review|remote|shared)\b/i,
  /--no-verify/i,
  /\bnever\s+commit\b/i,
  /\bsigned-off-by\b/i,
  /\bco[- ]?authored[- ]?by\b/i,
  /\b(generated with|co-author)\b[^.\n]{0,24}\b(claude|footer|commit|pr)\b/i,
  // — dependency / config guard —
  /\b(never|do not|don'?t)\b[^.\n]{0,20}\bupdate\b[^.\n]{0,20}\b(depend|package\.json|lock)/i,
  // — destructive / shell —
  /\brm\s+-rf\b/i,
  /\bcurl\b.*\|\s*(sh|bash)/i,
  /\bchmod\b/i,
  /\bdestructive\s+git\b/i,
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

/**
 * META cues — an instruction to the AGENT, not a norm about the CODE ("read X
 * first", "tell the user", "you are …", "when in doubt ask"). It is not a lint
 * rule and never will be, so it must NOT land in `unrouted` (which reads as
 * "compilable, just hard"). High-precision by design — specific phrasings a real
 * code rule would not use.
 */
const META_CUES: readonly RegExp[] = [
  // allow `.` in the gap — the referenced thing is often a filename (CLAUDE.md)
  /\bread\b[^\n]{0,30}\bfirst\b/i,
  /\bwhen in doubt\b/i,
  /\bif (you'?re |you are )?unsure\b/i,
  /\bask (the user|first|before)\b/i,
  /\btell (the user|me)\b/i,
  /\byou are\b[^.\n]{0,40}\b(assistant|agent|engineer|claude|model)\b/i,
  /\byour (job|task|role) is\b/i,
  /\b(do not|don'?t|never) (tell|mention|reveal|say)\b/i,
  /\bin (chat|your (reply|response|answer))\b/i,
  // H5 agent-ATTENTION norms (Fable's hook-lane taxonomy): re-read / re-run /
  // re-fetch "without code changes". NOTHING reliably gates these — blocking a
  // re-read breaks post-compaction recovery (false safety worse than an
  // under-blocking guard) — so they are agent-guidance (meta), never a gate. The
  // right instrument is MEASUREMENT (the flight recorder), not enforcement.
  /\bre-?read(?:ing)?\b/i,
  /\bre-?run(?:ning)?\b[^\n]{0,30}\b(?:test|command|suite)\b/i,
  /\bre-?fetch(?:ing)?\b/i,
  /\bwithout code changes\b/i,
];

interface Classification {
  readonly category: RuleCategory;
  readonly rule?: string;
  readonly linter?: LinterName;
  readonly enabled?: boolean;
}

/**
 * Backticked rule-id-shaped tokens a bullet names — `curly`, `curly: error` →
 * `curly`, `@typescript-eslint/consistent-type-imports`, `no-only-tests/no-only-tests`.
 * The leading id is taken (severity/args after a `:`/space are dropped), so the
 * token can be looked up against the dynamic catalog.
 */
const CODE_SPAN_RE = /`([^`]+)`/g;
function namedRuleTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CODE_SPAN_RE)) {
    const id = m[1].trim().match(/^@?[a-z][\w-]*(?:\/[a-z][\w-]*)*/i);
    if (id) out.push(id[0]);
  }
  return out;
}

/**
 * Route one atomic rule. Order matters: an ACTION cue (git push) wins over a
 * rule-name mention ("never commit console.log" is a hook, not a lint rule); a
 * META agent-instruction is pulled out before reuse so it isn't mismatched to a
 * rule; the DYNAMIC catalog (if present) and the static `INTENT_MAP` both feed
 * `reuse`; reuse wins over a soft semantic cue.
 */
function classify(
  text: string,
  catalog?: ReadonlyMap<string, boolean>,
): Classification {
  if (HOOK_CUES.some((re) => re.test(text))) return { category: "hook" };
  if (META_CUES.some((re) => re.test(text))) return { category: "meta" };
  // Dynamic catalog: a bullet that NAMES one of the repo's real rules → reuse,
  // carrying whether it's currently enabled (a disabled hit = the "documented but
  // OFF" nudge). Own-repo only — catalog is present only when the linter was
  // enumerated with consent.
  if (catalog) {
    for (const tok of namedRuleTokens(text)) {
      const enabled = catalog.get(tok);
      if (enabled !== undefined)
        return { category: "reuse", rule: tok, enabled };
    }
  }
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
  const catalog = options.availableRules
    ? new Map(options.availableRules.rules.map((r) => [r.id, r.enabled]))
    : undefined;
  const segments = segmentInstructions(instructionText, file).filter(
    (s) => minConfidence === "medium" || s.confidence === "high",
  );
  const rules: RoutedRule[] = segments.map((s) => {
    const c = classify(s.text, catalog);
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
      ...(c.enabled !== undefined ? { enabled: c.enabled } : {}),
    };
  });
  const counts: Record<RuleCategory, number> = {
    reuse: 0,
    hook: 0,
    meta: 0,
    semantic: 0,
    unrouted: 0,
  };
  for (const r of rules) counts[r.category]++;
  return { segmented: segments.length, counts, rules };
}
