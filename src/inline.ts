/**
 * vigiles — Inline rule mode for gradual adoption.
 *
 * Parses `<!-- vigiles:enforce <linter>/<rule> "<why>" -->` HTML comments
 * out of any markdown file, so a project can adopt vigiles one rule at a
 * time without committing to a .spec.ts compile step. Every inline rule
 * goes through the same `checkLinterRule` verification as rules declared
 * in a .spec.ts — typos get closest-match suggestions, disabled rules are
 * flagged, etc.
 *
 * Only `enforce` is supported inline. `guidance` would be a tautology: if
 * you're editing the markdown, the prose around the comment already is
 * the guidance — there's nothing extra for a tool to render.
 *
 * A file is in "inline mode" iff it contains at least one vigiles:enforce
 * comment. Spec mode (`.md.spec.ts` sibling) takes precedence if both
 * exist; the spec compiler emits a fresh file that may overwrite the
 * inline markup, so users should pick one per file.
 */

export interface InlineRule {
  /** Linter rule reference, e.g. "eslint/no-console". */
  linterRule: string;
  /** Why this rule is enforced (human-readable, shown in agent context). */
  why: string;
  /** 1-based line number of the comment in the source file. */
  line: number;
}

/** A `<!-- vigiles:file <path> -->` reference (verified to exist). */
export interface InlineFileRef {
  /** Project-relative path to verify exists. */
  path: string;
  /** 1-based line number of the comment in the source file. */
  line: number;
}

/** A `<!-- vigiles:cmd "<command>" -->` reference (npm scripts verified). */
export interface InlineCmdRef {
  /** Command to verify (npm scripts checked against package.json). */
  command: string;
  /** 1-based line number of the comment in the source file. */
  line: number;
}

export interface InlineParseResult {
  rules: InlineRule[];
  files: InlineFileRef[];
  commands: InlineCmdRef[];
  /** Lines that look like vigiles: markers but failed to parse. */
  errors: { line: number; message: string; raw: string }[];
}

/**
 * Match `<!-- vigiles:enforce <linter>/<rule> "<why>" -->`. The linter
 * reference allows the same characters as the TS-side `SAFE_RULE_NAME_RE`
 * plus `@` for scoped plugin names (e.g. `@typescript-eslint/...`).
 * The `why` is a simple quoted string — if someone wants newlines or
 * embedded quotes, they can move to spec mode.
 */
const ENFORCE_RE =
  /<!--\s*vigiles:enforce\s+([@A-Za-z0-9_/:.-]+)\s+"([^"\n]*)"\s*-->/;

/**
 * Match `<!-- vigiles:file <path> -->`. The path is a single whitespace-free
 * token (project-relative); spaces in paths are vanishingly rare and would be
 * ambiguous against the closing `-->`.
 */
const FILE_RE = /<!--\s*vigiles:file\s+(\S+)\s*-->/;

/**
 * Match `<!-- vigiles:cmd "<command>" -->`. The command is quoted because
 * commands contain spaces (e.g. `npm run build`).
 */
const CMD_RE = /<!--\s*vigiles:cmd\s+"([^"\n]*)"\s*-->/;

/**
 * Detects any `<!-- vigiles:<kind> -->` comment (valid or not) so we can
 * surface errors for typos and reserved-but-unrecognized kinds. Uses a
 * non-greedy match for the tail so a `-` inside the kind doesn't short-
 * circuit the pattern.
 */
const MARKER_RE = /<!--\s*vigiles:([A-Za-z_-]+)[^]*?-->/;

// vigiles markers handled by other subsystems (skill runtime gates, opt-outs).
// The inline *rule* parser skips them rather than flagging them as unknown.
const KNOWN_NON_RULE_MARKERS = new Set([
  "disable",
  "ignore",
  "ignore-file",
  "gate", // skill step gate (src/skill-runtime.ts)
  "result", // skill result gate
  "symbol", // symbol reference mark (src/refs.ts)
]);

/**
 * Parse inline vigiles rules out of a markdown file's contents.
 * Does not touch the filesystem and does not verify the rules against
 * any linter — callers can feed the returned rules into
 * `checkLinterRule` themselves.
 *
 * Lines inside fenced code blocks (``` ... ``` or ~~~ ... ~~~) are
 * skipped so illustrative examples in docs don't get treated as live
 * rules.
 */
