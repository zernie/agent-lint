#!/usr/bin/env bash
#
# vigiles benchmark — gated skill (Stop-hook result gate) vs vanilla skill.
#
# Both arms get an identical task and an identical SKILL.md. The ONLY difference
# is the gated arm wires a Stop hook (`vigiles skill-hook`) that runs the skill's
# result gate (`npm test`) and blocks "done" until it passes. The metric is the
# END STATE: after the agent stops, does `npm test` actually pass?
#
# Tasks are traps: the obvious/naive solution leaves the suite red, so the gate
# has something to catch. Each task fixture is validated (naive→red, fix→green).
#
# Usage: bash bench/run.sh [model] [trials] [timeout_s]
#   model    claude model alias (default: haiku)
#   trials   trials per task per arm (default: 3)
#   timeout  per-run wall-clock cap in seconds (default: 240)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
MODEL="${1:-haiku}"
TRIALS="${2:-3}"
TIMEOUT="${3:-240}"
TASKS_DIR="$ROOT/bench/tasks"
WORK="$ROOT/bench/.work"
RESULTS="$ROOT/bench/results.csv"

rm -rf "$WORK"; mkdir -p "$WORK"
echo "task,arm,trial,end_state,agent_status,turns,cost_usd" > "$RESULTS"

run_one() {
  local task="$1" arm="$2" trial="$3"
  local wd="$WORK/${task}__${arm}__${trial}"
  rm -rf "$wd"; cp -r "$TASKS_DIR/$task" "$wd"
  cd "$wd" || return

  local settings_flag=()
  if [ "$arm" = "gated" ]; then
    cat > settings.json <<EOF
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node $CLI skill-hook" } ] } ] } }
EOF
    node "$CLI" skill-start ./SKILL.md >/dev/null 2>&1
    settings_flag=(--settings ./settings.json)
  fi

  local prompt="Complete the task described in ./SKILL.md. Implement the change, then stop."
  local out status
  out=$(timeout "$TIMEOUT" claude -p "$prompt" \
        --model "$MODEL" \
        --permission-mode acceptEdits \
        --allowedTools Read Edit Write Bash \
        --output-format json \
        "${settings_flag[@]}" </dev/null 2>/dev/null)
  status=$?

  local turns cost
  turns=$(printf '%s' "$out" | jq -r '.num_turns // empty' 2>/dev/null)
  cost=$(printf '%s' "$out" | jq -r '.total_cost_usd // empty' 2>/dev/null)

  # Measure the end state independently of the agent's own claim.
  npm test --silent >/dev/null 2>&1
  local end=$?
  local end_state="pass"; [ "$end" -ne 0 ] && end_state="fail"
  local agent_status="ok"
  [ "$status" -eq 124 ] && agent_status="timeout"
  [ "$status" -ne 0 ] && [ "$status" -ne 124 ] && agent_status="err$status"

  echo "$task,$arm,$trial,$end_state,$agent_status,${turns:-NA},${cost:-NA}" >> "$RESULTS"
  echo "  [$task/$arm/#$trial] end=$end_state agent=$agent_status turns=${turns:-NA}"
  cd "$ROOT" || return
}

echo "model=$MODEL trials=$TRIALS timeout=${TIMEOUT}s"
for task in $(ls "$TASKS_DIR"); do
  for arm in vanilla gated; do
    for trial in $(seq 1 "$TRIALS"); do
      run_one "$task" "$arm" "$trial"
    done
  done
done

echo
echo "=== SUMMARY (model=$MODEL, trials=$TRIALS) ==="
printf '%-10s %-8s %s\n' "arm" "green" "end-state pass-rate"
for arm in vanilla gated; do
  total=$(awk -F, -v a="$arm" 'NR>1 && $2==a {n++} END{print n+0}' "$RESULTS")
  pass=$(awk -F, -v a="$arm" 'NR>1 && $2==a && $4=="pass" {n++} END{print n+0}' "$RESULTS")
  printf '%-10s %-8s %s/%s\n' "$arm" "$pass/$total" "$pass" "$total"
done
echo
echo "per-task breakdown:"
awk -F, 'NR>1 {key=$1" "$2; tot[key]++; if($4=="pass") ok[key]++}
  END{for(k in tot) printf "  %-28s %d/%d\n", k, ok[k]+0, tot[k]}' "$RESULTS" | sort
