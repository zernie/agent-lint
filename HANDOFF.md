# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you at
> ≥5 commits without a refresh.

## RESUME HERE — `claude/lint-inline-mode-go56av` — positioning + launch-readiness pass (no PR yet)

**State:** Long session. Started as a README review, became a positioning lock +
competitive research + launch-readiness pass. ~14 commits, all green locally
(build/tsc, fmt, lint 0 errors, cli+inline tests pass). **No PR opened yet** — a
`fix:` is in the batch (→ patch release on merge).

**Code/doc changes (shipped on the branch):**

- **Spec-first made consistent** end-to-end: README ① Lint + ② Test, the lint guide,
  AND the root `CLAUDE.md` positioning ("markdown-first" → "spec-first with a markdown
  on-ramp"). README hero trimmed; demo GIF regenerated mode-neutral.
- **`fix(inline)`** quoted `vigiles:file "path"` (`unquote()` + test). **`refactor`**
  `init()` helper → `scaffoldSpec()` (verb unchanged).
- **Clean-install smoke = GREEN** (npm pack → fresh dir → init/lint/scan). `*.tgz`
  gitignored. `scripts/fp-sweep.sh` = the fresh-plugin FP sweep to run LOCALLY.
- **TWO new rules in `CLAUDE.md`:** `doc-tiers` (public / internal / vault-locked
  split) and `scan-side-effect-free` (scan is pure or sandboxed; executing checks are
  opt-in + sandboxed).

**THE BIG OUTPUT — `research/harness-checkup-and-lanes.md` (read this):**

- **DECISION: `scan` is the GATEWAY** (iPhone — ONE front door, no new subcommand):
  runs the cross-ref LINT + canned TESTS (disaster-battery "does your hook actually
  block?", skill over-fire) + a score, FREE/zero-config. Authored tests/evals + the
  `vigiles/testing` API = the DEPTH (funnel, not a 2nd product). The sideways move
  past agnix: don't compete on rule-count — compete on **"we RUN your harness, not
  just read it."** This is the proposed pre-release positioning (also in
  `pre-release-focus.md` positioning lock).
- **Lead the free report with the TEST finding ("blocks 2/7"), NOT the score** — the
  score is commoditizing (agnix ~250-300★ lint leader; AgentLinter the scorecard-UX
  leader); the cross-ref correctness + testing layer is what NObody else has.
- **Ref-checking decision:** do NOT heuristically guess refs in `scan` (unreliable,
  cry-wolf). Reliable refs = **adopt a spec** (auto-generated, reviewed, ejectable —
  keep it = the gateway drug into spec-first). `scan` free value = tests + structural
  (no spec needed); refs are the adopt upgrade.
- **Competitive landscape (4-angle fan-out + Snyk deep dive):** the zero-config SCORE
  surface is crowded but shallow; cross-ref correctness + harness TESTING is unclaimed
  by everyone (funded + OSS + adjacent). **Snyk Agent Scan** (~2.7k★, $8B, expanding
  to CLAUDE.md via issue #301) is the one to watch but is pure SECURITY ("is this
  malicious?") — a perfectly broken harness passes it completely; no correctness
  signal → clean air. THREAT: MEDIUM. Snyk already ran the viral ecosystem-scan play
  (ToxicSkills) on the SECURITY axis → **our ecosystem-benchmark must be on the
  CORRECTNESS/PERFORMANCE axis ("what works vs hype"), not security.**

**DO NEXT (ranked):**

1. **Open the PR** for this branch (done + green; `fix:` → patch release).
2. **BUILD: wire the disaster-battery + skill over-fire into `scan`'s DEFAULT output**
   (the first concrete gateway move). Detectors exist (`guardrail-check.ts`
   DISASTER_CATALOG, `description-overlap.ts`); battery runs SANDBOXED per the new
   `scan-side-effect-free` rule; lead output with the score + scariest true finding.
   NOT a new verb. Big piece — consider a fresh session.
3. **Ecosystem-benchmark v0** — THE gating launch build; run it on the
   correctness/performance axis (Snyk owns security).
4. Run `scripts/fp-sweep.sh` locally; triage FPs.

**Prior in-flight (SEPARATE branch, untouched):** PR **#48** (`claude/handoff-mylfen`)
— surface-freeze + STABILITY + auto-adopt batch. Re-check its live state if returning.

### Gotchas

- **GIT IS REPO-SCOPED HERE** — `git clone`/GitHub MCP reach only `zernie/vigiles`
  (403 elsewhere) → the fresh-plugin FP sweep is a LOCAL task. npm registry IS reachable.
- **REAL-MODEL TIERS RUN HERE** — no API key, but `claude` CLI is OAuth-authed; use
  `eval`/`scan --trigger`/`measureTriggerRate` to dogfood.
- **Background research agents kept returning PLACEHOLDERS** (spawned children, didn't
  deliver) — re-poke via SendMessage to the agentId for the real output; the children
  delivered the substance.
- **`src/dialect-drift.test.ts` fails in THIS container only** (env CC version). CI pins it.
- `CLAUDE.md` + `src/CLAUDE.md` are COMPILED from `.spec.ts` — edit the spec; never hand-edit the md.
- `npm pack` drops a `*.tgz` in root (gitignored) — don't commit it.

### Decisions of record (don't relitigate)

- **The wedge:** author-time / deterministic / pre-run + typed-spec. NOT a linter; don't
  fight agnix for the linting crown. The moat = cross-ref CORRECTNESS + the TESTING layer.
- **`scan` is the gateway** (free: lint + canned tests + score); API/authored tests = depth.
- **Spec-first with a markdown on-ramp;** markdown = zero-TS floor, not the default.
  Reliable refs come via adopt-a-spec (ejectable; keep = gateway drug), never heuristics.
- **`scan` is side-effect-free or sandboxed** (the new rule). No new CLI verbs unless
  truly needed (`cohesive-cli-surface` / `high-bar-for-new-commands`).
- **3 doc tiers** (`doc-tiers` rule): public (benefits only) / internal (`research/`+CLAUDE.md)
  / vault (`startup/`, git-crypt, LOCKED — unlock only if a task needs it; it's a leak rail).
- **Ecosystem-benchmark axis = correctness/performance**, NOT security (Snyk owns that).
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no VC names).

## Don't re-read unless the task needs it

- `research/harness-checkup-and-lanes.md` — the gateway decision + competitive landscape + Snyk.
- `research/pre-release-focus.md` — launch sequence + positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED).
