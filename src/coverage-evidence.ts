/**
 * HOW a surface was decided to be covered — the provenance of every coverage
 * decision, and the fix for a detector that measured the presence of a STRING
 * rather than the presence of a test.
 *
 * ## The defect this exists to close
 *
 * Coverage used to be: "does any discovered test file contain this surface's path
 * or namespace as a substring?" Measured on a real repo (37 skills, 14 hooks),
 * appending ONE LINE to an existing harness —
 *
 * ```js
 * // probe: skills/argument-arc
 * ```
 *
 * — a COMMENT, not a test, moved the untested count 33 → 32. The metric was
 * trivially gameable, and the gaming was indistinguishable from real work.
 *
 * The second half was worse. A harness that genuinely asserts over all 21 of a
 * repo's pipeline skills, but builds its paths at RUNTIME
 * (`join(root, ".claude", "skills", name, "SKILL.md")`), contains zero literal
 * `skills/<name>` strings and therefore covered NOTHING. Generality was
 * penalised: 21 trivial files each naming their subject scored better than one
 * harness that actually tested all 21.
 *
 * This is the exact substitution vigiles names in other people's repos —
 * *presence of a surface taken for presence of the property*, the way
 * `noExplicitAny` sitting in a config is taken for the rule being enforced. The
 * tool was committing it in its own scoring.
 *
 * ## The three kinds of evidence, weakest last
 *
 * | evidence | how it is established | can it happen by accident? |
 * |---|---|---|
 * | `declared` | a `vigiles:covers <surface> …` marker in the test file | no — the marker is reserved |
 * | `colocated` | the test sits inside/next to the surface | no — it is a placement decision |
 * | `mention`   | the surface's path/namespace appears in the test's CODE | yes |
 *
 * `declared` is the answer to the false NEGATIVE: a runtime-path harness can now
 * say what it covers, structurally, instead of being guessed at by substring.
 * Declaration beats inference — the same move as declaring `allowed-tools`
 * instead of inferring capability from behaviour.
 *
 * `mention` is KEPT, deliberately, but narrowed to code: it is the zero-config
 * path that makes an ordinary `foo.test.ts` naming `skills/foo` count without
 * anyone learning a marker, and removing it would flip thousands of honestly
 * covered surfaces to "untested" overnight. What it no longer reads is COMMENTS.
 * A path inside a comment is prose about the test; a path in executable code is
 * the test reaching for the surface. Prose isn't policy — including ours. And
 * because the evidence is now REPORTED, a repo whose coverage rests entirely on
 * substring matches can finally see that about itself.
 *
 * Browser-safe and pure (no `node:*`): the disk detector (`test-coverage.ts`) and
 * its in-browser twin (`test-coverage-files.ts`) both route through here, so the
 * two cannot drift on the part that decides coverage.
 */

/** How a covered surface was decided to be covered, strongest first. */
export type CoverageEvidence = "declared" | "colocated" | "mention";

/** Ranking used when several test files cover the same surface — strongest wins. */
const RANK: Record<CoverageEvidence, number> = {
  declared: 3,
  colocated: 2,
  mention: 1,
};

/**
 * The explicit declaration marker. Mirrors the existing `vigiles:ignore-test`
 * opt-out marker convention, on the other side: `ignore-test` says "hold this
 * surface to nothing", `covers` says "this test holds these surfaces".
 *
 * ```js
 * // vigiles:covers skills/argument-arc, skills/tighten-paper
 * ```
 *
 * Everything after the marker to end-of-line is the list (whitespace- or
 * comma-separated). Repeat the marker on as many lines as you need.
 */
export const COVERS_MARKER = "vigiles:covers";

/** The minimum a surface must expose to be matched — structural, no import cycle. */
export interface CoverableSurface {
  /** Repo-relative path of the surface file (SKILL.md / agent .md / hook script). */
  readonly path: string;
  /** Stable name: skill dir, agent basename, or hook script basename. */
  readonly name: string;
  /** Substrings a test may reference to "cover" this surface (path / namespace). */
  readonly tokens: readonly string[];
}

/** A discovered test file, with the two derived views coverage is decided from. */
export interface PreparedTest {
  readonly path: string;
  /** Surfaces the file explicitly declares it covers (`vigiles:covers`). */
  readonly declares: readonly string[];
  /** The file with comments removed — what `mention` matching may read. */
  readonly code: string;
}

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/** `//` + `/* *\/` languages — every default test glob lands here. */
const SLASH_COMMENT_EXT = /\.[cm]?[jt]sx?$/;

/** `#` languages — reachable only via a user-supplied `testGlobs`. */
const HASH_COMMENT_EXT = /\.(?:py|rb|sh|bash|zsh|ya?ml|toml)$/;

interface CommentSyntax {
  /** Line-comment openers (to end of line). */
  readonly line: readonly string[];
  /** Whether `/* … *\/` block comments apply. */
  readonly block: boolean;
}

/**
 * Comment syntax by extension, or `null` for "unknown format — don't touch it".
 *
 * Deliberately conservative. An unrecognised `testGlobs` entry (a promptfoo
 * `.yaml` is covered; a bespoke `.conf` is not) keeps the OLD raw-substring
 * behaviour rather than being mangled by a guess: a wrong strip would silently
 * DROP real coverage, and losing a true positive is worse here than keeping a
 * weak one that is now labelled `mention` in the report anyway.
 */
