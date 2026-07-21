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
 * The INLINE-CODE path form is weaker than a link, so it carries an extra prose
 * gate: a skill that TEACHES how to build skills mentions bundle paths
 * constantly as EXAMPLES of what a skill *could* ship ("a `scripts/rotate.py`
 * would be helpful to store", "**Examples**: `references/finance.md`"). An
 * inline path is treated as a real reference ONLY when the line DIRECTS the
 * agent to use the file (read/run/see/…) and carries no illustrative cue
 * (example / e.g. / such as / would be / template / →). Markdown links are
 * unchanged — a link is already an act-on-it reference. See `inlinePathIsUsed`.
 *
 * Pure + node-free: the only IO is a REQUIRED, injected `existsSync` (the disk
 * caller passes `node:fs`; the browser engine a map-backed check), so the
 * detector is testable with a fake and statically imports no `node:` builtin —
 * it bundles clean in a browser (path ops come from the node-free `posix-path`).
 */
import { resolve } from "../posix-path.js";

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
  /** REQUIRED, injected existence check (disk: node:fs existsSync). */
  readonly existsSync: (p: string) => boolean;
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
// Inline-path prose gate (don't-cry-wolf on TEACHING / illustrative skills)
// ---------------------------------------------------------------------------
//
// An inline-code bundle path (`` `scripts/foo.py` ``) is a much WEAKER signal
// than a markdown link — skills that TEACH how to build skills (e.g. the
// official `skill-development` skill) are full of bundle paths used as
// EXAMPLES of what a skill *could* contain, not as references to a file the
// skill actually ships: "a `scripts/rotate_pdf.py` would be helpful to store",
// "**Examples**: `references/finance.md` …", "- **`references/patterns.md`** —
// Common patterns". Flagging those as "bundled resource not found" cries wolf
// and graded a clean, correct skill an F.
//
// So an inline path is only treated as a real reference when the surrounding
// prose DIRECTS the agent to ACT on the file (read/run/see/…) AND carries no
// illustrative/hypothetical cue. Markdown links (`[text](path)`) are unchanged
// — a link is already a high-confidence, follow-me reference. We bias HARD
// toward precision here: missing a real dead-ref is far better than a false
// positive on a teaching skill (the same don't-cry-wolf discipline as the
// loader's `danglingRefs`).

// Verbs that direct the agent to CONSUME an existing file. Deliberately EXCLUDES
// authoring verbs (store/create/add/move/write) — "a `scripts/x.py` would be
// helpful to STORE in the skill" is describing a resource to CREATE, exactly
// what a teaching skill illustrates, not a file the skill already ships.
const USE_DIRECTIVE =
  /\b(run|runs|execute|executes|read|reads|load|loads|open|opens|source|sources|import|imports|see|view|refer|follow|call|invoke|apply|consult|check)\b/i;

// Illustrative / hypothetical prose cues — a line carrying one is describing
// what a skill MIGHT contain (an example, a suggestion, a template), not
// pointing at a shipped file. Includes the `→`/`->` arrow used in "move detail
// → `references/x.md`" authoring lists.
const ILLUSTRATIVE_CUE =
  /\b(example|examples|e\.g\.?|i\.e\.?|such as|for instance|would be|helpful|useful|template|boilerplate)\b|→|->/i;

/**
 * Whether an inline bundle-path on this line reads as a REAL reference (the
 * agent is told to use the file) rather than an illustrative mention. Requires
 * a positive use-directive and the absence of an illustrative cue — both
 * evaluated over the whole line for simplicity (a tight, precise rule over a
 * clever one). Only the inline-path branch consults this; markdown links do not.
 */
function inlinePathIsUsed(line: string): boolean {
  return USE_DIRECTIVE.test(line) && !ILLUSTRATIVE_CUE.test(line);
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
  // Inline-code path mentions: only the high-confidence bundle-dir-prefixed
  // form, AND only when the surrounding prose USES the file (not an illustrative
  // mention on a teaching skill — see `inlinePathIsUsed`).
  if (inlinePathIsUsed(line)) {
    for (const m of line.matchAll(INLINE_SPAN)) {
      const token = m[1].trim();
      if (!isInlineBundlePath(token)) continue;
      const resolved = localResourceTarget(token);
      if (resolved !== null) {
        out.push({ ref: token, resolved, kind: "path", line: lineNo });
      }
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
  opts: SkillResourceOptions,
): SkillResourceFinding[] {
  const exists = opts.existsSync;
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
