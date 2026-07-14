/**
 * segment.ts — Tier-A deterministic (no-model) segmenter.
 *
 * Splits a CLAUDE.md / AGENTS.md into ATOMIC candidate rules with provenance.
 * Pure, deterministic, strict TS, no external deps.
 *
 * Design bias: PRECISION over recall. A missed rule costs a row; a garbage
 * atom costs credibility. When in doubt we UNDER-split and REJECT.
 */

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

// --- Heuristic vocabulary --------------------------------------------------

/** Imperative/prohibitive head the candidate must START with (form cue). */
const FORM_HEAD =
  /^(?:use|avoid|prefer|never|always|don'?t|do not|no\s+\S|must|should|keep|run|write|add|remove|only)\b/i;

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

/**
 * Score the 3 cues. Returns confidence or null (reject).
 * - form: starts with an imperative/prohibitive head (or "No X").
 * - context: is a bullet OR sits under a rule-ish heading.
 * - shape: 15–300 chars, has a verb-ish token, not link-only, not a declaration.
 */
function gate(
  text: string,
  isBullet: boolean,
  underRuleHeading: boolean,
): Confidence | null {
  const t = text.trim();

  // Reject an index/command entry outright (`` `path` — description ``) — the
  // corpus's dominant false positive. No cue count can rescue it.
  if (INDEX_SMELL.test(t)) return null;

  // The form/declaration cues see the text with leading decoration stripped, so
  // `- **Never** …` reads as imperative and `**We** …` still reads declarative.
  const head = stripLeadDecoration(t);
  const form = FORM_HEAD.test(head);
  const context = isBullet || underRuleHeading;
  const shape =
    t.length >= 15 &&
    t.length <= 300 &&
    hasVerbish(t) &&
    !isLinkOnly(t) &&
    !DECLARATION.test(head);

  const cues = (form ? 1 : 0) + (context ? 1 : 0) + (shape ? 1 : 0);
  if (cues >= 3) return "high";
  if (cues === 2) return "medium";
  return null;
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
  const wholeText = src.slice(whole.start, whole.end);

  if (HAS_EXCEPT.test(wholeText)) return [whole];

  // Candidate cut points: ';' and sentence terminators followed by a capital.
  const cuts: number[] = [];
  for (let i = whole.start; i < whole.end; i++) {
    const c = src[i];
    if (c === ";") {
      cuts.push(i + 1);
    } else if (c === "." || c === "!" || c === "?") {
      // sentence boundary: terminator + whitespace + capital letter
      const rest = src.slice(i + 1, whole.end);
      const m = /^\s+[A-Z]/.exec(rest);
      if (m) cuts.push(i + 1);
    }
  }
  if (cuts.length === 0) return [whole];

  const bounds = [whole.start, ...cuts, whole.end];
  const pieces: Span[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const piece = trimSpan(src, { start: bounds[i], end: bounds[i + 1] });
    // strip a leading semicolon left by the cut
    while (
      piece.start < piece.end &&
      (src[piece.start] === ";" || /\s/.test(src[piece.start]))
    ) {
      piece.start++;
    }
    if (piece.start >= piece.end) return [whole];
    pieces.push(piece);
  }

  // Both/all halves must independently pass the gate, else keep whole.
  for (const p of pieces) {
    const text = normalize(src.slice(p.start, p.end));
    if (gate(text, isBullet, underRuleHeading) === null) return [whole];
  }
  return pieces.length > 1 ? pieces : [whole];
}

// --- Emission --------------------------------------------------------------

function emitFromSpan(
  src: string,
  lineOffsets: readonly number[],
  file: string | undefined,
  span: Span,
  confidence: Confidence,
): SegmentedRule {
  const exactQuote = src.slice(span.start, span.end);
  return {
    text: normalize(exactQuote),
    file,
    lineStart: offsetToLine(lineOffsets, span.start),
    lineEnd: offsetToLine(lineOffsets, span.end - 1),
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

/**
 * Split a CLAUDE.md / AGENTS.md into atomic candidate rules with provenance.
 *
 * Deterministic Tier-A heuristic. Code fences and tables are excluded from
 * candidacy. Candidate units are (a) list items with attached continuation
 * lines and (b) sentences of paragraphs under a rule-ish heading.
 */
export function segmentInstructions(
  markdown: string,
  file?: string,
): SegmentedRule[] {
  const lines = markdown.split("\n");
  const lineOffsets = computeLineOffsets(lines);
  const out: SegmentedRule[] = [];

  let inFence = false;
  let currentHeadingIsRuleish = false;
  let currentHeadingIsAntiContext = false;
  let i = 0;

  const lineSpan = (a: number, b: number): Span => ({
    start: lineOffsets[a],
    end: lineOffsets[b] + lines[b].length,
  });

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

    // Headings: update rule-ish context, not a candidate.
    const h = HEADING.exec(line);
    if (h) {
      currentHeadingIsRuleish = RULE_HEADING.test(h[2]);
      // Anti-context only when it is NOT also rule-ish, so an accept word wins a
      // tie (`## Testing conventions` keeps its bullets; `## Testing` drops them).
      currentHeadingIsAntiContext =
        ANTI_HEADING.test(h[2]) && !currentHeadingIsRuleish;
      i++;
      continue;
    }

    // Tables: excluded from candidacy.
    if (TABLE_LINE.test(line)) {
      i++;
      continue;
    }

    // List items (with attached continuation lines).
    const li = LIST_ITEM.exec(line);
    if (li) {
      const markerIndent = li[1].length;
      const contentCol = li[1].length + li[2].length + li[3].length;
      const startLine = i;

      // Gather continuation lines: deeper-indented, non-blank, not a new
      // list marker, not a heading, not a fence.
      let endLine = i;
      let j = i + 1;
      while (j < lines.length) {
        const cand = lines[j];
        if (cand.trim() === "") break;
        if (FENCE.test(cand)) break;
        if (HEADING.test(cand)) break;
        const indent = cand.length - cand.trimStart().length;
        if (indent <= markerIndent) break;
        if (LIST_ITEM.test(cand)) break; // nested/sibling bullet => separate candidate
        endLine = j;
        j++;
      }

      const multiLine = endLine > startLine;
      const contentStart = lineOffsets[startLine] + contentCol;
      const contentEnd = lineOffsets[endLine] + lines[endLine].length;
      const contentSpan: Span = { start: contentStart, end: contentEnd };

      const wholeText = normalize(markdown.slice(contentStart, contentEnd));
      const conf = gate(wholeText, true, currentHeadingIsRuleish);

      // Reject bullets under an anti-context heading (Commands/Setup/Key Files/
      // Architecture/…) — the corpus's dominant false-positive locus.
      if (conf !== null && !currentHeadingIsAntiContext) {
        // Only attempt splitting for single-line items (keeps offsets exact).
        const spans = multiLine
          ? [trimSpan(markdown, contentSpan)]
          : atomize(markdown, contentSpan, true, currentHeadingIsRuleish);

        if (spans.length === 1) {
          // Emit whole item; exactQuote is the full source span incl. marker.
          out.push(
            emitFromSpan(
              markdown,
              lineOffsets,
              file,
              lineSpan(startLine, endLine),
              conf,
            ),
          );
        } else {
          for (const s of spans) {
            const text = normalize(markdown.slice(s.start, s.end));
            const c = gate(text, true, currentHeadingIsRuleish);
            if (c !== null)
              out.push(emitFromSpan(markdown, lineOffsets, file, s, c));
          }
        }
      }

      i = endLine + 1;
      continue;
    }

    // Paragraph block: accumulate until blank / heading / list / fence / table.
    if (line.trim() !== "") {
      const startLine = i;
      let endLine = i;
      let j = i + 1;
      while (j < lines.length) {
        const cand = lines[j];
        if (cand.trim() === "") break;
        if (FENCE.test(cand)) break;
        if (HEADING.test(cand)) break;
        if (LIST_ITEM.test(cand)) break;
        if (TABLE_LINE.test(cand)) break;
        endLine = j;
        j++;
      }

      // Prose is only a candidate under a rule-ish heading.
      if (currentHeadingIsRuleish) {
        const paraStart = lineOffsets[startLine];
        const paraEnd = lineOffsets[endLine] + lines[endLine].length;
        const paraText = markdown.slice(paraStart, paraEnd);

        // Sentence spans preserving absolute offsets.
        const re = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(paraText)) !== null) {
          const s = trimSpan(markdown, {
            start: paraStart + m.index,
            end: paraStart + m.index + m[0].length,
          });
          if (s.start >= s.end) continue;
          const text = normalize(markdown.slice(s.start, s.end));
          const c = gate(text, false, true);
          if (c !== null)
            out.push(emitFromSpan(markdown, lineOffsets, file, s, c));
        }
      }

      i = endLine + 1;
      continue;
    }

    i++;
  }

  return out;
}
