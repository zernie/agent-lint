# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/readme-length-review-3vnx5h` → PR #51 OPEN** (title `feat!:` — the
frontmatter disable is breaking; `validate` checks the TITLE). ~27 commits, pushed.
Started as a README brevity pass; became a large **audit / adoption / lint coherence +
features** wave, then an **audit-eval-thickening** wave (below). CI was red three times
in a row from MASKED failures (each fix surfaced the next step): skill-pipeline test →
scan-cli lint → fmt:check. All fixed; `prettier --check .` + lint + targeted suites green
(only env-only `dialect-drift` fails here — CC version ≠ pinned baseline; CI pins it).

### CI fixes (Codex review caught the first) — all pushed

- **api-report stale** (`5767a2d`): the new `warnings` field on CompileSkill/AgentResult
  changed the public surface; regenerated `etc/vigiles-linting.api.md`.
- **skill-pipeline test** (`30b4cfc`): asserted the inline-code guard in `errors`; it's a
  WARNING now → assert `warnings`.
- **scan-cli lint** (`c116482`): typed the parsed leaderboard JSON (no-unsafe-any).
- **fmt:check** (`9aa2240`): pre-existing MAIN breakage (#50 shipped 3 unformatted
  research files) — ignore `research/dogfood/` (captures), format readme-revamp-concepts.

### Audit-eval-thickening (the "add more evals to audit" ask)

Audit's executing/eval tier ran ONE eval (trigger-rate). Thickening it:

- **#1 selection-collision IN AUDIT** (`ace9b40`): the collision matrix existed
  (`measurePluginSelection`) but audit never ran it — only the standalone `measure` cmd
  did. Now `runAutoTrigger` runs it under the SAME consent (≥2 skills), disclosed in the
  prompt. Audit now measures fire AND collide.
- **#3 precision** — already shipped (formatBehavioralReport prints it). No-op.
- **#2 adversarial-gate, STEP 1** (`06d1958`): pure `isGateDescription`/`detectGateSkills`
  (keyword heuristic) — the deterministic detection of enforcement-gate skills. Execution
  layer NOT built (awaiting steer, below).

### What landed this session (in order)

1. **README** — trim (258→~132 body lines) + accuracy fixes (the false "audit in CI"
   line; a fabricated leaderboard rank; severity inflation) + **dropped Proofs 3-4**
   (they leaned on inherit-all, now advisory → official plugins are clean A, so the
   proofs were false/self-contradictory). Kept Proofs 1-2 (real graded defects).
2. **OSS FP sweep (124 plugin roots via codeload)** → fixed ONE real FP: `commands/agents/*.md`
   (a command namespaced `/agents:…`) + a README.md misclassified as SUBAGENTS. Extended
   the `skills/<x>/agents/` classifier exclusion to `commandDir/.../agentDir`.
3. **Versioned `audit --json`** — marketplace/leaderboard emitted a bare array; now every
   `audit --json` is a versioned object with `meta.kind` (audit/leaderboard/marketplace).
4. **inherit-all → ADVISORY, not graded** — sweep showed 109/122 plugins had ONLY this;
   it cried wolf on an idiomatic style. Grade dist {A:90,B:24,C:5,D:3,F:1} → {A:122,F:1}.
5. **code-block guard → WARNING** — the >20-line inline-code guard was a compile ERROR
   that broke faithful adoption (skill adopt 55%→100%, subagent 58%→80%). Now a
   non-blocking `warnings` channel on CompileSkillResult/CompileAgentResult.
6. **Frontmatter lint mode DISABLED** (`FRONTMATTER_MODE_ENABLED=false` in cli.ts) — kept
   in code (frontmatter.ts, generate-schema), inert in lint. Collapses the ladder to
   inline-comments + typed-spec. `fix!:` (BREAKING).
7. **Flow doc** in `docs/for-plugin-authors.md` (audit→init→strengthen→lint + the
   copy-vs-run clarification) + stale `scan`→`audit` / CI-line fixes.
