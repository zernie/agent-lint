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
  | { kind: "too-large" }
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
/** Top-level files that ARE a harness surface on their own. `SKILL.md` at the repo
 *  root is the single-skill plugin shape (loadPluginFromFiles' "single-skill" case). */
const HARNESS_ROOT_FILES = new Set(["CLAUDE.md", ".mcp.json", "SKILL.md"]);
/** Any path segment equal to one of these is a harness directory. */
const HARNESS_DIRS = new Set([
  ".claude",
  ".claude-plugin",
  "skills",
  "hooks",
  "agents",
  "commands",
]);

/**
 * A tree blob that's a harness surface: a top-level harness file, or a path whose
 * FIRST segment is a harness dir (a root `skills/`/`hooks/` or a `.claude`/
 * `.claude-plugin` root). Deliberately NOT "any segment" — a normal repo's nested
 * `src/hooks/useThing.ts` or `packages/x/skills/` must not be mistaken for a Claude
 * harness (which would grade an empty machine instead of showing the no-harness
 * state). Referenced scripts outside these dirs are picked up by the 2nd fetch pass.
 */
export function isHarnessPath(path: string): boolean {
  if (!path.includes("/")) return HARNESS_ROOT_FILES.has(path);
  return HARNESS_DIRS.has(path.slice(0, path.indexOf("/")));
}

/**
 * A path that PROVES the repo is a Claude Code harness — not merely a repo that
 * happens to contain a dir named `hooks`/`skills`/… (a git-hooks `hooks/`, a React
 * app's `src/hooks/`). The harness GATE requires at least one, so an ordinary repo
 * lands in the no-harness state instead of a bogus grade. Markers: `CLAUDE.md`, an
 * `.mcp.json`, anything under `.claude/`/`.claude-plugin/`, the hook convention file
 * `hooks/hooks.json`, or a REAL top-level surface FILE (`skills/<x>/SKILL.md`,
 * `agents/<x>.md`, `commands/<x>.md`). A bare top-level `hooks/` of scripts with no
 * declaration is NOT a harness — the loader only treats hooks as loadable when
 * declared via a manifest / settings / `hooks/hooks.json`.
 */
export function isHarnessMarker(path: string): boolean {
  if (path === "CLAUDE.md" || path === ".mcp.json" || path === "SKILL.md")
    return true;
  if (path.startsWith(".claude/") || path.startsWith(".claude-plugin/"))
    return true;
  if (path === "hooks/hooks.json") return true;
  return (
    /^skills\/[^/]+\/SKILL\.md$/.test(path) ||
    /^agents\/[^/]+\.md$/.test(path) ||
    /^commands\/.+\.md$/.test(path)
  );
}

/**
 * A hook-config file a plugin manifest points its `hooks` field at (e.g.
 * `.claude-plugin/plugin.json` with `"hooks": "config/hooks.json"`). That file can
 * live OUTSIDE the harness dirs, so the harness-path filter drops it and the scan's
 * `readHooksJsonFile` then finds nothing → every hook silently dropped. Return the
 * referenced repo-relative path so the 2nd fetch pass pulls it.
 */
function manifestHookConfig(files: RepoFiles): string | null {
  for (const p of [".claude-plugin/plugin.json", "plugin.json"]) {
    const text = files[p];
    if (text === undefined) continue;
    try {
      const m = JSON.parse(text) as { hooks?: unknown };
      if (typeof m.hooks === "string") return m.hooks.replace(/^\.\//, "");
    } catch {
      // A malformed manifest is the scan's concern, not this fetch helper's.
    }
  }
  return null;
}

/**
 * Repo-relative paths a harness file references but that the harness-path filter
 * drops — hook scripts living OUTSIDE the harness dirs. The CLI reads the whole repo,
 * so to stay byte-identical the browser fetches any referenced path present in the
 * tree (else the scan reports a real hook script as missing + a graded penalty).
 * Two forms: (1) plugin-root / project-dir tokens (`${CLAUDE_PLUGIN_ROOT}/scripts/
 * guard.sh`, braced or unbraced); (2) a RELATIVE dir-qualified script path (`scripts/
 * guard.sh`, `./bin/x.sh`) — the form `scanHooks` resolves against the plugin root.
 * Over-matching is harmless: only tree-present paths are fetched (a real file the scan
 * simply ignores if unreferenced), bounded by the size + count caps.
 */
const ROOT_REF =
  /\$\{?(?:CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR)\}?\/([A-Za-z0-9._/-]+)/g;
const REL_SCRIPT =
  /(?:^|[\s"'`(=:,])(?:\.\/)?((?:[\w.-]+\/)+[\w.-]+\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|rb))(?=$|[\s"'`),;])/gm;

export function collectReferencedPaths(files: RepoFiles): Set<string> {
  const out = new Set<string>();
  for (const content of Object.values(files)) {
    for (const m of content.matchAll(ROOT_REF)) out.add(m[1]);
    for (const m of content.matchAll(REL_SCRIPT)) out.add(m[1]);
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
    const tree = (await treeRes.json()) as {
      tree?: TreeEntry[];
      truncated?: boolean;
    };
    // GitHub truncates the recursive tree for very large repos (>100k entries or
    // >7MB), so the harness files we need may be outside the returned slice — we'd
    // misreport no-harness or grade a partial harness. Bail honestly to the CLI.
    if (tree.truncated === true) return { kind: "too-large" };
    const blobs = (tree.tree ?? []).filter((e) => e.type === "blob");
    const treeCount = blobs.length;

    const harness = blobs
      .filter((e) => isHarnessPath(e.path))
      .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES)
      .slice(0, MAX_FILES);

    // The harness GATE: matching harness-SHAPED paths isn't enough — require a
    // definitive marker (isHarnessMarker), so a repo whose only match is a
    // git-hooks `hooks/` or a nested source dir lands in no-harness, not a grade.
    if (!harness.some((e) => isHarnessMarker(e.path))) {
      return { kind: "no-harness", treeCount };
    }
    onProgress?.({ phase: "tree", treeCount, harnessCount: harness.length });

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

    // Second pass (bounded FIXPOINT): fetch what the harness files REFERENCE but the
    // path filter drops — hook scripts via the plugin-root token / relative paths,
    // PLUS a manifest-declared hook-config file (`"hooks": "config/hooks.json"`).
    // Re-scan after each round so a newly-fetched config's OWN script refs resolve
    // too (manifest → config/hooks.json → scripts/guard.sh). Bounded to tree-present
    // paths, the size + file caps, and a small round limit — byte-identical with the
    // CLI's whole-repo read for realistic chains without unbounded fetching.
    const inTree = new Set(blobs.map((b) => b.path));
    for (let round = 0; round < 3; round += 1) {
      const referenced = collectReferencedPaths(files);
      const manifestHooks = manifestHookConfig(files);
      if (manifestHooks !== null) referenced.add(manifestHooks);
      const budget = MAX_FILES - Object.keys(files).length;
      if (budget <= 0) break;
      const extra = [...referenced]
        .filter((p) => inTree.has(p) && !(p in files))
        .filter((p) => (sizeOf.get(p) ?? 0) <= MAX_FILE_BYTES)
        .slice(0, budget)
        .map((path) => ({ path, type: "blob" }) as TreeEntry);
      if (extra.length === 0) break;
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
