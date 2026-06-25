# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — big launch-polish branch on `claude/handoff-mylfen`; OPEN THE PR

**State:** a large, coherent pre-launch chunk is DONE + pushed on
**`claude/handoff-mylfen`** (NOT merged, **NO PR OPEN yet** — the main loose end).
On top of `origin/main` `2747878`. Full suite: **~1629 passed / 11 skipped / 1
failed** — the 1 fail is the env-only `dialect-drift` (see Gotchas), green in CI.

**THE COHESIVE THEME this session:** vigiles is now USEFUL OUT OF THE BOX +
spec-first. Key commits (newest first):

- `dc91eca` **interactive init offers the workflow tier (opt-out)** — asks "enforce
  specs + a test per surface? [Y/n]" (default yes); bare non-interactive stays
  structural-only (safe first-run).
- `02b3ae5` **init GATES broken surfaces BY DEFAULT** — a plain `init` writes the 9
  FP-safe structural rules as `error` (subagent-tool-contract, subagent-frontmatter,
  hook-events, hook-script-exists, mcp-config, mcp-tool-resolves,
  mcp-hook-target-resolves, disallowed-tools-contract, description-overlap), so a
  broken subagent/hook/MCP/collision FAILS `vigiles lint` (exit 2) while a clean
  plugin stays green. `--strict` = the WORKFLOW tier (require-spec, untested-\*,
  frontmatter-valid, skill-frontmatter). vigiles dogfoods the 9 in its own
  `.vigilesrc.json`. **Also fixed: `vigiles lint .` (dir arg) crashed EISDIR — now
  discovers files under the dir.**
- `39c62fb` **`scan` nudges toward `--trigger`** when model-invocable skills + model
  access (offer at TTY, hint for agents; `--no-interactive`/`--json` → hint only).
- `cb3734b` **`vigiles eject`** — inverse of compile: strip the integrity header →
  plain hand-owned markdown + `vigiles-disable require-spec` marker, removes the
  spec (`--keep-spec`). The "managed but ejectable" escape hatch.
- earlier: surface freeze (`@internal` typed-composition + `effect()`; `STABILITY.md`),
  markdown cut (parked via HTML comment), pain-first README hero + subdocs (rule 1c),
  positioning lock (not-a-linter / author-time-vs-runtime wedge / spec-first), adopt-spec
  cleanup + `skills/` added to self-command-refs scan.

**DO NEXT:**

1. **OPEN THE PR.** Title needs `!` + BREAKING CHANGE footer (the freeze commit
   `ef7281c` already has both): e.g. `refactor!: pre-release surface freeze +
spec-first defaults (eject, default gating, scan nudge)`. Re-`subscribe_pr_activity`
   to watch it.
2. **RECONCILE the `progressive-adoption` / `smooth-adoption` rules** in `CLAUDE.md`
   (via `CLAUDE.md.spec.ts`): they still say "start permissive (warnings), tighten via
   --strict" — but default `init` now GATES structural breakage. New stance: "permissive
   = doesn't force specs/TS + doesn't cry wolf (FP-safe), NOT ignores breakage." User
   AGREED to this reframe. Small spec edit + recompile.
3. Launch builds (NOT polish, separate): ecosystem-benchmark v0 + the method-first
   article + README 60-sec proof/GIF.

**OPEN IDEA (discussed, not built):** auto-generate trigger prompts from skill
descriptions so `scan --trigger` runs with zero hand-written prompts (turns the nudge
into one-keystroke "do my skills fire?"). The scan nudge today only SUGGESTS/scaffolds.

### Gotchas (read before trusting test output)

- **REAL-MODEL TIERS RUN HERE (Claude Code web).** No `ANTHROPIC_API_KEY`, but the
  `claude` CLI on PATH (`/opt/node22/bin/claude`) is AUTHENTICATED via session OAuth
  (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` + `ANTHROPIC_BASE_URL`). Proven: `claude -p`
  → `READY`, and a live `scan --trigger` (test-harness recall 100%). Use `eval` /
  `scan --trigger` / `measureTriggerRate` to dogfood the real-model tier — do NOT say
  "needs quota / not exercisable."
- **`src/dialect-drift.test.ts` FAILS in THIS container** — env-only: container CC
  `2.1.42`/`2.1.191`-on-PATH vs validated `2.1.187`, so the installed tool set drifts
  from `ACKNOWLEDGED_TOOL_INPUT_TYPES`. CI PINS CC → green there. `scan` prints a
  non-blocking `⚠ dialect freshness` for the same reason (by design).
- Dogfood VERDICT (this session): self-lint clean, self-scan clean, first-run + the
  **published tarball** (`npm pack`→install) both work, FP sweep on vendored plugins
  shows only EXPECTED findings. Structurally release-ready. `pack-smoke` is NOT a CI
  job yet (offered) — the one gap CI doesn't cover.
- `etc/*.api.md` is the surface gate (`npm run api:check`); regenerate via
  `node scripts/api-extractor.mjs --local` after an intentional API change.
- `docs/markdown-mode.md` parked block: inner `<!-- … -->` written `<!~~ … ~~>` so a
  nested `-->` doesn't close the park comment — restore on un-park.

### Decisions of record (don't relitigate)

- **The wedge:** every competitor (funded + OSS agnix) is runtime/observability/post-hoc
  or structure-lint; vigiles is the ONLY author-time / deterministic / pre-run + typed-spec
  play. DON'T fight agnix for the linting crown — vigiles is NOT a linter.
- **Spec-first + ejectable** is the adoption story: the agent writes the spec, you can
  always `vigiles eject`. Markdown demoted to floor/eject-target (inline kept; frontmatter
  parked). Verb surface = 9 (added `eject`) + hidden `hook-runtime`.
- **Default = useful out of the box:** catch breakage by default (FP-safe), offer
  specs+tests interactively (opt-out). The user pushed for this; it reverses the old
  "start permissive" framing (reconcile the rule — DO NEXT #2).
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no
  VC/firm names — those live in the git-crypt `startup/` vault; user has the key).

### Gotchas (ops)

- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build` +
  `npx vitest run` + `npm run fmt:check`; `self-command-refs` fails CI on a stale
  `vigiles <cmd>` ref (it scans `skills/` now too). Conventional commits + `!` on breaking.
  NO session links / model IDs in commits. Local `main` ref is stale — trust `origin/main`.

## Don't re-read unless the task needs it

- `research/pre-release-focus.md` — launch sequence + Positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED; unlock with the saved key: apt-get install
  git-crypt → paste key → git-crypt unlock).
