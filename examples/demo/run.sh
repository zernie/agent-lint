#!/usr/bin/env bash
# vigiles 60-second demo — run from anywhere:  bash examples/harness/../demo/run.sh
# or, from the repo root:  npm run demo
set -uo pipefail
cd "$(dirname "$0")"
if [ ! -f ../../dist/cli.js ]; then
  echo "Building vigiles…"
  (cd ../.. && npm run build >/dev/null)
fi
echo "INSTRUCTIONS.md reads fine — but two of its references lie."
echo
echo "\$ vigiles audit INSTRUCTIONS.md"
echo
node ../../dist/cli.js audit INSTRUCTIONS.md
