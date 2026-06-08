#!/usr/bin/env bash
# SessionStart hook: prepare the workspace before the agent runs.
# Hooks receive $CLAUDE_PROJECT_DIR pointing at the working dir.
echo ready > "$CLAUDE_PROJECT_DIR/SETUP_DONE"
