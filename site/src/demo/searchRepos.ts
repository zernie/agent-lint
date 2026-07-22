/**
 * Owner-repo autocomplete for the demo combobox — fetch a GitHub owner's public
 * repos ONCE (client-side, like {@link fetchRepo}) and filter them locally as the
 * visitor types the repo half. One `api.github.com` request per owner (cached by the
 * caller), never one per keystroke — so the autocomplete respects the same anonymous
 * 60-req/hr/IP budget the audit fetch does, and every hit carries a real star count.
 *
 * Why `/users/{owner}/repos` and not `/search/repositories`: the search API has a
 * much stricter anonymous limit (~10 req/min) and would burn out under
 * type-to-search; the per-owner list is one core-budget call we cache and filter in
 * memory. It returns both user and org repos, each with `stargazers_count`.
 *
 * DEGRADED-SAFE: any failure (unknown owner, rate-limit, offline) returns a typed
 * outcome the combobox renders as "no suggestions" — the plain `owner/repo` + Enter
 * path always still works, so autocomplete is an enhancement, never a gate.
 */

/** One repo suggestion — the fields the combobox row renders + submits. */
export interface RepoHit {
  /** Bare repo name (the second slug segment), e.g. `superpowers`. */
  readonly name: string;
  /** Full `owner/name` slug — what a pick submits to the audit. */
  readonly fullName: string;
  readonly stars: number;
  readonly description: string | null;
  readonly fork: boolean;
  readonly archived: boolean;
}

/** The terminal outcome of an owner lookup — a discriminated union the UI switches on. */
export type SearchOutcome =
  | { kind: "ok"; repos: readonly RepoHit[] }
  | { kind: "not-found" }
  | { kind: "rate-limit" }
  | { kind: "error"; message: string };

/** The injectable search seam — the combobox takes this so a test (and the
 *  GitHub-blocked sandbox) can drive it with mock data while production uses the
 *  real fetch below. */
export type SearchFn = (
  owner: string,
  signal?: AbortSignal,
) => Promise<SearchOutcome>;

const API = "https://api.github.com";

interface ApiRepo {
  name?: string;
  full_name?: string;
  stargazers_count?: number;
  description?: string | null;
  fork?: boolean;
  archived?: boolean;
}

/**
 * Search repos by NAME across all of GitHub — so a visitor who remembers the repo
 * name but not the owner (most people) can type `superpowers` and get
 * `obra/superpowers`. Uses the search API, which has a stricter anonymous limit
 * (~10 req/min) than the core budget — hence the combobox debounces + caches per
 * query and degrades to the direct path on a rate-limit, exactly like the owner path.
 * Results come back ranked by stars from GitHub, so no client re-rank is needed.
 */
export const searchReposByName: SearchFn = async (query, signal) => {
  const q = query.trim();
  if (q.length < 2) return { kind: "ok", repos: [] };
  try {
    const res = await fetch(
      `${API}/search/repositories?q=${encodeURIComponent(
        `${q} in:name`,
      )}&sort=stars&order=desc&per_page=7`,
      { signal, headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) {
      // 422 = unprocessable query (e.g. too short / bad chars) → just no matches.
      if (res.status === 422) return { kind: "ok", repos: [] };
      if (res.status === 403 || res.status === 429)
        return { kind: "rate-limit" };
      return {
        kind: "error",
        message: `GitHub responded ${String(res.status)}`,
      };
    }
    const body = (await res.json()) as { items?: ApiRepo[] };
    const repos: RepoHit[] = (body.items ?? [])
      .filter((r): r is ApiRepo & { name: string; full_name: string } =>
        Boolean(r.name && r.full_name),
      )
      .map((r) => ({
        name: r.name,
        fullName: r.full_name,
        stars: r.stargazers_count ?? 0,
        description: r.description ?? null,
        fork: r.fork ?? false,
        archived: r.archived ?? false,
      }));
    return { kind: "ok", repos };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { kind: "error", message: "aborted" };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "network",
    };
  }
};

/** Fetch an owner's public repos (user OR org), newest-pushed first, as `RepoHit`s. */
export const fetchOwnerRepos: SearchFn = async (owner, signal) => {
  try {
    const res = await fetch(
      `${API}/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=pushed`,
      { signal, headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) {
      if (res.status === 404) return { kind: "not-found" };
      if (res.status === 403 || res.status === 429)
        return { kind: "rate-limit" };
      return {
        kind: "error",
        message: `GitHub responded ${String(res.status)}`,
      };
    }
    const raw = (await res.json()) as ApiRepo[];
    const repos: RepoHit[] = raw
      .filter((r): r is ApiRepo & { name: string; full_name: string } =>
        Boolean(r.name && r.full_name),
      )
      .map((r) => ({
        name: r.name,
        fullName: r.full_name,
        stars: r.stargazers_count ?? 0,
        description: r.description ?? null,
        fork: r.fork ?? false,
        archived: r.archived ?? false,
      }));
    return { kind: "ok", repos };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { kind: "error", message: "aborted" };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "network",
    };
  }
};

/**
 * Rank an owner's repos for a typed repo-fragment. Prefix matches beat substring
 * matches; within a tier, more stars first; forks and archived repos sink (they're
 * rarely the harness you mean). An empty fragment shows the owner's top repos by the
 * same non-fragment ordering. Pure + synchronous — the per-keystroke work.
 */
export function rankRepos(
  repos: readonly RepoHit[],
  fragment: string,
  limit = 7,
): readonly RepoHit[] {
  const q = fragment.trim().toLowerCase();
  const scored = repos
    .map((r) => {
      const name = r.name.toLowerCase();
      let matchRank = 2; // no match
      if (q.length === 0) matchRank = 0;
      else if (name.startsWith(q)) matchRank = 0;
      else if (name.includes(q)) matchRank = 1;
      return { r, matchRank };
    })
    .filter((s) => s.matchRank < 2);
  scored.sort((a, b) => {
    if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
    const demote = (x: RepoHit): number =>
      (x.fork ? 1 : 0) + (x.archived ? 1 : 0);
    const da = demote(a.r);
    const db = demote(b.r);
    if (da !== db) return da - db;
    return b.r.stars - a.r.stars;
  });
  return scored.slice(0, limit).map((s) => s.r);
}

/** Compact star count for a chip — `1234` → `1.2k`, `999` stays `999`. */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}
