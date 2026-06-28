<!--
  README DIRECTION — read before editing; keep changes aligned.
  This file is the FRONT DOOR + a marketing asset for someone who already lives
  in Claude Code / Codex. Optimize for a phone-skimmer.

  SPINE = CONCEPT 5 (proof/demo-led). Lead with REAL, screenshotable catches on
  plugins people actually ship, THEN explain the mechanism. The proofs are not
  illustrative — every block traces to a real dogfood run captured in
  research/dogfood/. TWO COMMUNITY catches, anonymized (a skill-description collision
  → wrong-skill-fires (claude-flow, Triggering F), an AskUserQuestion-never-available
  tool) — both real GRADED defects that REPRODUCE on current main. NEVER replace a
  real catch with a fabricated one. (Proof 1 was a missing-SKILL.md/Truthfulness
  catch, swapped 2026-06-28: its source (superpowers) is clean on current main and NO
  reproducible dead-file-ref exists in popular OSS — those are an adopt+strengthen
  payoff, see research/oss-audit-render-findings.md.)

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
     plugin rendered as "my-plugin" to anonymize) — A 92 with the how-to-act flow,
     four rings, and an inline subagent-tool-contract fix; no dialect-drift banner
     (HTML report is terminal-banner-free by design). Re-render via headless
     Chromium on the React report if the UI changes. (vigiles-demo.gif was removed
     from Proof 1 — it rendered as a frozen half-typed terminal and was redundant
     with the code block; if a lint demo returns, it belongs in the Lint section
     with a non-frozen asset.)
-->

<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>The tests your AI agent harness never had.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

**You installed a bunch of plugins and wrote a few skills — but do they actually work?**
A skill that never fires, two skills the agent can't tell apart, a subagent wired to
a tool that doesn't exist — your harness fails **silently**, and you find out mid-task.

**It's a library with no tests.** One command runs them — no key, no config, safe on
any repo:

```bash
npx vigiles audit
```

Here's what it found on real, popular plugins. ↓

## The report

<p align="center">
  <img src="vigiles-audit.png" width="760" alt="vigiles audit report: an overall A (92/100) score with four category rings — Truthfulness, Triggering, Structure, Tested — a how-to-act flow, and an inline fix card for a subagent declaring a tool that doesn't exist" />
</p>

Four deterministic rings, **each finding's fix inline**, and a shareable HTML report.
Like Lighthouse, `audit` is a **local report you run on your machine** — safe on any
repo (even one wired to prod), identical on every OS. **Not a CI step** (CI uses
`lint`). **[Audit a harness →](docs/for-plugin-authors.md)**

## Proof 1 — two skills your agent can't tell apart

```text
✗ Triggering   0
    └ 45 near-identical skill descriptions — the selector can't tell them apart,
      so the wrong one fires  (e.g. "agent-coder" ↔ "agent-tester", 83% alike)
```

A real, popular plugin ships **45 skill pairs** described so similarly the model
can't reliably pick between them — so it fires the **wrong** skill. Valid markdown;
the selector chooses by description, and near-identical text collides.
**[How triggering works →](docs/measuring-skills.md)**

## Proof 2 — a tool your subagent silently can't call

```text
✗ tester — Tool "AskUserQuestion" is never available to a subagent.
    → remove or correct it — it's silently dropped from the contract.
```

A real upstream subagent declares a tool the harness **silently drops**, so it loses
a capability it thinks it has. vigiles flags it _and_ hands you the one-line fix —
**free, no model.** That's the difference from a markdown linter: it checks your
harness against **reality**, not style — every file path, script, code symbol, and
linter rule across **7 catalogs** (ESLint, Ruff, Clippy + four more), each verified
to **exist _and_ be enabled**. **[Full guide →](docs/verifying-instruction-files.md)**

Two real catches, both **free and model-less** — and audit ranks a whole
marketplace the same way. **[Audit a marketplace →](docs/for-plugin-authors.md)**

> **And it grades itself: 100/100, A, all four rings green** — and CI gates every
> commit with `lint` + `test`. We eat what we cook.

## How it does it — three instruments

