/**
 * segment.ts — Tier-A deterministic (no-model) segmenter.
 *
 * Splits a CLAUDE.md / AGENTS.md into ATOMIC candidate rules with provenance.
 * Pure, deterministic, strict TS, no external deps.
 *
 * Design bias: PRECISION over recall. A missed rule costs a row; a garbage
 * atom costs credibility. When in doubt we UNDER-split and REJECT.
 */

import { FORM_HEAD, RULE_PREDICATE } from "./rule-signals.js";

/** A single atomic candidate rule extracted from an instructions file. */
export interface SegmentedRule {
  /** Normalized rule text (bullet marker stripped, continuation joined, whitespace collapsed). */
  text: string;
  /** Source file path (as supplied by the caller), or undefined. */
  file: string | undefined;
  /** 1-based inclusive start line in the source. */
  lineStart: number;
  /** 1-based inclusive end line in the source. */
  lineEnd: number;
  /** Verbatim slice of the source spanning [lineStart..lineEnd] — for UI highlight. */
  exactQuote: string;
  /** 3/3 cues => "high"; 2/3 => "medium". (Rejected candidates are never emitted.) */
  confidence: "high" | "medium";
}

/** Why the segmenter decided a bullet is NOT a rule (the transparency signal —
 * see `research/rule-compiler-design.md` §3). `index`/`description`/`no-signal`
 * come from the gate; `section` means it sits under a non-rule heading
 * (Setup / Commands / Key Files / Architecture …). */
export type RejectReason = "index" | "description" | "no-signal" | "section";

/** A BULLET the segmenter saw but did NOT treat as a rule, with the reason — so
 * the audit report can be honest about what it set aside (a heuristic misses
 * declarative rules; showing skips lets a human eyeball a wrong drop). Bounded to
 * list items on purpose; rejected paragraph prose is not reported (too noisy). */
export interface SkippedBullet {
  readonly text: string;
  readonly file: string | undefined;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly reason: RejectReason;
}

/** The segmenter's full output: the confident/medium candidate rules PLUS the
 * bullets it rejected (with reasons), so nothing is silently dropped. */
export interface SegmentResult {
  readonly segments: SegmentedRule[];
  readonly skipped: SkippedBullet[];
}

// --- Heuristic vocabulary --------------------------------------------------
// The deontic/imperative lexicon (FORM_HEAD, RULE_PREDICATE) lives in
// ./rule-signals.ts so the routing stage's NORM_SIGNAL can't drift from it.

/**
 * Rule-ish heading gate for prose-under-heading candidacy. Word-bounded so the
 * `do` alternate can't match inside `Documentation`/`Adoption`/`Download` (the
 * measured bug). Accept-heading vocabulary grounded in the OSS-corpus survey
 * (`## Coding Standards`/`## Code Style`/`## Naming`/`## Good practices`/
 * `## Error Handling` are the real code-norm sections).
 */
