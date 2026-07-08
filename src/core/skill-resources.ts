/**
 * vigiles — SKILL bundled-resource resolution (the cross-reference moat applied
 * to a SKILL.md body).
 *
 * A SKILL.md body is freeform markdown that routinely points the agent at LOCAL
 * BUNDLED files shipped beside it — `scripts/foo.sh`, `references/api.md`,
 * `[setup](./scripts/run.py)`, an inline `run \`scripts/setup.sh\``. When a
 * referenced file doesn't exist on disk under the skill directory, the agent
 * reads the instruction, gets nothing, and silently continues (a documented top
 * skill pain — one practitioner found 59 broken refs across 192 files). vigiles
 * already verifies file/script refs inside typed specs (core/refs.ts,
 * core/doc-refs.ts) and intra-plugin script refs in the loader
 * (plugin-loader.ts `danglingRefs`); this extends that to the SKILL.md body.
 *
 * HIGH-PRECISION / FP-SAFE, by the same don't-cry-wolf discipline the rest of
 * vigiles holds (see `danglingRefs`/`isPluginRooted`): we flag ONLY references
 * that are UNAMBIGUOUSLY a local bundled resource — a markdown link to a
 * relative path with a file extension, or an explicit `scripts/`/`references/`/
 * `assets/`-prefixed path (the Agent-Skills standard bundle dirs) with an
 * extension. Everything else is skipped: URLs, absolute paths, `${VAR}`/`$VAR`
 * tokens, `../` escapes, bare words with no extension or known prefix. Prefer
 * MISSING a real ref over emitting a false positive — a noisy resource check
 * would teach users to ignore it.
 *
 * Pure: the only IO is an injectable `existsSync` (default node:fs), mirroring
 * core/refs.ts and the loader so the detector is testable with a fake.
 */
