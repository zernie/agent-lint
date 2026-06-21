# CLI & CI reference

Full command-line surface, the GitHub Action, the Claude Code plugin, and the
`vigiles lint` validation rules. For the pitch and quick start, see the
[README](../README.md).

## Commands

```bash
npx vigiles init [--target=X.md]    # Scaffold a spec (runs full setup wizard by default)
npx vigiles compile [files...]      # Compile .spec.ts → .md
npx vigiles lint [files...]         # Verify references + integrity + symbols + coverage
npx vigiles refs <file.md>          # Check the symbol references in an instruction file
npx vigiles test [files...]         # Run *.harness.{mjs,ts} deterministic harness tests (no API key)
npx vigiles eval [files...]         # Run *.eval.{mjs,ts} real-model harness evals (--trials=N)
npx vigiles scan [dir]              # Report what a plugin/repo ships + what's broken (no model)
npx vigiles scan <dir> --fix-plan   # Harness health score + ranked free fixes, before measuring (no model)
npx vigiles explain <dir> [name]    # The deterministic WHY a skill/agent underperforms + the fix (no model)
npx vigiles scaffold-test [dir]     # Generate a starter test for each untested skill/agent/hook (--write)
npx vigiles generate-types          # Emit .d.ts from project state (for spec mode)
npx vigiles generate-types --check  # Verify .d.ts is up to date
npx vigiles generate-schema         # Emit JSON Schema for vigiles: frontmatter (Level 1)
npx vigiles generate-schema --check # Verify schema.json is up to date
npx vigiles generate-harness [dir]  # Emit harness.gen.ts — one typed registry over every spec
npx vigiles generate-harness --check # Verify harness.gen.ts is up to date
```

`vigiles test` / `vigiles eval` run scripts in JS **or** TS and report each as
**pass / skip / fail** — a tier that can't run (e.g. deterministic with no
`claude`) reports a loud `⊘ SKIPPED`, tallied separately, never a fake green.
Unit-tier `runHook` tests need no `claude` and always run. A skip passes by
default; in a CI job that **asserts** the capability is present, add `--no-skip`
so a skipped tier **fails** (a green-with-skips is untested surface).

By default `init` sets up **both layers** — **Lint** (verify instruction-file
references) and **Test** (test the harness): it scaffolds a typed spec + types
(Lint), a starter `vigiles.harness.mjs` (Test), wires CI as a
`zernie/vigiles@v1` workflow (creating `.github/workflows/vigiles.yml` when none
exists), and installs the Claude Code plugin.

**Interactive vs non-interactive:** run in a terminal (a TTY), `init` prompts for
which layers, CI, and the plugin. Run by an agent, in CI, or with piped input
(no TTY) — or with `--yes` — it skips the prompts and applies the defaults. So
"set up vigiles" from a Claude Code / Codex prompt Just Works without hanging.

### `init` flags

| Flag                     | Effect                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| `--yes`, `-y`            | Skip prompts; use defaults (both layers, CI, plugin)             |
| `--lint` / `--no-lint`   | Lint layer — verify instruction-file references (default on)     |
| `--test` / `--no-test`   | Test layer — scaffold a harness test (default on)                |
| `--harness=claude,codex` | Which harness(es) to set up (default: auto-detect from the repo) |
| `--no-gha`               | Skip wiring CI                                                   |
| `--no-plugin`            | Skip installing the Claude Code plugin                           |
| `--strict`               | Set `require-spec` to `"error"`                                  |
| `--target=AGENTS.md`     | Create a bare spec for one file (Lint layer only)                |