const RULE_HEADING =
  /\b(?:rules?|conventions?|code[ -]?style|style|guidelines?|standards?|naming|good practices?|error handling|do'?s?\s*(?:and|&|\/)\s*don'?ts?|don'?ts?|never|always|must|require)\b/i;

/**
 * Anti-context heading: a section whose content is overwhelmingly index /
 * command / setup / narrative, not enforceable norms (the corpus's #1
 * false-positive source). Content under one of these is rejected outright —
 * UNLESS the heading is also rule-ish (`## Testing conventions` keeps its
 * bullets), so the accept signal wins a tie.
 */
const ANTI_HEADING =
  /\b(?:commands?|setup|install(?:ation)?|usage|getting started|quick ?start|examples?|key files|(?:code)?base structure|project structure|repository structure|architecture|overview|directory|layout|environment|commits?|pull requests?|testing|scripts?|dependencies|roadmap|changelog|table of contents|where to look)\b/i;

/**
 * INDEX-SMELL veto: a bullet whose content is a code span followed by a
 * separator + description (`` `src/x.ts` — Type system ``, `` `npm test` — run ``)
 * is a keyFiles/command INDEX entry, never a rule. The single highest-value
 * rejection signal (the corpus's dominant false positive).
 */
const INDEX_SMELL = /^`[^`]+`\s*[:—–-]\s/;

/**
 * Broader index/reference-entry shapes the backtick INDEX_SMELL misses — from
 * real-corpus leakage: a path MAPPING (`next-dev.ts → next-dev-server.ts`), a
 * bullet LED by a file path + em-dash (`packages/x/ — Session replay`), or a
 * `Label: <path>` pointer (`Skill file: .agents/skills/…`). Paths in these are
 * backtick-wrapped, so we test a backtick-stripped shadow. The path DISCRIMINATOR
 * — a file extension (`.ts`) or a trailing slash — is what keeps a rule id
 * (`@scope/no-explicit-any`, no extension) from being mistaken for a path, so a
 * rule-naming bullet is never rejected as an index entry.
 */
const INDEX_ARROW = /[\w./@-]*\.[a-z]{1,6}\b\s*(?:→|->|=>)/;
// A multi-segment slash PATH before an arrow is a path-mapping/index row
// (`node_modules/@astrojs/react/… → packages/…`) — ≥2 slashes keeps it path-
// specific so a prose "A → B" isn't caught.
const INDEX_ARROW_PATH = /[\w@.-]+(?:\/[\w@.*-]+){2,}\s*(?:→|->|=>)/;
const INDEX_LABEL_PATH =
  /^[A-Za-z][\w ]{0,24}:\s+\.?[\w@-]*\/[\w@./-]*(?:\.[a-z0-9]{1,6}\b|\/)/;
const INDEX_PATH_LED = /^[\w@.-]+\/[\w@./-]*(?:\.[a-z0-9]{1,6}\b|\/)/;
function looksLikeIndexEntry(t: string): boolean {
  if (INDEX_SMELL.test(t)) return true;
  const bare = t.replace(/`/g, " ").trim();
  if (INDEX_ARROW.test(bare) || INDEX_ARROW_PATH.test(bare)) return true;
  if (INDEX_LABEL_PATH.test(bare)) return true;
  return INDEX_PATH_LED.test(bare) && /\s[—–]\s/.test(bare);
}

/**
 * DESCRIPTION-LED reject: a segment that DESCRIBES a code entity rather than
 * instructing about it. It leads with a backticked identifier/path, then a
 * copula / code-KIND noun / descriptive verb ("`Foo` class in `x` executes …",
 * "`bar` is the loader", "`apps/x` handles …"). A real rule leads with a VERB
 * ("Use `Foo`", "Never `bar`") — never the code span itself — so a code-span
 * lead-in followed by a descriptive word is an architecture/index sentence, the
 * dogfood's #1 segmenter false positive (39% of the "hard" bucket was this
 * kind of noise). High-precision: only when the descriptive word IMMEDIATELY
 * follows the leading code span.
 */
