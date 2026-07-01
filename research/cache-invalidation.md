---
status: shipped
topic: eval
---

# Cache invalidation + eval staleness — best practices and what vigiles does

> Research of record behind the two eval staleness mechanisms — the record/replay
> CACHE (`src/eval-cache.ts`, 2026-06-17) and the committed eval LOCK
> (`src/eval-lock.ts`, 2026-06-30). Synthesizes how mature content-addressed
> caches (Bazel, Turborepo, Nx, Gradle, ccache, Jest, webpack, ESLint) and LLM
> caches (promptfoo, LangChain, Helicone) design keys + invalidation, then records
> the decisions for vigiles. Companion to [`docs/eval-architecture.md`](../docs/eval-architecture.md).

## Two mechanisms, not one: CACHE (local speed) vs LOCK (CI staleness)

These are different tools and conflating them causes confusion. Keep them apart:

|             | **eval CACHE** (`eval-cache.ts`)   | **eval LOCK** (`eval-lock.ts`)                     |
| ----------- | ---------------------------------- | -------------------------------------------------- |
| Purpose     | local iteration speed              | CI staleness detection                             |
| Mechanism   | keyed store, skip the model call   | integrity hash of inputs                           |
| Lifecycle   | **gitignored**, throwaway          | **committed**, reviewed in the diff                |
| Question    | "can I skip re-calling the model?" | "did inputs change without a re-run?"              |
| Analogy     | build cache / ccache               | `Cargo.lock` + `npm ci`, `jest --ci`/`cargo-insta` |
| Runs in CI? | no (local only)                    | **yes** — `eval --check`, binary-free              |

The driving problem the LOCK solves: real-model evals authenticate as your own
`claude` CLI on your **subscription**, so they only run **locally** — never in CI
(no metered key; a subscription can't be driven headless). So CI can't _run_ the
eval; it can only **verify** that the committed numbers still match the current
inputs. That's an integrity hash, not a cache — the founder's own intuition
("it's more of an integrity hash") and exactly right. The same
integrity-hash-of-inputs pattern vigiles already ships in `core/integrity.ts`
(compiled markdown) and `core/sidecar.ts` (`.inputs.json` spec inputs), applied a
third time to eval results.

## The eval LOCK (the CI staleness gate)

`vigiles eval --update` (local, on the sub) records each named eval's report to a
committed `.vigiles/eval-locks/<slug>.lock.json`; `vigiles eval --check` (CI)
recomputes the input hash and fails "stale, re-run `--update`" on a mismatch,
**without a model call**. The committed diff of `recall: 0.90 → 0.65` IS the
quality gate a human reviews — the snapshot/lockfile pattern.

**The clean split that makes replay sound and `measure` re-scorable.** The lock
stores only the model's **observed behavior** (the report). The script's own
assertions (`assertTriggerRate`/`assertSignificant`) **re-run live** against the
replayed report on every `--check`. So:

- change an **input** (skill/prompt/model) → the recorded behavior is for a
  different world → `inputsHash` changes → **stale** (re-run locally).
- change only the **threshold/assertion** → the recorded behavior is still valid
  → valid **replay**, no model call, and the script's new assertion judges the
  replayed numbers correctly.

`inputsHash` = `SHA-256(canonical({ model, evalApiVersion, <seam inputs> }))`,
where `<seam inputs>` is the task/files/settings/sorted-tools/pluginDirHash for
`runEval`, or the (stubbed) skill-dir hash + prompts + model + tools for
`measureTriggerRate`. A nice property of the trigger seam: it hashes the
**stubbed** plugin dir (trigger-rate stubs bodies, since selection is by
frontmatter), so editing a skill's BODY is _not_ stale (it isn't measured) but
editing its DESCRIPTION is — the hash tracks exactly the measured surface.

### Honest scope — no fiction (we killed the nightly run)

The lock promises **"your committed results match your current inputs,"** NOT
"your results reflect current model behavior." Those differ, and the second is
**uncatchable** in this cost structure — the model is only ever driven locally,
on the sub, when a human chooses to. Earlier design notes leaned on a "nightly
live run" as the drift backstop; **nobody runs that**, so designing around it is
a lie. We dropped it. Model/harness drift is caught when YOU re-run `--update`
and review the moved numbers. The common, real bug — _edit a skill, forget to
re-eval, ship stale numbers_ — IS caught deterministically, which is the point.

The lock absorbs the role of `eval-baseline.ts`'s live-rerun regression check:
without a nightly tier, that comparison only ever happens at `--update` time, so
`--update` surfaces the per-number delta vs the prior lock (`diffReportNumbers`)
for the human to review. One committed artifact, two consumers (`--check` gate +
`--update` review), no separate nightly tier.

