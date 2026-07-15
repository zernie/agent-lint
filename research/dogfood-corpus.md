---
status: active
topic: benchmark
---

# The dogfood corpus — the map + the policy

> **Read this before adding, moving, or removing any dogfood artifact.** "Dogfood"
> here = real/vendored artifacts vigiles tests ITSELF against (real OSS plugins, real
> instruction files, gold sets, task corpora) so CI catches a regression against
> _reality_, not just synthetic fixtures. This is the single index the CLAUDE rule
> `dogfood-vendoring-policy` points at; it is the thing a new session reads to learn
> every dogfood rule at once, instead of re-deriving them by audit.

## Four things get called "dogfood" — only ONE is this corpus

The word is overloaded across four DIFFERENT kinds of thing, each correctly next to
its consumer. Do NOT try to consolidate them — they are not one pile. Only the first
is "the dogfood corpus" this doc governs:

| Location                    | What it actually is                                             | Governed by this doc?                                        |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `test/dogfood/`             | **THE dogfood corpus** — vendored real plugins as test fixtures | ✅ yes                                                       |
| `examples/harness/dogfood/` | **examples** that eval vigiles's OWN skills (trigger/quality)   | no — examples                                                |
| `compiler/gold/`            | the `@vigiles/compiler` package's OWN internal gold sets        | no — package-internal                                        |
| `research/audit-captures/`  | captured audit OUTPUT (`.txt`/`.html`/`.json`) — NOT tests      | no — output, renamed from the misleading `research/dogfood/` |

## The policy (the rules every dogfood artifact follows)

1. **SHA-pin.** A vendored upstream lives in a dir suffixed with the short commit
   (`test/dogfood/<name>@<sha>/`), so the snapshot is reproducible and offline.
2. **MIT-only.** Only MIT-licensed upstreams are vendored verbatim. A repo with no
   license (or a non-permissive one) is NOT committed — its bug is captured as a
   description in `research/oss-pr-drafts.md` instead.
3. **Provenance per slice.** Every vendored slice ships a `LICENSE` (the upstream MIT
   text + copyright) AND a `SOURCE` (upstream URL, path, commit, why-it's-here, the
   minimal slice included). No exceptions — a slice without both is incomplete.
4. **Minimal slice.** Vendor the smallest slice that reproduces the behaviour under
   test, never the whole repo. Trim manifests to the vendored surfaces so the loader
   sees a coherent plugin with no spurious dangling refs.
5. **CI-enforced.** A dogfood artifact that nothing in CI reads is not a guard, it's
   decoration. Every artifact below is either read by a `src/**/*.test.ts` (→ runs
   under `npm run coverage`) or run by a dedicated CI step — or it is explicitly
   labelled MANUAL with the reason.
6. **Refreshable.** Re-pinning is `tools/refresh-vendor.sh` (human-run); the breadth
   sweep is `tools/dogfood-sweep.sh`. Neither runs in CI (they clone the network).

## The map — every dogfood artifact, is it CI-enforced, by what