const DESCRIPTION_LED =
  /^`[^`]+`\s+(?:is|are|was|were|lives?|live|contains?|holds?|handles?|executes?|provides?|represents?|maps?|points?|implements?|exports?|defines?|wraps?|stores?|returns?|the|a|an|class|function|module|component|file|package|hook|utility|helper|type|interface|enum|constant|method|directory|folder|dir)\b/i;
// RULE_PREDICATE (a deontic modal anywhere) makes a code-span-led sentence a
// RULE, not a description ("`const` is preferred over `let`") — so the
// description reject must NOT fire. It lives in ./rule-signals.ts alongside
// NORM_SIGNAL (routing's twin) to keep the two from drifting.
function looksLikeDescription(t: string): boolean {
  const s = t.trim();
  return DESCRIPTION_LED.test(s) && !RULE_PREDICATE.test(s);
}

/**
 * RULE-NAME cue: a backticked token that is SHAPED like an off-the-shelf lint
 * rule — a scoped/plugin rule (`@typescript-eslint/consistent-type-imports`,
 * `import/no-cycle`) or a ≥3-segment kebab id (`no-floating-promises`). Requiring
 * the backticks kills prose false positives (`up-to-date`, `state-of-the-art`,
 * a file path). Naming a rule is a STRONG signal a bullet is an enforceable rule
 * even when it has no imperative verb — the corpus's rule-naming bullets
 * ("No floating promises (`@ts.../no-floating-promises`)") otherwise score
 * "medium" and get dropped by the high-only default.
 */
const RULE_NAME_IN_CODE =
  /`[^`]*(?:@[a-z][\w-]*\/[a-z][\w-]*|[a-z][\w-]*\/[a-z][\w-]*-[\w-]+|(?:no|prefer|require|consistent|max|min|func|id|sort|valid|padding|dot|array|object)-[a-z][a-z0-9-]+)[^`]*`/i;

/**
 * Leading markdown decoration a rule may be wrapped in — emphasis (`**bold**`),
 * blockquote, checkbox, or a status emoji. Stripped on a SHADOW string before
 * the imperative-head test so `- **Never** …` / `✅ Use const` still read as
 * imperative. Provenance (exactQuote/offsets) is unaffected — only the form cue
 * sees the stripped text.
 */
const LEAD_DECORATION = /^(?:\s+|>+|\*+|_+|~+|\[[ xX]\]\s*|[✅❌☑✔✖✗⚠ℹ])+/u;
function stripLeadDecoration(s: string): string {
  return s.replace(LEAD_DECORATION, "").trimStart();
}

/** Declarative subjects — these signal a statement, not an instruction. */
const DECLARATION = /^(?:this|these|those|it|we|our|there)\b/i;

/** Line consisting only of a bare URL. */
const URL_ONLY = /^<?https?:\/\/\S+>?$/;
/** Line consisting only of a markdown link. */
const LINK_ONLY = /^\[[^\]]*\]\([^)]*\)$/;

/** Verb-ish lexicon (secondary shape signal). Kept curated for precision. */
const VERBS = new Set<string>([
  "use",
  "uses",
  "using",
  "used",
  "avoid",
  "avoids",
  "prefer",
  "prefers",
  "run",
  "runs",
  "write",
  "writes",
  "writing",
  "add",
  "adds",
  "remove",
  "removes",
  "keep",
  "keeps",
  "import",
  "imports",
  "importing",
  "split",
  "splits",
  "push",
  "pushes",
  "commit",
  "commits",
  "test",
  "tests",
  "call",
  "calls",
  "set",
  "sets",
  "make",
  "makes",
  "create",
  "creates",
  "delete",
  "deletes",
  "update",
  "updates",
  "check",
  "checks",
  "ensure",
  "ensures",
  "document",
  "documents",
  "follow",
  "follows",
  "handle",
  "handles",
  "return",
  "returns",
  "throw",
  "throws",
  "catch",
  "log",
  "logs",
  "prefix",
  "name",
  "names",
  "store",
  "stores",
  "read",
  "reads",
  "save",
  "saves",
  "wrap",
  "wraps",
  "escape",
  "escapes",
  "match",
  "matches",
  "filter",
  "filters",
  "merge",
  "merges",
  // Copulas/modals (be/is/are/have/has/may/should/must) are deliberately NOT
  // here: as "shape" verbs they made the cue near-vacuous (almost any English
  // sentence passed). Deontic modals still live in FORM_HEAD (the form cue).
  "pin",
  "pins",
  "lint",
  "format",
  "formats",
  "sort",
  "group",
  "groups",
  "export",
  "exports",
  "mock",
  "stub",
  "assert",
  "validate",
  "validates",
  "sanitize",
  "encode",
  "decode",
  "hash",
  "sign",
  "verify",
  "verifies",
  "expose",
  "hide",
  "close",
  "open",
  "load",
  "loads",
  "fetch",
  "fetches",
  "render",
  "renders",
  "mount",
  "bind",
  "inject",
  "register",
  "resolve",
  "reject",
  "await",
  "apply",
  "applies",
  "bump",
  "tag",
  "branch",
  "rebase",
  "squash",
  "enforce",
  "enforces",
  "regenerate",
  "regenerates",
  "regen",
  "rebuild",
  "rebuilds",
  "generate",
  "generates",
  "define",
  "defines",
  "declare",
  "place",
  "put",
  "prefer",
]);

// --- Offset / line utilities ----------------------------------------------

function computeLineOffsets(lines: readonly string[]): number[] {
  const offsets: number[] = new Array<number>(lines.length);
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = acc;
    acc += lines[i].length + 1; // +1 for the '\n' consumed by split
  }
  return offsets;
}

function offsetToLine(lineOffsets: readonly number[], off: number): number {
  // 1-based line number containing char offset `off`.
  let lo = 0;
  let hi = lineOffsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineOffsets[mid] <= off) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// --- Candidate gate --------------------------------------------------------

type Confidence = "high" | "medium";

function hasVerbish(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .replace(/`[^`]*`/g, " ") // drop inline code spans
    .split(/[^a-z']+/)
    .filter(Boolean);
  for (const t of tokens) {
    if (VERBS.has(t)) return true;
  }
  return false;
}

function isLinkOnly(text: string): boolean {
  const t = text.trim();
  return URL_ONLY.test(t) || LINK_ONLY.test(t);
}

/** A gate verdict: an accepted candidate (with confidence) or a rejection (with
 * the reason, for the skipped-transparency report). */
type GateResult = { confidence: Confidence } | { reject: RejectReason };

/** The accept/reject view of a gate result, for sites that only need the split
 * (atomize, the sub-span loop) and don't care about the reason. */
function confidenceOf(g: GateResult): Confidence | null {
  return "confidence" in g ? g.confidence : null;
}

/**
 * Score the 3 cues. Returns a confidence OR a reject reason.
 * - form: starts with an imperative/prohibitive head (or "No X").
 * - context: is a bullet OR sits under a rule-ish heading.
 * - shape: 15–300 chars, has a verb-ish token, not link-only, not a declaration.
 */
function gate(
  text: string,
  isBullet: boolean,
  underRuleHeading: boolean,
): GateResult {
  const t = text.trim();

  // Reject an index/command/reference entry outright (`` `path` — description ``,
  // `a.ts → b.ts`, `dir/x — …`, `Label: path`) — the corpus's dominant false
  // positive. No cue count can rescue it.
  if (looksLikeIndexEntry(t)) return { reject: "index" };
  // Reject a DESCRIPTION-led sentence (`` `Foo` class in `x` executes … ``) — an
  // architecture/index sentence, not a rule (the dogfood's #1 false positive).
  if (looksLikeDescription(t)) return { reject: "description" };

  const context = isBullet || underRuleHeading;

  // RULE-NAME cue: a bullet/section line that NAMES an off-the-shelf rule is a
  // strong signal it's enforceable, even without an imperative verb — promote it
  // to high so the high-only default doesn't drop it (recovers rule-naming
  // bullets like "No floating promises (`@ts.../no-floating-promises`)").
  if (context && RULE_NAME_IN_CODE.test(t)) return { confidence: "high" };

  // The form/declaration cues see the text with leading decoration stripped, so
  // `- **Never** …` reads as imperative and `**We** …` still reads declarative.
  const head = stripLeadDecoration(t);
  const form = FORM_HEAD.test(head);
  const shape =
    t.length >= 15 &&
    t.length <= 300 &&
    hasVerbish(t) &&
    !isLinkOnly(t) &&
    !DECLARATION.test(head);

  const cues = (form ? 1 : 0) + (context ? 1 : 0) + (shape ? 1 : 0);
  if (cues >= 3) return { confidence: "high" };
  if (cues === 2) return { confidence: "medium" };
  return { reject: "no-signal" };
}

// --- Atomicity split -------------------------------------------------------

/** Never split when an exception clause carries polarity/meaning. */
const HAS_EXCEPT = /\bexcept\b/i;

interface Span {
  start: number; // absolute char offset in source
  end: number; // absolute char offset in source (exclusive)
}

function trimSpan(src: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
  return { start, end };
}

/** Candidate cut offsets inside a span: after every ';' and after a sentence
 * terminator that is followed by whitespace + a capital (a real boundary). */
function findCutPoints(src: string, whole: Span): number[] {
  const cuts: number[] = [];
  for (let i = whole.start; i < whole.end; i++) {
    const c = src[i];
    if (c === ";") {
      cuts.push(i + 1);
    } else if (c === "." || c === "!" || c === "?") {
      if (/^\s+[A-Z]/.test(src.slice(i + 1, whole.end))) cuts.push(i + 1);
    }
  }
  return cuts;
}

/** Turn cut offsets into trimmed pieces (leading `;`/space stripped). Returns
 * null if any piece is empty — the caller then keeps the span whole. */
function buildPieces(src: string, bounds: readonly number[]): Span[] | null {
  const pieces: Span[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const piece = trimSpan(src, { start: bounds[i], end: bounds[i + 1] });
    while (
      piece.start < piece.end &&
      (src[piece.start] === ";" || /\s/.test(src[piece.start]))
    ) {
      piece.start++;
    }
    if (piece.start >= piece.end) return null;
    pieces.push(piece);
  }
  return pieces;
}

/**
 * Try to split a single-line bullet's content span on ';' or sentence
 * boundaries. Returns the resulting spans ONLY IF there is >1 and every
 * piece independently passes the gate; otherwise returns [whole].
 */
function atomize(
  src: string,
  contentSpan: Span,
  isBullet: boolean,
  underRuleHeading: boolean,
): Span[] {
  const whole = trimSpan(src, contentSpan);
  if (HAS_EXCEPT.test(src.slice(whole.start, whole.end))) return [whole];

  const cuts = findCutPoints(src, whole);
  if (cuts.length === 0) return [whole];

  const pieces = buildPieces(src, [whole.start, ...cuts, whole.end]);
  if (pieces === null) return [whole];

  // Both/all halves must independently pass the gate, else keep whole.
  const allPass = pieces.every(
    (p) =>
      confidenceOf(
        gate(normalize(src.slice(p.start, p.end)), isBullet, underRuleHeading),
      ) !== null,
  );
  return allPass && pieces.length > 1 ? pieces : [whole];
}

// --- Emission --------------------------------------------------------------

/** Immutable per-scan context — the source, its split lines + line index, and
 * provenance file, threaded through the block helpers so they take a line index
 * and a heading state, not the source + offsets + lines + file every time. */
interface ScanCtx {
  readonly src: string;
  readonly lines: readonly string[];
  readonly lineOffsets: readonly number[];
  readonly file: string | undefined;
}

function emitFromSpan(
  ctx: ScanCtx,
  span: Span,
  confidence: Confidence,
): SegmentedRule {
  const exactQuote = ctx.src.slice(span.start, span.end);
  return {
    text: normalize(exactQuote),
    file: ctx.file,
    lineStart: offsetToLine(ctx.lineOffsets, span.start),
    lineEnd: offsetToLine(ctx.lineOffsets, span.end - 1),
    exactQuote,
    confidence,
  };
}

// --- Scanner ---------------------------------------------------------------

// Ordered (`1.`/`1)`) and emoji (`✅`/`❌`) bullets count as list items too —
// the native `-*+` class missed them, so shouted/numbered rules were invisible.
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)]|[✅❌☑✔✖✗])(\s+)(.*)$/u;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_LINE = /^\s*\|/;