export function parseInlineRules(content: string): InlineParseResult {
  const rules: InlineRule[] = [];
  const files: InlineFileRef[] = [];
  const commands: InlineCmdRef[] = [];
  const errors: InlineParseResult["errors"] = [];

  const lines = content.split("\n");
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks. CommonMark allows ``` or ~~~ fences
    // with 3+ characters; the closing fence must use the same char and
    // have length >= the opening fence's length. Info-string tokens
    // after the opener are allowed.
    const fenceMatch = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      const ch = marker[0] as "`" | "~";
      const len = marker.length;
      if (fenceChar === null) {
        fenceChar = ch;
        fenceLen = len;
        continue;
      } else if (ch === fenceChar && len >= fenceLen) {
        // Closing fence — trailing info-string is not allowed per
        // CommonMark; only treat it as a close if the rest of the
        // line is whitespace.
        if (fenceMatch[3].trim() === "") {
          fenceChar = null;
          fenceLen = 0;
          continue;
        }
      }
    }
    if (fenceChar !== null) {
      // Inside a code block — ignore any vigiles markers on this line.
      continue;
    }

    // Strip inline code spans (backtick-wrapped text) so illustrative
    // markers in prose like `<!-- vigiles:enforce ... -->` don't get
    // parsed. CommonMark opens with N backticks and closes with exactly
    // N, so the backreference handles matching-length spans.
    const scannable = line.replace(/(`+)[\s\S]*?\1/g, (m) =>
      " ".repeat(m.length),
    );

    const enforceMatch = ENFORCE_RE.exec(scannable);
    if (enforceMatch) {
      rules.push({
        linterRule: enforceMatch[1],
        why: enforceMatch[2],
        line: i + 1,
      });
      continue;
    }

    const fileMatch = FILE_RE.exec(scannable);
    if (fileMatch) {
      files.push({ path: fileMatch[1], line: i + 1 });
      continue;
    }

    const cmdMatch = CMD_RE.exec(scannable);
    if (cmdMatch) {
      commands.push({ command: cmdMatch[1], line: i + 1 });
      continue;
    }
    // Skip the compiled-file hash header (`<!-- vigiles:sha256:... -->`)
    // entirely — it's not a rule marker and should not be reported.
    if (/<!--\s*vigiles:sha\d+:/.test(scannable)) continue;

    const markerMatch = MARKER_RE.exec(scannable);
    if (markerMatch) {
      // Looks like a vigiles marker but didn't parse — surface it so users
      // catch typos like "vigile:enforce" or an unquoted why/command.
      const kind = markerMatch[1];
      if (kind === "enforce") {
        errors.push({
          line: i + 1,
          message:
            'Malformed vigiles:enforce — expected `<!-- vigiles:enforce <linter>/<rule> "<why>" -->`',
          raw: line.trim(),
        });
      } else if (kind === "file") {
        errors.push({
          line: i + 1,
          message:
            "Malformed vigiles:file — expected `<!-- vigiles:file <path> -->`",
          raw: line.trim(),
        });
      } else if (kind === "cmd") {
        errors.push({
          line: i + 1,
          message:
            'Malformed vigiles:cmd — expected `<!-- vigiles:cmd "<command>" -->`',
          raw: line.trim(),
        });
      } else if (!KNOWN_NON_RULE_MARKERS.has(kind)) {
        errors.push({
          line: i + 1,
          message: `Unknown vigiles marker "${kind}". Only \`vigiles:enforce\`, \`vigiles:file\`, and \`vigiles:cmd\` are supported.`,
          raw: line.trim(),
        });
      }
    }
  }

  return { rules, files, commands, errors };
}

/**
 * True if the content contains at least one parseable vigiles inline marker —
 * an `enforce` rule, a `file` reference, or a `cmd` reference (ignoring fenced
 * code blocks and malformed markers). Used by `require-spec` validation to
 * treat inline mode as spec-equivalent: a file that pins even a single path is
 * meaningfully managed.
 *
 * Deliberately delegates to `parseInlineRules` so a loose prefix regex
 * can't satisfy require-spec with a malformed marker that produces no
 * real reference.
 */
export function hasInlineRules(content: string): boolean {
  const r = parseInlineRules(content);
  return r.rules.length + r.files.length + r.commands.length > 0;
}
