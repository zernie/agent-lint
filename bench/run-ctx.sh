#!/usr/bin/env bash
#
# vigiles benchmark #3 — does context load reveal the gate's value?
#
# Benchmarks #1/#2 came out flat/negative because a fresh, short agent
# self-verifies. The hypothesis here: agents degrade under context load
# (context rot / lost-in-the-middle), and THAT is when a deterministic result
# gate stops being a no-op. We prepend N tokens of realistic filler (the
# project's own docs) before the task and sweep the load.
#
#   vanilla — no gate. Hypothesis: end-state pass-rate decays as context grows.
#   gated   — Stop-hook result gate (`npm test`). Green by construction.
#
# The delta (gated − vanilla) at each level is the gate's value as a function of
# how degraded the agent is. Task is a validated trap (naive solution → red).
#
# Usage: bash bench/run-ctx.sh [model] [trials] [task] [levels_in_ktokens...]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
MODEL="${1:-haiku}"
TRIALS="${2:-5}"
TASK="${3:-cart-discount}"
shift || true; shift || true; shift || true
LEVELS=("${@:-0 30 90}")
# shellcheck disable=SC2206
LEVELS=(${LEVELS[*]})

CORPUS="$ROOT/bench/.corpus.txt"
# Reproducible filler: the project's own docs/research (dense technical prose).
cat "$ROOT"/docs/*.md "$ROOT"/docs/rules/*.md "$ROOT"/research/*.md \
    "$ROOT"/skills/linter-docs/*.md > "$CORPUS" 2>/dev/null
WORK="$ROOT/bench/.work-ctx"
RESULTS="$ROOT/bench/results-ctx.csv"
rm -rf "$WORK"; mkdir -p "$WORK"
echo "task,ktokens,arm,trial,end_state,agent_status,turns" > "$RESULTS"

run_one() {
  local kt="$1" arm="$2" trial="$3"
  local wd="$WORK/${kt}__${arm}__${trial}"
  rm -rf "$wd"; cp -r "$ROOT/bench/tasks/$TASK" "$wd"
  cd "$wd" || return

  # Build the prompt: filler (background reading) + the real task.
  local promptfile="$wd/.prompt"
  if [ "$kt" -gt 0 ]; then
    head -c $((kt * 4000)) "$CORPUS" > "$promptfile"
    printf '\n\n===== END OF BACKGROUND READING =====\n\n' >> "$promptfile"
  else
    : > "$promptfile"
  fi
  printf 'Complete the task described in ./SKILL.md. Implement the change, then stop.\n' >> "$promptfile"

  local settings_flag=()
  if [ "$arm" = "gated" ]; then
    cat > settings.json <<EOF
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node $CLI skill-hook" } ] } ] } }
EOF
    node "$CLI" skill-start ./SKILL.md >/dev/null 2>&1
    settings_flag=(--settings ./settings.json)
  fi

  local out status
  out=$(timeout 360 claude -p "$(cat "$promptfile")" \
        --model "$MODEL" \
        --permission-mode acceptEdits \
        --allowedTools Read Edit Write Bash \
        --output-format json \
        "${settings_flag[@]}" </dev/null 2>/dev/null)
  status=$?
  local turns; turns=$(printf '%s' "$out" | jq -r '.num_turns // empty' 2>/dev/null)
  npm test --silent >/dev/null 2>&1; local end=$?
  local es="pass"; [ "$end" -ne 0 ] && es="fail"
  local ast="ok"; [ "$status" -eq 124 ] && ast="timeout"; [ "$status" -ne 0 ] && [ "$status" -ne 124 ] && ast="err$status"

  echo "$TASK,$kt,$arm,$trial,$es,$ast,${turns:-NA}" >> "$RESULTS"
  echo "  [ctx=${kt}k/$arm/#$trial] end=$es agent=$ast turns=${turns:-NA}"
  cd "$ROOT" || return
}

echo "model=$MODEL task=$TASK trials=$TRIALS levels(ktok)=${LEVELS[*]}"
for kt in "${LEVELS[@]}"; do
  for arm in vanilla gated; do
    for trial in $(seq 1 "$TRIALS"); do
      run_one "$kt" "$arm" "$trial"
    done
  done
done

echo
echo "=== SUMMARY-CTX (model=$MODEL, task=$TASK, trials=$TRIALS) ==="
printf '%-8s %-9s %s\n' "ktokens" "arm" "end-state green"
for kt in "${LEVELS[@]}"; do
  for arm in vanilla gated; do
    tot=$(awk -F, -v k="$kt" -v a="$arm" 'NR>1 && $2==k && $3==a {n++} END{print n+0}' "$RESULTS")
    pass=$(awk -F, -v k="$kt" -v a="$arm" 'NR>1 && $2==k && $3==a && $5=="pass" {n++} END{print n+0}' "$RESULTS")
    printf '%-8s %-9s %s/%s\n' "$kt" "$arm" "$pass" "$tot"
  done
done
