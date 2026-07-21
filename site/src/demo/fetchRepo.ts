/**
 * Fetch a public GitHub repo's HARNESS files into the repo-relative file map the
 * browser audit engine (`scanFiles`) consumes — entirely client-side, so nothing
 * leaves the visitor's browser but the GitHub requests themselves.
 *
 * Budget (keeps the anonymous 60-req/hr/IP limit rare): TWO api.github.com calls
 * per run — (1) the repo endpoint for `default_branch` (+ the clean 404/403
 * detection point), (2) one RECURSIVE Trees call — then the file CONTENTS come
 * from raw.githubusercontent.com, which is NOT rate-limited. The Trees response
 * carries each blob's `size`, so oversized files are skipped WITHOUT a fetch, and
 * only harness-shaped paths are read at all → ~2–10 requests total.
 *
 * The keys of the returned map are repo-relative POSIX paths — exactly what
 * `scanFiles` expects (the shape `src/scan-files.test.ts`'s `readDirToMap` builds).
 */
import { normalizeSlug } from "@/lib/deeplink";

/** repo-relative POSIX path → file content — the `scanFiles` input shape. */
export type RepoFiles = Record<string, string>;

/** The terminal outcome of a fetch — a discriminated union the UI switches on. */
export type FetchOutcome =
  | {
      kind: "ok";
      files: RepoFiles;
      /** Total blob count in the repo tree (the "repo tree — N files" line). */
      treeCount: number;
      /** How many harness files were read (the loading counter's denominator). */
      harnessCount: number;
    }
  | { kind: "no-harness"; treeCount: number }
  | { kind: "not-found" }
  | { kind: "rate-limit" }
  | { kind: "error"; message: string };

/** Honest loading progress — each event maps 1:1 to a real awaited request. */
export type FetchProgress =
  | { phase: "tree"; treeCount: number; harnessCount: number }
  | { phase: "file"; done: number; of: number };

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/** Mirror the engine's per-file cap — files over this are skipped (never fetched). */
const MAX_FILE_BYTES = 256 * 1024;
/** A sane ceiling on harness files read per run (a monorepo could match many). */
const MAX_FILES = 300;
/** How many raw content fetches run at once. */
const CONCURRENCY = 6;

// The browser demo grades CLAUDE CODE harnesses only (the engine's Codex audit is
// full-parity, but the demo doesn't wire the Codex layout/dialect yet — a follow-up).
// So we fetch only Claude-Code surfaces; a Codex-only repo (AGENTS.md / .codex) lands
// in the honest no-harness state that points at the CLI, not a report scanned with the
// wrong layout. Do NOT re-add AGENTS.md/.codex here without wiring the Codex adapter
// into runAudit — fetching a surface the scan then ignores is what produced the bug.
/** Top-level files that ARE a harness surface on their own. */
const HARNESS_ROOT_FILES = new Set(["CLAUDE.md", ".mcp.json"]);
/** Any path segment equal to one of these is a harness directory. */
const HARNESS_DIRS = new Set([
  ".claude",
  ".claude-plugin",
  "skills",
  "hooks",
  "agents",
  "commands",
]);

/** A tree blob whose path is a harness surface (top-level file or under a harness dir). */
function isHarnessPath(path: string): boolean {
  if (!path.includes("/")) return HARNESS_ROOT_FILES.has(path);
  return path.split("/").some((seg) => HARNESS_DIRS.has(seg));
}

/**
 * Repo-relative paths a harness file references via the plugin-root / project-dir
 * tokens — e.g. a hook command `${CLAUDE_PLUGIN_ROOT}/scripts/guard.sh`. Those
 * scripts often live OUTSIDE the harness dirs, so the harness-path filter drops
 * them; the CLI reads the whole repo, so to stay byte-identical the browser must
 * fetch any referenced path that actually exists in the tree (else the scan reports
 * a real hook script as missing and applies the graded penalty). Matches braced and
 * unbraced `$CLAUDE_PLUGIN_ROOT` / `$CLAUDE_PROJECT_DIR`.
 */
const ROOT_REF =
  /\$\{?(?:CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR)\}?\/([A-Za-z0-9._/-]+)/g;