function commentSyntaxFor(path: string): CommentSyntax | null {
  if (SLASH_COMMENT_EXT.test(path)) return { line: ["//"], block: true };
  if (HASH_COMMENT_EXT.test(path)) return { line: ["#"], block: false };
  return null;
}

/**
 * Remove comments while preserving string literals — a small hand scanner rather
 * than a regex, because the interesting inputs are exactly the ones a regex gets
 * wrong: `"https://example.com"` must survive (it is data), `// see skills/foo`
 * must not (it is prose).
 *
 * Not a parser. A regex literal containing two adjacent unescaped slashes would
 * be mis-read as a comment; that is unreachable in practice (`//` is not a valid
 * empty regex) and the failure direction is safe — it can only DROP a mention,
 * never invent one.
 *
 * The metric rules are disabled for this one function: its branch count IS the
 * lexer state machine (quote open / quote close / escape / line comment / block
 * comment), and splitting it across helpers to satisfy a threshold would hide
 * that state, not simplify it. Same call as `posix-path.ts` makes for its ported
 * scanner.
 */
/* eslint-disable complexity, sonarjs/cognitive-complexity, sonarjs/nested-control-flow */
function stripComments(src: string, syntax: CommentSyntax): string {
  let out = "";
  let i = 0;
  let quote = "";
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") {
        out += c + (src[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = "";
      out += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    const opener = syntax.line.find((l) => src.startsWith(l, i));
    if (opener) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (syntax.block && c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        // Keep newlines so line numbers (and any line-oriented reading of the
        // stripped text) stay aligned with the original file.
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
/* eslint-enable complexity, sonarjs/cognitive-complexity, sonarjs/nested-control-flow */

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/** Parse every `vigiles:covers …` line into the surfaces it names. */
function parseDeclarations(content: string): string[] {
  const out: string[] = [];
  let from = content.indexOf(COVERS_MARKER);
  while (from !== -1) {
    const lineEnd = content.indexOf("\n", from);
    const rest = content.slice(
      from + COVERS_MARKER.length,
      lineEnd === -1 ? undefined : lineEnd,
    );
    for (const raw of rest.split(/[\s,]+/)) {
      // Trim the punctuation a marker picks up from its host comment syntax:
      // a trailing `*/`, a leading `*` in a JSDoc block, quotes, `-->`.
      const tok = raw.replace(/^["'`*]+|["'`]+$|\*\/$|-->$/g, "").trim();
      if (tok) out.push(tok);
    }
    from = content.indexOf(COVERS_MARKER, from + COVERS_MARKER.length);
  }
  return out;
}

/** Does one declared token name this surface? */
function declarationMatches(
  surface: CoverableSurface,
  declaration: string,
): boolean {
  const d = declaration.replace(/\/+$/, "");
  if (!d) return false;
  return (
    d === surface.path ||
    d === surface.name ||
    surface.tokens.includes(d) ||
    // `.claude/skills/foo` naming `.claude/skills/foo/SKILL.md`.
    surface.path.startsWith(`${d}/`)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Derive the two views coverage is decided from. Do this ONCE per test file. */
export function prepareTest(path: string, content: string): PreparedTest {
  const syntax = commentSyntaxFor(path);
  return {
    path,
    // Declarations are read from the RAW file — the marker lives in a comment by
    // construction, so it must be parsed before comments are removed.
    declares: parseDeclarations(content),
    code: syntax ? stripComments(content, syntax) : content,
  };
}

/**
 * The evidence one test file provides for one surface, or `null` for none.
 * `colocated` is passed in because placement is a path question the two twins
 * answer with their own (disk vs POSIX-string) path helpers.
 */
export function evidenceFor(
  surface: CoverableSurface,
  test: PreparedTest,
  colocated: boolean,
): CoverageEvidence | null {
  if (test.declares.some((d) => declarationMatches(surface, d)))
    return "declared";
  if (colocated) return "colocated";
  if (surface.tokens.some((tok) => test.code.includes(tok))) return "mention";
  return null;
}

/** Is `a` STRICTLY stronger evidence than `b`? (Ties keep the incumbent.) */
export function isStronger(a: CoverageEvidence, b: CoverageEvidence): boolean {
  return RANK[a] > RANK[b];
}

/** Per-evidence tallies — the provenance summary the report prints. */
export interface EvidenceCounts {
  readonly declared: number;
  readonly colocated: number;
  readonly mention: number;
}

/** Tally a list of decisions by evidence kind. */
export function countEvidence(
  decisions: readonly { readonly evidence: CoverageEvidence }[],
): EvidenceCounts {
  const counts = { declared: 0, colocated: 0, mention: 0 };
  for (const d of decisions) counts[d.evidence]++;
  return counts;
}

/**
 * One line naming how the coverage was established. Printed wherever a coverage
 * count is printed: a number with no provenance is the thing this module exists
 * to stop shipping.
 */
export function formatEvidence(counts: EvidenceCounts): string {
  const total = counts.declared + counts.colocated + counts.mention;
  if (total === 0) return "";
  const parts = [
    `${String(counts.declared)} declared (\`${COVERS_MARKER}\`)`,
    `${String(counts.colocated)} colocated`,
    `${String(counts.mention)} name-mentioned`,
  ];
  let tail = "";
  if (counts.mention > 0) {
    tail =
      counts.declared + counts.colocated === 0
        ? " — ALL of it is a name appearing in a test file, which is the weakest" +
          " evidence there is; declare what a test covers to make it real."
        : " (a mention is the weakest evidence — it only says the name appears)";
  }
  return `How coverage was decided: ${parts.join(" · ")}${tail}`;
}
