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
If deleting an element loses no meaning, delete it. A change that *adds* a box, a
caption, a second button, or a reassurance line is suspect until proven necessary.

## Purpose (what the site is for)

- **Audience:** developers who already live in agentic-coding tools (Claude Code,
  Codex, Cursor). They are skeptical and skim on a phone.
- **The one job:** get them to run `npx vigiles audit` (or adopt vigiles). The
  *wow* is the **graded report** — show the result, don't explain the mechanism.
- **Front-door promise:** "Lighthouse for your agent harness" — a one-command,
  zero-config, nothing-uploaded grade of your skills/hooks/subagents/references.

## UX requirements

- **Command-first.** `npx vigiles audit` is the universal action (works on every
  OS, every terminal). It is THE primary CTA. Everything else is secondary.
- **The Claude Code deeplink (`claude-cli://`) is a DESKTOP-ONLY enhancement**, never
  the primary path — it silently dead-ends on mobile / CC Web / desktop-without-CC.
  Render it only where it can work; never ship a button that does nothing.
- **Be honest on mobile.** No dead buttons. Where a desktop-only action can't run,
  say so plainly and give the real action (the command) instead.
- **One primary action per screen.** Secondary actions are *quiet* — a text link or
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
- **One focal point per section.** The eye should land on one thing first.
- **Whitespace + typography over boxes.** Don't stack 3+ full-width bordered boxes;
  that repetition is what reads as crowded. Prefer type hierarchy and space to
  borders. But whitespace must be *intentional* — no near-empty viewport voids either.
- **Reassurance once, in one line.** Trust copy ("nothing uploaded") appears once,
  compact — never a 3-line paragraph, never repeated per section.
- **Cohesion.** The hero (badge + headline + subhead + visual) must read as ONE
  idea, each part adding *new* information. If the subhead just says what the
  screenshot already shows, cut or sharpen it.
- **Restraint in color/emphasis.** One accent, semantic band colors that always
  *mean* something (grade bands). Bold one phrase per point, not every clause. No
  decorative emoji confetti.
- **Consistent spacing scale.** Don't hand-tune one-off margins that fight the rhythm.

## Anti-patterns (things that have gone wrong here)

- Stacking input + big button + 3-line trust + divider + command + caption + another
  button on one fold. (Fix: keep ~3 elements, cut the rest.)
- A caption under the product shot restating the product shot.
- Adding a notice/button *per problem* instead of rethinking the flow.
- Two competing primary CTAs (deeplink + command) with no hierarchy.
- CC-first framing ("runs in your own Claude Code…") as the headline reassurance.

## Hosted / in-browser demo (direction, when built)

- **Deterministic-only.** Run the model-free rings (Truthfulness / Structure /
  Safety-via-lethal-trifecta / description-overlap). Skip the model-gated
  trigger-rate — that's the part that needs an LLM + quota.
- **Prefer in-browser** (runs in the visitor's browser → reinforces "nothing leaves
  your machine"; zero backend/cost). Fallback: cached serverless keyed by
  `repo@commit-SHA` + per-IP rate-limit.
- **State the limit plainly:** the browser/demo is a subset — **run `npx vigiles
  audit` locally for the full report** (trigger-rate, linter cross-ref, private repos).

## Process — before shipping any site change

1. **Hold it against this bar.** Ask "what can I remove?" before "what can I add?"
2. **Screenshot desktop AND mobile** (390px) and actually look — most crowding shows
   up on the phone fold. (Global playwright + `vite preview`; or the `screenshot` skill.)
3. **Run a Fable blind pass** for anything nontrivial — fresh skeptical eyes catch
   crowding and incoherence the author is blind to.
4. Verify build + Prettier clean; deterministic deploy via `pages.yml` on push to main.
