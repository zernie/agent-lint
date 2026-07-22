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
- **THE DEMO FRAME SERVES FOUR JOBS AT ONCE — design for all four, don't let one
  crowd out the rest.** (1) INTRO — teach what vigiles is at a glance (the graded
  report IS the pitch). (2) DEMO — instant real grades with zero effort (the baked
  `FEATURED` chips). (3) RUN-IN-BROWSER — grade YOUR public repo live by typing it
  (GitHub anonymous API; public-only). (4) COMMAND-COPY for the rest — a private or
  local repo can't run in-browser, so the job there is a clean, obvious COPY of
  `npx vigiles audit` (a command hand-off, NOT a fake in-browser run). Two clarity
  rules fall out and are load-bearing: **(a) the frame must always make clear WHICH
  repo is shown and whether it's a PREDEFINED EXAMPLE (a chip) or YOUR OWN (typed) —
  never ambiguous; (b) the private-repo path is a first-class affordance, not an
  afterthought jammed into a sentence — a clean labelled command-copy, verified at
  390px.** Don't restate the command in three stacked lines (the header showing
  `$ vigiles audit <slug>` on top of a highlighted chip that already names it is TMI
  — the header's job is to IDENTIFY the graded repo + its source, not re-print the
  command).
- **COPY: concrete over clever, and NEVER plant a doubt the reader didn't arrive
  with.** Two real misses this stops: (1) a clever headline that reads as cryptic
  ("'Valid' is not 'true.'") — lead with the concrete pain ("Valid config. Broken
  agent."), let the cards below carry the nuance; (2) a DEFENSIVE FAQ that spotlights
  a weakness the reader hadn't noticed ("Is it stable enough to adopt?" draws the eye
  to a scary version number) — replace doubt-planters with confidence-builders a
  skeptic actually asks ("Does anything leave my machine?", "Can I grade a private
  repo?"). Test each line as a cold skeptic: does it make me MORE or LESS likely to
  run the command? If less, cut or reframe.
- **CREDIBILITY: the demo report shows ONLY REAL scans — never fabricate a result.**
  The brand is "measured, not claimed", so one hardcoded/fake number in the report
  retroactively poisons trust in every real finding. A LOCKED tease with HONEST
  PLACEHOLDERS (em-dash "run to fill", no digits) for a genuinely-can't-run-here thing
  (model-gated trigger-rate) is fine — it fakes NOTHING. Fabricated "results" for a
  thing the tool actually computes is NOT — show the REAL computed result or keep it
  an honest explanatory card OUTSIDE the report frame.
- **Lower the friction to try:** offer PREFILLED popular OSS repos as one-click
  "grade this" chips, so a visitor sees a real report without typing or having a repo
  of their own. **SHIPPED** — the `FEATURED` chips in `DemoAudit` render baked real
  reports instantly.
- **SHAREABILITY IS THE GROWTH LOOP — a graded result must be a shareable PUBLIC
  LINK, and sharing must be one tap.** The conversion metric (run `npx vigiles audit`)
  is served not only by the visitor in front of you but by the ones they PULL IN: a
  grade spreads when people post a repo's _report_, not the landing page. So (1) every
  completed grade is a copyable deep-link (`vigiles.sh/?repo=owner/repo#try`) that
  AUTO-RUNS the audit on load — the URL IS the share unit; (2) surface a one-tap share
  on any result (native share sheet on mobile, copy-link elsewhere — the `ShareRow` in
  `DemoAudit`); (3) the deep-link is the same slug the input/chips use, so a shared
  link, a typed repo, and a chip all resolve to one code path. When you add a new
  result surface, it MUST carry the share affordance + a stable `?repo=` link — a
  result you can't share is a dead end in the loop. **SHIPPED** — keep it working.
- **Instrument conversion:** analytics on the funnel (command copies, typed submits,
  chip tries, re-grades, share clicks). The site is on GitHub Pages, NOT Vercel — so
  **Vercel Analytics does NOT apply**. Use a lightweight, privacy-friendly, script-tag
  analytics for static hosting: **Plausible / Fathom / GoatCounter**. The funnel is
  already INSTRUMENTED — `track()` (`site/src/lib/track.ts`) fires `demo_*` events and
  is a safe no-op until a provider is wired. REMAINING: add the provider script tag to
  `index.html` and confirm events land. Analytics carries the OUTCOME kind only, never
  a typed slug (a private repo name must not leak).

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
- A desktop-only flow (the Claude Code `claude-cli://` deeplink) left visible on mobile as a fallback
  that just repeats the command another section already shows — the same
  `npx vigiles audit` block in back-to-back sections on the phone. (Fix:
  `hidden sm:block` the whole desktop-only section; the hero + CTA already carry it.)

## In-browser demo (SHIPPED — the invariants to keep)

The live "grade any repo" demo is BUILT (in `DemoAudit.tsx` + `site/src/demo/`):
type/paste a public repo or tap a featured chip, it fetches the harness files
client-side and runs the SAME compiled engine the CLI does. The rules below are now
INVARIANTS to preserve, not future direction.

- **Every result is shareable (see the shareability goal above).** A completed grade
  carries a one-tap share + a stable auto-running `?repo=` deep-link. This is a hard
  requirement of the demo, not a nice-to-have — don't ship a result surface without it.
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

> **GATE-FAILURE → FIX THE GATE FIRST (non-negotiable).** If a bug reaches the user
> that this skill's review _should_ have caught — a broken mobile layout, a clipped
> element, an unexplained control — the **skill is the root cause**, not just the
> component. Before (or in the same change as) fixing the bug, UPDATE THIS SKILL so
> the gate would catch that whole class next time: add the missing check to the
> checklist below, name the failure that slipped, and make the check concrete enough
> that following it mechanically would have caught it. A shipped bug the gate missed
> is a SKILL bug — fixing only the component and moving on guarantees the next one
> slips too. (This is why the mobile-layout checklist in step 2 exists: it was written
> from real misses — a flex row that crushed a heading into one word per line, and a
> `<pre>` that clipped its example off the right edge on a phone.)

1. **Hold it against this bar.** Ask "what can I remove?" before "what can I add?"
2. **Screenshot desktop AND mobile (390px) — the FULL page top-to-bottom on EACH,
   every time, and actually look.** Mobile is its own layout, not desktop-minus-width;
   a change is not verified until you've looked at both. **Every component you added or
   changed must be SCROLLED FULLY INTO VIEW and screenshotted at 390px — not just the
   top of it, not "it's below the fold so I'll trust it."** A component whose mobile
   render you did not actually see in a screenshot is UNVERIFIED, full stop.
   **MOBILE-LAYOUT BUG CHECKLIST** — scan every changed component's 390px shot for these
   (each is a real ship that slipped THIS gate; if you can't rule one out from the
   screenshot, you haven't looked hard enough):
   - **Crushed flex column** — a `flex ... justify-between` row (text on one side, a
     button/badge on the other) that should STACK on a phone but doesn't, squeezing the
     text into a 1–2-word-per-line column. Fix: `flex-col sm:flex-row` (stack on mobile,
     row at `sm+`); never leave a `flex-1 min-w-0` text block fighting a `shrink-0`
     button on a narrow screen.
   - **Clipped / overflowing code or long text** — a `<pre>`/`<code>`/long inline string
     cut off at the card's right edge (an `overflow-x-auto` block reads as _clipped_, not
     scrollable, on a phone). Fix: `whitespace-pre-wrap break-words` so it wraps, or
     shorten the example. Check EVERY `<pre>` and monospace example at 390px.
   - **Text touching / bleeding past edges**, and any element that reads as a render bug
     (ghosting through a sticky bar, a blurred block that looks failed-to-load).
   - **Responsive-grid cell collision (check BOTH breakpoints, not just 390px).** A CSS
     grid whose column count changes across `sm:` (e.g. `grid-cols-[1fr_auto]` →
     `sm:grid-cols-[10.5rem_1fr_auto]`) will SILENTLY BUMP an auto-placed child to the
     next ROW if another child is pinned to the same `col-start`/`row-start` cell — so a
     label meant to sit inline after its command lands on a second line, indented to the
     middle, reading as "why is this centered?". This shipped in the VerbMap: the model
     note kept `col-start-2 row-start-1` from the 2-col mobile layout but never got a
     `sm:col-start-3`, so at desktop it collided with the answer and pushed it to row 2.
     Fix: give EVERY explicitly-placed grid child its `sm:col-start` for the wider grid,
     and verify alignment on the DESKTOP shot too (this class hides at 390px — the mobile
     grid is fine; it's the `sm:` layout that breaks). When you change a grid's template
     across a breakpoint, re-check that every child's placement is set for BOTH.
     Then, two more things to scan for on the mobile scroll (both have also bitten us):
   - **No cross-section duplication.** The same command block / CTA / trust line must
     not appear in two adjacent sections. If a section's mobile fallback just repeats
     what the hero or CTA already shows, that IS the duplication — hide the section on
     mobile, don't repeat the command.
   - **No desktop-only flow dead-ending on mobile.** A desktop-only interaction (the
     Claude Code `claude-cli://` deeplink) collapsed to a near-empty or command-only card
     on a phone is noise — `hidden sm:block` the WHOLE section rather than show a stub
     that promises a desktop feature the phone can't use. (The in-browser demo itself
     works on mobile — it's the deeplink handoff that's desktop-only.)
     (Global playwright + `vite preview`; or the `screenshot` skill.)
3. **Read the WHOLE page cohesively from multiple USER POVs — not just the changed
   section in isolation.** A change can be locally fine yet break the flow/cohesion of
   the whole page, or answer one persona while confusing another. Walk the full site
   (desktop AND 390px) as at least these five readers and ask, per persona, "is this
   clear, does the flow make sense, would I convert (run `npx vigiles audit`)?":
   - a **Claude Code / Codex power user** (has plugins/skills; wants depth),
   - a total **newcomer / skeptic skimming on a phone** (30-second patience),
   - a **plugin / skill author**,
   - a **skeptical senior engineer** who won't run anything unless convinced,
   - a **decision-maker / lead** evaluating adoption.
     Fold this into the Fable pass below (Fable is good at holding several POVs at once);
     the `review-docs` skill is the analog for docs. The point is COHESION across the
     whole page + across audiences, caught before shipping — not per-section polish.
4. **Run a Fable blind pass as a COLD VISITOR** for anything nontrivial — the single
   most important reviewer is **a Claude Code / Codex user who has NEVER heard of
   vigiles** and landed here from a link. Give Fable the desktop + 390px screenshots
   and this exact protocol (don't just say "review it"):
   - **Walk top → bottom, section by section.** At each one note three things: (a) what
     it actually communicates in one line, (b) anything **weird, inconsistent, broken,
     cramped, low-contrast, or that looks like a render bug** (a full green bar above a
     scary sentence; a blurred element that reads as failed-to-load; a `—` next to a
     filled bar; a wrapped/misaligned rail; "1 hooks"), (c) **the question that pops
     into their head** right there ("copy what? paste where?", "which plugins?", "why
     92 with no visible issue?", "does this upload my repo?").
   - **TRY the interactions, don't just look at them** — type a repo, tap the chips,
     expand the verb rows, click every copy/share button, resize to a phone. A control
     that's unclear, does nothing visible, or copies something unexplained is a defect.
   - **Two verdicts, each with the SPECIFIC blocker if "no":** (1) _Would I actually
     TRY it_ — run `npx vigiles audit` / `init`? (2) _Would I SHARE it_ — send the link
     to a teammate? Sharing is a growth lever, so a result surface that doesn't make
     sharing feel worth it is a miss to fix, not a nit (see the shareability goal — the
     `ShareRow` should NUDGE the share, not just offer a quiet button).
   - **Ranked output, most-damaging-first, each with the concrete fix.** A credibility
     bug (the demo looks staged/broken exactly where it must feel real) outranks polish.
     **Act on the flagged cuts** — a Fable P0/P1 "delete/fix this" is not optional; don't
     just note it and move on. Fold the five-persona walk (step 3) into the same pass —
     Fable holds several POVs at once — but the cold first-time visitor is the primary lens.
5. Verify build + Prettier clean; deterministic deploy via `pages.yml` on push to main.
