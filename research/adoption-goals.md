---
status: active
topic: positioning
---

# Adoption goals — the north star

WHAT adoption success looks like and the principles that get us there — the durable
part, kept separate from HOW (the buildable mechanics live in `adoption-design.md`).
The distilled form governs every product decision as the `gate-first-adoption` rule in
the root `CLAUDE.md`; this is the full record behind it. Extends
`adoption-direction.md` (audit-first, markdown = source of truth).

Read this before designing anything that touches `init`, the report, the CLI output,
onboarding, or sharing. If a change doesn't serve a goal below — or violates a
non-negotiable — it doesn't ship.

## The goals

- **G1 — The integrity gate is the universal floor.** `audit` (local) + `lint` (CI)
  must be valuable AND safe for EVERY repo with zero setup and zero conflict — any
  stack, existing-harness or not, public or private. This is what everyone adopts
  first, and it must stand entirely on its own. _Success: an existing-harness team on
  a non-JS stack wires `lint` into CI and gets real value without installing anything._

- **G2 — Everything richer is invited, never forced.** Specs, installed skills,
  `rules → enforced`, `eval` are VALUE ON TOP. `init` offers them; the offer is a
  genuine ask, and saying no is free and remembered. _Success: no team feels the tool
  imposed itself; the invitation converts the willing without annoying the rest._

- **G3 — Fit the team, don't fight it.** The path branches by stack (is there a
  supported linter?) and by whether a rich harness already exists (see
  `adoption-personas.md`). Never over-promise a feature that doesn't apply, never
  measure the wrong thing. _Success: the report and CLI show only what is TRUE for
  THIS repo — no silent `rules → enforced`, no `Tested` alarm for a team with its own
  tests._

- **G4 — A result is worth sharing, and sharing is clean.** A grade should spread
  because it's genuinely worth sharing — a real report link, a fair grade, an opt-in
  README badge — never through coercion. A LOCAL CLI result must be as shareable as a
  web-demo one. _Success: people share their grade because they want to, and featuring
  someone else's (sometimes low) grade never reads as shaming._

- **G5 — Every path serves the one conversion.** The apex metric is the % of visitors
  and readers who actually RUN `npx vigiles audit` — and come back. Goals G1–G4 exist
  to feed it; a change that doesn't help someone run (and re-run) the command isn't
  earning its place. (The site's existing TOP GOAL, framed as the adoption apex.)

## Non-negotiables (the "not evil" contract)

These bind every adoption/onboarding/sharing surface. Breaking one is a defect, not a
tradeoff.

1. **A read never writes.** `audit`/`lint` never mutate the repo, never install, never
   phone home. Setup is always a separate, explicit, consented step (`init`).
2. **Declining is free, one keystroke, and remembered.** No nag loops, no
   default-yes on an invasive choice, no degraded grade or withheld feature as
   punishment for saying no. Agent / CI / piped runs never hang on a prompt — they
   take the safe default and print a one-line invitation.
3. **Never over-promise or measure the wrong thing.** Don't feature a capability that
   doesn't apply to the repo's stack; don't render an advisory/native-only metric as a
   failure. Honesty over a flattering-but-false signal.
4. **Grade others fairly (the Lighthouse contract).** When vigiles publicly grades a
   repo it doesn't own, findings are objective, reproducible, and one-line-fixable, and
   the tone is "worth fixing", never "gotcha". A low grade is a diagnosis, not a dunk.
5. **No dark-pattern sharing.** No forced/coerced shares, no contact-list spam, no
   "share to unlock", no auto-posting, no fake scarcity, no streak/guilt manipulation,
   and never gate real value behind a viral action. Sharing is offered, value-first,
   and always declinable. (The ethical-viral-loop research grounds the specific
   mechanics in `adoption-design.md`.)

## The throughline

Sell the GATE to everyone (universal, safe, zero-conflict); INVITE the rest
(discoverable, easy to say yes to, never forced); FIT each team (show only what's
true); and let a fair result spread on its own merits. Adoption is earned by being
useful and honest at every step, not extracted by pressure.
