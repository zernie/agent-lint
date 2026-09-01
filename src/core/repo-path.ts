/**
 * `RepoRelativePath` — a path that is provably INSIDE the repository.
 *
 * 🔴 WHY A TYPE AND NOT A CHECK. `audit --out=/tmp/x` appended entries like
 * `../../../../private/tmp/x/vigiles-report.json` to the user's `.gitignore`
 * (#176.8). Those ignore nothing — `.gitignore` does not reach outside its own
 * tree — and accumulate one dead block per output path, in a file the tool is
 * documented as never writing. The fix that shipped was a guard at the write
 * site, which works and leaves the bug WRITABLE: the next caller to build an
 * entry list gets a `string[]` and no reason to think twice.
 *
 * This makes it unwritable instead. `ensureReportGitignored` accepts only
 * `RepoRelativePath[]`, and the only way to obtain one is `repoRelative()`,
 * which returns `null` for anything that escapes the root. There is no cast at
 * the call site and no second guard to keep in sync — a path that leaves the
 * repo cannot reach the writer, because it cannot be given the type.
 *
 * The brand is the pattern this codebase already uses for `VerifiedPath` and
 * friends: a nominal marker on `string` that only a smart constructor mints.
 */
declare const REPO_RELATIVE: unique symbol;

/** A POSIX-separated path known to resolve inside the repository root. */
export type RepoRelativePath = string & { readonly [REPO_RELATIVE]: true };

/**
 * Mint a {@link RepoRelativePath}, or `null` when the target escapes `root`.
 *
 * Rejects an absolute path and anything whose relative form starts with `..`.
 * Normalizes to POSIX separators, because `.gitignore` patterns are POSIX and a
 * Windows `reports\x` would never match `reports/x` — a second silent-miss that
 * lived next to the first.
 */
export function repoRelative(
  root: string,
  target: string,
  io: {
    relative: (from: string, to: string) => string;
    resolve: (...parts: string[]) => string;
    isAbsolute: (p: string) => boolean;
    sep: string;
  },
): RepoRelativePath | null {
  const rel = io.relative(root, io.resolve(root, target));
  if (rel === "" || rel.startsWith("..") || io.isAbsolute(rel)) return null;
  const posix = io.sep === "/" ? rel : rel.split(io.sep).join("/");
  return posix as RepoRelativePath;
}
