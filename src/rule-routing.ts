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
 *              codify → mechanism `synthesize`: the opt-in SYNTHESIS tier (a
 *              skill on your subscription) MIGHT write a custom checker, gated —
 *              but it is NOT guaranteed (the gate may abstain). This is the
 *              bucket audit must present clearly as "hard", never as done.
 *
 * NB "compile" is NOT used here — `vigiles compile` is the unrelated spec→markdown
 * verb. Synthesis is its own opt-in tier; the mechanism value is `synthesize`.
 *
 * HONESTY BY CONSTRUCTION: the deterministic tier NEVER claims a rule is
 * "synthesizable" — deciding that a custom rule can be written (and gating it)
 * is exactly the work the opt-in model tier does. `unrouted` means "hard — a
 * synthesis skill may try", never a promise; `meta`/`semantic` mean "not an
 * enforceable code rule at all" (a different, honest kind of no).
 *
 * Pure, deterministic, dependency-free. Reuses `rule-inventory`'s hardened
 * whole-token matcher + `INTENT_MAP`, and `segment`'s Tier-A segmenter.
 */
import { segmentInstructions, type SkippedBullet } from "./segment.js";
import {
  INTENT_MAP,
  matchesWholeToken,
  type LinterName,
} from "./rule-inventory.js";
import type { RuleCatalog } from "./core/rule-catalog.js";

/** How a routed rule would be enforced (a MECHANISM ladder, not a 1-10 score). */
export type RuleCategory = "reuse" | "hook" | "meta" | "semantic" | "unrouted";
export type RuleMechanism = "config-line" | "hook" | "prose" | "synthesize";

/** The mechanism each category maps to — a fixed, honest ladder. */
const MECHANISM: Record<RuleCategory, RuleMechanism> = {
  reuse: "config-line",
  hook: "hook",
  meta: "prose",
  semantic: "prose",
  unrouted: "synthesize",
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
  /** How this rule was found: `"marker"` = an explicit `**Enforced by:**` /
   * `**Guard:**` / `**Guidance only**` marker (definitive, zero-heuristic — a
   * compiled/marked doc); `"heuristic"` = the Tier-A segmenter. Absent ⇒ heuristic. */
  readonly source?: "marker" | "heuristic";
}