/** Heading context the gate keys on: rule-ish (accept) vs anti-context (reject). */
interface HeadingState {
  readonly ruleish: boolean;
  readonly antiContext: boolean;
}

/** What a block handler produced: emitted rules, recorded skips, and the next
 * line index to resume the scan from. */
interface BlockResult {
  readonly emitted: readonly SegmentedRule[];
  readonly skipped: readonly SkippedBullet[];
  readonly next: number;
}

/** Extend a list item over its continuation lines — deeper-indented, non-blank,
 * not a new marker / heading / fence. Returns the item's last line index. */
function gatherListBody(
  lines: readonly string[],
  start: number,
  markerIndent: number,
): number {
  let end = start;
  for (let j = start + 1; j < lines.length; j++) {
    const cand = lines[j];
    if (cand.trim() === "" || FENCE.test(cand) || HEADING.test(cand)) break;
    if (cand.length - cand.trimStart().length <= markerIndent) break;
    if (LIST_ITEM.test(cand)) break; // nested/sibling bullet => separate candidate
    end = j;
  }
  return end;
}

/** Extend a paragraph block until a blank / heading / list / fence / table. */
function gatherParagraph(lines: readonly string[], start: number): number {
  let end = start;
  for (let j = start + 1; j < lines.length; j++) {
    const cand = lines[j];
    if (cand.trim() === "" || FENCE.test(cand) || HEADING.test(cand)) break;
    if (LIST_ITEM.test(cand) || TABLE_LINE.test(cand)) break;
    end = j;
  }
  return end;
}

