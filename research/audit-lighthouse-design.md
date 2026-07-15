---
status: shipped
topic: audit
---

# `vigiles audit` — Lighthouse for your harness (locked design + build plan)

> Internal design record. The lane/positioning rationale is in
> `research/harness-checkup-and-lanes.md`; this is the concrete shape we're building
> for pre-release. Decided 2026-06-27 with the founder (name / HTML / scope forks).

## The model

Lighthouse, applied to an agent harness: **one command → a multi-category audit →
each category a 0–100 ring → a self-contained HTML report with per-finding
what/why/how-to-fix → JSON for CI.** No flags for the basic run. The differentiator
over every structural linter (agnix, AgentLinter, Snyk): **we RUN your harness, not
just read it** — the safety battery executes your hooks, `--deep` measures whether
skills actually fire.

## Locked decisions

- **Verb: `audit`** (rename from `scan`). Lighthouse calls its runs "audits"; "scan"
  = read (Snyk's lane) and fights the "we run it" thesis. Clean break, no alias
  (pre-release, no users). Internal `scanPlugin`/`scan.ts` (the GATHER layer) keep
  their names; `audit` is the verb/report layer on top (Lighthouse: gatherers vs audits).
- **Categories with rings** (not one score): **Truthfulness** (refs resolve) ·
  **Safety** (hooks block — the battery) · **Triggering** (skills fire / don't
  collide) · **Structure** (tool contracts, MCP, frontmatter) · **Tested** (coverage).
  Each 0–100, weighted → overall grade. Reuses `scoreReport` penalties, bucketed.
- **Battery runs by DEFAULT** (own-repo direct = like running your tests; foreign =
  sandbox-or-skip-loudly). No `--check-hooks` flag. The differentiated finding leads.
  Single-dir audit only (not the multi-dir leaderboard — too noisy/all-foreign).
- **`--deep`** = the ONE opt-in expensive tier: live MCP spawn + model-gated
  trigger-rate. Replaces `--verify-mcp` + `--trigger`. **⚠ SUPERSEDED 2026-06-27 by
  the `--deep` INVERSION (see the section at the bottom):** live-MCP folded into the
  default (own-repo), the model tier now runs-what-it-can (default for an interactive
  human on a sub, asked-once/remembered, skipped-loud in CI/`--json`/metered), and
  `--deep` is replaced by `--measure` (force on) / `--fast` (force off).
- **Auto-generated probe prompts** from each skill's description (zero-setup
  trigger-rate — kills the `--prompts` friction that made the eval un-wowable).
  `--prompts=` stays as an override.
- **HTML written by DEFAULT** to `vigiles-report.html` + offer to open (`--no-html` to
  suppress). Self-contained (inline CSS, zero deps, like `tools/make-demo-gif.py`).
  The shareable wow; nobody in agent-tooling ships this.