export interface RuleRouting {
  /** How many CONFIDENT atomic rules were routed (high or rescued). */
  readonly segmented: number;
  readonly counts: Record<RuleCategory, number>;
  /** The CONFIDENT tier — cleared the precision bar; these are the routed rules. */
  readonly rules: readonly RoutedRule[];
  /** The POSSIBLE tier — rule-ish bullets (medium confidence) that did NOT clear
   * the bar, still classified so a human can review + promote them. Detection is
   * precision-first, so this is where a declarative rule ("Every X must Y") that
   * the confident tier misses shows up. See `research/rule-compiler-design.md` §2. */
  readonly possible: readonly RoutedRule[];
  /** Bullets the segmenter decided were NOT rules, each with a reason — so the
   * report is honest about what it set aside (§3). */
  readonly skipped: readonly SkippedBullet[];
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
 * A deontic/norm signal ANYWHERE in a bullet — the marker of a rule the imperative
 * gate missed because the norm isn't at the head ("every function MUST have a
 * docstring", "public APIs SHOULD stay stable"). Used to keep the POSSIBLE review
 * tier to genuine rule-candidates instead of arbitrary unparsed prose. Deliberately
 * narrow (modal verbs only) so it doesn't re-admit the noise it exists to exclude.
 */
const NORM_SIGNAL =
  /\b(?:must(?:n't)?|should(?:n't)?|shall|never|always|avoids?|require[sd]?|forbidden|disallow(?:ed)?|prohibited|banned?|prefers?|do not|don't)\b/i;

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
  // — regenerate-on-change guard (vigiles's own guard() path→cmd shape: "run X
  //   after/when Y changes") — the single biggest missed-hook pattern in the OSS
  //   dogfood. Both clause orders; the trigger MUST be a change-verb so a benign
  //   "run it when ready" doesn't match.
  /\b(re-?run|regenerate|re-?generate|rebuild|regen|run|update)\b[^.\n]{0,48}\b(after|when|whenever|once|if)\b[^.\n]{0,24}\b(chang|add(?:ing|ed)?|modif|updat|edit|new\b)/i,
  /\b(after|when|whenever|once)\b[^.\n]{0,24}\b(chang|add(?:ing|ed)?|modif|updat|edit)[^.\n]{0,48}\b(re-?run|regenerate|rebuild|regen|run|update)\b/i,
  // — commit content / history (vcs) —
  /\b(amend|squash|rebase)\b[^.\n]{0,40}\b(pushed|review|remote|shared)\b/i,
  /--no-verify/i,
  /\b(never|do not|don'?t)\s+commit\b/i,
  /\bsigned-off-by\b/i,
  /\bco-?author(?:s|ed|ing|ed-by)?\b/i,
  // commit/PR METADATA hygiene phrased without a push verb (attribution, PR
  // title, commit message, semantic/conventional commits) — a VCS-surface gate.
  /\b(generated with|attribution)\b[^.\n]{0,24}\b(claude|ai|footer|commit|pr)\b/i,
  /\b(ai|claude|assistant)\b[^.\n]{0,16}\battribution\b/i,
  /\b(semantic|conventional)\s+(commit|pr|pull request)/i,
  // NB: deliberately NO broad `(commit|pr) (title|message)` cue — it mislabels
  // style sentences ("use sentence case for PR titles", "keep commit messages
  // concise") as gates. The enforceable format/attribution rules are caught by
  // the semantic/conventional + attribution cues above; the rest stay prose.
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

/**
 * CONSTRUCT-PROHIBITION → a parameterized BUILT-IN rule. A whole class of
 * "no <language construct>" rules that LOOK custom ("never use classes", "no
 * default exports", "avoid enums") are actually enforceable by ESLint's built-in
 * `no-restricted-syntax` with the right AST selector — no synthesis needed. Each
 * pattern requires a PROHIBITION head next to the construct (precision-first: a
 * negative lookbehind rejects "avoid CSS classes"/"utility classes", the gap cap
 * rejects "first-class functions"/"a class of bugs"). Grounded in real OSS rules
 * (betterauth "NEVER use classes", "prefer named over default exports"). These
 * feed `reuse` — moving rules out of the "hard to codify" lane deterministically.
 */
interface PatternRule {
  readonly construct: string;
  readonly rule: string;
  readonly linter: LinterName;
  readonly pattern: RegExp;
  /** The one-line config that enforces it (a parameterized selector / message). */
  readonly configFix: string;
}
const PATTERN_RULE_MAP: readonly PatternRule[] = [
  {
    construct: "default exports",
    rule: "no-restricted-syntax",
    linter: "eslint",
    pattern:
      /\b(?:no|never|avoid|don'?t\s+use|do\s+not\s+use|disallow|ban|forbid|prefer\s+named\s+(?:exports?\s+)?over)\b[^.\n]{0,24}\bdefault\s+exports?\b/i,
    configFix:
      '"no-restricted-syntax": ["error", { "selector": "ExportDefaultDeclaration", "message": "Use named exports." }]',
  },
  {
    construct: "enums",
    rule: "no-restricted-syntax",
    linter: "eslint",
    pattern:
      /\b(?:no|never|avoid|don'?t\s+use|do\s+not\s+use|disallow|ban|forbid)\b[^.\n]{0,24}\benums?\b/i,
    configFix:
      '"no-restricted-syntax": ["error", { "selector": "TSEnumDeclaration", "message": "Use a union or const object instead of an enum." }]',
  },
  {
    construct: "for...in",
    rule: "no-restricted-syntax",
    linter: "eslint",
    pattern:
      /\b(?:no|never|avoid|don'?t\s+use|do\s+not\s+use|disallow|ban|forbid)\b[^.\n]{0,16}\bfor[\s.]{0,3}in\b/i,
    configFix:
      '"no-restricted-syntax": ["error", { "selector": "ForInStatement", "message": "Use for...of or Object.keys()." }]',
  },
  {
    construct: "namespaces",
    rule: "no-restricted-syntax",
    linter: "eslint",
    pattern:
      /\b(?:no|never|avoid|don'?t\s+use|do\s+not\s+use|disallow|ban|forbid)\b[^.\n]{0,24}\bnamespaces?\b/i,
    configFix:
      '"no-restricted-syntax": ["error", { "selector": "TSModuleDeclaration", "message": "Use ES modules instead of namespaces." }]',
  },
  {
    construct: "classes",
    rule: "no-restricted-syntax",
    linter: "eslint",
    pattern:
      /\b(?:no|never|avoid|don'?t\s+use|do\s+not\s+use|disallow|ban|forbid)\b[^.\n]{0,12}\b(?<!css |style |styling |utility |tailwind |dom |react |component )(?:es6?\s+|javascript\s+)?class(?:es)?\b(?![\s-]*(?:name|attribute|selector|list))/i,
    configFix:
      '"no-restricted-syntax": ["error", { "selector": ":matches(ClassDeclaration, ClassExpression)", "message": "Prefer functions and closures over classes." }]',
  },
  // Pylint: REQUIRE docstrings → missing-function-docstring. A PRESENCE context is
  // required (a presence verb near "docstring", or "docstrings required/for each")
  // so a bare "docstring" mention does NOT over-fire: the dogfood caught langchain
  // routing docstring-CONTENT/STYLE rules ("docstring warnings", "backticks in
  // docstrings", "don't repeat the default in the docstring") to this presence
  // check — those are pydocstyle/ruff-D territory, not missing-docstring.
  {
    construct: "docstrings (presence)",
    rule: "missing-function-docstring",
    linter: "pylint",
    pattern:
      /\b(?:add|require|requires?|write|writing|include|need|needs?|use|using|provide|document|must\s+have)\b[^.\n]{0,24}\bdocstrings?\b|\bdocstrings?\b[^.\n]{0,24}\b(?:required|mandatory|for\s+(?:all|every|each|every|public)|on\s+(?:all|every|each))\b/i,
    configFix:
      "pylint enables missing-function-docstring (C0116) by default; keep it out of the disable list",
  },
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
/** A dynamic-catalog lookup result: which linter the named rule belongs to, and
 * whether it's currently enabled. Carrying the linter (not just a bool) is what
 * lets a polyglot repo's map say `pylint:invalid-name` vs `eslint:no-console`. */
type CatalogHit = { enabled: boolean; linter: "eslint" | "pylint" };

function classify(
  text: string,
  catalog?: ReadonlyMap<string, CatalogHit>,
): Classification {
  if (HOOK_CUES.some((re) => re.test(text))) return { category: "hook" };
  if (META_CUES.some((re) => re.test(text))) return { category: "meta" };
  // Dynamic catalog: a bullet that NAMES one of the repo's real rules → reuse,
  // carrying its linter + whether it's currently enabled (a disabled hit = the
  // "documented but OFF" nudge). Own-repo only — catalog is present only when the
  // linter was enumerated with consent.
  if (catalog) {
    for (const tok of namedRuleTokens(text)) {
      const hit = catalog.get(tok);
      if (hit !== undefined)
        return {
          category: "reuse",
          rule: tok,
          enabled: hit.enabled,
          linter: hit.linter,
        };
    }
  }
  for (const m of INTENT_MAP) {
    if (m.keywords.some((kw) => matchesWholeToken(text, kw))) {
      return { category: "reuse", rule: m.rule, linter: m.linter };
    }
  }
  // Pattern → a built-in parameterized rule (eslint no-restricted-syntax
  // construct-prohibitions; pylint docstring-presence). These LOOK custom but
  // are reuse; each carries its own linter.
  for (const r of PATTERN_RULE_MAP) {
    if (r.pattern.test(text))
      return { category: "reuse", rule: r.rule, linter: r.linter };
  }
  if (SEMANTIC_CUES.some((re) => re.test(text)))
    return { category: "semantic" };
  return { category: "unrouted" };
}

// --- Structured-marker pre-pass (S0/S1) ------------------------------------

const ENFORCED_RE = /^\*\*Enforced by:\*\*\s*`([^`]+)`/;
const GUARD_RE = /^\*\*Guard:\*\*/;
const GUIDANCE_RE = /^\*\*Guidance only\*\*/;
const MARK_HEADING = /^(#{2,6})\s+(.*)$/;
const RULE_ID_SHAPE = /^@?[a-z][a-z0-9._/-]*$/;

/** Does this `**Enforced by:**` value parse as a lint-rule id (vs a prose claim
 * like "CI" or "the linter")? A hand-written marker is a CLAIM — only a rule-id
 * shape is treated as a real reuse rule. */
function looksLikeRuleId(s: string): boolean {
  return s.length >= 3 && RULE_ID_SHAPE.test(s.trim());
}

/**
 * Extract rules from EXPLICIT structured markers (`**Enforced by:** \`rule\``,
 * `**Guard:**`, `**Guidance only**`) — the S0/S1 tier. A compiled/marked doc
 * declares its own routing, so these are definitive (zero-heuristic) and are
 * CONSUMED before the heuristic segmenter runs (the returned `skip` line set) so
 * a marked rule is never double-counted. Each marker → ONE atom named by its
 * `##`/`###` heading; a `**Guidance only**` body is still routed through
 * `classify` (the promote-prose signal: a guidance whose body says "before
 * commit" surfaces as a would-be hook). Foreign hand-written `**Enforced by:**`
 * is a CLAIM — only a rule-id-shaped value becomes a reuse rule (gated + verified
 * against the catalog when present; never an inferred contradiction).
 */
function extractMarkedRules(
  text: string,
  file: string | undefined,
  catalog: ReadonlyMap<string, CatalogHit> | undefined,
): { rules: RoutedRule[]; skip: Set<number> } {
  const lines = text.split("\n");
  const rules: RoutedRule[] = [];
  const skip = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const h = MARK_HEADING.exec(lines[i]);
    if (!h) continue;
    let j = i + 1;
    while (j < lines.length && !MARK_HEADING.test(lines[j])) j++;
    const section = lines.slice(i, j); // [heading … next-heading)
    const heading = h[2].trim();

    let marked: Classification | null = null;
    for (const raw of section.slice(1)) {
      const bl = raw.trim();
      const em = ENFORCED_RE.exec(bl);
      if (em) {
        if (!looksLikeRuleId(em[1])) break; // a prose claim, not a rule id
        const hit = catalog?.get(em[1].trim());
        marked = {
          category: "reuse",
          rule: em[1].trim(),
          ...(hit !== undefined
            ? { enabled: hit.enabled, linter: hit.linter }
            : {}),
        };
        break;
      }
      if (GUARD_RE.test(bl)) {
        marked = { category: "hook" };
        break;
      }
      if (GUIDANCE_RE.test(bl)) {
        // Route the guidance BODY through classify (promote-prose): a guidance
        // whose text is really an action shows up as a would-be hook.
        const body = section.slice(1).join(" ");
        const c = classify(body, catalog);
        // A guidance body that names a catalog rule is still "documented as
        // guidance" — keep it prose unless it's a genuine action/agent cue.
        marked =
          c.category === "hook" || c.category === "meta"
            ? c
            : { category: "semantic" };
        break;
      }
    }
    if (!marked) continue;

    // Consume the section BODY lines (heading stays a non-candidate) so the
    // heuristic segmenter never re-emits this marked rule. (1-based.)
    for (let k = i + 1; k < j; k++) skip.add(k + 1);

    rules.push({
      text: heading,
      quote: lines[i],
      file,
      lineStart: i + 1,
      lineEnd: j,
      confidence: "high",
      category: marked.category,
      mechanism: MECHANISM[marked.category],
      source: "marker",
      ...(marked.rule ? { rule: marked.rule } : {}),
      ...(marked.enabled !== undefined ? { enabled: marked.enabled } : {}),
    });
  }
  return { rules, skip };
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
    ? new Map<string, CatalogHit>(
        options.availableRules.rules.flatMap((r) => {
          // A rule is matchable by its id AND, for Pylint, its numeric code
          // (`C0116`) — a doc may name either the symbol or the code. Both keys
          // carry the linter so a merged polyglot catalog keeps provenance.
          const hit: CatalogHit = { enabled: r.enabled, linter: r.linter };
          return r.code
            ? [
                [r.id, hit],
                [r.code, hit],
              ]
            : [[r.id, hit]];
        }),
      )
    : undefined;
  // A MEDIUM segment that NAMES a rule the repo's catalog actually has is
  // enforceable — the catalog is ground truth, so it's higher-precision than the
  // segmenter's imperative-head cue. This rescues declarative-subject bullets
  // ("The core layer must not import X (`boundaries/dependencies`)") that score
  // medium (context+shape, no imperative head) and are otherwise dropped by the
  // high-only default. Own-repo only (catalog present ⇒ enumerated with consent);
  // the foreign-safe textual path stays conservative by design.
  const namesCatalogRule = (text: string): boolean =>
    catalog !== undefined &&
    namedRuleTokens(text).some((tok) => catalog.has(tok));
  // A MEDIUM segment matching a construct-prohibition ("No default exports")
  // scores medium ("No" is a prohibition head, not a verb) but is a real reuse
  // rule (no-restricted-syntax) — rescue it, same as the catalog rescue. The
  // patterns are their own precision gate (prohibition + construct proximity).
  const matchesPatternRule = (text: string): boolean =>
    PATTERN_RULE_MAP.some((r) => r.pattern.test(text));
  // A MEDIUM segment that matches an INTENT_MAP keyword (code-shaped, high-
  // precision) is a real reuse rule — rescue it, same as catalog/restricted-
  // syntax. Fixes construct-prohibitions with no verb ("No bare except clauses")
  // that score medium and would otherwise drop before classify() reuses them.
  const matchesIntentMap = (text: string): boolean =>
    INTENT_MAP.some((m) =>
      m.keywords.some((kw) => matchesWholeToken(text, kw)),
    );
  // A segment is CONFIDENT if it's high, rescued by the catalog/pattern/intent, or
  // the caller opted into medium. Everything else the segmenter emitted is a
  // POSSIBLE rule (medium, unrescued) — surfaced for review, not routed as fact.
  const isConfident = (s: { text: string; confidence: "high" | "medium" }) =>
    minConfidence === "medium" ||
    s.confidence === "high" ||
    namesCatalogRule(s.text) ||
    matchesPatternRule(s.text) ||
    matchesIntentMap(s.text);

  const toRouted = (s: {
    text: string;
    exactQuote: string;
    file: string | undefined;
    lineStart: number;
    lineEnd: number;
    confidence: "high" | "medium";
  }): RoutedRule => {
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
      source: "heuristic" as const,
      ...(c.rule ? { rule: c.rule } : {}),
      ...(c.linter ? { linter: c.linter } : {}),
      ...(c.enabled !== undefined ? { enabled: c.enabled } : {}),
    };
  };

  // S0/S1 pre-pass: explicit markers are definitive and are CONSUMED (their body
  // lines are skipped) so the heuristic segmenter can't double-count them.
  const marked = extractMarkedRules(instructionText, file, catalog);
  const { segments, skipped: rawSkipped } = segmentInstructions(
    instructionText,
    file,
    marked.skip,
  );
  // A bullet the gate rejected as `no-signal` is a rule CANDIDATE only if it
  // carries a deontic/norm signal (a modal like must/should/never/avoid) — that
  // keeps the POSSIBLE review tier to genuine recall-misses ("every function must
  // have a docstring") instead of flooding it with prose ("README.md documents
  // v2"). A no-signal bullet WITHOUT a norm signal is confidently not a rule, so
  // it stays SKIPPED alongside the index/description/section rejects. A folded
  // candidate that NAMES/matches a real rule is still rescued to CONFIDENT.
  const asCandidate = (s: SkippedBullet) => ({
    text: s.text,
    exactQuote: s.text,
    file: s.file,
    lineStart: s.lineStart,
    lineEnd: s.lineEnd,
    confidence: "medium" as const,
  });
  // Fold ALL `no-signal` rejects back in as candidates (so a rule-naming one is
  // still rescued to confident), then decide the tiers:
  const noSignal = rawSkipped.filter((s) => s.reason === "no-signal");
  const candidates = [...segments, ...noSignal.map(asCandidate)];
  const heuristicRules = candidates.filter(isConfident).map(toRouted);
  // The non-confident leftovers split by the norm signal: a rule-ish bullet
  // (carries a deontic modal) is a genuine recall-miss → POSSIBLE (review); the
  // rest is prose → SKIPPED with a `no-signal` reason (visible, not dropped).
  const leftover = candidates.filter((s) => !isConfident(s));
  const possible = leftover
    .filter((s) => NORM_SIGNAL.test(s.text))
    .map(toRouted);
  const skipped: SkippedBullet[] = [
    ...rawSkipped.filter((s) => s.reason !== "no-signal"),
    ...leftover
      .filter((s) => !NORM_SIGNAL.test(s.text))
      .map((s) => ({
        text: s.text,
        file: s.file,
        lineStart: s.lineStart,
        lineEnd: s.lineEnd,
        reason: "no-signal" as const,
      })),
  ];

  // Marker rules first (definitive), then the heuristic residue.
  const rules: RoutedRule[] = [...marked.rules, ...heuristicRules];
  const counts: Record<RuleCategory, number> = {
    reuse: 0,
    hook: 0,
    meta: 0,
    semantic: 0,
    unrouted: 0,
  };
  for (const r of rules) counts[r.category]++;
  return { segmented: rules.length, counts, rules, possible, skipped };
}

/**
 * Merge per-file routings into one. Each instruction source is routed SEPARATELY
 * (so every rule keeps its OWN file path + line numbers — concatenating first
 * would corrupt the provenance the preview promises), then folded here: rules
 * concatenated, counts + segmented summed. Pure. `[]` → an empty routing.
 */
export function mergeRoutings(routings: readonly RuleRouting[]): RuleRouting {
  const counts: Record<RuleCategory, number> = {
    reuse: 0,
    hook: 0,
    meta: 0,
    semantic: 0,
    unrouted: 0,
  };
  const rules: RoutedRule[] = [];
  const possible: RoutedRule[] = [];
  const skipped: SkippedBullet[] = [];
  let segmented = 0;
  for (const r of routings) {
    segmented += r.segmented;
    rules.push(...r.rules);
    possible.push(...r.possible);
    skipped.push(...r.skipped);
    for (const k of Object.keys(counts) as RuleCategory[])
      counts[k] += r.counts[k];
  }
  return { segmented, counts, rules, possible, skipped };
}
