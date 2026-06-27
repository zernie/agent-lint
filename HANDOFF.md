# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you at
> ≥5 commits without a refresh.

## RESUME HERE — `claude/lint-inline-mode-go56av` — Lighthouse `audit` + read-vs-run consent DONE; PR not opened

**⚠ ONE PR FOR THE WHOLE BRANCH.** Everything below ships together off
`claude/lint-inline-mode-go56av` as one big `refactor!` (breaking — dropped flags,
`--deep`/`--fast` removed, battery no longer a default). **PR is NOT opened yet** —
the README/front-door reframe is sensitive; **ask the founder before opening.**

**State:** all committed + green locally (build incl. report, fmt, lint 0 errors,
1703 vitest pass; only the env-only `dialect-drift` fails here — container has
claude-code 2.1.42 vs baseline 2.1.187, CI pins it). Branch pushed (`edb82d4`).

### What this branch is (in order)

1. **Lighthouse `audit`** (renamed from `scan`): five category RINGS
   (Truthfulness/Safety/Triggering/Structure/Tested, weighted A–F) + inline fixes +
   a shareable **HTML report** + the **versioned `AuditReport` JSON** (`src/audit-report.ts`,
   `schemaVersion`) that everything renders from (HTML / `--json` / future upload).
2. **Report stack** = a real Vite + React + shadcn single-file app (`report/`), built
   to `dist/audit-report.template.html` (`scripts/build-report.mjs`, wired into
   `npm run build`); CLI injects the JSON. Pure shadcn/Tailwind, no inline styles.
3. **`--deep` INVERSION → then collapsed to ONE CONSENT** (this session's arc, driven
   by the founder over several turns). Final shape below.

### The audit model (FINAL — read this before touching audit)

- **A plain `audit` is a DETERMINISTIC READ** — rings + fixes + report. Nothing
  executes. Identical on every OS. Safe even on a prod-wired repo.
- **Three executing checks** — safety battery (do hooks block?) · live MCP resolution
  (do referenced tools resolve on the real server?) · trigger-rate (do skills FIRE?)
  — share **ONE consent** (`decideExecute`, `src/scan-trigger-suggest.ts`): at a TTY
  `audit` **asks once** (bundled prompt, discloses confinement + cost) and **remembers**
  in `.vigilesrc.json` (`audit.measure`); headless (`--json`/CI/non-interactive/agent)
  it stays a read + a one-line nudge. Never hangs.
- **`--measure`** is the lone flag (the headless "yes" / skip-the-prompt). **`--fast`
  and `--no-measure` are DELETED** — the default IS the read, nothing to opt out of.
- **Why execution is opt-in UNIFORMLY** (not Linux-confined/Mac-unconfined): a
  hook/server can hit a real Postgres/API and confinement (bubblewrap) is Linux-only.
  On consent: battery runs each hook **network-confined** where a sandbox exists (else
  own-direct + LOUD warning, foreign skip); live MCP is **own-repo only** (never a
  stranger's server — starting one connects to a backend, deny-all-net would break its
  `tools/list`); trigger-rate **stubs skill bodies** so no procedure runs.
- **Safety RING reads n/a (not a false 0)** when no hook blocks any disaster (none is
  evidently a Bash guard — a 0 cried wolf, tanked the grade). Fixed in `src/audit-score.ts`.
- `hasModelAccess`/`isMeteredAccess` (env: `ANTHROPIC_API_KEY`=metered vs
  `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`=sub) now only shape the **disclosure wording**.

### DO NEXT (none blocks the PR; ask before opening it)

- **OSS FP sweep is NOT done** — can't run here (git scoped to `zernie/vigiles`, 403
  on external clones). Run on an open-network machine: `VIGILES="node dist/cli.js"
  scripts/fp-sweep.sh` (the stale `scan`→`audit` verb in it is fixed). The in-repo
  vendored-plugin proxy passed (4 plugins), but that's NOT the real sweep.
- **The "better way" that re-promotes the battery to a default** (the exit criterion):
  an **env-scrub ephemeral floor** (strip DB/API creds before running a hook — no
  kernel features, cross-platform) and/or a **macOS `sandbox-exec`** backend. Until
  one lands, execution stays uniformly opt-in.
- Open follow-ups (not blockers): hosted dashboard + `audit --upload`; cross-package
  schema-parity guard (`report/src/schema.ts` mirrors `src/audit-report.ts` by hand);
  ecosystem-benchmark v0.

### Key files touched this arc

- `src/scan-trigger-suggest.ts` — `decideExecute` (the read-vs-run decision) +
  `formatExecuteSkip` + `hasModelAccess`/`isMeteredAccess`.
- `src/cli.ts` — `audit` case (resolveExecution + buildExecuteDisclosure + the
  consent prompt + `runSafetyBattery` confine-or-warn + `runnableSafetyHooks`).
- `src/audit-score.ts` — Safety n/a on zero-blocks. `src/core/types.ts` — `audit.measure`.
- Docs: `README.md`, `docs/cli.md`, `CLAUDE.md.spec.ts` (positioning +
  `audit-side-effect-free` rule, recompiled), `research/audit-lighthouse-design.md`
  (full decision record), `research/harness-checkup-and-lanes.md`.

### Gotchas

- **GIT IS REPO-SCOPED HERE** — clones reach only `zernie/vigiles` (403 elsewhere) →
  the FP sweep is a LOCAL task. npm registry IS reachable.
- **No bubblewrap in THIS container** → `sandboxAvailable()` is false here, so the
  battery (under `--measure`) runs own-direct + the loud "no network confinement"
  warning. That's the intended degrade, not a bug.
- **`src/dialect-drift.test.ts` fails in THIS container only** (CC version). CI pins it.
- `CLAUDE.md` + `src/CLAUDE.md` are COMPILED from `.spec.ts` — edit the spec, recompile
  (`node dist/cli.js compile CLAUDE.md.spec.ts`); never hand-edit the md.
- **Commits: NO session links / NO model IDs** (the auto-classifier blocks them; the
  default trailers violate the repo's `no-session-links` + model-identity rules).
- `npm pack` / report build drop artifacts — gitignored; don't commit them.

### Decisions of record (don't relitigate)

- **`audit` reads; `--measure` runs.** ONE consent for all execution, asked-once at a
  TTY (remembered). NO `--fast`/`--no-measure`/`--deep`. Battery is opt-in, not default.
- **Execution is opt-in UNIFORMLY across OSes** until one confinement is cross-platform
  (state-safety > the "we run it by default" wow). Provenance protects the HOST;
  confinement protects external STATE — two axes.
- **`audit` is the gateway** (rings + fixes + report, free/zero-config/safe-anywhere);
  the executing checks are the depth, behind consent.
- **Ecosystem-benchmark axis = correctness/performance**, NOT security (Snyk owns that).
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no VC names).
- `startup/` git-crypt vault stays LOCKED unless a task needs it (leak rail).

## Don't re-read unless the task needs it

- `research/audit-lighthouse-design.md` — the full audit design + every decision in this arc.
- `research/harness-checkup-and-lanes.md` — gateway decision + competitive landscape + Snyk.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED).
