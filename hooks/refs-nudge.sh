#!/usr/bin/env bash
# PostToolUse hook — nudge the agent to express references in instruction files
# (CLAUDE.md / AGENTS.md / SKILL.md) as vigiles marks, so `vigiles audit` can
# actually verify them. Non-blocking by default; set the `unmarked-refs` rule to
# "error" in .vigilesrc.json to turn the nudge into a hard block, or to false to
# disable it. Runs as its OWN PostToolUse entry so its stdout stays clean JSON.

set -uo pipefail

INPUT=$(cat)

# No npx / not a Node project → nothing to do, never disrupt the edit.
command -v npx >/dev/null 2>&1 || exit 0
[ -f package.json ] || exit 0

printf '%s' "$INPUT" | npx vigiles refs-hook
status=${PIPESTATUS[1]}

# Propagate ONLY an explicit block (exit 2). Swallow tool/setup errors so a
# missing dep or transient failure never blocks the agent's edit.
if [ "$status" -eq 2 ]; then
  exit 2
fi
exit 0