/** The whole-item span + its confidence — passed to `emitListSpans` so a
 * one-span item emits at its own gate result, not a re-gated piece. */
interface WholeItem {
  readonly span: Span;
  readonly conf: Confidence;
}

/** Emit a gated list item: the whole item at its own confidence when it stays
 * one span, else each atomized piece re-gated independently. */
function emitListSpans(
  ctx: ScanCtx,
  spans: readonly Span[],
  whole: WholeItem,
  ruleish: boolean,
): SegmentedRule[] {
  if (spans.length === 1) return [emitFromSpan(ctx, whole.span, whole.conf)];
  const out: SegmentedRule[] = [];
  for (const s of spans) {
    const text = normalize(ctx.src.slice(s.start, s.end));
    const c = confidenceOf(gate(text, true, ruleish));
    if (c !== null) out.push(emitFromSpan(ctx, s, c));
  }
  return out;
}

/** Handle a list item at line `i`: gather its body, gate it, and either emit
 * (whole or atomized) or record why it was skipped. */
function handleListItem(
  ctx: ScanCtx,
  i: number,
  li: RegExpExecArray,
  heading: HeadingState,
): BlockResult {
  const markerIndent = li[1].length;
  const contentCol = li[1].length + li[2].length + li[3].length;
  const endLine = gatherListBody(ctx.lines, i, markerIndent);
  const contentStart = ctx.lineOffsets[i] + contentCol;
  const contentEnd = ctx.lineOffsets[endLine] + ctx.lines[endLine].length;
  const contentSpan: Span = { start: contentStart, end: contentEnd };

  const wholeText = normalize(ctx.src.slice(contentStart, contentEnd));
  const g = gate(wholeText, true, heading.ruleish);
  const conf = confidenceOf(g);

  // Reject bullets under an anti-context heading (Commands/Setup/Key Files/…).
  if (conf !== null && !heading.antiContext) {
    const fullSpan: Span = { start: ctx.lineOffsets[i], end: contentEnd };
    // Only single-line items are split (keeps offsets exact).
    const spans =
      endLine > i
        ? [trimSpan(ctx.src, contentSpan)]
        : atomize(ctx.src, contentSpan, true, heading.ruleish);
    return {
      emitted: emitListSpans(
        ctx,
        spans,
        { span: fullSpan, conf },
        heading.ruleish,
      ),
      skipped: [],
      next: endLine + 1,
    };
  }

  // NOT a rule — record it + why so the report is honest (§3). An anti-context
  // rejection is a "section" skip; otherwise it's the gate's own reason.
  return {
    emitted: [],
    skipped: [
      {
        text: wholeText,
        file: ctx.file,
        lineStart: offsetToLine(ctx.lineOffsets, contentStart),
        lineEnd: offsetToLine(ctx.lineOffsets, contentEnd - 1),
        reason: heading.antiContext || "confidence" in g ? "section" : g.reject,
      },
    ],
    next: endLine + 1,
  };
}

