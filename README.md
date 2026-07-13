<!--
  README DIRECTION — read before editing; keep changes aligned.
  Front door + marketing asset for someone who lives in Claude Code / Codex.
  Optimize for a phone-skimmer who must come away knowing WHAT IT IS and wanting
  to run it — never scared off. Validated by a 6-persona cold-read (2026-07):
  newcomer / power-user / plugin-author / skeptical-senior / decision-maker /
  Codex-user. The fixes below trace to that review — don't regress them.

  HOOK = FELT PAIN, then breadth (founder direction 2026-07). Bold tagline is a
  specific second-person pain: "You have a rule your agent follows half the time
  — and no way to know which one." It's rhetorical (the reader's own uncertainty),
  NOT an ecosystem stat — do NOT reintroduce a bare "%"/number in the tagline (the
  doc mocks uncited stats: "'65% fewer tokens.' Says who?", so a fake stat up top
  reads as hypocrisy). Dev-native CRAFT bait, NOT enterprise fear (OSS dev tool,
  not a security product). The report-card + 5 rings RIGHT BELOW show the breadth
  so the specific hook doesn't read as narrow.

  DEFINE "HARNESS" on first use (the load-bearing noun, used ~15×) — gloss it as
  "the CLAUDE.md/AGENTS.md rules, skills, subagents, and hooks steering your
  agent." 4 of 6 personas bounced on it being undefined. Keep the gloss.

  INSTRUCTION-NEUTRAL NOUNS (Codex was the lowest score): body copy says CLAUDE.md
  OR AGENTS.md, never CLAUDE.md alone. The tagline may keep punch, but Codex must
  appear within the first sentence or two (the harness gloss names AGENTS.md), and
  every "adopts your CLAUDE.md"/"verifies your CLAUDE.md" gets "or AGENTS.md".

  CATEGORY = A TOOL YOU RUN (ESLint/Lighthouse/npm audit class), NOT a framework,
  NOT a lib-collection. The FAQ says this outright — it's the #1 thing that scares
  people off. The library/subpath exports are the automation door for the 5%.

  AUDIT vs LINT — ONE CONSISTENT, ACCURATE STORY (a persona caught 3 conflicting
  answers): `lint` = the CI gate on the deterministic checks (broken refs, tool
  contracts, dead hooks, skill collisions — Proofs 1 & 2). `audit` = those same
  checks + the Safety ring + two opt-in LIVE checks (MCP connects? skills fire?)
  + the graded report. Do NOT claim lint gates the lethal-trifecta Safety flag
  (it's an audit ring, not a default gating rule) and do NOT say lint is
  refs-only. The table row, the reconciliation line, and the Lint subsection must
  all agree.

  SPINE = proof/demo-led. Real, screenshotable catches on shipped plugins, THEN
  mechanism. Every proof traces to a real dogfood run (research/dogfood/) — NEVER
  fabricate one. Order = most-RELATABLE first (broken tool ref → skill collision →
  rules-not-enforced → secrets-exfil gotcha LAST as the bite). The intro triplet
  maps to the three "vibes break silently" proofs (1, 2, 4); Proof 3 (your rules →
  enforced) pays off the TAGLINE's rule-follows-half-the-time pain. Security is ONE
  dev-native GOTCHA proof, never the brand. Add a repro
  line ("run `npx vigiles audit <any-repo>` for your own") + a one-line note that
  examples use CC subagents but the checks run on Codex too. FALSE CONFIDENCE is
  the coined term (a guard that looks like it works and silently doesn't), defined
  once in the Test section.

  FUNNEL: "How it works" opens with the audit/lint/test/eval verb-map table — the
  load-bearing "one tool, not four" fix. Frame it vibes → verified. Name that
  init/compile/eject manage the spec layer (personas noticed the verb-count gap).

  DON'T SHAME OSS: catches are ANONYMIZED (no obra/superpowers, madappgang,
  claude-flow by name) — real names live only in research/dogfood/.
  Guard/compiled-hooks + the 2/7→7/7 battery are PARKED FOR LAUNCH — not the hero.

  RULES: lead with the reader's CONCRETE PAIN; ≤ ~3-line paragraphs; ONE bold per
  block; ONE idea per sentence; NO internal vocabulary (moat/flywheel) / NO
  research/ links / NO enterprise/national-interest framing — name the user
  benefit; ~220-line body cap; push depth into docs/ and LINK it. Assets: the hero
  vigiles-audit.png is a REPRESENTATIVE report ("my-plugin", C 77) — the verdict-
  led header + ranked fixes + the "Your rules → enforced" section (the new rule-
  compile capability). Re-render via headless Chromium if the UI changes: build
  report/, screenshot report/dist/index.html (falls back to the sample fixture),
  inject the dark :root tokens before </body> for the dark render.
-->

<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>You have a rule your agent follows half the time — and no way to know which one.</strong>
</p>

<p align="center">
  Verify your CLAUDE.md or AGENTS.md, skills, and hooks are real — and prove they actually work.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

**You review every PR. Nothing reviews your CLAUDE.md.**

Your **harness** — the CLAUDE.md or AGENTS.md rules, skills, subagents, and hooks steering your agent — is the one part nobody checks. Nobody verified it's real. Nobody tested it works. That's not a system. That's vibes.

And vibes break silently mid-task: a subagent wired to a tool that doesn't exist, two skills your agent can't tell apart, one helper quietly able to read your secrets and send them out.

vigiles[^name] checks your harness is _real_, not just well-formed — Claude Code and Codex alike. One command, no key, no config, safe on any repo:

```bash
npx vigiles audit
```

It's free and open-source, runs entirely on your machine, and never bills per token. (`eval` is the only step that calls a model — on your own Claude subscription.) Here's what it caught on plugins people actually ship. ↓

## What it caught

<p align="center">
  <img src="vigiles-audit.png" width="760" alt="vigiles audit report for my-plugin: a verdict header reading 'Two one-line fixes away from a B.' next to a C (77/100) grade, a five-category strip (Truthfulness, Triggering, Structure, Safety, Tested), ranked fix cards with '+N pts' impact badges, and a 'Your rules → enforced' section showing a prose rule the config silently turns off" />
</p>

**Like Google's Lighthouse, but for your agent harness.** One command grades it A–F across five categories, leads with a plain-English verdict — _"two one-line fixes away from a B"_ — and ranks every fix by the points it buys back:

- **Truthfulness** — do the references resolve?
- **Triggering** — do skills fire, without colliding?
- **Structure** — are tool contracts and configs valid?
- **Safety** — any way for the agent to leak your data?
- **Tested** — does the harness ship tests?

And it closes the loop from prose to enforcement: **your rules → enforced** maps each rule you wrote to the lint rule that actually enforces it — already on, one config line away, or silently turned off (below).

These are real scans of public plugins — run `npx vigiles audit <any-repo>` for your own. The examples below use Claude Code subagents; the same checks run on Codex `AGENTS.md`, skills, and hooks. ↓

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

One popular plugin ships **45 pairs** of near-identical skill descriptions. Your agent picks a skill by _reading_ them — so when two match, it fires the wrong one. Still perfectly valid markdown.
**[How triggering works →](docs/measuring-skills.md)**

## Proof 3 — a rule you wrote that nothing enforces

Point vigiles at your own repo and the rules section maps each prose rule to the lint rule that enforces it — then checks your config. Representative output:

```text
Your rules → enforced   1 of 4 enforced · 2 one line away · 1 contradicted by config
    └ "always use ===" → eqeqeq is set to "off" in your ESLint config
       your CLAUDE.md says enforce it; your config quietly turns it off
```

You wrote the rule. Your agent treats it as gospel and follows it — until it doesn't, and nothing tells you which time. vigiles checks each mapped rule three ways: enforced, **one line away**, or — the one people screenshot — documented but silently **turned off**. Deterministic, no model. Want the rest compiled — a custom rule for a rule no linter ships, a hook for `git push`, the judgment calls honestly left alone? That's the opt-in `compile` tier (one model pass, then CI is plain lint).
**[How enforcement works →](docs/verifying-instruction-files.md)**

## Proof 4 — it can quietly read your secrets and send them out

```text
◑ Safety   80  (80/100)
    └ subagent "tester" holds all three lethal-trifecta legs:
        reads private data (Bash, Read) · takes in untrusted web content (WebFetch)
        · can send data out (Bash, WebFetch)
```

Hand one subagent all three powers and a poisoned web page can make it read your `.env` and POST it anywhere — no exploit code, just the tools it was given. The **80 looks like a B** — and that's the trap: a healthy grade hiding a subagent that's a data-leak waiting to happen. vigiles spots it from the tool list alone, free, no model.

That's the whole idea: it checks your harness against **reality, not style**. Every tool, hook, file, script, and skill you reference is verified to actually resolve — and where you name a linter rule, it's checked to exist _and_ be enabled (ESLint, Ruff, Clippy, and more).
**[Everything it catches →](docs/what-vigiles-catches.md)** · point `audit` at a whole marketplace and it ranks every plugin the same way.

## How it works — vibes → verified

`audit` shows you where your setup is still vibes. Turning that into _verified_ is four commands over one engine — and almost none of it needs a model or a key.

| Command | Answers                        | Needs a model?           | When to run              |
| ------- | ------------------------------ | ------------------------ | ------------------------ |
| `audit` | Everything, graded A–F         | No — read-only[^audit]   | Anytime; it's the report |
| `lint`  | Do the structural checks pass? | No                       | CI gate, every push      |
| `test`  | Does the harness behave?       | No — a scripted stand-in | Every commit             |
| `eval`  | Does a skill actually help?    | Yes — your subscription  | On demand                |

**One engine, two doors.** `audit` is the local report; **`lint` is the CI gate** that fails the build on the same deterministic checks — broken refs, bad tool contracts, dead hooks, skill collisions (Proofs 1–2). `test` and `eval` go further: past _does it exist_ to _does it work_. (`init` / `compile` / `eject` manage the spec layer underneath — you rarely run them by hand.)

### 🔎 Lint — your instructions stop lying

Every path, script, symbol, and rule verified against reality — plus tool contracts, skill collisions, and dead hooks (the catches above). You don't write the checks. `npx vigiles init` writes a `CLAUDE.md.spec.ts` beside your file: the same rules, each reference now wrapped so vigiles can confirm it exists. `compile` turns that back into the `CLAUDE.md` (or `AGENTS.md`) your agent already reads. Your agent edits the spec in plain English; `eject` deletes it and leaves your original untouched.
**[How →](docs/verifying-instruction-files.md)**

### 🧪 Test — does the harness actually do its job?

A hook that blocks nothing, a skill that hijacks unrelated prompts, context that never reaches the model — each passes a naive "did it run?" check. That gap is **false confidence**: a guard that looks like it works and silently doesn't. vigiles tests the real thing — hooks block, skills fire, subagents finish what they promised, a stray `git push` is caught before it happens. It drives a scripted stand-in for the model, not a live call, so it needs no key and runs on every commit.
**[How testing works →](docs/harness-testing.md)**

### 📊 Eval — the only way to put a real number on cost

_"Caveman Mode cuts 65% of your tokens." Says who?_ vigiles A/Bs the claim on real coding tasks and hands you three numbers: the **token bill**, whether it hit its **target**, and whether your code still **works**.

```text
caveman vs verbose · haiku · $0 on your subscription
  output tokens   762 → 842   (+11% — the "saving" reversed)
  correctness     1.0 → 1.0   (the fact survived)
```

Point it at any harness change that claims a number — does a compression skill pay for itself, is a subagent worth its cost, which model is cheapest here. promptfoo and DeepEval bill **per token, every run**; vigiles runs on your own Claude Pro/Max subscription, so you measure on every change, not once. A committed lock file (like `package-lock`) keeps CI honest without re-calling the model. (Claude Code today; Codex landing.)
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
                   # installs vigiles's skills + hooks as a Claude Code plugin (in
                   # ~/.claude/, not your repo). On Codex, skills install globally too.
```

Interactive in a terminal, non-interactive for agents/CI (or `--yes`). **Works with Claude Code and Codex** — vigiles verifies `CLAUDE.md` and `AGENTS.md` the same way. **[Codex setup →](docs/harnesses.md)**

**Adoption is smooth: one command, then your agent does the rest.** `init` installs the **skills and hooks**, so a plain-English ask does the work — no specs to hand-write, no hooks to wire:

- _"test my skills"_ → scaffolds **and runs** a trigger/behaviour test, then commits its result so CI can check it (`test-harness`)
- _"harden my rules"_ → upgrades prose guidance into enforced linter rules (`strengthen`)
- _"add a rule to my CLAUDE.md or AGENTS.md"_ → edits the source and recompiles (`edit-spec`)

The **hooks** keep it honest in-loop — nudging the agent to tag a linter-rule mention so vigiles can verify it, or to re-run a test whose result just went stale — so there are no chores to remember.

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test`.
- **Already have a CLAUDE.md / AGENTS.md, skills, or subagents? `init` adopts them all** into specs faithfully and **non-destructively** — untouched until you `compile` (and `eject` undoes it).
- Adds `vigiles` to `devDependencies`; installs the Claude Code plugin (skills + hooks) via the marketplace — globally, never vendored.
- Wires CI as a `zernie/vigiles@v1` workflow (needs only read + PR-comment permissions) that posts a sticky PR comment + a `valid` output.

Targets Claude Code and Codex out of the box, or [your own harness](docs/authoring-an-adapter.md). Prefer to write tests yourself? JS **or** TS (`*.harness.{mjs,ts}`) — run with `npx vigiles test`.

</details>

## FAQ

- **Is this a framework I have to build around?** No. It's a tool you run — like ESLint, Lighthouse, or `npm audit`. One command, a report, an optional CI gate. There's a library API for automation, but you never touch it to get value.
- **Isn't this just a markdown linter?** No — it checks whether your instruction file is _true_ (every path/script/symbol/rule exists and is enabled), then tests and measures your harness. A style linter can't do any of that.
- **Do I have to write TypeScript?** No — your agent writes the spec (`init` adopts your CLAUDE.md or AGENTS.md into one), or plain markdown lints with zero new files. Compiler-grade guarantees are opt-in, like TS's `strict` ([why?](docs/faq.md#why-are-the-strongest-guarantees-opt-in-not-the-default)).
- **Is it stable enough to adopt?** The CLI you run is small and rarely changes; the library API still moves between releases. The high version number is release automation (a new major per breaking change), not age — see [Stability](STABILITY.md).
- **Non-JS repo?** `npx vigiles lint` verifies your CLAUDE.md or AGENTS.md with no install (Ruff/Clippy/Pylint/… too).

**[Full FAQ →](docs/faq.md)**

**Not for you if** you want a model/capability benchmark or runtime guardrails in the request path — vigiles is build-/CI-time.

## Docs

The **[docs index](docs/README.md)** is the full map, grouped by what you're doing:

- **Guides** — [verify instruction files](docs/verifying-instruction-files.md) · [test your harness](docs/harness-testing.md) · [measure a skill](docs/measuring-skills.md) · [ship a plugin](docs/for-plugin-authors.md) · [Codex & other harnesses](docs/harnesses.md)
- **Reference** — [CLI](docs/cli.md) · [rules matrix](docs/verifying-instruction-files.md#the-validation-rules--the-full-matrix) · [testing API](docs/testing-api.md) · [full API](https://zernie.github.io/vigiles/)
- **Explanation** — [what it catches](docs/what-vigiles-catches.md) · [how it compares](docs/comparison.md) · [FAQ](docs/faq.md)

**Project** — [Stability](STABILITY.md) · [Related tools](docs/comparison.md#what-vigiles-composes-with)

<!-- The "companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need)"
     link is temporarily removed while AgenticDev paper #1 is under blind review: repo → blog is a
     deanonymization path (the reviewer-offer email links this repo). RESTORE after notification (2026-08-21). -->

## License

[MIT](LICENSE)

[^name]: **vigiles** — the watchmen of ancient Rome, who guarded the city (and fought its fires) by night. _Quis custodiet ipsos custodes?_ — "who watches the watchmen?" (Juvenal, _Satire VI_).

[^audit]: `audit` reads only by default. Two deeper checks — live MCP connections and skill-firing — are opt-in and ask before they run.
