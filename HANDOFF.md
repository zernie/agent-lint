# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/eval-cache-invalidation-vd1mzj` — PR #53 OPEN, driving merge-when-green.**
(github.com/zernie/vigiles/pull/53 — title `feat!: eval lock (CI staleness gate) +
full Codex parity for hooks & inject`. The `!` is load-bearing: breaking change —
`HookProtocol.injectableEvents` is now required + `EvalDriver.harness` added.)

**RESUME STATE: in the autofix/merge loop.** Subscribed to PR #53 activity; a
`send_later` check-in re-polls CI (~every 8-9 min, last armed for the 3da87a1 HEAD)
and SQUASH-MERGES once all 6 checks are green (validate/describe/harness/e2e/test/
check). If a job fails → fetch logs, fix, push. If the Codex review bot leaves a NEW
real soundness comment → fix it. Merge when CI is GREEN (the gate is CI, not the bot
going quiet). Keep the `feat!:` squash title. Subscription ends only at merge/close.

This session built the **eval LOCK** (a committed CI staleness gate for evals run on
a subscription), closed the **Codex parity** gaps (hook inject as a tested port
contract; hook fan-out + `init` wiring of nudges into `.codex/config.toml`), opened
PR #53, and hardened the lock against **5 Codex-review soundness findings** (below).

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
8. **MULTI-HARNESS HOOK FAN-OUT** (user spotted it: "shouldn't compile compile for
   both since both can be enabled?"). Instruction files already mirror to both, but
   hooks installed into ONE harness only (`installHooks` ignored `config.harness`,
   auto-detected one). Fix: `resolveHarnessAdapters` (adapter-registry.ts) returns
   the FULL declared set (flag→one, config list→all, else detect→one); `installHooks`
   loops, merging the SAME compiled hook into `.claude/settings.json` AND
   `.codex/config.toml`, each native format, per-harness warnings. Plus the `init` CI
   workflow is now harness-aware — the test job installs `@anthropic-ai/claude-code`
   and/or `@openai/codex` per declared harness (`harnessTestBinaries`). Skills compile
   byte-identical across harnesses; subagents are CC-only by design — so hooks + the
   CI binary were the real fan-out gaps. Tests: resolveHarnessAdapters units, a
   both-harness hook-install e2e (hook.test.ts), harness-aware workflow e2e
   (cli.test.ts). Research §4 in multi-harness-compile.md.
9. **CODEX HOOK WIRING in `init`** (user: "if you can fix it, fix"). vigiles's own
   nudge hooks reached CC via the marketplace plugin but NOT Codex (skills-only). Fix:
   `codexPluginHooks`/`applyCodexPluginHooks` (setup-plan.ts) + `wireCodexHooks`
   (cli.ts) write the eval-lock + refs nudges into `.codex/config.toml` as direct
   `npx vigiles hook-runtime` commands (idempotent, preserves the user's config).
   Deferred-loud on Codex: SessionStart lint summary + compile/pre-edit guards.
10. **PR #53 + 5 CODEX-REVIEW FIXES** (all real soundness gaps in the lock, all on my
    code). The input-hash bug class — a model-facing input omitted from the staleness
    hash → `--check` replays stale results — is now CLOSED on BOTH seams:
    (a) `evalArmsInputs` (runEval): added **stubs** + **ephemeralEnv**;
    (b) `triggerInputs` (trigger-rate): added **harness** (via new optional
    `EvalDriver.harness`, default "claude-code") so a Claude-recorded report is stale
    if switched to Codex. PLUS (c) **slug-collision** guard in `readLock` (rejects a
    lock whose stored `name` differs → safe miss, never replays the wrong eval); and
    (d) **unnamed eval in `--check`** now THROWS instead of calling the model (the
    no-model-in-CI contract). Each proven by a wiring/unit test; coverage held at 100%.

### DO NEXT / OPEN DECISIONS

- **PRIMARY: finish the merge loop on PR #53** (see RESUME STATE above). Squash-merge
  when CI green; keep the `feat!:` title.
- **react output on Codex** is the remaining CC-confirmed-only hook piece — confirm
  against the real `codex` binary before relying on it (gated, like the rest).
- **Pre-release P0 (roadmap'd):** run the eval tier against the REAL `codex` binary
  ONCE (the one "claimed but never executed end-to-end" Codex piece).

### Gotchas

- **`dialect-drift.test.ts` FAILS here** — asserts the INSTALLED claude-code SDK tool
  set matches the pinned `VALIDATED_CC_VERSION`; this container runs a DIFFERENT CC
  (36 tool types vs the pinned 17/38). PRE-EXISTING + UNRELATED; passes in CI where CC
  is pinned. ~1949 tests otherwise pass. NB its failure SUPPRESSES the coverage table
  locally — to read coverage, temporarily skip it (`sed -i 's/const gate = pkg ? it :
it.skip;/const gate = it.skip;/; s/const eventsGate = bundle ? it : it.skip;/const
eventsGate = it.skip;/' src/dialect-drift.test.ts`), run, then `cp` it back.
- **COVERAGE TRAP (bit me twice):** the gate is 100% lines/statements/functions on the
  `vitest.config.mjs` include list. A branch only reachable when `GITHUB_ACTIONS` is
  set (e.g. `emitLockMessage`'s annotation path) inverts in CI — the ELSE branch then
  goes uncovered. ALWAYS verify with `GITHUB_ACTIONS=true npx vitest run --coverage`
  (not the bare local run), and write tests that toggle/delete the env var to hit both
  sides. A sort comparator needs ≥2 elements to be covered.
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
