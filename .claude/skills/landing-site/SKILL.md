---
name: landing-site
description: The purpose, UX flow, and modern-minimalist design bar for the vigiles.sh landing site (site/). Use whenever designing, editing, adding to, or reviewing any site/ component, hero, section, or marketing copy — read it BEFORE touching site/, and hold every change against it. Not for docs/ or the app itself.
---

# Landing site — purpose, UX, and design bar

The front door is `site/` (Vite + React + Tailwind, dark-only), deployed to
**vigiles.sh**. This skill is the standard every change is held to. The recurring
failure it exists to stop: **adding elements instead of removing them**, which
makes the page feel crowded and template-y ("tilda-like") instead of modern.

**The one rule under all the others: when in doubt, REMOVE. Design by subtraction.**
If deleting an element loses no meaning, delete it. A change that _adds_ a box, a
caption, a second button, or a reassurance line is suspect until proven necessary.

## Purpose (what the site is for)

- **TOP GOAL — maximize the % of visitors who actually RUN `npx vigiles audit`.**
  This is the ONE conversion metric every design decision serves. The CTA must be
  GREAT (frictionless, obvious, always reachable). If a change doesn't help someone
  run the command, it's not earning its place.
- **Audience:** developers who already live in agentic-coding tools (Claude Code,
  Codex, Cursor). They are skeptical and skim on a phone.
- **The wow** is the **graded report** — show the result, don't explain the mechanism.
- **Front-door promise:** "Lighthouse for your agent harness" — a one-command,
  zero-config, nothing-uploaded grade of your skills/hooks/subagents/references.
- **Lower the friction to try:** offer PREFILLED popular OSS repos (e.g. an official
  Anthropic plugin) as one-click "grade this" chips, so a visitor can see a real
  report without typing or having a repo of their own. (Idea — not yet built.)
- **Instrument conversion:** we need analytics on the funnel (command copies, "Grade
  it"/deeplink clicks, prefilled-repo tries). The site is on GitHub Pages, NOT Vercel
  — so **Vercel Analytics does NOT apply**. Use a lightweight, privacy-friendly,
  script-tag analytics that works on static hosting: **Plausible / Fathom / GoatCounter**
  (or GTM if a tag manager is wanted). Pick one, add the snippet, define the events.
  (Not yet built — see the roadmap.)

## UX requirements

- **Command-first.** `npx vigiles audit` is the universal action (works on every
  OS, every terminal). It is THE primary CTA. Everything else is secondary.
- **The Claude Code deeplink (`claude-cli://`) is a DESKTOP-ONLY enhancement**, never
  the primary path — it silently dead-ends on mobile / CC Web / desktop-without-CC.
  Render it only where it can work; never ship a button that does nothing.
- **Be honest on mobile.** No dead buttons. Where a desktop-only action can't run,
  say so plainly and give the real action (the command) instead.
- **One primary action per screen.** Secondary actions are _quiet_ — a text link or
  a light pill, never a second heavy full-width button competing with the primary.
- **Harness-neutral.** Say "Claude Code or Codex," don't lead with Claude Code —
  it's an implementation detail, not the headline. Don't over-explain internals.
- **Low-friction + welcoming.** A skimmer should understand what it is and how to
  try it within one screen, without reading a wall.

## Design bar — modern & minimal (the anti-crowding rules)

Reference the feel of Linear / Vercel / Raycast: confident dark, generous space,
few words, one clear focal point per section. NOT a feature-stuffed template.

- **Every element must earn its place.** Remove anything that only restates another
  (a caption repeating the screenshot; a trust line said twice; a redundant subhead).
- **Cut any label another element already IMPLIES.** A "free & open source" badge is
  redundant when a GitHub/star link is present; an "AUDIT A SPECIFIC REPO" badge above
  a "Grade a specific repo" heading restates it. If the context already tells the
  reader, the label is noise.
- **Every link/CTA is ACTIONABLE and specific.** The reader must know exactly what
  happens on click. No vague or passive secondary links ("Have Claude Code?…"). If a
  secondary path isn't worth a clear, concrete action, cut it (or move it to the nav,
  where a persistent link beats a limp fold link).
- **One focal point per section.** The eye should land on one thing first.
- **Whitespace + typography over boxes.** Don't stack 3+ full-width bordered boxes;
  that repetition is what reads as crowded. Prefer type hierarchy and space to
  borders. But whitespace must be _intentional_ — no near-empty viewport voids either.
- **Reassurance once, in one line.** Trust copy ("nothing uploaded") appears once,
  compact — never a 3-line paragraph, never repeated per section.
