# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — `claude/lint-inline-mode-go56av` — README/docs spec-first + launch-readiness (no PR yet)

**State:** README-review session that grew into a positioning + launch-readiness
pass. ~11 commits on this branch, all green locally (build/tsc, fmt, lint 0 errors,
cli + inline tests pass). **No PR opened yet** — a `fix:` is in the batch, so a merge
cuts a patch release.

**This session's work (by theme):**

- **Spec-first made consistent end-to-end.** README ① Lint leads spec-first; ② Test
  clarified (cheapest-tier lead-in so `runHook` reads as rung 1, subagents bullet,
  "evals"→"real-model tier"); lint guide (`verifying-instruction-files.md`) reframed
  off markdown-first; **root `CLAUDE.md` positioning reworded "markdown-first" →
  "spec-first with a markdown on-ramp"** (the one real internal contradiction). Public
  markdown-first sweep CLEAN; `research/` left as historical record (don't scrub).
- **README hero trimmed** (dropped the 3×-repeated cost aside) + **demo GIF
  regenerated mode-neutral** (was `CLAUDE.md (inline mode):` — the floor we demoted;
  now `CLAUDE.md:` + a ✓ rule line, via `scripts/make-demo-gif.py`, Pillow).
- **`fix(inline)`** — quoted `vigiles:file "path"` kept its quotes (`File not found:
""path""` + never resolved); `unquote()` at the parse boundary + regression test.
- **`refactor`** — `init()` helper → **`scaffoldSpec()`** (the `init` verb's wizard
  `setup()` was shadowed by a same-named single-target scaffolder; verb unchanged).
- **Launch-readiness:** clean-install smoke test (npm pack → fresh dir → init/lint/
  scan) **ALL GREEN** ✅; `scripts/fp-sweep.sh` written for the **fresh-plugin FP
  sweep you must run LOCALLY** (CC-web git is repo-scoped — 403 on other repos);
  `*.tgz` gitignored.
- **DECISION RECORDED** — `research/harness-checkup-and-lanes.md` (the casual/power
  lane question): ship `scan` as a zero-config **"Lighthouse for your harness"**
  (score + score-explainer + predefined disaster-battery/over-fire checks, NO
  authoring) = the mass front door; authored tests/evals = discovered depth. BOTH
  lanes as ONE funnel. ~80% already shipped — it's packaging. Validated vs
  Lighthouse/npm-audit/Snyk/SonarCloud/ESLint/Knip/Codecov + PLG research.

**DO NEXT (ranked):**

1. **Wire the disaster-battery + over-fire checks into `scan` output** — the first
   concrete checkup build; detectors exist (`guardrail-check.ts` DISASTER_CATALOG,
   `description-overlap.ts`), just not in the default `scan` report. Small, high
   leverage, dogfoods on vigiles's own plugin. NOT a new verb (`cohesive-cli-surface`).
2. **Reframe the README mass on-ramp** around "free harness health report + the one
   scary true finding" per the lane decision.
3. **Open the PR** for this branch (done + green; `fix:` → patch release).
4. **Ecosystem-benchmark v0** — still THE gating launch build (the article's spine).
5. Run `scripts/fp-sweep.sh` locally; paste output, triage FPs.

**Prior in-flight (SEPARATE branch — not touched):** PR **#48** (`claude/handoff-mylfen`)
— the rule-cleanup / auto-adopt / init-DX + surface-freeze + STABILITY batch. Re-check
its live state if returning to it.

### Gotchas (read before trusting test output)

- **REAL-MODEL TIERS RUN HERE (Claude Code web).** No `ANTHROPIC_API_KEY`, but the
  `claude` CLI on PATH is authenticated via session OAuth. Use `eval` /
  `scan --trigger` / `measureTriggerRate` to dogfood the real-model tier.
- **GIT IS REPO-SCOPED HERE** — `git clone`/GitHub MCP only reach `zernie/vigiles`
  (403 on any other repo). So the fresh-plugin FP sweep CAN'T run in this container;
  it's a local task (`scripts/fp-sweep.sh`). The npm registry IS reachable.
- **`src/dialect-drift.test.ts` FAILS in THIS container** — env-only (container CC
  version vs validated 2.1.187). CI PINS CC → green there. By design.
- `etc/*.api.md` is the surface gate (`npm run api:check`); regenerate via
  `node scripts/api-extractor.mjs --local` after an intentional API change.
- **`CLAUDE.md` + `src/CLAUDE.md` are COMPILED** from their `.spec.ts` — edit the
  spec; the compile-on-save guard recompiles the md (don't hand-edit the md).
- `npm pack` drops a `*.tgz` in the root (now gitignored) — don't commit it.

### Decisions of record (don't relitigate)

- **The wedge:** vigiles is the author-time / deterministic / pre-run + typed-spec
  play. NOT a linter. Don't fight agnix for the linting crown.
- **Spec-first with a markdown on-ramp:** the agent writes the spec, `init` adopts
  existing files faithfully, `eject` always reverses. Markdown = the **zero-TS floor**
  for those who skip `init`, NOT the default. README + lint guide + root positioning
  now all say this.
- **Checkup lane = both, as ONE funnel** (`research/harness-checkup-and-lanes.md`):
  free zero-config `scan` checkup (score + battery, no authoring) is the mass front
  door; authored tests/evals are discovered depth. Don't tease, don't cry wolf, keep
  power concepts off the casual path.
- **Rule groups, NOT a preset menu:** structural (error) / workflow (`--strict`) /
  nudge (warn). `--report-only` is an orthogonal severity dial.
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no
  VC/firm names — those live in the git-crypt `startup/` vault).

### Gotchas (ops)

- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI), repo-scoped. Before commit:
  `npm run build` + `npx vitest run` + `npm run fmt:check` + `npm run lint`;
  `self-command-refs` fails CI on a stale `vigiles <cmd>` ref. Conventional commits +
  `!` on breaking. NO session links / model IDs in commits. Trust `origin/main`.

## Don't re-read unless the task needs it

- `research/harness-checkup-and-lanes.md` — the checkup/lane decision (this session).
- `research/pre-release-focus.md` — launch sequence + positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `research/install-enforcement-dx.md` — install groups + the auto-adopt design.
- `startup/` — git-crypt vault (LOCKED; unlock with the saved key).
