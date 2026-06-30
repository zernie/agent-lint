# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/haretrail-dogfood-pvdo9t` — opening a PR + watching it** (user:
"create pr n watch"). Based on post-#53 main (`c914cb5`). Started as a DOGFOOD of
`vigiles audit` on a real third-party repo; turned into a docs + lint-rule batch.

**RESUME STATE: about to create the PR and subscribe to its activity.** Once open:
drive CI green (validate/test/etc.), fix failures, address any real Codex-review
comment, watch until merge/close. **Conventional-Commits PR TITLE is load-bearing**
(the `validate` job checks the TITLE) — use a `feat:`/`docs:` title; this branch is
NOT breaking (no public API removed). A non-CLI PR opens with a prose title by
default → fix it to a CC title immediately.

### What landed this session (in order, all pushed)

1. **Dogfooded `vigiles audit` on `fleytman/haretrail`** (clone in scratchpad;
   github blocks git-proto, so fetched the tarball via codeload). It's a Codex
   skills repo: root `AGENTS.md` + 11 skills, no hooks/subagents/MCP/specs. Graded
   **A 100/100**. REAL finding: 3 skills (`daily`/`retro`/`work-evidence`) have
   **Cyrillic descriptions** — a true-positive cross-language trigger risk. Vigiles
   BUG spotted (NOT fixed): lethal-trifecta finding labels paths as
   `.codex/skills/…` but files are at `skills/…` — `onDiskPath` (scan.ts:566) exists
   but isn't applied to that finding's label. Cosmetic.
2. **`cfbc54d` docs** — FAQ "why are the strongest guarantees opt-in" (the opt-in =
   gated-on-a-typed-program + adoption argument); linked from README + the guide.
3. **`e3c969a` docs** — codified the **auto-vs-nudge** model in the 3 spec skills
   (`strengthen`/`edit-spec`/`adopt-spec`): auto the con-free wins, NUDGE (with the
   tradeoff) for anything costing config/plugins/CI-failure, never silently escalate
   to strict. `adopt-spec` got explicit scannable adoption rules.
4. **`d70f5a6` docs** — closed the **audit→behavioral→consent** gap: FAQ "what does
   `audit` actually run (read vs measure) — why it found little", and turned the bare
   "selection-collision matrix" name-drop in `for-plugin-authors.md` into a real
   explanation. (Discovery: the N×N matrix is ALREADY SHIPPED — `scan-behavioral.ts`
   309-575, runs under the `audit.measure` consent — it was just undocumented.)
5. **`3305390` feat-ish** — new CLAUDE.md rule **`document-the-why`** (every
   user-facing decision/concept gets a plain-language doc home; name-dropping ≠
   documenting) + its deterministic FLOOR **`doc-command-coverage`**
   (`src/doc-command-coverage.ts`, the INVERSE of self-command-refs: every public
   verb is mentioned under `docs/`; dogfooded in its test).
6. **`287e4ae` feat** — new lint rule **`skill-description-budget`** (warn-tier
   trigger proxy, generous 500-char budget). Fully wired (detector + rule-meta
   heuristic-behavioral→warn + DEFAULT_RULES + NUDGE group + scan + lint + docs/rules
   + matrix + tests). Does NOT fire on haretrail — the earlier "634/781-char" was
   BYTE counts; in CHARS (Cyrillic = 2 bytes) the longest is 463 < 500. Correctly
   FP-safe.

### DO NEXT / OPEN DECISIONS

- **PRIMARY: create the PR + watch it green → merge** (see RESUME STATE).
- **#3 "deterministic collision-cluster" rule — RECOMMENDED DROP, pending user OK.**
  Why: NCD is byte-level/language-bound → cannot catch haretrail's cross-language
  collision; the real catch (the matrix) is already shipped + now documented; a
  looser NCD cutoff would cry wolf (calibrated cutoff 0.2 sits below the 0.25
  distinct-pair floor). Building it fails prefer-existing-solutions + don't-cry-wolf.
- Optional cleanup: fix the cosmetic `.codex/skills/…` path mislabel (apply
  `onDiskPath` to the trifecta finding label).

### Gotchas

- `CLAUDE.md` is COMPILED from `CLAUDE.md.spec.ts` — never hand-edit; edit the spec +
  `node dist/cli.js compile CLAUDE.md.spec.ts` (now **45 rules**).
- A new LINT RULE touches ~12 files in lockstep — `rule-meta.test.ts` binds
  rule-meta keys ↔ `docs/rules/*.md` by EXACT set match, and `setup-plan` must place
  it in exactly one group (STRUCTURAL/WORKFLOW/NUDGE). Run rule-meta + setup-plan
  tests before committing. (Used `skill-description-budget` as the worked template.)
- **`dialect-drift.test.ts` FAILS here** — asserts the installed CC SDK tool set vs
  the pinned `VALIDATED_CC_VERSION`; container CC differs. PRE-EXISTING + UNRELATED;
  passes in CI where CC is pinned.
- **`npm run fmt` reformats `research/`** (huge diff) — `npm run lint` does NOT gate
  on warnings (0 errors = pass; repo carries ~173 warnings). String spread `[...str]`
  is an eslint ERROR — use `Array.from(str)` for code-point length.
- Commits/PR: **NO session links / NO model IDs** (auto-classifier blocks them).
  Conventional-Commits PR TITLE (the `validate` job checks the TITLE).

### Decisions of record (don't relitigate)

- **Selection-collision: deterministic NCD is language-bound** → cross-language
  collision is only catchable by the model-gated MATRIX (shipped, under consent).
  Don't build a looser-NCD cluster rule.
- **`skill-description-budget` is NUDGE-tier** (never gates); a length threshold is a
  heuristic proxy → warn ceiling (lint-rule-calibration).
- **"audit found little on haretrail" is substantially CORRECT** — its descriptions
  are reasonable-length, nothing's structurally broken, and its real risk
  (cross-language selection collision) is irreducibly model-gated. The missing thing
  was discoverability (fixed in docs), not a new deterministic check.
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links).
  `startup/` LOCKED (git-crypt).

## Don't re-read unless the task needs it

- `research/measurement-authority.md` / `research/audit-wow-ideas.md` — the
  behavioral-axis feature ideas (the killer-feature mining source this session).
- `research/enforcement-model.md` — the bucket/severity model behind rule-meta.
- `research/roadmap.md` — `🚀 Launch readiness`. `startup/` — git-crypt vault (LOCKED).
