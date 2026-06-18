# Cache invalidation — best practices and what vigiles does

> Research of record (2026-06-17) behind the eval record/replay cache
> (`src/eval-cache.ts`). Synthesizes how mature content-addressed caches (Bazel,
> Turborepo, Nx, Gradle, ccache, Jest, webpack, ESLint) and LLM caches
> (promptfoo, LangChain, Helicone) design keys + invalidation, then records the
> decisions for vigiles. Companion to [`docs/eval-architecture.md`](../docs/eval-architecture.md).

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

- **Harness binary version (the `claude` CLI) — KEYED.** The CLI upgrade changes
  the system prompt + tool definitions, which steer behaviour as much as the
  model. `harnessVersion` (`claude --version`, resolved once per run) is in the
  key, so a CLI upgrade invalidates. Trade-off accepted: frequent CLI patches
  invalidate often — correct over silently-stale, and the primary use (re-score
  `measure` within a session) is unaffected since the version is stable then.
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