`Agent = Model + Harness`[^name]. The model gets the headlines; the **harness** is the
half you own. `audit` is the dashboard — these fix and prove what it finds.

### 🔎 Lint — your CLAUDE.md stops lying

Every path, script, symbol & linter rule resolved against reality (the catches
above). **You don't write any of it** — `npx vigiles init` **adopts your existing
CLAUDE.md _and every skill and subagent_ into verified specs**, non-destructively
(untouched until you `compile`; `eject` reverses). After that, plain-English asks
edit them for you. **[How →](docs/verifying-instruction-files.md)**

### 🧪 Test — does the harness actually do its job?

A hook that blocks nothing, a skill that hijacks unrelated prompts, injected context
that never reaches the model — all pass a naive "did it run?" check. Start at the
cheapest tier: a hook, called directly. **No model, no key:**

```typescript
import { runHook } from "vigiles/testing";

const r = runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assert(r.blocked); // a red ✗ means your guard silently lets it through
```

Hooks **block** · skills **trigger** (recall _and_ precision) · subagents **finish**
in the outcome they promised (no LLM judge) · **safety holds** — `interceptTools`
catches a push or paid-API call as an _attempt_, so the side effect never happens.
Almost every tier runs with **no model and no key**, on every commit.
**[How testing works →](docs/harness-testing.md)**

### 📊 Eval — does a skill help, or just cost more?

_"65% fewer tokens." Says who?_ vigiles A/Bs the claim on real coding tasks and reports
the **bill**, the **target it claims to move**, and the **blast radius** (did the code
still work?).

**The eval you can actually afford:** promptfoo / DeepEval hit a metered API and bill
**per token, every run**. vigiles answers most questions with **no model at all**, and
runs the rest on your own **Claude Pro/Max subscription — $0 extra.**
**[Measure a skill →](docs/measuring-skills.md)**

## Quick start

**Paste into Claude Code or Codex:**

```text
Set up vigiles in this repo: run `npx vigiles init` and accept the defaults. If I
already have a CLAUDE.md or AGENTS.md, adopt it into a spec and show me which
references are stale. Then install the dep, compile, and write + run one harness
test for a hook or skill of mine. Don't enforce a spec-per-file or add a real-model
eval without asking me first.
```

Or do it yourself:

```bash
npx vigiles init   # lint + test: spec + harness test + CI + plugin
```

Interactive in a terminal, non-interactive for agents/CI (or `--yes`).

**You don't hand-write any of this — your agent does.** `init` installs
model-invocable skills, so a plain-English ask does the work:

- _"test my skills"_ → scaffolds **and runs** a trigger/behaviour test (`test-harness`)
- _"harden my rules"_ → upgrades prose guidance into enforced linter rules (`strengthen`)
- _"add a rule to my CLAUDE.md"_ → edits the source and recompiles (`edit-spec`)

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test`.
- **Already have a CLAUDE.md / AGENTS.md, skills, or subagents? `init` adopts them all** into specs faithfully and **non-destructively** — untouched until you `compile` (and `eject` undoes it).
- Adds `vigiles` to `devDependencies`; installs the Claude Code plugin (skills + hooks) via the marketplace — globally, never vendored.
- Wires CI as a `zernie/vigiles@v1` workflow that posts a sticky PR comment + a `valid` output.

Works with **Claude Code and Codex** ([`vigiles/codex`](docs/harnesses.md)) or
[your own harness](docs/authoring-an-adapter.md). Prefer to write tests yourself?
JS **or** TS (`*.harness.{mjs,ts}`) — run with `npx vigiles test`.

</details>

## FAQ

- **Isn't this just a markdown linter?** No — it checks whether your instruction file is _true_ (every path/script/symbol/rule exists and is enabled), then tests and measures your harness. A style linter can't do any of that.
- **Do I have to write TypeScript?** No — your agent writes the spec (`init` adopts your CLAUDE.md into one), or plain markdown lints with zero new files. Compiler-grade guarantees are opt-in, like TS's `strict`.
- **Non-JS repo?** `npx vigiles lint` verifies your CLAUDE.md with no install (Ruff/Clippy/Pylint/… too).

**[Full FAQ →](docs/faq.md)**

## More

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