- **Cohesion.** The hero (badge + headline + subhead + visual) must read as ONE
  idea, each part adding _new_ information. If the subhead just says what the
  screenshot already shows, cut or sharpen it.
- **Restraint in color/emphasis.** One accent, semantic band colors that always
  _mean_ something (grade bands). Bold one phrase per point, not every clause. No
  decorative emoji confetti.
- **Consistent spacing scale.** Don't hand-tune one-off margins that fight the rhythm.

## Anti-patterns (things that have gone wrong here)

- Stacking input + big button + 3-line trust + divider + command + caption + another
  button on one fold. (Fix: keep ~3 elements, cut the rest.)
- A caption under the product shot restating the product shot.
- Adding a notice/button _per problem_ instead of rethinking the flow.
- Two competing primary CTAs (deeplink + command) with no hierarchy.
- CC-first framing ("runs in your own Claude Code…") as the headline reassurance.
- A desktop-only flow (repo-picker/deeplink) left visible on mobile as a fallback
  that just repeats the command another section already shows — the same
  `npx vigiles audit` block in back-to-back sections on the phone. (Fix:
  `hidden sm:block` the whole desktop-only section; the hero + CTA already carry it.)

## In-browser demo (direction, when built)

- **In-browser, NOT hosted.** The audit compute runs entirely CLIENT-SIDE in the
  visitor's browser (fetch the repo's files via the GitHub API, run the pure
  detectors in JS) → reinforces "nothing leaves your machine"; zero backend/cost.
  The only "hosting" is static file serving on vigiles.sh, like the current site.
  A cached-serverless backend is explicitly NOT the plan.
- **Deterministic-only compute.** Run the model-free rings (Truthfulness / Structure /
  Safety-via-lethal-trifecta / description-overlap). Skip the model-gated
  trigger-rate — that's the part that needs an LLM + quota.
- **A real progress bar / streaming state** while the audit runs — fetching files,
  running each ring — never a dead spinner. It should feel like work is happening.
- **TEASE the locked LLM part, don't just label it "limited."** Render the
  trigger-rate / model-gated section in the result as **blurred / locked** (a
  gated-content pattern) with an "unlock by running it locally" affordance — make
  people _curious_ to run `npx vigiles audit` for the full report (trigger-rate,
  linter cross-ref, private repos). The deterministic rings show real numbers; the
  model-gated section is present but veiled.
- **Reuse the real report components** (render from the `AuditReport` JSON) — never a
  screenshot. This is why the report view must live in a SHARED package (see below).

## Repo structure for shared UI (no hacks)

The audit report (`report/`) and the landing site (`site/`) — and the future demo —
share the same shadcn primitives, the `AuditReport` schema, and the report view.
These must be **genuinely shared via a workspace package**, not duplicated or
cross-imported by relative path. Target: npm workspaces + a `packages/` dir (e.g. a
shared `@vigiles/ui` primitives package and a `@vigiles/report-view` package that
renders an `AuditReport`), consumed by `report/`, `site/`, and the demo. The root
`vigiles` published package + its CI gates (api-surface, coverage) must stay green —
workspaces coexist, they don't replace the root package. Do this as its own reviewed
change, not bolted onto a design pass.

## Process — before shipping any site change

1. **Hold it against this bar.** Ask "what can I remove?" before "what can I add?"
2. **Screenshot desktop AND mobile (390px) — the FULL page top-to-bottom on EACH,
   every time, and actually look.** Mobile is its own layout, not desktop-minus-width;
   a change is not verified until you've looked at both. Two things to scan for on the
   mobile scroll specifically (both have bitten us):
   - **No cross-section duplication.** The same command block / CTA / trust line must
     not appear in two adjacent sections. If a section's mobile fallback just repeats
     what the hero or CTA already shows, that IS the duplication — hide the section on
     mobile, don't repeat the command.
   - **No desktop-only flow dead-ending on mobile.** A desktop-only interaction (the
     repo-picker + Claude Code deeplink) collapsed to a near-empty or command-only card
     on a phone is noise — `hidden sm:block` the WHOLE section rather than show a stub
     that promises a desktop feature the phone can't use.
     (Global playwright + `vite preview`; or the `screenshot` skill.)
3. **Run a Fable blind pass** for anything nontrivial — fresh skeptical eyes catch
   crowding and incoherence the author is blind to. **Act on the flagged cuts** — a
   Fable P0/P1 "delete this" is not optional; don't just note it and move on.
4. Verify build + Prettier clean; deterministic deploy via `pages.yml` on push to main.