| Artifact                                                                               | What it is                                                                                            | CI-enforced?                              | By                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/dogfood/<plugin>@<sha>/` (superpowers, oh-my-claudecode, wshobson-accessibility) | Vendored real plugins — loader + scan invariants                                                      | ✅ yes                                    | `src/adapters/claude-code/vendor.test.ts`, `src/scan-vendor.test.ts` (job: test); harness examples (job: harness)                                                 |
| `test/dogfood/madappgang-frontend@6097ad4/`                                            | TRUE-POSITIVE bug fixture (tester.md)                                                                 | ✅ yes                                    | `src/scan-vendor.test.ts`                                                                                                                                         |
| `test/dogfood/davila7-perf-guard@869640b/`                                             | Calibration FP-guard (don't-cry-wolf)                                                                 | ✅ yes                                    | `src/scan-vendor.test.ts`                                                                                                                                         |
| `test/dogfood/instruction-files/*.AGENTS.md`                                           | Vendored langchain / browser-use / mcp-python-sdk AGENTS.md — rule-routing (foreign-safe, no catalog) | ✅ yes                                    | `src/rule-routing-oss.test.ts`                                                                                                                                    |
| Pylint catalog + enabled-state (real `pylint` binary, authored config)                 | Own-repo `enumeratePylintCatalog` + "documented but OFF" routing dogfood                              | ✅ yes (pylint-gated; CI installs pylint) | `src/rule-catalog-oss.test.ts` — config authored (real MIT+pylint repos are rare; the pylint binary + enumeration is the real system)                             |
| `examples/harness/*.harness.mjs`                                                       | Canonical harness examples                                                                            | ✅ yes                                    | `node dist/cli.js test` (job: harness)                                                                                                                            |
| `compiler/` (`@vigiles/compiler`: gate.js, gold/, rules/corpus.json)                   | Rule-synthesis trust-gate soundness dogfood                                                           | ✅ yes                                    | **CI step "Compiler trust gate"** (job: check) → `npm ci --prefix compiler && node compiler/gate.js` (asserts the kept/abstain verdicts, exits non-zero on drift) |
| `bench/corpus/{coding-tasks,headroom-tasks}.mjs` + `verify*.mjs`                       | Task corpus + its correctness-oracle self-checks                                                      | ✅ yes                                    | **CI step "Dogfood corpus guards"** (job: check) → `node bench/corpus/verify.mjs && node bench/corpus/verify-headroom.mjs`                                        |
| `bench/ecosystem/**`, `bench/leaderboard/**`, `bench/{refs,tasks,tdd}/`                | Real-model A/B benchmark + fixtures                                                                   | ⚠️ MANUAL                                 | real-model, costs money — run by hand (`node bench/ecosystem/benchmark.mjs`). The FREE self-checks (row above) are the CI floor.                                  |
| `examples/harness/dogfood/*.eval.mjs`                                                  | Model-invocable skill trigger/quality evals                                                           | ⚠️ MANUAL                                 | need `claude` + model auth — `npm run test:eval`, never in a workflow (write-don't-run policy). Syntax-gated by `src/examples-syntax.test.ts` (job: test).        |

## Per-adapter coverage — the CC-vs-Codex asymmetry (honest, not hidden)

vigiles is multi-harness, so the natural question is "does the dogfood test BOTH
adapters, the way specs do?" Two separate layers, two answers:

- **The ADAPTERS themselves ARE per-adapter enforced.** `src/adapter-contract.test.ts`
  runs the conformance kit over the WHOLE registry in a loop (`for (const adapter of
ADAPTERS)`), so registering an adapter auto-subjects it to every port contract. That
  is the structural "test both harnesses" guarantee — symmetric across CC + Codex.
- **The VENDORED corpus is NOT symmetric.** `test/dogfood/` holds real **Claude Code**
  plugins only; there is **no vendored real Codex repo**. Codex is covered by
  **artificial tmp fixtures** (`src/scan-cli.test.ts` builds an `AGENTS.md` +
  `.codex/config.toml` repo in a tmpdir). So **ports are symmetric; the corpus is
  CC-vendored, Codex-synthetic**. Reason (documented, not an oversight): real Codex
  plugins are rare in the wild. Closing it (vendor a real Codex plugin slice) is a roadmap item.

## Gaps still open (tracked, with the honest disposition of each)

- **The 9 model evals (`examples/harness/dogfood/*.eval.mjs`) have no CI floor beyond
  SYNTAX.** The right staleness mechanism — the eval LOCK (`vigiles eval --check`, wired
  as a CI step) — is a **green no-op** because no locks are committed (committing one
  needs a real `--update` model run). TODO (roadmap): either commit eval-locks so
  `--check` actually gates, and/or add a no-model "each eval's plugin/skillsDir LOADS +
  its skill target RESOLVES" structural floor. Until then a broken eval is caught only
  when someone spends model quota.
- **Codex corpus parity** (see above) — roadmap.
- **`no-orphan-docs` scope — WON'T widen (decided).** Sweeping `compiler/**`/`bench/**`
  is a NET-NEGATIVE: `compiler/` has 130+ `.md` (mostly `node_modules`) and `bench/` has
  fixture `SKILL.md`/`CLAUDE.md` that aren't docs, so the glob would flag noise. The
  anti-rot mechanism is instead this index's cross-links (below) — the key READMEs get an
  inbound reference here, so they're not orphaned. Not a gap; a deliberate scoping.
- **`compiler/` lint/format — accepted (separate package).** `compiler/` is prettier-
  ignored + outside `eslint src/` because it is a SEPARATE CJS package + a reproducible
  paper artifact with machine-generated code under `generated/`/`selftest/`. The root
  `eslint src/` correctly scopes to the shipped library. If it ever needs linting it gets
  its OWN `compiler/package.json` script, not inclusion in the root sweep.

## Key corpus READMEs (linked so they're not orphaned)

- `test/dogfood/README.md` — the canonical per-slice provenance table + sweep manifest.
- `compiler/README.md` — the `@vigiles/compiler` pipeline + the two-stage trust gate.
- `compiler/gold/SOUNDNESS.md` — the failure taxonomy the gold set is built on.
- `bench/ecosystem/README.md` + `bench/ecosystem/SOURCES.md` — the real-model A/B benchmark.

## Related

- `research/benchmark-methodology.md` — the A/B-over-real-task method the corpus serves.
- `research/compiler-end-to-end-flow.md` — the rule-synthesis pipeline the gate anchors.
- `research/eval-coverage-and-isolation.md` — the R1/R2/R3 rung model behind what's testable free vs manual.