/** Handle a paragraph block at line `i`: under a rule-ish heading, split into
 * sentences and emit each that gates; otherwise emit nothing. */
function handleParagraph(
  ctx: ScanCtx,
  i: number,
  heading: HeadingState,
): { emitted: SegmentedRule[]; next: number } {
  const endLine = gatherParagraph(ctx.lines, i);
  const emitted: SegmentedRule[] = [];
  if (heading.ruleish) {
    const paraStart = ctx.lineOffsets[i];
    const paraText = ctx.src.slice(
      paraStart,
      ctx.lineOffsets[endLine] + ctx.lines[endLine].length,
    );
    const re = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(paraText)) !== null) {
      const s = trimSpan(ctx.src, {
        start: paraStart + m.index,
        end: paraStart + m.index + m[0].length,
      });
      if (s.start >= s.end) continue;
      const c = confidenceOf(
        gate(normalize(ctx.src.slice(s.start, s.end)), false, true),
      );
      if (c !== null) emitted.push(emitFromSpan(ctx, s, c));
    }
  }
  return { emitted, next: endLine + 1 };
}

/** Read a heading line into the rule-ish / anti-context state the gate keys on.
 * Anti-context wins only when NOT also rule-ish, so an accept word wins a tie
 * (`## Testing conventions` keeps its bullets; `## Testing` drops them). */
