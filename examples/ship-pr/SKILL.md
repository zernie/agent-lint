<!-- vigiles:sha256:4c614a2e08f000bb compiled from examples/ship-pr/SKILL.md.spec.ts -->

---

name: ship-pr
description: Run the project checks and open a pull request once they pass
argument-hint: <branch> [<title>]

---

## Arguments

- `$1` **branch** — the branch to open the PR from
- `$2` **title** _(optional)_ — PR title

## Steps

### Step 1

Run the linter and fix any issues it reports.

**Gate** — run `npm run lint`; do not proceed until it passes.

<!-- vigiles:gate "npm run lint" -->

### Step 2

Run the test suite. Fix failures and re-run until it is green.

**Gate** — run `npm test` (retry up to 3×); do not proceed until it passes.

<!-- vigiles:gate "npm test" retry:3 -->

### Step 3

Open the pull request from `$1` with title `$2` (if provided).

## Result

This skill is complete when `npm test` passes.

<!-- vigiles:result "npm test" -->