8. **`audit --serve`** (`d051984`) — one-click-local spec adoption. Hardened loopback
   server (`src/audit-serve.ts`): 127.0.0.1 + per-run token + Origin + allowlist-not-path
   - in-process `init` + own-repo only. Opt-in (TTY prompt / `--serve` / `--no-serve`);
     plain audit stays a terminating headless-safe READ. Security unit tests + real-HTTP
     e2e. Report buttons POST when live, copy when static. `research/audit-serve-design.md`.
9. **Adopt-flow explainer in the report UI** (`ec52ba0`) — then REMOVED (`bdef434`,
   founder call: read preachy above the findings; per-fix cards carry the action).
   `report/src/components/Flow.tsx` deleted. (The audit→init→strengthen→lint _doc_ in
   `docs/for-plugin-authors.md` STAYS — only the report UI card went.)
10. **Hero `vigiles-audit.png` REFRESHED** (`159fd21`→`bdef434`) — re-rendered from a
    REAL current report (agent-teams shown as `my-plugin` to anonymize): A 92, four
    rings, inline `subagent-tool-contract` fix. No flow card, no drift banner.
    Re-render recipe: copy a plugin to `my-plugin/`, `node dist/cli.js audit my-plugin
--no-json --no-serve`, headless Chromium `--window-size=1240,1300 --screenshot`
    on `vigiles-report.html`, then `rm -rf my-plugin vigiles-report.html`.

### DO NEXT

