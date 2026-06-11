#!/usr/bin/env bash
#
# E2E: drive the REAL `claude` CLI against a scripted mock Anthropic endpoint
# (ANTHROPIC_BASE_URL) and assert vigiles' skill runtime / Stop-hook behavior in
# a live session. claude is spawned as a direct child of this shell so it
# inherits auth (managed OAuth fd here, ANTHROPIC_API_KEY in normal CI).
#
# Requires: `claude` on PATH, node, curl. Skips cleanly if claude is absent.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
PORT="${E2E_PORT:-8799}"
BASE="http://127.0.0.1:$PORT"
PASS=0; FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; stop_mock 2>/dev/null' EXIT

command -v claude >/dev/null || { echo "SKIP: claude not on PATH"; exit 0; }
( cd "$ROOT" && npm run build >/dev/null 2>&1 ) || { echo "build failed"; exit 1; }

start_mock() { # $1 = script json file
  : > "$TMP/mock.log"
  MOCK_PORT="$PORT" MOCK_SCRIPT="$1" MOCK_LOG="$TMP/mock.log" \
    node "$DIR/mock-anthropic.mjs" 2>/dev/null &
  MOCK_PID=$!
  for _ in $(seq 1 20); do
    curl -fs "$BASE/" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  echo "mock failed to start"; return 1
}
stop_mock() { [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null; MOCK_PID=""; }

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# ---------------------------------------------------------------------------
echo "[1] simple: claude returns the scripted text"
echo '[{"text":"E2E_TEXT_OK_alpha"}]' > "$TMP/s1.json"
start_mock "$TMP/s1.json"
OUT=$(cd "$ROOT" && ANTHROPIC_BASE_URL="$BASE" timeout 60 \
  claude -p "say the magic word" --output-format json --model claude-sonnet-4-5 </dev/null 2>/dev/null)
stop_mock
if echo "$OUT" | grep -q "E2E_TEXT_OK_alpha"; then ok "scripted text returned"; else bad "scripted text returned (got: $(echo "$OUT" | head -c 120))"; fi

# ---------------------------------------------------------------------------
echo "[2] tool-use loop: claude runs a tool, sends tool_result, gets final answer"
cat > "$TMP/s2.json" <<'JSON'
[ { "tool": "Bash", "input": { "command": "echo TOOLRAN" } },
  { "text": "E2E_TOOL_OK_beta" } ]
JSON
start_mock "$TMP/s2.json"
OUT=$(cd "$ROOT" && ANTHROPIC_BASE_URL="$BASE" timeout 60 \
  claude -p "run the bash tool" --output-format json --model claude-sonnet-4-5 \
  --allowedTools Bash </dev/null 2>/dev/null)
stop_mock
if echo "$OUT" | grep -q "E2E_TOOL_OK_beta"; then ok "final answer after tool turn"; else bad "final answer after tool turn (got: $(echo "$OUT" | head -c 120))"; fi
if grep -q "toolresult=true" "$TMP/mock.log"; then ok "mock saw a tool_result follow-up (loop closed)"; else bad "mock saw a tool_result follow-up"; fi

# ---------------------------------------------------------------------------
echo "[3] Stop-hook enforcement: result gate blocks completion until it passes"
setup_proj() { # $1 = result gate command (true=pass, false=block)
  PROJ="$TMP/proj"; rm -rf "$PROJ"
  mkdir -p "$PROJ/.claude" "$PROJ/.vigiles" "$PROJ/skills/demo"
  printf '## Result\n<!-- vigiles:result "%s" -->\n' "$1" > "$PROJ/skills/demo/SKILL.md"
  echo '{"skill":"skills/demo/SKILL.md"}' > "$PROJ/.vigiles/active-skill.json"
  printf '{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node %s/dist/cli.js skill-hook" } ] } ] } }\n' \
    "$ROOT" > "$PROJ/.claude/settings.json"
}
run_proj() { # the skill is "active"; claude tries to finish → our Stop hook runs the result gate
  ( cd "$PROJ" && ANTHROPIC_BASE_URL="$BASE" timeout 90 \
    claude -p "do the demo skill" --output-format json --model claude-sonnet-4-5 --max-turns 4 </dev/null 2>/dev/null )
}
num_turns() { echo "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).num_turns??-1)}catch{console.log(-1)}})'; }

echo '[{"text":"done"}]' > "$TMP/s3.json"
start_mock "$TMP/s3.json"
setup_proj true;  TP=$(num_turns "$(run_proj)")
setup_proj false; TF=$(num_turns "$(run_proj)")
stop_mock
echo "  turns: passing-gate=$TP  failing-gate=$TF"
if [ "$TP" = "1" ]; then ok "passing result gate → claude stops (1 turn)"; else bad "passing gate should stop in 1 turn (got $TP)"; fi
if [ "$TF" -gt "$TP" ] 2>/dev/null; then ok "failing result gate → Stop blocked, claude forced to continue ($TF turns)"; else bad "failing gate should block (turns=$TF)"; fi

# ---------------------------------------------------------------------------
# Note: the subagent PreToolUse tool-contract rail (`vigiles agent-hook`) is a
# *tool-event* hook. Driving a tool call deterministically needs the model to
# actually invoke the tool, which is flaky against a scripted mock — so the rail
# is proven at the cheap, deterministic unit tier instead: a real synthesized
# PreToolUse event piped straight to the built CLI hook process. See the
# "agent-hook (CLI): the real PreToolUse rail process" tests in
# src/agent-runtime.test.ts (runHook against `dist/cli.js agent-hook`).

# ---------------------------------------------------------------------------
echo ""
echo "E2E: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
