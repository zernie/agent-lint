/**
 * The ONE symlink policy for every recursive directory walk in vigiles.
 *
 * 🔴 WHY THIS IS A MODULE AND NOT TWO COPIES. Two walks cross the same trees — the
 * loader's `readTree` (`plugin-loader.ts`, which builds the file map the whole
 * report is computed from) and the surface enumerator behind the foreign-runner
 * warning (`harnessSurfaceFilesOnDisk`, `scan.ts`). Both used `statSync`, which
 * FOLLOWS a symlink, so a surface dir holding a link to an ancestor was a cycle:
 * measured 2026-08-12 on a two-file fixture, the loader did not merely slow down,
 * it THREW `ELOOP: too many symbolic links encountered` out of `scanPlugin`, and
 * the enumerator reported the same file once per lap. A link to a large external
 * tree is the quieter half: an advisory scan reads a foreign tree into the report.
 *
 * Fixing one and not the other is this repo's known failure shape (a field added
 * to one of two report builders has broken it before), and the two walks must
 * agree on what a surface CONTAINS, so the policy lives here and both call it.
 */
import { lstatSync, statSync } from "node:fs";

/** What a walk should do with one directory entry. */
export type EntryKind = "dir" | "file" | "skip";

/**
 * Classify a directory entry for a recursive walk, refusing to descend into a
 * symlinked DIRECTORY.
 *
 * `lstat` describes the ENTRY, `stat` describes its target, and both are needed:
 * the first decides whether descending is safe, the second decides what a link
 * actually points at. A symlink to a FILE is still `"file"` — it cannot recurse,
 * it is genuinely part of the tree, and dropping it would lose real findings.
 *
 * A cycle is removed by CONSTRUCTION rather than by a visited-set: there is no
 * bookkeeping to get wrong, and nothing outside the checkout is ever entered. The
 * cost is a deliberate omission — files under a symlinked SUBdirectory are not
 * seen — which for an advisory finding is the correct direction (silence), and for
 * the loader means a linked-in tree is not loaded rather than loaded forty times.
 *
 * Anything unreadable (a dangling link, a permissions error, a socket) is
 * `"skip"`: a walk feeding a read-only report must not die on one bad entry.
 */
export function entryKind(path: string): EntryKind {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      return statSync(path).isFile() ? "file" : "skip";
    }
    const st = statSync(path);
    if (st.isDirectory()) return "dir";
    if (st.isFile()) return "file";
    return "skip";
  } catch {
    return "skip";
  }
}
