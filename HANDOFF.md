# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.
>
> ⚠️ **THIS FILE IS PUBLIC** (open-source repo). NO STRATEGY here — business
> direction, monetization, competitive framing, and personal plans live ONLY in the
> `startup/` vault. HANDOFF may POINT to the vault, never name or describe its
> contents. NEVER name a specific user/company/figure here (public). (See `doc-tiers`.)

## RESUME HERE

**Branch `claude/readme-eval-docs-fjwhhu`** (off `main`). This session: README eval-cost
clarity + the **EXPERIMENTAL R3 disposable-service tier** + a **promptfoo migration path** +
a hard **safety pass**. All pushed; **no PR opened**. Goal was "let a team run real
side-effect + behavior skill evals on vigiles (on the sub) instead of promptfoo."

**Shipped (commits on the branch):**

- `docs` (4c73cf8): README eval section leads with the caveman COST case + a real measured
  verdict (762→842 out tok, +11%, correctness intact, $0 on sub).
- `feat(experimental)` (1c52083): R3 tier under the quarantined **`vigiles/experimental`**
  subpath (`experimental_` prefix + `@experimental` JSDoc + STABILITY note + api-extractor
  tracked). `experimental_startServices` + `ServiceSpec`/`ServiceHandle`/`ServiceSession`/
  `ContainerRuntime` port (`src/services.ts`) + a REAL Docker backend `makeDockerRuntime` /
  `experimental_dockerRuntime` (`src/services-docker.ts`: pure builders + injected
  `DockerExec`/`NetProbe` seams, mirroring `sandbox.ts`). PLUS the promptfoo migration guide
  (`docs/migrating-from-promptfoo.md`) + example (`examples/harness/from-promptfoo.mjs`).
- `feat(experimental)` (196b43e): `experimental_withServices` scope helper + measureArms
  example (`examples/harness/measure-with-service.mjs`) + the **SAFETY pass** — fixed a
  false-safety **egress OVERCLAIM** (egress is NOT pinned in the eval tier; the wall is
  deferred), added loud safety warnings in docs + JSDoc + examples.
- `test(experimental)` (305b77c): real-tcp readiness test (covers the real `netProbe`, no
  docker) + `examples-syntax.test.ts` (`node --check` every example in CI).

Design record: `research/r3-disposable-services.md`. Public guide: `docs/measuring-skills.md`
§ Experimental + § Safety.

**OPEN (awaiting the user):** I ASKED whether to graduate `src/services.ts` +
`src/services-docker.ts` into the vitest **100% coverage allowlist** (marking the real-daemon
seams `v8 ignore` like `sandbox.ts`). NOT done yet — do only if the user says yes.

**NEXT STEPS (the R3 loop, deferred + documented, not blocking):**

- per-trial container reset (needs an eval-loop hook in `eval.ts`; today services live
  per-RUN → make the task self-contained or `trials: 1`).
- the egress wall (skill reaches only model + service) — until it lands, R3 safety story is
  "run in an isolated env + keep real creds out (recommend `ephemeralEnv`)".
- first-class `services` option on `measureArms` + `ctx.service(name)` (today: compose via
  `experimental_withServices`).
- safe-default credential-scrub; a write-don't-run OSS-skill-through-R3 dogfood.

**TEST STATUS:** Linux real-docker integration RUNS in CI (`ubuntu-latest` has Docker) via a
gated `describe.skipIf(!dockerUp)` real-redis test. macOS UNTESTED (docs say Linux-first). No
OSS-skill-through-R3 dogfood (inherently needs model auth). Experimental files sit OUTSIDE the
100% coverage gate (deliberate — see the OPEN item).

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the ID→name index; strategy is there.
- `research/roadmap.md` — the front-door (technical) roadmap.

## Gotchas (still live)

- **Real-model evals run in-container on the SUBSCRIPTION** (`claude -p`; `apiKeySource:"none"`,
  `$0` metered). Cold start ~20s+; a first probe may time out — retry longer.
- **A SKILL.md is NOT a skill unless registered** — a bare `SKILL.md` in a run's cwd never loads;
  use `arm.pluginDir` (`--plugin-dir`) or `skillsDir`. `CLAUDE.md` DOES auto-load as memory.
  vigiles WARNS (`unregisteredSkillFiles`). Verify activation with a style/`skillResolved` check.
- **The 100% coverage gate is an EXPLICIT allowlist** in `vitest.config.mjs` (`coverage.include`).
  A new pillar file must be added there AND its real-IO seams marked `/* v8 ignore */` (as
  `sandbox.ts`/`egress.ts` do). Experimental files are intentionally NOT in the list yet.
- **Transient proxy TLS** — `claude -p` trials sometimes fail "Self-signed certificate / Unable
  to connect to API" (agent-proxy CA). Flaky, not fatal; re-run, don't read a single 0-tok trial.
- `CLAUDE.md` (root + `src/` + `core/` + `research/`) is COMPILED from `.spec.ts` — edit the spec +
  recompile (`node dist/cli.js compile <spec>`), NEVER hand-edit. (A PostToolUse hook recompiles.)
- **COMMIT SIGNING is BROKEN in-container** (0-byte pubkey) → "Unverified"; email correct. Don't amend.
- `dialect-drift.test.ts` fails LOCALLY (installed vs pinned claude-code); CI pins it. Env-only.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start; strategy is there. Filenames + commit
  messages are PUBLIC → opaque IDs + generic `chore: vault` messages.
- **SCOPED-SESSION GITHUB ACCESS** — WebFetch blocked by net policy; WebSearch works. Cross-GitHub
  discovery via WebSearch or sourcegraph + `raw.githubusercontent`.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.

## Decisions of record (don't relitigate)

- Repo is PUBLIC → strategy is VAULT-ONLY (`doc-tiers`). HANDOFF/research/CLAUDE.md/README = public.
  **Never name a specific user/company/$ figure in the repo** — one such mention was scrubbed from
  branch history this session via `git reset --soft` + force-push-with-lease.
- **R3 is EXPERIMENTAL** — lives on `vigiles/experimental` only, NOT in the README, NOT a
  stable-surface change. The Docker backend is real but the tier is unstable.
- **R3 safety posture (load-bearing):** the disposable container is the ONLY isolation; the run
  ENVIRONMENT's isolation is the operator's job. NEVER present `endpoints` / "can't phone home" as
  a live guarantee (false-safety) until the egress wall ships. Credential-scrub is OPT-IN for now
  (recommend `ephemeralEnv`); safe-default deferred because an over-aggressive scrub breaks claude auth.
- **Don't build a promptfoo config auto-converter** — a half-parser mis-maps unsupported assertions
  = false confidence. A mapping guide + worked example instead (shipped).
- Vault filenames MUST be opaque IDs; commit messages for vault changes MUST be generic.
