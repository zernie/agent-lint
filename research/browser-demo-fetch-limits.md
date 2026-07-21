---
status: active
topic: misc
---

# Browser demo fetch — the bounded-approximation limitation

The in-browser "Grade any repo" demo (`site/src/demo/fetchRepo.ts` →
`scanFiles`) fetches a repo's harness files **client-side** and grades them with
the SAME compiled engine the CLI runs. The parity firewall
(`src/scan-files.test.ts`) proves `scanFiles(map)` is byte-identical to the CLI's
`scanPlugin(dir)` **over the same map**. The open question is never the engine —
it's whether the browser FETCHES the same map the CLI reads off disk.

## The limitation

The browser does a **bounded, selective fetch**, not the CLI's whole-repo read.
GitHub's anonymous API limit is 60 req/hr/IP, so the demo fetches only
harness-shaped paths + the files they reference — never the entire tree. For an
arbitrary repo the fetched map CAN therefore differ from what `vigiles audit`
reads on disk.

This is intentional and cannot be fully closed without either (a) blowing the
rate limit (fetch everything) or (b) requiring a token (defeats the zero-friction
"paste a repo" demo). So the divergence is **managed, not eliminated**.

## The invariant that makes it safe: NEVER GRADE PARTIAL DATA

Every incomplete path bails to an honest terminal state instead of publishing a
wrong grade. Any change to `fetchRepo` MUST preserve this:

| Situation                                                                      | Outcome                                 |
| ------------------------------------------------------------------------------ | --------------------------------------- |
| Truncated GitHub tree (huge monorepo)                                          | `too-large` → use the CLI               |
| > `MAX_FILES` (300) harness surfaces                                           | `too-large`                             |
| Required referenced files exceed the fetch budget                              | `too-large`                             |
| A REQUIRED file fails to fetch (surface, hook script/config, bundled resource) | retryable `error` (not cached)          |
| ADVISORY data absent (coverage test files)                                     | best-effort — no error, grade unchanged |

"Required" = feeds a **graded** finding. "Advisory" = the `untested` count, which
`audit-score.ts` excludes from the overall grade.

## What IS fetched to match the CLI (the closed edge cases)

Each of these was a real browser-vs-CLI divergence Codex flagged on PR #100, now
closed + tested in `site/src/demo/fetchRepo.browser.test.ts`:

- Harness surfaces: `skills/`/`agents/`/`commands/`/`hooks/` + root `CLAUDE.md` /
  `.mcp.json` / `SKILL.md` (single-skill repo).
- Hook scripts outside harness dirs — `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`
  tokens AND relative dir-qualified paths (`scripts/guard.sh`, `./bin/x.sh`).
- Manifest-declared hook configs (`plugin.json` `"hooks": "config/hooks.json"`),
  chained via a bounded fixpoint (manifest → config → its own script refs).
- SKILL.md bundled resources (`references/*`, `assets/*`, markdown-link targets)
  for a root single-skill repo (nested-skill resources ride the `skills/` dir).
- Coverage tests outside the harness dirs (`tests/foo.test.ts`, a top-level eval)
  — best-effort, so the `Tested` category matches the CLI's whole-repo read.
- Harness detection hardened: a nested `src/hooks/useThing.ts` or a bare git-hooks
  `hooks/` is NOT a harness (the marker gate); a nameless root `SKILL.md` is named
  after the repo, not `__vigiles_repo__`.

## Documented NON-GOALS (not bugs)

- **Codex-only repos** (`AGENTS.md` / `.codex`): the demo is Claude-Code-scoped;
  such a repo lands in `no-harness` → CLI. Wiring the Codex adapter into `runAudit`
  is a clean follow-up. Do NOT re-add those inputs to the fetch without it.
- **`.vigilesrc.json` `sharedDirs`**: a repo sharing one root `scripts/`/`references/`
  tree across skills. Rare; would need a `scanFiles` option. False advisory only.
- **Windows disk paths**: vigiles targets macOS + Linux (where `node:path` IS
  `path.posix`); Windows `C:\`-style paths are an unsupported-OS concern.
- **Extensionless relative script paths** (`bash scripts/guard` with no `.sh`):
  the referenced-path collectors require a file extension ON PURPOSE — an
  extensionless path-like token (`see scripts/readme`) is ambiguous with prose, so
  fetching it would trade precision for a rare recall case. A manifest hook
  registering an extensionless script that then exits 2 on a non-blocking event is
  a narrow miss (a slightly-too-high grade), accepted for the collector's precision.
- **Oversized bundled resources** (a SKILL.md resource > `MAX_FILE_BYTES` = 256 KiB,
  e.g. a large `assets/model.bin`): the size cap skips the fetch, so the map-backed
  `existsSync` returns false and `skillResourceIssues` may report it missing, where
  the CLI's `existsSync` (filesystem, size-blind) sees it. Rare — bundled refs are
  almost always small `.md`/`.json`. A clean fix (an existence STUB for tree-present
  oversized non-surface files) is possible but needs surface-vs-resource
  discrimination in the fetch layer; deferred as a narrow edge, not built.

## Why the tail isn't worth chasing

A review bot will keep surfacing "file X outside the harness dirs isn't fetched"
cases — they all share the one root cause above. Unless a case produces a **wrong
grade** (not an advisory discrepancy) AND isn't already caught by the
`too-large`/`error` bail-outs, it is the accepted cost of the rate-limit-safe
approximation, not a new bug. The engine is exact; the fetch is a documented
approximation with a safe failure mode.