### Why the harness version is provenance, NOT a hash input

Tempting to fold the `claude` version into `inputsHash` (a CC bump can shift
behavior). **We don't**, for two reasons: (1) `--check` runs in CI where `claude`
is **pinned** to a fixed version, while a dev's local `claude` is whatever they
have — hashing the version would false-trip `--check` on every PR where those
differ; (2) it's the honest-scope line above — the gate is about author-controlled
inputs, and keeping the version out is what lets `--check` stay **binary-free +
deterministic** in CI. The version is recorded on the lock as provenance + a soft
`--update` note. (The eval CACHE _does_ key on it — that's local replay
soundness, a separate axis; see below.)

### Cold-start (smooth adoption)

`eval --check` is a green **no-op** until the first lock is committed
(`anyLocksCommitted`): a fresh `vigiles init` repo with eval files but no locks
doesn't go red. Once any lock exists, every named eval is held to having a fresh
one (a new unlocked eval reads as stale — the correct "you forgot to commit"
nudge). The GHA exposes it as `command: eval-check`; `init` scaffolds the
`eval-check` CI job.

## The cache in one line

`cacheKey = SHA-256(task, model, tools-as-a-set, resolved files, settings, env,
pluginDirHash, harnessVersion, trialIndex, CACHE_FORMAT_VERSION)`; the **scoring
function is deliberately excluded** so editing `measure` re-scores recorded runs
for free. Replay restores the post-run filesystem so `ctx.file()` / `ctx.sh()`
stay sound.

## Fast-evolution edges (model + harness change underneath you)

A replay cache for agent behaviour has a sharper staleness problem than a build
cache: the model **and** the harness binary evolve continuously, and a stale
replay silently changes eval results. The three edges, and where each stands:

- **Harness binary version (the `claude` CLI) — KEYED in the CACHE, per-adapter.**
  The CLI upgrade changes the system prompt + tool definitions, which steer
  behaviour as much as the model, so the **cache** keys on it (`harnessVersion`,
  resolved once per run). But _what counts as a behavior-significant version_ is
  **per-harness**, so the reduction lives on the runtime port
  (`HarnessRuntime.versionKey`), NOT a universal `major.minor` rule — see the
  cadence data below. (The LOCK does NOT hash it — provenance only, per the
  section above.)

### Version cadence: Claude Code vs Codex have OPPOSITE semantics (the data)

Measured from npm (2026-06-30) — this is _why_ `versionKey` is a port method:

- **Claude Code — `major.minor` is meaningful + stable.** 452 published versions
  in 16 months, but only **4 distinct `major.minor`**: `0.2` (Feb 2025) → `1.0`
  (May 2025) → `2.0` (Sep 2025) → `2.1` (Jan 2026) — a minor bump ~every 3–4
  months; everything else is daily patches. So `claudeCodeRuntime.versionKey` →
  `major.minor`: a real behavior boundary, rare enough not to churn the cache.
- **Codex — perpetual `0.x`, the _minor_ IS the patch cadence.** 3147 versions in
  14 months, **134 distinct `major.minor`** = ~2 minor bumps/week (now `0.143`).
  Keying `major.minor` like CC would churn the cache **weekly**, so
  `codexRuntime.versionKey` → `""` (opt out of version partitioning; rely on the
  dated model id + `evalApiVersion`).

The old "CC ships daily → exclude the version" note conflated _patch_ cadence
(daily) with _minor_ cadence (quarterly) — it was wrong about CC and accidentally
right about Codex. The port method makes the decision per-adapter, where it
belongs (a future harness supplies its own reduction).

- **Model alias re-points (e.g. `sonnet` → a new snapshot) — WARNED, not
  auto-invalidated.** No provider exposes a weight hash, so a floating alias keyed
  as the string `"sonnet"` can't be detected when its weights change. We warn
  (`isDatedModel` + the floating-alias cache warning) and the sound fix is to pin
  a dated id when caching (the string then changes with the model). Inherent — the
  cache can only key on what's knowable before the run.
- **A brand-new model FAMILY (e.g. a future tier) — fail-open by design.**
  `modelTier` ranks haiku<sonnet<opus by family and returns `null` for an
  unrecognized name, so the model floor never blocks a model it can't judge. The
  implication (and known limitation): a genuinely-new family isn't ranked until
  `modelTier` is taught about it — so the floor won't catch a new _weak_ model nor
  gate a new _strong_ one. Tested (fail-open); update `modelTier` when a family
  ships. The haiku<sonnet<opus ordering is itself an assumption that holds today.

