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

/** The marker that tells `require-spec` a file is intentionally hand-owned. */
export const REQUIRE_SPEC_DISABLE = "<!-- vigiles-disable require-spec -->";

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
 * `require-spec` disable marker so `vigiles lint` won't ask for a spec back.
 * Pure — the caller writes the file and removes the spec. Returns `null` when
 * there is no header to strip (nothing to eject). Idempotent: a body that
 * already carries the marker is not double-marked.
 */
export function ejectMarkdown(
  content: string,
): { markdown: string; specFile: string } | null {
  const parsed = parseIntegrityHeader(content);
  if (!parsed) return null;
  const markdown = parsed.body.startsWith(REQUIRE_SPEC_DISABLE)
    ? parsed.body
    : `${REQUIRE_SPEC_DISABLE}\n\n${parsed.body}`;
  return { markdown, specFile: parsed.specFile };
}
