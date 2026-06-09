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

echo "Refreshed:"
du -sh "$VENDOR"/*
echo "Now update the vendor paths in examples/harness/real-*.harness.mjs if the"
echo "short SHAs changed, then: npm run build && node examples/harness/real-*.harness.mjs"
