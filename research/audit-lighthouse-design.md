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
  trigger-rate. Replaces `--verify-mcp` + `--trigger`.
- **`--deep` auto-generates probe prompts** from each skill's description (zero-setup
  trigger-rate — kills the `--prompts` friction that made the eval un-wowable).
  `--prompts=` stays as an override.
- **HTML written by DEFAULT** to `vigiles-report.html` + offer to open (`--no-html` to
  suppress). Self-contained (inline CSS, zero deps, like `scripts/make-demo-gif.py`).
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

**Follow-ups (not yet done):** the hosted dashboard itself; an `audit --upload`
that POSTs the JSON; a cross-package schema-parity guard (today `report/src/schema.ts`
mirrors `src/audit-report.ts` by hand + the `audit-report.test.ts` shape tests).
