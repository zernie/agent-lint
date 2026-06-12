#!/usr/bin/env bash
# Refresh the vendored third-party plugin snapshots used by the dogfood tests
# (examples/harness/real-*.harness.mjs). HUMAN-RUN, never in CI — vendoring is a
# deliberate, pinned act so the dogfood stays deterministic and offline.
#
# Usage:  bash tools/refresh-vendor.sh
#
# To bump a plugin: change its SHA below, run this, then update the matching
# `./vendor/<name>@<short>` path in the real-*.harness.mjs test and commit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/examples/harness/vendor"
TODAY="$(date +%Y-%m-%d)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- pinned upstreams -------------------------------------------------------
SUPERPOWERS_REPO="https://github.com/obra/superpowers"
SUPERPOWERS_SHA="6fd4507659784c351abbd2bc264c7162cfd386dc"

WSHOBSON_REPO="https://github.com/wshobson/agents"
WSHOBSON_SHA="cf6059d030bf4fe96623ae2e596d2f31e35fedc0"
WSHOBSON_SUBPLUGIN="plugins/accessibility-compliance"

OMC_REPO="https://github.com/Yeachan-Heo/oh-my-claudecode"
OMC_SHA="deee3a446dadc9bfea31cdc8b19b00b16718082e"

fetch() { # repo sha -> $TMP/<name>
  local repo="$1" sha="$2" name
  name="$(basename "$repo")"
  git clone --quiet "$repo" "$TMP/$name"
  git -C "$TMP/$name" checkout --quiet "$sha"
  echo "$TMP/$name"
}

rm -rf "$VENDOR"
mkdir -p "$VENDOR"

# --- obra/superpowers: hooks/hooks.json convention + 2 skills ---------------
SP="$(fetch "$SUPERPOWERS_REPO" "$SUPERPOWERS_SHA")"
SP_DIR="$VENDOR/superpowers@${SUPERPOWERS_SHA:0:7}"
mkdir -p "$SP_DIR/.claude-plugin" "$SP_DIR/hooks" "$SP_DIR/skills"
cp "$SP/LICENSE" "$SP_DIR/LICENSE"
cp "$SP/.claude-plugin/plugin.json" "$SP_DIR/.claude-plugin/plugin.json"
cp "$SP/hooks/hooks.json" "$SP/hooks/run-hook.cmd" "$SP/hooks/session-start" "$SP_DIR/hooks/"
for s in test-driven-development systematic-debugging; do
  cp -r "$SP/skills/$s" "$SP_DIR/skills/$s"
done
cat > "$SP_DIR/SOURCE" <<EOF
Vendored snapshot — DO NOT EDIT BY HAND.

Upstream:  $SUPERPOWERS_REPO
Commit:    $SUPERPOWERS_SHA
Fetched:   $TODAY
License:   MIT (see ./LICENSE) — © Jesse Vincent

Pinned, offline fixture for dogfooding vigiles' plugin loader against a real
Claude Code plugin (hooks/hooks.json convention). The SessionStart hook is NOT
executed by the dogfood — only parsed. Refresh: tools/refresh-vendor.sh.
EOF

# --- wshobson/agents: one sub-plugin (subagents + commands + skills, no hooks)
WS="$(fetch "$WSHOBSON_REPO" "$WSHOBSON_SHA")"
WS_DIR="$VENDOR/wshobson-accessibility@${WSHOBSON_SHA:0:7}"
mkdir -p "$WS_DIR"
cp "$WS/LICENSE" "$WS_DIR/LICENSE"
cp -r "$WS/$WSHOBSON_SUBPLUGIN/." "$WS_DIR/"
rm -rf "$WS_DIR/.codex-plugin" # keep only the .claude-plugin surface
cat > "$WS_DIR/SOURCE" <<EOF
Vendored snapshot — DO NOT EDIT BY HAND.

Upstream:  $WSHOBSON_REPO
Commit:    $WSHOBSON_SHA
Fetched:   $TODAY
License:   MIT (see ./LICENSE) — © Seth Hobson
Sub-path:  $WSHOBSON_SUBPLUGIN

Pinned, offline fixture for the no-hooks marketplace shape (subagents + slash
commands + skills). Refresh: tools/refresh-vendor.sh.
EOF

