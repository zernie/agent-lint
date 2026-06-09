#!/usr/bin/env bash
# PreToolUse(Bash) policy gate: block destructive commands. Exit 2 blocks the
# tool call and feeds the message back to the agent; a marker file records that
# the gate fired so a test can assert it.
CMD=$(cat | jq -r '.tool_input.command // empty')
case "$CMD" in
*"rm -rf"*)
  touch "$CLAUDE_PROJECT_DIR/BLOCKED"
  echo "blocked: destructive command (rm -rf) is not allowed" >&2
  exit 2
  ;;
esac
exit 0