import { existsSync as nodeExistsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a missing bundled-resource reference was found in the body. */
export type SkillResourceKind = "link" | "path";

/** A SKILL.md body reference to a local bundled file that doesn't exist on disk. */
export interface SkillResourceFinding {
  /** The reference text exactly as written in the body (e.g. `scripts/run.sh`). */
  readonly ref: string;
  /** The path normalized relative to the skill dir, used for resolution. */
  readonly resolved: string;
  /** Whether the ref came from a markdown link `[..](..)` or an inline/path mention. */
  readonly kind: SkillResourceKind;
  /** 1-based source line of the reference in the body. */
  readonly line: number;
}

export interface SkillResourceOptions {
  /** Injectable existence check (default: node:fs existsSync). */
  readonly existsSync?: (p: string) => boolean;
  /**
   * Repo root, used only together with `sharedDirs` (below). Off by default.
   */
  readonly repoRoot?: string;
  /**
   * OPT-IN shared-resource dirs — top-level dir names a repo shares across skills
   * (`.vigilesrc.json` `sharedDirs`, e.g. `["scripts", "references"]`). Many skill
   * libraries keep ONE top-level `scripts/` tree instead of a copy beside every
   * SKILL.md, so a ref like `scripts/promptfoo/x.py` lives at the repo root. When
   * a ref's FIRST path segment is a declared shared dir, it may ALSO resolve
   * against `repoRoot`. Scoped to declared dirs on PURPOSE: a repo that sets no
   * `sharedDirs` is byte-identical to before (skill-dir-only), and even with it a
   * ref OUTSIDE a shared dir still can't be masked by a same-named repo-root file.
   * The controlled fix for feedback P1-4 (opt-in, never a default behavior change).
   */
  readonly sharedDirs?: readonly string[];
}

// ---------------------------------------------------------------------------
// Shapes we match vs deliberately skip (FP-safety)
// ---------------------------------------------------------------------------

const FENCE = /^\s*(?:`{3,}|~{3,})/;

// The Agent-Skills standard bundle subdirectories. A path PREFIXED by one of
// these is unambiguously a local bundled resource, even without a `./`.
const BUNDLE_DIRS = ["scripts", "references", "assets"] as const;
const BUNDLE_PREFIX = new RegExp(`^(?:${BUNDLE_DIRS.join("|")})/`);

// A markdown inline link `[text](target)` — we read its target.
const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

// An inline-code path mention: a backtick span whose whole content is a single
// path token. We only treat it as a ref when it is a bundle-dir-prefixed path
// with an extension (the high-confidence shape); a bare `scripts` or a generic
// `foo.ts` mention is NOT flagged.
const INLINE_SPAN = /`([^`\n]+)`/g;

// A path must carry a file extension to be a resource reference. A bare word or
// a directory name (`scripts/lib`) is undecidable prose — skipped.
const HAS_EXT = /\.[A-Za-z0-9]+$/;

/**
 * A reference target is a LOCAL BUNDLED RESOURCE worth resolving iff it is a
 * relative path with a file extension AND is not one of the skip shapes. This is
 * the single gate; both the link path and the inline-path path run through it.
 */
function localResourceTarget(rawTarget: string): string | null {
  // Strip a markdown link title / fragment / query if present, and trim.
  const target = rawTarget.trim();
  if (target.length === 0) return null;

  // SKIP: URLs (http://, https://, mailto:, any scheme://) — external.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^mailto:/i.test(target)) {
    return null;
  }
  // SKIP: a pure anchor / fragment-only link (`#section`).
  if (target.startsWith("#")) return null;
  // SKIP: absolute paths (`/etc/x`, Windows `C:\`) — not bundled-relative.
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) return null;
  // SKIP: variable tokens (`${CLAUDE_PLUGIN_ROOT}/x`, `$VAR/x`) — uncheckable,
  // and almost always a plugin-root or runtime path, not a bundled file.
  if (target.includes("$")) return null;
  // SKIP: `~/`-rooted paths — the user's home / machine-global config, referenced
  // intentionally from OUTSIDE the repo (JIT routing like `Read ~/.claude/docs/x.md`).
  // Not a repo-bundled resource; unverifiable from the repo and never a "broken ref".
  if (target === "~" || target.startsWith("~/")) return null;
  // Drop a URL fragment / query suffix so `references/api.md#auth` AND
  // `references/schema.json?raw=1` resolve to the file. Done BEFORE the glob skip
  // below so a legitimate `?query` suffix on a real bundled ref isn't mistaken for
  // a glob `?` and wrongly skipped — the file must still be checked. (Only after
  // the scheme check above, so we never mangle a URL.)
  const path = target.replace(/[?#].*$/, "");
  if (path.length === 0) return null;

  // SKIP: globs and template placeholders — a ref carrying a glob metacharacter
  // (`*`) or a brace/angle-bracket placeholder (`{trivial,…}`, `<linter>`) is a
  // directory CONVENTION or an example, not a concrete file (`references/*.md`,
  // `references/linter-cards/{a,b}/<linter>.md`). Resolving it as a literal path and
  // reporting "missing" is a false positive (feedback P1-3). `?` is intentionally
  // NOT in this class — it's the query separator stripped above; a genuine `?`-glob
  // truncates to an extensionless path and is dropped by HAS_EXT below anyway.
  if (/[*{}<>]/.test(path)) return null;

  // SKIP: a `../` escape OUT of the skill dir — undecidable / not a bundled
  // resource (it points at a sibling skill or the repo). A leading `./` is fine.
  const normalized = path.replace(/^\.\//, "");
  if (normalized.startsWith("../") || normalized.includes("/../")) return null;

  // Must look like a file (have an extension), else it's a dir/prose mention.
  if (!HAS_EXT.test(normalized)) return null;

  return normalized;
}

/**
 * Whether an inline-code path token is high-confidence enough to flag on its
 * own (no surrounding `[..](..)` link syntax). We require a BUNDLE-DIR PREFIX
 * (`scripts/`, `references/`, `assets/`) so a generic `` `config.json` `` or a
 * `` `src/foo.ts` `` API mention in prose is never flagged — only the standard
 * bundle layout, which is unambiguously a shipped resource.
 */
function isInlineBundlePath(token: string): boolean {
  const t = token.trim();
  // A single token only — a span with spaces is a command/prose, not a path.
  if (/\s/.test(t)) return false;
  const normalized = t.replace(/^\.\//, "");
  return BUNDLE_PREFIX.test(normalized) && HAS_EXT.test(normalized);
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

interface Candidate {
  readonly ref: string;
  readonly resolved: string;
  readonly kind: SkillResourceKind;
  readonly line: number;
}

/** Collect candidate bundled-resource refs from one body line, skipping fences. */
function candidatesInLine(line: string, lineNo: number): Candidate[] {
  const out: Candidate[] = [];
  // Markdown links: any relative path target that passes the local-resource gate.
  for (const m of line.matchAll(MD_LINK)) {
    const resolved = localResourceTarget(m[1]);
    if (resolved !== null) {
      out.push({ ref: m[1].trim(), resolved, kind: "link", line: lineNo });
    }
  }
  // Inline-code path mentions: only the high-confidence bundle-dir-prefixed form.
  for (const m of line.matchAll(INLINE_SPAN)) {
    const token = m[1].trim();
    if (!isInlineBundlePath(token)) continue;
    const resolved = localResourceTarget(token);
    if (resolved !== null) {
      out.push({ ref: token, resolved, kind: "path", line: lineNo });
    }
  }
  return out;
}

/**
 * The bundled-resource references in a SKILL.md body that don't resolve on disk
 * under `skillDir`. Pure + FP-safe (see the module header). `skillDir` is the
 * directory the SKILL.md itself lives in (resources are bundled beside it).
 *
 * The shared detector behind both `vigiles lint` (the `skill-resource-resolves`
 * rule) and `vigiles audit` (the read-only report) — one detector, no drift.
 */
export function skillResourceIssues(
  skillBody: string,
  skillDir: string,
  opts: SkillResourceOptions = {},
): SkillResourceFinding[] {
  const exists = opts.existsSync ?? nodeExistsSync;
  const sharedDirs = new Set(opts.sharedDirs ?? []);
  // A ref resolves if it exists under the skill's own dir. If (and only if) its
  // first segment is a DECLARED shared dir, it may also resolve against the repo
  // root — the opt-in shared-tree case. No shared dirs → skill-dir-only (unchanged).
  const resolvesAnywhere = (rel: string): boolean => {
    if (exists(resolve(skillDir, rel))) return true;
    const firstSeg = rel.split("/")[0];
    return (
      opts.repoRoot !== undefined &&
      sharedDirs.has(firstSeg) &&
      exists(resolve(opts.repoRoot, rel))
    );
  };
  const findings: SkillResourceFinding[] = [];
  const seen = new Set<string>();

  const lines = skillBody.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const c of candidatesInLine(lines[i], i + 1)) {
      if (resolvesAnywhere(c.resolved)) continue;
      // De-dupe the same missing file referenced several times in the body.
      const key = `${c.kind}:${c.resolved}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        ref: c.ref,
        resolved: c.resolved,
        kind: c.kind,
        line: c.line,
      });
    }
  }
  return findings;
}
