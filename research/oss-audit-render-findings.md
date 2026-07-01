---
status: active
topic: audit
---

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

_Expanded 2026-06-28: also swept the big community subagent COLLECTIONS
(contains-studio/agents, davepoon, vijaythecoder, lst97, dl-ezo, iannuttall,
VoltAgent) — ~300+ plugin dirs across ~18 repos total. Findings unchanged + one
new layout observation (#6)._

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

6. **The messiest community content isn't CC-plugin-shaped.** The big subagent
   collections store agents in `design/x.md`, `agents/<category>/x.md`,
   `categories/.../x.md` — NOT `agents/*.md`. audit (like CC, which loads agents
   non-recursively from `agents/`/`.claude/agents/`) doesn't scan them as plugins,
   so their varied-quality content never reaches a graded report. This is the
   structural reason a "way more issues" CC plugin is hard to find: the mess lives
   in copy-paste libraries, not installable plugins. (NOT an audit gap — matching
   CC's own non-recursive load is correct.)

## Implications

- The "popular plugin with way more issues" demo is **community (claude-flow F)**,
  not official. Official's value is the inverse: **audit doesn't cry wolf on it.**
- The README's "your harness is lying" framing is most TRUE for tool-contract +
  hook-event catches; the file/rule cross-ref depth is an adopt+strengthen payoff,
  not a raw-plugin headline. Keep that honest in copy.
- "How to act on this" report card read as weird/top-of-report preachy — pending a
  move-down/condense/remove decision (see chat).

## Recommendations / decisions (next session, start here)

1. **README examples — do NOT go artificial.** Fabricating a real-looking "catch"
   violates the README's own rule ("every proof traces to a real dogfood run; NEVER
   replace a real catch with a fabricated one") AND is a credibility bomb for an
   Anthropic-savvy audience (they'll smell a mockup; "not mockups" was a selling
   point). And it's UNNECESSARY — we now have a strong bank of REAL catches:
   - **claude-flow → F, 45 description overlaps** (Triggering 0) — the dramatic one.
   - **disler hooks-mastery → B, a `Setup` hook event that never fires.**
   - **wshobson `agent-teams` → A, a `team-lead` `Agent` tool never available.**
   - (older obra/superpowers had a missing `using-superpowers/SKILL.md` — but latest
     main is clean, so don't rely on it.)
     Use these, ANONYMIZED per don't-shame-OSS (real names only here / `research/dogfood/`).
     A clearly-LABELLED illustrative snippet is OK for clarity, but ANCHOR on a real catch.
2. **Be honest about what audit catches on a RAW plugin:** tool-contract + hook-event
   - description-overlap + hygiene — NOT "your CLAUDE.md is lying" (file/rule cross-ref
     needs adopt+strengthen). Tune the README headline accordingly.
3. **inherit-all stays ADVISORY — SETTLED (don't re-propose a grading change).**
   We explored grading it (teeth) and a "sharp" name-heuristic (grade only
   reviewer/analyzer-role agents). BOTH rejected:
   - Pure-graded cries wolf — 32/124 community plugins drop below A purely for the
     idiomatic no-`tools:` style (backend-development → D 60 for 8 implementer agents).
   - The name-heuristic is **NOT deterministic** — it infers an agent's _intended_
     role from its name (`review`/`analyz`), i.e. guesses intent. That's a semantic
     judgment, not a structural fact; it would cry wolf unpredictably (a `code-reviewer`
     may legitimately need Bash). Fails vigiles's deterministic/high-precision bar.
     The KEY INSIGHT: "is this inherit-all dangerous?" depends on the agent's intended
     tool scope, which a RAW markdown plugin never declares — so it is UNKNOWABLE
     deterministically. Advisory is therefore the correct deterministic call. The
     deterministic "blast-radius too wide" check DOES exist, but only once intent is
     declared: a typed-spec `purity: 'pure'/'bounded'` floor + a looser tool = a compile
     error (`purityViolations`, already shipped). So over-power teeth are an
     adopt→strengthen / typed-spec payoff, NOT a raw-plugin grade. The model-gated tier
     could surface a soft "over-powered reviewer" note, but never the deterministic score.
     Corollary: a raw-plugin report's real teeth ARE the structural catches (tool typos,
     dead hook events, description overlaps) — feature THOSE.
4. **RESOLVED:** the "How to act on this" report card was REMOVED (founder call — it
   read preachy above the findings; per-fix cards carry the action). The branch PR is
   open as **#51** with a `feat!:` title (frontmatter disable is breaking). Hero
   `vigiles-audit.png` re-rendered from a real current report (agent-teams as
   `my-plugin`, A 92, inline `subagent-tool-contract` fix).
