# README revamp — 5 complete concepts

> Working planning doc (2026-06-27). Five **distinct** whole-README directions to
> pick from, not five small fixes. Each is a complete positioning + structure +
> voice. The diagnosis that prompted this: after `audit` was bolted on, the README
> has **two competing front doors** (audit hero vs. the three-instrument table),
> two overlapping taxonomies back-to-back (rings vs. instruments), and the
> spec/adopt adoption story is repeated ~5× yet has no home. Each concept resolves
> that tension a different way.
>
> Earlier session answers (signal, not a lock): spine **See → Fix → Prove**, hook
> **"the tests your harness never had."** Those map cleanest onto Concept 1 and 3.

---

## Concept 1 — "The Loop" (See → Fix → Prove)

**The bet:** unify audit + the instruments into ONE motion. Audit isn't a separate
product from Lint/Test/Eval — it's the _first beat_ of a loop the agent drives.

**Tagline:** _The tests your AI harness never had._

**Hero (sample):**

> You installed a bunch of plugins and wrote a few skills — but do they actually
> work? A skill that never fires, a subagent wired to a tool that doesn't exist, a
> CLAUDE.md full of dead references — your harness fails **silently**, mid-task.
>
> `Agent = Model + Harness`. The model gets the headlines; the harness is the half
> you own — and right now it's **a library with no tests.** vigiles is that test
> suite, in one loop: **See** what's broken → your agent **Fixes** it → you **Prove**
> it works. You write nothing.

**Structure:**

1. Hero (pain + the loop sentence)
2. **① See** — `npx vigiles audit` + screenshot + rings table + "Lighthouse, local, asks-once" note
3. **Quick start** — paste-prompt + `init` (install above the fold)
4. **② Fix** — 🔎 Lint (stale-ref demo) + the spec/adopt story gets its single home + "what would vigiles catch?" preview
5. **③ Prove** — 🧪 Test (runHook example, bullets) + 📊 Eval (promptfoo cost contrast)
6. FAQ · More · License

**Wins:** kills the two-taxonomy problem (rings = what audit scores; See/Fix/Prove =
the depth). Audit and instruments stop competing. Spec/adopt finally has one home
(in Fix). Reads as a _workflow_, which is what people actually do.
**Costs:** "See/Fix/Prove" is three custom verbs to learn; mildly abstract until the
screenshot lands.
**Best for:** the cohesive, default-safe choice. Lowest risk, highest coherence.

---

## Concept 2 — "The Lighthouse" (score-led, audit IS the product)

**The bet:** lean all the way into the dashboard. The product is _your harness health
score_; everything else is "how to move each ring." Matches the current founder bet
that audit is THE front door — just executed without apology.

**Tagline:** _Lighthouse for your AI agent harness._

**Hero (sample):**

> Run one command. Get a grade. `npx vigiles audit` reads your harness
> deterministically — no key, safe on any repo — and scores it A–F across four
> categories, with every fix inline. Then watch the score climb as your agent fixes
> what it found.

**Structure:**

