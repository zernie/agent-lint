#!/usr/bin/env python3
"""Regenerate the auto-managed PR-summary block from a branch's commits.

First-party (stdlib only) — no third-party Action, nothing to go stale. Reads the
commit subjects + the current PR body, groups the Conventional Commits by type, and
splices a fresh summary between the markers (inserting them on first run). Prose
OUTSIDE the markers is preserved; `vigiles:pr-summary:skip` anywhere opts out.

Usage: pr-summary.py <commits.txt> <body-in.md> <body-out.md>
  commits.txt — one commit subject per line (e.g. `git log --format=%s base..head`)
  body-in.md  — the PR's current body
  body-out.md — where the new body is written (unchanged if skip / no commits)
"""

import re
import sys
from pathlib import Path

START = "<!-- vigiles:pr-summary:start -->"
END = "<!-- vigiles:pr-summary:end -->"
# Conventional-commit types, in the order they appear in the summary.
LABELS = [
    ("feat", "Features"),
    ("fix", "Fixes"),
    ("perf", "Performance"),
    ("refactor", "Refactors"),
    ("docs", "Docs"),
    ("test", "Tests"),
    ("ci", "CI"),
    ("build", "Build"),
    ("chore", "Chores"),
]
_TYPES = {k for k, _ in LABELS}
_PAT = re.compile(r"^(\w+)(?:\([^)]*\))?!?:\s*(.+)$")


def render_block(commits: list[str]) -> str:
    """The marker-bounded summary block for the given commit subjects."""
    groups: dict[str, list[str]] = {k: [] for k in _TYPES}
    other: list[str] = []
    for c in commits:
        m = _PAT.match(c)
        if m and m.group(1) in _TYPES:
            groups[m.group(1)].append(m.group(2))
        else:
            other.append(c)
    lines = ["## Summary — auto-generated from commits", ""]
    for key, label in LABELS:
        if groups[key]:
            lines.append(f"**{label}**")
            lines += [f"- {s}" for s in groups[key]]
            lines.append("")
    if other:
        lines += ["**Other**", *[f"- {s}" for s in other], ""]
    return START + "\n" + "\n".join(lines).rstrip() + "\n" + END


def splice(body: str, block: str) -> str:
    """Replace the existing block in `body`, or append it if absent."""
    if START in body and END in body:
        return re.sub(re.escape(START) + ".*?" + re.escape(END), lambda _: block, body, flags=re.S)
    if body.strip():
        return body.rstrip() + "\n\n" + block + "\n"
    return block + "\n"


def main(commits_path: str, body_in: str, body_out: str) -> None:
    commits = [l for l in Path(commits_path).read_text().splitlines() if l.strip()]
    body = Path(body_in).read_text()
    # Opt-out, or nothing to summarize → leave the body exactly as-is.
    if "vigiles:pr-summary:skip" in body or not commits:
        Path(body_out).write_text(body)
        return
    Path(body_out).write_text(splice(body, render_block(commits)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