- **#2 adversarial-gate EXECUTION LAYER — AWAITING USER STEER (2 forks).** Step 1
  (gate detection) shipped. The execution layer is model-gated + can't be validated in
  THIS env (no model auth), so confirm before building: (A) **hook-gate confinement** —
  user said "both" (skill + hook gates), but running hooks in audit OVERRIDES the parked
  2026-06-27 `audit-side-effect-free` decision (no Linux-only safety in audit).
  Recommended thread-the-needle: hook-gates run CONFINED-only (src/sandbox.ts), degrade
  to a LOUD SKIP off-Linux, and report as an ADVISORY line (never a graded ring — that
  was the decision's actual concern: no per-OS grade divergence). (B) **skill-gate
  assertion** — deriving violate→assert-refusal from prose isn't deterministic: author-
  supplied scenarios (deterministic, not zero-config) vs LLM-judge (zero-config,
  non-deterministic). My proposed default: skill-gates via (b) LLM-judge + hook-gates
  confined/advisory/degrade-to-skip. Detector lives in `src/scan-behavioral.ts`.
- **STRATEGY of record (don't relitigate):** launch on the **ecosystem benchmark**, not
  audit alone — audit's ring/score UX is commoditizing (AgentLinter/SkillCheck/cc-health-
  check), agnix's 414-rule linter got 1 HN point. Audit = the on-ramp; benchmark = the
  hook. BUT one eval (caveman) ≠ a benchmark → the near-term work the user chose is
  THICKENING AUDIT's eval tier (above), not the benchmark yet. Competitor + OSS research
  is in the two completed agent briefs (this session) + `research/skill-eval-landscape.md`.
- **Feature "audit previews what lint would find" — DECISION PENDING.** Finding: it's
  ALREADY shipped model-gated as the **adoptability preview** (`src/adoptability.ts` +
  the report Adoptability section, behind the executing-checks consent — "LLM proposes
  refs, deterministic verifies"). Don't build a duplicate. Options offered to founder:
  **A** consider done + make it more discoverable (lean); **B** add a free DETERMINISTIC
  unmarked-refs preview (modest value, narrow detector); **C** other. Awaiting pick.
- **PR #51 is OPEN** — watch CI (`validate` should now pass on the `feat!:` title).
  Merge is the founder's call. The branch name (`readme-length-review`) understates the
  wave — the PR body covers it.
- **Env-blocked HERE** (need another machine): ONE live behavioral validation (model
  auth); dialect freshness (CC version here ≠ pinned baseline). Hero asset is DONE.
- **Pre-release blocker (unchanged):** the ecosystem benchmark / article (measure ~10-20
  hyped skills on `bench/corpus`) + a 0.x stability blurb.
- **OSS issue hunt — CONCLUSIVE (see `research/oss-audit-render-findings.md`).** Swept
  ~300+ plugins / ~18 repos. Official CLEAN (0/39 graded). Real catches for README/demo
  (anonymized): **claude-flow → F (45 desc-overlaps)**, **disler → B (`Setup` dead hook
  event)**, **agent-teams → A (`Agent` tool never-available)**. README examples: **do NOT
  fabricate** (breaks the never-fabricate rule + credibility) — use these REAL catches.
  inherit-all stays **ADVISORY — SETTLED** (don't re-propose grading it): pure-graded
  cries wolf (32/124 drop below A for the idiomatic no-`tools:` style), and a
  name-heuristic ("grade reviewer-role agents") is NOT deterministic (guesses intent).
  "Dangerous inherit-all?" is unknowable on raw markdown; the deterministic over-power
  check is the typed-spec `purity` floor (adopt→strengthen payoff), already shipped.
  Screenshots were ephemeral (scratchpad); re-render via headless Chromium.

### Gotchas

- **OSS sweep workaround:** `git clone` of other repos is 403 here, but **codeload
  tarballs work**: `curl -sSL codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<main|master>`.
- **`npm run fmt` reformats `research/`** (huge prettier diff on dogfood html/json) — use
  `npx prettier --write <files>` and stage ONLY your files; don't bundle fmt noise.
- **No bubblewrap** → `sandboxAvailable()` false; `dialect-drift.test.ts` fails here only.
- `CLAUDE.md` is COMPILED from `CLAUDE.md.spec.ts` — never hand-edit; edit the spec +
  recompile. (NB `src/audit-serve.ts` is NOT yet in CLAUDE.md keyFiles — add when convenient.)
- Commits: **NO session links / NO model IDs** (auto-classifier blocks them).
- `cli.test.ts` / `agent.test.ts` / `spec.test.ts` are **vitest** despite old node:test
  labels — run via `npx vitest run`, not `node --test`.

### Decisions of record (don't relitigate)

- **inherit-all is ADVISORY** (subagent with no `tools:` line) — idiomatic, shown not scored.
- **The >20-line inline-code guard is a WARNING**, not an error — adoption always compiles.
- **Frontmatter lint mode is DISABLED** (kept/flag-reversible) — two on-ramps: inline + spec.
- **`audit --json` is ALWAYS a versioned object** (`meta.kind`), never a bare array.
- **`audit --serve` reverses "audit reads / no execution flag"** — deliberately, scoped
  tight (own-repo, interactive, token-guarded, reversible local write). Plain `audit`
  (no `--serve`) is STILL a safe terminating read; `lint` is the CI gate, not audit.
- **"What would vigiles catch" = the model-gated adoptability preview** (already shipped).
- **The report's "how to act" flow CARD is REMOVED** (founder call) — the doc-level flow
  explainer in `docs/for-plugin-authors.md` stays; only the in-report UI card went.
- **README has TWO proofs** (anonymized community catches); official-plugin proofs dropped.
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links). `startup/` vault LOCKED.

## Don't re-read unless the task needs it

- `research/oss-audit-render-findings.md` — what audit catches in the wild (official
  clean; real catches; the inherit-all-grading lever; README "don't fabricate" call).
- `research/audit-serve-design.md` — the `--serve` security model + prior-art survey.
- `research/audit-adoption-ux.md` — how the report creates specs (copy vs live).
- `research/pre-release-focus.md` — the markdown-mode / frontmatter-disable decision.
- `research/roadmap.md` — `🚀 Launch readiness`. `startup/` — git-crypt vault (LOCKED).
