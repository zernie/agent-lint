/**
 * Turn a git remote URL into a `vigiles.sh` share deep-link.
 *
 * The in-browser demo re-runs the audit LIVE for whoever opens the link, so a
 * local CLI result is shareable with zero upload and zero backend — the exact gap
 * behind "sharing works from the website but not from my localhost result". The
 * recipient can only fetch a PUBLIC repo, so the CLI frames the link as such; we
 * can't verify visibility offline and deliberately don't (audit stays a pure,
 * network-free, identical-everywhere read — the caller adds the "public repos"
 * caveat rather than phoning GitHub).
 *
 * Pure + harness-agnostic: parse the raw remote string ONCE into a typed slug
 * (parse-don't-validate), no I/O here. The git read + the print live in the CLI.
 */

/** owner/repo parsed from a github.com remote. */
export interface GitHubSlug {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Parse an https or ssh github.com remote URL into `{ owner, repo }`. Returns
 * `null` for a non-GitHub remote (self-hosted, GitLab, …) or an unparseable
 * string. Handles the three real shapes, with or without a `.git` suffix or a
 * trailing slash:
 *   - `https://github.com/owner/repo(.git)`
 *   - `git@github.com:owner/repo(.git)`
 *   - `ssh://git@github.com/owner/repo(.git)`
 */
export function parseGitHubRemote(remoteUrl: string): GitHubSlug | null {
  const url = remoteUrl.trim();
  // Anchor on the github.com host (after `//`, `@`, or at the very start), then
  // take the `owner/repo` path separated by `/` or `:` (the scp-like ssh form).
  const m = /(?:^|@|\/\/)github\.com[/:]([^/:]+)\/(.+?)(?:\.git)?\/?$/.exec(
    url,
  );
  if (!m) return null;
  const [, owner, repo] = m;
  // repo is a single path segment — a slash means we over-matched (a URL with a
  // deeper path, e.g. …/owner/repo/tree/main), so reject rather than mislabel.
  if (!owner || !repo || repo.includes("/")) return null;
  return { owner, repo };
}

/** The vigiles.sh deep-link that re-runs the audit live for a recipient. */
export function githubShareLink(slug: GitHubSlug): string {
  return `https://vigiles.sh/?repo=${slug.owner}/${slug.repo}`;
}

/**
 * Convenience: a git remote URL → the share deep-link, or `null` when it isn't a
 * GitHub repo (so the caller prints nothing).
 */
export function shareLinkForRemote(remoteUrl: string): string | null {
  const slug = parseGitHubRemote(remoteUrl);
  return slug ? githubShareLink(slug) : null;
}
