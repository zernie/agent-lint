---
status: active
topic: adapters
---

# Multi-harness compile & the mirror story

How vigiles compiles/verifies one repo that targets more than one harness
(Claude Code + Codex), and where the "compile once per harness" instinct is real
vs. a deliberate non-goal. Companion to `research/sync-tool-compatibility.md`
(the fan-out doctrine) and `research/code-adapter-architecture.md` (the ports).

## The reframe: decompose "fan-out" by surface

"Compile once per harness" looks like one feature, but the three authoring
surfaces behave completely differently. The deciding question for each is **does
the compiled output actually differ by harness?**

| Surface          | Output differs by harness?                                      | Where it lands                                                | Who fans out                                               |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Instruction file | **No** — plain markdown, byte-identical                         | `CLAUDE.md` vs `AGENTS.md` (different name, same bytes)       | sync tool / mirror, else vigiles                           |
| Skill            | **Yes** — frontmatter profile (`claude-code` full vs `minimal`) | `.claude/skills/…` vs `.codex/skills/…` (**different roots**) | vigiles (verify per harness; multi-emit deferred — see §3) |
| Hook             | **Yes** — settings format (JSON vs TOML) + matcher syntax       | `.claude/settings.json` vs `.codex/config.toml`               | **vigiles — installs into EVERY declared harness (§4)**    |
| Subagent         | **N/A** — Codex non-goal                                        | `agents/<name>.md` (CC only)                                  | nobody (single harness)                                    |

The key correction that collapses the "this is hard" feeling: the two harness
layouts namespace surfaces under **different `materializeRoot`s** (`.claude` vs
`.codex` — see `src/adapters/*/layout.ts`). So `skills/` is a _relative_ name
under each root, not a shared path — there is **no forced collision** at the
_layout_ level. (Compile _output_, separately, is co-located with the spec
today, so per-harness emit is an output-location decision, not a collision
problem — see §3.)

## Decisions

### 1. Selection — `harness` in project config

Harness is a **project** property (one repo, one _or more_ declared harnesses),
so it belongs in `.vigilesrc.json`, written once by `vigiles init`, not repeated
on every spec. Shape: `harness?: string | string[]`.

- `"codex"` — the 90% single-harness repo.
- `["claude-code", "codex"]` — the repo _declares_ it supports both (the
  "supported set").

For an operation that needs exactly one dialect (compile), resolve in this order:

1. `--harness=<name>` flag — wins (matches `init`/`scan`, which already have it).
2. **Spec target file** when it disambiguates — a `CLAUDE.md.spec.ts` is a
   claude-code file, an `AGENTS.md.spec.ts` a codex one (`adapterForInstructionFile`,
   applied per instruction spec). Skill/agent targets don't name a harness, so they
   take the run-level pick below.
3. Config `harness` resolving to a single entry → use it.
4. Config `harness` with multiple entries → use the first, print a **loud notice**
   (`compiling for claude-code — override with --harness=`), never a silent pick.
5. No config → auto-detect (`detectAdapterResult`) + **warn on ambiguity** the way
   `scan` does (a repo that matches several harnesses).

This kills the silent-mismatch footgun in `compileSkillToFile`/`compileAgentToFile`
(which previously called `detectAdapter(cwd).dialect` with no override and no
warning).

Zero-config stays intact: `compile` still works with just a `.spec.ts` (step 5),
so the config key is _written by init_ but never _required_ by compile.

**`lint` takes no `--harness` — by design.** Unlike `compile` (picks one dialect
to render) and `scan` (reports harness-specific structure), reference verification
is harness-agnostic: "does this linter rule exist / does this path resolve" is the
same answer on any harness, and the validator already recognizes **both**
`CLAUDE.md` and `AGENTS.md` (`validate.ts`). So a harness selector on `lint` would
be cargo-culted surface, not a real knob.

Name reconciliation: `init`'s `resolveHarnesses` uses short names (`"claude"`,
`"codex"`); adapters are named `"claude-code"`/`"codex"`. The config key uses the
canonical adapter names; the short forms are accepted as aliases.

### 2. Instruction fan-out — byte-identical copy, never a divergent emitter

The "Compose With Sync Tools" rule bans **divergent-format** emitters (`.mdc`,
`.clinerules`, …) — the per-agent format-maintenance treadmill. It does **not**
ban materializing the `CLAUDE.md`⇄`AGENTS.md` mirror, because those are
**byte-identical plain markdown** — a copy, not a format conversion, zero
maintenance burden. The rule assumes a distributor exists ("let the sync tool
distribute"); when none does, that's a _gap_, not a feature.

Three-way branch (vigiles already owns the detectors in `src/core/compose.ts`):

1. **Sync tool detected** → redirect the spec into its source slot, let it fan out.
   _(done — `composeCollisions`)_
2. **Existing mirror detected** → treat as one artifact. _(done —
   `detectInstructionMirror`)_
3. **Neither, and ≥2 harnesses declared** → **vigiles writes a byte-identical
   copy** to the secondary harness's `instructionFile`. ← the missing branch.

The chosen artifact is a **byte-identical copy**, not a symlink:

- Works everywhere (no Windows / `core.symlinks=false` / `npm pack` / zip caveats).
- One code path (no symlink-with-copy-fallback to build and test twice).
- Matches the ecosystem (Ruler/rulesync write real files).
- Reviewers see real, diffable content.

Drift — a copy's one cost — is exactly what vigiles' SHA-256 integrity check
exists to catch, so it is on-brand, not a liability:

- The copy is byte-identical, so it **carries the source's embedded hash by
  construction** — no second hash to stamp; the "hash on the source slot only"
  rule is untouched.
- A hand-edit of the mirror makes the embedded hash mismatch the mirror's bytes →
  **integrity error, automatically**, via the existing check.
- `detectInstructionMirror` already recognizes the mirror, so lint never demands
  a separate spec for it.
- `vigiles compile` rewrites the source **and** refreshes every detected mirror;
  drift only happens on a hand-edit, which lint flags as `integrity`.

### 3. Skills — verify per harness (multi-emit deferred)

For the **user's own** custom skills (a pillar-1 concern — not vigiles' three
shipped skills, whose vendored-vs-global install is a separate `init` decision):

