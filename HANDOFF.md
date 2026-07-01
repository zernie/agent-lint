# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/haretrail-dogfood-pvdo9t` — PR #54 OPEN, being WATCHED** (user said
"watch", NOT merge — do NOT auto-merge; merge is the user's call). An hourly cron
`5438c724` re-checks CI + mergeability: report green, fetch-logs-and-fix on red, stop
(CronDelete) when merged/closed. HEAD `90eb01b`.

Session started as a DOGFOOD of `vigiles audit` on `fleytman/haretrail` (a Codex
skills repo) and turned into a docs + rules + **eval-cost-transparency** + **research
corpus index** batch.

**RESUME STATE: cost + selection-matrix DONE (pushed). Remaining haretrail ideas
optional/ask-first** (`research/haretrail-eval-ideas.md`): deriveTriggerSetFromManifest
(free negatives), locales axis, measureDescriptionAblation, withPluginFixture — none built.

### What landed this session (all pushed)

- **`measureSelectionMatrix` + `assertNoCollision`** (`90eb01b`) — PROMOTED the
  cross-skill selection-collision matrix (was CLI-only under audit consent) to a
  first-class assertable eval primitive. Zero-setup (auto-derives prompts from
  descriptions), `assertNoCollision({maxOffDiagonal})` gates it. Exported on
  **`vigiles/claude-code`** NOT agnostic `vigiles/testing` (CC-only — reads the
  selector's choice; scan-behavioral is Codex-adapter-coupled). Thin wrapper over the
  existing `measurePluginSelection`; `measureSelectionMatrixWith` = injectable core.
  Example eval + no-model tests + for-plugin-authors.md CI path.
- **Cost threading — LAST path** (`2268cef`) — `measure`/`measureArms` now carry
  `usage: ArmUsage` on `CheckReport` + emit cost in the v8-ignored wrappers (measureArms
  sums both arms). ALL four eval paths now print spend (runEval + measureTriggerRate
  already did) — the cost-transparency feature is now COMPLETE.

0. **Research corpus index** (`b062882`) — all 114 `research/*.md` now carry
   `status:`/`topic:` frontmatter (slice via `grep -l 'status: shipped' research/*.md`).
   NEW `research/CLAUDE.md.spec.ts` → compiled `research/CLAUDE.md`: the agent-facing
   index (one status-tagged line per doc, topic-grouped), mirrors `src/CLAUDE.md.spec.ts`.
   Sync enforced both ways: compiler verifies each keyFiles path EXISTS + NEW
   `src/research-index.ts` dogfood asserts every doc is indexed. `research/README.md`
   stays the human index, now points at the machine one. `.prettierignore` gained the
   nested compiled `CLAUDE.md` artifacts (src/, src/core/, research/).

1. **Cross-language flag REMOVED** (`30c0175`) — `unexpectedScript`/`descriptionScript`
   scan finding GONE (measured + REFUTED: `plugin-behavioral-findings.md` Finding 3a —
   RU descriptions fire fine on EN prompts; it cried wolf on correct non-English
   authoring). Why saved in that research doc; `one-detector-no-drift` example moved to
   `description-overlap`.
2. **Cost transparency** — `src/eval-cost.ts` (pure engine: tokens + API-equivalent `$`
   - metered-vs-sub detection + session tally + formatter, fully unit-tested). Emits
     after `runEval` (`abeb93e`) AND `measureTriggerRate` (threaded `usage` into
     `TriggerRateReport`). NO "% of sub" (Anthropic doesn't expose plan quota). The
     `test-harness` skill MUST relay spend to the user; `docs/measuring-skills.md` documents it.
3. **`surface-architecture-decisions` rule** (`c1c8067`) — output arch decisions (file
   placement, core/adapter/port, extend-vs-create) to chat in a scannable block with the
   boundary reasoning. FOLDED IN parse-don't-validate + make-illegal-states-irrepresentable
   (`53e3dfa`), framed as decisions-to-name (ts-essentials holds the mechanical how).
4. Earlier batch (in prior handoff too): `document-the-why` rule + `doc-command-coverage`
   check; `skill-description-budget` lint rule; audit→behavioral→consent + opt-in FAQ
   docs; auto-vs-nudge in the 3 spec skills.

### DO NEXT / OPEN

- **PRIMARY: keep watching PR #54 → green** (cron `5438c724`). Merge is the USER's call.
- **haretrail feature ideas** (`research/haretrail-eval-ideas.md`): measureSelectionMatrix
  now DONE; remaining = deriveTriggerSetFromManifest, locales axis, description-ablation,
  withPluginFixture. All optional/ask-first.
- **#3 "collision-cluster" rule — RECOMMENDED DROP** (NCD is byte-level/language-bound,
  can't catch cross-language collision; the model MATRIX already ships under
  `audit.measure` consent). Pending user OK.
- Cosmetic vigiles bug (unfixed): lethal-trifecta finding labels `.codex/skills/…` but
  files are at `skills/…` — apply `onDiskPath` to that finding's label in `scan.ts`.

### Gotchas

- `CLAUDE.md` COMPILED from `CLAUDE.md.spec.ts` — edit the spec + `node dist/cli.js
compile CLAUDE.md.spec.ts` (now ~46 rules). Never hand-edit `CLAUDE.md`. SAME for the
  scoped `src/CLAUDE.md`, `src/core/CLAUDE.md`, and now `research/CLAUDE.md` (compiled
  from `research/CLAUDE.md.spec.ts` — all in `.prettierignore`).
- **RESEARCH INDEX SYNC**: a new `research/*.md` needs a `keyFiles` line in
  `research/CLAUDE.md.spec.ts` + `status:`/`topic:` frontmatter, or `src/research-index.test.ts`
  fails. Rename/delete → update the spec (compiler verifies each path exists). Recompile after.
- **`dialect-drift.test.ts` fails LOCALLY** in this container (installed claude-code drifted
  from pinned `2.1.187`); CI pins the version so it passes there. Env-only, not a real break.
- **RUN ESLINT, not just fmt:check, on new files** — `no-confusing-void-expression`
  (a void-returning arrow shorthand, e.g. `() => console.error(x)` / `() => reset()`)
  is an ERROR (add braces); string spread `[...str]` too (use `Array.from`). `npm run
lint` = 0 errors passes; the repo carries ~173 WARNINGS (not gated).
- `validate.test.ts` has a hardcoded `DEFAULT_RULES` literal that breaks on a new rule.
  Run the full suite (`npx vitest run`) / grep for it. (It IS vitest, not node:test.)
- `prettier --check .` covers `HANDOFF.md` — run `npx prettier --write HANDOFF.md` before commit.
- A new LINT RULE = ~12 files in lockstep (`rule-meta` EXACT-match `docs/rules/`; `setup-plan` group).
- Commits/PR: **NO session links / NO model IDs** (auto-classifier blocks). Conventional-Commit PR title.
- Eval `usage` is now threaded on ALL report types (`EvalReport`, `CheckReport`,
  `TriggerRateReport`) — source is the parser's `ParsedModelRun.usage`. Adding a new
  report type? Carry `usage: ArmUsage` + `aggregateUsage` in the loop (that's the pattern).
- **Selection-matrix lives on `vigiles/claude-code`** (CC-only), NOT `vigiles/testing`
  (agnostic). `scan-behavioral` imports the Codex adapter → never re-export it from the
  agnostic barrel. `assertNoCollision` sits there too (co-located with its report type).

### Decisions of record (don't relitigate)

- Cross-language deterministic flag is DEAD (refuted). If ever revived → key on language
  INCONSISTENCY within a plugin (some EN, some RU), NOT "non-Latin", and only after measuring.
- Cost: tokens + API-equivalent `$` + a metered-API warning; NEVER a fake "% of sub".
- `surface-architecture-decisions` is now ACTIVE — output arch/placement decisions to chat.
- Selection-collision: deterministic NCD is language-bound → the model MATRIX (shipped,
  under `audit.measure` consent) is the real catch. Don't build a looser-NCD cluster rule.
- Public docs = user benefit (no moat/flywheel, no `research/` links). `startup/` LOCKED.

## Don't re-read unless the task needs it

- `research/plugin-behavioral-findings.md` — Finding 3a (cross-lang refuted) + the eval fixtures.
- `research/measurement-authority.md` / `research/audit-wow-ideas.md` — behavioral feature ideas.
- `research/roadmap.md` — the front-door roadmap. `startup/` — git-crypt vault (LOCKED).