## Findings → decisions (ranked by how wrong the cache was without each)

### 1. Hash directory **contents**, not the path (the bug we had) — SHIPPED

No mature system treats a directory input as an opaque token. Bazel builds a
Merkle tree of content-digested files; Turborepo/Nx/Gradle hash a file-list of
`(relativePath, contentHash)`; ccache/sccache hash the discovered `#include` set
by **content, never mtime** (CI checkouts reset mtimes — the classic stale-cache
anti-pattern). Our bug: a native `--plugin-dir` install was passed to the run but
its contents weren't in the key, so editing a skill in it false-replayed.

**Decision:** `hashDir()` folds a sorted `relativePath:contentHash` list into the
key. **Flat sorted list, not a Merkle tree** — the tree's payoff is cheap
incremental recompute over huge trees; at plugin-dir scale it's over-engineering.
Content-hashed (not mtime), path-included (a rename invalidates; two files can't
swap contents undetected).

### 2. Floating model alias → drift — PARTIALLY SHIPPED (warn; resolve-to-dated is the fix)

No provider exposes a weight hash, so **nobody digests the model**. Every LLM
cache (promptfoo, LangChain, Helicone) keys on the model **string** + params and
bounds staleness with TTL or manual busting. But a replay cache that records raw
model output is **correctness-sensitive** in a way a build cache isn't — a stale
entry silently changes eval results — so a lax TTL-only approach is too weak.

**Decision:** the sound fix is to **pin a dated model id** (`haiku` →
`claude-haiku-4-5-20251001`); a dated id keys correctly because the string
changes when the model does. We can't auto-resolve an alias without an API call
at key-time, so vigiles **warns** when a cache rides a floating alias
(`isDatedModel` in `src/eval.ts`). (The CI gate pins the realistic _selector_
model — Sonnet — for trigger-rate, not a cheap haiku; the dated-id concern here is
about cache/baseline soundness, a separate axis from picking the right model.)
Deferred: a
short-TTL backstop for the unpinned case (see #4). Rejected: a canary-probe
fingerprinting system to detect drift — over-engineering at this scale.

### 3. Salt a format version into the key — SHIPPED

Jest salts `CACHE_VERSION`, babel-loader its `cacheIdentifier`, webpack
`cache.version`; Bazel partitions state per version. Salting makes incompatible
records **unreachable** (correctness by construction, no defensive parsing of an
old shape). A read-time version _gate_ only helps reclaim disk, and carries the
brittle "parse the old format to discover it's old" failure mode.

**Decision:** salt a single `CACHE_FORMAT_VERSION` integer into the key. **No
per-record read-time gate** (over-engineering). A major bump orphans old files on
disk; reclaim by deleting the cache dir (a directory-level wipe, if ever needed).

### 4. Canonical serialization — SHIPPED (the part that mattered)

`JSON.stringify` is not canonical: it preserves key insertion order, drops
`undefined`, throws on `BigInt`, serializes `Set`/`Map` to `{}`, and emits
`NaN`/`Infinity`/`-0` lossily.

**Decision:** `canonical()` already recursively sorts object keys (the dominant
gotcha), so no `safe-stable-stringify` dependency is warranted — the cache's
inputs are plain strings / string-arrays / file-maps. The one real remaining item
was the **tool list, which is logically a set** — now sorted before hashing so a
reordered allowlist isn't a phantom miss. RFC 8785 (JCS) is for byte-identical
hashes across languages — unnecessary for one TS codebase.

### 5. Eviction / TTL / size cap — DEFERRED (documented)

Local caches commonly ship effectively unbounded with manual clean (npm, yarn,
Bazel disk cache historically); CI caches need a bound (GitHub Actions: 10 GB,
7-day LRU). promptfoo pairs a 14-day TTL with a max file count + size.

**Decision:** **deferred.** The eval cache is opt-in (`cache: "off"` default) and
mostly used for local iteration, where unbounded-with-manual-clean is the
accepted minimum. This is disk hygiene, not invalidation _correctness_. When it's
pulled in: a simple age+size sweep (oldest-first) — not a precise-LRU /
background-GC / content-defined-dedup system. A short TTL here would also double
as the #2 model-drift backstop.

## Net

The two **correctness** bugs (dir contents, tool-set ordering) and the cheap
insurance (version salt) shipped. Model-drift is warned (sound only with a dated
pin). Eviction is deferred as disk hygiene. None of the fixes needed a Merkle
tree, a version-migration system, or a weight-fingerprinting probe — all flagged
as over-engineering at this scale.
