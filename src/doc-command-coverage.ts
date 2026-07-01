/**
 * Doc-command coverage — the INVERSE of self-command-refs, and the deterministic
 * FLOOR under the `document-the-why` rule. self-command-refs checks that every
 * `vigiles <cmd>` reference in the docs resolves to a REAL command (docs → code).
 * This checks the other direction (code → docs): every public CLI VERB must be
 * MENTIONED somewhere under `docs/`, so a verb shipped without a doc home is a
 * failing test, not a thing a reader discovers is missing.
 *
 * HIGH-PRECISION, and biased toward NOT crying wolf: the risk here is a FALSE
 * "undocumented" alarm on a verb that IS documented, so "mentioned" is matched
 * GENEROUSLY — a verb counts as documented if it appears in a COMMAND context:
 * `vigiles <verb>` (covers `npx vigiles <verb>`) OR a backtick immediately
 * followed by the verb (`` `<verb>` ``, `` `<verb> ./x` ``). A bare English word
 * ("test", "audit", "eval", "compile" all double as prose) is NOT enough — it
 * must sit in a command context — so the check still fires on a genuinely
 * undocumented verb while never flagging a documented one.
 *
 * `hook-runtime` is excluded by default: it is the HIDDEN runtime-entrypoint
 * umbrella (cohesive-cli-surface keeps it OUT of the human verb surface), not a
 * verb a user is expected to read about beside `audit`/`lint`. Source of truth
 * for the verb set: {@link VERBS}.
 */
import { VERBS } from "./cli-commands.js";

/** The hidden runtime umbrella — not a human-facing verb to document. */
export const COVERAGE_EXEMPT = ["hook-runtime"] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `verb` appears in a COMMAND context anywhere in `content`:
 * `vigiles <verb>` or a backtick-prefixed `` `<verb> ``. Generous on purpose
 * (see the file header) — over-counting a verb as documented is the SAFE
 * direction; under-counting would cry wolf.
 */
export function verbMentioned(verb: string, content: string): boolean {
  const esc = escapeRegExp(verb);
  return new RegExp(String.raw`(\bvigiles\s+|\x60)${esc}\b`).test(content);
}

/**
 * Find public verbs not MENTIONED in any of the given doc files. Pure — the
 * caller supplies file contents (so it runs over the repo's `docs/` in a test,
 * or any file set). `verbs` defaults to the canonical {@link VERBS}; `exempt`
 * drops the hidden umbrella.
 */
export function findUndocumentedVerbs(
  docs: readonly { readonly path: string; readonly content: string }[],
  verbs: readonly string[] = VERBS,
  exempt: readonly string[] = COVERAGE_EXEMPT,
): string[] {
  const mentioned = new Set<string>();
  for (const { content } of docs) {
    for (const verb of verbs) {
      if (!mentioned.has(verb) && verbMentioned(verb, content))
        mentioned.add(verb);
    }
  }
  return verbs.filter((v) => !exempt.includes(v) && !mentioned.has(v));
}