Passing a single positive layer flag selects only it (`--lint` = the Lint
layer only); pass both, or neither, for both. `init` also adds `vigiles` to your
`devDependencies` (moving it out of `dependencies` if it's there) so the
scaffolded `vigiles.harness.mjs` resolves `vigiles/testing`.

See the [agent setup guide](agent-setup.md) and
[agent workflows](agent-workflows.md).

### `compile [files...]` — harness selection

`compile` renders each `.spec.ts` to its instruction file / `SKILL.md` /
subagent. Which **harness dialect** it renders (the `SKILL.md` frontmatter
profile, the subagent tool catalog) is resolved deterministically — no cwd
sniffing:

1. `--harness=<name>` flag — wins (`claude-code`/`codex`; `claude` is an alias).
2. The **spec's own target** for an instruction file — a `CLAUDE.md.spec.ts` is
   claude-code, an `AGENTS.md.spec.ts` is codex.
3. The **`harness` key** in `.vigilesrc.json` (written by `init`):
   `"codex"`, or `["claude-code", "codex"]` to declare a multi-harness repo (the
   first is used, with a loud notice; override per run with `--harness=`).
4. Auto-detect from the repo, warning when it's ambiguous.

```bash
npx vigiles compile                      # all specs, harness from config/detect
npx vigiles compile --harness=codex      # force the Codex dialect for this run
```

Two multi-harness behaviours:

- **Instruction-file mirror.** When `harness` declares ≥2 harnesses and no sync
  tool (Ruler/rulesync) or existing mirror fans the file out, `compile` writes a
  **byte-identical** `CLAUDE.md`⇄`AGENTS.md` copy. It carries the source's
  integrity hash, so a hand-edit of the mirror trips the `integrity` check. It
  never clobbers a target that has its own spec.
- **Frontmatter-drop warning.** A skill that sets Claude-Code-only frontmatter
  (`disable-model-invocation`, `argument-hint`) in a repo that also declares a
  `minimal`-profile harness (Codex/OpenCode) gets a warning — those keys are
  dropped there, so the constraint won't apply.

`lint` takes **no** `--harness`: reference verification is harness-agnostic (it
already recognizes both `CLAUDE.md` and `AGENTS.md`), unlike `compile` (renders
one dialect) and `scan` (reports harness-specific structure). See
[research/multi-harness-compile.md](../research/multi-harness-compile.md).

### `scan [dir]`

Point vigiles at any plugin or repo (defaults to `.`) and get a read-only report
of what it ships and what's structurally broken — **no model, no API key**. It
re-aims the existing machinery (`loadPlugin`, `parseAgentTools`,
`findUntestedSurfaces`): per-skill description presence + user-invoked flag +
**description-script** detection (a description whose dominant script differs from
the expected one — **default Latin, configurable** — carries a cross-language
trigger risk: the selector is English-centric, so a Cyrillic/CJK/… description may
under-fire on English prompts; a RISK flag, not a defect — measure it with
`--trigger`), per-agent tool contract (and the "no `tools:` line → inherits every tool"
footgun), hook scripts resolved across the braced/unbraced `$CLAUDE_PLUGIN_ROOT`
forms (`ok` / `missing` / `unresolved`), command + MCP detection, untested-surface
counts, and the loader's dangling-ref / surface warnings. `--json` for CI.

`scan` reports **harness-specific structure** (plugin layout, hook resolution),
so it auto-detects the harness — printing the detected one and warning when a repo
matches several — and takes `--harness=<name>` to override. (`compile` is
harness-aware for the same reason; `lint` isn't — reference verification is
harness-agnostic.)

```bash
npx vigiles scan ./some-plugin          # human-readable report for one plugin
npx vigiles scan ./some-plugin --json   # structured, for pipelines
npx vigiles scan ./plugins/*/           # ≥2 targets → ranked health leaderboard
npx vigiles scan ./marketplace-repo     # a marketplace.json root → ranks every member
npx vigiles scan ./repo --harness=codex # override harness detection
```

Pass **more than one directory** — or a single **marketplace** root (a
`.claude-plugin/marketplace.json`, e.g. `wshobson/agents`' 80+ plugins, which
`scan` expands into its members) — and `scan` switches to a **ranked health
leaderboard**: a deterministic structural-health score (0–100 + A–F) per plugin,
worst issues first. Weights: a missing hook script −15 (won't run), a skill with
no usable description −10 (can't trigger), a broken intra-plugin reference −8
(partial-vendor / dead path), an agent with no `tools:` contract −5 (inherits
everything), an untested surface −3. Scoring deliberately ignores the loader's
free-text warnings (they include doc-mention false positives), so the ranking
stays defensible. A **command-only** plugin (`commands/*.md`, no skills/agents/hooks)
or an **MCP-only** plugin (`.mcp.json`) is a real, valid surface and scores on its
own health — only a directory with _no_ surface at all scores 0.

This is the deterministic substrate for the plugin/skill leaderboard and the
harness-aware supply-chain audit (see `research/divergent-bets.md`,
`research/agent-supply-chain-security.md`).

#### Behavioral column — `scan --trigger`

The structural scan above is the free, no-model column. **`--trigger`** opts into
the model-gated column that stacks on top: for each model-invocable skill in a
single plugin, it measures how reliably the description actually **FIRES**
(recall, plus precision when irrelevant prompts are given) via
`measureTriggerRate` — the bug a green structural scan can't see (a skill with a
fine description that never triggers). It needs the `claude` CLI + model auth, and
**degrades honestly** ("unavailable") when they're absent rather than faking a
pass. `--harness=codex` routes the probe through the native Codex driver instead
(a trigger surfaces as the model reading the skill's `SKILL.md`, since Codex has no
Skill-tool event) — see [`docs/harness-testing-codex.md`](harness-testing-codex.md).

Prompts are **author-supplied** (not model-generated — a path in prose is
undecidable): a JSON map of skill name → `{ prompts, irrelevant }`.

```bash
npx vigiles scan ./some-plugin --trigger --prompts=./probes.json
npx vigiles scan ./some-plugin --trigger --prompts=./probes.json --concurrency=5 --model=sonnet
```

```jsonc
// probes.json — keyed by bare skill name
{
  "brainstorming": {
    "prompts": ["…≥10 prompts it SHOULD fire on…"],
    "irrelevant": ["…prompts it should stay quiet on (→ precision)…"],
  },
}
```

Flags use the `--flag=value` form (`--prompts=`, `--concurrency=`, `--model=`,
`--min-prompts=`). A diversity gate requires **≥10 prompts per set** (and per
`irrelevant` set) before spending a token; lower it with `--min-prompts=` for a
genuinely narrow skill. Skills with no prompts are reported `unmeasured`;
user-invoked skills aren't probed (they can't auto-trigger); a thin prompt set is
surfaced per-skill (`unmeasured`), never crashing the scan. See
[`docs/harness-testing.md`](harness-testing.md) for the underlying
`measureTriggerRate` and [`research/plugin-behavioral-findings.md`](../research/plugin-behavioral-findings.md)
for what it catches. (The remaining behavioural columns — observed egress,
safety — build on the same footing.)

### `explain [dir] [name]`

The deterministic **WHY** behind a low score. A measurement (a trigger-rate
eval, a benchmark) tells you a skill _underperforms_ — `explain` tells you the
structural **cause** and the one-line **fix**, reading the same `ScanReport`
`scan` computes (no model, free, every commit). It maps each cross-reference
finding to the behavioural symptom it accounts for:

| Symptom                            | Deterministic cause it surfaces                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| the selector fires the wrong skill | two skills with near-identical descriptions (`description-overlap`)                                       |
| the skill never fires              | a skill with no usable description (`skill-frontmatter`)                                                  |
| the subagent loses a tool          | a never-available / typo'd tool or undeclared MCP server (`subagent-tool-contract` / `mcp-tool-resolves`) |
| the hook never runs                | a typo'd event or a missing script (`hook-events` / `hook-script-exists`)                                 |
| the subagent won't register        | missing `name`/`description` frontmatter (`subagent-frontmatter`)                                         |

```bash
npx vigiles explain ./some-plugin          # every cause found, likely-first
npx vigiles explain ./some-plugin caveman  # narrow to one underperformer
npx vigiles explain ./some-plugin --json   # the agent-consumable array of {symptom, cause, detector, fix, confidence}
npx vigiles explain ./repo --harness=codex # override harness detection
```

`confidence` is `likely` (a hard dead-end — a missing script can't run) or
`possible` (a high-precision proxy — an overlap _may_ collide; confirm with
`scan --trigger`). With no deterministic cause, it says so and points you at the
behavioural tier (the cause is likely in the prose, measured by an eval). It's
the diagnostic the per-repo optimizer prints beside each drop/swap
recommendation — _"underperforms **because** its description overlaps X"_, not
just _"drop it"_. The pairing is the strategy in
[`research/measurement-authority.md`](../research/measurement-authority.md)
(measurement = the _what_; linting = the deterministic _why_).

### `scaffold-test [dir]`

**Free-form in, a runnable starter test out.** For every **untested** skill /
subagent / hook in a plugin (the surfaces `vigiles lint` flags via
`untested-skill` / `untested-subagent` / `untested-hook`), generate a scaffolded
test at its suggested path — the deterministic counterpart to the `test-harness`
skill (which picks the tier with a model). Each scaffold wires the real public
API + the surface's own metadata and leaves TODOs only where judgement is needed:

| Surface      | Tier      | Generated                                                   |
| ------------ | --------- | ----------------------------------------------------------- |
| **hook**     | `runHook` | a unit test asserting the block/allow decision (free)       |
| **skill**    | eval      | a `measureTriggerRate` recall + precision eval (real model) |
| **subagent** | harness   | a `runHarnessTest` scaffold (points at the `result()` path) |

```bash
npx vigiles scaffold-test ./my-plugin          # dry-run: print the scaffolds
npx vigiles scaffold-test ./my-plugin --write   # write each to its suggested path (never clobbers)
npx vigiles scaffold-test ./my-plugin --json    # the agent-consumable { path, content, kind, tier }[]
npx vigiles scaffold-test ./repo --harness=codex
```

`--write` skips any path that already exists, and the generated file lands where
the untested-surface detector looks for it — so the surface stops being reported
untested. Fill in the TODOs (prompts / event input / assertions), then run with
`vigiles test` or `vigiles eval`.

### `scan --fix-plan [dir]`

The **fix-plan lens** on a scan — the per-repo harness optimizer's free,
deterministic half. Where `explain` diagnoses _one_ surface a measurement
flagged, `scan --fix-plan` is the whole-repo adoption view: a
structural-**health score** (the same `scoreReport` the leaderboard uses) plus
the **ranked free fixes** to apply _before_ you spend a token measuring. It
reuses `explain`'s findings (one detector, no drift), so each recommendation
carries the cause, the one-line fix, and an action verb — `FIX` (a structural
dead-end) or `DIFFERENTIATE` (a description-overlap pair).

```bash
npx vigiles scan ./my-plugin --fix-plan          # health score + ranked free fixes, likely-first
npx vigiles scan ./my-plugin --fix-plan --json   # the agent-consumable plan {score, grade, empty, recommendations}
npx vigiles scan ./repo --fix-plan --harness=codex
```

This is the **"linting as a free pre-filter to measurement"** thesis: clear the
structural problems a model can't help with first (free, certain), _then_
measure whether the structurally-clean skills earn their keep with
`scan --trigger` (real-model, on your subscription). That **measured behavioural
delta** — does dropping/swapping a skill actually move success or cost? — is the
next layer; this v0 ships the deterministic spine it stacks on. It's a `scan`
flag rather than its own `optimize` verb until that measured half lands (an
optimizer that only re-prints scan's findings hasn't earned a separate command).
See [`research/measurement-authority.md`](../research/measurement-authority.md)
(A2) and the [roadmap](../research/roadmap.md).

### `generate-harness [dir] [out]`

Emit **one typed registry** — `harness.gen.ts` — over every `*.spec.ts` under
`dir`, so a single `tsc --noEmit` cross-checks the **whole harness as one
program** (think TanStack Router's `routeTree.gen.ts` or the Prisma client). It's
the third generated artifact beside `generate-types` (`.d.ts`) and
`generate-schema` (JSON Schema). It ships four cross-spec checks:

- **Dangling `delegate` → a `tsc` error at edit time.** Every `railway()`
  delegate target (`steps`, `recover.step`, `onError`) is checked against the
  literal union of every agent name. A `delegate("ghost")` whose target has no
  spec makes the generated assertion a `tsc` error naming the missing target
  (`__dangling_delegate: "ghost"` from its railway) — no vigiles run, in your
  editor.
- **Duplicate agent names → a non-zero exit.** Two specs declaring the same
  `name` make `generate-harness` exit `2` naming the collision. This is an O(N)
  check in the generator, **not** a type — a set-uniqueness type is the TS2589
  wall (see the research).
- **Cross-file typed composition → a `tsc` error at edit time.** When a
  `railway()` success-track step declares what it `needs()`, the gen file asserts
  the **previous** step's agent `result().ok` SUPPLIES it — **across files**. A
  step that needs `diff: "string[]"` whose producer emits `diff: "string"` (or
  doesn't emit `diff` at all) is a `tsc` error naming the field
  (`__handoff_error: { __mismatch: "diff", expected: "string[]", got: "string" }`
  / `__missing: "diff"`). This is the repo-scale generalization of the per-file
  `pipe`/`Supplies` composition — one shallow per-pair assertion (O(N), no
  recursion). Scoped to the **linear success track**; `recover`/`onError` edges
  (which consume an `err`, not the prior `ok`) are a noted follow-up. A railway
  whose `delegate()`s declare **no** `needs` generates exactly as before — the
  check is purely additive and opt-in per edge.
- **The whole-harness capability lattice.** A computed `harnessCapabilities`
  export — the union of every agent's effect surface (read-only / side-effecting
  / unknown tools + the loosest purity) — the substrate a future repo-scale
  capability-diff reads.

```bash
npx vigiles generate-harness ./agents               # → ./agents/harness.gen.ts
npx vigiles generate-harness ./agents out.gen.ts    # custom out path
npx vigiles generate-harness ./agents --check        # CI: assert the gen file is up to date (exit 1 if stale)
npx vigiles generate-harness ./agents --harness=codex
```

**tsconfig need:** the gen file imports sibling `*.spec.ts` directly, so the
tsconfig that type-checks it needs `"allowImportingTsExtensions": true` (under
`Node16`/`NodeNext` resolution). Commit `harness.gen.ts` like a lockfile and add
a `--check` step to CI so a stale registry is caught, then let `tsc --noEmit`
enforce the cross-checks. Wire regeneration to a spec guard (the same mechanism
as `recompile-on-spec-change`):

```ts
guard({ watch: "*.spec.ts", run: "npx vigiles generate-harness" });
```

Declare a handoff with the optional 3rd argument of `delegate()` — the same
`needs(...)` builder a typed `pipeStep` uses:

```ts
import { railway, delegate, needs } from "vigiles/spec";
railway({
  name: "ship-pr",
  steps: [
    delegate("planner"),
    delegate("implementer", undefined, needs({ steps: "string[]" })), // planner.ok must supply `steps`
    delegate("reviewer", undefined, needs({ summary: "string" })), // implementer.ok must supply `summary`
  ],
});
```

See [`docs/railway-subagents.md`](railway-subagents.md) for the typed-composition
guide and [`research/whole-harness-codegen.md`](../research/whole-harness-codegen.md)
for the design, the measured TS-scaling verdict, and the encoding rule.

## Lint vs scan — gate vs report

`lint` and `scan` look like they overlap, but they're **different verbs with
different contracts** — the classic gate-vs-report split (think `eslint .` /
`tsc --noEmit` vs `npm audit` / `terraform plan`):

- **`lint` is the gate.** It runs on **your** repo with **your** config, verifies
  references (file paths, scripts, and linter rules across **7 catalogs** — does
  the rule exist _and_ is it enabled?), checks integrity/hash, coverage
  thresholds, orphan docs, duplicate rules — and exits with **config-driven
  severities → stable CI codes (0/1/2)**. It blocks bad commits.
- **`scan` is the report.** Zero config, **read-only**, harness-aware, works on
  **any** plugin (including third-party ones with no spec). It inventories the
  structure, ranks a whole marketplace (leaderboard), and — with `--trigger` —
  adds the model-gated behavioural column.

They deliberately **share one implementation** of the few deterministic
structural detectors they have in common (untested-surface, dangling-ref,
description-script), per the `one-detector-no-drift` rule, so the two surfaces can
never disagree. The asymmetry everywhere else is intentional: some checks need
inputs only the gate has (your catalogs, your compiled output), and the paid
`--trigger` column must **never** become a `lint` rule (lint stays free +
deterministic + every-commit).

**What each does:**

| Check                                                       |  `lint`  |  `scan`   | `scan --trigger` |
| ----------------------------------------------------------- | :------: | :-------: | :--------------: |
| Linter-rule cross-ref (7 catalogs, exists **+ enabled**)    |    ✓     |     –     |        –         |
| Marked file/script ref verification                         |    ✓     |     –     |        –         |
| Integrity/hash · duplicate-NCD · coverage · orphan docs     |    ✓     |     –     |        –         |
| Untested surface                                            |  ✓ gate  |  ✓ count  |        –         |
| Dangling ref · description-script _(shared detectors)_      |    ✓     |     ✓     |        –         |
| Instruction file · tool-contract/inherits-all · hooks · MCP |    –     |     ✓     |        –         |
| Leaderboard (rank a marketplace)                            |    –     |     ✓     |        –         |
| Trigger recall/precision (does a skill fire?)               |    –     |     –     |        ✓         |
| Config severities + CI exit codes                           |    ✓     | read-only |    read-only     |
| **Cost tier**                                               | free/det | free/det  |  **paid/model**  |

**Where each runs:**

| Target             |        `lint`        |        `scan`         |  `scan --trigger`   |
| ------------------ | :------------------: | :-------------------: | :-----------------: |
| Normal app repo    |   ✓ (marked refs)    | ✓ (instruction file)¹ |   n/a (no skills)   |
| Claude Code plugin |          ✓           |           ✓           |          ✓          |
| Codex plugin/repo  | ✓ (harness-agnostic) | ✓ (auto-detect, TOML) | ✓ `--harness=codex` |
| Marketplace (many) |       per-file       |     ✓ leaderboard     |   per-plugin only   |

¹ On a plain repo `scan` reports the detected instruction file (`CLAUDE.md` /
`AGENTS.md`, spec-managed vs hand-written) but no plugin surface; reference
_verification_ of that file is `lint`'s job (and needs marks — inline,
frontmatter, or a spec; plain prose isn't auto-parsed).

## GitHub Action

The Action is a **composite action over the published `npx vigiles` CLI** — it
runs the exact artifact you'd run locally, so there's no separate bundle to drift.
Every input maps to a real CLI flag.

### Quick start

```yaml
name: vigiles
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read # all the Action needs; it only reads files and emits annotations

jobs:
  vigiles:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: zernie/vigiles@v1 # runs `lint` by default
```

That's the whole thing — `lint` verifies that every linter rule, file path,
script, and symbol your `CLAUDE.md` / `AGENTS.md` cites is real and enabled, checks
the integrity hashes, and reports coverage. Failures appear inline as GitHub
annotations and fail the job.

### Compile specs in CI

```yaml
- uses: zernie/vigiles@v1
  with:
    command: compile # spec.ts → markdown; fails if a reference is stale
    paths: CLAUDE.md.spec.ts # optional; auto-discovers when omitted
```

### Inputs

| Input               | Default   | Description                                                                                 |
| ------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `command`           | `lint`    | `lint` (verify references + integrity + coverage) or `compile` (specs → markdown).          |
| `paths`             | _(auto)_  | Comma/space-separated paths — `.md` for `lint`, `.spec.ts` for `compile`. Auto-discovers.   |
| `version`           | `latest`  | npm version of `vigiles` to run (`1`, `1.2.3`, `latest`). `local` runs a checked-out build. |
| `max-rules`         | _(unset)_ | Cap rules per spec (maps to `--max-rules`).                                                 |
| `catalog-only`      | `false`   | Only check that linter rules exist; skip config-enabled checks (maps to `--catalog-only`).  |
| `working-directory` | `.`       | Directory to run vigiles in.                                                                |
| `comment`           | `true`    | On `pull_request` events, post/update a sticky PR comment with the result.                  |
| `github-token`      | _(auto)_  | Token for the PR comment. Defaults to the workflow token (`${{ github.token }}`).           |

### Output channels

Beyond the `valid` step output, the Action reports **three** ways:

1. **Inline annotations** — failures appear on the diff (`::error`).
2. **Job summary** — a markdown result block on the run page (`$GITHUB_STEP_SUMMARY`).
3. **Sticky PR comment** — on `pull_request` events, one comment that is _updated in place_ each run (found by a hidden marker, never duplicated). Requires `pull-requests: write`; set `comment: false` to disable.

```yaml
permissions:
  contents: read
  pull-requests: write # needed for the sticky PR comment

# ...
- id: vigiles
  uses: zernie/vigiles@v1
- run: echo "passed=${{ steps.vigiles.outputs.valid }}"
```

The `valid` output is `'true'` if vigiles passed (exit 0), `'false'` otherwise.
Exit codes (also reflected in `valid`): **0** clean · **1** warnings · **2** hard errors.
On a fork PR (read-only token) the comment step degrades to a warning — the job still passes/fails on the result.

### Versioning

**The Action tag and the npm version are two separate version lines.** The Action
is a thin composite that runs the published `npx vigiles@<version>` CLI, so:

- **Action ref** (`uses: zernie/vigiles@v1`) — pin the **floating major tag**
  `@v1` for automatic patch/minor updates to the _Action wrapper_ (the release
  pipeline keeps `v1` pointed at the latest `1.x` of the action). Pin a full tag
  (`@v1.2.3`) or a commit SHA for byte-for-byte reproducibility. `@main` tracks
  unreleased `HEAD`.
- **CLI version** (`version:` input, default `latest`) — selects which published
  `vigiles` npm release the Action runs (currently `3.x`). Leave it `latest`, or
  pin `version: '3'` / `version: '3.0.0'` to lock the CLI independently of the
  Action tag.

So `uses: zernie/vigiles@v1` with the default `version: latest` runs the newest
`vigiles` CLI (3.x today) through the v1 action wrapper. The `@v1` does **not**
mean "vigiles 1.x". To lock both: `uses: zernie/vigiles@v1` + `with: { version: '3' }`.

```yaml
- uses: zernie/vigiles@v1
  with:
    version: "3" # pin the CLI major; @v1 pins the action wrapper
```

To verify generated types are fresh in CI:

```yaml
- run: npx vigiles generate-types --check
```

## Claude Code plugin

Without the plugin, you're responsible for manually running `compile` and
`generate-types`. With it, the agent works with fresh instruction files
automatically, and the consumer skills (`strengthen`, `adopt-spec`,
`test-harness`, `edit-spec`) are available (edit-spec now covers adding a rule).

The plugin installs through the **Claude Code plugin marketplace** — globally
into `~/.claude/plugins/`, **not** vendored into your repo. In a Claude Code
session:

```
/plugin marketplace add zernie/vigiles
/plugin install vigiles@vigiles
```

`vigiles init` does this for you (it runs the non-interactive `claude plugin`
CLI when available, else prints these two commands). Nothing is written to your
working tree, so there is nothing to `.gitignore` or accidentally commit.

The plugin provides hooks:

- **PreToolUse** (Edit/Write) — blocks direct edits to compiled `.md` files and redirects the agent to the `.spec.ts` source
- **PostToolUse** (Edit/Write) — auto-runs `generate-types` on linter config changes, `compile` on `.spec.ts` changes; nudges marking unmarked references
- **SessionStart** — surfaces the project's vigiles state

> Internal vigiles-development skills (`generate-logo`, `pr-to-lint-rule`,
> `enforce-rules-format`, `audit-feedback-loop`) live under `dev/` and are **not**
> shipped to consumers. Contributors load them with `--plugin-dir dev/`.

### Codex

Codex has no plugin marketplace, but the same skills install **globally** via the
cross-agent [`skills` CLI](https://github.com/vercel-labs/skills) — to the global
agents store `~/.agents/skills/` (which Codex reads), again not vendored into your
repo:

```bash
npx skills add zernie/vigiles -a codex -g -y
```

(The `-g` is what keeps it out of your repo — without it, `skills` vendors into
`./.agents/skills/`. `-y` skips the confirmation prompt.)

`vigiles init --harness=codex` (or auto-detection on an `AGENTS.md` repo) runs
this for you. Codex reads `AGENTS.md` directly, so no plugin is needed for
instructions; only the authoring skills install. Codex **hooks**
(`.codex/config.toml [hooks]`) are not auto-wired yet — add them by hand if you
want compile-on-edit.

## Validation rules

`vigiles lint` runs a set of deterministic validation rules over your instruction
files, skills, subagents, and hooks (configured in `.vigilesrc.json`). The full
matrix — every rule, its default severity, what it checks, and a link to its
reference doc — lives with the linting guide:

**[→ The validation rules, the full matrix](verifying-instruction-files.md#the-validation-rules--the-full-matrix)**

Quick severity config:

```json
{
  "rules": {
    "require-spec": "error",
    "integrity": "error",
    "coverage": ["warn", { "scripts": 50, "linterRules": 5 }]
  }
}
```

Disable per-file with `<!-- vigiles-disable require-spec -->` at the top of the markdown.
