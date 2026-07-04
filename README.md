<!--
  README DIRECTION — read before editing; keep changes aligned.
  This file is the FRONT DOOR + a marketing asset for someone who already lives
  in Claude Code / Codex. Optimize for a phone-skimmer.

  TAGLINE = VERIFY-FIRST (decided 2026-07): "Catch the silent breakage in your
  Claude Code & Codex setup" + subhead "verify your CLAUDE.md, skills, and hooks
  are real — and prove they actually work." Lead with references-are-real (the
  unique catch only vigiles makes); test/observe fold in AFTER. Do NOT revert to
  the old test-first "tests your skills never had" tagline. Stay coding-scoped
  (name CC/Codex + CLAUDE.md/skills/hooks) so it's never mistaken for a
  general-agent tool. NOT "observability" as the headline (it undersells verify +
  reads as the general-app category).

  SPINE = CONCEPT 5 (proof/demo-led). Lead with REAL, screenshotable catches on
  plugins people actually ship, THEN explain the mechanism. The proofs are not
  illustrative — every block traces to a real dogfood run captured in
  research/dogfood/. THREE COMMUNITY catches, anonymized (2026-06-29: Proof 1 is now a
  lethal-trifecta exfil path → Safety 80, from madappgang's `tester` shown as
  "my-plugin" — added to pay off the new Safety-ring hero; Proof 2 a skill-description
  collision → wrong-skill-fires (claude-flow, Triggering F); Proof 3 an
  AskUserQuestion-never-available tool) — all real GRADED/structural defects that
  REPRODUCE on current main. NEVER replace a real catch with a fabricated one. (The
  earlier Proof 1 was a missing-SKILL.md/Truthfulness catch, swapped 2026-06-28: its
  source (superpowers) is clean on current main and NO reproducible dead-file-ref
  exists in popular OSS — those are an adopt+strengthen payoff, see
  research/oss-audit-render-findings.md.)

  WHY ONLY TWO (decided 2026-06-28): the earlier Proofs 3-4 leaned on
  pr-review-toolkit's "review agents inherit all tools" as an official-plugin
  defect. But inherit-all (a subagent with no `tools:` line) is now ADVISORY, not a
  graded penalty — omitting the tool contract is a near-universal, legitimate
  authoring style (an OSS sweep of 122 plugins found 109 whose only finding was
  this), so penalizing it cried wolf. With that change the official plugins are all
  a clean A, so a "even Anthropic has bugs" proof would be dishonest — Proofs 3-4
  were DROPPED rather than reframed. The leaderboard feature still exists; it just
  isn't a headline proof.

  DON'T SHAME OSS: community catches are real but ANONYMIZED in public copy (no
  obra/superpowers, madappgang by name) — real names live only in research/dogfood/.
  If an official/vendor proof returns, punch UP (name Anthropic's own); never name a
  volunteer's repo to show its bug.

  1. LEAD WITH BENEFITS / the reader's CONCRETE PAIN, never an apology, caveat, or
     competitor. A bolded lead-in is the first thing read — make it the hook/win.
     End a section on the win, not the trade-off. A paragraph is ≤ ~3 lines.
  2. PROOF FIRST, mechanism second. The three instruments (Lint/Test/Eval) come
     AFTER the proof stack as "how it does it", not as a competing front door.
     "How it works" OPENS with the audit/lint/test/eval verb-map table (what it
     checks / needs-a-model? / when) — this is the load-bearing "one tool, not
     four" fix (all 6 README-review personas named it their #1 change); KEEP it,
     and keep the "audit + lint are one engine, two outputs" reconciliation.
  2b. INSTRUCTION-NEUTRAL NOUNS: body copy says CLAUDE.md *or* AGENTS.md (never
     CLAUDE.md alone) so Codex readers aren't second-class; the Lint header is
     "your instructions stop lying", and Codex is surfaced in the intro + Quick
     start, NOT only inside <details>. Don't revert headers to CLAUDE.md-only.
  3. SPEC-FIRST IS THE DEFAULT but easy — `init` ADOPTS your CLAUDE.md into a spec,
     skills edit it, you rarely hand-write .spec.ts. Give it ONE home (Quick start),
     not five scattered mentions. `eject` always reverses. Inline markdown is the
     zero-TS floor.
  4. Guard / compiled hooks is PARKED FOR LAUNCH (see research/roadmap.md). Live set
     is Lint/Test/Eval. Do NOT make the 2/7→7/7 battery the hero — re-add post-HN.
  5. SCANNABLE + SHORT — ~200-line cap; punchy cells, bullets, runnable blocks.
     Push depth into docs/ and LINK it.
  6. NO INTERNAL VOCABULARY (moat / measurement-authority / flywheel) and NO
     research/ links — name the user benefit.
  7. ASSETS: the hero vigiles-audit.png is a REAL current report (a community
     plugin rendered as "my-plugin" to anonymize) — C 72 with five rings, the
     SAFETY ring (80) flagging a subagent holding all three lethal-trifecta legs
     (a prompt-injection exfil path) + an inline subagent-tool-contract fix; the
     dramatic Safety catch is the whole point of leading with this report (chose
     the "bite" over a clean A 92 on 2026-06-29). No dialect-drift banner (HTML
     report is terminal-banner-free by design). Re-render via headless Chromium on
     the React report if the UI changes (recipe: copy a trifecta-bearing plugin to
     my-plugin/, `node dist/cli.js audit my-plugin --no-json --no-serve`,
     headless_shell `--window-size=820,1180 --force-device-scale-factor=2
     --screenshot` on vigiles-report.html, then `rm -rf my-plugin
     vigiles-report.html`). (vigiles-demo.gif was removed
     from Proof 1 — it rendered as a frozen half-typed terminal and was redundant
     with the code block; if a lint demo returns, it belongs in the Lint section
     with a non-frozen asset.)

  READABILITY (the 2026-06-29 pass — why this reads the way it does):
  A. ONE bold per block, on the single phrase the eye should catch. Bold
     everywhere = bold nowhere. Link CTAs may stay bold (they're navigation).
  B. ONE idea per sentence. No em-dash clause-chains, no stacked parentheticals.
     If a clause needs a paren, cut it or give it its own line.
  C. PLAIN words in every LEAD; push jargon (rings, recall/precision,
     interceptTools, selector, deterministic) into the linked docs. A skimmer who
     lives in Claude Code still may not know the vocabulary.
  D. SHOW via the proofs/code blocks; don't stack adjectives ("real, popular,
     free, model-less") on top of what the block already proves.
  E. SELL the outcome before the mechanism; the instruments come AFTER the proofs.
-->

<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>Catch the silent breakage in your Claude Code &amp; Codex setup.</strong>
</p>

<p align="center">
  Verify your CLAUDE.md, skills, and hooks are real — and prove they actually work.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

**Your skills, hooks, and instructions are your agent's harness.** You wrote all of it. Nothing checks any of it.

A subagent (a helper your agent hands work to) wired to a tool that doesn't exist. A hook that looks like it blocks and doesn't. Two skills the agent can't tell apart. It all looks fine, and it breaks silently mid-task.

vigiles[^name] checks your harness is _real_, not just well-formed — for Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`) alike:

```bash
npx vigiles audit
```

No key, no config, safe on any repo. Here's what it caught on plugins people actually
ship. ↓

## What it caught

<p align="center">
  <img src="vigiles-audit.png" width="760" alt="vigiles audit report scoring my-plugin C (72/100): five categories scored A–F — Truthfulness, Triggering, Structure, Safety, Tested — with the Safety category flagging a subagent that holds all three lethal-trifecta legs (a prompt-injection exfil path), plus an inline fix card for a subagent declaring a tool that doesn't exist" />
</p>

**Like Google's Lighthouse, but for your agent harness.** Five categories, each scored
A–F, every fix shown inline:

- **Truthfulness** — do the references resolve?
- **Triggering** — do skills fire, without colliding?
- **Structure** — are tool contracts and configs valid?
- **Safety** — any way for the agent to leak your data?
- **Tested** — does the harness ship tests?

It runs locally and only reads, so it's safe on any repo and the same on every OS.
**[Audit a harness →](docs/for-plugin-authors.md)**

## Proof 1 — your agent can read your secrets and ship them out

```text
◑ Safety   80  (80/100)
    └ subagent "tester" holds all three lethal-trifecta legs:
        reads private data (Bash, Read) · takes in untrusted web content (WebFetch)
        · can send data out (Bash, WebFetch)
```

Give one subagent all three powers and it's a **prompt-injection exfil path**: a poisoned
web page can tell it to read your `.env` and POST it anywhere — no exploit code, just the
tools it was handed. vigiles flags it from the tool list alone, free, no model.
**[How the Safety check works →](docs/for-plugin-authors.md)**

## Proof 2 — two skills your agent can't tell apart

```text
✗ Triggering   0  (0/100)
    └ 45 pairs of near-identical skill descriptions — the agent can't tell them
      apart, so the wrong one fires  (e.g. "agent-coder" ↔ "agent-tester", 83% alike)
```

One popular plugin ships **45 pairs of skills** with near-identical descriptions. The
agent picks which skill to run by reading those descriptions, so when two match it
fires the wrong one. The markdown is perfectly valid.
**[How triggering works →](docs/measuring-skills.md)**

## Proof 3 — a tool your subagent silently can't call

```text
✗ tester — Tool "AskUserQuestion" is never available to a subagent.
    → remove or correct it — it's silently dropped from the contract.
```

This subagent declares a tool that doesn't exist. The harness drops it silently, so
the agent loses a capability it thinks it has. vigiles catches it and gives you the
**one-line fix**.

That's the whole idea — it checks your harness against reality, not style. Every
referenced tool, hook, file, script, and skill is verified to actually resolve — and
where you name a linter rule, it's checked to exist _and_ be enabled (ESLint, Ruff,
Clippy and more).
**[Full guide →](docs/verifying-instruction-files.md)**

All three catches are free and need no model. vigiles also **prevents** whole classes
of bug up front — once your instructions are a spec, a broken reference won't compile.
**[Everything it catches and prevents →](docs/what-vigiles-catches.md)** · point `audit`
at a whole marketplace and it ranks every plugin the same way.
**[Audit a marketplace →](docs/for-plugin-authors.md)**

## How it works

`audit` is the report. Three checks compute it — and go further than _does it exist_ to
_does it work_. Almost none of it needs a model or a key.

| Command | Answers                       | Needs a model?           | When to run              |
| ------- | ----------------------------- | ------------------------ | ------------------------ |
| `audit` | The whole harness, graded A–F | No — read-only[^audit]   | Anytime; it's the report |
| `lint`  | Are the references real?      | No                       | CI gate (pass/fail)      |
| `test`  | Does the harness behave?      | No — a scripted stand-in | Every commit             |
| `eval`  | Does a skill actually help?   | Yes — your subscription  | On demand                |

`audit` and `lint` are one engine, two outputs: `audit` is the read-only report you run
yourself, `lint` runs the same deterministic checks as a pass/fail gate in CI. `test` and
`eval` go past existence to behaviour and value.

### 🔎 Lint — your instructions stop lying

Every path, script, symbol, and rule verified against reality — the catches above. You
don't write the checks: `npx vigiles init` turns your `CLAUDE.md` or `AGENTS.md`, skills,
and subagents into _specs_ (same content, plus a layer vigiles can verify). Non-destructive,
edited by your agent in plain English, undone by `eject`.
**[How →](docs/verifying-instruction-files.md)**

### 🧪 Test — does the harness actually do its job?

A hook that blocks nothing, a skill that hijacks unrelated prompts, context that never
reaches the model — each passes a naive "did it run?" check. vigiles tests the real
thing: hooks **block**, skills **fire**, subagents **finish what they promised**, and a
stray `git push` is caught before it happens. It uses a scripted stand-in for the model,
not a live call — so it needs no key and runs on every commit.
**[How testing works →](docs/harness-testing.md)**

### 📊 Eval — does a skill help, or just cost more?

_"65% fewer tokens." Says who?_ vigiles A/Bs the claim on real coding tasks and reports
the token bill, whether it hit its target, and whether the code still works. promptfoo
and DeepEval bill **per token, every run**; vigiles runs on your own Claude Pro/Max
subscription. Evals run locally; a committed lock file — like a `package-lock` — records
the result, so **CI catches stale numbers without calling the model again**.
**[Measure a skill →](docs/measuring-skills.md)**

## Quick start

**1. See what's broken** — read-only, no setup:

```bash
npx vigiles audit
```

**2. Set it up** when you like what you see. Paste into Claude Code or Codex:

```text
Set up vigiles in this repo: run `npx vigiles init` and accept the defaults. If I
already have a CLAUDE.md or AGENTS.md, adopt it into a spec and show me which
references are stale. Then compile and write + run one harness test for a hook or
skill of mine. Don't run a real-model eval without asking me first.
```

Or run it yourself:

```bash
npx vigiles init   # adopts your files (non-destructive — eject reverses), adds CI,
                   # installs the Claude Code plugin globally
```

Interactive in a terminal, non-interactive for agents/CI (or `--yes`).

**Works with Claude Code and Codex** — vigiles verifies `CLAUDE.md` and `AGENTS.md` the
same way. **[Codex setup →](docs/harnesses.md)**

**Adoption is smooth: one command, then your agent does the rest.** `init` installs
the **skills and hooks**, so a plain-English ask does the work — no specs to
hand-write, no hooks to wire:

- _"test my skills"_ → scaffolds **and runs** a trigger/behaviour test, then commits its result so CI can check it (`test-harness`)
- _"harden my rules"_ → upgrades prose guidance into enforced linter rules (`strengthen`)
- _"add a rule to my CLAUDE.md"_ → edits the source and recompiles (`edit-spec`)

The **hooks** keep it honest in-loop — nudging the agent to mark a reference or
refresh a stale eval — so there are no chores to remember.

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test`.
- **Already have a CLAUDE.md / AGENTS.md, skills, or subagents? `init` adopts them all** into specs faithfully and **non-destructively** — untouched until you `compile` (and `eject` undoes it).
- Adds `vigiles` to `devDependencies`; installs the Claude Code plugin (skills + hooks) via the marketplace — globally, never vendored.
- Wires CI as a `zernie/vigiles@v1` workflow that posts a sticky PR comment + a `valid` output.

Targets Claude Code and Codex out of the box, or
[your own harness](docs/authoring-an-adapter.md). Prefer to write tests yourself?
JS **or** TS (`*.harness.{mjs,ts}`) — run with `npx vigiles test`.

</details>

## FAQ

- **Isn't this just a markdown linter?** No — it checks whether your instruction file is _true_ (every path/script/symbol/rule exists and is enabled), then tests and measures your harness. A style linter can't do any of that.
- **Do I have to write TypeScript?** No — your agent writes the spec (`init` adopts your CLAUDE.md into one), or plain markdown lints with zero new files. Compiler-grade guarantees are opt-in, like TS's `strict` ([why?](docs/faq.md#why-are-the-strongest-guarantees-opt-in-not-the-default)).
- **Non-JS repo?** `npx vigiles lint` verifies your CLAUDE.md with no install (Ruff/Clippy/Pylint/… too).

**[Full FAQ →](docs/faq.md)**

## More

- **[What vigiles catches and prevents →](docs/what-vigiles-catches.md)** — the full matrix of harness problems it handles, biggest first, marked prevent / catch / measure.
- **[CLI →](docs/cli.md)** · **[GitHub Action →](docs/github-action.md)** · the full **[lint rules matrix →](docs/verifying-instruction-files.md#the-validation-rules--the-full-matrix)** lives with the linting guide.
- **[Skills →](docs/skills.md)** — the skills `init` installs, and how the model-invocable ones trigger.
- **[Ship plugins? The plugin-author guide →](docs/for-plugin-authors.md)** — scan a draft, make your skills fire, rank a whole marketplace — no key.
- **[Docs index →](docs/README.md)** · **[API reference →](https://zernie.github.io/vigiles/)** · **[Related tools →](docs/related-tools.md)**.
- **[Stability →](STABILITY.md)** — 0.x: the CLI is stable; the library API is still evolving.
- **Not for you if** you want a model/capability benchmark or runtime guardrails in the request path — vigiles is build-/CI-time.
- Companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## License

[MIT](LICENSE)

[^name]: **vigiles** — the watchmen of ancient Rome, who guarded the city (and fought its fires) by night. _Quis custodiet ipsos custodes?_ — "who watches the watchmen?" (Juvenal, _Satire VI_).

[^audit]: `audit` reads only by default. Two deeper checks — live MCP connections and skill-firing — are opt-in and ask before they run.
