# Coverage scorecard — wshobson-accessibility@cf6059d

> Dogfood of the three-rung model (`research/eval-coverage-and-isolation.md`) on a
> real vendored plugin. Rungs: **R1** cheap/deterministic (no model) · **R1-MG**
> model-gated trigger/behavior (runs on the sub) · **R2** record-replay shell-out ·
> **R3** real disposable service (here: a real browser). The pinned snapshot is
> never modified.

## Artifacts → rung → what a proper eval needs → tested?

| Artifact                              | Kind      | Rung   | What a proper eval needs                                                              | Test written?                          |
| ------------------------------------- | --------- | ------ | ------------------------------------------------------------------------------------- | -------------------------------------- |
| `ui-visual-validator` agent (contract)| agent     | R1     | tool-contract: NO `tools:` line → inherits ALL (the footgun) — surface it             | ✓ `vendor-coverage.test.ts` (scan)     |
| `ui-visual-validator` rail            | agent     | R1     | parse the (missing) contract; the rail honestly reports no restriction; a spec adds it| ✓ `agent-runtime.test.ts`              |
| `ui-visual-validator` behavior        | agent     | R3     | screenshot analysis / visual regression — needs a REAL browser + rendered page        | R3 — out of cheap scope                |
| `screen-reader-testing` skill (desc.) | skill     | R1-MG  | `measureTriggerRate`: fires on screen-reader / assistive-tech prompts                  | model-gated (description present ✓)    |
| `screen-reader-testing` behavior      | skill     | R3     | actual VoiceOver / NVDA / JAWS output — needs a real assistive-tech runtime            | R3 — out of cheap scope                |
| `wcag-audit-patterns` skill (desc.)   | skill     | R1-MG  | `measureTriggerRate`: fires on "audit this for accessibility" prompts                  | model-gated (description present ✓)    |
| `wcag-audit-patterns` behavior        | skill     | R3     | run an automated a11y scanner (axe) against a real rendered DOM                         | R3 — out of cheap scope                |
| `accessibility-audit` command         | command   | R1-MG  | does the slash-command prompt drive a real audit (judged)                              | flagged by scan / model-gated          |
| plugin structure (skills/agents/cmd)  | structure | R1     | scan: skills have descriptions, agent contract surfaced, command counted               | ✓ `vendor-coverage.test.ts`            |
| `loadPlugin` invariants               | structure | R1     | layout parses, agent + command surfaces flagged, no spurious dangling refs             | ✓ `vendor.test.ts`                     |

## Distribution + testability grade

- **Free / deterministic (R1, no model): ~30%** — the inherits-all footgun (the
  headline finding), the agent rail, and all structural facts (descriptions,
  agent/command surfaces). These RUN in CI today.
- **Model-gated (R1-MG, runs on the sub): ~25%** — the two skills' triggering and
  the command's drive-the-audit behavior.
- **Needs a container (R3): ~45%** — this plugin's *purpose* is verifying real UI:
  the visual validator needs a **real browser + rendered page**, screen-reader
  testing needs a **real assistive-tech runtime**, and WCAG auditing needs a **real
  DOM scanned by axe**. These are the genuine R3 apex — vigiles composes with a
  container/browser here, it does not fake them.

**Grade: C.** The deterministic tier catches the most *useful* defect (the
inherits-all agent footgun) and the structural surface for free, but the bulk of
this plugin's actual work — looking at pixels, driving a screen reader, scanning a
live DOM — is irreducibly R3. Honest finding: an accessibility/visual plugin is the
*worst case* for cheap tiers, because its semantics ARE the real browser.

## R3 shortlist

- **Headless browser** (Playwright/Puppeteer + a rendered page) — for
  `ui-visual-validator` screenshot/visual-regression analysis and `wcag-audit-patterns`.
- **Automated a11y scanner** (axe-core) against a real DOM — for WCAG violations.
- **Assistive-tech runtime** (VoiceOver / NVDA / JAWS) — for `screen-reader-testing`;
  the hardest to containerize (OS-native AT), realistically out of scope.

## Verdict

vigiles can comprehensively test the **safety + structure** of this plugin for free
— and crucially it catches the real-world footgun: `ui-visual-validator` ships no
`tools:` line, so it silently inherits Write/Edit despite being a read-only visual
checker (the cheap tier surfaces this on the scan report, and a compiled spec adds
the rail it omits). But the *function* of an accessibility plugin is to interrogate
a real rendered UI / assistive-tech runtime — that is genuinely R3 and the largest
share of its surface. This is the honest worst case: ~45% needs a real browser/AT
container, which vigiles composes with rather than fakes. The cheap tiers protect
you from the contract footgun and prove it loads; they cannot tell you whether the
audit *finds real WCAG violations* without a browser.
