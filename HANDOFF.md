# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/readme-length-review-3vnx5h` — pushed, ~10 commits, NO PR yet.**
Started as a README brevity pass; became a large **audit / adoption / lint coherence +
features** wave. All committed + pushed; build + targeted suites green (the only failing
test is the env-only `dialect-drift` — CC 2.1.42 here vs validated 2.1.187; CI pins it).

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
9. **Adopt-flow explainer in the report UI** (`ec52ba0`) — `report/src/components/Flow.tsx`.

### DO NEXT

- **Feature "audit previews what lint would find" — DECISION PENDING.** Finding: it's
  ALREADY shipped model-gated as the **adoptability preview** (`src/adoptability.ts` +
  the report Adoptability section, behind the executing-checks consent — "LLM proposes
  refs, deterministic verifies"). Don't build a duplicate. Options offered to founder:
  **A** consider done + make it more discoverable (lean); **B** add a free DETERMINISTIC
  unmarked-refs preview (modest value, narrow detector); **C** other. Awaiting pick.
- **Open the PR** (none yet). Title must be `fix!:` or carry `!` — the frontmatter
  disable is BREAKING. Cover README + the FP/scoring fixes + audit --serve, so the
  `readme-length-review` branch name isn't surprising.
- **Env-blocked HERE** (need another machine): asset refresh (`vigiles-audit.png` on a
  pinned-CC box — this container is CC 2.1.42 → drift banner); ONE live behavioral
  validation (model auth); dialect freshness.
- **Pre-release blocker (unchanged):** the ecosystem benchmark / article (measure ~10-20
  hyped skills on `bench/corpus`) + a 0.x stability blurb.
- **OSS issue hunt — CONCLUSIVE (see `research/oss-audit-render-findings.md`).** Swept
  ~300+ plugins / ~18 repos. Official CLEAN (0/39 graded). Real catches for README/demo
  (anonymized): **claude-flow → F (45 desc-overlaps)**, **disler → B (`Setup` dead hook
  event)**, **agent-teams → A (`Agent` tool never-available)**. README examples: **do NOT
  fabricate** (breaks the never-fabricate rule + credibility) — use these REAL catches.
  The real lever for "reports look toothless on typical plugins" = reconsider the
  **inherit-all GRADING** decision (it's advisory now → corpus reads mostly-A), NOT more
  searching. Screenshots were ephemeral (scratchpad); re-render via headless Chromium.

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
- **README has TWO proofs** (anonymized community catches); official-plugin proofs dropped.
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links). `startup/` vault LOCKED.

## Don't re-read unless the task needs it

- `research/oss-audit-render-findings.md` — what audit catches in the wild (official
  clean; real catches; the inherit-all-grading lever; README "don't fabricate" call).
- `research/audit-serve-design.md` — the `--serve` security model + prior-art survey.
- `research/audit-adoption-ux.md` — how the report creates specs (copy vs live).
- `research/pre-release-focus.md` — the markdown-mode / frontmatter-disable decision.
- `research/roadmap.md` — `🚀 Launch readiness`. `startup/` — git-crypt vault (LOCKED).