export function collectReferencedPaths(files: RepoFiles): Set<string> {
  const out = new Set<string>();
  for (const content of Object.values(files)) {
    for (const m of content.matchAll(ROOT_REF)) out.add(m[1]);
  }
  return out;
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

/** Classify a non-OK GitHub API response into a terminal outcome (or null = ok-ish). */
function classifyError(res: Response): FetchOutcome | null {
  if (res.status === 404) return { kind: "not-found" };
  if (res.status === 403 || res.status === 429) {
    // The anonymous rate limit: 403/429 with the remaining counter at 0.
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      return { kind: "rate-limit" };
    }
    return { kind: "rate-limit" };
  }
  return null;
}

/** Fetch a repo's harness file map, reporting honest per-request progress. */
export async function fetchRepo(
  rawSlug: string,
  onProgress?: (p: FetchProgress) => void,
  signal?: AbortSignal,
): Promise<FetchOutcome> {
  const slug = normalizeSlug(rawSlug);
  if (slug === null) return { kind: "error", message: "unparseable repo" };
  const [owner, repo] = slug.split("/");

  try {
    // (1) Repo endpoint → default branch (and the earliest 404/403 signal).
    const metaRes = await fetch(`${API}/repos/${owner}/${repo}`, { signal });
    if (!metaRes.ok) {
      const err = classifyError(metaRes);
      if (err) return err;
      return { kind: "error", message: `GitHub responded ${metaRes.status}` };
    }
    const meta = (await metaRes.json()) as { default_branch?: string };
    const branch = meta.default_branch ?? "main";

    // (2) One recursive Trees call → every blob path + size.
    const treeRes = await fetch(
      `${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
        branch,
      )}?recursive=1`,
      { signal },
    );
    if (!treeRes.ok) {
      const err = classifyError(treeRes);
      if (err) return err;
      return { kind: "error", message: `GitHub responded ${treeRes.status}` };
    }
    const tree = (await treeRes.json()) as { tree?: TreeEntry[] };
    const blobs = (tree.tree ?? []).filter((e) => e.type === "blob");
    const treeCount = blobs.length;

    const harness = blobs
      .filter((e) => isHarnessPath(e.path))
      .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES)
      .slice(0, MAX_FILES);

    onProgress?.({ phase: "tree", treeCount, harnessCount: harness.length });
    if (harness.length === 0) return { kind: "no-harness", treeCount };

    // (3) Content from raw.githubusercontent.com (NOT rate-limited), pooled.
    const files: RepoFiles = {};
    const sizeOf = new Map(blobs.map((b) => [b.path, b.size ?? 0]));
    let done = 0;
    let total = harness.length;
    const fetchBlob = async (entry: TreeEntry): Promise<void> => {
      const url = `${RAW}/${owner}/${repo}/${encodeURIComponent(
        branch,
      )}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
      try {
        const res = await fetch(url, { signal });
        if (res.ok) files[entry.path] = await res.text();
      } catch {
        // A single missing/broken blob is skipped, not fatal.
      }
      done += 1;
      onProgress?.({ phase: "file", done, of: total });
    };
    const drain = async (entries: TreeEntry[]): Promise<void> => {
      const queue = [...entries];
      const worker = async (): Promise<void> => {
        for (;;) {
          const entry = queue.shift();
          if (entry === undefined) return;
          await fetchBlob(entry);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
      );
    };

    await drain(harness);

    // Second pass: fetch scripts the harness files reference via the plugin-root
    // token but that live outside the harness dirs (byte-identical with the CLI's
    // whole-repo read). Bounded to paths actually present in the tree + size cap.
    const inTree = new Set(blobs.map((b) => b.path));
    const extra = [...collectReferencedPaths(files)]
      .filter((p) => inTree.has(p) && !(p in files))
      .filter((p) => (sizeOf.get(p) ?? 0) <= MAX_FILE_BYTES)
      .slice(0, MAX_FILES)
      .map((path) => ({ path, type: "blob" }) as TreeEntry);
    if (extra.length > 0) {
      total += extra.length;
      await drain(extra);
    }

    return { kind: "ok", files, treeCount, harnessCount: harness.length };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { kind: "error", message: "aborted" };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "network error",
    };
  }
}
