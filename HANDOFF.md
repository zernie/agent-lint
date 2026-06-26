# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — `claude/lint-inline-mode-go56av` — README/docs spec-first pass (no PR yet)

**State:** A README-review session (user skimming the rendered README on mobile,
spotting framing weak spots). 4 commits on this branch, all green locally:
`npm run build`/tsc clean, fmt clean, lint **0 errors**, **103 cli + inline tests
pass**. **No PR opened yet** — user was deciding; a `fix:` is in the batch, so a
merge cuts a patch release.

**This session's 4 commits:**

- `2dcb472` **docs(README)** — ① Lint now leads **spec-first** ("your agent writes
  the spec; `init` adopts your CLAUDE.md"); inline markdown demoted to the zero-TS
  floor; the embedded README direction-note (point 2) updated to match so it isn't
  reverted. ② Test clarified: a "cheapest tier" lead-in so the `runHook` snippet
  reads as rung 1 (kills the hook-only impression), a **subagents** bullet
  (`assertAgentOk`/`assertAgentErr`), and "evals" → "real-model tier" so the word
  _eval_ stays reserved for ③. Trimmed the wordy FAQ parenthetical.
- `6b80fa7` **docs(lint guide)** — `verifying-instruction-files.md` was still
  markdown-first ("start in markdown, step up"; "markdown is the destination, not a
  stepping stone") — reframed spec-first to match the README. The public-doc
  markdown-first sweep is now CLEAN (it was the only offender; faq/markdown-mode/README
  already frame markdown as the floor).
- `2d5a011` **fix(inline)** — `<!-- vigiles:file "path" -->` (quoted, like `cmd`) kept
  its quotes: it never resolved AND printed `File not found: ""path""`. `unquote()`
  strips a surrounding pair at the parse boundary (`src/core/inline.ts`); regression
  test added. Now matches the demo (`File not found: "path"`).
- `c5bb15e` **refactor** — the `init()` helper → **`scaffoldSpec()`** so the `init`
  verb's wizard (`setup()`) isn't shadowed by a same-named single-target scaffolder.
  Verb unchanged. Docstring + a `src/CLAUDE.md` maintainer note record the
  verb→`setup()`/`scaffoldSpec()` split. (Decided NOT to add public docs for the
  split — internal detail; `docs/cli.md` already covers user-facing `init`.)

**DO NEXT:**

1. **Open a PR for this branch** if the user confirms (title `fix:` so the patch
   release fires; body summarizes the README/lint-guide spec-first pass + the inline
   quote fix + the `init()`→`scaffoldSpec()` refactor).
2. Optional polish the user floated: physically reorder the lint guide so the
   typed-spec EXAMPLE precedes the markdown one (wording is spec-first now; the
   example order still shows markdown first).
3. Resume launch builds (separate from this polish): ecosystem-benchmark v0 +
   method-first article + README 60-sec proof/GIF (`research/pre-release-focus.md`).

**Prior in-flight (SEPARATE branch — this session did NOT touch it):** PR **#48**
(`claude/handoff-mylfen`) — the big rule-cleanup / auto-adopt / init-DX batch + 5★
onboarding polish. Was open + green-pending-CI last session; re-check its live state
if returning to it.

### Gotchas (read before trusting test output)

- **REAL-MODEL TIERS RUN HERE (Claude Code web).** No `ANTHROPIC_API_KEY`, but the
  `claude` CLI on PATH is AUTHENTICATED via session OAuth. Use `eval` /
  `scan --trigger` / `measureTriggerRate` to dogfood the real-model tier — do NOT say
  "needs quota / not exercisable."
- **`src/dialect-drift.test.ts` FAILS in THIS container** — env-only (container CC
  version vs validated 2.1.187). CI PINS CC → green there. By design.
- **A scaffolded/adopted spec in a tmp dir fails to resolve `vigiles/spec`** unless
  vigiles is installed (devDep + `npm install`). The repo self-resolves it, so
  in-repo e2e works; the adopt round-trip is proven model-free in
  `src/core/adopt.test.ts` (compileClaude direct).
- `etc/*.api.md` is the surface gate (`npm run api:check`); regenerate via
  `node scripts/api-extractor.mjs --local` after an intentional API change.
- `src/CLAUDE.md` is COMPILED from `src/CLAUDE.md.spec.ts` — edit the spec, the
  compile-on-save guard recompiles the md (don't hand-edit the md).

### Decisions of record (don't relitigate)

- **The wedge:** vigiles is the author-time / deterministic / pre-run + typed-spec
  play. NOT a linter. Don't fight agnix for the linting crown.
- **Spec-first + ejectable + auto-adopted:** the agent writes the spec, `init` adopts
  your existing files faithfully, you can always `vigiles eject`. Markdown is the
  **zero-TS floor** for those who skip `init`, NOT the default starting point (inline
  kept; frontmatter parked). README + lint guide now both say this — keep new docs
  consistent.
- **Rule groups, NOT a preset menu** (Clippy/Biome best practice): structural (error,
  default) / workflow (`--strict`) / nudge (warn). `--report-only` is an orthogonal
  severity dial. Presets EXPAND to explicit `.vigilesrc.json` severities.
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no
  VC/firm names — those live in the git-crypt `startup/` vault; user has the key).

### Gotchas (ops)

- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build`
  - `npx vitest run` + `npm run fmt:check` + `npm run lint`; `self-command-refs` fails
    CI on a stale `vigiles <cmd>` ref (scans `skills/` too). Conventional commits + `!`
    on breaking. NO session links / model IDs in commits. Trust `origin/main`.

## Don't re-read unless the task needs it

- `research/install-enforcement-dx.md` — install groups + the auto-adopt design.
- `research/pre-release-focus.md` — launch sequence + Positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED; unlock with the saved key).