1. Hero = the screenshot + the score, immediately
2. `npx vigiles audit` one-liner + "safe anywhere / asks once" note
3. **One section per ring**, each ending in the tool that moves it:
   - 🔎 **Truthfulness** → Lint (refs resolve)
   - 🎯 **Triggering** → Test (skills fire, don't collide)
   - 🔧 **Structure** → Test (tool contracts / MCP / frontmatter)
   - 🧪 **Tested** → Test + Eval (coverage + does-it-help)
4. Quick start (init) + "your agent does the fixing"
5. FAQ · More · License

**Wins:** maximally concrete and visual; the score is _shareable_ (people post
Lighthouse scores). Tightest possible "what is this in 5 seconds." Resolves the
two-table problem by making rings the _only_ taxonomy (instruments live inside rings).
**Costs:** risks reading as a one-shot report card, underselling the deep Test/Eval
library and the spec-first adoption magic; "score" can feel gimmicky to power users;
Eval (does-it-help) doesn't map to a ring cleanly.
**Best for:** virality + first-time-visitor clarity. The "growth" choice.

---

## Concept 3 — "Library with no tests" (testing-framework framing)

**The bet:** commit fully to the single anchoring analogy and structure the whole
README like a testing framework's docs (jest/vitest energy). vigiles = the test
runner for your agent setup.

**Tagline:** _Your AI harness is a library with no tests. Here's the test suite._

**Hero (sample):**

> You'd never ship a library with no tests. But that's exactly what your agent
> harness is — a pile of plugins, skills, hooks and a CLAUDE.md, none of it verified.
> A skill that never fires. A hook that blocks nothing. A subagent wired to a tool
> that doesn't exist. vigiles is the test suite you've been missing.

**Structure:**

1. Hero (the analogy, hard)
2. **What you can test** — a tight table: instruction files · hooks · skills ·
   subagents · "does it even help" — each row a one-liner + link
3. Then organized _by what you test_, cheapest first:
   - **Your CLAUDE.md is true** (Lint, no key)
   - **Your hooks block** (runHook, no key)
   - **Your skills fire** (measureTriggerRate — recall + precision)
   - **Your subagents finish right** (assertAgentOk, no judge)
   - **It actually helps** (Eval, on your sub — promptfoo contrast)
4. `audit` introduced as "run the whole suite at once, get a report"
5. Quick start (init adopts your CLAUDE.md) · FAQ · More

**Wins:** instantly legible to every engineer; emotionally strong; positions vigiles
as _infrastructure_, not a gadget. The "tests your harness never had" hook is native
here. Cheapest-tier-first mirrors how testing libs earn trust.
**Costs:** demotes audit (the easiest, most viral front door) to a mid-page mention;
the spec-first adoption story competes with the testing story for the spotlight.
**Best for:** credibility with serious devs / the testing-tool audience.

---

## Concept 4 — "You can't fix the model" (thesis / category-led)

**The bet:** define the category. Lead with the intellectual frame — the model is
frozen, the harness is yours and unmeasured — and own "harness reliability" as a
discipline. Manifesto energy, built for HN / thought-leadership.

**Tagline:** _You can't fix the model. You can fix the harness._

**Hero (sample):**

> Everyone's tuning prompts and swapping models. But `Agent = Model + Harness`, and
> the harness — your CLAUDE.md, skills, hooks, subagents — is the half you actually
> control. It's also the half nobody verifies. vigiles is the discipline for it:
> verify every reference, test every surface, measure what helps.

**Structure:**

1. Thesis hero (frame + the pain it implies)
2. The problem, made concrete (the silent-failure trio) — _land the pain fast so it's
   not just vocabulary_
3. **The three instruments** as the disciplined answer: Lint / Test / Eval (each a
   tight beat)
4. `audit` as "the one-command entry into the discipline" + screenshot
5. Quick start · FAQ · More

**Wins:** aspirational and ownable; gives vigiles a _category_ not just a feature
list; resonates hard with the harness-engineering crowd; great share text.
**Costs:** highest "lead with benefit, not jargon" risk — must front-load the pain or
it reads as abstract; slower to "what do I actually run." Against the README rule
that bans opening with vocabulary, so the execution has to be disciplined.
**Best for:** a launch moment (HN/Show post, conference) where a POV travels further
than a feature.

---

## Concept 5 — "Show, don't tell" (proof / demo-led)

**The bet:** minimal prose, maximal evidence. A stacked sequence of real, visual
"here's a silent failure → here's vigiles catching it." Skeptic-proof, screenshot-
heavy, built for social.

**Tagline:** _See what your harness is hiding._

**Hero (sample):**

> Three real failures, caught in seconds — no setup, no key:
> (then three tight proof blocks)

**Structure:**

1. Hero = one killer proof, immediately (the audit screenshot, or the lint stale-ref
   catch)
2. **Proof 1 — the lying CLAUDE.md:** the `✗ src/auth/login.ts — no such file` block
3. **Proof 2 — the skill that never fires:** a measureTriggerRate before/after
4. **Proof 3 — the whole-harness scorecard:** the audit screenshot + rings
5. _(post-launch: the 2/7 → 7/7 safety-hook battery — currently PARKED for launch, so
   it can't be the hero yet; slot it in when Guard ships)_
6. Then a compact "how it works" (Lint/Test/Eval) + Quick start · FAQ · More

**Wins:** undeniable; converts skeptics; every block is screenshotable for Twitter/HN.
"Valid is not true" sells itself when shown, not argued.
**Costs:** the strongest single proof (2/7→7/7) is parked for launch, so the demo
stack is a notch weaker right now; risks feeling like a bag of tricks without a
unifying narrative; leans on having polished visual assets.
**Best for:** a visually confident relaunch once Guard/2-7 is back and the assets
(gifs, screenshots) are crisp.

---

## My recommendation

- **Ship Concept 1 (The Loop)** as the revamp. It's the most cohesive, directly fixes
  the two-front-door problem, gives the spec/adopt story a home, and matches both
  earlier answers (See→Fix→Prove + "tests your harness never had").
- **Steal from 2 and 3:** take the score-as-hero confidence from Concept 2 (lead the
  audit beat with the screenshot + grade, no hedging) and the "library with no tests"
  anchor from Concept 3 (it's the best dev hook — make it the tagline, which Concept 1
  already does).
- **Hold 4 and 5 for a launch moment:** Concept 4 is the HN-post POV; Concept 5 is the
  visual relaunch once Guard is unparked and assets are ready. They're _campaign_
  framings, not the everyday README.

**Decision when you wake:** pick a number (or "1 + steal from 2/3") and I'll write the
full file. If you say nothing, I'll draft Concept 1.

---

## DECISION: Concept 5 (proof/demo-led) — dogfood prep

> A proof-led README dies if the proofs are fabricated (today's `✗ src/auth/login.ts`
> block is made up). Every Concept-5 block must be REAL, screenshotable dogfood output.
> First pass run 2026-06-27 against the SHA-pinned upstream plugins in
> `examples/harness/vendor/*` — deterministic, no model, offline.

### Proof inventory — what's REAL and ready

| Concept-5 block                               | Real proof we now have                                                                                                                                               | Source                              | Status                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| **The lying instruction file** (Truthfulness) | obra/**superpowers** points at `skills/using-superpowers/SKILL.md` — **referenced but MISSING**. Truthfulness drops to **92**. A real dead ref in a popular plugin.  | `audit superpowers@6fd4507`         | ✅ REAL                                        |
| **Valid ≠ true** (Structure)                  | **madappgang**'s `tester` agent lists `AskUserQuestion` — **never available to a subagent, silently dropped**. Free inline fix. (+ malformed-YAML frontmatter note.) | `audit madappgang-frontend@6097ad4` | ✅ REAL                                        |
| **The scorecard** (the hero screenshot)       | A 97/100 **A** audit with the four rings on a real plugin; rings actually move (Structure 92, Tested 97).                                                            | `audit <any vendored>`              | ✅ REAL                                        |
| **Marketplace ranking** (plugin authors)      | Real 4-plugin leaderboard: madappgang **89 B**, accessibility **86 B**, superpowers **86 B**, oh-my-claudecode **78 C** — each with its worst issue named.           | `audit examples/harness/vendor/*@*` | ✅ REAL                                        |
| **Inherits-all-tools footgun** (Structure)    | oh-my-claudecode's `code-reviewer` + `critic` agents inherit ALL tools (no contract).                                                                                | `audit oh-my-claudecode@deee3a4`    | ✅ REAL                                        |
| **The skill that never fires** (Triggering)   | NOT capturable here — needs a model (trigger-rate / `measureTriggerRate`). Deterministic proxy available: description-overlap.                                       | —                                   | ⚠ NEEDS MODEL — live spike when auth available |

### Caveats before capturing assets

- **Dialect-freshness banner.** This container runs CC **2.1.42** vs vigiles's
  validated **2.1.187**, so every `audit` prints a loud tool-catalog-drift `⚠` at the
  top. It's an ENV artifact, not a real finding — **suppress/avoid it** when capturing
  README screenshots (capture on a machine with the pinned CC, or filter it).
- **Real, not synthetic.** Replace the fabricated `✗ src/auth/login.ts` lint block with
  the superpowers MISSING-SKILL.md catch — same shape, but it's a real popular plugin.
- **Provenance is a feature.** Every proof is a SHA-pinned real upstream plugin
  (`examples/harness/vendor/SOURCES.md`) — "we ran this on real plugins people ship,"
  not a contrived demo. Worth saying in the README.
- **Screenshots/gifs still need a capture pass** (HTML report renders, but no headless
  screenshot here). That's a follow-up on a TTY machine.

### STATUS (2026-06-27): Concept-5 README DRAFTED + dogfood saved

- **`README.md` rewritten** to the proof-led Concept-5 spine — every proof block traces
  to a real run in `research/dogfood/` (no fabricated output). Direction comment at the
  top of the README encodes the spine for future edits. Prettier-clean; the
  self-command-refs dogfood passes (no stale `vigiles <cmd>` refs).
- **Dogfood corpus saved** in `research/dogfood/`: `audit-superpowers.txt|json|html`,
  `audit-madappgang.txt`, `audit-oh-my-claudecode.txt`, `audit-leaderboard.txt`,
  `audit-vigiles-self.txt` (100/100 A), `lint-vigiles-self.txt`, `test-hook-unit.txt`.
- **Still TODO before launch:** (1) refresh `vigiles-audit.png` from
  `research/dogfood/audit-superpowers.html` on a pinned-CC machine (no drift banner);
  (2) the "skill never fires" Triggering block is currently carried by the audit
  ring/score, not a live trigger-rate capture — a model-auth spike or the
  description-overlap proxy would make it a hard proof; (3) founder wordsmith pass.

### Remaining prep before writing Concept 5

1. **Live trigger-rate spike** (needs model auth) for the "skill that never fires"
   block — or lead that block with the deterministic description-overlap proxy instead.
2. **Asset capture** — fresh screenshots of the superpowers dead-ref audit, the
   madappgang fix card, and the leaderboard, on a pinned-CC machine (no drift banner).
3. Decide block order (recommend: scorecard hero → superpowers dead ref → madappgang
   valid≠true → leaderboard → "how it works" Lint/Test/Eval → quick start).

### flue cross-check (parallel research, same day)

Confirms the thesis, no overlap: **flue** (withastro / Fred Schott) is a framework to
_build & run_ headless agents — `defineAgent()`, sandbox, deploy targets; verbs are
dev/build/run, **never test/eval**. Built on the same "Agent = Model + Harness" frame
(_"if you're not the model, you're the harness"_) — validation, not competition. It
_produces_ the harness vigiles _tests_. Usable README line later: "the test layer for
your harness — built with Claude Code, Codex, flue, or your own."
