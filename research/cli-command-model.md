---
status: active
topic: cli
---

# CLI command model — verbs, read-vs-write, and non-evil adoption

The decision record for how vigiles's commands relate, why they're shaped this way,
and how `init` adopts a repo without fighting an existing harness. The PUBLIC
user-facing version is `docs/commands-and-how-they-relate.md`; this is the internal
rationale + the open design items.

## The verbs (one engine, few human verbs)

| Verb    | Kind            | What it is                                                        |
| ------- | --------------- | ---------------------------------------------------------------- |
| `audit` | **read**        | Zero-config A–F report. Safe anywhere; writes nothing, (by default) executes nothing. "Where am I?" |
| `lint`  | **read (gate)** | The same deterministic checks as a CI gate — fails the build. No model. |
| `test`  | read            | Runs hooks/skills against a scripted stand-in model (no key). "Does it behave?" |
| `eval`  | read (model)    | The one verb that calls a real model, on your Claude subscription. "Does a skill help / fire?" |
| `init`  | **write**       | Setup: scaffold specs, install the plugin (skills+hooks), wire CI, add a devDep. |

## Why `audit` and `init` do NOT merge (read ⊄ write)

The bedrock CLI convention: **a read verb never also writes.** `git diff`/`commit`,
`terraform plan`/`apply`, `npm audit`/`audit fix`. `audit` is a safe read you can run
on ANY repo — including one you don't own or a prod-wired one — precisely because it
installs nothing and mutates nothing. That safety IS the conversion pitch ("try it in
5 seconds, no commitment", Lighthouse-style). Merging setup into `audit` would make
"just grade me" start installing a plugin and editing CI — which makes people hesitate,
the opposite of the goal. So they stay separate verbs because they're separate
COMMITMENTS (look vs adopt), not redundant.

The confusion this design must actively fight is NOT "two commands exist" — it's that
the full picture (deterministic grade + the model-gated "do my skills fire?") is split
across `audit` and `init`+a skill, so the model-gated half is hidden. The fix is
**progressive disclosure**, not merging: the read command ends by suggesting the next
step (like `npm audit` → "run `npm audit fix`"). So `audit` should print a one-line
nudge — "→ to also measure whether your skills fire, run `vigiles init`" — and for
agents, ONE prompt orchestrates audit→init→measure so the user never touches the seam.

## The adoption model — gate-only first-class, `init` nudges but is NOT evil

The load-bearing finding (from a real existing-harness team, Kotlin/Markdown, rich
skills+hooks, no JS/Py linter): `audit`/`lint` are genuinely useful as an integrity
gate, but full `init` is friction — the global plugin can double-trigger their skills,
the typed-spec layer is extra maintenance, and `rules→enforced`/`eval` give them little.
They want the GATE, not the SETUP.

Resolution:

1. **Gate-only is a first-class adoption path.** `npx vigiles lint` reads
   `CLAUDE.md`/skills/agents AS-IS — no plugin, no specs, no skills installed. Just the
   `zernie/vigiles@v1` workflow + a devDep. Zero conflict. Lead existing-harness / non-JS
   teams here (an `init --ci` / "gate only" wizard choice; `docs/skills-monorepo.md` is
   the doc home).
2. **The plugin install + spec scaffold are OPT-IN, not automatic**, with an honest
   heads-up ("installs model-invocable skills that can overlap your existing triggers —
   skip if you already have a rich set").
3. **`init` NUDGES spec adoption via the ask tool — but is NOT evil.** It should
   INVITE graduating to a typed spec (the harness-structure rules a linter can't
   express) through an interactive ask, at install time AND optionally later (a gentle
   follow-up), NEVER forced. "Not evil" is a hard constraint:
   - declining is one keystroke and costs nothing (no degraded grade, no repeated
     nagging, no dark-pattern default-yes on the invasive choice);
   - the nudge explains the concrete value + the cost, and takes "no" for an answer
     (a later nudge is occasional and mutable, e.g. suppressible, not a per-run pester);
   - non-interactive / agent / CI runs never hang on it — they take the safe default
     (gate-only) and print the invitation as one line.

The principle: `init` makes the deeper adoption DISCOVERABLE and easy to say yes to,
while making the shallow gate-only path fully sufficient and never punished.

## Open items (surfaced by real-repo usage — not yet built)

- **`Tested` reads as a failure but is advisory + vigiles-native-only.** It counts
  `.eval.mjs`/`.harness.mjs`, not whether skills are tested at all — a team with its own
  eval harness gets a scary-low number for nothing. Fix: recognize a repo's own test
  signal, or make the copy unmistakable (advisory, vigiles-native, doesn't gate) and stop
  rendering it as an alarm.
- **`rules → enforced` is silent on non-JS/Py repos** ("No linters detected"), yet the
  site prominently features it + the `===`/eqeqeq case — over-promising for Kotlin/Go/etc.
  Be honest: needs a supported linter; on other stacks vigiles verifies references +
  structure, not linter-rule enforcement.
- **Non-interactive `audit` should write + print the HTML report path** (Lighthouse
  always emits the report file); the **leaderboard should surface the worst findings +
  a per-plugin report link** and say WHY it went into leaderboard mode (N plugins
  detected) — a bare all-A leaderboard with no action points reads as "found nothing".

See `research/install-enforcement-dx.md` (the rule-group enforcement model) and
`research/adoption-direction.md` (audit-first, spec-optional) for the surrounding
decisions this refines.
