/**
 * Integrity check: verify a compiled markdown file hasn't been hand-edited.
 *
 * Every compiled file has a SHA-256 hash in its first line:
 *   <!-- vigiles:sha256:<hash> compiled from CLAUDE.md.spec.ts -->
 *
 * If the body content's hash no longer matches what's recorded, someone
 * edited the compiled output directly. The check is one-pass and ~free.
 *
 * This is the entire freshness story now: no input fingerprinting, no
 * recompile diffing. Those responsibilities belong elsewhere:
 *
 * - Hand-edit detection → this module
 * - "Did the spec change?" → guard() rules emitting compile hooks
 * - "Are referenced linter rules / files / scripts still valid?"
 *   → enforce() / file() / cmd() catch this at compile time
 * - "Are committed compiled files actually fresh?"
 *   → CI runs `vigiles compile` then `git diff --exit-code`
 */

import { sha256short } from "./hash.js";

const HASH_LINE_RE =
  /^<!-- vigiles:sha256:([a-f0-9]+) compiled from (.+) -->\r?\n\r?\n?/;

/**
 * A YAML frontmatter block at the very start of a file: `---\n … \n---\n`.
 *
 * 🔴 THIS EXISTS BECAUSE THE INVARIANT WAS STATED IN THIS FILE AND VIOLATED IN ANOTHER.
 * `ejectMarkdown` (bottom of this module) has documented since it was written that a compiled
 * SKILL.md begins with frontmatter which MUST stay in first position, or "the harness would lose
 * the skill's name/description/tools". `addHash` in compile.ts prepended the integrity header to
 * every compiled file unconditionally — including those same skills.
 *
 * Measured 2026-08-17 on five real skills: after compiling, a reader anchored to `^---` finds NO
 * frontmatter at all. The header was the ENTIRE delta — body byte-identical, section order
 * untouched — so one misplaced line was the whole reason a compiled skill could not be adopted.
 *
 * The header now goes AFTER the frontmatter when there is one. Readers must ask this module where
 * the header is rather than anchoring their own regex at `^`: four call sites had independently
 * encoded "first line", and that duplication is what let the invariant drift unnoticed.
 */
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;

/** Same header, matched where it sits below a frontmatter block (blank line allowed). */
const HASH_LINE_IN_BODY_RE =
  /^\s*<!-- vigiles:sha256:([a-f0-9]+) compiled from (.+) -->\r?\n\r?\n?/;

/**
 * Split off a leading frontmatter block. `head` is `""` when the file has none, so a caller can
 * concatenate `head + body` unconditionally and get the original content back.
 */
export function splitFrontmatter(content: string): {
  head: string;
  body: string;
} {
  const m = FRONTMATTER_RE.exec(content);
  return m
    ? { head: m[0], body: content.slice(m[0].length) }
    : { head: "", body: content };
}

/**
 * Locate the integrity header wherever it legitimately sits — before the frontmatter (files
 * compiled before 2026-08-17) or after it (files compiled since). Returns the hash, the spec
 * path, and the content with the header removed and everything else intact.
 *
 * This is the ONLY place that knows where the header can be. Matching `/^<!-- vigiles:sha256/`
 * by hand elsewhere is the bug this function exists to make unnecessary.
 */
export function findIntegrityHeader(content: string): {
  hash: string;
  specFile: string;
  /** `content` minus the header, frontmatter still in place. */
  withoutHeader: string;
} | null {
  const { head, body } = splitFrontmatter(content);
  // After the frontmatter — the current placement. The leading `\s*` is load-bearing: the header
  // is written one blank line below the closing `---` for readability, so an anchor at position 0
  // of the body misses it. A test caught exactly that before it shipped.
  const inBody = body.match(HASH_LINE_IN_BODY_RE);
  if (inBody) {
    return {
      hash: inBody[1],
      specFile: inBody[2],
      withoutHeader: head + body.replace(HASH_LINE_IN_BODY_RE, ""),
    };
  }
  // Or at the very top, which is what a file compiled before the fix looks like. Such a file has
  // no leading frontmatter by definition — the header displaced it — so `head` is empty here.
  const atTop = content.match(HASH_LINE_RE);
  if (!atTop) return null;
  return {
    hash: atTop[1],
    specFile: atTop[2],
    withoutHeader: content.replace(HASH_LINE_RE, ""),
  };
}

/** Render the header in its correct position for this content. */
export function placeIntegrityHeader(
  content: string,
  hash: string,
  specFile: string,
): string {
  const stamp = `<!-- vigiles:sha256:${hash} compiled from ${specFile} -->`;
  const { head, body } = splitFrontmatter(content);
  return head ? `${head}\n${stamp}\n\n${body}` : `${stamp}\n\n${body}`;
}

export interface IntegrityResult {
  intact: boolean;
  reason?: string;
}

/**
 * Check whether the compiled markdown's SHA-256 hash matches its body.
 * Files without a hash header are treated as hand-written (intact).
 */
export function checkIntegrity(content: string): IntegrityResult {
  const found = findIntegrityHeader(content);
  if (!found) {
    return { intact: true, reason: "No hash header (hand-written file)" };
  }
  const expectedHash = found.hash;
  const body = found.withoutHeader;
  if (sha256short(body) !== expectedHash) {
    return {
      intact: false,
      reason:
        "Compiled file was modified directly — edit the .spec.ts source and recompile",
    };
  }
  return { intact: true };
}

/** The marker that tells `require-instructions-spec` a file is intentionally
 * hand-owned (no `.spec.ts` expected). */
export const REQUIRE_INSTRUCTIONS_SPEC_DISABLE =
  "<!-- vigiles-disable require-instructions-spec -->";

/**
 * Parse the `vigiles:sha256 … compiled from <spec>` integrity header, if the
 * file carries one. Returns the referenced spec path and the body below the
 * header; `null` when the file is plain markdown (no header).
 */
export function parseIntegrityHeader(
  content: string,
): { specFile: string; body: string } | null {
  const found = findIntegrityHeader(content);
  if (!found) return null;
  return { specFile: found.specFile, body: found.withoutHeader };
}

/**
 * "Eject" a compiled instruction file to plain, hand-owned markdown: strip the
 * integrity header so the file is no longer spec-managed, and prepend a
 * `require-instructions-spec` disable marker so `vigiles lint` won't ask for a
 * spec back. Pure — the caller writes the file and removes the spec. Returns
 * `null` when there is no header to strip (nothing to eject). Idempotent: a body
 * that already carries the marker is not double-marked.
 *
 * The disable marker is added ONLY for instruction-file bodies. A compiled
 * SKILL.md / subagent body begins with YAML frontmatter (`---`) that MUST stay in
 * first position — prepending an HTML comment there would push the frontmatter
 * out of the lead block and the harness would lose the skill's name/description/
 * tools. The marker is also meaningless for those surfaces (require-instructions-
 * spec doesn't apply to them), so a frontmatter-led body is ejected as-is.
 */
export function ejectMarkdown(
  content: string,
): { markdown: string; specFile: string } | null {
  const parsed = parseIntegrityHeader(content);
  if (!parsed) return null;
  // A frontmatter-led body is a skill/agent — strip the header, add nothing.
  if (/^---\r?\n/.test(parsed.body)) {
    return { markdown: parsed.body, specFile: parsed.specFile };
  }
  const markdown = parsed.body.startsWith(REQUIRE_INSTRUCTIONS_SPEC_DISABLE)
    ? parsed.body
    : `${REQUIRE_INSTRUCTIONS_SPEC_DISABLE}\n\n${parsed.body}`;
  return { markdown, specFile: parsed.specFile };
}
