# CLI & CI reference

Full command-line surface, the Claude Code plugin, and the `vigiles lint`
validation rules. The GitHub Action has its own [reference](github-action.md).
For the pitch and quick start, see the [README](../README.md).

## Commands

```bash
npx vigiles init [--target=X.md]    # Scaffold a spec (runs full setup wizard by default)
npx vigiles compile [files...]      # Compile .spec.ts → .md AND .vigiles/hooks/* → merged hooks config + stamp
npx vigiles eject [file]            # Un-manage a compiled file → plain hand-owned markdown (--keep-spec)
npx vigiles lint [files...]         # Verify references + integrity + symbols + coverage (incl. instruction-file symbol marks)
npx vigiles test [files...]         # Run *.harness.{mjs,ts} deterministic harness tests (no API key)
npx vigiles eval [files...]         # Run *.eval.{mjs,ts} real-model harness evals (--trials=N)
npx vigiles audit [dir]              # Lighthouse for your harness: category rings + fixes (a deterministic read); writes vigiles-report.html + .json
npx vigiles audit <dir> --measure    # Run the executing checks (your hooks · live MCP · do skills FIRE?) headless — at a TTY a plain audit asks once instead
npx vigiles audit <dir> --no-html    # Skip writing vigiles-report.html · --no-json skips the JSON artifact (both written by default)
npx vigiles audit <dir> --json       # Print the versioned AuditReport JSON to stdout (the upload/CI contract)
npx vigiles audit <after> --capability-diff=<before>  # Did this change WIDEN the agent's blast radius? (no model)
npx vigiles scaffold-test [dir]     # Generate a starter test for each untested skill/agent/hook (--write)
npx vigiles generate types          # Emit .d.ts from project state (for spec mode; --check to verify)
npx vigiles generate schema         # Emit JSON Schema for vigiles: frontmatter (--check to verify)
npx vigiles generate harness [dir]  # Emit harness.gen.ts — one typed registry over every spec (--check to verify)
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

| Flag                     | Effect                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| `--yes`, `-y`            | Skip prompts; use defaults (both layers, CI, plugin)               |
| `--lint` / `--no-lint`   | Lint layer — verify instruction-file references (default on)       |
| `--test` / `--no-test`   | Test layer — scaffold a harness test (default on)                  |
| `--harness=claude,codex` | Which harness(es) to set up (default: auto-detect from the repo)   |
| `--no-gha`               | Skip wiring CI                                                     |
| `--no-plugin`            | Skip installing the Claude Code plugin                             |
| `--strict`               | Also enforce the workflow tier (specs + tests; see below)          |
| `--report-only`          | Write the whole gate at `warn` — nothing fails CI (migration mode) |
| `--target=AGENTS.md`     | Adopt / create a spec for one file (Lint layer only)               |

Passing a single positive layer flag selects only it (`--lint` = the Lint
layer only); pass both, or neither, for both. `init` also adds `vigiles` to your
`devDependencies` (moving it out of `dependencies` if it's there) so the
scaffolded `vigiles.harness.mjs` resolves `vigiles/testing`.

#### What `init` gates by default (vs `--strict`)

There's no confusing "strict mode" to remember: **a plain `init` already makes
CI catch broken surfaces.** It writes the **high-precision, FP-safe** structural
rules to `error` in `.vigilesrc.json`, so a broken surface **fails `vigiles
lint`** (exit 2) — but a well-formed plugin stays green, so it never cries wolf:

- `subagent-tool-contract` (a typo'd / never-available tool),
  `subagent-frontmatter` (a subagent missing `name`/`description`),
- `hook-events` (a typo'd event that never fires), `hook-script-exists` (a dead
  hook script),
- `mcp-config` / `mcp-tool-resolves` / `mcp-hook-target-resolves` (broken MCP),
- `disallowed-tools-contract`, and `description-overlap` (two skills that
  collide in the selector).

`--strict` adds the **`workflow`** group on top — the rules a clean repo can
still fail because you haven't done the work yet: `require-instructions-spec` (a
spec per instruction file) and `untested-skill` / `untested-subagent` /
`untested-hook` (a test per surface). These stay opt-in so your first CI run isn't
red just for not having written a spec yet. (`frontmatter-valid` and
`skill-frontmatter` are **`nudge`**-group — they stay `warn` and never gate, even
under `--strict`.) `--report-only` is the orthogonal dial: it writes the whole
gate at `warn` so nothing fails CI — the migration / observe on-ramp.

Because `init` **auto-adopts** every existing instruction file into a spec (see
[`compile`](#compile-files--harness-selection) / the adopt note below),
`require-instructions-spec` is green by construction right after setup — opting
into `--strict` doesn't turn your CI red on a wall of missing specs.

#### Auto-adopt — `init` leaves you with specs, not homework

When `init` finds an existing hand-written `CLAUDE.md` / `AGENTS.md`, it
**faithfully adopts** it into a `.spec.ts` instead of scaffolding a blank one:
every heading becomes a prose section verbatim, **no rule is inferred**, nothing
is dropped.

**Adoption is non-destructive — `init` never overwrites your file.** It writes the
spec and leaves your `CLAUDE.md` exactly as-is. When you're ready to switch it to
spec-managed, run `npx vigiles compile`: it reproduces the file (plus an integrity
header) — for a well-structured file the diff is just that header, so **review the
diff and commit**. Then run the `/strengthen` skill to upgrade prose to verified
`enforce()` / `guard()` rules when you want, or
[`eject`](#eject-file--adopting-a-spec-is-never-a-one-way-door) to hand the file
back as plain markdown. Adopt one file by hand with
`npx vigiles init --target=CLAUDE.md`.

(In a brand-new repo, `init` defers the compile until you've run `npm install`
— the spec imports `vigiles`, so it can't compile before the dep is installed. It
prints the exact next step instead of erroring.)

**Interactive `init` offers the workflow tier (recommended, opt-out):** at a
terminal it asks _"Also enforce specs + a test per surface?"_ (default yes), and
the agentic install flow asks the same — so a human turns it on with eyes open. A
**non-interactive** `init` (an agent / CI with no one to ask) stays
structural-only unless you pass `--strict`, so an automated setup never silently
turns an existing repo's CI red for not having written a spec yet.

Either way `init` **never clobbers a severity you set** — it only fills in the
undefined ones. Honest limit: Claude Code itself loads a name-less or broken-YAML
**skill**, so vigiles can't hard-gate skill content that still works — it gates
the subagent / hook / MCP defects (and skill collisions) that genuinely break.
See the [rules matrix](verifying-instruction-files.md#the-validation-rules--the-full-matrix).

`vigiles lint` accepts files **or a directory** (`vigiles lint .` discovers the
instruction files under it); with no argument it discovers them from the repo root.

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
- **Auto-refreshes `harness.gen.ts`.** If the repo already has a whole-harness
  registry (see [`generate-harness`](#generate-harness-dir-out)), `compile` keeps
  it in sync as a side effect — so you never hand-run that generator. It's gated
  on the file existing (compile maintains a registry you opted into, never imposes
  one) and cheap (parsing specs, no linter spawn). A duplicate agent name fails
  the compile.

`lint` takes **no** `--harness`: reference verification is harness-agnostic (it
already recognizes both `CLAUDE.md` and `AGENTS.md`), unlike `compile` (renders
one dialect) and `audit` (reports harness-specific structure).

### `eject [file]` — adopting a spec is never a one-way door

`eject` is the inverse of `compile`: it hands a compiled instruction file back to
you as plain, hand-owned markdown. It strips the `vigiles:sha256` integrity
header, removes the `.spec.ts` that managed the file (`--keep-spec` leaves it),
and adds a `<!-- vigiles-disable require-instructions-spec -->` marker so `lint`
won't ask for a spec back. The compiled file's content is preserved verbatim — you keep
everything, you just stop managing it through a spec.

```bash
npx vigiles eject CLAUDE.md             # back to plain markdown; the spec is removed
npx vigiles eject CLAUDE.md --keep-spec # keep the spec (compile would re-manage the file)
```

A file with no integrity header isn't vigiles-managed, so `eject` reports
"nothing to eject" and changes nothing. This is the escape hatch behind
"managed, but ejectable": you can adopt a typed spec for stronger guarantees
knowing you can always drop back to markdown you own.

Two safety details: a **shared spec is kept** — if the file you eject was one of
several outputs of a multi-target spec (`target: ["CLAUDE.md", "AGENTS.md"]`, or a
mirror), the spec is left in place until its last compiled output is ejected, so
the others never orphan. And a compiled **skill / subagent** (its body leads with
YAML frontmatter) is ejected verbatim — no disable marker is inserted (that would
displace the frontmatter and break the surface; the marker only applies to
instruction files).

### Compiled hooks — folded into `compile`

A **compiled hook** is a hook authored as a pure typed function against the
closed `vigiles/hook` vocabulary, which makes whole classes of hook bugs
unrepresentable (false confidence, matcher bypass, capability creep); see the
[compiled-hooks guide](compiled-hooks.md) for the why.

There is **no `compile-hook` verb** — hook compilation is folded into `compile`
(the cohesive-cli-surface principle: one verb compiles every
typed authoring artifact). Put the hook source in **`.vigiles/hooks/`** (it's
harness-neutral, so it lives in vigiles's own dir, not `.claude/`), then:

- `vigiles compile` discovers `.vigiles/hooks/*` (or take one: `vigiles compile
.vigiles/hooks/x.mjs`), runs the capability check (an import outside
  `vigiles/hook` **fails the build**, exit 1), **merges** the block into the
  active harness's config (`.claude/settings.json` / `.codex/config.toml`)
  idempotently, and writes a tamper-evident stamp to `.vigiles/hooks/<file>.json`.
- `--harness=codex` merges a Codex `config.toml` `[[hooks.<event>]]` block (an
  anchored-regex matcher) instead of the Claude Code JSON. The same typed program
  compiles to either; the gate runtime is shared (Codex vetoes via `exit 2`).
- **Context providers.** A gate can decide on external state by declaring
  `needs: ["git.branch"]` (built-ins: `git.branch`/`git.isDirty`/`git.root`/`cwd`/
  `os.platform`/`env.isCI`), or an inline `provide(name, cmd)` / `dangerously(name,
cmd)`, or a **registered** provider. `compile` also discovers
  **`.vigiles/providers/*`** (`export default defineProvider({ name, run })`),
  validates each is read-only (unless `dangerous: true`), and checks every
  `provider()` ref resolves — a dangling ref or an unsafe provider **fails the
  build**. The trusted runtime gathers the declared facts; the hook does zero I/O.
  See the [compiled-hooks guide](compiled-hooks.md#deciding-on-external-state-context-providers).

The merged block points at the `hook-runtime run-program` entrypoint (below).

Honest scope: this fixes the hook's authoring + logic, not the harness's
delivery — a subagent's tool calls still bypass any PreToolUse hook
([#34692](https://github.com/anthropics/claude-code/issues/34692)).

### `hook-runtime <kind>` — runtime entrypoints (not typed by hand)

The harness invokes these on every matching event, via a block `vigiles compile`
emits — they are **not verbs**, so they live under one hidden umbrella, off the
help surface (verbs are typed; runtime entrypoints are emitted). You should never
type one yourself; `compile` wires them for you.

- `vigiles hook-runtime run-program <file>` — the compiled-hook runtime: reads
  the live event on stdin, **verifies the stamp** (a hand-edited artifact is
  refused — exit 2, fail closed), and dispatches by role — a gate exits 2 +
  reason on `deny`, an inject prints `additionalContext`, a react runs its
  classified command. Exit codes: `0` allow, `2` deny/refuse.
- Other kinds (`agent`, `skill`, `skill-tool`, `refs`, `guard`, `intercept-tool`,
  `effect-enter`/`effect-exit`, …) back the subagent/skill rails and other
  emitted gates. Renaming a `<kind>` breaks every already-emitted block, so it's
  a breaking change.

### `audit [dir]`

**Lighthouse for your harness.** Point vigiles at any plugin or repo (defaults to
`.`) and get a one-command report — **no model, no API key, safe to run
anywhere**: five **category rings**, the **safety battery** run against your hooks,
each finding's **fix** inline, and a self-contained **HTML report**.

```
Harness audit

  ● Truthfulness   100  ██████████████████████
  ✗ Safety          14  ███░░░░░░░░░░░░░░░░░░░░
       └ 6/7 disaster(s) slip through your hooks
  ◑ Triggering      92  ████████████████████░░
  ● Structure      100  ██████████████████████
  ◑ Tested          88  ███████████████████░░░

Harness health: C (77/100)
```

The five categories — **Truthfulness** (refs resolve) · **Safety** (hooks block) ·
**Triggering** (skills fire / don't collide) · **Structure** (tool contracts, MCP,
frontmatter) · **Tested** (coverage) — are each 0–100, weighted into the overall
grade; an n/a category (e.g. Safety with no hooks) is excluded, never a false 0.

Under the rings, the detailed report lists per-skill description + user-invoked
flag + **description-script** detection (a description whose dominant script differs
from the expected one — **default Latin, configurable** — carries a cross-language
trigger risk: the selector is English-centric, so a Cyrillic/CJK/… description may
under-fire on English prompts; a RISK flag, not a defect — measure it with
`--measure`), per-agent tool contract (and the "no `tools:` line → inherits every tool"
footgun), hook resolution (`ok` / `missing` / `unresolved`), command + MCP
detection, and untested-surface counts. `--json` for CI; `--no-html` to skip the
report file.

**The safety battery runs by default** — it _executes_ your `PreToolUse` hooks
against a curated disaster catalog (force-push, `rm -rf`, `--no-verify`,
secret-read, `curl|sh`) and reports what they actually **block vs allow**. This is
the #1 verified hook pain: a guard that _looks_ like it blocks and silently
doesn't (exit 1 ≠ 2, wrong JSON field, a missed compound command). The battery
proves the hook's **logic**, not just its presence. **Confinement-aware** (the
`audit-side-effect-free` rule): your OWN repo (scanned dir = cwd) runs its hooks
directly, like running your tests; a FOREIGN plugin runs them sandboxed
(bubblewrap) or **skips with a loud note** — a stranger's hooks never run
unconfined. Only `PreToolUse` guards are tested (a `SessionStart` / `PostToolUse`
hook can't block a tool call, so it isn't scored against the catalog).

Each deterministic finding carries its **fix inline** under the report — the
cross-reference cause + a one-line correction (`FIX` a dead-end, `DIFFERENTIATE` a
description collision), `likely` dead-ends before `possible` proxies.

**A shareable HTML report** is written to `vigiles-report.html` by default — a
self-contained React app (category rings, findings, fix cards; auto light/dark)
the CLI fills with the report JSON, so it opens offline by double-click. Screenshot
it, attach it to a PR; for a human at a TTY it's opened best-effort. `--no-html`
skips it. A versioned **`vigiles-report.json`** is written alongside (`--no-json` to
skip) — the same contract `--json` prints, for CI or upload.

`audit` reports **harness-specific structure** (plugin layout, hook resolution),
so it auto-detects the harness — printing the detected one and warning when a repo
matches several — and takes `--harness=<name>` to override. (`compile` is
harness-aware for the same reason; `lint` isn't — reference verification is
harness-agnostic.)

**Dialect freshness (Claude Code).** Because vigiles's tool/event catalog is
hand-maintained against a specific Claude Code version, `audit` does a best-effort,
**read-local** check of your _installed_ `@anthropic-ai/claude-code` and prints a
one-line `⚠` only when its tool surface has drifted (a new/removed tool type) from
the catalog — a nudge that tool/contract checks may be stale and a vigiles update
may be due. It reads only your own install (nothing is sent or vendored), never
throws, and stays silent on a mere version bump with no surface change.

```bash
npx vigiles audit ./some-plugin          # human-readable report for one plugin
npx vigiles audit ./some-plugin --json   # structured, for pipelines
npx vigiles audit ./plugins/*/           # ≥2 targets → ranked health leaderboard
npx vigiles audit ./plugins/*/ --md      # ranked leaderboard as a Markdown table (publishable)
npx vigiles audit ./marketplace-repo     # a marketplace.json root → ranks every member
npx vigiles audit ./repo --harness=codex # override harness detection
```

#### Leaderboard — rank many plugins

Pass **more than one directory** — or a single **marketplace** root (a
`.claude-plugin/marketplace.json`, e.g. `wshobson/agents`' 80+ plugins, which
`audit` expands into its members) — and `audit` switches to a **ranked health
leaderboard**: a deterministic structural-health score (0–100 + A–F) per plugin,
worst issues first. Weights: a missing hook script −15 (won't run), a skill with
no usable description −10 (can't trigger), a broken intra-plugin reference −8
(partial-vendor / dead path), an agent with no `tools:` contract −5 (inherits
everything), an untested surface −3. Scoring deliberately ignores the loader's
free-text warnings (they include doc-mention false positives), so the ranking
stays defensible. A **command-only** plugin (`commands/*.md`, no skills/agents/hooks)
or an **MCP-only** plugin (`.mcp.json`) is a real, valid surface and scores on its
own health — only a directory with _no_ surface at all scores 0. Add **`--md`** to
emit the ranking as a **Markdown table** (the publishable form for a README/gist/site;
`--json` gives the full per-plugin breakdown). A worked at-scale run over real public
plugins lives in `bench/leaderboard/` (`run.mjs` + the generated `RESULTS.md`).
(The leaderboard is the multi-dir form and does not run the per-hook safety battery
or write an HTML report — those are the single-dir audit.)

#### The executing checks — one consent (`audit` asks, or `--measure`)

A plain `audit` is a deterministic **read**. Three checks actually _run_ your
harness, and they share **one** consent:

1. **Safety battery** — execute each PreToolUse hook against the disaster catalog
   to prove it blocks (network-confined where a sandbox exists; otherwise your own
   hooks run direct with a loud warning, a foreign plugin's skip).
2. **Live MCP resolution** — **start each declared MCP server** and check every
   `mcp__server__tool` resolves (`tools/list`), catching silent "rename rot". Own-repo
   only — a foreign plugin's servers are never spawned. (Starting a server connects
   to its real backend, which is why it never runs on a plain read.)
3. **Skill firing (trigger-rate)** — how reliably each model-invocable skill's
   description **FIRES** (recall) and stays quiet on unrelated prompts (precision).
   Probes are **auto-generated from each skill's description** (zero setup);
   `--prompts=<file>` supplies a curated set + the selection-collision matrix.

**How the consent works** — `audit` is a read by default and identical on every OS;
the executing checks are opt-in:

- **At a terminal (TTY)** → `audit` **asks once** ("Run the executing checks against
  your harness?" — with a confinement + cost disclosure) and **remembers** the answer
  in `.vigilesrc.json` (`audit.measure`).
- **Headless** (`--json` / CI / non-interactive / an agent) → stays a read + a
  one-line nudge; never hangs, never silently executes.
- **`--measure`** is the headless "yes" (and a human's skip-the-prompt). There is no
  `--fast`/`--no-measure`: the default _is_ the read, so there's nothing to opt out of.

```bash
npx vigiles audit ./some-plugin                                # read; asks at a TTY
npx vigiles audit ./some-plugin --measure                      # run the executing checks (headless yes)
npx vigiles audit ./some-plugin --measure --prompts=./probes.json --model=sonnet
```

The trigger tier needs the harness CLI + model auth; it **degrades honestly**
("unavailable") when absent, runs on your own Claude Pro/Max subscription (or
`ANTHROPIC_API_KEY`). `--harness=codex` routes the trigger probe through the native
Codex driver. See
[`docs/harness-testing.md`](harness-testing.md).

#### Capability diff — `audit <after> --capability-diff=<before>`

**Did this change widen the agent's blast radius?** Computes each version's
whole-harness **capability lattice** from its scanned agents — the union of every
agent's reachable tools (read-only / side-effecting / unknown-MCP) plus the loosest
purity floor — and diffs them. A change **WIDENS** the surface iff it adds a
side-effecting or unknown/MCP tool, or loosens the purity floor; new read-only tools
and removals are reported but are **not** a widening. Deterministic, no model.

`<before>` is any prior version — e.g. a git worktree of the PR's base. Intended as a
**PR comment**, so it's **informational by default** (exit 0); pass `--fail-on-widen`
to make a widening a non-zero exit (the opt-in CI gate — don't cry wolf, since
widening is often intended).

```bash
npx vigiles audit ./head --capability-diff=./base                  # report (exit 0)
npx vigiles audit ./head --capability-diff=./base --fail-on-widen  # exit 1 if widened
npx vigiles audit ./head --capability-diff=./base --json           # structured diff
```

This is the **capability-diff** check: the capability surface is the typed
effect lattice `generate-harness` already computes; the diff reads it.

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

### `generate harness [dir] [out]`

Emit **one typed registry** — `harness.gen.ts` — over every `*.spec.ts` under
`dir`, so a single `tsc --noEmit` cross-checks the **whole harness as one
program** (think TanStack Router's `routeTree.gen.ts` or the Prisma client). It's
the third generated artifact beside `generate types` (`.d.ts`) and
`generate schema` (JSON Schema).

> **You rarely run this by hand.** Like all three `generate-*` artifacts, it's
> dev-toolchain output (read by `tsc`/your editor, never by the agent). Once the
> file exists, **`compile` keeps it fresh** — this verb is the explicit/CI
> escape-hatch (e.g. `--check`). `generate-types`/`generate-schema` similarly run
> off a guard on linter-config changes, not by hand.

It ships four cross-spec checks:

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
npx vigiles generate harness ./agents               # → ./agents/harness.gen.ts
npx vigiles generate harness ./agents out.gen.ts    # custom out path
npx vigiles generate harness ./agents --check        # CI: assert the gen file is up to date (exit 1 if stale)
npx vigiles generate harness ./agents --harness=codex
```

**tsconfig need:** the gen file imports sibling `*.spec.ts` directly, so the
tsconfig that type-checks it needs `"allowImportingTsExtensions": true` (under
`Node16`/`NodeNext` resolution). Commit `harness.gen.ts` like a lockfile and add
a `--check` step to CI so a stale registry is caught, then let `tsc --noEmit`
enforce the cross-checks. Wire regeneration to a spec guard (the same mechanism
as `recompile-on-spec-change`):

```ts
guard({ watch: "*.spec.ts", run: "npx vigiles generate harness" });
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
guide.

## Lint vs audit — gate vs report

`lint` and `audit` look like they overlap, but they're **different verbs with
different contracts** — the classic gate-vs-report split (think `eslint .` /
`tsc --noEmit` vs `npm audit` / `terraform plan`):

- **`lint` is the gate.** It runs on **your** repo with **your** config, verifies
  references (file paths, scripts, and linter rules across **7 catalogs** — does
  the rule exist _and_ is it enabled?), checks integrity/hash, coverage
  thresholds, orphan docs, duplicate rules — and exits with **config-driven
  severities → stable CI codes (0/1/2)**. It blocks bad commits.
- **`audit` is the report.** Zero config, harness-aware, works on **any** plugin
  (including third-party ones with no spec). It scores the five category rings,
  runs the safety battery + (own-repo) live MCP resolution, ranks a whole
  marketplace (leaderboard), writes the HTML report, and **measures whether skills
  fire** (the model tier) when it can — run what you can, degrade loudly. It's
  safe-to-run-anywhere by default (the `audit-side-effect-free` rule): the only
  things that execute are your own hooks/servers (or a foreign plugin's, sandboxed
  or skipped).

They deliberately **share one implementation** of the few deterministic
structural detectors they have in common (untested-surface, dangling-ref,
description-script), per the `one-detector-no-drift` rule, so the two surfaces can
never disagree. The asymmetry everywhere else is intentional: some checks need
inputs only the gate has (your catalogs, your compiled output), and the
**model-gated trigger column must never become a `lint` rule** (lint stays free +
deterministic + every-commit).

**What each does:**

| Check                                                       |  `lint`  |  `audit`  | `audit --measure`  |
| ----------------------------------------------------------- | :------: | :-------: | :----------------: |
| Linter-rule cross-ref (7 catalogs, exists **+ enabled**)    |    ✓     |     –     |         –          |
| Marked file/script ref verification                         |    ✓     |     –     |         –          |
| Integrity/hash · duplicate-NCD · coverage · orphan docs     |    ✓     |     –     |         –          |
| Untested surface                                            |  ✓ gate  |  ✓ ring   |         –          |
| Dangling ref · description-script _(shared detectors)_      |    ✓     |     ✓     |         –          |
| Instruction file · tool-contract/inherits-all · hooks · MCP |    –     |     ✓     |         –          |
| Category rings + weighted health score                      |    –     |     ✓     |         –          |
| Safety battery (does a hook actually block?)                |    –     |     –     |         ✓¹         |
| HTML report                                                 |    –     | ✓ default |     ✓ default      |
| Leaderboard (rank a marketplace)                            |    –     |     ✓     |         –          |
| MCP tool exists on **live** server                          |    –     |     –     |    ✓ own-repo²     |
| Trigger recall/precision (does a skill fire?)               |    –     |     –     |         ✓³         |
| Config severities + CI exit codes                           |    ✓     | read-only |     read-only      |
| **Cost tier**                                               | free/det | free/det  | **exec+model/sub** |

The three executing checks share **one consent**: a plain `audit` is a read; at a
TTY it **asks once** (remembered in `.vigilesrc.json`), and `--measure` is the
headless "yes". There is no `--fast` — the default already is the read.

¹ The safety battery runs every hook under a **no-egress sandbox** where one
exists (so a hook can't reach your DB/API during the probe); where none does
(macOS today) it runs your **own** hooks direct with a **loud warning** and skips
a foreign plugin's.
² Live MCP **starts your servers** (connects to real backends), so it's **own-repo
only**; a foreign plugin's servers are never spawned.
³ The trigger tier needs model auth; it **degrades honestly** ("unavailable") when
absent and runs on your subscription (or a metered key).

**Where each runs:**

| Target             |        `lint`        |        `audit`        |  `audit --measure`  |
| ------------------ | :------------------: | :-------------------: | :-----------------: |
| Normal app repo    |   ✓ (marked refs)    | ✓ (instruction file)⁴ |   n/a (no skills)   |
| Claude Code plugin |          ✓           |           ✓           |          ✓          |
| Codex plugin/repo  | ✓ (harness-agnostic) | ✓ (auto-detect, TOML) | ✓ `--harness=codex` |
| Marketplace (many) |       per-file       |     ✓ leaderboard     |   per-plugin only   |

⁴ On a plain repo `audit` reports the detected instruction file (`CLAUDE.md` /
`AGENTS.md`, spec-managed vs hand-written) but no plugin surface; reference
_verification_ of that file is `lint`'s job (and needs marks — inline,
frontmatter, or a spec; plain prose isn't auto-parsed).

The executing checks are **state-safe by consent**: a plain `audit` runs none of
them (a deterministic read), so it's safe on any repo, even one wired to prod. On
opt-in, the safety battery runs each hook under a no-egress sandbox where one
exists (so it can't reach your DB/API mid-probe), else your own hooks run direct
with a loud warning and a foreign plugin's are skipped; live MCP starts servers
own-repo only; the trigger-rate stubs skill bodies so no procedure runs.

## GitHub Action

Run vigiles in CI via a composite action over the published `npx vigiles` CLI.
The full reference — quick start, every input, the three output channels (incl.
the sticky PR comment), and the Action-tag-vs-CLI-version model — is in its own
doc: **[github-action.md](github-action.md)**.

```yaml
- uses: zernie/vigiles@v1 # runs `lint` by default; see github-action.md
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
    "require-instructions-spec": "error",
    "integrity": "error",
    "coverage": ["warn", { "scripts": 50, "linterRules": 5 }]
  }
}
```

Disable per-file with `<!-- vigiles-disable require-instructions-spec -->` at the top of the markdown.
