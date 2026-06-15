#!/usr/bin/env bash
#
# vigiles benchmark #4 — does the refs-hook produce verifiable instruction files?
#
# Task: "document these functions in a SKILL.md, referencing them by name."
#   vanilla — no hook. The agent writes bare refs (`chargeCard`).
#   gated   — refs-hook (PostToolUse) blocks any unmarked code reference, so the
#             agent must write `vigiles:symbol path#name` or `vigiles:ignore`.
#
# Per run we measure:
#   marks        — count of `vigiles:symbol` marks produced
#   ignores      — count of `vigiles:ignore` (Goodhart: did it opt out instead?)
#   broken       — marks that don't resolve (`vigiles refs`) — correctness
#   names        — did the SKILL mention chargeCard at all (rename is relevant)
#   catch        — after renaming chargeCard in the code, does `vigiles lint`
#                  flag the now-broken reference? (the payoff)
#   turns        — agent turns
#
# Usage: bash bench/run-refs.sh [model] [trials] [timeout_s]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
MODEL="${1:-haiku}"
TRIALS="${2:-6}"
TIMEOUT="${3:-240}"
SRC="$ROOT/bench/refs/shop"
WORK="$ROOT/bench/.work-refs"
RESULTS="$ROOT/bench/results-refs.csv"

rm -rf "$WORK"; mkdir -p "$WORK"
echo "arm,trial,marks,ignores,broken,names_chargeCard,catch_rename,turns,agent" > "$RESULTS"

run_one() {
  local arm="$1" trial="$2"
  local wd="$WORK/${arm}__${trial}"
  rm -rf "$wd"; cp -r "$SRC" "$wd"
  cd "$wd" || return

  local settings_flag=()
  if [ "$arm" = "gated" ]; then
    cat > settings.json <<EOF
{ "hooks": { "PostToolUse": [ { "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "node $CLI refs-hook" } ] } ] } }
EOF
    settings_flag=(--settings ./settings.json)
  fi

  local out status
  out=$(timeout "$TIMEOUT" claude -p "$(cat TASK.txt)" \
        --model "$MODEL" \
        --permission-mode acceptEdits \
        --allowedTools Read Edit Write Bash \
        --output-format json \
        "${settings_flag[@]}" </dev/null 2>/dev/null)
  status=$?
  local turns; turns=$(printf '%s' "$out" | jq -r '.num_turns // empty' 2>/dev/null)

  local marks=0 ignores=0 names=0 broken=0
  if [ -f SKILL.md ]; then
    marks=$(grep -c "vigiles:symbol" SKILL.md)
    ignores=$(grep -c "vigiles:ignore" SKILL.md)
    names=$(grep -c "chargeCard" SKILL.md)
    broken=$(node "$CLI" refs SKILL.md 2>/dev/null | grep -c "^  - line")
  fi

  # the payoff: rename a documented function, does audit catch the break?
  local catch="no"
  if [ -f SKILL.md ]; then
    sed -i 's/chargeCard/captureCard/g' src/billing.ts
    # Capture first: audit exits 2 on any error, which under pipefail would mask
    # grep's result if the pipeline were used directly.
    local aud; aud=$(node "$CLI" lint SKILL.md 2>/dev/null)
    if printf '%s' "$aud" | grep -q '"chargeCard" is not defined'; then
      catch="yes"
    fi
    sed -i 's/captureCard/chargeCard/g' src/billing.ts # restore
  fi

  local ast="ok"; [ "$status" -eq 124 ] && ast="timeout"
  echo "$arm,$trial,$marks,$ignores,$broken,$names,$catch,${turns:-NA},$ast" >> "$RESULTS"
  echo "  [$arm/#$trial] marks=$marks ignores=$ignores broken=$broken names=$names catch=$catch turns=${turns:-NA}"
  cd "$ROOT" || return
}

echo "model=$MODEL trials=$TRIALS"
for arm in vanilla gated; do
  for trial in $(seq 1 "$TRIALS"); do
    run_one "$arm" "$trial"
    sleep 5 # avoid rate-limit bursts from back-to-back agent runs
  done
done

echo
echo "=== SUMMARY-REFS (model=$MODEL, trials=$TRIALS) ==="
for arm in vanilla gated; do
  awk -F, -v a="$arm" 'NR>1 && $1==a {
      n++; m+=$3; ig+=$4; br+=$5;
      if ($6+0>0) named++;
      if ($7=="yes") caught++;
      if ($8 ~ /^[0-9]+$/){ t+=$8; tn++ }
    }
    END{ printf "  %-8s avg_marks=%.1f avg_ignores=%.1f broken=%d named=%d/%d  CATCH_RENAME=%d/%d  avg_turns=%.1f\n",
        a, m/n, ig/n, br+0, named+0, n, caught+0, n, (tn?t/tn:0) }' "$RESULTS"
done
