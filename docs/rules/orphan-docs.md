# orphan-docs

Flag a markdown doc that **no other markdown file references** — a doc that
quietly rots under `docs/` or `research/` because nothing tells the agent it's
still load-bearing. The inverse of stale-reference detection: stale-ref catches a
spec pointing at a missing file; orphan-docs catches an existing file that no
spec points at.

This is a built-in mechanical validator (`vigiles/orphan-docs`), declared via
`enforce("vigiles/orphan-docs", …)` in a spec and surfaced by `vigiles lint`.
Implemented in `src/core/orphans.ts`.

## Configuration

Scope is controlled by `.vigilesrc.json` → `orphans` (tsconfig-style glob arrays):

```json
{
  "orphans": {
    "include": ["docs/**/*.md", "research/**/*.md"],
    "exclude": ["docs/CHANGELOG.md"]
  }
}
```

| Key       | Default                                | Meaning                                              |
| --------- | -------------------------------------- | ---------------------------------------------------- |
| `include` | `["docs/**/*.md", "research/**/*.md"]` | Glob set of docs to hold to the rule. `[]` disables. |
| `exclude` | `[]`                                   | Globs to drop from the candidate set.                |

## What it checks

A doc under `include` counts as **referenced** when some _other_ `.md` in the
repo links to it (`[text](path.md)`) or names it in a backtick span
(`` `docs/foo.md` ``). A self-reference doesn't count. Anything else is an orphan.

## What it never flags — harness-loaded instruction files

Files the **harness loads directly** are load-bearing by their name/location, not
because another `.md` links to them, so they are **categorically not docs** and
are never reported as orphans — **even if you broaden `include` to scan the whole
repo**:

- `CLAUDE.md` / `AGENTS.md` — the instruction file
- `SKILL.md` — a skill
- `agents/*.md` — a subagent
- `commands/*.md` — a slash command

(They are still scanned as _referencers_, so a real doc that only your `CLAUDE.md`
links to is still credited — the exemption only removes them from the orphan
_candidate_ set.)

## Opt out a single doc

For an intentionally-unreferenced doc (a changelog, a top-level index) that isn't
rot, add the inline marker:

```markdown
<!-- vigiles-disable orphan-docs -->
```

…or exclude it via `orphans.exclude` (or narrow `orphans.include`).

## Why

A growing `docs/` / `research/` tree accumulates files nothing links to. They go
stale because no reader — human or agent — is routed to them. Flagging orphans
keeps the doc set honest: every doc is either reachable from the README / a spec /
another doc, or explicitly marked as a standalone.
