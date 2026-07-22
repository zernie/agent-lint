---
name: dogfood-cli
description: Hunt for real bugs in the vigiles CLI/codebase with a parallel expert fan-out, then FIX them directly — source-trace each defect to file:line, add a regression test, commit per theme. Use when asked to dogfood vigiles, find/fix bugs across the CLI the source-traced way, or fan out agents to audit the tool on itself.
---

# Dogfood the vigiles CLI (expert find + fix fan-out)

The repeatable method for finding real bugs in vigiles by running the tool on
itself and on real plugins, then FIXING them — not filing them. This is how the
2026-07 batch found and fixed 14 source-traced bugs.

## When to use

- "Dogfood the CLI", "find more bugs the source-traced way", "fan out agents to
  audit vigiles on itself", "hunt for false positives in audit/lint".
- NOT for a single known bug (just fix it) and NOT for shipped consumer features
  (this is a contributor-only dev process; `.claude/` is not published).

## The loop

```
fan out (parallel experts) → synthesize + VERIFY each finding → fix directly
   → regression test → build → targeted test → commit per theme → FULL SUITE → push
```

### 1. Fan out over DISTINCT surfaces

Spawn several agents (Sonnet — cheap parallel reads/traces; no synthesis needed
per agent), each owning ONE surface so they don't overlap. The surface map that
has paid off:

- **compile / eject** — round-trip correctness, frontmatter/data loss, integrity.
- **audit / lint false-positives** — a real plugin must stay CLEAN (don't cry
  wolf); phantom paths; glob/quote tokens misread; comment-only matches.
- **init / scaffold edge cases** — no `package.json`, config-driven `harness`,
  malformed frontmatter, `--target`, the scaffolded CI workflow, `--test`/`--lint`.
- **config parse-don't-validate** — `.vigilesrc.json` severities (`"off"`/0/1/2),
  string-or-array keys, unknown values.
- **CLI error UX** — an unknown flag/harness must print a clean message + exit 2,
  never a raw Node stack trace.
- **cross-harness (CC + Codex) + browser/disk parity** — `scanFiles` must match
  `scanPlugin` byte-for-byte; a Codex-shaped repo must not be scanned as CC.

Tell each agent: **SOURCE-TRACE every bug to `file:line` + a proposed fix.** A
finding without a trace is a lead, not a bug.

### 2. Synthesize + VERIFY yourself

Agents over-report. Before touching anything, reproduce each finding yourself
(run the real built CLI on a tmp fixture or a vendored `test/dogfood/*` plugin).
Discard what doesn't repro. Confirm the exact `file:line`.

### 3. FIX directly — don't file

A deterministic, source-traced bug needs **no issue**: fix it. File an issue ONLY
when the fix is genuinely **ambiguous** (several valid interpretations, or an
architecturally significant change the founder should weigh in on). "Fix, not
file" is the founder's standing call for this loop.

Per fix:

- **Repro → fix → regression test → `npm run build` → targeted `vitest` → commit.**
- **One theme per commit.** Conventional Commit subject; end the body with the
  `Co-Authored-By: Claude …` trailer. NEVER a session URL or a raw model id
  (public repo — see the `no-session-links` / model-identity rules).
- The fix must be **high-precision** — a false-positive fix must not silently
  UNDER-detect (don't trade crying wolf for missing the real thing).
- Honor the architecture: a shared detector has ONE home (`one-detector-no-drift`);
  `core ⊄ adapter`; no CC literal in `src/core/**` or the agnostic detectors.

## Hard-won discipline (the lessons)

- **Serialize/merge fixes that touch SHARED files** (`src/cli.ts`,
  `src/scan-core.ts`). Parallel edits to the same file conflict — do those
  sequentially, or give each agent its own git worktree (`isolation: "worktree"`).
- **RUN THE FULL SUITE before declaring done.** A strict assertion in an
  _unrelated_ test file can only surface in the whole run — the I2 fix changed an
  install command and a strict regex in a _different_ e2e file broke; per-file
  runs were all green, the full `vitest run` caught it.
- **Rebuild after every source edit** — the e2e tests run `dist/cli.js`, so a
  stale `dist/` silently tests the old code.
- **Watch the parity gate.** Any change to a scan detector must keep
  `scanFiles ↔ scanPlugin` byte-identical (`src/scan-files.test.ts`); if the disk
  side gains a field, the browser side needs it too.
- **Prettier + `fmt:check` before commit** — markdown code spans need surrounding
  spaces; CI runs `fmt:check`.
- **Coverage gate is an allowlist** (`vitest.config.mjs` `coverage.include`) — a
  new file under it needs 100%; scan/cli files are NOT in it today.

## NOT this skill

The **blind-agent onboarding dogfood** (a fresh agent runs `npx vigiles init` on
a real repo across an OS matrix in GHA + a subscription eval) is a SEPARATE,
roadmapped e2e — do not fold its OS-matrix here. This skill is the in-repo
find+fix loop; that one measures the cold onboarding experience end-to-end.
