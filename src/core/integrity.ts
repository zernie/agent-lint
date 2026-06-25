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

export interface IntegrityResult {
  intact: boolean;
  reason?: string;
}

/**
 * Check whether the compiled markdown's SHA-256 hash matches its body.
 * Files without a hash header are treated as hand-written (intact).
 */
export function checkIntegrity(content: string): IntegrityResult {
  const match = content.match(HASH_LINE_RE);
  if (!match) {
    return { intact: true, reason: "No hash header (hand-written file)" };
  }
  const expectedHash = match[1];
  const body = content.replace(HASH_LINE_RE, "");
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
  const match = content.match(HASH_LINE_RE);
  if (!match) return null;
  return { specFile: match[2], body: content.replace(HASH_LINE_RE, "") };
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
