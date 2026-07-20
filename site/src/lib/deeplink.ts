/**
 * The Claude Code handoff deeplink — shared by the hero AuditWidget and the
 * RepoPicker section so "grade my repo" means one thing in one place.
 *
 * The deeplink opens the user's OWN local Claude Code against a repo they name,
 * with a prompt to run vigiles — so the audit runs on their machine, their
 * subscription, nothing uploaded. Claude Code CLI/Desktop honor `claude-cli://`;
 * Claude Code Web does not (#19023), which is why the `npx` fallback is always
 * shown beside it.
 */

/** The prompt handed to the user's Claude Code via the deeplink. */
export const PROMPT = [
  "Grade this agent harness with vigiles: run `npx vigiles audit`. Then, to",
  "measure whether my skills actually fire, run `npx vigiles init` and use the",
  "test-harness skill (measureTriggerRate).",
].join("\n");

const SLUG_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * Normalize any repo reference the user pastes into a bare `owner/name` slug:
 * a full GitHub URL, a `.git` suffix, or stray slashes all collapse to the slug.
 * Returns null when the result isn't a valid `owner/name` (parse, don't validate).
 */
export function normalizeSlug(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/\.git$/i, "");
  s = s.replace(/^\/+|\/+$/g, "");
  return SLUG_RE.test(s) ? s : null;
}

/** Build the Claude Code deeplink for a normalized `owner/name` slug. */
export function deeplink(slug: string): string {
  return `claude-cli://open?repo=${encodeURIComponent(
    slug,
  )}&q=${encodeURIComponent(PROMPT)}`;
}
