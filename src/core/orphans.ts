/**
 * Orphan-docs detection: the inverse of stale-reference validation.
 *
 * Stale-ref detection catches specs that point at files which no longer
 * exist. Orphan detection catches files which exist but no spec or README
 * points at — docs that quietly rot in `docs/` and `research/` because
 * nothing tells the agent they're still load-bearing.
 *
 * The detector operates purely on the filesystem: it enumerates markdown
 * files under configured doc roots and scans every `.md` in the repo for
 * references (markdown links and backtick paths). Works against source
 * README plus compiled CLAUDE.md — no spec loading required.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrphanReport {
  /** Include globs that were scanned. */
  readonly include: readonly string[];
  /** Total docs discovered under those globs. */
  readonly totalDocs: number;
  /** Docs referenced from at least one other `.md` file. */
  readonly referencedDocs: readonly string[];
  /** Docs that exist but no other `.md` references them. */
  readonly orphans: readonly string[];
}

export interface FindOrphansOptions {
  /** Repository root. Defaults to `process.cwd()`. */
  readonly basePath?: string;
  /**
   * Glob patterns of `.md` files to scan. Defaults to
   * `["docs/**\/*.md", "research/**\/*.md"]` — vigiles-repo convention.
   * Set to `[]` to disable scanning entirely. Set to your project's
   * doc directory globs (e.g. `["wiki/**\/*.md"]`) to override.
   */
  readonly include?: readonly string[];
  /** Glob patterns to exclude within the include scope. */
  readonly exclude?: readonly string[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const DEFAULT_INCLUDE = ["docs/**/*.md", "research/**/*.md"] as const;

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  ".vigiles/**",
  ".git/**",
] as const;

/**
 * A doc carrying this marker opts out of orphan detection — the inline escape
 * hatch, mirroring `vigiles-disable require-spec` and `vigiles:ignore-test`.
 * Use it for an intentionally-unreferenced doc (a changelog, a top-level index)
 * that nothing else links to but is not rot.
 */
const DISABLE_RE = /<!--\s*vigiles-disable\s+orphan-docs\s*-->/;

// Match markdown links ](path.md) or ](path.md#anchor)
const LINK_RE = /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

// Match backtick code spans wrapping a path ending in .md
const BACKTICK_RE = /`([^`\s]+\.md)`/g;

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

/** True when a doc opts out of orphan detection via the inline disable marker. */
function isOrphanExempt(absPath: string): boolean {
  try {
    return DISABLE_RE.test(readFileSync(absPath, "utf-8"));
  } catch {
    return false; // unreadable — treat like any other doc
  }
}

/** Discover docs under `include`, dropping any that carry the inline opt-out. */
function collectDocs(
  basePath: string,
  include: readonly string[],
  ignore: readonly string[],
): Set<string> {
  const docs = new Set<string>();
  for (const pattern of include) {
    for (const p of globSync(pattern, { cwd: basePath, ignore: [...ignore] })) {
      if (isOrphanExempt(resolve(basePath, p))) continue;
      docs.add(normalizePath(p));
    }
  }
  return docs;
}

function extractRefs(content: string): string[] {
  const refs: string[] = [];
  for (const m of content.matchAll(LINK_RE)) refs.push(normalizePath(m[1]));
  for (const m of content.matchAll(BACKTICK_RE)) refs.push(normalizePath(m[1]));
  return refs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find docs under `include` globs that no other markdown file references.
 *
 * A doc is considered referenced when some OTHER `.md` file in the repo
 * links to it via `[text](path.md)` or mentions it in a backtick span like
 * `` `docs/foo.md` ``. Self-references don't count — an orphan that only
 * links to itself is still an orphan.
 *
 * `include` and `exclude` are tsconfig-style glob arrays. Default include
 * is the vigiles-repo convention `["docs/**\/*.md", "research/**\/*.md"]`;
 * override per-project via `.vigilesrc.json` → `orphans.include`.
 */
export function findOrphanDocs(options: FindOrphansOptions = {}): OrphanReport {
  const basePath = options.basePath ?? process.cwd();
  const include = options.include ?? DEFAULT_INCLUDE;
  const userExclude = options.exclude ?? [];
  const ignore = [...DEFAULT_IGNORE, ...userExclude];

  const allDocs = collectDocs(basePath, include, ignore);

  const allMarkdown = globSync("**/*.md", {
    cwd: basePath,
    ignore: [...DEFAULT_IGNORE],
  });
  const referencedBy = new Map<string, Set<string>>();

  for (const mdPath of allMarkdown) {
    const source = normalizePath(mdPath);
    let content: string;
    try {
      content = readFileSync(resolve(basePath, mdPath), "utf-8");
    } catch {
      continue;
    }
    for (const target of extractRefs(content)) {
      if (target === source) continue;
      let sources = referencedBy.get(target);
      if (!sources) {
        sources = new Set();
        referencedBy.set(target, sources);
      }
      sources.add(source);
    }
  }

  const orphans: string[] = [];
  const referencedDocs: string[] = [];
  for (const doc of [...allDocs].sort()) {
    if (referencedBy.has(doc)) referencedDocs.push(doc);
    else orphans.push(doc);
  }

  return {
    include: [...include],
    totalDocs: allDocs.size,
    referencedDocs,
    orphans,
  };
}

/** Format an orphan report as human-readable text. */
export function formatOrphanReport(report: OrphanReport): string {
  if (report.orphans.length === 0) {
    return `✓ no orphan docs (${String(report.totalDocs)} scanned across ${report.include.join(", ") || "no include patterns"})`;
  }
  const lines = [
    `✗ ${String(report.orphans.length)} orphan doc(s) — referenced by no other .md:`,
  ];
  for (const o of report.orphans) lines.push(`    ${o}`);
  lines.push(
    "  Fix: link each from another .md (README, a spec's Key Files, or a doc).",
    "  To silence: add `<!-- vigiles-disable orphan-docs -->` to the doc, or",
    "  exclude it via .vigilesrc.json → `orphans.exclude` (or narrow `orphans.include`).",
  );
  return lines.join("\n");
}
