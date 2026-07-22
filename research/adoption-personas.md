---
status: active
topic: positioning
---

# Adoption by team POV — the cases vigiles must support

Adoption is NOT one path. Real usage shows it branches hard by the team's stack,
whether they already have a harness, and whether they have their own test/eval loop.
This maps the cases, the recommended vigiles path for each, what works today, and the
friction to fix. Companion to `cli-command-model.md` (the verb + non-evil-nudge model)
and `adoption-direction.md` (audit-first, spec-optional).

The two axes that decide everything:

- **Stack** — does the repo have a SUPPORTED linter (ESLint / Ruff / Pylint / Clippy)?
  If not, `rules → enforced` is silent and the flagship `===`/eqeqeq case doesn't apply.
- **Existing harness** — does the repo already ship a rich set of skills/hooks (and maybe
  its own eval loop)? If yes, `init`'s plugin+spec layer is friction/conflict, and the
  value is the integrity GATE, not the setup.

## The cases

### 1. JS/TS team with ESLint (+ Prettier) — the flagship
- **Value:** the full story. `rules → enforced` lands (prose rule ↔ real linter rule,
  the `===`/eqeqeq case), plus ref verification, tool contracts, trifecta.
- **Path:** `init` full — specs + plugin + CI. Who the site markets to.
- **Today:** works. **Friction:** none major.

### 2. Python team with Ruff / Pylint
- Same as #1 (Ruff/Pylint are supported route targets). `rules → enforced` works.

### 3. Existing rich harness, NON-JS stack, own eval loop (the review team)
- **Value:** the integrity GATE only — broken refs, tool contracts, skill collisions,
  lethal-trifecta. `rules → enforced` is silent (no linter); `eval` is redundant (own loop).
- **Path:** **gate-only** — `lint` in CI via `zernie/vigiles@v1`, NO plugin, NO spec, NO
  installed skills. Zero conflict. `init --ci` / a "gate only" wizard choice.
- **Today:** `lint` works standalone. **Friction (must fix):** `init` is invasive by
  default (global plugin can double-trigger their skills; spec is extra maintenance);
  `Tested` reads as a failure though it's advisory + vigiles-native-only; `rules →
  enforced` is featured on the site but says nothing here (over-promise).

### 4. Newcomer — bare / thin CLAUDE.md, no harness yet
- **Value:** `audit` shows the gaps; nothing to conflict with, so full setup is safe.
- **Path:** `init` full — scaffold specs, install skills, wire CI. The onboarding happy path.
- **Today:** works. **Friction:** the value of specs must be sold, not assumed (the
  non-evil nudge in `cli-command-model.md`).

### 5. Plugin / skill AUTHOR (publishing to a marketplace)
- **Value:** `lint` as a PRE-PUBLISH gate (tool contracts, frontmatter, skill collisions,
  hook events, missing hook scripts); `audit` report + the leaderboard for comparison.
- **Path:** `lint` in CI + `audit` for the shareable report/grade.
- **Today:** works. **Friction:** the leaderboard needs action points + a per-plugin
  report link (a bare all-A leaderboard reads as "found nothing").

### 6. Platform / CI team — a deterministic gate across many repos
- **Value:** one gate on every PR, org-wide; sticky PR comment.
- **Path:** gate-only (`zernie/vigiles@v1`), rolled out per repo. No per-repo `init`.
- **Today:** works. **Friction:** none major; document the org-wide rollout.

### 7. Multi-harness team (Claude Code + Codex)
- **Value:** `audit`/`lint` on both; the `CLAUDE.md`⇄`AGENTS.md` mirror linted once.
- **Path:** harness-agnostic `lint`; `--harness=` or `.vigilesrc.json` when it can't autodetect.
- **Today:** compile/lint are harness-aware. **Friction:** audit is Claude-Code-focused
  for now (`audit-harness-dx.md`, deferred).

### 8. Security-conscious team
- **Value:** the lethal-trifecta detector (rare + useful — max blast-radius under
  prompt-injection) + tool-contract enforcement.
- **Path:** `audit`/`lint` + the Safety ring; the trifecta finding is the hook.
- **Today:** works. **Friction:** trifecta is a REDUCED-weight ding (official plugins ship
  the pattern) — make sure the framing is "worth reviewing", not "you failed".

## Cross-cutting gaps (block or dull adoption across several cases)

1. **`init` invasiveness / trigger-doubling** (cases 3, 6, 7) → gate-only first-class +
   plugin/spec OPT-IN + the non-evil spec nudge (`cli-command-model.md`).
2. **`Tested` reads as a failure** (case 3, any team with its own tests) → it's advisory
   and vigiles-native-only; recognize a repo's own test signal or make the copy
   unmistakable and stop rendering it as an alarm.
3. **`rules → enforced` silent on non-JS/Py** (cases 3, 7) yet featured on the site →
   be honest: needs a supported linter; else vigiles verifies references + structure.
4. **Non-interactive `audit` output** (cases 5, 6) → emit + print the HTML report path,
   and give the leaderboard action points + per-plugin links + why-leaderboard-mode.

## The throughline

The safe, universal floor is the **integrity gate** (`audit` local + `lint` in CI) — it
needs no stack, no existing-harness assumptions, no setup, and never conflicts. Everything
richer (specs, installed skills, `rules → enforced`, `eval`) is VALUE ON TOP that some
teams want and others don't — so it must be discoverable and easy to say yes to, never
forced or assumed. Sell the gate to everyone; invite the rest.
