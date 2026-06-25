#!/usr/bin/env bash
#
# Stop hook — catch a STALE HANDOFF.md (the "I always forget the handoff" fix).
#
# The SessionStart hook (session-handoff.sh) INJECTS the handoff so a new session
# starts oriented; this is the other half — it NUDGES the agent to REFRESH the
# handoff before ending once real work has accumulated since it was last updated.
#
# Fires (exit 2 → blocks the stop, stderr shown to the agent) only when:
#   - this is a git repo with a HANDOFF.md, AND
#   - the handoff is NOT already being edited (no staged/unstaged change), AND
#   - >= THRESHOLD commits (default 5; VIGILES_HANDOFF_THRESHOLD) have landed
#     since HANDOFF.md was last committed.
# Loop-guarded via .stop_hook_active so it nudges at most once per stop cycle.
# Fail-OPEN: no git / no jq / no HANDOFF.md / handoff never committed → exit 0.
#
# Tested by src/session-handoff-check.test.ts (runHook).
set -euo pipefail

input="$(cat 2>/dev/null || true)"

# Loop guard: if this Stop already triggered a continuation, don't re-block.
# Parse stop_hook_active WITHOUT requiring jq (a grep fallback — grep is always
# present, jq may not be) so the guard still fires in a jq-less env instead of
# exit-2-trapping the session when the handoff is stale.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] || exit 0 # not a git repo → fail open
cd "$root" || exit 0
[ -f HANDOFF.md ] || exit 0 # no handoff to keep fresh → nothing to do

# Already editing the handoff (staged or unstaged) → the agent's on it; no nudge.
if ! git diff --quiet -- HANDOFF.md 2>/dev/null ||
  ! git diff --cached --quiet -- HANDOFF.md 2>/dev/null; then
  exit 0
fi

last="$(git log -1 --format=%H -- HANDOFF.md 2>/dev/null || true)"
[ -n "$last" ] || exit 0 # handoff never committed yet → leave it
n="$(git rev-list --count "${last}..HEAD" 2>/dev/null || echo 0)"

threshold="${VIGILES_HANDOFF_THRESHOLD:-5}"
if [ "${n:-0}" -ge "$threshold" ]; then
  echo "HANDOFF.md is STALE — ${n} commit(s) since it was last refreshed (threshold ${threshold}). Before you end this session: update HANDOFF.md (the RESUME-HERE task + decisions of record) and commit it, so the next session starts oriented. (Tune via VIGILES_HANDOFF_THRESHOLD.)" >&2
  exit 2
fi
exit 0
