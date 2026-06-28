# OSS audit render + issue-hunt findings (2026-06-28)

> What `audit` actually catches in the wild, from rendering the new report on real
> plugins and hunting ~170 OSS plugins (official + community) for graded issues.
> Companion to `audit-lighthouse-design.md` + the OSS FP sweep in this session's
> HANDOFF. Screenshots were produced via headless Chromium into the ephemeral
> scratchpad (not committed) — this doc is the durable record.

## Method

- Rendered `vigiles-report.html` (the new React report — Flow card + adopt buttons)
  on real plugins via the bundled Chromium (`/opt/pw-browsers/chromium-1194`,
  `--headless --screenshot --virtual-time-budget`).
- Hunted for GRADED issues (excludes advisory inherit-all/untested) across:
  official `anthropics/claude-plugins-official` (39 plugins), plus community:
  wshobson/agents (85), ruvnet/claude-flow (38 + its 134-skill `.agents`),
  obra/superpowers, disler hooks repos, gmickel/flow-next, davila7/claude-code-
  templates, anthropics/claude-code. Fetched via codeload tarballs.

## Headline findings

1. **Official plugins are CLEAN — 0 of 39 have a graded issue.** The only findings
   are ADVISORY inherit-all (pr-review-toolkit 6, agent-sdk-dev 2, code-simplifier
   1). So an official "many issues" plugin **does not exist** — audit correctly
   finds nothing graded on them. (This is the "doesn't cry wolf on official" story,
   and why the README dropped the official-plugin proofs. Verified definitively here.)

2. **Reference/truthfulness issues are RARE even in community OSS.** Across ~170
   plugins the only GRADED catches were THREE:
   - **ruvnet/claude-flow `.agents` — Triggering 0 / F**: 45 genuinely near-identical
     skill descriptions (`agent-coder`↔`agent-tester` 83%, `agent-queen-coordinator`
     ↔`agent-v3-queen-coordinator` 86%) → the selector can't disambiguate, wrong one
     fires. The richest "way more issues" demo (popular repo). 134 untested.
   - **disler/claude-code-hooks-mastery — Structure 85 / B**: a hook wired to event
     `Setup`, which CC doesn't dispatch → never fires (fix: `Setup → Stop`).
   - **wshobson/agents `agent-teams` — Structure 92 / A**: `team-lead` declares tool
     `Agent`, never available to a subagent (silently dropped).
   - **ZERO** dangling file-refs, dead linter-rule refs, or missing hook scripts found.

3. **Why so few.** Two reasons, both load-bearing for positioning:
   - Popular plugins are well-maintained — their paths/scripts resolve.
   - The DEEP cross-ref catches (`enforce()`/`file()`/`cmd()`) need MARKED references,
     which raw-markdown plugins don't have — they only appear after `adopt → strengthen`.
     So a raw-plugin audit surfaces **tool-contract + hook-event + overlap + hygiene**,
     NOT "your CLAUDE.md is lying." (Also: current obra/superpowers shows Truthfulness
     100 — the README's old missing-skill proof no longer reproduces on latest main.)

4. **The inherit-all demotion collapsed the graded signal.** The recent OSS FP sweep's
   dominant finding was inherit-all (109/122), which we deliberately made ADVISORY —
   so the corpus now reads "mostly A." Consequence: on a raw popular plugin the report
   often looks clean. Not relitigating the decision (it's correct — inherit-all is
   idiomatic), but noting the demo implication: a striking report needs a genuinely
   messy plugin (claude-flow), not a typical one.

5. **vigiles's hook-event catalog is STALE.** Validated @CC 2.1.187 = 9 events; CC now
   also has `PermissionRequest`/`SubagentStart`/`PostToolUseFailure` (seen registered
   in disler's settings). High-precision (close-typo only) meant we did NOT false-flag
   them — good — but the "Valid events:" list in a fix is outdated. Refresh candidate.

## Implications

- The "popular plugin with way more issues" demo is **community (claude-flow F)**,
  not official. Official's value is the inverse: **audit doesn't cry wolf on it.**
- The README's "your harness is lying" framing is most TRUE for tool-contract +
  hook-event catches; the file/rule cross-ref depth is an adopt+strengthen payoff,
  not a raw-plugin headline. Keep that honest in copy.
- "How to act on this" report card read as weird/top-of-report preachy — pending a
  move-down/condense/remove decision (see chat).