function headingStateFrom(headingText: string): HeadingState {
  const ruleish = RULE_HEADING.test(headingText);
  return { ruleish, antiContext: ANTI_HEADING.test(headingText) && !ruleish };
}

/**
 * Split a CLAUDE.md / AGENTS.md into atomic candidate rules with provenance.
 *
 * Deterministic Tier-A heuristic. Code fences and tables are excluded from
 * candidacy. Candidate units are (a) list items with attached continuation
 * lines and (b) sentences of paragraphs under a rule-ish heading. This function
 * is a thin DISPATCHER — each block type is handled by its own pure helper
 * (`handleListItem` / `handleParagraph`); the state it threads is the fence
 * toggle and the current `HeadingState`.
 */
export function segmentInstructions(
  markdown: string,
  file?: string,
  skipLines?: ReadonlySet<number>,
): SegmentResult {
  const lines = markdown.split("\n");
  const ctx: ScanCtx = {
    src: markdown,
    lines,
    lineOffsets: computeLineOffsets(lines),
    file,
  };
  const out: SegmentedRule[] = [];
  const skipped: SkippedBullet[] = [];

  let inFence = false;
  let heading: HeadingState = { ruleish: false, antiContext: false };
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fences: toggle and skip everything inside (incl. the fence lines).
    if (FENCE.test(line)) {
      inFence = !inFence;
      i++;
      continue;
    }
    if (inFence) {
      i++;
      continue;
    }

    // Headings update rule-ish context; not a candidate themselves.
    const h = HEADING.exec(line);
    if (h) {
      heading = headingStateFrom(h[2]);
      i++;
      continue;
    }

    // Tables are excluded; so is a line already CONSUMED by the marker pre-pass
    // (a marked section's body) — the span-consumption that stops a marked rule
    // being double-counted by the heuristic (1-based).
    if (TABLE_LINE.test(line) || skipLines?.has(i + 1)) {
      i++;
      continue;
    }

    const li = LIST_ITEM.exec(line);
    if (li) {
      const r = handleListItem(ctx, i, li, heading);
      out.push(...r.emitted);
      skipped.push(...r.skipped);
      i = r.next;
      continue;
    }

    if (line.trim() !== "") {
      const r = handleParagraph(ctx, i, heading);
      out.push(...r.emitted);
      i = r.next;
      continue;
    }

    i++;
  }

  return { segments: out, skipped };
}
