/**
 * Merge-conflict markers in the files the hook runtime has to PARSE.
 *
 * Observed 2026-08-10 on a real repo: `git merge` left `<<<<<<< / ======= /
 * >>>>>>>` inside `package.json`. Node then refuses to read that package config,
 * so the bare specifier `vigiles/hook` no longer resolves, so NO compiled hook
 * loads, so the `PreToolUse(Bash)` gate refuses every command — including
 * `git merge --abort`, the one command that undoes the cause. The repo wedges,
 * and nothing in the output mentions `package.json`: the runtime only knew that
 * "the hook would not load", so the author goes looking in the hook.
 *
 * Hence two consumers of the same pure predicate:
 *   - the hook runtime, to NAME the real cause when a load fails (and to let the
 *     recovery commands through — see `isRecoveryEvent`);
 *   - `vigiles audit`, to report the conflicted file as a finding BEFORE the
 *     author starts guessing.
 *
 * Pure string work, zero imports — `scanFiles` (the browser engine) runs it over
 * an in-memory file map, `scanPlugin` over disk, and both must agree byte for byte.
 */

/**
 * The config files that must parse for the harness to work, relative to the repo
 * root. `package.json` is the measured wedge (it is on Node's module-resolution
 * path, so a broken one takes the whole compiled-hook layer down with it);
 * `.vigilesrc.json` fails QUIETER — a conflicted one is skipped and every setting
 * in it silently reverts to the default, which is its own kind of wrong.
 */
export const HARNESS_CONFIG_FILES = [
  "package.json",
  ".vigilesrc.json",
] as const;

/**
 * True when `text` carries git's conflict markers.
 *
 * Both ends are required, at line start: `=======` alone is a Markdown heading
 * underline and `<<<<<<<` alone is a heredoc in someone's shell snippet, but the
 * PAIR cannot occur in a JSON file that ever parsed. Deliberately narrow — this
 * predicate feeds a message that tells the author their file is broken, and a
 * false positive there sends them to fix a file that is fine.
 */
export function hasMergeConflictMarkers(text: string): boolean {
  let start = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("<<<<<<<")) start = true;
    else if (start && line.startsWith(">>>>>>>")) return true;
  }
  return false;
}

/**
 * Which of {@link HARNESS_CONFIG_FILES} are currently conflicted. `read` returns
 * the file's text or `undefined` when it does not exist — injected so the same
 * detector runs against disk (CLI) and against a file map (browser engine).
 */
export function conflictedHarnessConfigs(
  read: (path: string) => string | undefined,
): readonly string[] {
  const out: string[] = [];
  for (const file of HARNESS_CONFIG_FILES) {
    const text = read(file);
    if (text !== undefined && hasMergeConflictMarkers(text)) out.push(file);
  }
  return out;
}

/**
 * The one-line report finding for a conflicted harness config. Shared by the
 * disk scan and the browser scan so the wording cannot drift between them.
 */
export function mergeConflictWarning(file: string): string {
  return (
    `${file} contains merge-conflict markers — it does not parse. ` +
    (file === "package.json"
      ? `While it stays broken Node cannot resolve \`vigiles/hook\`, so no compiled ` +
        `hook loads and a PreToolUse Bash gate refuses every command. Resolve the ` +
        `conflict with an editor (the shell is gated by the very hook that won't load).`
      : `Every setting in it silently falls back to the default until the conflict ` +
        `is resolved.`)
  );
}
