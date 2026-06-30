#!/usr/bin/env bash
# PostToolUse hook — after the agent edits an eval input (a SKILL.md trigger
# surface or an *.eval.* script) and committed eval locks exist, inject a
# NON-BLOCKING reminder to re-run `vigiles eval --update`. Self-gating: silent
# until you've committed a lock, so it never fires in a repo that doesn't use
# evals. Never blocks the edit. Runs as its OWN PostToolUse entry so its stdout
# stays clean JSON. See docs/harness-testing.md (the eval lock).

set -uo pipefail

INPUT=$(cat)

# No npx / not a Node project → nothing to do, never disrupt the edit.
command -v npx >/dev/null 2>&1 || exit 0
[ -f package.json ] || exit 0

printf '%s' "$INPUT" | npx vigiles hook-runtime eval-lock-nudge

# Always exit 0 — this hook only nudges, it never blocks (the gate is CI's
# `vigiles eval --check`). Swallow any tool/setup error so it can't disrupt edits.
exit 0
