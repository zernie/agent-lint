#!/usr/bin/env bash
#
# SessionStart context injection — surface the volatile HANDOFF.md so a new
# session starts ORIENTED without re-reading roadmap.md + the research docs
# (the context-budget lever: read one ~2k-token pointer file, not 60k+ of
# memory + docs to reconstruct state).
#
# Emits the handoff as SessionStart `additionalContext` (the documented field
# Claude Code injects into the new session). Bounded by HANDOFF.md's own
# ≤120-line cap, so the injection stays cheap. Fail-OPEN: no HANDOFF.md, or no
# jq, → exit 0 with no output (never block or noise up a session start).
#
# Tested by src/session-handoff.test.ts (runHook) so it can't silently break.
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
handoff="$root/HANDOFF.md"

[ -f "$handoff" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

jq -n --rawfile h "$handoff" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $h}}'
