# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/eval-cache-invalidation-vd1mzj` — pushed, NO PR opened yet.**

This session built the **eval LOCK** (a committed CI staleness gate for evals run on
a subscription) end-to-end as a "whole package", then closed a multi-harness gap:
**hook inject is now a tested port contract**, not a prose deferral. All committed +
pushed to the branch above.

### What landed this session (in order)

1. **Eval LOCK vs CACHE split** — `src/eval-lock.ts`. The lock is a COMMITTED
   integrity stamp (`.vigiles/eval-locks/<slug>.lock.json`), distinct from the
   gitignored local speed CACHE (`eval-cache.ts`). `eval --update` (local, on the
   sub) records each NAMED eval's report; `eval --check` (CI) recomputes
   `evalInputsHash` over the MODEL-AFFECTING inputs and fails STALE on a mismatch
   WITHOUT a model call (`decideLock` → run | replay | stale). Honest scope: verifies
   "committed results match current INPUTS", NOT "reflect current model behavior".
   NO nightly run (user killed it — "nobody's gonna do that"). Harness version is
   PROVENANCE, NOT hashed (CI's pinned `claude` ≠ a dev's local would false-trip).
2. **Per-adapter `versionKey`** extracted to `HarnessRuntime.versionKey` —
   CC → `major.minor` (~quarterly); Codex → `""` (minor is patch-cadence ~weekly).
3. **Lock wired into** eval entry points (`runEvalWith`/`measureTriggerRateWith` via
   `withEvalLock`), CLI flags, GHA (`command: eval-check`), and `init` (scaffolds the
   job). `anyLocksCommitted` makes `--check` a green no-op until the first lock.
4. **Agent-awareness without editing the user's CLAUDE.md** — a PostToolUse nudge
   hook (`hooks/eval-lock-nudge.sh` → `hook-runtime eval-lock-nudge`) injects an
   `additionalContext` reminder after a `SKILL.md`/`*.eval.*` edit, self-gated on a
   committed lock + the `test-harness` skill. VERIFIED: a plugin CANNOT ship an
   always-on instruction blob; channels are SKILLS + HOOKS (`research/agent-context-delivery.md`).
5. **Three CLAUDE.md rules added** — `cohesive-feature-delivery` (whole-flow
   definition-of-done checklist), `prose-clarity` / `lead-with-easy-adoption`.
6. **Public docs prose sweep** (13 guides) for scannability + the eval-lock docs.
7. **HOOK INJECT ENCODED INTO THE PORT** (commit `b6136f2`, `feat!`) — the answer to
   "how was Codex inject missed if adapters fail tests on missing functionality?":
   inject support was PROSE-deferred, not encoded, so conformance never asserted it.
   Official Codex hooks docs (developers.openai.com/codex/hooks) CONFIRM
   `additionalContext` on SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/
   SubagentStart — same shape as CC. Fix: `HookProtocol.injectableEvents` (required
   field); conformance REJECTS a shellHooks adapter with an empty list; the
   adapter-contract suite asserts every shellHooks adapter declares the events our
   shipped hooks use (PostToolUse, SessionStart) — the test that WOULD have caught
   the miss. `compile` warns on an inject hook only when its event isn't injectable;
   **react** output stays the one CC-confirmed-only piece. Corrected every "Codex
   inject deferred" ref across docs/research/CLAUDE.md + documented `injectableEvents`
   in the adapter API + authoring guides.

### DO NEXT / OPEN DECISIONS

- **No PR opened.** The branch is pushed; open a PR if/when the user asks (the task
  framing says don't auto-create one). If opened from the UI, FIX THE TITLE to a
  Conventional Commit with `!` (breaking — `HookProtocol` gained a required field on
  `vigiles/adapter`) so the `validate` job passes and the release version is right.
- **react output on Codex** is the remaining CC-confirmed-only hook piece — confirm
  against the real `codex` binary before relying on it (gated, like the rest).

### Gotchas

- **`dialect-drift.test.ts` FAILS here** — asserts the INSTALLED claude-code SDK tool
  set matches the pinned `VALIDATED_CC_VERSION`; this container runs a DIFFERENT CC
  (36 tool types incl. Agent/Artifact/Workflow/TaskUpdate vs the pinned 17/38).
  PRE-EXISTING + UNRELATED to any code change; passes in CI where CC is pinned. The
  full suite is otherwise **1932 passed**; coverage gate green (no threshold misses).
- `CLAUDE.md` is COMPILED from `CLAUDE.md.spec.ts` — never hand-edit; edit the spec +
  `node dist/cli.js compile CLAUDE.md.spec.ts` (44 rules).
- **`npm run fmt` reformats `research/`** (huge prettier diff) — use `npx prettier
  --write <files>` and stage ONLY your files. (`npm run fmt:check` was clean here.)
- Commits: **NO session links / NO model IDs** (auto-classifier blocks them).
- Breaking port changes are `feat!` — the CI `validate` job checks the PR TITLE, and
  the release version comes from it.
- After a HookProtocol/port change, run `node scripts/api-extractor.mjs --local` to
  regenerate `etc/*.api.md` (the committed surface gate) — `injectableEvents` landed
  in `etc/vigiles-adapter.api.md`.

### Decisions of record (don't relitigate)

- **Eval lock ≠ cache** — lock = committed integrity stamp (CI gate); cache =
  gitignored local speed. Lock verifies INPUTS match, not model behavior. No nightly.
- **Harness version is provenance, not a hash input** — keeps `--check` binary-free.
- **Inject works on BOTH harnesses** (each harness's `injectableEvents`); only react
  output is CC-confirmed-only. The gap can't recur — it's a tested port contract now.
- **Never edit the user's CLAUDE.md to convey a workflow** — deliver via skill + hook.
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links). `startup/` LOCKED.

## Don't re-read unless the task needs it

- `research/cache-invalidation.md` — the eval lock/cache design record.
- `research/agent-context-delivery.md` — how a plugin delivers context per harness (CC/Codex).
- `research/compiled-hooks-codex.md` — the Codex hook adapter (inject now confirmed; react open).
- `research/roadmap.md` — `🚀 Launch readiness`. `startup/` — git-crypt vault (LOCKED).
