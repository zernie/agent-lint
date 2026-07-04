<!--
  README DIRECTION — read before editing; keep changes aligned.
  This file is the FRONT DOOR + a marketing asset for someone who already lives
  in Claude Code / Codex. Optimize for a phone-skimmer who should come away
  understanding WHAT IT IS and wanting to run it — never scared off.

  HOOK = FELT PAIN, then breadth (founder direction 2026-07). The bold tagline is
  a SPECIFIC second-person pain the reader recognizes instantly: "You have a
  CLAUDE.md rule your agent follows half the time. Time to fix that." Dev-native
  CRAFT bait, NOT enterprise fear (this is an OSS dev tool, not a security
  product). A specific pain stings harder than an abstract line — the risk is
  looking narrow, so the report-card + 5 rings RIGHT BELOW immediately show the
  breadth (the sting, then "oh it does way more"). The review-parallel callout
  ("You review every PR. Nothing reviews your CLAUDE.md.") is now the INTRO bold
  lead (broadens the one rule → the whole harness); "vibes" carries the intro body
  ("that's not a system, that's vibes") + the "vibes → verified" How-it-works
  section. Arc: tagline (one felt pain) → intro (nothing reviews any of it → it's
  vibes) → How it works (vibes → verified). Keep the verify-first SUBHEAD for
  substance. CLAUDE.md stays in the tagline/lead for punch; Codex/AGENTS.md is
  covered in the intro + subhead. Do NOT revert to the old test-first "tests your
  skills never had" tagline. Stay coding-scoped (CC/Codex + CLAUDE.md/AGENTS.md/
  skills/hooks). NOT "observability" as the headline.

  CATEGORY = A TOOL YOU RUN, not a framework, not a lib-collection. The analogues
  are ESLint / Lighthouse / npm audit: one command, a report, an optional CI gate.
  The FAQ says this outright ("Is this a framework?") because it's the #1 thing
  that scares people off. The library/subpath exports are the automation door for
  the 5% — never the pitch.

  SPINE = proof/demo-led. Lead with REAL, screenshotable catches on plugins people
  actually ship, THEN the mechanism. Every proof traces to a real dogfood run in
  research/dogfood/ — NEVER fabricate one. PROOF ORDER = most-RELATABLE first
  (a broken tool ref → a skill collision → the security gotcha last as the "and
  even THIS" bite). Security is ONE dev-native GOTCHA proof, framed as craft
  ("the tool your agent thinks it has and doesn't", "it can quietly leak your
  secrets"), NEVER as enterprise/compliance/national-interest framing and NEVER
  the brand — if it reads as "a security scanner" the other ~80% (references,
  triggering, testing) vanishes. Current proofs, anonymized: (1) an
  AskUserQuestion-never-available tool; (2) a skill-description collision
  (Triggering F); (3) a lethal-trifecta exfil path (Safety). All real, reproduce
  on current main.

  FALSE CONFIDENCE is the coined term of art (a guard that looks like it works
  and silently doesn't) — defined once in the Test section, citable, let it recur.

  FUNNEL: "How it works" OPENS with the audit/lint/test/eval verb-map table (what
  it checks / needs-a-model? / when) — the load-bearing "one tool, not four" fix
  (all 6 README-review personas named it their #1 change). KEEP it + the
  "audit + lint are one engine, two outputs" reconciliation. Frame it as
  vibes → verified.

  DON'T SHAME OSS: community catches are real but ANONYMIZED (no obra/superpowers,
  madappgang, claude-flow by name) — real names live only in research/dogfood/.
  Punch UP only (name Anthropic's own) if an official proof ever returns.

  Guard / compiled hooks + the 2/7→7/7 disaster battery are PARKED FOR LAUNCH
  (see research/roadmap.md) — do NOT make the battery the hero here.

  RULES:
  1. LEAD WITH BENEFITS / the reader's CONCRETE PAIN, never an apology or
     competitor. A bolded lead-in is the first thing read — make it the hook/win.
     A paragraph is ≤ ~3 lines.
  2. INSTRUCTION-NEUTRAL NOUNS: body copy says CLAUDE.md *or* AGENTS.md (never
     CLAUDE.md alone); Codex surfaced in intro + Quick start, not only <details>.
  3. SPEC-FIRST IS THE DEFAULT but easy — `init` ADOPTS your instructions into a
     spec, skills edit it, you rarely hand-write .spec.ts. One home (Quick start).
     `eject` always reverses.
  4. SCANNABLE + SHORT — ~220-line body cap; punchy cells, bullets, runnable
     blocks. Push depth into docs/ and LINK it.
  5. NO INTERNAL VOCABULARY (moat / measurement-authority / flywheel), NO
     research/ links, NO enterprise/national-interest framing — name the user
     benefit. ONE bold per block. ONE idea per sentence.
  6. ASSETS: the hero vigiles-audit.png is a REAL current report (a community
     plugin rendered as "my-plugin") — C 72, five rings. It's the Lighthouse
     report-card screenshot = the shareable artifact; the report card, not the
     Safety ring, is the point. Re-render via headless Chromium on the React
     report if the UI changes (recipe: copy a plugin to my-plugin/,
     `node dist/cli.js audit my-plugin --no-json --no-serve`, headless_shell
     `--window-size=820,1180 --force-device-scale-factor=2 --screenshot` on
     vigiles-report.html, then `rm -rf my-plugin vigiles-report.html`).
-->

<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>You have a CLAUDE.md rule your agent follows half the time. Time to fix that.</strong>
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

**You review every PR. Nothing reviews your CLAUDE.md.**

The CLAUDE.md, skills, and hooks meant to keep your agent on track are themselves unchecked — nobody verified they're real, nobody tested they work. That's not a system. That's vibes.

And vibes break silently mid-task: a subagent wired to a tool that doesn't exist, a hook that looks like it blocks and doesn't, two skills the agent can't tell apart. It all looks fine right up until it doesn't.

vigiles[^name] checks your harness is _real_, not just well-formed — Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`) alike. One command, no key, no config, safe on any repo:

```bash
npx vigiles audit
```

Here's what it caught on plugins people actually ship. ↓

## What it caught

<p align="center">
  <img src="vigiles-audit.png" width="760" alt="vigiles audit report scoring my-plugin C (72/100): five categories scored A–F — Truthfulness, Triggering, Structure, Safety, Tested — with an inline fix card for a subagent declaring a tool that doesn't exist" />
</p>

**Like Google's Lighthouse, but for your agent harness.** One command grades it A–F across five categories, every fix shown inline:

- **Truthfulness** — do the references resolve?
- **Triggering** — do skills fire, without colliding?
- **Structure** — are tool contracts and configs valid?
- **Safety** — any way for the agent to leak your data?
- **Tested** — does the harness ship tests?

It only reads, so it's safe on any repo and identical on every OS. Three of the things it found, all real: ↓

## Proof 1 — a tool your agent thinks it has and doesn't

```text
✗ tester — Tool "AskUserQuestion" is never available to a subagent.
    → remove or correct it — it's silently dropped from the contract.
```

This subagent — a helper your main agent hands work to — lists a tool that doesn't exist for it. The harness drops it without a word, so the agent quietly loses a capability it thinks it has. The markdown is perfectly valid. vigiles catches it and hands you the **one-line fix**.

## Proof 2 — two skills your agent can't tell apart

```text
✗ Triggering   0  (0/100)
    └ 45 pairs of near-identical skill descriptions — the agent can't tell them
      apart, so the wrong one fires  (e.g. "agent-coder" ↔ "agent-tester", 83% alike)
```

One popular plugin ships **45 pairs of skills** with near-identical descriptions. Your agent picks which skill to run by _reading_ those descriptions, so when two match it fires the wrong one. Still perfectly valid markdown.
**[How triggering works →](docs/measuring-skills.md)**

## Proof 3 — it can quietly read your secrets and send them out

```text
◑ Safety   80  (80/100)
    └ subagent "tester" holds all three lethal-trifecta legs:
        reads private data (Bash, Read) · takes in untrusted web content (WebFetch)
        · can send data out (Bash, WebFetch)
```

Hand one subagent all three powers and a poisoned web page can tell it to read your `.env` and POST it anywhere — no exploit code, just the tools it was given. vigiles spots it from the tool list alone, free, no model.

That's the whole idea: it checks your harness against **reality, not style**. Every tool, hook, file, script, and skill you reference is verified to actually resolve — and where you name a linter rule, it's checked to exist _and_ be enabled (ESLint, Ruff, Clippy, and more).
**[Everything it catches →](docs/what-vigiles-catches.md)** · point `audit` at a whole marketplace and it ranks every plugin the same way.

## How it works — vibes → verified

`audit` shows you the vibes. Turning them into _verified_ is one tool worn four ways — and almost none of it needs a model or a key.

| Command | Answers                       | Needs a model?           | When to run              |
| ------- | ----------------------------- | ------------------------ | ------------------------ |
| `audit` | The whole harness, graded A–F | No — read-only[^audit]   | Anytime; it's the report |
| `lint`  | Are the references real?      | No                       | CI gate (pass/fail)      |
| `test`  | Does the harness behave?      | No — a scripted stand-in | Every commit             |
| `eval`  | Does a skill actually help?   | Yes — your subscription  | On demand                |

`audit` and `lint` are one engine, two outputs: `audit` is the read-only report you run yourself, `lint` runs the same checks as a pass/fail gate in CI. `test` and `eval` go past _does it exist_ to _does it work_.

### 🔎 Lint — your instructions stop lying

Every path, script, symbol, and rule verified against reality — the catches above. You don't write the checks: `npx vigiles init` turns your `CLAUDE.md` or `AGENTS.md`, skills, and subagents into _specs_ (same content, plus a layer vigiles can verify). Non-destructive, edited by your agent in plain English, undone by `eject`.
**[How →](docs/verifying-instruction-files.md)**

### 🧪 Test — does the harness actually do its job?

A hook that blocks nothing, a skill that hijacks unrelated prompts, context that never reaches the model — each passes a naive "did it run?" check. That gap is **false confidence**: a guard that looks like it works and silently doesn't. vigiles tests the real thing — hooks block, skills fire, subagents finish what they promised, a stray `git push` is caught before it happens. It drives a scripted stand-in for the model, not a live call, so it needs no key and runs on every commit.
**[How testing works →](docs/harness-testing.md)**

### 📊 Eval — does a skill help, or just cost more?

_"65% fewer tokens." Says who?_ vigiles A/Bs the claim on real coding tasks and reports the token bill, whether it hit its target, and whether the code still works. promptfoo and DeepEval bill **per token, every run**; vigiles runs on your own Claude Pro/Max subscription. Evals run locally; a committed lock file — like a `package-lock` — records the result, so CI catches stale numbers without calling the model again.
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

**Works with Claude Code and Codex** — vigiles verifies `CLAUDE.md` and `AGENTS.md` the same way. **[Codex setup →](docs/harnesses.md)**

**Adoption is smooth: one command, then your agent does the rest.** `init` installs the **skills and hooks**, so a plain-English ask does the work — no specs to hand-write, no hooks to wire:

- _"test my skills"_ → scaffolds **and runs** a trigger/behaviour test, then commits its result so CI can check it (`test-harness`)
- _"harden my rules"_ → upgrades prose guidance into enforced linter rules (`strengthen`)
- _"add a rule to my CLAUDE.md"_ → edits the source and recompiles (`edit-spec`)

The **hooks** keep it honest in-loop — nudging the agent to mark a reference or refresh a stale eval — so there are no chores to remember.

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test`.
- **Already have a CLAUDE.md / AGENTS.md, skills, or subagents? `init` adopts them all** into specs faithfully and **non-destructively** — untouched until you `compile` (and `eject` undoes it).
- Adds `vigiles` to `devDependencies`; installs the Claude Code plugin (skills + hooks) via the marketplace — globally, never vendored.
- Wires CI as a `zernie/vigiles@v1` workflow that posts a sticky PR comment + a `valid` output.

Targets Claude Code and Codex out of the box, or [your own harness](docs/authoring-an-adapter.md). Prefer to write tests yourself? JS **or** TS (`*.harness.{mjs,ts}`) — run with `npx vigiles test`.

</details>

## FAQ

- **Is this a framework I have to build around?** No. It's a tool you run — like ESLint, Lighthouse, or `npm audit`. One command, a report, an optional CI gate. There's a library API for automation, but you never touch it to get value.
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