- **Validate — DONE (the array's real job).** References in a `SKILL.md` are
  **harness-agnostic** (a path is a path, a linter rule is a linter rule). The one
  harness-specific surface is the **frontmatter profile**. The profiles diverge
  only in _optional_ CC-only keys (`disable-model-invocation`, `argument-hint`) —
  `minimal` is a strict subset of `claude-code`, and `name`/`description` are
  required by both — so "does it satisfy each harness" is trivially yes. The
  useful, **assumption-free** check is the inverse: when a declared harness uses
  the `minimal` profile, it _drops_ those CC-only keys, so a constraint the author
  set (e.g. `disable-model-invocation`) silently won't apply there. `vigiles
compile` now warns per declared minimal-profile harness
  (`src/skill-harness.ts`, `skillFrontmatterDropWarnings`). This states a fact
  about vigiles's own output, not a guess about another tool's parser tolerance.
- **Compile (per-root multi-emit) — DEFERRED, on purpose.** Two unresolved
  premises make N-emit speculative today: (a) skill output is **co-located** with
  the spec (`SKILL.md.spec.ts` → sibling `SKILL.md`), not organized under
  per-harness `materializeRoot`s, so "emit to `.codex/skills/`" has no
  well-defined source location yet; (b) whether a `minimal`-profile harness
  **tolerates** the CC superset's extra keys (→ a single superset file suffices)
  vs. needs its own file is an open empirical question. Until both are settled,
  the single compiled `SKILL.md` (selected profile) + the drop-warning is the
  honest, correct behavior; multi-emit waits on the tolerance probe + an
  output-location decision.

### 4. Hooks — install into EVERY declared harness (shipped)

Unlike a skill or instruction file (one markdown artifact, emitted once), a
compiled hook is a piece of **wiring merged into the harness's settings**. A typed
`vigiles/hook` program is harness-NEUTRAL — the same `(event) => Decision` — and
the only per-harness part is the emitted block (JSON `settings.json` with an exact
matcher vs TOML `config.toml` with an anchored-regex matcher). So when a repo
declares **both** harnesses, the right behavior is to install the SAME hook into
**both** configs, each in its native format, not pick the first.

`vigiles compile` does this now: the hook install resolves the FULL declared set
(`resolveHarnessAdapters` in `src/adapter-registry.ts` — `--harness=` flag → that
one; else the config `harness` list → all; else auto-detect → the detected one)
and loops, merging the compiled block into each adapter's settings idempotently.
Per-harness warnings still fire per install (an inject hook warns only on a harness
whose `injectableEvents` lacks the event; a react hook warns on Codex). This closes
the gap where instruction files mirrored to both harnesses but a hook landed in
only one — the symptom that a feature "works on CC, silently absent on Codex."

The CI workflow `init` scaffolds is harness-aware too: the deterministic harness
job installs the binary for each declared harness (`@anthropic-ai/claude-code`
and/or `@openai/codex` via `harnessTestBinaries`), so a both-harness repo tests
both in CI.

### 5. Subagents — Claude Code only

Codex subagents are a deliberate non-goal (a Codex subagent is an `[agents]` TOML
concurrency table, not a tool-contract file). Single harness, nothing to fan out.

## Net

Once split by surface, "multi-target compile" is not one scary feature:

- **Instructions** — sync-tool fan-out (done) + a byte-copy fallback (new, small).
- **Skills** — per-harness verification (the array's real job, shipped) +
  per-root multi-emit (deferred — output-location + tolerance unresolved).
- **Hooks** — installed into EVERY declared harness, each in its native format
  (shipped); the scaffolded CI workflow installs each harness's binary.
- **Subagents** — single harness.

The array's headline value is **per-harness verification + wiring fan-out**, not
N-way markdown emission — which keeps vigiles in author+verify and out of the
rulesync fan-out business.

## Implementation slices

1. **Selection — DONE.** `harness` in `VigilesConfig`; a pure resolver in
   `src/adapter-registry.ts` (precedence + alias normalization, discriminated
   `HarnessSelection`) with tests; the resolved dialect threaded into the compile
   helpers; `--harness=` on `compile`; `init` writes `harness`.
2. **Copy-mirror — DONE.** Branch 3 above (`writeInstructionMirrors` in the
   instruction-file compile path): a byte-identical copy when ≥2 harnesses are
   declared and no sync tool / existing mirror fans it out; never clobbers a
   spec-owned target.
3. **Skills cross-harness verify — DONE; per-root multi-emit — DEFERRED.** The
   frontmatter-drop warning ships (`src/skill-harness.ts`); N-emit waits on the
   tolerance probe + output-location decision (see section 3).
