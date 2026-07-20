---
status: active
topic: misc
---

# Feature index — what vigiles can DO (capability map)

> The keyFiles map in the root `CLAUDE.md` indexes the CODE (per file). This indexes the
> CAPABILITIES (per feature): what each does, its status, and the entry point (CLI verb / API
> export / skill / file). Contributor-facing; grouped by the four instruments of the one loop
> (**declare → check**): VERIFY · GATE · MEASURE · OBSERVE, then the cross-cutting layers.
>
> **Status legend:** ✅ shipped · 🟡 partial (works, gaps noted) · 🧪 experimental (built, not in
> the shipped story) · ⬜ unbuilt (designed/roadmap). Keep this in sync when a capability's
> status changes (sibling of `rules-docs-in-sync`).

## VERIFY — cross-reference the harness (author-time, free, deterministic)

| Feature                                  | What it does                                                                                                                                                         | Status | Entry point                                                         |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :------------------------------------------------------------------ |
| Cross-referencing engine                 | `enforce("eslint/…")` verifies a rule EXISTS and is ENABLED across 7 catalogs (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar) — the core moat              | ✅     | `enforce()` · `src/core/linters.ts`                                 |
| Typed spec → compiled markdown           | `.spec.ts` → CLAUDE.md/AGENTS.md with SHA-256 integrity hash; refs validated (paths via fs, scripts via package.json, rules via linter APIs)                         | ✅     | `vigiles compile` · `src/core/compile.ts`                           |
| `audit` report + rings                   | Zero-config Lighthouse-style report: 4 category rings (Truthfulness/Triggering/Structure/Tested) + Safety, A–F, each finding + inline fix, shareable HTML + `--json` | ✅     | `vigiles audit` · `src/scan.ts`, `src/audit-score.ts`               |
| Lint rules (~28)                         | Per-commit gate over the SAME detectors audit uses (one-detector-no-drift); severity-configurable, grouped structural/workflow/nudge                                 | ✅     | `vigiles lint` · `docs/rules/*`                                     |
| Subagent tool-contract                   | Flags a subagent's `tools:` entry that's never-available or a close typo (the moat on tools)                                                                         | ✅     | `subagent-tool-contract` · `src/core/tool-contract.ts`              |
| MCP verification                         | Server can start (config), tool resolves to a declared server, hook target resolves                                                                                  | ✅     | `mcp-config`/`mcp-tool-resolves`/`mcp-hook-target-resolves`         |
| Hook-event / hook-script                 | Typo'd event that never fires; hook script missing on disk                                                                                                           | ✅     | `hook-events`/`hook-script-exists`                                  |
| Skill-resource resolves                  | A skill's bundled-resource ref (script/reference/asset) resolves on disk (high-precision — ignores illustrative prose paths)                                         | ✅     | `skill-resource-resolves` · `src/core/skill-resources.ts`           |
| Description-overlap                      | Two model-invocable skills with near-identical descriptions (NCD proxy for selection collision)                                                                      | ✅     | `description-overlap` · `src/core/description-overlap.ts`           |
| Description-budget                       | A skill description too long → buries the trigger signal                                                                                                             | ✅     | `skill-description-budget`                                          |
| Lethal-trifecta                          | A unit holding all three capability legs (read+ingest+exfil) — graded at reduced weight (advisory-ish), shown in Safety ring                                         | ✅     | `lethal-trifecta` · `src/audit-score.ts`                            |
| Static effect-surface / purity           | Read-only vs side-effecting tool split; purity ladder (pure/bounded/unrestricted); typed purity (`pure`+`Bash` won't tsc)                                            | ✅     | `src/core/effects.ts`, `src/adapters/claude-code/typed-spec.ts`     |
| Deterministic Bash-effect classifier     | No-LLM "is this command read-only?" via real shell AST (mvdan-sh) + fail-closed on undecidable                                                                       | ✅     | `src/core/bash-effects.ts`                                          |
| generate-types / generate-schema         | `.d.ts` so tsc proves `.spec.ts` refs; JSON Schema so a YAML LSP autocompletes frontmatter                                                                           | ✅     | `vigiles generate types`/`schema`                                   |
| generate-harness (whole-harness codegen) | ONE `harness.gen.ts` registry so `tsc` cross-checks the WHOLE harness (dangling delegate → tsc error, dup names, capability lattice)                                 | 🟡     | `vigiles generate harness` · `src/core/generate-harness.ts`         |
| Integrity / sidecar                      | SHA-256 detects hand-edits of compiled markdown; per-spec input manifests                                                                                            | ✅     | `integrity` · `src/core/integrity.ts`, `sidecar.ts`                 |
| Coverage / orphans / compose             | Linter+script coverage thresholds; orphan-doc detector (opt-in); sync-tool (Ruler/rulesync) compatibility                                                            | ✅     | `coverage`/`orphan-docs` · `src/core/{coverage,orphans,compose}.ts` |
| Capability-diff (PR comment)             | "This PR widened the agent's blast radius" read off the effect surface                                                                                               | ⬜     | roadmap (the moat+adoption bridge)                                  |

## GATE — deterministic stop before irreversible (loop-time, free)

| Feature                               | What it does                                                                                                                                                                                          | Status | Entry point                                                     |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------------------------------------------------------------- |
| Compiled hooks                        | Author a hook as a pure typed `(event)=>Decision` against a closed vocab → compile to protocol; whole bug classes unrepresentable (no exit-code, AST-backed matcher, capability=API-surface, stamped) | ✅     | `vigiles/hook` · `vigiles compile` · `src/core/hook-program.ts` |
| Hook roles                            | tool-gate/file-gate/prompt-gate/stop-gate/inject/react — each →its own return type                                                                                                                    | ✅     | `defineHook`/`definePromptGate`/…                               |
| Observe (shadow) mode                 | Compute the decision, RECORD the would-be block, never block — the rollout primitive                                                                                                                  | ✅     | `mode:'observe'` · `gateAction`                                 |
| Context providers                     | Decide on external state (git branch, etc.) via declared `needs:` — runtime gathers, decide() stays pure                                                                                              | ✅     | `src/core/hook-providers.ts`                                    |
| Guardrail battery (verify your guard) | Feed a disaster catalog to any hook, assert it BLOCKS — "prove your safety hook actually blocks" (2/7 hand-written vs 7/7 compiled dogfood)                                                           | ✅     | `vigiles/unit` · `src/guardrail-check.ts`                       |
| Typed guards (order/flow)             | requireBefore/confine/block from a closed vocab, live session ledger                                                                                                                                  | 🧪     | `src/core/guards.ts` (superseded by compiled hooks)             |

_Honest floor: compile/verify fix AUTHORING+LOGIC, not DELIVERY — CC's subagent-bypass (#34692) caps live enforcement. A gate is a strong default, never an unbypassable wall._

## MEASURE — test the assembled harness (on your subscription)

| Feature                          | What it does                                                                                                                                                                                  | Status | Entry point                                             |
| :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :------------------------------------------------------ |
| runHook (unit tier)              | Pipe a synthesized event to a hook process, check block/allow — no model, reaches every event                                                                                                 | ✅     | `runHook` · `src/run-hook.ts`                           |
| runHarnessTest (deterministic)   | Real `claude` CLI + real hooks/settings against a scripted mock model — key-free, deterministic                                                                                               | ✅     | `runHarnessTest` · `src/harness-test.ts`                |
| runEval (real model A/B)         | Drive the real model across arms×trials, mean±se, cost/latency/tokens, budget cap                                                                                                             | ✅     | `runEval` · `src/eval.ts`                               |
| **measureTriggerRate**           | **Does a skill's description actually FIRE across varied prompts (recall) + not over-fire (precision)** — the felt-pain wedge; realistic selector (Sonnet), body-stub for cheap firing checks | ✅     | `measureTriggerRate` · `src/eval.ts`                    |
| Selection-collision matrix       | N×N — does sibling skill j hijack skill i's prompt (CC-only)                                                                                                                                  | ✅     | `measureSelectionMatrix`/`assertNoCollision`            |
| Check vocabulary                 | Declarative checks-as-data over one Trace, evaluated strict (throw) OR scored (rate±se)                                                                                                       | ✅     | `vigiles/testing`/`unit` · `src/check.ts`               |
| judged (LLM-as-judge)            | Model-graded rubric check inside the sync eval                                                                                                                                                | ✅     | `judged()` · `src/judge.ts`                             |
| Significance / regression gating | Welch's t-test noise floor (assertSignificant); committed baseline diff (assertNoRegression)                                                                                                  | ✅     | `src/stats.ts`, `src/eval-baseline.ts`                  |
| Eval lock (CI staleness gate)    | Committed integrity stamp; `--check` replays without a model call, `--update` records; harness-version aware                                                                                  | ✅     | `vigiles eval --check/--update` · `src/eval-lock.ts`    |
| Eval cache (local speed)         | Record/replay so editing `measure` re-scores for free; content-hash keyed                                                                                                                     | ✅     | `src/eval-cache.ts`                                     |
| Tool interception                | A real-model run that DECIDES to push / hit a paid API is intercepted (prevented) + still lands in the Trace                                                                                  | ✅     | `interceptTools` · `src/tool-intercept.ts`              |
| Sandbox / egress                 | Untrusted plugin code confined (bubblewrap netns); allowlisted real egress (nft)                                                                                                              | 🟡     | `src/sandbox.ts`, `src/egress.ts` (Linux; macOS parked) |
| Property testing (hooks)         | Invariant-test a hook's (event)→decision over generated events                                                                                                                                | ✅     | `propertyHook` · `src/run-hook.ts`                      |
| Ecosystem benchmark              | Real-model A/B of hyped skills over a neutral task corpus (the debunk engine)                                                                                                                 | 🟡     | `bench/ecosystem/` (manual, not published)              |

## OBSERVE — flight recorder over real sessions (free)

| Feature                | What it does                                                                                                                                        | Status | Entry point                          |
| :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :----------------------------------- |
| Runs ledger            | One local agent-readable append-only `.vigiles/runs.jsonl` every instrument writes to (hook decision, contract allow/deny, skill fire, eval result) | 🟡     | `src/observe.ts` (unify-in-progress) |
| debug-my-harness skill | Reads the ledger to diagnose why the harness misbehaved (skill fires/collisions, wrong-allow, drift) → recommends promote-prose/differentiate       | ✅     | `skills/debug-my-harness/`           |
| Promote-prose bridge   | observe finds a rule both IGNORED and DECIDABLE → promote prose to a typed gate                                                                     | 🟡     | `strengthen` skill                   |

## Cross-cutting layers

**Typed spec authoring depth** (what markdown can't express): agent()/skill() tool contracts + `disallowedTools` deny-side ✅; purity floor + `effect()` boundary ✅; railway `result()`/`delegate()`/`recover()` outcome contracts ✅; typed composition `pipe(producer, pipeStep(agent, needs({…})))` cross-checks handoffs at tsc time ✅; whole-harness registry 🟡. → `src/core/spec.ts`.

**Multi-harness**: Claude Code ✅ (default) + Codex ✅ (`vigiles/codex`, layer-2 proven against real binary; subagents excluded by design); 5 injectable ports (dialect/layout/runtime/hook-protocol/model-mock) + `HarnessAdapter` bundle + conformance kit; OpenCode 🧪 (prototype). Adding a harness = one object. → `src/adapters/`, `vigiles/adapter`.

**Shipped model-invocable skills**: `test-harness` (picks the tier + writes/maintains the test), `strengthen` (guidance→enforce upgrade), `edit-spec` (change CLAUDE.md via its spec), `debug-my-harness` (read the ledger). User-invoked: `adopt-spec`, `linter-docs`. → `skills/`.

**CLI + GHA**: ~10 human verbs (`init`/`compile`/`lint`/`audit`/`scan`/`test`/`eval`/`generate`) + a hidden `hook-runtime <kind>` umbrella for emitted runtime entrypoints; the GitHub Action wraps the published CLI (sticky PR comment, annotations, job summary). → `src/cli.ts`, `action.yml`.

**Adoption engine (near-term priority, mostly unbuilt)**: the at-scale ecosystem benchmark ⬜, capability-diff PR comment ⬜, covering-array interaction eval ⬜, the leaderboard (engine ✅, corpus thin, unpublished). → `research/roadmap.md`.

## How to read status at a glance

`grep -c "✅" research/feature-index.md` etc. The dense ✅ column is VERIFY + MEASURE (the shipped core); the ⬜ rows cluster in the adoption engine (benchmark/capability-diff/covering-array) — the unbuilt, higher-leverage-for-adoption work. See `research/roadmap.md` for the ranked build order and `harness-state-space.md` for why each instrument exists.
