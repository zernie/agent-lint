# Shipping plugins with vigiles

**You shipped a plugin — but do its skills fire for the people who install it?** A
description that never triggers, a hook whose `${CLAUDE_PLUGIN_ROOT}` path resolves
to nothing on someone else's machine, a subagent missing the frontmatter that
registers it — all of it looks fine in your repo and silently breaks for your
users. This guide catches it before you ship.

> The [README](../README.md) has the pitch — this is the full guide for **plugin
> and marketplace authors**: how to ship a plugin that's structurally sound and
> whose skills actually fire for the people who install it.

If you run agents on your own repo, start with the
[linting guide](verifying-instruction-files.md) instead — this page is the
plugin-author journey, end to end. Every step here is deterministic and **needs no
API key**, except the one model-gated check (step 3), which runs on your own
subscription.

## Contents

1. [Scan a draft for structural health](#1-scan-a-draft-for-structural-health)
2. [Fix what it flags](#2-fix-what-it-flags)
3. [Make your skills actually fire](#3-make-your-skills-actually-fire)
4. [Rank against the field](#4-rank-against-the-field)
5. [Test and gate it in CI](#5-test-and-gate-it-in-ci)

## 1. Scan a draft for structural health

Point `scan` at your plugin directory. It's deterministic — no model, no API key —
and reports what you ship and what's broken:

```bash
npx vigiles audit ./my-plugin
```

It surfaces the defects that quietly break a plugin for everyone who installs it,
the things a "does the JSON parse?" check sails past:

- a **hook script that resolves to nothing** — a `${CLAUDE_PLUGIN_ROOT}` typo or a
  missing file, so the hook silently never runs
- a **skill with no description** — it can never be selected by the model
- a **subagent tool contract** naming a tool that doesn't exist (a typo, or a
  never-available tool) — the call just fails at runtime
- an **MCP server that can't start** (no `command`/`url`), or a tool whose server
  isn't declared
- **two skills whose descriptions overlap** so closely the selector can't tell them
  apart — the wrong one fires

Each finding is a concrete, located defect — not a style nit. Add `--json` for a
machine-readable report to wire into your own tooling.

## 2. Fix what it flags

The output is the to-do list: resolve the broken hook paths, give every skill a
description, correct the tool-contract typos, declare your MCP servers, and
differentiate any colliding skill descriptions. Re-run `scan` until it's clean —
this is the free, fast loop you run before every release.

If your plugin ships an instruction file (`CLAUDE.md` / `AGENTS.md`), run
[`vigiles lint`](verifying-instruction-files.md) on it too, so every path, script,
and linter rule it names is real and enabled.

## 3. Make your skills actually fire

A skill only helps if its description reliably **triggers** on the prompts your
users actually type — and stays quiet on the ones it shouldn't hijack. That's
**recall** and **precision**, and a well-formed description tells you nothing about
either. This is the one model-gated step, measured on your own subscription:

```bash
# --trigger needs a prompts file: a map of skill name → realistic prompts to
# fire it (+ optional `irrelevant` prompts that should NOT, to score precision):
#   { "my-skill": { "prompts": ["how do I …", "…"], "irrelevant": ["…"] } }
npx vigiles audit ./my-plugin --trigger --prompts=prompts.json
```

For per-skill thresholds in a test, drive `measureTriggerRate` directly — it
reports recall across varied prompts and, with irrelevant prompts, precision (so a
too-broad description that hijacks unrelated work fails too). See
[measuring skills](measuring-skills.md) and the [testing API](testing-api.md).

## 4. Rank against the field

Give `scan` more than one plugin and it ranks every one by structural health — a
0–100 score and an A–F grade, worst issues first, **no key**. Two ways to do that:

```bash
# 1) Pass several plugin directories explicitly:
npx vigiles audit ./plugin-a ./plugin-b ./plugin-c

# 2) Point it at a repo that ships a marketplace.json (e.g.
#    .claude-plugin/marketplace.json) — scan expands it into its members:
npx vigiles audit ./marketplace
```

A single plain folder with no `marketplace.json` is scanned as **one** plugin (its
root), not a ranking — pass the child dirs explicitly (option 1) to rank them.

Use it to see where your plugin lands against the rest of a collection before you
publish, and to find the highest-impact fixes. The marketplace ranking is the
**structural** signal — it's deterministic and covers every member at once.

The model-gated `--trigger` column (step 3) is **per-plugin**, not a marketplace
operation: point it at an individual plugin directory, not the marketplace root.
Run it on the member dirs you care about:

```bash
npx vigiles audit ./marketplace/my-plugin --trigger --prompts=prompts.json
```

## 5. Test and gate it in CI

Ship the checks, don't just run them once. A `*.harness.mjs` (or `.ts`) test pins a
hook's block/allow decision and a skill's trigger behaviour so a regression fails
the build:

```bash
npx vigiles test    # the deterministic tiers — free, no key, every commit
npx vigiles eval    # the real-model tiers — on your own subscription
```

Wire `scan` and `test` into CI via the
[GitHub Action](github-action.md). The deterministic tiers run on every commit for
free; the real-model evals stay on a dev's subscription, not a metered CI token.

If your plugin ships **safety hooks**, author them as compiled hooks so they can't
silently fail open — see [compiled hooks](compiled-hooks.md).

## See also

- [Verifying instruction files](verifying-instruction-files.md) — lint a `CLAUDE.md` / `AGENTS.md`.
- [Harness testing](harness-testing.md) · [Measuring skills](measuring-skills.md) — the test and eval tiers in depth.
- [Compiled hooks](compiled-hooks.md) — safety hooks that can't fail open.
- [CLI reference](cli.md) · [Skills](skills.md) · [Harnesses](harnesses.md) (Claude Code + Codex).
