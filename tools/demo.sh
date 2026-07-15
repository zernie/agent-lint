#!/usr/bin/env bash
# vigiles demo — a self-contained, zero-dependency script for recording an
# asciinema cast / GIF of the Lint layer catching stale references.
#
#   asciinema rec --command "bash tools/demo.sh" vigiles.cast
#   # then: agg vigiles.cast vigiles.gif   (or upload the cast to asciinema.org)
#
# It builds a throwaway repo whose CLAUDE.md points at a file that moved and a
# script that was renamed, then runs `vigiles lint` to show the ✗/✓. Uses inline
# marks so there's nothing to install. Override the CLI with VIGILES=... (defaults
# to `npx --yes vigiles`); set VIGILES="node dist/cli.js" to run against a build.
set -euo pipefail

VIGILES="${VIGILES:-npx --yes vigiles}"
demo="$(mktemp -d)"
trap 'rm -rf "$demo"' EXIT
cd "$demo"

cat > package.json <<'JSON'
{ "name": "my-app", "scripts": { "build": "tsc -b", "test": "vitest", "check:types": "tsc --noEmit" } }
JSON

cat > CLAUDE.md <<'MD'
<!-- vigiles-disable require-instructions-spec -->

# CLAUDE.md

## Key files

The auth entry point is at <!-- vigiles:file src/auth/login.ts --> `src/auth/login.ts`.
The build config lives in <!-- vigiles:file package.json --> `package.json`.

## Commands

Typecheck before pushing: <!-- vigiles:cmd "npm run check" --> `npm run check`.
MD

# (the file the CLAUDE.md claims exists never got created — it "moved")

echo "$ vigiles lint CLAUDE.md"
echo
$VIGILES lint CLAUDE.md || true
