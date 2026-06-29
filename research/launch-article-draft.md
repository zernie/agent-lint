# DRAFT — launch article: "I measured the hyped Claude skills. Most are cost, not benefit."

> **Internal draft of an external article.** Public voice (user benefit, no internal
> vocabulary), anonymized where a name isn't load-bearing. Built on PILOT data —
> haiku, small N, some reconstructed `SKILL.md` — so it proves the NARRATIVE, not a
> publishable result. Before it ships: a rigor pass (more trials, sonnet, real
> `SKILL.md` fetched not reconstructed). Numbers below are real and committed under
> `bench/`. Founder decides naming/tone (esp. whether to name caveman vs anonymize).

---

## The pitch

Your agent has a folder full of skills. A compression skill that promises 65% fewer
tokens. A "think-harder" skill that promises better code. You installed them because
the README had a big number. **Have you ever checked the number?**

I built a small, re-runnable harness and measured a batch of the popular skills on
real coding tasks — skill on vs. skill off, same task, same model, the correctness
checked by running the code, not by vibes. The short version: **most of them cost you
tokens and give you nothing back, and at least one quietly broke the task.**

Here's the part that matters: the harness runs on your own Claude subscription, so
you can re-run every number in this post yourself. No metered API bill to find out
your skills don't work.

## Why the headline numbers mislead

Two facts the README never mentions:

1. **A skill is a tax on every turn.** A `SKILL.md` is injected into the system prompt
   on _every_ message. So an "output compression" skill that trims the answer is also
   _adding_ tokens to the input, every turn.
2. **Output is ~1% of a real coding session.** When an agent reads files, runs tools,
   and works across turns, the tokens live in input + cache. The visible answer is a
   rounding error. So even a _perfect_ cut to the output barely touches the bill.

A "65% reduction" measured on a one-shot Q&A is not a 65% reduction on your actual
agent. Let's measure the actual agent.

## Round 1 — the compression skills

Five real coding tasks (write a slug helper, fix an off-by-one, state a Big-O, …),
each checked by running the result. Skill on vs. off.

| skill (style)           | output Δ                 | cost Δ             | broke a task?                       |
| ----------------------- | ------------------------ | ------------------ | ----------------------------------- |
| telegraphic ("caveman") | **+5%** (output went UP) | +4% (bill went UP) | no                                  |
| bullet-only             | mixed / noisy            | —                  | no                                  |
| minimal-prose           | output up                | up                 | **yes — dropped a required answer** |

The telegraphic skill — the one with the big headline — made the output _bigger_ on
agentic coding, not smaller. On the model it actually targets (a stronger one), the
debunk got _stronger_: output **+23%**, bill **+20%**, output-share **0.5%**. And the
"minimal-prose" style did cut prose — by deleting content the task required. A token
saving that drops the answer isn't a saving.

The one robust, model-agnostic number across all of them: **output is ~1% of the
session's tokens.** That's the whole story. You cannot compress your way to a cheaper
agent by trimming the 1% you can see.

> Honest caveats (in the post, not buried): these are pilot runs (small N); the
> telegraphic skill targets stronger models and a single-shot-Q&A use case, both of
> which I tested; per-task numbers are noisy, the AGGREGATE direction and the ~1%
> output-share are the robust parts.

## Round 2 — the "make it smarter" skills

The harder question: does a "plan first / handle the edge cases" skill make the agent
_better_? You can only measure that on tasks the agent gets _wrong_. So I built harder
tasks with executable checks (run the function against tricky inputs; pass only if
_all_ pass).

The surprise: **a capable model just… passed them.** Merge intervals with touching
and unsorted edges, Roman numerals with subtractive notation, a six-rule query
parser — the baseline aced all of them. There was nothing to fix.

But the skill still did something measurable: it spent **88% more output tokens** —
enumerating edge cases, narrating its plan — for **zero** change in correctness. On a
task the model already handles, a "do-more" skill is **pure overhead**. You pay for
the planning theater and get the same answer.

(The honest open question this _can't_ yet answer: do these skills help on tasks the
model genuinely fails? That needs a harder, known-difficult task set — the next round.
I'm not going to claim "planning never helps" from "planning didn't help on tasks that
didn't need it." That would be the same sin as the 65% headline.)

## The point

I'm not dunking on skill authors. The point is narrower and it's about _you_: **you
have no idea whether the things in your agent's harness work, because nobody measures
them, because measuring used to mean a metered API bill and a custom eval rig.**

That's the tool I'm building. It runs your harness — the real plugin, the real skill,
the real hooks — on your own subscription, and tells you what each piece actually does
to your agent's correctness and your bill. Measure the claim and the blast radius
instead of trusting the README.

Re-run every number here: `<repo link>`. Try it on your own skills: `npx vigiles …`.

---

## Pre-publish checklist (internal)

- [ ] Rigor pass: 5 tasks × 5 trials, sonnet, REAL `SKILL.md` (fetch, don't reconstruct).
- [ ] Decide naming: name caveman (public claim, fair to measure — the existing
      `bench/evals/caveman-claim.eval.mjs` names it) vs anonymize the others (illustrative
      reconstructions, not named tools). Don't shame volunteers; measure public claims.
- [ ] The "does it help" round needs a known-hard task source before any "planning is
      overhead" claim goes broader than "on solvable tasks."
- [ ] Tone: lead with user value, not "what works vs hype" as a banner; benchmark is the
      hook that pulls people to the tool, not the product.
