# Audit → adoption UX: how the report creates specs

> Design record (2026-06-27) for the "run init from the audit report" flow the
> founder spitballed: the audit report should let you turn your harness into typed
> specs — fully or per-surface — and `audit` by default should deliver maximum
> usefulness. This doc captures the constraint, the decisions, and what's shipped
> vs next. Companion to `audit-lighthouse-design.md` and `readme-revamp-concepts.md`.

## The hard constraint: the report is a browser app, it can't write files

The shareable audit report is a static single-file React app (`report/`, built to
`dist/audit-report.template.html`, filled with the `AuditReport` JSON). It runs in
the **reader's browser**. A browser cannot write `.spec.ts` files into the repo, run
`git`, or shell out. So **no button in the HTML can directly create a spec.** Every
"do something to my repo" affordance has to cross back to the CLI, which is where
filesystem access lives.

This kills three tempting-but-unworkable ideas:

- **A "keep this spec" button that writes the file** — the browser can't.
- **git stash as a staging area** (stash the generated specs/recompiled markdown,
  un-stash via report buttons) — rejected on the merits, not just the browser wall:
  a stash is **global and all-or-nothing** (fights per-surface keep/discard), it
  **hijacks the user's own stash stack** (collisions, `pop` conflicts), it's **hidden
  state** another agent/command can clobber, and the report still can't run
  `git stash pop`. Clever reuse of plumbing, wrong tool for per-surface, low-commitment.
- **Preview-then-keep with a staging dir** — over-engineered once we decided the
  default just creates the specs (below). Selective generation makes "where do we
  hide the un-kept ones" a non-question: you don't generate the ones you don't want.

## Decision 1 — the default CREATES specs (max usefulness), no previews

The founder's call: _"our default should deliver as much usefulness as possible and
create all the specs it can."_ So adoption is not a timid preview — it writes specs.
This is safe and consistent with `audit-side-effect-free`: **writing local `.spec.ts`
files is a deterministic, reversible local write** (no external side effect, `eject`
reverses), categorically different from the _executing_ checks (live MCP, real-model
trigger-rate) that stay opt-in. File creation was never the unsafe part.

SHIPPED (this is the engine the report drives):

- `adoptSkill` / `adoptAgent` (`src/core/adopt.ts`) — a `SKILL.md` → `skill()` spec
  (verbatim body), an `agents/<x>.md` → `agent()` spec (lead → `body`, `##` → named
  sections). Best-effort + non-destructive: standard frontmatter + body round-trip;
  an unmappable key (`level:`/`skills:`) is preserved in a `// NOTE`, never dropped.
- `vigiles init --target=skills/x/SKILL.md` — adopt ONE surface (per-surface path).
- bare `vigiles init` — `discoverAdoptableSurfaces` sweeps every `skills/*/SKILL.md`
  - `agents/*.md` (bare and `.claude/` roots) without a spec and adopts each, **plus**
    the instruction file. "Create all the specs it can" by default.

## Decision 2 — the report drives the CLI by EMITTING COMMANDS

Since the browser can't write, the report's adoption affordances are **command
emitters**, not writers (the honest bridge that respects the read-only report):

- **Per surface card** → a "Create spec" affordance that reveals / copies the exact
  command: `npx vigiles init --target=<surface>`. One click → paste in terminal →
  the CLI writes that one spec.
- **Header** → "Create all specs" → copies `npx vigiles init` (which now sweeps all
  surfaces). One command, every spec.

This maps the founder's "run init either fully or only for some files/surfaces"
directly: fully = `init`, per-surface = `init --target=`. Both call the SAME shipped
engine. No new runtime, no localhost server, no stash — the report stays a static,
shareable, safe-anywhere artifact; the CLI does the writing.

(`vigiles audit --serve` with a localhost backend makes the buttons
one-click-no-paste — it adds a server + security surface, so it stays OPT-IN (a
TTY prompt or `--serve`), own-repo only, and Jupyter-grade token/Origin-hardened.
SHIPPED 2026-06-28 — full design + threat model in
[`audit-serve-design.md`](audit-serve-design.md). The static copy-command path
stays the default.)

## What's shipped vs next

SHIPPED (committed on `claude/pre-release-priorities-pw7myh`):

- The adoption engine (`adoptSkill`/`adoptAgent`) — round-trip tested + dogfooded.
- `init --target=<skill|subagent>` and the bare-`init` create-all sweep — CLI e2e tested.
- **Adoptable surfaces in the `AuditReport`** — `buildAuditReport` carries an optional
  `adoptable` field: every un-spec'd surface (instruction file + skill/subagent sweep,
  computed by the layout-aware `discoverAdoptableForAudit` in the CLI so the pure
  builder stays adapter-agnostic) with its `npx vigiles init --target=<path>` command,
  plus a top-level `createAllCommand` (`npx vigiles init`). Mirrored in
  `report/src/schema.ts`; additive/optional, no schema bump.
- **Report UI affordances** — per-surface "Create spec" + header "Create all specs"
  copy-to-clipboard buttons in the `report/` React app (`Adopt.tsx`), reading
  `report.adoptable`. Command EMITTERS, not writers (the browser can't write files).
- **CLI report nudge** — the terminal `audit` output lists adoptable surfaces (up to
  ~5, then "+K more") with the per-surface command + the one "create all" command, plus
  a small "do your skills actually fire?" behavioral nudge pointing at `measureTriggerRate`.
  Suppressed in `--json` (the data lives in `adoptable` instead).

NEXT (not yet built):

1. **(Optional, deferred)** `audit --serve` one-click backend; greenfield
   skill/subagent scaffolding (today the sweep adopts EXISTING surfaces only).
