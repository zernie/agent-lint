#!/usr/bin/env bash
# Reproducible dogfood SWEEP — run `vigiles audit` across a pinned list of real
# OSS Claude Code plugin repos and tally what the detectors find. This is the
# re-runnable counterpart to the curated `test/dogfood/` corpus: the corpus holds
# a few SHA-pinned slices asserted in tests; this sweeps BREADTH so the
# don't-cry-wolf claim ("zero false positives across N real plugins") is a
# command anyone can re-run, not a point-in-time number.
#
# HUMAN-RUN, never in CI (it fetches from the network). Refreshes the "Sweep
# manifest" section of test/dogfood/README.md by hand from the printed totals.
#
# Usage:  npm run build && bash tools/dogfood-sweep.sh
#
# Direct `git clone` may be blocked in some environments; this uses codeload
# tarballs over HTTPS. A repo that 404s (renamed/private) is skipped, not fatal.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI=(node "$ROOT/dist/cli.js" audit)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- the sweep set: owner/repo[@branch]. Mix popular (FP-guard breadth) + long
# tail (where the bugs live). Add rows freely; keep them public + fetchable. ---
REPOS=(
  "obra/superpowers"
  "wshobson/agents"
  "davila7/claude-code-templates"
  "MadAppGang/claude-code"
  "disler/claude-code-hooks-mastery"
  "disler/claude-code-hooks-multi-agent-observability"
  "gmickel/flow-next"
  "anthropics/claude-code-action"
)

# New-detector section headers printed by `vigiles audit`, mapped to a short key.
declare -A SECTIONS=(
  ["Invisible skills"]="skill-missing-fence"
  ["Misplaced plugin"]="plugin-dir-layout"
  ["across delegation"]="delegation-trifecta"
  ["Ineffective hook"]="hook-block-ineffective"
  ["matchers that never"]="hook-matcher"
  ["Lethal trifecta"]="lethal-trifecta"
)
declare -A TALLY
TOTAL_TARGETS=0
HITS=""

fetch() { # owner/repo -> echoes extracted dir, or empty on failure
  local slug="$1" name br
  name="$(echo "$slug" | tr / _)"
  for br in main master; do
    if curl -fsSL "https://codeload.github.com/$slug/tar.gz/refs/heads/$br" \
      -o "$TMP/$name.tgz" 2>/dev/null; then
      tar xzf "$TMP/$name.tgz" -C "$TMP" 2>/dev/null && {
        ls -d "$TMP/$(basename "$slug")"-* 2>/dev/null | head -1
        return 0
      }
    fi
  done
  return 1
}

plugin_roots() { # repo dir -> plugin roots (manifest dirs + .claude/settings dirs)
  {
    find "$1" -name plugin.json -path "*/.claude-plugin/*" -exec dirname {} \; |
      sed 's#/.claude-plugin##'
    find "$1" -name settings.json -path "*/.claude/*" -exec dirname {} \; |
      sed 's#/.claude##'
  } 2>/dev/null | sort -u
}

echo "vigiles dogfood sweep — $(date -u +%Y-%m-%dT%H:%MZ)"
echo "================================================================"
for slug in "${REPOS[@]}"; do
  dir="$(fetch "$slug")"
  if [ -z "${dir:-}" ] || [ ! -d "${dir:-/nonexistent}" ]; then
    echo "  SKIP  $slug (fetch failed)"
    continue
  fi
  n=0
  while IFS= read -r root; do
    [ -z "$root" ] && continue
    n=$((n + 1))
    TOTAL_TARGETS=$((TOTAL_TARGETS + 1))
    out="$("${CLI[@]}" "$root" 2>/dev/null)"
    for pat in "${!SECTIONS[@]}"; do
      if grep -qiF "$pat" <<<"$out"; then
        key="${SECTIONS[$pat]}"
        TALLY[$key]=$((${TALLY[$key]:-0} + 1))
        HITS+=$'\n'"  ${key}  <-  ${slug}: ${root#"$dir"/}"
      fi
    done
  done < <(plugin_roots "$dir")
  echo "  scanned  $slug  ($n plugin-root(s))"
done

echo "================================================================"
echo "Total audit targets: $TOTAL_TARGETS across ${#REPOS[@]} repos"
echo "Findings by detector:"
if [ ${#TALLY[@]} -eq 0 ]; then
  echo "  (none — clean across the sweep)"
else
  for k in "${!TALLY[@]}"; do echo "  ${k} = ${TALLY[$k]}"; done
fi
[ -n "$HITS" ] && { echo "Hits (repo : plugin-root):"; echo "$HITS"; }
echo
echo "Update the 'Sweep manifest' table in test/dogfood/README.md from these"
echo "totals. A clean run is the don't-cry-wolf proof; a hit is a true-positive"
echo "candidate — vendor a minimal MIT slice + assert it in scan-vendor.test.ts."
