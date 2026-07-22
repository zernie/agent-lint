# Commands & how they relate

The README has the pitch; this is the map of vigiles's commands — what each one is
for, and how they fit together. If you've ever wondered _"why does measuring my
skills use `init`, not `audit`?"_, this is the doc.

## The one-line model

> **`audit` = check now · `lint` = gate in CI · `test` / `eval` = prove it
> repeatably · `init` = the bridge that sets the rest up.**

| Command     | What it is                                                                                   | Needs a model?                                                                                             | When you run it               |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **`audit`** | Read & grade your harness, zero-config. "Where am I?" A local report, like Lighthouse.       | No for the report; the two executing checks (live MCP, skill-firing) run **only with your interactive OK** | Anytime — it's the front door |
| **`lint`**  | The **CI gate** — the same deterministic checks, but they **fail the build**.                | No                                                                                                         | Every push (CI)               |
| **`test`**  | Run your real hooks/skills against a **scripted stand-in** model — does the harness behave?  | No                                                                                                         | Every commit                  |
| **`eval`**  | Drive a **real model** — does a skill actually fire / help? `measureTriggerRate` lives here. | Yes — on **your** subscription                                                                             | On demand / release gate      |
| **`init`**  | **Graduate**: scaffold specs, install the plugin (skills + hooks), wire CI.                  | No                                                                                                         | Once, to set up               |

`audit` and `lint` share one engine — `audit` is the local report, `lint` is the
CI gate on the same findings. `test` and `eval` are the two testing tiers (cheap
deterministic → real-model).

## Why measuring "do my skills fire?" uses `init`, not `audit`

This is the one that trips people up. Both `audit` and `eval` can answer _"do my
skills actually fire?"_ — but at different commitment levels, and with a hard rule
about **who's allowed to spend model quota**:

- **You, at a terminal:** `npx vigiles audit` will **offer** to measure it right
  there (it spends model quota, so it asks once and remembers your answer). No
  `init` needed — just say yes.
- **An agent** (pasting a prompt into Claude Code), **CI, or `--json`:** `audit`
  deliberately **stays a read-only report** — it never spends quota without a human
  to consent, so it won't run the measurement. To measure it from an agent, you use
  the explicit test tier — `measureTriggerRate`, which the **`test-harness` skill**
  wraps. That skill is installed by **`init`**.

So a prompt that says _"run `npx vigiles init`, then use the test-harness skill to
measure trigger-rate"_ isn't confused — it's the **agent-runnable** path, because an
agent can't trigger `audit`'s interactive measurement. `init` there is just the
**setup step** (install the skill), not the measurement.

The same recall/precision numbers, two ways in:

- **`audit` (interactive):** one-shot curiosity check — _"what's my score, including
  whether skills fire?"_
- **`eval` / `test-harness` (repeatable):** author it once, re-run it, gate CI — the
  version an agent or a pipeline can drive. `init` installs it.

## `audit` vs `lint` — one engine, two doors

- **`audit`** is the **local report** (safe to run anywhere; a deterministic read).
  It is **not** a CI step.
- **`lint`** is the **CI gate** — it fails the build on the same deterministic checks
  (broken references, tool contracts, dead hooks, skill collisions).

Use `audit` to see where you are; wire `lint` into CI to keep it from regressing.

## See also

- [CLI reference](cli.md) — every verb and flag.
- [The validation rules](verifying-instruction-files.md#the-validation-rules--the-full-matrix) — what `lint` / `audit` check.
- [Harness testing](harness-testing.md) — the `test` / `eval` tiers in depth.
- [Measuring skills](measuring-skills.md) — `measureTriggerRate`, recall + precision.
- [Agent setup](agent-setup.md) — what `init` does, per agent.
