# Multi-harness compile & the mirror story

How vigiles compiles/verifies one repo that targets more than one harness
(Claude Code + Codex), and where the "compile once per harness" instinct is real
vs. a deliberate non-goal. Companion to `research/sync-tool-compatibility.md`
(the fan-out doctrine) and `research/code-adapter-architecture.md` (the ports).

## The reframe: decompose "fan-out" by surface

"Compile once per harness" looks like one feature, but the three authoring
surfaces behave completely differently. The deciding question for each is **does
the compiled output actually differ by harness?**

| Surface          | Output differs by harness?                                      | Where it lands                                                | Who fans out                                   |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Instruction file | **No** — plain markdown, byte-identical                         | `CLAUDE.md` vs `AGENTS.md` (different name, same bytes)       | sync tool / mirror, else vigiles               |
| Skill            | **Yes** — frontmatter profile (`claude-code` full vs `minimal`) | `.claude/skills/…` vs `.codex/skills/…` (**different roots**) | vigiles (verify per harness; compile per root) |
| Subagent         | **N/A** — Codex non-goal                                        | `agents/<name>.md` (CC only)                                  | nobody (single harness)                        |

The key correction that collapses the "this is hard" feeling: the two harness
layouts namespace surfaces under **different `materializeRoot`s** (`.claude` vs
`.codex` — see `src/adapters/*/layout.ts`). So `skills/` is a _relative_ name
under each root, not a shared path. There is **no forced collision** — per-harness
skill output is `.claude/skills/foo/SKILL.md` and `.codex/skills/foo/SKILL.md`.

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
2. Spec target file when it disambiguates (`CLAUDE.md` → claude-code, `AGENTS.md`
   → codex).
3. Config `harness` resolving to a single entry → use it.
4. Config `harness` with multiple entries → use the first, print a **loud notice**
   (`compiling for claude-code — override with --harness=`), never a silent pick.
5. No config → auto-detect (`detectAdapterResult`) + **warn on ambiguity** the way
   `scan` does (a repo that matches several harnesses).

This kills the silent-mismatch footgun in `compileSkillToFile`/`compileAgentToFile`
(which today call `detectAdapter(cwd).dialect` with no override and no warning).

Zero-config stays intact: `compile` still works with just a `.spec.ts` (step 5),
so the config key is _written by init_ but never _required_ by compile.

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

### 3. Skills — verify per harness; compile per root

For the **user's own** custom skills (a pillar-1 concern — not vigiles' three
shipped skills, whose vendored-vs-global install is a separate `init` decision):

- **Validate (lint)** — references in a `SKILL.md` are **harness-agnostic** (a
  path is a path, a linter rule is a linter rule). The only harness-specific check
  is the **frontmatter profile**: does the skill carry the keys each declared
  harness requires (`claude-code` full vs `minimal`). So `harness: [...]` means
  "verify this skill satisfies each declared harness" — the array doing
  _per-harness verification_, squarely vigiles' lane.
- **Compile** — emit to each declared harness's skills root (`.claude/skills/…`
  full frontmatter, `.codex/skills/…` minimal). Different roots ⇒ no collision,
  no install question.

### 4. Subagents — Claude Code only

Codex subagents are a deliberate non-goal (a Codex subagent is an `[agents]` TOML
concurrency table, not a tool-contract file). Single harness, nothing to fan out.

## Net

Once split by surface, "multi-target compile" is not one scary feature:

- **Instructions** — sync-tool fan-out (done) + a byte-copy fallback (new, small).
- **Skills** — per-harness verification (the array's real job) + per-root compile
  (mechanical; no collision).
- **Subagents** — single harness.

The array's headline value is **per-harness verification**, not N-way emission —
which keeps vigiles in author+verify and out of the rulesync fan-out business.

## Implementation slices

1. **Selection** — `harness` in `VigilesConfig`; a pure resolver in
   `src/adapter-registry.ts` (precedence + alias normalization) with tests;
   thread the resolved dialect into the two compile helpers; `--harness=` on
   `compile`/`lint`; `init` writes `harness`. _(no dependency on the others)_
2. **Copy-mirror** — branch 3 above, in the instruction-file compile path.
   _(depends only on selection for the declared-harness set)_
3. **Skills per-harness verify/compile** — frontmatter-profile check across the
   declared set; per-root emit. _(builds on selection)_
