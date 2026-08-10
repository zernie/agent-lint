#!/usr/bin/env bash
# PostToolUse hook — the edit-time test reminders. After the agent edits a
# skill/agent surface or an *.eval.* script, inject a NON-BLOCKING nudge:
#
#   1. the surface has no test/eval at all, or has a deterministic harness but
#      was never EVALUATED (nothing has measured that its description still
#      fires). Reuses the `untested-skill` detector and points at the
#      `test-harness` skill for the tier→API table. Before this, `untested-skill`
#      only ran when a human typed `vigiles lint` — a rule that fires on request
#      is prose, not policy.
#   2. committed eval locks may now be stale → re-run `vigiles eval --update`.
#      Self-gating: silent until you've committed a lock.
#
# Never blocks the edit. Runs as its OWN PostToolUse entry so its stdout stays
# clean JSON. See docs/harness-testing.md and docs/rules/untested-skill.md.

set -uo pipefail

INPUT=$(cat)

# No npx / not a Node project → nothing to do, never disrupt the edit.
command -v npx >/dev/null 2>&1 || exit 0
[ -f package.json ] || exit 0

printf '%s' "$INPUT" | npx vigiles hook-runtime eval-lock-nudge

# Always exit 0 — this hook only nudges, it never blocks (the gate is CI's
# `vigiles eval --check`). Swallow any tool/setup error so it can't disrupt edits.
exit 0
