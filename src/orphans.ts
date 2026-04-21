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
  /** Doc roots that were scanned. */
  readonly docRoots: readonly string[];
  /** Total docs discovered under those roots. */
  readonly totalDocs: number;
  /** Docs referenced from at least one other `.md` file. */
  readonly referencedDocs: readonly string[];
  /** Docs that exist but no other `.md` references them. */
  readonly orphans: readonly string[];
}

export interface FindOrphansOptions {
  /** Repository root. Defaults to `process.cwd()`. */
  readonly basePath?: string;
  /** Directories to enumerate docs from. Defaults to `["docs", "research"]`. */
  readonly docRoots?: readonly string[];
  /** Extra glob excludes appended to the built-in ignore list. */
  readonly ignore?: readonly string[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const DEFAULT_DOC_ROOTS = ["docs", "research"] as const;

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  ".vigiles/**",
  ".git/**",
] as const;

// Match markdown links ](path.md) or ](path.md#anchor)
const LINK_RE = /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

// Match backtick code spans wrapping a path ending in .md
const BACKTICK_RE = /`([^`\s]+\.md)`/g;

function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
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
 * Find docs under `docRoots` that no other markdown file references.
 *
 * A doc is considered referenced when some OTHER `.md` file in the repo
 * links to it via `[text](path.md)` or mentions it in a backtick span like
 * `` `docs/foo.md` ``. Self-references don't count — an orphan that only
 * links to itself is still an orphan.
 */
export function findOrphanDocs(
  options: FindOrphansOptions = {},
): OrphanReport {
  const basePath = options.basePath ?? process.cwd();
  const docRoots = options.docRoots ?? DEFAULT_DOC_ROOTS;
  const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];

  const allDocs = new Set<string>();
  for (const root of docRoots) {
    const found = globSync(`${root}/**/*.md`, { cwd: basePath, ignore });
    for (const p of found) allDocs.add(normalizePath(p));
  }

  const allMarkdown = globSync("**/*.md", { cwd: basePath, ignore });
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
    docRoots: [...docRoots],
    totalDocs: allDocs.size,
    referencedDocs,
    orphans,
  };
}

/** Format an orphan report as human-readable text. */
export function formatOrphanReport(report: OrphanReport): string {
  if (report.orphans.length === 0) {
    return `✓ no orphan docs (${String(report.totalDocs)} scanned across ${report.docRoots.join(", ")})`;
  }
  const lines = [
    `✗ ${String(report.orphans.length)} orphan doc(s) — referenced by no other .md:`,
  ];
  for (const o of report.orphans) lines.push(`    ${o}`);
  return lines.join("\n");
}
