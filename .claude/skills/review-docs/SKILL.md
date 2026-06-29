---
name: review-docs
description: Review the README or a documentation page from several real reader points of view at once. Fans out one parallel reviewer per audience — Claude Code newcomer, power user, plugin/skill author, skeptical senior engineer, non-running decision-maker — each scoring it x/5 and naming concrete, line-level fixes. Use when asked to review, critique, grade, or "get to N/5" the README or any front-door doc, or to check how a doc reads for real users. Not for code review (use /code-review for that).
---

Review a front-door doc (default `README.md`; honor a path the user names) the way
real readers would — not the way the author does. The author knows what every line
means; a first-time reader does not. The job is to surface where a specific audience
gets confused, under-served, or bounces, score it, and propose concrete fixes.

The method is **fan-out**: spawn one subagent PER PERSONA, all in parallel, each doing
a cold read as that reader. Different readers catch different things; running them
concurrently is faster and keeps each read uncontaminated by the others.

## How to run it

### 1. Read the target doc yourself first

Read the doc in full and skim the docs it links to (so "promises depth the linked doc
doesn't deliver" is checkable). You need this to judge the personas' findings and to
apply fixes later.

### 2. Fan out one subagent per persona — in parallel

Spawn the personas below as subagents **in a single message** (multiple Agent/Task
calls at once) so they run concurrently. Use a fast, cheap model (Sonnet or Haiku) —
this is a reading/judgment task, not heavy synthesis — and say so in one line when you
launch them.

Give EACH subagent the same rubric, only the persona changes:

> You are **\<PERSONA\>**. Read `<path>` (ignore any HTML comment block at the top —
> that's internal authoring notes, not user-facing copy). Do a COLD read as this
> reader: adopt their goals, vocabulary, and patience. Be a harsh grader — most
> READMEs are a 3; 5/5 means you'd genuinely act on it and it's crisp end to end.
> Return ONLY:
>
> 1. **SCORE: x/5**
> 2. **30-second test:** after the first screen only, in one sentence, what do you
>    think this tool does — and is that right/wrong/fuzzy?
> 3. **Top 3 concrete problems** — each quotes the exact line/phrase and gives a
>    specific suggested rewrite (confusing jargon, sentences carrying too many ideas,
>    anything that doesn't sell, formatting that hurts scanning, hype that costs
>    trust).
> 4. **Jargon check:** every word you had to stop on (harness, spec, eval, subagent,
>    rings, recall/precision…) — is it defined in context or left guessing?
> 5. **What works** — keep these, so revisions don't lose them.
> 6. **The one change** that would move the score most.
>    Quote exact text. Be useful, not polite.

### 3. The personas (the fan-out set)

Run all of these unless the user scopes to a subset. Edit the set freely for a given
doc — these are the default readers of vigiles's front door.

1. **Claude Code newcomer** — new to agentic tooling, bounces on undefined terms.
   Needs a clear "what do I do first," not theory. Catches jargon used before it's
   defined.
2. **Claude Code power user** — lives in CC, skimming on a phone between tasks. Wants
   the WOW in the first screen and a copy-paste install in seconds; allergic to fluff.
3. **Plugin / skill author** — mid-level dev, comfortable with TS but not a
   compiler/types nerd. Found this because it claims to test their skills. Cares about
   "does it work on MY repo without learning a new theory?"
4. **Skeptical senior / staff engineer** — scans for substance in ~20s, mentally
   compares to promptfoo / ESLint / ast-grep. Anything hand-wavy or overclaimed costs
   trust; every load-bearing claim should link proof.
5. **Decision-maker (won't run a command)** — deciding whether the team adopts. Cares
   about cost, risk, effort; needs the "free deterministic vs. metered per-token"
   story and the low-risk incremental on-ramp to be legible without running anything.
6. **Codex user (optional)** — uses `AGENTS.md`, not Claude Code. Skeptical this is "a
   Claude-only thing." Is Codex support visible early or buried/footnoted?

### 4. Synthesize

Collect the scores and reports. Then:

- **Cross-cutting issues first.** The 2–4 problems that hurt MULTIPLE personas are the
  highest-leverage fixes — lead with those.
- **Lowest score is the ceiling.** The doc is only as good as its weakest reader's
  read; name what's blocking that persona.
- Produce a **ranked fix list** — highest reader-impact first, each a one-line action
  quoting the line and the fix.

### 5. Iterate to a target (only when asked)

If the user asks to "get it to N/5" (or "until 5/5"): apply the highest-leverage fixes
yourself, then **re-fan-out** (resume the same subagents with the change list, or spawn
fresh) and collect new scores. Repeat until every persona is at the target or scores
stop moving. **Bound it** — if a round produces no improvement, or after ~3 rounds, stop
and report what's blocking the last point rather than churning. By default this skill
REPORTS; only enter the apply-and-iterate loop on an explicit "fix it / get it to N/5".

## Output format

```
# Doc review — <file>

## Scores
<persona> — x/5   (one-line verdict each)

## Cross-cutting issues (highest leverage)
The 2–4 problems hitting multiple personas, each with the line + the fix.

## Per-persona highlights
The sharpest single finding from each reader (don't dump the full reports).

## Ranked fixes
Ordered, highest reader-impact first — each a one-line action.
```

Keep the synthesis scannable and ACTIONABLE: every finding names a line and a fix. Hold
the doc to its own standards while reviewing — for the README that's the front-door
brevity bar (lead with benefits, one idea per sentence, define jargon at first use,
push depth into linked docs). Don't rewrite the doc in place unless the user asks for
the iterate loop — this skill REPORTS by default.
