#!/usr/bin/env bash
# Smoke-test the PUBLISHED package the way a first reader reaches it: from the
# registry, on a repo that is not ours, with no node_modules to fall back on.
#
# WHY THIS EXISTS AND WHY IT IS NOT A UNIT TEST. Every gate in ci.yml runs the
# CLI out of `dist/` (the Action step pins `version: local`), so the whole
# suite can be green while the artifact users actually download is broken —
# a file missing from package.json `files[]`, a subpath not exported, a
# resolve hook that only works when vigiles is a local dependency. That class
# has bitten this repo before (#178, agent-plugins-manifest.test.ts).
#
# THE FIXTURE IS A PYTHON REPO ON PURPOSE: pyproject.toml with ruff configured,
# no package.json at all. That is the audience the README invites ("Non-JS
# repo? … Ruff") and the one whose path has no npm safety net.
#
# ASSERTS THE OUTPUT, NEVER THE EXIT CODE ALONE — an installer that reports
# success having done nothing is the exact failure this guards. Each check
# names what it read.
#
# Usage:  bash tools/smoke-published.sh [version]      # default: latest
# Run when: before announcing a release, after publishing, on the version you
# are about to point people at.
set -uo pipefail

VERSION="${1:-latest}"
PKG="vigiles@${VERSION}"
WORK="$(mktemp -d)"
FAILED=0

note() { printf '\n\033[1m%s\033[0m\n' "$*"; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILED=1; }

command -v ruff >/dev/null 2>&1 || {
  printf '\033[33m⊘ SKIPPED\033[0m — ruff is not on PATH, and the linter check below is\n'
  printf '  the point of this smoke test. Install ruff and re-run; exiting 77.\n'
  exit 77
}

note "smoke: ${PKG}  (ruff $(ruff --version | awk '{print $2}'), $(node --version))"
echo "  workdir: ${WORK}"

mkdir -p "${WORK}/repo/.claude/skills/demo"
cd "${WORK}/repo"
cat > pyproject.toml <<'EOF'
[project]
name = "demo"
version = "0.1.0"

[tool.ruff.lint]
select = ["E", "F"]
EOF
printf 'def f(x):\n    return x\n' > app.py
printf '# Agent rules\n\nUse ruff.\n' > AGENTS.md
printf -- '---\nname: demo\ndescription: Do a demo thing when asked to demo\n---\n\nRun the demo.\n' \
  > .claude/skills/demo/SKILL.md

run() { # run <logfile> <args...>  → sets RC, never pipes (a pipe reports the filter's status)
  local log="$1"; shift
  npx -y "${PKG}" "$@" > "${log}" 2>&1
  RC=$?
}

note "1. audit — the first command in the README"
run "${WORK}/audit.log" audit .
[ "${RC}" -eq 0 ] && pass "exit 0" || fail "exit ${RC} (expected 0) — see ${WORK}/audit.log"
grep -q "Harness health" "${WORK}/audit.log" \
  && pass "printed a grade" || fail "no 'Harness health' line — the report did not render"

note "2. lint — the cross-referencing engine on a real ruff config"
run "${WORK}/lint.log" lint .
if grep -q "No linters detected" "${WORK}/lint.log"; then
  fail "reported 'No linters detected' on a repo with ruff configured in pyproject.toml"
  fail "  ⇒ enforce(\"ruff/…\") cannot verify enabled-state here; the flagship check is absent"
else
  grep -qi "ruff" "${WORK}/lint.log" \
    && pass "detected ruff" || fail "ruff not named in the output — see ${WORK}/lint.log"
fi

note "3. init then compile — the first three commands a new user types"
run "${WORK}/init.log" init --yes
[ "${RC}" -eq 0 ] && pass "init exit 0" || fail "init exit ${RC} — see ${WORK}/init.log"
ls ./*.spec.ts >/dev/null 2>&1 \
  && pass "scaffolded $(ls ./*.spec.ts | wc -l | tr -d ' ') spec(s)" \
  || fail "init wrote no .spec.ts — nothing for compile to do"

run "${WORK}/compile.log" compile
if [ "${RC}" -ne 0 ]; then
  fail "compile exit ${RC}"
  grep -qE "at (Object\.)?(getPackageJSONURL|packageResolve|moduleResolve)" "${WORK}/compile.log" \
    && fail "  ⇒ raw Node module-resolution stack — the embarrassing-failure case, see ${WORK}/compile.log"
else
  pass "compile exit 0"
  grep -q "vigiles:sha256:" AGENTS.md 2>/dev/null \
    && pass "stamped AGENTS.md" || fail "compile exited 0 but stamped nothing — a silent no-op"
fi

note "result"
if [ "${FAILED}" -eq 0 ]; then
  printf '  \033[32mall checks passed\033[0m for %s\n' "${PKG}"
  printf '  logs: %s\n' "${WORK}"
  exit 0
fi
printf '  \033[31msmoke FAILED\033[0m for %s — do not announce this version\n' "${PKG}"
printf '  logs: %s\n' "${WORK}"
exit 1