# --- Yeachan-Heo/oh-my-claudecode: the ALL-SURFACES example -----------------
# (hooks + skills + agents + MCP in one plugin) — anchors docs/harness-testing.md.
# We slice it hard (upstream is ~117 MB): only the keyword-detector hook chain
# (which runs cleanly in isolation), 2 skills, 2 agents, the .mcp.json, and
# TRIMMED manifest + hooks.json (so the loader sees no spurious dangling refs).
OMC="$(fetch "$OMC_REPO" "$OMC_SHA")"
OMC_DIR="$VENDOR/oh-my-claudecode@${OMC_SHA:0:7}"
mkdir -p "$OMC_DIR/.claude-plugin" "$OMC_DIR/hooks" "$OMC_DIR/scripts/lib" \
  "$OMC_DIR/skills" "$OMC_DIR/agents"
cp "$OMC/LICENSE" "$OMC_DIR/LICENSE"
cp "$OMC/.mcp.json" "$OMC_DIR/.mcp.json"
cp "$OMC/scripts/run.cjs" "$OMC/scripts/keyword-detector.mjs" \
  "$OMC/scripts/session-start.mjs" "$OMC_DIR/scripts/"
cp "$OMC/scripts/lib/atomic-write.mjs" "$OMC/scripts/lib/config-dir.mjs" \
  "$OMC/scripts/lib/state-root.mjs" "$OMC/scripts/lib/stdin.mjs" \
  "$OMC/scripts/lib/model-routing-override-message.mjs" "$OMC_DIR/scripts/lib/"
cp -r "$OMC/skills/ask" "$OMC/skills/verify" "$OMC_DIR/skills/"
# minimal package.json: session-start reads package.json#version to gate its
# npm-registry update check.
printf '{\n  "name": "oh-my-claudecode",\n  "version": "4.14.6"\n}\n' > "$OMC_DIR/package.json"
cp "$OMC/agents/code-reviewer.md" "$OMC/agents/critic.md" "$OMC_DIR/agents/"
cat > "$OMC_DIR/.claude-plugin/plugin.json" <<'JSON'
{
  "name": "oh-my-claudecode",
  "version": "4.14.6",
  "description": "Multi-agent orchestration system for Claude Code",
  "author": { "name": "oh-my-claudecode contributors" },
  "repository": "https://github.com/Yeachan-Heo/oh-my-claudecode",
  "homepage": "https://github.com/Yeachan-Heo/oh-my-claudecode",
  "license": "MIT",
  "keywords": [
    "claude-code",
    "plugin",
    "multi-agent",
    "orchestration",
    "automation"
  ],
  "skills": ["./skills/ask/", "./skills/verify/"],
  "mcpServers": "./.mcp.json"
}
JSON
cat > "$OMC_DIR/hooks/hooks.json" <<'JSON'
{
  "description": "OMC orchestration hooks (vendored slice — keyword-detector + session-start update check)",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/run.cjs \"$CLAUDE_PLUGIN_ROOT\"/scripts/session-start.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/run.cjs \"$CLAUDE_PLUGIN_ROOT\"/scripts/keyword-detector.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
JSON
cat > "$OMC_DIR/SOURCE" <<EOF
Vendored snapshot — DO NOT EDIT BY HAND.

Upstream:  $OMC_REPO
Commit:    $OMC_SHA
Fetched:   $TODAY
License:   MIT (see ./LICENSE) — © 2025 Yeachan Heo

The all-surfaces example for docs/harness-testing.md: one popular plugin that
ships hooks + skills + agents + an MCP server. Sliced hard (upstream is large):
only the keyword-detector hook chain (the one that runs cleanly in isolation),
2 skills, 2 agents, the .mcp.json, and a TRIMMED manifest + hooks.json so the
loader sees a coherent plugin with no spurious dangling refs. Refresh:
tools/refresh-vendor.sh. (Keep this in sync with the committed SOURCE prose.)
EOF

echo "Refreshed:"
du -sh "$VENDOR"/*
echo "Now update the vendor paths in examples/harness/real-*.harness.mjs if the"
echo "short SHAs changed, then: npm run build && node examples/harness/real-*.harness.mjs"
