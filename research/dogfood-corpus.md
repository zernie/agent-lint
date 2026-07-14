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

| Artifact                                                                               | What it is                                              | CI-enforced? | By                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/dogfood/<plugin>@<sha>/` (superpowers, oh-my-claudecode, wshobson-accessibility) | Vendored real plugins — loader + scan invariants        | ✅ yes       | `src/adapters/claude-code/vendor.test.ts`, `src/scan-vendor.test.ts` (job: test); harness examples (job: harness)                                                 |
| `test/dogfood/madappgang-frontend@6097ad4/`                                            | TRUE-POSITIVE bug fixture (tester.md)                   | ✅ yes       | `src/scan-vendor.test.ts`                                                                                                                                         |
| `test/dogfood/davila7-perf-guard@869640b/`                                             | Calibration FP-guard (don't-cry-wolf)                   | ✅ yes       | `src/scan-vendor.test.ts`                                                                                                                                         |
| `test/dogfood/instruction-files/*.AGENTS.md`                                           | Vendored langchain/browser-use AGENTS.md — rule-routing | ✅ yes       | `src/rule-routing-oss.test.ts`                                                                                                                                    |
| `examples/harness/*.harness.mjs`                                                       | Canonical harness examples                              | ✅ yes       | `node dist/cli.js test` (job: harness)                                                                                                                            |
| `compiler/` (`@vigiles/compiler`: gate.js, gold/, rules/corpus.json)                   | Rule-synthesis trust-gate soundness dogfood             | ✅ yes       | **CI step "Compiler trust gate"** (job: check) → `npm ci --prefix compiler && node compiler/gate.js` (asserts the kept/abstain verdicts, exits non-zero on drift) |
| `bench/corpus/{coding-tasks,headroom-tasks}.mjs` + `verify*.mjs`                       | Task corpus + its correctness-oracle self-checks        | ✅ yes       | **CI step "Dogfood corpus guards"** (job: check) → `node bench/corpus/verify.mjs && node bench/corpus/verify-headroom.mjs`                                        |
| `bench/ecosystem/**`, `bench/leaderboard/**`, `bench/{refs,tasks,tdd}/`                | Real-model A/B benchmark + fixtures                     | ⚠️ MANUAL    | real-model, costs money — run by hand (`node bench/ecosystem/benchmark.mjs`). The FREE self-checks (row above) are the CI floor.                                  |
| `examples/harness/dogfood/*.eval.mjs`                                                  | Model-invocable skill trigger/quality evals             | ⚠️ MANUAL    | need `claude` + model auth — `npm run test:eval`, never in a workflow (write-don't-run policy). Syntax-gated by `src/examples-syntax.test.ts` (job: test).        |

## Gaps still open (tracked, not silently accepted)

- **`no-orphan-docs` scope.** `src/core/orphans.ts` sweeps `docs/**` + `research/**`;
  `compiler/**/*.md` and `bench/**/*.md` are NOT swept, so their READMEs can rot
  undetected. This index links the key ones (below) so they have an inbound
  reference; widening the sweep is a follow-up (it flags every unreferenced `.md`
  in those trees, so it needs a pass to cross-link or exclude each first).
- **`compiler/` lint/format.** `compiler/` is prettier-ignored + outside `eslint src/`
  wholesale — so vigiles's OWN authored code there (gate.js, classify.js) escapes
  root lint/format. Intentional (separate toolchain) but worth revisiting.

## Key corpus READMEs (linked so they're not orphaned)

- `test/dogfood/README.md` — the canonical per-slice provenance table + sweep manifest.
- `compiler/README.md` — the `@vigiles/compiler` pipeline + the two-stage trust gate.
- `compiler/gold/SOUNDNESS.md` — the failure taxonomy the gold set is built on.
- `bench/ecosystem/README.md` + `bench/ecosystem/SOURCES.md` — the real-model A/B benchmark.

## Related

- `research/benchmark-methodology.md` — the A/B-over-real-task method the corpus serves.
- `research/compiler-end-to-end-flow.md` — the rule-synthesis pipeline the gate anchors.
- `research/eval-coverage-and-isolation.md` — the R1/R2/R3 rung model behind what's testable free vs manual.
