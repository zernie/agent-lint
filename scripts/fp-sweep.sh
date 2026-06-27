#!/usr/bin/env bash
# fp-sweep.sh — launch-readiness "don't cry wolf" sweep.
#
# Clones a list of popular Claude Code plugins/marketplaces and runs `vigiles
# audit` over each, surfacing any HIGH-PRECISION rule flag (a candidate false
# positive). A cry-wolf on a famous plugin on launch day is fatal; this catches
# it first. Run on a machine with open network (the CC-web container scopes git
# to zernie/vigiles only, so this can't run there).
#
# Usage:
#   scripts/fp-sweep.sh                 # uses `npx vigiles@latest`
#   VIGILES="node dist/cli.js" scripts/fp-sweep.sh   # use a local build
#
# Output: per-plugin scan logs in /tmp/vigiles-fp-sweep/, plus a summary of every
# line containing ✗ (the high-precision failures to triage FP-vs-real by hand).
set -uo pipefail

VIGILES="${VIGILES:-npx --yes vigiles@latest}"
WORK="${WORK:-/tmp/vigiles-fp-sweep}"
rm -rf "$WORK" && mkdir -p "$WORK"

# Top community plugins + marketplaces. Edit freely; these are starting points.
PLUGINS=(
  "https://github.com/wshobson/agents"
  "https://github.com/wshobson/commands"
  "https://github.com/obra/superpowers"
  "https://github.com/obra/superpowers-marketplace"
  "https://github.com/davila7/claude-code-templates"
  "https://github.com/hesreallyhim/awesome-claude-code"
  "https://github.com/anthropics/claude-code"
  "https://github.com/disler/claude-code-hooks-mastery"
  "https://github.com/qdhenry/Claude-Command-Suite"
  "https://github.com/brennercruvinel/CCPlugins"
)

echo "vigiles FP sweep — $(date)"
echo "CLI: $VIGILES"
echo

for url in "${PLUGINS[@]}"; do
  name="$(basename "$url")"
  dir="$WORK/$name"
  echo "── $name ─────────────────────────────────────────"
  if ! git clone --depth 1 "$url" "$dir" >"$WORK/$name.clone.log" 2>&1; then
    echo "  ⚠ clone failed (see $name.clone.log) — skipping"
    continue
  fi
  $VIGILES audit "$dir" --no-html --no-json >"$WORK/$name.scan.log" 2>&1
  flags="$(grep -c "✗" "$WORK/$name.scan.log" 2>/dev/null || echo 0)"
  echo "  audit exit=$? · ✗ flags=$flags · log: $WORK/$name.scan.log"
done

echo
echo "════════ CANDIDATE FALSE POSITIVES (every ✗ line) ════════"
echo "(triage each: a real defect = good; a clean plugin flagged = a cry-wolf to fix)"
grep -rn "✗" "$WORK"/*.scan.log 2>/dev/null || echo "  none — clean sweep ✓"
echo
echo "Full logs in $WORK/"