- **`--json`** for CI. **`--only=cat,cat`** to narrow (Lighthouse's --only-categories).
- **Folded/dropped flags:** `--check-hooks` (default), `--verify-mcp`+`--trigger`
  (→ `--deep`), `--fix-plan`+`--explain` (every finding carries its fix in the report).

## Rule change

`scan-side-effect-free` → reword (and rename to `audit-side-effect-free`): the DEFAULT
audit MAY execute the user's OWN hooks directly (like running their tests) + the score
battery; a FOREIGN plugin's hooks always sandbox-or-skip; the genuinely expensive tier
(live MCP, model trigger) stays behind `--deep`. Edit `CLAUDE.md.spec.ts` (compiled),
not the md. Keep the core: never run a stranger's code unconfined; default is safe to
run anywhere.

## Build sequence (each lands green + committed)

1. **Foundation** — rename verb `scan`→`audit` (cli-commands VERBS, dispatch, all
   `vigiles scan` refs in docs/comments/tests; self-command-refs enforces). Battery →
   default; collapse `--verify-mcp`+`--trigger` → `--deep`; reword+rename the rule;
   recompile CLAUDE.md.
2. **Category scoring** — per-category 0–100 + weighted overall; terminal renders the
   rings. Extend `scoreReport` (or a new `src/audit-score.ts`) bucketing existing
   penalties by category.
3. **`--deep` auto-prompts** — generate diverse probe prompts from skill descriptions
   (must pass the existing prompt-diversity gate); wire into `--deep` trigger-rate.
4. **HTML report** — `src/audit-html.ts`: self-contained template (category rings,
   findings w/ what/why/fix, battery viz). Write-by-default + best-effort open.
5. **README + docs reframe** — "Lighthouse for your harness" hero; `audit` flagship;
   HTML screenshot slot; update docs/cli.md + the rules matrix.

## Open questions to settle as we build

- Category WEIGHTS (Safety heaviest? equal?). Start equal, tune.
- Auto-prompt QUALITY — the hard part; may need a small model call or a deterministic
  template from the description. Deterministic first, measure.
- "Open the report" cross-platform (`open`/`xdg-open`/`start`), best-effort, never fail.

## SHIPPED (2026-06-27) — increments 1–5 + the report stack

All five increments landed: battery-by-default + `--deep` collapse + the
`audit-side-effect-free` rule; category rings (`src/audit-score.ts`); `--deep`
auto-prompts (`src/audit-prompts.ts`); the HTML report; the README/docs reframe.

**Then the report was re-architected around monetization (founder, 2026-06-27).**
The decision that reshaped it: **the JSON is the product boundary, not the HTML.**

- **`AuditReport` JSON contract** (`src/audit-report.ts`, `schemaVersion`) — the
  versioned wire format everything renders from: the local HTML report, `audit
--json` for CI, and a future UPLOAD to a hosted dashboard. `buildAuditReport` is
  pure (no clock; the CLI stamps `generatedAt` at write time). A default `audit`
  writes `vigiles-report.json` beside the HTML (`--no-json` to skip).
- **The report is a real Vite + React + shadcn app** (`report/`, a separate
  package) built via `vite-plugin-singlefile` to ONE self-contained file the CLI
  fills with the JSON (`window.__VIGILES_DATA__` placeholder → injected, `<>&`
  escaped). React runs in the reader's browser; the CLI ships only the built
  template (`dist/audit-report.template.html`, via `scripts/build-report.mjs`) and
  stays runtime-dep-light. Pure shadcn/Tailwind (band colors as theme utilities,
  no inline styles); auto light/dark. ONE renderer — no inline-CSS fallback; the
  build fails loud so the template is guaranteed (if missing, the CLI skips the HTML
  and the JSON + terminal report still work).

**Stack choice — now vs the hosted dashboard:** Vite SPA + single-file for the
LOCAL report (a static openable file); **TanStack Start** for the future HOSTED
dashboard (SSR + auth + Stripe — the paid tier), NOT for the local file. Both
consume the same `AuditReport` JSON and reuse the same presentational shadcn
components, so the dashboard is "wrap the components in routes + add auth/upload,"
not a rewrite. The JSON contract is the asset the business is built on; deeper
monetization/business strategy stays in the `startup/` vault.

**`--simple` removed (2026-06-27):** the inline-CSS fallback was a hedge, not a
need (the build guarantees the template; a 236KB self-contained React file is
already fine). Dropped → one renderer, pure shadcn/Tailwind. `build-report.mjs`
now fails loud so the template always ships; if it's ever missing the CLI skips
the HTML (JSON + terminal still work).

## The `--deep` INVERSION (2026-06-27) — run what you can, degrade loudly

The founder pushed on `--deep` across three turns and knocked out **both** stated
reasons for gating the model tier behind an opt-in flag:

1. **"deep should be folded if it's safe/sandboxed."** → Safety isn't the gate:
   trigger-rate **stubs skill bodies** (procedures never run), `audit` doesn't run
   agents end-to-end, the battery is provenance-gated, live-MCP is the user's own
   server. So "it's dangerous" was never the reason.
2. **"why opt in for model if it runs on subscription… do we check sub vs API?"**
   → We already detect it: `hasModelAccess`/`isMeteredAccess` read the env
   (`ANTHROPIC_API_KEY` = metered; `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` = sub,
   $0 metered). No need to ask. So on a subscription the **cost** objection is weak.
3. **"Lighthouse isn't deterministic."** → Decisive. Lighthouse runs its **noisy**
   performance audit by default and just shows the number ± variance; it has no
   `--deep` for the flaky part. So "non-deterministic → must be opt-in" doesn't
   survive the analogy either.

**What's actually left** is the ONE thing Lighthouse never faces: it always has its
engine (a browser); we might not have ours (a reachable model). So the gate is
**capability**, not safety/determinism/cost — plus wall-clock + a quota-consent
courtesy. The honest conclusion is the **inversion**: don't make people opt _in_ to
a safe, ~free measurement — **run what you can by default, degrade loudly.**

**Shipped:**

- **Model trigger-rate** via `decideMeasure` (`src/scan-trigger-suggest.ts`):
  interactive human + subscription → **offered by default, asked once, remembered**
  in `.vigilesrc.json` (`audit.measure`); `--json`/CI/non-interactive/metered →
  **skipped with a loud "Triggering not measured — …" note**; `--measure` forces,
  `--fast` skips. Metered API keys are never auto-spent.
- `--deep` is **removed** (clean break, pre-release). `--measure` (force on) +
  `--fast` (force off) replace it.

### State-safety correction (same day) — "what if a hook/server hits Postgres?"

A first pass folded **live-MCP into the default** ("deterministic + fast +
own-repo-safe"). The founder caught the hole: **sandboxing protects the HOST from
foreign code; it does nothing for your EXTERNAL STATE** — your _own_ hook or MCP
server, pointed at prod, will reach a real Postgres / API. Provenance is the wrong
axis for state. Two distinct threats:

- **HOST protection** — provenance-keyed (foreign → bubblewrap-or-skip). Shipped.
- **STATE protection** — "does running this _mutate my world_?" Independent of
  provenance; the unconditional-ephemeral-env idea, not fully shipped.

Per-surface blast radius: **live-MCP = HIGH** (starting a DB/API-backed server
_connects on boot_, before `tools/list`), **battery = MODERATE** (a hook that does
I/O per-invocation does it ×7), **trigger-rate = LOW** (bodies stubbed). The apex
"run the agent end-to-end and it DROPs a table" is **not done at all**.

So (decision **A**, chosen):

- **Live-MCP reverted to opt-in** (`--measure`, own-repo, never `--fast`/foreign).
  Confinement can't save it — deny-all-net breaks the `tools/list` it performs — so
  it must be explicit. A plain `audit` only NAMES the opt-in.
- **Battery runs network-confined** (`sandbox:'auto'`) where bubblewrap exists, own
  AND foreign; where it doesn't, foreign skips and own runs direct **with a loud
  "no network confinement" warning**. `--fast` skips it.
- **Safety ring → n/a (not 0) when no hook blocks any disaster** (none is evidently
  a Bash guard — scoring 0 was a cry-wolf that tanked the grade; fixed in
  `src/audit-score.ts`).

### Final shape (same day) — uniform consent, `--fast` deleted

The founder pushed twice more: (1) **no platform divergence** — "our solution
either works the same or we choose a different one," so don't run-confined-on-Linux
/ unconfined-on-Mac. (2) **too many subcommands** — `--measure`/`--fast`/`--no-measure`
for one binary axis is sprawl. (3) **"why a flag, not an interactive choice?"**

Resolved into the shipped shape — **one read-vs-run axis, consent-first:**

- A plain `audit` is a **deterministic READ** (rings + fixes + report) — uniform on
  every OS, nothing executes, safe on a prod-wired repo.
- **All three** executing checks (battery + live-MCP + trigger-rate) share **one
  consent** (`decideExecute`, `src/scan-trigger-suggest.ts`): at a TTY `audit`
  **asks once** — a bundled prompt that **discloses** confinement + cost — and
  **remembers** in `.vigilesrc.json` (`audit.measure`); headless it stays a read + a
  one-line nudge.
- **`--fast`, `--no-measure`, AND `--measure` are ALL deleted — no execution flag.**
  The founder's last point landed it: "why a flag, not an interactive choice? — and
  audit isn't run in CI anyway." Right — we'd already established `lint` is the CI
  gate and `audit` is the human-facing local report. So `audit` is **Lighthouse-style:
  a local report you run on your machine, NOT a CI step.** It runs the executing
  checks only when a human can consent (the prompt); **automation tests the harness
  through the `vigiles/testing` API + skills** (the layered tiers), never the report
  verb. The lone remaining audit knob is the remembered `.vigilesrc.json`
  `audit.measure` (yes/no), set by the prompt.
- **Battery demoted from default → consent** (uniform): execution is opt-in
  everywhere until one confinement works the same on macOS + Linux. Exit criterion /
  the "better way" that re-promotes it: an **env-scrub ephemeral floor** (strip
  DB/API creds before running a hook — no kernel features, cross-platform) and/or a
  **macOS `sandbox-exec`** backend to match bubblewrap.
- **Testability consequence:** since the CLI can't run the battery headless (no TTY
  in tests), `runSafetyBattery` moved to `src/audit-battery.ts` and is unit-tested
  there directly; the CLI e2e only asserts the read-vs-run boundary.

### Battery cut from audit entirely (2026-06-27, in PR #49 review) — "no half-made shit pre-release"

The above still ran the battery (consent-gated, Linux-confined / Mac-unconfined+warning).
The founder pulled the thread one more turn: shipping a capability whose safety is
Linux-only is the half-made part — narrow it out rather than document the caveat.

Decision (chosen: **cut only the safety battery**):

- **`audit` drops the Safety ring entirely → four DETERMINISTIC rings**
  (Truthfulness/Triggering/Structure/Tested). No battery in the `audit` verb.
- **The battery lives in the `vigiles/testing` API** (`guardrail-check` /
  `assertBlocksDisasters`, confined by `src/sandbox.ts`) — where you opt in
  explicitly and there's no zero-config-safety promise to break. `src/audit-battery.ts`
  (the audit wrapper) is **deleted**; `runSafetyBattery`/`runnableSafetyHooks` with it.
- **Kept** behind the same one-consent: live MCP (own-repo) + trigger-rate (model).
  Neither needs the parked confinement.
- `audit` re-promotes a Safety ring only once one confinement works the same on
  macOS + Linux (the unchanged exit criterion).
- **The confinement IMPLEMENTATION is KEPT, not removed — only the audit WIRING is
  parked.** `src/sandbox.ts` (bubblewrap + netns) and `src/egress.ts` (allowlisted
  egress) are intact and still drive `runHook({sandbox})`, `runHarnessTest`, and the
  testing-API battery (`guardrail-check.ts`). What was deleted is `src/audit-battery.ts`
  — the thin _audit wrapper_ — and the CLI's headless battery path. So re-promotion is
  a re-WIRE (point `audit` at the existing confinement once the cross-platform backend
  lands), never a rebuild. The reason it's unwired-by-default is the OS asymmetry alone:
  bubblewrap is Linux-only, so a default-on battery would be confined on Linux and
  unconfined-with-a-warning on macOS — exactly the "half-made" surface to avoid in a
  zero-config-safe `audit`. The implementation stays so the eval/testing lane (where
  the user opts in explicitly) keeps its full safety story today.

Two Codex (PR #49) review bugs fixed in the same pass:

- **instruction-only repos aren't "empty"** — `isEmptyMachine` now also checks
  `!r.instructions`, so a repo with just a `CLAUDE.md` scores instead of grading F/0
  "no loadable surface" (`src/audit-score.ts`).
- the reused-script-event mis-tag (scan.ts) is **mooted** by removing the battery
  from audit (its only consumer, `runnableSafetyHooks`, is gone).

**Follow-ups (not yet done):** the env-scrub ephemeral floor + macOS sandbox backend
(the exit criterion that earns the Safety ring back); the hosted dashboard itself; an
`audit --upload` that POSTs the JSON; a cross-package schema-parity guard (today
`report/src/schema.ts` mirrors `src/audit-report.ts` by hand + the
`audit-report.test.ts` shape tests).
